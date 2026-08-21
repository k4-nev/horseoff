#!/usr/bin/env python3
"""
Horseoff v2.177 — Unified WS platform.
Single WebSocket for all real-time: messenger, server metrics, notifications.
Rate-limited auth, persistent sessions (30 days), global settings.
"""

import json, time, threading, os, hashlib, secrets, base64, io, asyncio, re
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

try:
    import websockets
    from websockets.asyncio.server import serve as ws_serve
    HAS_WS = True
except ImportError:
    HAS_WS = False
    print("  [WARN] websockets not installed")

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("  [WARN] Pillow not installed")

WEB_PORT = 8550
WS_PORT = 8551
SESSION_TTL = 30 * 86400  # 30 days
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent
DATA_DIR = ROOT_DIR / "data"
LOCALE_DIR = ROOT_DIR / "locale"
MODULES_DIR = ROOT_DIR / "modules"
CORE_DIR = SCRIPT_DIR
USERS_FILE = DATA_DIR / "users.json"
SETTINGS_FILE = DATA_DIR / "settings.json"

DATA_DIR.mkdir(exist_ok=True)
AVATARS_DIR = DATA_DIR / 'avatars'
AVATARS_DIR.mkdir(exist_ok=True)
MSG_DIR = DATA_DIR / 'messages'
MSG_DIR.mkdir(exist_ok=True)

# ============================================================
# GLOBAL SETTINGS (shared across all clients)
# ============================================================
_settings_lock = threading.Lock()

def load_settings():
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE) as f: return json.load(f)
        except: pass
    return {'poll_interval': 30}

def save_settings(s):
    with open(SETTINGS_FILE, 'w') as f: json.dump(s, f, indent=2)

def get_poll_interval():
    return load_settings().get('poll_interval', 30)

# ============================================================
# RATE LIMITING
# ============================================================
login_attempts = {}  # ip -> {'count': int, 'blocked_until': float}
rate_lock = threading.Lock()

def check_rate_limit(ip):
    with rate_lock:
        r = login_attempts.get(ip)
        if not r: return True
        if r.get('blocked_until') and time.time() < r['blocked_until']:
            return False
        if time.time() > r.get('blocked_until', 0):
            # Reset after block expires
            if r.get('count', 0) >= 5:
                login_attempts[ip] = {'count': 0, 'blocked_until': 0}
        return True

def record_failed_login(ip):
    with rate_lock:
        r = login_attempts.get(ip, {'count': 0, 'blocked_until': 0})
        r['count'] = r.get('count', 0) + 1
        if r['count'] >= 5:
            r['blocked_until'] = time.time() + 60  # 1 minute block
            r['count'] = 0
        login_attempts[ip] = r

def record_success_login(ip):
    with rate_lock:
        login_attempts.pop(ip, None)

def get_remaining_block(ip):
    with rate_lock:
        r = login_attempts.get(ip)
        if r and r.get('blocked_until') and time.time() < r['blocked_until']:
            return int(r['blocked_until'] - time.time())
    return 0

# ============================================================
# USERS & AUTH
# ============================================================
sessions = {}
auth_lock = threading.Lock()

def _hash(pw, salt=None):
    if not salt: salt = secrets.token_hex(16)
    return salt, hashlib.sha256(f"{salt}:{pw}".encode()).hexdigest()

def load_users():
    if USERS_FILE.exists():
        try:
            with open(USERS_FILE) as f: return json.load(f)
        except: pass
    return []

def save_users(users):
    with open(USERS_FILE, 'w') as f: json.dump(users, f, indent=2, ensure_ascii=False)
    os.chmod(str(USERS_FILE), 0o600)

def find_user(username):
    return next((u for u in load_users() if u['username'] == username), None)

def verify_pw(username, password):
    u = find_user(username)
    if not u: return None
    _, h = _hash(password, u['salt'])
    return u if h == u['password_hash'] else None

def validate_username(name):
    if not name or len(name) < 2 or len(name) > 30: return False, "Логин: 2-30 символов"
    if not re.match(r'^[a-zA-Z0-9]+$', name): return False, "Логин: только английские буквы и цифры"
    return True, "OK"

def validate_display_name(name):
    if not name: return True, "OK"
    if len(name) > 50: return False, "Имя: максимум 50 символов"
    if not all(c.isalpha() or c == ' ' for c in name): return False, "Имя: только буквы и пробелы"
    return True, "OK"

def create_user(username, password, role, display_name=''):
    ok, msg = validate_username(username)
    if not ok: return False, msg
    if display_name:
        ok, msg = validate_display_name(display_name)
        if not ok: return False, msg
    users = load_users()
    if any(u['username'] == username for u in users): return False, "Пользователь уже существует"
    salt, h = _hash(password)
    users.append({'id': secrets.token_hex(8), 'username': username, 'role': role,
        'display_name': display_name.strip() if display_name else '',
        'salt': salt, 'password_hash': h, 'created': time.strftime("%Y-%m-%d %H:%M:%S")})
    save_users(users)
    return True, "OK"

def update_user(uid, data):
    users = load_users()
    u = next((u for u in users if u['id'] == uid), None)
    if not u: return False, "Не найден"
    if 'username' in data and data['username']:
        new_name = data['username'].strip()
        if new_name != u['username']:
            ok, msg = validate_username(new_name)
            if not ok: return False, msg
            if any(x['username'] == new_name for x in users): return False, "Логин уже занят"
            u['username'] = new_name
    if 'display_name' in data:
        dn = data['display_name'].strip() if data['display_name'] else ''
        if dn:
            ok, msg = validate_display_name(dn)
            if not ok: return False, msg
        u['display_name'] = dn
    if 'role' in data: u['role'] = data['role']
    if 'password' in data and data['password']:
        s, h = _hash(data['password'])
        u['salt'] = s; u['password_hash'] = h
    save_users(users)
    return True, "OK"

def delete_user(uid):
    users = load_users()
    new = [u for u in users if u['id'] != uid]
    if len(new) == len(users): return False
    save_users(new)
    delete_avatar(uid)
    return True

def get_avatar_b64(user_id):
    p = AVATARS_DIR / f"{user_id}.jpg"
    if p.exists(): return base64.b64encode(p.read_bytes()).decode()
    return None

def save_avatar(user_id, data_b64):
    if not HAS_PIL: return False
    try:
        raw = base64.b64decode(data_b64.split(',')[-1])
        img = Image.open(io.BytesIO(raw)).convert('RGB')
        w, h = img.size; s = min(w, h)
        left = (w - s) // 2; top = (h - s) // 2
        img = img.crop((left, top, left + s, top + s)).resize((128, 128), Image.LANCZOS)
        img.save(str(AVATARS_DIR / f"{user_id}.jpg"), 'JPEG', quality=80)
        return True
    except: return False

def delete_avatar(user_id):
    p = AVATARS_DIR / f"{user_id}.jpg"
    if p.exists(): p.unlink()

def change_password(username, old_pw, new_pw):
    u = verify_pw(username, old_pw)
    if not u: return False, "Неверный текущий пароль"
    s, h = _hash(new_pw)
    u['salt'] = s; u['password_hash'] = h
    users = load_users()
    for i, usr in enumerate(users):
        if usr['id'] == u['id']: users[i] = u; break
    save_users(users)
    return True, "OK"

def create_session(user):
    token = secrets.token_urlsafe(32)
    with auth_lock:
        sessions[token] = {'username': user['username'], 'role': user['role'], 'id': user['id'], 'expires': time.time() + SESSION_TTL}
    return token

def get_session(handler):
    h = handler.headers.get('Authorization', '')
    if not h.startswith('Bearer '): return None
    token = h[7:]
    with auth_lock:
        s = sessions.get(token)
        if not s: return None
        if time.time() > s['expires']: del sessions[token]; return None
        return s

def get_session_by_token(token):
    with auth_lock:
        s = sessions.get(token)
        if not s: return None
        if time.time() > s['expires']: del sessions[token]; return None
        return s

def require_role(handler, min_role):
    s = get_session(handler)
    if not s: return None
    roles = {'god': 3, 'admin': 2, 'user': 1}
    if roles.get(s['role'], 0) >= roles.get(min_role, 0): return s
    return None

# ============================================================
# MODULE DISCOVERY
# ============================================================
def discover_modules():
    mods = []
    if MODULES_DIR.exists():
        for d in sorted(MODULES_DIR.iterdir()):
            mf = d / 'manifest.json'
            if mf.exists():
                try:
                    with open(mf) as f: m = json.load(f)
                    m['path'] = str(d)
                    mods.append(m)
                except: pass
    return mods

module_apis = {}

def load_module_apis():
    import importlib.util
    for d in MODULES_DIR.iterdir():
        if not d.is_dir(): continue
        for f in d.glob('*_api.py'):
            spec = importlib.util.spec_from_file_location(f.stem, str(f))
            mod = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(mod)
                if hasattr(mod, 'register_routes'):
                    routes = mod.register_routes()
                    module_apis.update(routes)
                    print(f"  Loaded API: {f.stem} ({len(routes)} routes)")
            except Exception as e:
                print(f"  Error loading {f}: {e}")

# ============================================================
# MESSAGES
# ============================================================
def get_chat_key(uid1, uid2):
    return '_'.join(sorted([uid1, uid2]))

def get_messages(chat_key, offset=0, limit=50):
    f = MSG_DIR / f"{chat_key}.json"
    if not f.exists(): return []
    try:
        with open(f) as fh: msgs = json.load(fh)
        return msgs[-(offset+limit):len(msgs)-offset if offset else None]
    except: return []

def save_message(chat_key, msg):
    f = MSG_DIR / f"{chat_key}.json"
    try: msgs = json.loads(f.read_text()) if f.exists() else []
    except: msgs = []
    msgs.append(msg)
    f.write_text(json.dumps(msgs, ensure_ascii=False))
    return msg

def get_last_message(chat_key):
    f = MSG_DIR / f"{chat_key}.json"
    if not f.exists(): return None
    try:
        with open(f) as fh: msgs = json.load(fh)
        return msgs[-1] if msgs else None
    except: return None

def get_unread_count(chat_key, user_id):
    f = MSG_DIR / f"{chat_key}.json"
    if not f.exists(): return 0
    try:
        with open(f) as fh: msgs = json.load(fh)
        count = 0
        for m in reversed(msgs):
            if m['from'] == user_id: break
            if not m.get('read'): count += 1
            else: break
        return count
    except: return 0

def get_msg_count(chat_key):
    f = MSG_DIR / f"{chat_key}.json"
    if not f.exists(): return 0
    try:
        with open(f) as fh: return len(json.load(fh))
    except: return 0

def mark_read(chat_key, user_id):
    f = MSG_DIR / f"{chat_key}.json"
    if not f.exists(): return
    try:
        msgs = json.loads(f.read_text())
        changed = False
        for m in reversed(msgs):
            if m['from'] == user_id: break
            if not m.get('read'): m['read'] = True; changed = True
        if changed: f.write_text(json.dumps(msgs, ensure_ascii=False))
    except: pass

def build_contacts(user_id):
    users = load_users()
    contacts = []
    for u in users:
        if u['id'] == user_id: continue
        ck = get_chat_key(user_id, u['id'])
        last = get_last_message(ck)
        unread = get_unread_count(ck, user_id)
        msg_count = get_msg_count(ck)
        contacts.append({'id': u['id'], 'username': u['username'],
            'display_name': u.get('display_name', ''), 'role': u['role'],
            'avatar': get_avatar_b64(u['id']),
            'last_msg': last, 'unread': unread, 'msg_count': msg_count})
    contacts.sort(key=lambda c: c['last_msg']['time'] if c['last_msg'] else 0, reverse=True)
    return contacts

# ============================================================
# UNIFIED WEBSOCKET
# ============================================================
ws_clients = {}  # token -> {ws, user_id, username, role}
ws_loop = None  # asyncio event loop for WS thread

def _ws_broadcast_to_user(user_id, data, exclude_token=None):
    """Schedule broadcast to all WS clients of a user."""
    if not ws_loop: return
    for token, client in list(ws_clients.items()):
        if client['user_id'] == user_id and token != exclude_token:
            try:
                asyncio.run_coroutine_threadsafe(
                    client['ws'].send(json.dumps(data)), ws_loop)
            except: pass

def _ws_broadcast_all(data):
    """Broadcast to ALL connected clients."""
    if not ws_loop: return
    for token, client in list(ws_clients.items()):
        try:
            asyncio.run_coroutine_threadsafe(
                client['ws'].send(json.dumps(data)), ws_loop)
        except: pass

def ws_push_servers(server_data):
    """Called from servers_api poll_loop to push metrics to all clients."""
    _ws_broadcast_all({'type': 'servers_update', 'data': server_data})

def ws_push_settings():
    """Push updated settings to all clients."""
    _ws_broadcast_all({'type': 'settings', 'data': load_settings()})

async def handle_ws(websocket):
    token = None
    try:
        raw = await websocket.recv()
        data = json.loads(raw)
        if data.get('type') != 'auth' or not data.get('token'):
            await websocket.close(); return

        t = data['token']
        s = get_session_by_token(t)
        if not s:
            await websocket.send(json.dumps({'type':'error','msg':'Unauthorized'}))
            await websocket.close(); return

        token = t
        ws_clients[token] = {'ws': websocket, 'user_id': s['id'], 'username': s['username'], 'role': s['role']}
        await websocket.send(json.dumps({'type':'auth_ok'}))

        # Send initial data
        contacts = build_contacts(s['id'])
        await websocket.send(json.dumps({'type':'contacts','contacts':contacts}))
        # Send current settings
        await websocket.send(json.dumps({'type':'settings','data':load_settings()}))

        async for raw in websocket:
            try:
                data = json.loads(raw)
                mt = data.get('type')

                if mt == 'send':
                    to_id = data.get('to')
                    text = data.get('text', '').strip()
                    if not to_id or not text: continue
                    chat_key = get_chat_key(s['id'], to_id)
                    sender = find_user(s['username'])
                    sender_display = sender.get('display_name', '') if sender else ''
                    msg = {'id': secrets.token_hex(8), 'from': s['id'],
                        'from_name': sender_display or s['username'],
                        'text': text, 'time': int(time.time()), 'read': False}
                    save_message(chat_key, msg)
                    await websocket.send(json.dumps({'type':'sent','msg':msg,'chat':chat_key}))
                    # Notify recipient
                    for tk, cl in list(ws_clients.items()):
                        if cl['user_id'] == to_id:
                            try:
                                await cl['ws'].send(json.dumps({'type':'message','chat':chat_key,'msg':msg}))
                                # Also refresh their contacts
                                c2 = build_contacts(to_id)
                                await cl['ws'].send(json.dumps({'type':'contacts','contacts':c2}))
                            except: pass
                    # Refresh sender contacts
                    c1 = build_contacts(s['id'])
                    await websocket.send(json.dumps({'type':'contacts','contacts':c1}))

                elif mt == 'typing':
                    to_id = data.get('to')
                    if to_id:
                        ck = get_chat_key(s['id'], to_id)
                        for tk, cl in list(ws_clients.items()):
                            if cl['user_id'] == to_id:
                                try: await cl['ws'].send(json.dumps({'type':'typing','chat':ck,'user':s['username']}))
                                except: pass

                elif mt == 'read':
                    ck = data.get('chat')
                    if ck: mark_read(ck, s['id'])

                elif mt == 'history':
                    to_id = data.get('to')
                    offset = data.get('offset', 0)
                    if to_id:
                        ck = get_chat_key(s['id'], to_id)
                        msgs = get_messages(ck, offset)
                        await websocket.send(json.dumps({'type':'history','chat':ck,'messages':msgs,'offset':offset}))

                elif mt == 'contacts':
                    contacts = build_contacts(s['id'])
                    await websocket.send(json.dumps({'type':'contacts','contacts':contacts}))

                elif mt == 'set_interval':
                    # Global setting — any admin/god can change
                    if s['role'] in ('god', 'admin'):
                        interval = int(data.get('interval', 30))
                        if interval in (15, 30, 45, 60):
                            with _settings_lock:
                                st = load_settings()
                                st['poll_interval'] = interval
                                save_settings(st)
                            ws_push_settings()

            except json.JSONDecodeError: pass
    except: pass
    finally:
        if token and token in ws_clients:
            del ws_clients[token]

def start_ws_server():
    global ws_loop
    if not HAS_WS:
        print("  [WS] Skipped — websockets not installed"); return
    def _run():
        global ws_loop
        ws_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(ws_loop)
        async def _serve():
            server = await ws_serve(handle_ws, "0.0.0.0", WS_PORT)
            print(f"  [WS] Unified on ws://0.0.0.0:{WS_PORT}")
            await server.serve_forever()
        ws_loop.run_until_complete(_serve())
    threading.Thread(target=_run, daemon=True).start()

# ============================================================
# HTTP SERVER
# ============================================================
MIME = {'.html':'text/html','.css':'text/css','.js':'application/javascript',
        '.json':'application/json','.svg':'image/svg+xml','.png':'image/png'}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path

        if path == '/api/auth/status':
            users = load_users()
            s = get_session(self)
            resp = {'setup_required': len(users) == 0}
            if s: resp.update({'username': s['username'], 'role': s['role']})
            return self._json(200, resp)

        if path.startswith('/locale/'):
            return self._serve_file(LOCALE_DIR / path.split('/locale/')[1])

        if path.startswith('/modules/'):
            parts = path.split('/', 3)
            if len(parts) >= 4: return self._serve_file(MODULES_DIR / parts[2] / parts[3])

        if path == '/api/modules':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            return self._json(200, discover_modules())

        if path == '/api/users':
            s = require_role(self, 'god')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            users = load_users()
            safe = [{'id':u['id'],'username':u['username'],'display_name':u.get('display_name',''),'role':u['role'],'created':u['created'],'avatar':get_avatar_b64(u['id'])} for u in users]
            return self._json(200, safe)

        if path == '/api/ws-port':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            return self._json(200, {'port': WS_PORT, 'available': HAS_WS})

        if path == '/api/profile':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            avatar = get_avatar_b64(s['id'])
            user = find_user(s['username'])
            dn = user.get('display_name', '') if user else ''
            return self._json(200, {'username': s['username'], 'display_name': dn, 'role': s['role'], 'id': s['id'], 'avatar': avatar})

        if path.startswith('/api/avatar/'):
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            uid = path.split('/api/avatar/')[1]
            return self._json(200, {'avatar': get_avatar_b64(uid)})

        if path == '/api/settings':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            return self._json(200, load_settings())

        # HTTP fallback for messenger
        if path == '/api/msg/contacts':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            return self._json(200, {'contacts': build_contacts(s['id'])})

        if path.startswith('/api/msg/history/'):
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            to_id = path.split('/api/msg/history/')[1]
            ck = get_chat_key(s['id'], to_id)
            return self._json(200, {'messages': get_messages(ck, 0), 'chat': ck})

        if path.startswith('/api/msg/read/'):
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            to_id = path.split('/api/msg/read/')[1]
            mark_read(get_chat_key(s['id'], to_id), s['id'])
            return self._json(200, {'status': 'ok'})

        # Module API routes
        for prefix, handler_fn in module_apis.items():
            if path.startswith(prefix) and callable(handler_fn.get('GET')):
                s = get_session(self)
                if not s: return self._json(401, {'error': 'Unauthorized'})
                return handler_fn['GET'](self, s, path)

        if path in ('/', '/index.html'): return self._serve_file(CORE_DIR / 'shell.html')
        if path.startswith('/core/'): return self._serve_file(CORE_DIR / path.split('/core/')[1])
        self._json(404, {'error': 'Not found'})

    def do_POST(self):
        path = urlparse(self.path).path
        data = self._read_json()
        if data is None: return
        client_ip = self.client_address[0]

        if path == '/api/auth/setup':
            if load_users(): return self._json(400, {'error': 'Владелец уже создан'})
            u, p = data.get('username','').strip(), data.get('password','')
            ok, msg = validate_username(u)
            if not ok: return self._json(400, {'error': msg})
            if len(p) < 6: return self._json(400, {'error': 'Пароль минимум 6 символов'})
            ok, msg = create_user(u, p, 'god')
            if not ok: return self._json(400, {'error': msg})
            user = find_user(u)
            return self._json(200, {'token': create_session(user)})

        if path == '/api/auth/login':
            # Rate limiting
            remaining = get_remaining_block(client_ip)
            if remaining > 0:
                return self._json(429, {'error': f'Слишком много попыток. Подождите {remaining} сек.'})
            u, p = data.get('username','').strip(), data.get('password','')
            user = verify_pw(u, p)
            if user:
                record_success_login(client_ip)
                return self._json(200, {'token': create_session(user)})
            record_failed_login(client_ip)
            remaining = get_remaining_block(client_ip)
            if remaining > 0:
                return self._json(429, {'error': f'Слишком много попыток. Подождите {remaining} сек.'})
            return self._json(401, {'error': 'Неверный логин или пароль'})

        if path == '/api/profile/name':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            dn = data.get('display_name', '').strip()
            if dn:
                ok, msg = validate_display_name(dn)
                if not ok: return self._json(400, {'error': msg})
            users = load_users()
            for u in users:
                if u['id'] == s['id']: u['display_name'] = dn; break
            save_users(users)
            return self._json(200, {'status': 'ok'})

        if path == '/api/profile/avatar':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            img_data = data.get('image', '')
            if not img_data: return self._json(400, {'error': 'No image'})
            if not HAS_PIL: return self._json(500, {'error': 'Pillow not installed'})
            ok = save_avatar(s['id'], img_data)
            return self._json(200 if ok else 500, {'status': 'ok'} if ok else {'error': 'Failed'})

        if path == '/api/profile/password':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            ok, msg = change_password(s['username'], data.get('old',''), data.get('new',''))
            return self._json(200 if ok else 400, {'status':'ok'} if ok else {'error': msg})

        # Message actions
        if path == '/api/messages/clear':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            chat_key = data.get('chat', '')
            if not chat_key: return self._json(400, {'error': 'No chat key'})
            parts = chat_key.split('_')
            if s['id'] not in parts: return self._json(403, {'error': 'Нет доступа'})
            f = MSG_DIR / f"{chat_key}.json"
            if f.exists(): f.write_text('[]')
            return self._json(200, {'status': 'ok'})

        if path == '/api/msg/send':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            to_id = data.get('to', ''); text = data.get('text', '').strip()
            if not to_id or not text: return self._json(400, {'error': 'Missing fields'})
            chat_key = get_chat_key(s['id'], to_id)
            sender = find_user(s['username'])
            msg = {'id': secrets.token_hex(8), 'from': s['id'],
                'from_name': (sender.get('display_name','') if sender else '') or s['username'],
                'text': text, 'time': int(time.time()), 'read': False}
            save_message(chat_key, msg)
            _ws_broadcast_to_user(to_id, {'type':'message','chat':chat_key,'msg':msg})
            return self._json(200, {'status': 'ok', 'msg': msg, 'chat': chat_key})

        if path == '/api/msg/edit':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            chat_key, msg_id, new_text = data.get('chat',''), data.get('msg_id',''), data.get('text','').strip()
            if not all([chat_key, msg_id, new_text]): return self._json(400, {'error': 'Missing fields'})
            if s['id'] not in chat_key.split('_'): return self._json(403, {'error': 'Нет доступа'})
            f = MSG_DIR / f"{chat_key}.json"
            if not f.exists(): return self._json(404, {'error': 'Not found'})
            try:
                msgs = json.loads(f.read_text())
                for m in msgs:
                    if m['id'] == msg_id:
                        if m['from'] != s['id']: return self._json(403, {'error': 'Не ваше'})
                        if time.time() - m['time'] > 172800: return self._json(400, {'error': '>2 дней'})
                        m['text'] = new_text; m['edited'] = True; break
                f.write_text(json.dumps(msgs, ensure_ascii=False))
                return self._json(200, {'status': 'ok'})
            except: return self._json(500, {'error': 'Error'})

        if path == '/api/msg/delete':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            chat_key, msg_id = data.get('chat',''), data.get('msg_id','')
            if not all([chat_key, msg_id]): return self._json(400, {'error': 'Missing fields'})
            if s['id'] not in chat_key.split('_'): return self._json(403, {'error': 'Нет доступа'})
            f = MSG_DIR / f"{chat_key}.json"
            if not f.exists(): return self._json(404, {'error': 'Not found'})
            try:
                msgs = json.loads(f.read_text())
                mo = next((m for m in msgs if m['id'] == msg_id), None)
                if not mo: return self._json(404, {'error': 'Not found'})
                if mo['from'] != s['id']: return self._json(403, {'error': 'Не ваше'})
                if time.time() - mo['time'] > 172800: return self._json(400, {'error': '>2 дней'})
                msgs = [m for m in msgs if m['id'] != msg_id]
                f.write_text(json.dumps(msgs, ensure_ascii=False))
                return self._json(200, {'status': 'ok'})
            except: return self._json(500, {'error': 'Error'})

        if path == '/api/msg/react':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            chat_key, msg_id, emoji = data.get('chat',''), data.get('msg_id',''), data.get('emoji','')
            if not all([chat_key, msg_id, emoji]): return self._json(400, {'error': 'Missing fields'})
            parts = chat_key.split('_')
            if s['id'] not in parts: return self._json(403, {'error': 'Нет доступа'})
            f = MSG_DIR / f"{chat_key}.json"
            if not f.exists(): return self._json(404, {'error': 'Not found'})
            try:
                msgs = json.loads(f.read_text())
                updated_msg = None
                for m in msgs:
                    if m['id'] == msg_id:
                        if 'reactions' not in m: m['reactions'] = {}
                        if s['id'] in m['reactions'] and m['reactions'][s['id']] == emoji:
                            del m['reactions'][s['id']]
                        else:
                            m['reactions'][s['id']] = emoji
                        updated_msg = m
                        break
                f.write_text(json.dumps(msgs, ensure_ascii=False))
                # Push reaction update to other user via WS
                if updated_msg:
                    other_id = [p for p in parts if p != s['id']]
                    if other_id:
                        _ws_broadcast_to_user(other_id[0], {'type':'reaction','chat':chat_key,'msg_id':msg_id,'reactions':updated_msg.get('reactions',{})})
                return self._json(200, {'status': 'ok'})
            except: return self._json(500, {'error': 'Error'})

        if path == '/api/users':
            s = require_role(self, 'god')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            u, p, r = data.get('username','').strip(), data.get('password',''), data.get('role','user')
            ok, msg = validate_username(u)
            if not ok: return self._json(400, {'error': msg})
            if len(p) < 6: return self._json(400, {'error': 'Пароль минимум 6 символов'})
            if r not in ('admin','user'): return self._json(400, {'error': 'Роль: admin или user'})
            dn = data.get('display_name', '')
            ok, msg = create_user(u, p, r, dn)
            return self._json(201 if ok else 400, {'status':'ok'} if ok else {'error': msg})

        # Module API routes
        for prefix, handler_fn in module_apis.items():
            if path.startswith(prefix) and callable(handler_fn.get('POST')):
                s = get_session(self)
                if not s: return self._json(401, {'error': 'Unauthorized'})
                return handler_fn['POST'](self, s, path, data)

        self._json(404, {'error': 'Not found'})

    def do_PUT(self):
        path = urlparse(self.path).path
        data = self._read_json()
        if data is None: return
        if path.startswith('/api/users/'):
            s = require_role(self, 'god')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            uid = path.split('/api/users/')[1]
            ok, msg = update_user(uid, data)
            return self._json(200 if ok else 400, {'status':'ok'} if ok else {'error': msg})
        for prefix, handler_fn in module_apis.items():
            if path.startswith(prefix) and callable(handler_fn.get('PUT')):
                s = get_session(self)
                if not s: return self._json(401, {'error': 'Unauthorized'})
                return handler_fn['PUT'](self, s, path, data)
        self._json(404, {'error': 'Not found'})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path == '/api/profile/avatar':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            delete_avatar(s['id'])
            return self._json(200, {'status': 'ok'})
        if path.startswith('/api/avatar/'):
            s = require_role(self, 'god')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            delete_avatar(path.split('/api/avatar/')[1])
            return self._json(200, {'status': 'ok'})
        if path.startswith('/api/users/'):
            s = require_role(self, 'god')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            uid = path.split('/api/users/')[1]
            if uid == s['id']: return self._json(400, {'error': 'Нельзя удалить себя'})
            ok = delete_user(uid)
            return self._json(200 if ok else 404, {'status':'ok'} if ok else {'error':'Не найден'})
        for prefix, handler_fn in module_apis.items():
            if path.startswith(prefix) and callable(handler_fn.get('DELETE')):
                s = get_session(self)
                if not s: return self._json(401, {'error': 'Unauthorized'})
                return handler_fn['DELETE'](self, s, path)
        self._json(404, {'error': 'Not found'})

    def _json(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _serve_file(self, filepath):
        filepath = Path(filepath)
        if not filepath.exists(): return self._json(404, {'error': 'Not found'})
        ext = filepath.suffix
        mime = MIME.get(ext, 'application/octet-stream')
        self.send_response(200)
        self.send_header('Content-Type', f'{mime}; charset=utf-8' if ext in ('.html','.css','.js','.json') else mime)
        self.end_headers()
        self.wfile.write(filepath.read_bytes())

    def _read_json(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try: return json.loads(body) if body else {}
        except: self._json(400, {'error':'Invalid JSON'}); return None

    def log_message(self, *a): pass

# ============================================================
# MAIN
# ============================================================
def main():
    print("=" * 50)
    print("  HORSEOFF v2.177")
    print("=" * 50)
    users = load_users()
    modules = discover_modules()
    print(f"  Users:   {len(users)} ({'SETUP REQUIRED' if not users else ', '.join(u['username'] for u in users)})")
    print(f"  Modules: {', '.join(m['id'] for m in modules) or 'none'}")
    print(f"  Web UI:  http://0.0.0.0:{WEB_PORT}")
    print(f"  Session: {SESSION_TTL // 86400} days")
    print("=" * 50)

    load_module_apis()

    for prefix, handler_fn in module_apis.items():
        if callable(handler_fn.get('INIT')):
            handler_fn['INIT']()

    server = HTTPServer(('0.0.0.0', WEB_PORT), Handler)
    start_ws_server()
    print(f"\n  Ready: http://0.0.0.0:{WEB_PORT}\n")
    try: server.serve_forever()
    except KeyboardInterrupt: print("\nShutdown."); server.shutdown()

if __name__ == '__main__': main()
