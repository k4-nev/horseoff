"""
Servers module API for Horseoff v2.156.
Handles server CRUD, metrics collection via SSH, RuVDS API integration, provisioning.
"""

import json, time, threading, socket, subprocess, os
import urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone, timedelta

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

SERVERS_FILE = DATA_DIR / "servers.json"
API_KEYS_FILE = DATA_DIR / "api_keys.json"
RUVDS_CACHE_FILE = DATA_DIR / "ruvds_cache.json"

POLL_INTERVAL = 25
SPEED_TEST_INTERVAL = 300
SSH_KEY_PATH = os.path.expanduser("~/.ssh/id_ed25519")
if not os.path.exists(SSH_KEY_PATH):
    SSH_KEY_PATH = os.path.expanduser("~/.ssh/id_rsa")

SSH_PUBKEY_PATH = SSH_KEY_PATH + ".pub"

# ---- Data storage ----
servers_lock = threading.Lock()
cached_data = []
data_lock = threading.Lock()
speed_cache = {}
speed_lock = threading.Lock()
ruvds_cache = {}
ruvds_lock = threading.Lock()

# ---- Provision state ----
provision_status = {}  # ip -> {steps:[], current_step:int, done:bool, error:str|None, result:{}}
provision_lock = threading.Lock()

def _load_json(path, default=None):
    if path.exists():
        try:
            with open(path) as f: return json.load(f)
        except: pass
    return default if default is not None else []

def _save_json(path, data):
    with open(path, 'w') as f: json.dump(data, f, indent=2, ensure_ascii=False)

def load_servers(): return _load_json(SERVERS_FILE, [])
def save_servers(s): _save_json(SERVERS_FILE, s)
def load_api_keys(): return _load_json(API_KEYS_FILE, {})
def save_api_keys(k): _save_json(API_KEYS_FILE, k)

# ---- RuVDS ----
def _ruvds_get(url, token):
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except: return None

def refresh_ruvds():
    global ruvds_cache
    token = load_api_keys().get('ruvds', '')
    if not token: return False
    print("[RUVDS] Fetching...")
    data = _ruvds_get("https://api.ruvds.com/v2/servers?per_page=100&page=1&sort=virtual_server_id&order=asc&get_paid_till=true&get_network=true", token)
    if not data: return False
    new_cache = {}
    for s in data.get('servers', []):
        ips = s.get('network_v4', [])
        if not ips: continue
        ip = ips[0].get('ip_address', '')
        if not ip: continue
        pt = s.get('paid_till', '')
        pt_date, dl = '', None
        if pt:
            try:
                dt = datetime.fromisoformat(pt.replace('Z', '+00:00'))
                pt_date = dt.strftime('%d.%m.%Y')
                dl = max(0, (dt - datetime.now(timezone.utc)).days)
            except: pt_date = pt[:10]
        cost = None
        vid = s.get('virtual_server_id')
        if vid:
            cd = _ruvds_get(f"https://api.ruvds.com/v2/servers/{vid}/cost", token)
            if cd and 'cost_rub' in cd: cost = int(cd['cost_rub'])
        new_cache[ip] = {'virtual_server_id': vid, 'cpu': s.get('cpu'), 'ram': s.get('ram'),
            'drive': s.get('drive'), 'paid_till': pt_date, 'days_left': dl, 'cost_rub': cost,
            'fetched_at': time.strftime('%Y-%m-%d %H:%M:%S')}
    with ruvds_lock: ruvds_cache = new_cache
    _save_json(RUVDS_CACHE_FILE, new_cache)
    print(f"[RUVDS] Cached {len(new_cache)} servers")
    return True

# ---- SSH Metrics ----
def _check_port(ip, port, timeout=3):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.settimeout(timeout)
        r = s.connect_ex((ip, port)); s.close(); return r == 0
    except: return False

def _ssh(server, cmd, timeout=10):
    try:
        c = ["ssh","-o","StrictHostKeyChecking=no","-o","ConnectTimeout=5","-o","BatchMode=yes",
             "-p",str(server.get('ssh_port',22)),"-i",SSH_KEY_PATH,
             f"{server.get('ssh_user','root')}@{server['ip']}",cmd]
        p = subprocess.run(c, capture_output=True, text=True, timeout=timeout)
        return p.stdout.strip() if p.returncode == 0 else None
    except: return None

def get_metrics(server, do_speed=False):
    role = server.get('role', '')
    is_proxy = role == 'proxy'
    is_host = role == 'host'
    is_client = role == 'client'

    r = {'name':server['name'],'ip':server['ip'],
         'http_port':server.get('http_port', 0),
         'socks_port':server.get('socks_port', 0),
         'role':role,
         'vds_provider':server.get('vds_provider',''),'online':False,'cpu':None,
         'ram_used':None,'ram_total':None,'disk_used':None,'disk_total':None,
         'uptime':None,'http_proxy':False,
         'socks_proxy':False,'proxy_running':False,'speed_mbps':None,'vds_info':None,'days_left':None}

    # Only check proxy ports for proxy role
    if is_proxy:
        r['http_proxy'] = _check_port(server['ip'], server.get('http_port', 0))
        r['socks_proxy'] = _check_port(server['ip'], server.get('socks_port', 0))

    # Host: collect metrics locally (no SSH)
    if is_host:
        try:
            p = subprocess.run("echo CPU:$(top -bn1|grep 'Cpu(s)'|awk '{print 100-$8}');"
                "echo RAM_USED:$(free -m|awk '/Mem:/{print $3}');"
                "echo RAM_TOTAL:$(free -m|awk '/Mem:/{print $2}');"
                "echo DISK_USED:$(df -BG /|tail -1|awk '{print int($3)}');"
                "echo DISK_TOTAL:$(df -BG /|tail -1|awk '{print int($2)}');"
                "echo UPTIME:$(uptime -p|sed 's/up //')",
                shell=True, capture_output=True, text=True, timeout=10)
            out = p.stdout.strip()
        except: out = None
    else:
        # Remote: SSH
        ssh_cmd = "echo CPU:$(top -bn1|grep 'Cpu(s)'|awk '{print 100-$8}');" \
            "echo RAM_USED:$(free -m|awk '/Mem:/{print $3}');" \
            "echo RAM_TOTAL:$(free -m|awk '/Mem:/{print $2}');" \
            "echo DISK_USED:$(df -BG /|tail -1|awk '{print int($3)}');" \
            "echo DISK_TOTAL:$(df -BG /|tail -1|awk '{print int($2)}');" \
            "echo UPTIME:$(uptime -p|sed 's/up //');"
        if is_proxy:
            ssh_cmd += "echo PROXY_RUN:$(pgrep -x 3proxy>/dev/null 2>&1&&echo yes||echo no)"
        out = _ssh(server, ssh_cmd)

    if out:
        r['online'] = True
        for line in out.split('\n'):
            k, _, v = line.partition(':')
            if k == 'CPU':
                try: r['cpu'] = round(float(v))
                except: pass
            elif k == 'RAM_USED':
                try: r['ram_used'] = int(v)
                except: pass
            elif k == 'RAM_TOTAL':
                try: r['ram_total'] = int(v)
                except: pass
            elif k == 'DISK_USED':
                try: r['disk_used'] = int(v)
                except: pass
            elif k == 'DISK_TOTAL':
                try: r['disk_total'] = int(v)
                except: pass
            elif k == 'UPTIME': r['uptime'] = v.strip()
            elif k == 'PROXY_RUN': r['proxy_running'] = v.strip() == 'yes'
    ip = server['ip']
    if do_speed and r['online']:
        if is_host:
            # Local speed test for host
            try:
                p = subprocess.run("curl -so /dev/null -w '%{speed_download}' --connect-timeout 5 --max-time 10 http://speedtest.selectel.ru/10MB 2>/dev/null",
                    shell=True, capture_output=True, text=True, timeout=15)
                so = p.stdout.strip()
            except: so = None
        else:
            so = _ssh(server, "curl -so /dev/null -w '%{speed_download}' --connect-timeout 5 --max-time 10 http://speedtest.selectel.ru/10MB 2>/dev/null", 15)
        if so:
            try:
                bps = float(so.replace("'","").strip())
                mbps = round(bps * 8 / 1_000_000, 1)
                with speed_lock: speed_cache[ip] = mbps
                r['speed_mbps'] = mbps
            except: pass
    if r['speed_mbps'] is None:
        with speed_lock: r['speed_mbps'] = speed_cache.get(ip)
    if role in ('proxy', 'client') and server.get('vds_provider'):
        with ruvds_lock: vds = ruvds_cache.get(ip)
        if vds: r['vds_info'] = vds; r['days_left'] = vds.get('days_left')
    return r

def poll_loop():
    global cached_data
    count = 0
    while True:
        with servers_lock: servers = load_servers()
        count += 1
        # Get poll interval from global settings
        try:
            from server import get_poll_interval
            interval = get_poll_interval()
        except:
            interval = 30
        do_speed = (count % max(1, SPEED_TEST_INTERVAL // max(interval, 15))) == 1
        if servers:
            results = []
            for s in servers:
                m = get_metrics(s, do_speed)
                results.append(m)
            with data_lock: cached_data = results
            # Push to all WS clients
            try:
                from server import ws_push_servers
                ws_push_servers(results)
            except: pass
        else:
            with data_lock: cached_data = []
        time.sleep(interval)

def daily_ruvds():
    while True:
        now = datetime.now()
        target = now.replace(hour=4, minute=0, second=0, microsecond=0)
        if now >= target: target += timedelta(days=1)
        time.sleep((target - now).total_seconds())
        refresh_ruvds()

# ---- SSH with password (for initial setup) ----
def _ssh_pass(ip, port, user, password, cmd, timeout=120):
    """SSH using sshpass for password auth."""
    try:
        c = ["sshpass", "-p", password, "ssh",
             "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10",
             "-p", str(port), f"{user}@{ip}", cmd]
        p = subprocess.run(c, capture_output=True, text=True, timeout=timeout)
        return p.returncode == 0, p.stdout.strip(), p.stderr.strip()
    except subprocess.TimeoutExpired:
        return False, "", "Timeout"
    except Exception as e:
        return False, "", str(e)

def _ssh_copy_key(ip, port, user, password):
    """Copy SSH public key to remote server."""
    try:
        pubkey = open(SSH_PUBKEY_PATH).read().strip()
    except:
        return False, "SSH public key not found"
    cmd = f'mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo "{pubkey}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && sort -u -o ~/.ssh/authorized_keys ~/.ssh/authorized_keys'
    ok, out, err = _ssh_pass(ip, port, user, password, cmd)
    return ok, err if not ok else "OK"

# ---- Provision (full 3proxy setup) ----
DNS_OPTIONS = {
    'google': ('8.8.8.8', '8.8.4.4'),
    'yandex': ('77.88.8.8', '77.88.8.1'),
}

def _prov_update(ip, step_idx=None, step_status=None, done=False, error=None, result=None):
    with provision_lock:
        s = provision_status.get(ip, {})
        if step_idx is not None and step_status:
            if 'steps' in s and step_idx < len(s['steps']):
                s['steps'][step_idx]['status'] = step_status
        if done: s['done'] = True
        if error: s['error'] = error
        if result: s['result'] = result
        provision_status[ip] = s

def provision_server(ip, port, user, password, http_port, socks_port, proxy_user, proxy_pass, dns, name, role, vds_provider):
    """Full provisioning: SSH key + 3proxy install + firewall."""
    steps = [
        {'name': 'Подключение по SSH', 'status': 'pending'},
        {'name': 'Копирование SSH-ключа', 'status': 'pending'},
        {'name': 'Обновление системы', 'status': 'pending'},
        {'name': 'Установка зависимостей', 'status': 'pending'},
        {'name': 'Скачивание 3proxy', 'status': 'pending'},
        {'name': 'Сборка 3proxy', 'status': 'pending'},
        {'name': 'Установка бинарника', 'status': 'pending'},
        {'name': 'Создание конфигурации', 'status': 'pending'},
        {'name': 'Настройка systemd', 'status': 'pending'},
        {'name': 'Запуск 3proxy', 'status': 'pending'},
        {'name': 'Настройка UFW', 'status': 'pending'},
        {'name': 'Установка fail2ban', 'status': 'pending'},
        {'name': 'Проверка', 'status': 'pending'},
    ]
    with provision_lock:
        provision_status[ip] = {'steps': steps, 'done': False, 'error': None, 'result': {}}

    dns1, dns2 = DNS_OPTIONS.get(dns, DNS_OPTIONS['google'])

    def run_step(idx, cmd, timeout=120):
        _prov_update(ip, idx, 'running')
        ok, out, err = _ssh_pass(ip, port, user, password, cmd, timeout)
        if not ok:
            _prov_update(ip, idx, 'error', done=True, error=err or 'Failed')
            return False
        _prov_update(ip, idx, 'done')
        return True

    # Step 0: Test connection
    _prov_update(ip, 0, 'running')
    ok, out, err = _ssh_pass(ip, port, user, password, 'echo ok', 15)
    if not ok:
        _prov_update(ip, 0, 'error', done=True, error='Не удалось подключиться: ' + err)
        return
    _prov_update(ip, 0, 'done')

    # Step 1: Copy SSH key
    _prov_update(ip, 1, 'running')
    ok, msg = _ssh_copy_key(ip, port, user, password)
    if not ok:
        _prov_update(ip, 1, 'error', done=True, error='SSH-ключ: ' + msg)
        return
    _prov_update(ip, 1, 'done')

    # Step 2: Update system
    if not run_step(2, 'export DEBIAN_FRONTEND=noninteractive && apt update && apt -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade', 300): return

    # Step 3: Install deps
    if not run_step(3, 'export DEBIAN_FRONTEND=noninteractive && apt install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" build-essential curl wget ufw sshpass fail2ban', 120): return

    # Step 4: Download 3proxy
    if not run_step(4, 'cd /tmp && wget -q https://github.com/3proxy/3proxy/archive/refs/tags/0.9.4.tar.gz && tar xzf 0.9.4.tar.gz', 60): return

    # Step 5: Build
    if not run_step(5, 'cd /tmp/3proxy-0.9.4 && make -f Makefile.Linux', 60): return

    # Step 6: Install binary
    if not run_step(6, 'mkdir -p /usr/local/bin && cp /tmp/3proxy-0.9.4/bin/3proxy /usr/local/bin/ && chmod +x /usr/local/bin/3proxy', 15): return

    # Step 7: Config
    cfg = f"""daemon
pidfile /var/run/3proxy.pid

nscache 65536
nserver {dns1}
nserver {dns2}

log /var/log/3proxy/3proxy.log D
logformat "- +_L%t.%. %N.%p %E %U %C:%c %R:%r %O %I %h %T"
rotate 30

auth strong
users {proxy_user}:CL:{proxy_pass}

allow {proxy_user}
proxy -p{http_port} -n

allow {proxy_user}
socks -p{socks_port} -n
"""
    cfg_escaped = cfg.replace('"', '\\"').replace('$', '\\$')
    _prov_update(ip, 7, 'running')
    ok, _, err = _ssh_pass(ip, port, user, password, f'mkdir -p /etc/3proxy /var/log/3proxy && echo "{cfg_escaped}" > /etc/3proxy/3proxy.cfg', 15)
    if not ok:
        _prov_update(ip, 7, 'error', done=True, error=err); return
    _prov_update(ip, 7, 'done')

    # Step 8: Systemd service
    svc = """[Unit]
Description=3proxy Proxy Server
After=network.target

[Service]
Type=forking
PIDFile=/var/run/3proxy.pid
ExecStart=/usr/local/bin/3proxy /etc/3proxy/3proxy.cfg
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target"""
    svc_escaped = svc.replace('"', '\\"').replace('$', '\\$')
    _prov_update(ip, 8, 'running')
    ok, _, err = _ssh_pass(ip, port, user, password, f'echo "{svc_escaped}" > /etc/systemd/system/3proxy.service', 15)
    if not ok:
        _prov_update(ip, 8, 'error', done=True, error=err); return
    _prov_update(ip, 8, 'done')

    # Step 9: Start 3proxy
    if not run_step(9, 'systemctl daemon-reload && systemctl enable 3proxy && systemctl start 3proxy', 30): return

    # Step 10: UFW
    ssh_port_str = str(port)
    if not run_step(10, f'ufw default deny incoming && ufw default allow outgoing && ufw allow {ssh_port_str}/tcp && ufw allow {http_port}/tcp && ufw allow {socks_port}/tcp && ufw --force enable', 30): return

    # Step 11: fail2ban
    if not run_step(11, 'export DEBIAN_FRONTEND=noninteractive && systemctl enable fail2ban && systemctl start fail2ban', 15): return

    # Step 12: Verify
    _prov_update(ip, 12, 'running')
    ok, out, err = _ssh_pass(ip, port, user, password, f'systemctl is-active 3proxy && ss -tlnp | grep -E "{http_port}|{socks_port}"', 15)
    if not ok or 'active' not in out:
        _prov_update(ip, 12, 'error', done=True, error='3proxy не запустился: ' + (err or out or 'unknown'))
        return
    _prov_update(ip, 12, 'done')

    # Get external IP
    ok2, ext_ip, _ = _ssh_pass(ip, port, user, password, 'curl -s ifconfig.me', 15)
    if not ok2 or not ext_ip: ext_ip = ip

    # Save server to list
    srv = {'name': name, 'ip': ip, 'ssh_port': int(port), 'ssh_user': user,
           'http_port': int(http_port), 'socks_port': int(socks_port),
           'role': role or 'proxy', 'vds_provider': vds_provider or ''}
    with servers_lock:
        sl = load_servers()
        if not any(s['ip'] == ip for s in sl):
            sl.append(srv)
            save_servers(sl)

    result = {
        'ip': ext_ip,
        'http_port': http_port,
        'socks_port': socks_port,
        'proxy_user': proxy_user,
        'proxy_pass': proxy_pass,
        'http_proxy': f"{ext_ip}:{http_port}:{proxy_user}:{proxy_pass}",
        'socks_proxy': f"{ext_ip}:{socks_port}:{proxy_user}:{proxy_pass}",
    }
    _prov_update(ip, done=True, result=result)
    print(f"  [PROVISION] {ip} — Done!")

def provision_add_only(ip, port, user, password, name, http_port, socks_port, role, vds_provider):
    """Add server with SSH key copy only (server already configured)."""
    steps = [
        {'name': 'Подключение по SSH', 'status': 'pending'},
        {'name': 'Копирование SSH-ключа', 'status': 'pending'},
        {'name': 'Проверка подключения', 'status': 'pending'},
    ]
    with provision_lock:
        provision_status[ip] = {'steps': steps, 'done': False, 'error': None, 'result': {}}

    # Step 0: Test
    _prov_update(ip, 0, 'running')
    ok, out, err = _ssh_pass(ip, port, user, password, 'echo ok', 15)
    if not ok:
        _prov_update(ip, 0, 'error', done=True, error='Не удалось подключиться: ' + err); return
    _prov_update(ip, 0, 'done')

    # Step 1: Copy SSH key
    _prov_update(ip, 1, 'running')
    ok, msg = _ssh_copy_key(ip, port, user, password)
    if not ok:
        _prov_update(ip, 1, 'error', done=True, error='SSH-ключ: ' + msg); return
    _prov_update(ip, 1, 'done')

    # Step 2: Verify key auth works
    _prov_update(ip, 2, 'running')
    ok_key = _ssh({'ip': ip, 'ssh_port': port, 'ssh_user': user}, 'echo ok', 10)
    if not ok_key:
        _prov_update(ip, 2, 'error', done=True, error='Ключ скопирован, но подключение по ключу не работает'); return
    _prov_update(ip, 2, 'done')

    # Save server
    srv = {'name': name, 'ip': ip, 'ssh_port': int(port), 'ssh_user': user,
           'http_port': int(http_port), 'socks_port': int(socks_port),
           'role': role or '', 'vds_provider': vds_provider or ''}
    with servers_lock:
        sl = load_servers()
        if not any(s['ip'] == ip for s in sl):
            sl.append(srv)
            save_servers(sl)

    _prov_update(ip, done=True, result={'ip': ip})
    print(f"  [ADD] {ip} — Done!")

# ---- API Route Handlers ----
def _h_json(handler, code, data):
    handler.send_response(code)
    handler.send_header('Content-Type','application/json')
    handler.end_headers()
    handler.wfile.write(json.dumps(data, ensure_ascii=False).encode())

def handle_get(handler, session, path):
    if path == '/api/mod/servers/status':
        with data_lock: return _h_json(handler, 200, cached_data)
    if path == '/api/mod/servers/list':
        with servers_lock: return _h_json(handler, 200, load_servers())
    if path == '/api/mod/servers/apikeys':
        keys = load_api_keys()
        masked = {}
        for k, v in keys.items():
            if v and len(v) > 8: masked[k] = v[:4] + '\u2022'*min(len(v)-8,20) + v[-4:]
            elif v: masked[k] = '\u2022'*len(v)
            else: masked[k] = ''
        return _h_json(handler, 200, {'keys': masked, 'has_key': {k: bool(v) for k,v in keys.items()}})
    # Provision status polling
    if path.startswith('/api/mod/servers/provision/'):
        ip = path.split('/api/mod/servers/provision/')[1]
        with provision_lock:
            st = provision_status.get(ip)
        if not st: return _h_json(handler, 404, {'error': 'Not found'})
        return _h_json(handler, 200, st)

def handle_post(handler, session, path, data):
    if path == '/api/mod/servers/add':
        if session['role'] in ('common','uncommon','rare','mythical','legendary'): return _h_json(handler, 403, {'error':'Нет доступа'})
        for f in ('name','ip'):
            if not data.get(f): return _h_json(handler, 400, {'error':f'Поле {f} обязательно'})
        srv = {'name':data['name'],'ip':data['ip'],'ssh_port':int(data.get('ssh_port',22)),
            'ssh_user':data.get('ssh_user','root'),'http_port':int(data.get('http_port',10281)),
            'socks_port':int(data.get('socks_port',10842)),'role':data.get('role',''),'vds_provider':data.get('vds_provider','')}
        # If SSH password provided — do SSH key copy
        ssh_pass = data.get('ssh_password', '')
        if ssh_pass:
            with servers_lock:
                sl = load_servers()
                if any(s['ip']==srv['ip'] for s in sl): return _h_json(handler, 400, {'error':'IP уже существует'})
            threading.Thread(target=provision_add_only, args=(
                srv['ip'], srv['ssh_port'], srv['ssh_user'], ssh_pass,
                srv['name'], srv['http_port'], srv['socks_port'],
                srv['role'], srv['vds_provider']
            ), daemon=True).start()
            return _h_json(handler, 200, {'status':'provisioning', 'ip': srv['ip']})
        else:
            with servers_lock:
                sl = load_servers()
                if any(s['ip']==srv['ip'] for s in sl): return _h_json(handler, 400, {'error':'IP уже существует'})
                sl.append(srv); save_servers(sl)
            if srv.get('role')=='client' and srv.get('vds_provider'):
                threading.Thread(target=refresh_ruvds, daemon=True).start()
            return _h_json(handler, 201, {'status':'ok'})

    # Create server (full provision)
    if path == '/api/mod/servers/create':
        if session['role'] in ('common','uncommon','rare','mythical','legendary'): return _h_json(handler, 403, {'error':'Нет доступа'})
        required = ('name', 'ip', 'ssh_password', 'proxy_user', 'proxy_pass')
        for f in required:
            if not data.get(f): return _h_json(handler, 400, {'error': f'Поле {f} обязательно'})
        ip = data['ip']
        with servers_lock:
            sl = load_servers()
            if any(s['ip'] == ip for s in sl): return _h_json(handler, 400, {'error': 'IP уже существует'})
        threading.Thread(target=provision_server, args=(
            ip,
            int(data.get('ssh_port', 22)),
            data.get('ssh_user', 'root'),
            data['ssh_password'],
            int(data.get('http_port', 10281)),
            int(data.get('socks_port', 10842)),
            data['proxy_user'],
            data['proxy_pass'],
            data.get('dns', 'google'),
            data['name'],
            data.get('role', 'client'),
            data.get('vds_provider', ''),
        ), daemon=True).start()
        return _h_json(handler, 200, {'status': 'provisioning', 'ip': ip})

    if path == '/api/mod/servers/apikeys':
        if session['role'] not in ('arcana','immortal'): return _h_json(handler, 403, {'error':'Нет доступа'})
        prov, key = data.get('provider',''), data.get('key','')
        keys = load_api_keys(); keys[prov] = key; save_api_keys(keys)
        if key: threading.Thread(target=refresh_ruvds, daemon=True).start()
        return _h_json(handler, 200, {'status':'ok'})
    if path == '/api/mod/servers/ruvds-refresh':
        threading.Thread(target=refresh_ruvds, daemon=True).start()
        return _h_json(handler, 200, {'status':'ok'})

def handle_put(handler, session, path, data):
    if session['role'] in ('common','uncommon','rare','mythical','legendary'): return _h_json(handler, 403, {'error':'Нет доступа'})
    if path.startswith('/api/mod/servers/update/'):
        oip = path.split('/api/mod/servers/update/')[1]
        with servers_lock:
            sl = load_servers()
            idx = next((i for i,s in enumerate(sl) if s['ip']==oip), None)
            if idx is None: return _h_json(handler, 404, {'error':'Не найден'})
            nip = data.get('ip', oip)
            if nip != oip and any(s['ip']==nip for i,s in enumerate(sl) if i!=idx):
                return _h_json(handler, 400, {'error':'IP уже существует'})
            sl[idx] = {**sl[idx], **{k:v for k,v in data.items() if v is not None}}
            for k in ('ssh_port','http_port','socks_port'):
                if k in sl[idx]: sl[idx][k] = int(sl[idx][k])
            save_servers(sl)
        return _h_json(handler, 200, {'status':'ok'})

def handle_delete(handler, session, path):
    if session['role'] in ('common','uncommon','rare','mythical','legendary'): return _h_json(handler, 403, {'error':'Нет доступа'})
    if path.startswith('/api/mod/servers/delete/'):
        ip = path.split('/api/mod/servers/delete/')[1]
        with servers_lock:
            sl = load_servers()
            new = [s for s in sl if s['ip'] != ip]
            if len(new) == len(sl): return _h_json(handler, 404, {'error':'Не найден'})
            save_servers(new)
        return _h_json(handler, 200, {'status':'ok'})

def _get_host_ip():
    """Get this server's external IP."""
    try:
        r = urllib.request.urlopen('http://ifconfig.me', timeout=10)
        return r.read().decode().strip()
    except:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except: return '127.0.0.1'

def _ensure_host_server():
    """Auto-add this server as host if not present."""
    host_ip = _get_host_ip()
    with servers_lock:
        sl = load_servers()
        # Check if any host role exists
        if any(s.get('role') == 'host' for s in sl):
            return
        sl.insert(0, {
            'name': 'Horseoff', 'ip': host_ip,
            'ssh_port': 22, 'ssh_user': 'root',
            'http_port': 0, 'socks_port': 0,
            'role': 'host', 'vds_provider': ''
        })
        save_servers(sl)
        print(f"  [servers] Host server auto-added: {host_ip}")

def init():
    global cached_data, ruvds_cache
    # Auto-add host server
    _ensure_host_server()
    # Pre-populate cached_data with basic server info (no metrics yet)
    servers = load_servers()
    with data_lock:
        cached_data = []
        for s in servers:
            cached_data.append({
                'name': s['name'], 'ip': s['ip'],
                'http_port': s.get('http_port', 0), 'socks_port': s.get('socks_port', 0),
                'role': s.get('role', ''), 'vds_provider': s.get('vds_provider', ''),
                'online': None, 'cpu': None, 'ram_used': None, 'ram_total': None,
                'disk_used': None, 'disk_total': None, 'uptime': None,
                'http_proxy': False, 'socks_proxy': False, 'proxy_running': False,
                'speed_mbps': None, 'vds_info': None, 'days_left': None
            })
    # Load RuVDS cache
    ruvds_cache = _load_json(RUVDS_CACHE_FILE, {})
    if load_api_keys().get('ruvds'):
        threading.Thread(target=refresh_ruvds, daemon=True).start()
    threading.Thread(target=poll_loop, daemon=True).start()
    threading.Thread(target=daily_ruvds, daemon=True).start()
    print(f"  [servers] {len(servers)} servers loaded, polling started")

# ---- Register routes ----
def register_routes():
    prefix = '/api/mod/servers'
    return {prefix: {'GET': handle_get, 'POST': handle_post, 'PUT': handle_put, 'DELETE': handle_delete, 'INIT': init}}
