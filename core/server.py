#!/usr/bin/env python3
"""
Horseoff v2.187 — Full WebSocket platform.
Single WebSocket for all real-time: messenger, server metrics, notifications.
Rate-limited auth, persistent sessions (30 days), global settings.
"""

import json, time, threading, os, hashlib, secrets, base64, io, asyncio, re, subprocess, sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# Register this module so servers_api can import from it
sys.modules['server'] = sys.modules[__name__]

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
SESSION_TTL = 7 * 86400  # 7 days
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent
DATA_DIR = ROOT_DIR / "data"
LOCALE_DIR = ROOT_DIR / "locale"
MODULES_DIR = ROOT_DIR / "modules"
CORE_DIR = SCRIPT_DIR
USERS_FILE = DATA_DIR / "users.json"
SETTINGS_FILE = DATA_DIR / "settings.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"

DATA_DIR.mkdir(exist_ok=True)
AVATARS_DIR = DATA_DIR / 'avatars'
AVATARS_DIR.mkdir(exist_ok=True)
MSG_DIR = DATA_DIR / 'messages'
MSG_DIR.mkdir(exist_ok=True)

# Push notifications
PUSH_DIR = DATA_DIR / 'push'
PUSH_DIR.mkdir(exist_ok=True)
VAPID_DIR = ROOT_DIR / 'pwa'
VAPID_PRIVATE_KEY = VAPID_DIR / 'vapid_private.pem'
VAPID_PUBLIC_KEY_FILE = VAPID_DIR / 'vapid_public.txt'
VAPID_EMAIL = 'mailto:admin@horseoff-workspace.ru'

try:
    from pywebpush import webpush, WebPushException
    HAS_PUSH = True
except ImportError:
    HAS_PUSH = False
    print("  [WARN] pywebpush not installed. Run: pip install pywebpush --break-system-packages")

def get_vapid_public_key():
    if VAPID_PUBLIC_KEY_FILE.exists():
        return VAPID_PUBLIC_KEY_FILE.read_text().strip()
    return None

def save_push_sub(user_id, subscription):
    f = PUSH_DIR / f"{user_id}.json"
    try:
        subs = json.loads(f.read_text()) if f.exists() else []
    except: subs = []
    # Avoid duplicates by endpoint
    ep = subscription.get('endpoint', '')
    subs = [s for s in subs if s.get('endpoint') != ep]
    subs.append(subscription)
    f.write_text(json.dumps(subs, ensure_ascii=False))

def remove_push_sub(user_id, endpoint):
    f = PUSH_DIR / f"{user_id}.json"
    if not f.exists(): return
    try:
        subs = json.loads(f.read_text())
        subs = [s for s in subs if s.get('endpoint') != endpoint]
        f.write_text(json.dumps(subs, ensure_ascii=False))
    except: pass

def get_push_subs(user_id):
    f = PUSH_DIR / f"{user_id}.json"
    if not f.exists(): return []
    try: return json.loads(f.read_text())
    except: return []

def send_push(user_id, title, body, url='/', sender_id=''):
    if not HAS_PUSH or not VAPID_PRIVATE_KEY.exists():
        print(f"[PUSH] Skip: HAS_PUSH={HAS_PUSH}, key_exists={VAPID_PRIVATE_KEY.exists()}")
        return
    subs = get_push_subs(user_id)
    if not subs:
        print(f"[PUSH] No subscriptions for user {user_id}")
        return
    payload = json.dumps({'title': title, 'body': body, 'url': url, 'sender_id': sender_id,
        'icon': f'/pwa/avatar/{sender_id}' if sender_id else '/pwa/icon-192.png'})
    priv_key_path = str(VAPID_PRIVATE_KEY)
    dead = []
    print(f"[PUSH] Sending to {user_id}: {title} / {body} ({len(subs)} subs)")
    for sub in subs:
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=priv_key_path,
                vapid_claims={"sub": VAPID_EMAIL}
            )
            print(f"[PUSH] OK → {sub.get('endpoint','')[:60]}...")
        except WebPushException as e:
            print(f"[PUSH] Error: {e}")
            if e.response and e.response.status_code in (404, 410):
                dead.append(sub.get('endpoint'))
        except Exception as e:
            print(f"[PUSH] Exception: {e}")
    if dead:
        f = PUSH_DIR / f"{user_id}.json"
        try:
            subs = [s for s in subs if s.get('endpoint') not in dead]
            f.write_text(json.dumps(subs, ensure_ascii=False))
        except: pass

def is_user_online(user_id):
    """Check if user has active WS connection."""
    for token, client in list(ws_clients.items()):
        if client['user_id'] == user_id:
            return True
    return False
ATTACH_DIR = DATA_DIR / 'attachments'
ATTACH_DIR.mkdir(exist_ok=True)
PINS_FILE = DATA_DIR / 'pins.json'
USER_PREFS_DIR = DATA_DIR / 'user_prefs'
USER_PREFS_DIR.mkdir(exist_ok=True)
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
IMAGE_EXTS = {'.jpg','.jpeg','.png','.gif','.webp','.bmp','.heic','.heif'}
AUDIO_EXTS = {'.mp3','.ogg','.wav','.m4a','.aac','.wma','.flac'}
VIDEO_EXTS = {'.mp4','.mov','.avi','.mkv','.webm','.3gp'}

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
auth_lock = threading.Lock()
sessions = {}

def load_sessions():
    try:
        if SESSIONS_FILE.exists():
            with open(SESSIONS_FILE) as f:
                data = json.load(f)
            now = time.time()
            return {k: v for k, v in data.items() if v.get('expires', 0) > now}
    except Exception:
        pass
    return {}

def save_sessions():
    try:
        with open(SESSIONS_FILE, 'w') as f:
            json.dump(sessions, f)
    except Exception as e:
        print(f'[sessions] save error: {e}')

sessions = load_sessions()

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


def migrate_user_roles():
    """Migrate old role names to new system."""
    users = load_users()
    changed = False
    role_map = {'user': 'common', 'admin': 'immortal', 'god': 'arcana'}
    for u in users:
        if u['role'] in role_map:
            u['role'] = role_map[u['role']]
            changed = True
    if changed:
        save_users(users)
        print(f"  [MIGRATE] Roles updated for {len(users)} users")

def find_user_by_id(uid):
    users = load_users()
    return next((u for u in users if u['id'] == uid), None)

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
    default_mods = load_settings().get('default_modules', ['messenger'])
    users.append({'id': secrets.token_hex(8), 'username': username, 'role': role,
        'display_name': display_name.strip() if display_name else '',
        'modules': list(default_mods),
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
    if 'modules' in data: u['modules'] = data['modules']
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

# ============================================================
# ATTACHMENTS
# ============================================================
def process_image(data, att_id):
    """Process image: save full WebP + thumbnail. Returns (width, height) or None."""
    if not HAS_PIL: return None
    try:
        img = Image.open(io.BytesIO(data))
        # Handle all modes: RGBA, P (palette), LA, etc
        if img.mode in ('RGBA', 'LA', 'P'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            bg.paste(img, mask=img.split()[-1] if 'A' in img.mode else None)
            img = bg
        else:
            img = img.convert('RGB')
        w, h = img.size
        # Full: max 1200px
        img_full = img.copy()
        img_full.thumbnail((1200, 1200), Image.LANCZOS)
        fw, fh = img_full.size
        img_full.save(str(ATTACH_DIR / f"{att_id}.webp"), 'WEBP', quality=85)
        # Thumbnail: 200x200 center crop
        img_thumb = img.copy()
        s = min(w, h)
        left = (w - s) // 2; top = (h - s) // 2
        img_thumb = img_thumb.crop((left, top, left + s, top + s))
        img_thumb = img_thumb.resize((200, 200), Image.LANCZOS)
        img_thumb.save(str(ATTACH_DIR / f"{att_id}_thumb.webp"), 'WEBP', quality=80)
        return fw, fh
    except Exception as e:
        print(f"[ATTACH] Image error: {e}")
        return None

def save_attachment(data, filename, att_id):
    """Save a non-image file. Returns True on success."""
    try:
        p = ATTACH_DIR / f"{att_id}_{filename}"
        p.write_bytes(data)
        return True
    except: return False

def process_audio(data, att_id):
    """Convert audio to OGG/Opus via FFmpeg. Returns duration_seconds or None."""
    try:
        tmp_in = ATTACH_DIR / f"{att_id}_tmp_in"
        tmp_in.write_bytes(data)
        out_path = ATTACH_DIR / f"{att_id}.ogg"
        cmd = ['ffmpeg', '-y', '-i', str(tmp_in), '-c:a', 'libopus', '-b:a', '64k', '-vn', str(out_path)]
        r = subprocess.run(cmd, capture_output=True, timeout=60)
        tmp_in.unlink(missing_ok=True)
        if r.returncode != 0 or not out_path.exists():
            print(f"[AUDIO] FFmpeg error: {r.stderr.decode()[-200:]}")
            return None
        # Get duration
        dur_cmd = ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(out_path)]
        dr = subprocess.run(dur_cmd, capture_output=True, text=True, timeout=10)
        duration = round(float(dr.stdout.strip())) if dr.returncode == 0 else 0
        return duration
    except Exception as e:
        print(f"[AUDIO] Error: {e}")
        return None

def process_video(data, att_id):
    """Convert video to MP4 H.264 720p + generate thumbnail. Returns (duration, width, height) or None."""
    try:
        tmp_in = ATTACH_DIR / f"{att_id}_tmp_vin"
        tmp_in.write_bytes(data)
        out_path = ATTACH_DIR / f"{att_id}.mp4"
        thumb_path = ATTACH_DIR / f"{att_id}_thumb.webp"
        # Convert to H.264 720p
        cmd = ['ffmpeg', '-y', '-i', str(tmp_in),
               '-c:v', 'libx264', '-preset', 'fast', '-crf', '28',
               '-vf', 'scale=-2:min(720\\,ih)',
               '-c:a', 'aac', '-b:a', '96k',
               '-movflags', '+faststart', str(out_path)]
        r = subprocess.run(cmd, capture_output=True, timeout=300)
        if r.returncode != 0 or not out_path.exists():
            print(f"[VIDEO] FFmpeg error: {r.stderr.decode()[-300:]}")
            tmp_in.unlink(missing_ok=True)
            return None
        # Generate thumbnail
        subprocess.run(['ffmpeg', '-y', '-i', str(out_path), '-vframes', '1', '-vf', 'scale=200:-2', str(thumb_path)],
                      capture_output=True, timeout=15)
        # Get duration and dimensions
        probe = subprocess.run(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration:stream=width,height',
                               '-of', 'json', str(out_path)], capture_output=True, text=True, timeout=10)
        tmp_in.unlink(missing_ok=True)
        duration, w, h = 0, 0, 0
        if probe.returncode == 0:
            info = json.loads(probe.stdout)
            duration = round(float(info.get('format', {}).get('duration', 0)))
            for s in info.get('streams', []):
                if s.get('width'): w, h = s['width'], s['height']; break
        return duration, w, h
    except Exception as e:
        print(f"[VIDEO] Error: {e}")
        return None

def get_attachment_path(att_id, thumb=False):
    """Find attachment file path."""
    if thumb:
        for ext in ('_thumb.webp', '_thumb.jpg'):
            p = ATTACH_DIR / f"{att_id}{ext}"
            if p.exists(): return p
    # Image
    p = ATTACH_DIR / f"{att_id}.webp"
    if p.exists(): return p
    # Audio
    p = ATTACH_DIR / f"{att_id}.ogg"
    if p.exists(): return p
    # Video
    p = ATTACH_DIR / f"{att_id}.mp4"
    if p.exists(): return p
    # File - find by prefix
    for f in ATTACH_DIR.iterdir():
        if f.name.startswith(att_id + '_') and '_thumb' not in f.name and '_tmp' not in f.name:
            return f
    return None

def parse_multipart(handler):
    """Parse multipart form data. Returns (fields_dict, files_list)."""
    import re as _re
    ct = handler.headers.get('Content-Type', '')
    if 'boundary=' not in ct: return {}, []
    boundary = ct.split('boundary=')[1].strip()
    if boundary.startswith('"'): boundary = boundary[1:-1]
    length = int(handler.headers.get('Content-Length', 0))
    body = handler.rfile.read(length)
    sep = ('--' + boundary).encode()
    parts = body.split(sep)
    fields = {}; files = []
    for part in parts:
        if b'Content-Disposition' not in part: continue
        hdr, _, content = part.partition(b'\r\n\r\n')
        # Strip only trailing \r\n (boundary delimiter), NOT binary content
        if content.endswith(b'\r\n'):
            content = content[:-2]
        hdr_str = hdr.decode('utf-8', errors='replace')
        nm = _re.search(r'name="([^"]*)"', hdr_str)
        fn = _re.search(r'filename="([^"]*)"', hdr_str)
        if not nm: continue
        if fn and fn.group(1):
            files.append({'name': fn.group(1), 'data': content, 'field': nm.group(1)})
        else:
            fields[nm.group(1)] = content.decode('utf-8', errors='replace')
    return fields, files

def get_chat_attachments(chat_key, att_type='image'):
    """Get all attachments from a chat for side panel."""
    f = MSG_DIR / f"{chat_key}.json"
    if not f.exists(): return []
    try:
        msgs = json.loads(f.read_text())
        result = []
        for m in msgs:
            for att in m.get('attachments', []):
                if att.get('type') == att_type:
                    result.append({**att, 'msg_id': m['id'], 'time': m['time']})
        return result
    except: return []

def load_pins():
    if PINS_FILE.exists():
        try: return json.loads(PINS_FILE.read_text())
        except: pass
    return {}

def save_pins(pins):
    PINS_FILE.write_text(json.dumps(pins, ensure_ascii=False))

def get_pin(chat_key):
    return load_pins().get(chat_key)

def set_pin(chat_key, msg_id, text):
    pins = load_pins()
    pins[chat_key] = {'msg_id': msg_id, 'text': text}
    save_pins(pins)

def remove_pin(chat_key):
    pins = load_pins()
    if chat_key in pins: del pins[chat_key]
    save_pins(pins)

def load_user_prefs(user_id):
    f = USER_PREFS_DIR / f"{user_id}.json"
    if f.exists():
        try: return json.loads(f.read_text())
        except: pass
    return {'pinned': [], 'muted': []}

def save_user_prefs(user_id, prefs):
    f = USER_PREFS_DIR / f"{user_id}.json"
    f.write_text(json.dumps(prefs, ensure_ascii=False))

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

def get_token_from_handler(handler):
    h = handler.headers.get('Authorization', '')
    if not h.startswith('Bearer '): return None
    return h[7:]

def create_session(user, device_info=None):
    token = secrets.token_urlsafe(32)
    now = time.time()
    with auth_lock:
        sessions[token] = {
            'username': user['username'], 'role': user['role'], 'id': user['id'],
            'expires': now + SESSION_TTL,
            'device_info': device_info or {},
            'created_at': now,
            'last_seen': now,
            'pin_enabled': False,
            'device_id': device_info.get('device_id', '') if device_info else ''
        }
    save_sessions()
    return token

def get_session(handler):
    token = get_token_from_handler(handler)
    if not token: return None
    with auth_lock:
        s = sessions.get(token)
        if not s: return None
        if time.time() > s['expires']: del sessions[token]; save_sessions(); return None
        s['last_seen'] = time.time()
    save_sessions()
    return s

def get_session_by_token(token):
    with auth_lock:
        s = sessions.get(token)
        if not s: return None
        if time.time() > s['expires']: del sessions[token]; save_sessions(); return None
        s['last_seen'] = time.time()
    save_sessions()
    return s

def require_role(handler, min_role):
    s = get_session(handler)
    if not s: return None
    roles = {'arcana': 7, 'immortal': 6, 'legendary': 5, 'mythical': 4, 'rare': 3, 'uncommon': 2, 'common': 1}
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
_loaded_modules = {}  # Store module references for cross-access

def load_module_apis():
    import importlib.util
    for d in MODULES_DIR.iterdir():
        if not d.is_dir(): continue
        for f in d.glob('*_api.py'):
            spec = importlib.util.spec_from_file_location(f.stem, str(f))
            mod = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(mod)
                sys.modules[f.stem] = mod  # Make importable by name
                _loaded_modules[f.stem] = mod
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

def get_user_status(user_id):
    """Aggregate presence across all of a user's connections.
    'online'  — at least one connection with a visible/focused window
    'away'    — connected, but every window is hidden/minimized
    'offline' — no active connections
    """
    conns = [cl for cl in ws_clients.values() if cl['user_id'] == user_id]
    if not conns: return 'offline'
    if any(not cl.get('hidden') for cl in conns): return 'online'
    return 'away'

def build_contacts(user_id):
    users = load_users()
    prefs = load_user_prefs(user_id)
    pinned_ids = prefs.get('pinned', [])
    muted_ids = prefs.get('muted', [])
    contacts = []
    for u in users:
        if u['id'] == user_id: continue
        ck = get_chat_key(user_id, u['id'])
        last = get_last_message(ck)
        unread = get_unread_count(ck, user_id)
        msg_count = get_msg_count(ck)
        is_pinned = u['id'] in pinned_ids
        is_muted = u['id'] in muted_ids
        status = get_user_status(u['id'])
        contacts.append({'id': u['id'], 'username': u['username'],
            'display_name': u.get('display_name', ''), 'role': u['role'],
            'avatar': get_avatar_b64(u['id']),
            'last_msg': last, 'unread': unread, 'msg_count': msg_count,
            'online': status != 'offline', 'status': status,
            'pinned': is_pinned, 'muted': is_muted})
    # Sort: pinned first (by pin order), then by last message time
    contacts.sort(key=lambda c: (
        0 if c['pinned'] else 1,
        pinned_ids.index(c['id']) if c['pinned'] and c['id'] in pinned_ids else 999,
        -(c['last_msg']['time'] if c['last_msg'] else 0)
    ))
    return contacts

# ============================================================
# UNIFIED WEBSOCKET
# ============================================================
ws_clients = {}  # token -> {ws, user_id, username, role}
ws_loop = None

# Voice rooms state (in-memory)
# room_id -> {space_id, speakers:[{user_id,username,avatar,muted,video_muted,raised_hand,token}], listeners:[...]}
voice_rooms = {}
voice_rooms_lock = threading.Lock()
_ws_queue = None  # asyncio.Queue for cross-thread messaging

def _ws_broadcast_to_user(user_id, data, exclude_token=None):
    """Schedule broadcast to all WS clients of a user."""
    if not _ws_queue or not ws_loop: return
    try:
        ws_loop.call_soon_threadsafe(_ws_queue.put_nowait, ('user', user_id, data, exclude_token))
    except: pass

def _ws_broadcast_all(data):
    """Broadcast to ALL connected clients."""
    if not _ws_queue or not ws_loop: return
    try:
        ws_loop.call_soon_threadsafe(_ws_queue.put_nowait, ('all', None, data, None))
    except: pass

def _ws_refresh_all_contacts():
    """Rebuild and push contacts to every connected WS client."""
    if not _ws_queue or not ws_loop: return
    try:
        ws_loop.call_soon_threadsafe(_ws_queue.put_nowait, ('refresh_contacts', None, None, None))
    except: pass

async def _broadcast_ch_presence(user_id, status=None):
    """Broadcast presence status to all connected users for channels module.
    status: 'online' | 'away' | 'offline' (computed if omitted)."""
    if status is None: status = get_user_status(user_id)
    msg = json.dumps({'type': 'ch_presence', 'user_id': user_id, 'online': status != 'offline', 'status': status})
    for tk, cl in list(ws_clients.items()):
        if cl['user_id'] != user_id:
            try: await cl['ws'].send(msg)
            except: pass

def _ws_ch_presence_offline(user_id):
    """Queue ch_presence offline broadcast (called from sync finally block)."""
    if not _ws_queue or not ws_loop: return
    try:
        ws_loop.call_soon_threadsafe(_ws_queue.put_nowait, ('ch_presence_offline', user_id, None, None))
    except: pass

def ws_push_servers(server_data):
    _ws_broadcast_all({'type': 'servers_update', 'data': server_data})

def ws_push_settings():
    _ws_broadcast_all({'type': 'settings', 'data': load_settings()})

async def _ws_queue_processor():
    """Runs in WS event loop, processes cross-thread messages."""
    global _ws_queue
    _ws_queue = asyncio.Queue()
    while True:
        try:
            kind, target_id, data, exclude = await _ws_queue.get()
            try:
                if kind == 'all':
                    msg = json.dumps(data)
                    dead = []
                    for tk, cl in list(ws_clients.items()):
                        try: await cl['ws'].send(msg)
                        except: dead.append(tk)
                    for tk in dead:
                        ws_clients.pop(tk, None)
                elif kind == 'user':
                    msg = json.dumps(data)
                    dead = []
                    for tk, cl in list(ws_clients.items()):
                        if cl['user_id'] == target_id and tk != exclude:
                            try: await cl['ws'].send(msg)
                            except: dead.append(tk)
                    for tk in dead:
                        ws_clients.pop(tk, None)
                elif kind == 'refresh_contacts':
                    dead = []
                    for tk, cl in list(ws_clients.items()):
                        try:
                            contacts = build_contacts(cl['user_id'])
                            await cl['ws'].send(json.dumps({'type':'contacts','contacts':contacts}))
                        except: dead.append(tk)
                    for tk in dead:
                        ws_clients.pop(tk, None)
                elif kind == 'ch_presence_offline':
                    st = get_user_status(target_id)
                    msg = json.dumps({'type': 'ch_presence', 'user_id': target_id, 'online': st != 'offline', 'status': st})
                    for tk, cl in list(ws_clients.items()):
                        try: await cl['ws'].send(msg)
                        except: pass
            except Exception as e:
                print(f"  [WS Queue] Process error: {e}")
        except Exception as e:
            print(f"  [WS Queue] Fatal: {e}")
            await asyncio.sleep(1)

def _voice_room_snapshot(room):
    return {
        'speakers': [{'user_id':p['user_id'],'username':p['username'],'avatar':p.get('avatar'),
                      'muted':p.get('muted',False),'video_muted':p.get('video_muted',True),'raised_hand':p.get('raised_hand',False)} for p in room['speakers']],
        'listeners': [{'user_id':p['user_id'],'username':p['username'],'avatar':p.get('avatar'),'raised_hand':p.get('raised_hand',False)} for p in room['listeners']],
    }

async def _voice_broadcast_room(room_id, msg_str, exclude_token=None):
    with voice_rooms_lock:
        if room_id not in voice_rooms: return
        room = voice_rooms[room_id]
        tokens = [p['token'] for p in room['speakers'] + room['listeners']]
    for tk in tokens:
        if tk == exclude_token: continue
        cl = ws_clients.get(tk)
        if cl:
            try: await cl['ws'].send(msg_str)
            except: pass

async def _voice_forward(room_id, to_user_id, msg_dict):
    with voice_rooms_lock:
        if room_id not in voice_rooms: return
        all_p = voice_rooms[room_id]['speakers'] + voice_rooms[room_id]['listeners']
        target = next((p for p in all_p if p['user_id'] == to_user_id), None)
        if not target: return
        tk = target['token']
    cl = ws_clients.get(tk)
    if cl:
        try: await cl['ws'].send(json.dumps(msg_dict))
        except: pass

async def _voice_leave(room_id, user_id, token_val):
    space_id = None
    total = 1
    with voice_rooms_lock:
        if room_id not in voice_rooms: return
        room = voice_rooms[room_id]
        space_id = room['space_id']
        room['speakers'] = [p for p in room['speakers'] if p['user_id'] != user_id]
        room['listeners'] = [p for p in room['listeners'] if p['user_id'] != user_id]
        total = len(room['speakers']) + len(room['listeners'])
        if total == 0:
            del voice_rooms[room_id]
    if total > 0:
        await _voice_broadcast_room(room_id, json.dumps({'type':'voice_left','room_id':room_id,'user_id':user_id}))
    if space_id:
        await _voice_notify_space(space_id)

async def _voice_notify_space(space_id):
    rooms_data = {}
    with voice_rooms_lock:
        for rid, room in voice_rooms.items():
            if room.get('space_id') == space_id:
                rooms_data[rid] = {
                    'total': len(room['speakers']) + len(room['listeners']),
                    'speaker_count': len(room['speakers']),
                    'speakers': [{'user_id':p['user_id'],'username':p['username'],'avatar':p.get('avatar')} for p in room['speakers']]
                }
    msg = json.dumps({'type':'voice_rooms_update','space_id':space_id,'rooms':rooms_data})
    for cl in list(ws_clients.values()):
        try: await cl['ws'].send(msg)
        except: pass

async def handle_ws(websocket):
    token = None
    ip = websocket.remote_address[0] if websocket.remote_address else '0.0.0.0'
    try:
        raw = await websocket.recv()
        data = json.loads(raw)
        if data.get('type') != 'auth' or not data.get('token'):
            await websocket.close(); return

        if not check_rate_limit(ip):
            await websocket.send(json.dumps({'type':'error','msg':'Too many attempts'}))
            await websocket.close(); return

        t = data['token']
        s = get_session_by_token(t)
        if not s:
            record_failed_login(ip)
            await websocket.send(json.dumps({'type':'error','msg':'Unauthorized'}))
            await websocket.close(); return

        token = t
        ws_clients[token] = {'ws': websocket, 'user_id': s['id'], 'username': s['username'], 'role': s['role'], 'hidden': bool(data.get('hidden'))}
        await websocket.send(json.dumps({'type':'auth_ok'}))

        # Push full state on connect
        contacts = build_contacts(s['id'])
        await websocket.send(json.dumps({'type':'contacts','contacts':contacts}))
        prefs = load_user_prefs(s['id'])
        await websocket.send(json.dumps({'type':'muted_list','muted':prefs.get('muted',[])}))
        await websocket.send(json.dumps({'type':'settings','data':load_settings()}))
        # Push current server metrics if available
        srv_mod = _loaded_modules.get('servers_api')
        if srv_mod and hasattr(srv_mod, 'cached_data') and hasattr(srv_mod, 'data_lock'):
            with srv_mod.data_lock:
                if srv_mod.cached_data:
                    await websocket.send(json.dumps({'type':'servers_update','data':list(srv_mod.cached_data)}))

        # Notify others — online status changed
        for tk, cl in list(ws_clients.items()):
            if cl['user_id'] != s['id']:
                try:
                    c = build_contacts(cl['user_id'])
                    await cl['ws'].send(json.dumps({'type':'contacts','contacts':c}))
                except: pass
        # Notify channels — user came online
        await _broadcast_ch_presence(s['id'])

        async for raw in websocket:
            try:
                data = json.loads(raw)
                mt = data.get('type')

                if mt == 'presence':
                    # Window visibility changed (visible/focused vs hidden/minimized)
                    new_hidden = bool(data.get('hidden'))
                    prev_status = get_user_status(s['id'])
                    if token in ws_clients:
                        ws_clients[token]['hidden'] = new_hidden
                    new_status = get_user_status(s['id'])
                    # Broadcast only when the aggregated status actually changed
                    if new_status != prev_status:
                        for tk, cl in list(ws_clients.items()):
                            if cl['user_id'] != s['id']:
                                try:
                                    await cl['ws'].send(json.dumps({'type':'contacts','contacts':build_contacts(cl['user_id'])}))
                                except: pass
                        await _broadcast_ch_presence(s['id'], new_status)
                    continue

                if mt == 'send':
                    to_id = data.get('to')
                    text = data.get('text', '').strip()
                    temp_id = data.get('temp_id', '')
                    if not to_id or not text: continue
                    chat_key = get_chat_key(s['id'], to_id)
                    sender = find_user(s['username'])
                    sender_display = sender.get('display_name', '') if sender else ''
                    msg = {'id': secrets.token_hex(8), 'from': s['id'],
                        'from_name': sender_display or s['username'],
                        'text': text, 'time': int(time.time()), 'read': False}
                    if data.get('reply_to'): msg['reply_to'] = data['reply_to']
                    if data.get('forwarded_from'): msg['forwarded_from'] = data['forwarded_from']
                    save_message(chat_key, msg)
                    await websocket.send(json.dumps({'type':'sent','msg':msg,'chat':chat_key,'temp_id':temp_id}))
                    recipient_online = False
                    for tk, cl in list(ws_clients.items()):
                        if cl['user_id'] == to_id:
                            recipient_online = True
                            try:
                                await cl['ws'].send(json.dumps({'type':'message','chat':chat_key,'msg':msg}))
                                c2 = build_contacts(to_id)
                                await cl['ws'].send(json.dumps({'type':'contacts','contacts':c2}))
                            except: pass
                    c1 = build_contacts(s['id'])
                    await websocket.send(json.dumps({'type':'contacts','contacts':c1}))
                    # Push notification if recipient offline OR away (all windows minimized)
                    recipient_status = get_user_status(to_id)
                    if recipient_status in ('offline', 'away') and HAS_PUSH:
                        print(f"[PUSH] Recipient {to_id} {recipient_status}, sending push")
                        threading.Thread(target=send_push, args=(to_id, msg['from_name'], text[:100], '/', msg['from']), daemon=True).start()
                    else:
                        print(f"[PUSH] Recipient {to_id} {recipient_status}, skip push")

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
                    to_id = data.get('to')
                    if ck:
                        mark_read(ck, s['id'])
                        # Notify sender that messages were read
                        if to_id:
                            for tk, cl in list(ws_clients.items()):
                                if cl['user_id'] == to_id:
                                    try: await cl['ws'].send(json.dumps({'type':'read_confirm','chat':ck}))
                                    except: pass

                elif mt == 'forward':
                    to_id = data.get('to')
                    from_chat = data.get('from_chat', '')
                    orig_msg_id = data.get('msg_id', '')
                    extra_text = data.get('extra_text', '').strip()
                    if to_id and from_chat and orig_msg_id:
                        # Find original message
                        orig_msg = None
                        f = MSG_DIR / f"{from_chat}.json"
                        if f.exists():
                            try:
                                msgs = json.loads(f.read_text())
                                orig_msg = next((m for m in msgs if m['id'] == orig_msg_id), None)
                            except: pass
                        if orig_msg:
                            chat_key = get_chat_key(s['id'], to_id)
                            sender = find_user(s['username'])
                            sender_display = sender.get('display_name', '') if sender else ''
                            fwd_from_name = orig_msg.get('from_name', '')
                            fwd_from_id = orig_msg.get('from', '')
                            msg = {'id': secrets.token_hex(8), 'from': s['id'],
                                'from_name': sender_display or s['username'],
                                'text': orig_msg.get('text', '') + ('\n\n' + extra_text if extra_text else ''),
                                'time': int(time.time()), 'read': False,
                                'forwarded_from': {'name': fwd_from_name, 'id': fwd_from_id}}
                            # Copy attachments reference
                            if orig_msg.get('attachments'):
                                msg['attachments'] = orig_msg['attachments']
                            save_message(chat_key, msg)
                            await websocket.send(json.dumps({'type':'sent','msg':msg,'chat':chat_key}))
                            await async_broadcast_message(msg, chat_key, s['id'])
                            for token2, cl2 in list(ws_clients.items()):
                                try:
                                    await cl2['ws'].send(json.dumps({'type':'contacts','contacts':build_contacts(cl2['user_id'])}))
                                except: pass

                elif mt == 'history':
                    to_id = data.get('to')
                    offset = data.get('offset', 0)
                    if to_id:
                        ck = get_chat_key(s['id'], to_id)
                        msgs = get_messages(ck, offset)
                        pin = get_pin(ck)
                        await websocket.send(json.dumps({'type':'history','chat':ck,'messages':msgs,'offset':offset,'pinned':pin}))

                elif mt == 'contacts':
                    contacts = build_contacts(s['id'])
                    await websocket.send(json.dumps({'type':'contacts','contacts':contacts}))

                elif mt == 'react':
                    chat_key = data.get('chat', '')
                    msg_id = data.get('msg_id', '')
                    emoji = data.get('emoji', '')
                    if chat_key and msg_id and emoji:
                        parts = chat_key.split('_')
                        if s['id'] in parts:
                            f = MSG_DIR / f"{chat_key}.json"
                            if f.exists():
                                try:
                                    msgs = json.loads(f.read_text())
                                    updated_reactions = {}
                                    for m in msgs:
                                        if m['id'] == msg_id:
                                            if 'reactions' not in m: m['reactions'] = {}
                                            if s['id'] in m['reactions'] and m['reactions'][s['id']] == emoji:
                                                del m['reactions'][s['id']]
                                            else:
                                                m['reactions'][s['id']] = emoji
                                            updated_reactions = m.get('reactions', {})
                                            break
                                    f.write_text(json.dumps(msgs, ensure_ascii=False))
                                    await websocket.send(json.dumps({'type':'reaction','chat':chat_key,'msg_id':msg_id,'reactions':updated_reactions}))
                                    other_ids = [p for p in parts if p != s['id']]
                                    for oid in other_ids:
                                        for tk, cl in list(ws_clients.items()):
                                            if cl['user_id'] == oid:
                                                try: await cl['ws'].send(json.dumps({'type':'reaction','chat':chat_key,'msg_id':msg_id,'reactions':updated_reactions}))
                                                except: pass
                                except: pass

                elif mt == 'edit':
                    chat_key = data.get('chat', '')
                    msg_id = data.get('msg_id', '')
                    new_text = data.get('text', '').strip()
                    if chat_key and msg_id and new_text:
                        parts = chat_key.split('_')
                        if s['id'] in parts:
                            f = MSG_DIR / f"{chat_key}.json"
                            if f.exists():
                                try:
                                    msgs = json.loads(f.read_text())
                                    ok = False
                                    for m in msgs:
                                        if m['id'] == msg_id and m['from'] == s['id']:
                                            if time.time() - m['time'] <= 172800:
                                                m['text'] = new_text; m['edited'] = True; ok = True
                                            break
                                    if ok:
                                        f.write_text(json.dumps(msgs, ensure_ascii=False))
                                        resp = {'type':'edited','chat':chat_key,'msg_id':msg_id,'text':new_text}
                                        await websocket.send(json.dumps(resp))
                                        other_ids = [p for p in parts if p != s['id']]
                                        for oid in other_ids:
                                            for tk, cl in list(ws_clients.items()):
                                                if cl['user_id'] == oid:
                                                    try: await cl['ws'].send(json.dumps(resp))
                                                    except: pass
                                    else:
                                        await websocket.send(json.dumps({'type':'error','msg':'Нельзя редактировать'}))
                                except: pass

                elif mt == 'delete':
                    chat_key = data.get('chat', '')
                    msg_id = data.get('msg_id', '')
                    if chat_key and msg_id:
                        parts = chat_key.split('_')
                        if s['id'] in parts:
                            f = MSG_DIR / f"{chat_key}.json"
                            if f.exists():
                                try:
                                    msgs = json.loads(f.read_text())
                                    mo = next((m for m in msgs if m['id'] == msg_id), None)
                                    if mo and mo['from'] == s['id'] and time.time() - mo['time'] <= 172800:
                                        msgs = [m for m in msgs if m['id'] != msg_id]
                                        f.write_text(json.dumps(msgs, ensure_ascii=False))
                                        resp = {'type':'deleted','chat':chat_key,'msg_id':msg_id}
                                        await websocket.send(json.dumps(resp))
                                        other_ids = [p for p in parts if p != s['id']]
                                        for oid in other_ids:
                                            for tk, cl in list(ws_clients.items()):
                                                if cl['user_id'] == oid:
                                                    try: await cl['ws'].send(json.dumps(resp))
                                                    except: pass
                                        # Refresh contacts for both
                                        c1 = build_contacts(s['id'])
                                        await websocket.send(json.dumps({'type':'contacts','contacts':c1}))
                                        for oid in other_ids:
                                            for tk, cl in list(ws_clients.items()):
                                                if cl['user_id'] == oid:
                                                    try:
                                                        c2 = build_contacts(oid)
                                                        await cl['ws'].send(json.dumps({'type':'contacts','contacts':c2}))
                                                    except: pass
                                except: pass

                elif mt == 'clear_chat':
                    chat_key = data.get('chat', '')
                    if chat_key and s['id'] in chat_key.split('_'):
                        f = MSG_DIR / f"{chat_key}.json"
                        if f.exists(): f.write_text('[]')
                        await websocket.send(json.dumps({'type':'chat_cleared','chat':chat_key}))

                elif mt == 'pin':
                    chat_key = data.get('chat', '')
                    msg_id = data.get('msg_id', '')
                    pin_text = data.get('text', '')
                    if chat_key and msg_id and s['id'] in chat_key.split('_'):
                        set_pin(chat_key, msg_id, pin_text)
                        resp = {'type':'pinned','chat':chat_key,'msg_id':msg_id,'text':pin_text}
                        parts = chat_key.split('_')
                        for tk, cl in list(ws_clients.items()):
                            if cl['user_id'] in parts:
                                try: await cl['ws'].send(json.dumps(resp))
                                except: pass

                elif mt == 'unpin':
                    chat_key = data.get('chat', '')
                    if chat_key and s['id'] in chat_key.split('_'):
                        remove_pin(chat_key)
                        resp = {'type':'unpinned','chat':chat_key}
                        parts = chat_key.split('_')
                        for tk, cl in list(ws_clients.items()):
                            if cl['user_id'] in parts:
                                try: await cl['ws'].send(json.dumps(resp))
                                except: pass

                elif mt == 'pin_contact':
                    contact_id = data.get('contact_id', '')
                    if contact_id:
                        prefs = load_user_prefs(s['id'])
                        if contact_id not in prefs['pinned']:
                            prefs['pinned'].append(contact_id)
                            save_user_prefs(s['id'], prefs)
                        await websocket.send(json.dumps({'type':'contacts','contacts':build_contacts(s['id'])}))

                elif mt == 'unpin_contact':
                    contact_id = data.get('contact_id', '')
                    if contact_id:
                        prefs = load_user_prefs(s['id'])
                        prefs['pinned'] = [x for x in prefs['pinned'] if x != contact_id]
                        save_user_prefs(s['id'], prefs)
                        await websocket.send(json.dumps({'type':'contacts','contacts':build_contacts(s['id'])}))

                elif mt == 'mute_contact':
                    contact_id = data.get('contact_id', '')
                    if contact_id:
                        prefs = load_user_prefs(s['id'])
                        if contact_id not in prefs.get('muted', []):
                            if 'muted' not in prefs: prefs['muted'] = []
                            prefs['muted'].append(contact_id)
                            save_user_prefs(s['id'], prefs)
                        await websocket.send(json.dumps({'type':'contacts','contacts':build_contacts(s['id'])}))
                        await websocket.send(json.dumps({'type':'muted_list','muted':prefs['muted']}))

                elif mt == 'unmute_contact':
                    contact_id = data.get('contact_id', '')
                    if contact_id:
                        prefs = load_user_prefs(s['id'])
                        prefs['muted'] = [x for x in prefs.get('muted', []) if x != contact_id]
                        save_user_prefs(s['id'], prefs)
                        await websocket.send(json.dumps({'type':'contacts','contacts':build_contacts(s['id'])}))
                        await websocket.send(json.dumps({'type':'muted_list','muted':prefs['muted']}))

                elif mt == 'set_interval':
                    if s['role'] in ('arcana', 'immortal'):
                        interval = int(data.get('interval', 30))
                        if interval in (15, 30, 45, 60):
                            with _settings_lock:
                                st = load_settings()
                                st['poll_interval'] = interval
                                save_settings(st)
                            ws_push_settings()

                elif mt == 'set_pref':
                    key = data.get('key', '')
                    val = data.get('value', '')
                    if key and key in ('online_display',):
                        prefs = load_user_prefs(s['id'])
                        prefs[key] = val
                        save_user_prefs(s['id'], prefs)
                        await websocket.send(json.dumps({'type':'pref_saved','key':key,'value':val}))

                elif mt == 'get_prefs':
                    prefs = load_user_prefs(s['id'])
                    await websocket.send(json.dumps({'type':'prefs','data':prefs}))

                elif mt == 'ch_send':
                    ch_id = data.get('channel_id', '')
                    sp_id = data.get('space_id', '')
                    text = data.get('text', '').strip()
                    if not ch_id or not text: continue
                    # Build message
                    user = find_user(s['username'])
                    msg = {
                        'id': secrets.token_hex(8),
                        'from': s['id'],
                        'from_name': user.get('display_name') or s['username'] if user else s['username'],
                        'role': s['role'],
                        'avatar': get_avatar_b64(s['id']),
                        'text': text,
                        'time': time.time(),
                        'channel_id': ch_id,
                        'space_id': sp_id
                    }
                    if data.get('reply_to'):
                        msg['reply_to'] = data['reply_to']
                        msg['reply_name'] = data.get('reply_name', '')
                        msg['reply_text'] = data.get('reply_text', '')
                    # @mentions → push notifications
                    import re as _re
                    mentioned = set(_re.findall(r'@(\w+)', text))
                    if 'all' in mentioned:
                        ch_mod2 = _loaded_modules.get('channels_api')
                        if ch_mod2:
                            for m2 in ch_mod2.load_members(sp_id):
                                if m2['user_id'] != s['id']:
                                    try: send_push(m2['user_id'], msg['from_name'], '@all: '+text[:80], s['id'])
                                    except: pass
                    elif mentioned:
                        all_users = load_users()
                        for uname in mentioned:
                            u = next((u for u in all_users if u['username'] == uname), None)
                            if u and u['id'] != s['id']:
                                try: send_push(u['id'], msg['from_name'], '@'+uname+': '+text[:80], s['id'])
                                except: pass
                    # Save
                    ch_mod = _loaded_modules.get('channels_api')
                    if ch_mod:
                        ch_mod.save_message(ch_id, msg)
                        # Broadcast to all members of the space who are online
                        members = ch_mod.load_members(sp_id)
                        member_ids = set(m['user_id'] for m in members)
                        for tk, cl in list(ws_clients.items()):
                            if cl['user_id'] in member_ids:
                                try:
                                    await cl['ws'].send(json.dumps({'type':'ch_message','channel_id':ch_id,'space_id':sp_id,'msg':msg}))
                                except: pass

                elif mt == 'ch_typing':
                    ch_id = data.get('channel_id', '')
                    sp_id = data.get('space_id', '')
                    if not ch_id: continue
                    ch_mod = _loaded_modules.get('channels_api')
                    if ch_mod:
                        members = ch_mod.load_members(sp_id)
                        member_ids = set(m['user_id'] for m in members)
                        user = find_user(s['username'])
                        uname = user.get('display_name') or s['username'] if user else s['username']
                        for tk, cl in list(ws_clients.items()):
                            if cl['user_id'] in member_ids and cl['user_id'] != s['id']:
                                try:
                                    await cl['ws'].send(json.dumps({'type':'ch_typing','channel_id':ch_id,'space_id':sp_id,'user_id':s['id'],'username':uname}))
                                except: pass

                elif mt == 'ch_react':
                    ch_id = data.get('channel_id', '')
                    sp_id = data.get('space_id', '')
                    msg_id = data.get('msg_id', '')
                    emoji = data.get('emoji', '')
                    if ch_id and msg_id and emoji:
                        ch_mod = _loaded_modules.get('channels_api')
                        if ch_mod:
                            path = ch_mod.DATA_DIR / f'chan_{ch_id}.json'
                            msgs = ch_mod._load(path, [])
                            for m in msgs:
                                if m['id'] == msg_id:
                                    if 'reactions' not in m: m['reactions'] = {}
                                    if emoji not in m['reactions']: m['reactions'][emoji] = []
                                    if s['id'] in m['reactions'][emoji]:
                                        m['reactions'][emoji].remove(s['id'])
                                        if not m['reactions'][emoji]: del m['reactions'][emoji]
                                    else:
                                        m['reactions'][emoji].append(s['id'])
                                    break
                            ch_mod._save(path, msgs)
                            msg_obj = next((m for m in msgs if m['id'] == msg_id), None)
                            reactions = msg_obj.get('reactions', {}) if msg_obj else {}
                            members = ch_mod.load_members(sp_id)
                            member_ids = set(m2['user_id'] for m2 in members)
                            for tk, cl in list(ws_clients.items()):
                                if cl['user_id'] in member_ids:
                                    try: await cl['ws'].send(json.dumps({'type':'ch_reacted','channel_id':ch_id,'msg_id':msg_id,'reactions':reactions}))
                                    except: pass

                elif mt == 'ch_edit':
                    ch_id = data.get('channel_id', '')
                    sp_id = data.get('space_id', '')
                    msg_id = data.get('msg_id', '')
                    text = data.get('text', '').strip()
                    if ch_id and msg_id and text:
                        ch_mod = _loaded_modules.get('channels_api')
                        if ch_mod:
                            from pathlib import Path as _P
                            path = ch_mod.DATA_DIR / f'chan_{ch_id}.json'
                            msgs = ch_mod._load(path, [])
                            for m in msgs:
                                if m['id'] == msg_id and (m.get('from') == s['id'] or s['role'] in ('arcana','immortal','legendary')):
                                    m['text'] = text
                                    m['edited'] = True
                                    break
                            ch_mod._save(path, msgs)
                            members = ch_mod.load_members(sp_id)
                            member_ids = set(m2['user_id'] for m2 in members)
                            for tk, cl in list(ws_clients.items()):
                                if cl['user_id'] in member_ids:
                                    try: await cl['ws'].send(json.dumps({'type':'ch_edited','channel_id':ch_id,'msg_id':msg_id,'text':text}))
                                    except: pass

                elif mt == 'ch_delete':
                    ch_id = data.get('channel_id', '')
                    sp_id = data.get('space_id', '')
                    msg_id = data.get('msg_id', '')
                    if ch_id and msg_id:
                        ch_mod = _loaded_modules.get('channels_api')
                        if ch_mod:
                            path = ch_mod.DATA_DIR / f'chan_{ch_id}.json'
                            msgs = ch_mod._load(path, [])
                            msgs = [m for m in msgs if not (m['id'] == msg_id and (m.get('from') == s['id'] or s['role'] in ('arcana','immortal','legendary')))]
                            ch_mod._save(path, msgs)
                            members = ch_mod.load_members(sp_id)
                            member_ids = set(m2['user_id'] for m2 in members)
                            for tk, cl in list(ws_clients.items()):
                                if cl['user_id'] in member_ids:
                                    try: await cl['ws'].send(json.dumps({'type':'ch_deleted','channel_id':ch_id,'msg_id':msg_id}))
                                    except: pass

                elif mt == 'ch_pin':
                    ch_id = data.get('channel_id', '')
                    sp_id = data.get('space_id', '')
                    msg_id = data.get('msg_id', '')
                    if ch_id and msg_id and s['role'] in ('arcana','immortal','legendary'):
                        ch_mod = _loaded_modules.get('channels_api')
                        if ch_mod:
                            msgs = ch_mod._load(ch_mod.DATA_DIR / f'chan_{ch_id}.json', [])
                            msg = next((m for m in msgs if m['id'] == msg_id), None)
                            if msg:
                                pins = ch_mod.load_pins(ch_id)
                                if not any(p['id'] == msg_id for p in pins):
                                    pins.append({'id':msg_id,'text':msg.get('text',''),'from_name':msg.get('from_name',''),'time':msg.get('time',0),'pinned_by':s['username']})
                                    ch_mod.save_pins(ch_id, pins)
                                members = ch_mod.load_members(sp_id)
                                for tk, cl in list(ws_clients.items()):
                                    if cl['user_id'] in set(m2['user_id'] for m2 in members):
                                        try: await cl['ws'].send(json.dumps({'type':'ch_pinned','channel_id':ch_id,'pins':ch_mod.load_pins(ch_id)}))
                                        except: pass

                elif mt == 'ch_unpin':
                    ch_id = data.get('channel_id', '')
                    sp_id = data.get('space_id', '')
                    msg_id = data.get('msg_id', '')
                    if ch_id and msg_id and s['role'] in ('arcana','immortal','legendary'):
                        ch_mod = _loaded_modules.get('channels_api')
                        if ch_mod:
                            pins = ch_mod.load_pins(ch_id)
                            pins = [p for p in pins if p['id'] != msg_id]
                            ch_mod.save_pins(ch_id, pins)
                            members = ch_mod.load_members(sp_id)
                            for tk, cl in list(ws_clients.items()):
                                if cl['user_id'] in set(m2['user_id'] for m2 in members):
                                    try: await cl['ws'].send(json.dumps({'type':'ch_pinned','channel_id':ch_id,'pins':pins}))
                                    except: pass

                elif mt == 'ch_kick':
                    sp_id = data.get('space_id', '')
                    uid = data.get('user_id', '')
                    # Anyone can leave (kick self), admins can kick others (not arcana)
                    kick_self = uid == s['id']
                    target_user = find_user_by_id(uid) if not kick_self else None
                    target_arcana = target_user and target_user.get('role') == 'arcana' if target_user else False
                    can_kick = kick_self or (s['role'] in ('arcana','immortal','legendary') and not target_arcana)
                    if sp_id and uid and can_kick:
                        ch_mod = _loaded_modules.get('channels_api')
                        if ch_mod:
                            members = ch_mod.load_members(sp_id)
                            members = [m for m in members if m['user_id'] != uid]
                            ch_mod.save_members(sp_id, members)
                            for tk, cl in list(ws_clients.items()):
                                if cl['user_id'] in set(m2['user_id'] for m2 in members) or cl['user_id'] == uid:
                                    try: await cl['ws'].send(json.dumps({'type':'ch_update'}))
                                    except: pass

                elif mt == 'ch_update':
                    # Broadcast space/channel updates to all connected users
                    for tk, cl in list(ws_clients.items()):
                        if cl['ws'] != websocket:
                            try: await cl['ws'].send(json.dumps({'type':'ch_update'}))
                            except: pass

                elif mt == 'voice_join':
                    room_id = data.get('room_id','')
                    space_id = data.get('space_id','')
                    if room_id:
                        av = get_avatar_b64(s['id'])
                        with voice_rooms_lock:
                            if room_id not in voice_rooms:
                                voice_rooms[room_id] = {'space_id':space_id,'speakers':[],'listeners':[]}
                            room = voice_rooms[room_id]
                            room['speakers'] = [p for p in room['speakers'] if p['user_id'] != s['id']]
                            room['listeners'] = [p for p in room['listeners'] if p['user_id'] != s['id']]
                            p = {'user_id':s['id'],'username':s['username'],'avatar':av,'muted':True,'video_muted':True,'raised_hand':False,'token':token}
                            if len(room['speakers']) < 6:
                                room['speakers'].append(p)
                                as_speaker = True
                            else:
                                room['listeners'].append(p)
                                as_speaker = False
                            snap = _voice_room_snapshot(room)
                        await websocket.send(json.dumps({'type':'voice_state','room_id':room_id,'room':snap,'you_are':'speaker' if as_speaker else 'listener'}))
                        await _voice_broadcast_room(room_id, json.dumps({'type':'voice_joined','room_id':room_id,'user_id':s['id'],'username':s['username'],'avatar':av,'as_speaker':as_speaker}), exclude_token=token)
                        await _voice_notify_space(space_id)

                elif mt == 'voice_leave':
                    room_id = data.get('room_id','')
                    if room_id: await _voice_leave(room_id, s['id'], token)

                elif mt == 'voice_offer':
                    await _voice_forward(data.get('room_id',''), data.get('to_user_id',''),
                        {'type':'voice_offer','room_id':data.get('room_id'),'from_user_id':s['id'],'sdp':data.get('sdp')})

                elif mt == 'voice_answer':
                    await _voice_forward(data.get('room_id',''), data.get('to_user_id',''),
                        {'type':'voice_answer','room_id':data.get('room_id'),'from_user_id':s['id'],'sdp':data.get('sdp')})

                elif mt == 'voice_ice':
                    await _voice_forward(data.get('room_id',''), data.get('to_user_id',''),
                        {'type':'voice_ice','room_id':data.get('room_id'),'from_user_id':s['id'],'candidate':data.get('candidate')})

                elif mt == 'voice_mute':
                    room_id = data.get('room_id','')
                    muted = bool(data.get('muted',False))
                    vmuted = bool(data.get('video_muted',False))
                    with voice_rooms_lock:
                        if room_id in voice_rooms:
                            for p in voice_rooms[room_id]['speakers']:
                                if p['user_id'] == s['id']:
                                    p['muted'] = muted; p['video_muted'] = vmuted; break
                    await _voice_broadcast_room(room_id, json.dumps({'type':'voice_mute_update','room_id':room_id,'user_id':s['id'],'muted':muted,'video_muted':vmuted}))

                elif mt == 'voice_raise_hand':
                    room_id = data.get('room_id','')
                    raised = bool(data.get('raised', True))
                    with voice_rooms_lock:
                        if room_id in voice_rooms:
                            for p in voice_rooms[room_id]['listeners']:
                                if p['user_id'] == s['id']:
                                    p['raised_hand'] = raised; break
                    await _voice_broadcast_room(room_id, json.dumps({'type':'voice_hand_raised','room_id':room_id,'user_id':s['id'],'raised':raised,'username':s['username']}))

                elif mt == 'voice_speaking':
                    room_id = data.get('room_id','')
                    speaking = bool(data.get('speaking', False))
                    if room_id:
                        await _voice_broadcast_room(room_id, json.dumps({'type':'voice_speaking','room_id':room_id,'user_id':s['id'],'speaking':speaking}), exclude_token=token)

                elif mt == 'voice_allow_speak':
                    room_id = data.get('room_id','')
                    target_uid = data.get('user_id','')
                    with voice_rooms_lock:
                        if room_id in voice_rooms:
                            room = voice_rooms[room_id]
                            if len(room['speakers']) < 6:
                                listener = next((p for p in room['listeners'] if p['user_id'] == target_uid), None)
                                if listener:
                                    room['listeners'] = [p for p in room['listeners'] if p['user_id'] != target_uid]
                                    listener['raised_hand'] = False; listener['muted'] = False; listener['video_muted'] = True
                                    room['speakers'].append(listener)
                    await _voice_broadcast_room(room_id, json.dumps({'type':'voice_promoted','room_id':room_id,'user_id':target_uid}))

                elif mt == 'voice_invite':
                    room_id = data.get('room_id','')
                    to_uid = data.get('to_user_id','')
                    if room_id and to_uid:
                        space_id = ''
                        with voice_rooms_lock:
                            if room_id in voice_rooms:
                                space_id = voice_rooms[room_id].get('space_id','')
                        target = next((c for c in ws_clients.values() if c['user_id'] == to_uid), None)
                        if target:
                            await target['ws'].send(json.dumps({'type':'voice_invite_notify','room_id':room_id,'space_id':space_id,'from_user_id':s['id'],'from_username':s['username']}))

                elif mt == 'voice_kick':
                    room_id = data.get('room_id','')
                    target_uid = data.get('target_user_id','')
                    if room_id and target_uid and s.get('role') in ['arcana','immortal','legendary']:
                        target_token = None
                        with voice_rooms_lock:
                            if room_id in voice_rooms:
                                all_p = voice_rooms[room_id]['speakers'] + voice_rooms[room_id]['listeners']
                                found = next((p for p in all_p if p['user_id'] == target_uid), None)
                                if found: target_token = found.get('token')
                        if target_token:
                            target_ws = ws_clients.get(target_token, {}).get('ws')
                            if target_ws:
                                try: await target_ws.send(json.dumps({'type':'voice_kicked','room_id':room_id}))
                                except: pass
                            await _voice_leave(room_id, target_uid, target_token)

                elif mt == 'servers_request':
                    srv_mod = _loaded_modules.get('servers_api')
                    if srv_mod and hasattr(srv_mod, 'cached_data') and hasattr(srv_mod, 'data_lock'):
                        with srv_mod.data_lock:
                            await websocket.send(json.dumps({'type':'servers_update','data':list(srv_mod.cached_data)}))

            except json.JSONDecodeError: pass
            except Exception as e:
                print(f"  [WS] Handler error (mt={mt if 'mt' in dir() else '?'}): {e}", flush=True)
    except Exception as e:
        if 'ConnectionClosed' not in type(e).__name__:
            print(f"  [WS] Connection error: {e}", flush=True)
    finally:
        user_id = None
        v_rooms = []
        if token and token in ws_clients:
            user_id = ws_clients[token]['user_id']
            del ws_clients[token]
        if user_id:
            with voice_rooms_lock:
                for rid, room in list(voice_rooms.items()):
                    if any(p['user_id'] == user_id for p in room['speakers'] + room['listeners']):
                        v_rooms.append((rid, room['space_id']))
            for rid, sid in v_rooms:
                await _voice_leave(rid, user_id, token)
            _ws_refresh_all_contacts()
            _ws_ch_presence_offline(user_id)

def start_ws_server():
    global ws_loop
    if not HAS_WS:
        print("  [WS] Skipped — websockets not installed"); return
    def _run():
        global ws_loop
        ws_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(ws_loop)
        async def _serve():
            # Start queue processor for cross-thread messaging
            asyncio.ensure_future(_ws_queue_processor())
            server = await ws_serve(handle_ws, "0.0.0.0", WS_PORT, ping_interval=20, ping_timeout=10)
            print(f"  [WS] Unified on ws://0.0.0.0:{WS_PORT}")
            await server.serve_forever()
        ws_loop.run_until_complete(_serve())
    threading.Thread(target=_run, daemon=True).start()

# ============================================================
# HTTP SERVER
# ============================================================
MIME = {'.html':'text/html','.css':'text/css','.js':'application/javascript',
        '.json':'application/json','.svg':'image/svg+xml','.png':'image/png',
        '.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg',
        '.pdf':'application/pdf','.zip':'application/zip',
        '.ogg':'audio/ogg','.mp3':'audio/mpeg','.m4a':'audio/mp4',
        '.mp4':'video/mp4','.webm':'video/webm'}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path

        if path == '/api/auth/status':
            users = load_users()
            s = get_session(self)
            resp = {'setup_required': len(users) == 0}
            if s: resp.update({'username': s['username'], 'role': s['role']})
            return self._json(200, resp)

        if path == '/api/auth/sessions':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            current_token = get_token_from_handler(self)
            result = []
            with auth_lock:
                for tk, sess in list(sessions.items()):
                    if sess.get('id') == s['id']:
                        result.append({
                            'hint': tk[-6:],
                            'device_info': sess.get('device_info', {}),
                            'created_at': sess.get('created_at', 0),
                            'last_seen': sess.get('last_seen', 0),
                            'pin_enabled': sess.get('pin_enabled', False),
                            'is_current': tk == current_token
                        })
            return self._json(200, result)

        # Version
        if path == '/api/version':
            vf = CORE_DIR / 'version.json'
            if vf.exists():
                try: return self._json(200, json.loads(vf.read_text()))
                except: pass
            return self._json(200, {'version': '?'})

        if path.startswith('/locale/'):
            return self._serve_file(LOCALE_DIR / path.split('/locale/')[1], base_dir=LOCALE_DIR)

        if path.startswith('/modules/'):
            parts = path.split('/', 3)
            if len(parts) >= 4: return self._serve_file(MODULES_DIR / parts[2] / parts[3], base_dir=MODULES_DIR)

        if path == '/api/modules':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            mods = discover_modules()
            if s['role'] != 'arcana':
                user = find_user(s['username'])
                user_modules = user.get('modules', ['messenger']) if user else ['messenger']
                mods = [m for m in mods if m['id'] in user_modules or m.get('min_role') == 'arcana']
            return self._json(200, mods)

        # All modules (unfiltered, for admin)
        if path == '/api/modules/all':
            s = require_role(self, 'arcana')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            return self._json(200, discover_modules())

        if path == '/api/users':
            s = require_role(self, 'arcana')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            users = load_users()
            safe = [{'id':u['id'],'username':u['username'],'display_name':u.get('display_name',''),'role':u['role'],'modules':u.get('modules',['messenger']),'created':u['created'],'avatar':get_avatar_b64(u['id'])} for u in users]
            return self._json(200, safe)

        if path == '/api/ws-port':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            return self._json(200, {'port': WS_PORT, 'available': HAS_WS})

        # Push: get VAPID public key
        if path == '/api/push/key':
            key = get_vapid_public_key()
            return self._json(200, {'key': key, 'available': HAS_PUSH and key is not None})

        # Default modules setting (god only)
        if path == '/api/settings/default-modules':
            s = require_role(self, 'arcana')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            st = load_settings()
            return self._json(200, {'modules': st.get('default_modules', ['messenger'])})

        # Push: test (god only)
        if path == '/api/push/test':
            s = require_role(self, 'arcana')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            send_push(s['id'], 'Horseoff', 'Тестовое уведомление')
            return self._json(200, {'status': 'ok', 'subs': len(get_push_subs(s['id']))})

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

        # Serve attachment files (requires valid session)
        if path.startswith('/api/msg/file/'):
            tok = None
            auth_hdr = self.headers.get('Authorization', '')
            if auth_hdr.startswith('Bearer '):
                tok = auth_hdr[7:]
            if not tok:
                tok = parse_qs(urlparse(self.path).query).get('token', [None])[0]
            if not tok or not get_session_by_token(tok):
                return self._json(401, {'error': 'Unauthorized'})
            parts = path.split('/api/msg/file/')[1].split('/')
            att_id = parts[0]
            thumb = len(parts) > 1 and parts[1] == 'thumb'
            fp = get_attachment_path(att_id, thumb)
            if fp and fp.exists():
                return self._serve_file(fp)
            return self._json(404, {'error': 'Not found'})

        # List chat attachments for side panel
        if path.startswith('/api/msg/attachments/'):
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            full_url = urlparse(self.path)
            chat_key = full_url.path.split('/api/msg/attachments/')[1]
            # Parse query params
            att_type = 'image'
            if full_url.query:
                for param in full_url.query.split('&'):
                    if param.startswith('type='):
                        att_type = param.split('=')[1]
            if s['id'] not in chat_key.split('_'): return self._json(403, {'error': 'Нет доступа'})
            return self._json(200, get_chat_attachments(chat_key, att_type))

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

        # SVG icons
        if path.startswith('/svg/'):
            return self._serve_file(ROOT_DIR / 'svg' / path.split('/svg/')[1], base_dir=ROOT_DIR / 'svg')

        # PWA files
        if path.startswith('/pwa/'):
            # Public avatar for push notifications (only .jpg, only hex IDs)
            if path.startswith('/pwa/avatar/'):
                uid = path.split('/pwa/avatar/')[1].rstrip('/')
                if not uid or not all(c in '0123456789abcdef' for c in uid):
                    return self._json(404, {'error': 'Not found'})
                avatar_path = AVATARS_DIR / f"{uid}.jpg"
                if not avatar_path.exists():
                    return self._json(404, {'error': 'Not found'})
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Cache-Control', 'public, max-age=3600')
                self.end_headers()
                self.wfile.write(avatar_path.read_bytes())
                return
            return self._serve_file(ROOT_DIR / 'pwa' / path.split('/pwa/')[1], base_dir=ROOT_DIR / 'pwa')
        if path == '/sw.js':
            return self._serve_file(ROOT_DIR / 'pwa' / 'sw.js', base_dir=ROOT_DIR / 'pwa')

        if path.startswith('/stickers/'):
            fname = path.split('/stickers/')[1]
            if fname and '/' not in fname and '..' not in fname:
                return self._serve_file(ROOT_DIR / 'stickers' / fname, base_dir=ROOT_DIR / 'stickers')
        if path in ('/', '/index.html'): return self._serve_file(CORE_DIR / 'shell.html', base_dir=CORE_DIR)
        if path.startswith('/core/'): return self._serve_file(CORE_DIR / path.split('/core/')[1], base_dir=CORE_DIR)
        self._json(404, {'error': 'Not found'})

    def do_POST(self):
        path = urlparse(self.path).path
        client_ip = self.client_address[0]

        # Channel file upload
        if path == '/api/ch/upload':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            fields, files = parse_multipart(self)
            channel_id = fields.get('channel_id', '')
            space_id = fields.get('space_id', '')
            text = fields.get('text', '').strip()
            reply_to = fields.get('reply_to', '')
            reply_name = fields.get('reply_name', '')
            reply_text = fields.get('reply_text', '')
            if not channel_id or not space_id: return self._json(400, {'error': 'Missing channel/space'})
            if not files and not text: return self._json(400, {'error': 'Empty'})

            attachments = []
            for f in files[:7]:
                att_id = secrets.token_hex(8)
                fname = f['name']
                ext = Path(fname).suffix.lower()
                is_image = ext in IMAGE_EXTS
                is_audio = ext in AUDIO_EXTS or (ext == '.webm' and fname.startswith('voice_'))
                is_video = ext in VIDEO_EXTS and not is_audio

                if is_audio:
                    duration = process_audio(f['data'], att_id)
                    if duration is None or duration == 0:
                        import re as _re
                        m = _re.search(r'_(\d+)s\.', fname)
                        if m: duration = int(m.group(1))
                    if duration is None: duration = 0
                    attachments.append({'id':att_id,'type':'audio','name':fname,'size':len(f['data']),'duration':duration})
                elif is_video:
                    result = process_video(f['data'], att_id)
                    if result:
                        dur, vw, vh = result
                        attachments.append({'id':att_id,'type':'video','name':fname,'size':len(f['data']),'duration':dur,'w':vw,'h':vh})
                elif is_image:
                    dims = process_image(f['data'], att_id)
                    if dims: attachments.append({'id':att_id,'type':'image','name':fname,'size':len(f['data']),'w':dims[0],'h':dims[1]})
                else:
                    save_attachment(f['data'], fname, att_id)
                    attachments.append({'id':att_id,'type':'file','name':fname,'size':len(f['data'])})

            user = find_user(s['username'])
            msg = {
                'id': secrets.token_hex(8), 'from': s['id'],
                'from_name': user.get('display_name') or s['username'] if user else s['username'],
                'role': s['role'], 'avatar': get_avatar_b64(s['id']),
                'text': text, 'time': time.time(),
                'channel_id': channel_id, 'space_id': space_id,
                'attachments': attachments
            }
            if reply_to:
                msg['reply_to'] = reply_to
                msg['reply_name'] = reply_name
                msg['reply_text'] = reply_text

            ch_mod = _loaded_modules.get('channels_api')
            if ch_mod:
                ch_mod.save_message(channel_id, msg)
                members = ch_mod.load_members(space_id)
                member_ids = set(m2['user_id'] for m2 in members)
                for tk, cl in list(ws_clients.items()):
                    if cl['user_id'] in member_ids:
                        _ws_broadcast_to_user(cl['user_id'], {'type':'ch_message','channel_id':channel_id,'space_id':space_id,'msg':msg})
            return self._json(200, {'status':'ok','msg':msg})

        # Handle file upload (multipart) separately
        if path == '/api/msg/upload':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            fields, files = parse_multipart(self)
            to_id = fields.get('to', '')
            text = fields.get('text', '').strip()
            if not to_id: return self._json(400, {'error': 'Missing to'})
            if not files and not text: return self._json(400, {'error': 'Empty message'})

            attachments = []
            video_count = 0
            image_count = 0
            has_audio = False
            has_file = False
            for f in files[:7]:  # Max 7 items (6 photos + 1 video)
                if len(f['data']) > 50 * 1024 * 1024:  # 50MB for video
                    return self._json(400, {'error': 'Файл слишком большой (макс 50 МБ)'})
                att_id = secrets.token_hex(8)
                fname = f['name']
                ext = Path(fname).suffix.lower()
                is_image = ext in IMAGE_EXTS
                is_audio = ext in AUDIO_EXTS or (ext == '.webm' and fname.startswith('voice_'))
                is_video = ext in VIDEO_EXTS and not is_audio

                if is_audio:
                    if has_audio or image_count > 0 or video_count > 0 or has_file:
                        return self._json(400, {'error': 'Аудио отправляется отдельно'})
                    duration = process_audio(f['data'], att_id)
                    # Fallback: extract duration from voice filename (voice_xxx_NNs.ext)
                    if duration is None or duration == 0:
                        import re as _re
                        m = _re.search(r'_(\d+)s\.', fname)
                        if m: duration = int(m.group(1))
                    if duration is None: duration = 0
                    attachments.append({'id': att_id, 'type': 'audio', 'name': fname, 'size': len(f['data']), 'duration': duration})
                    has_audio = True
                elif is_video:
                    if has_audio or has_file or video_count >= 1:
                        return self._json(400, {'error': 'Максимум 1 видео'})
                    if len(f['data']) > 50 * 1024 * 1024:
                        return self._json(400, {'error': 'Видео макс 50 МБ'})
                    result = process_video(f['data'], att_id)
                    if not result: return self._json(500, {'error': 'Ошибка обработки видео'})
                    dur, vw, vh = result
                    attachments.append({'id': att_id, 'type': 'video', 'name': fname, 'size': len(f['data']), 'duration': dur, 'w': vw, 'h': vh})
                    video_count += 1
                elif is_image:
                    if has_audio or has_file:
                        return self._json(400, {'error': 'Фото нельзя с файлами или аудио'})
                    if image_count >= 6:
                        return self._json(400, {'error': 'Макс 6 фото'})
                    if len(f['data']) > MAX_FILE_SIZE:
                        return self._json(400, {'error': 'Фото макс 10 МБ'})
                    dims = process_image(f['data'], att_id)
                    if not dims: return self._json(500, {'error': 'Ошибка обработки фото'})
                    attachments.append({'id': att_id, 'type': 'image', 'name': fname, 'size': len(f['data']), 'w': dims[0], 'h': dims[1]})
                    image_count += 1
                else:
                    if has_audio or image_count > 0 or video_count > 0:
                        return self._json(400, {'error': 'Файлы отправляются отдельно'})
                    if len(f['data']) > MAX_FILE_SIZE:
                        return self._json(400, {'error': 'Файл макс 10 МБ'})
                    ok = save_attachment(f['data'], fname, att_id)
                    if not ok: return self._json(500, {'error': 'Ошибка сохранения'})
                    attachments.append({'id': att_id, 'type': 'file', 'name': fname, 'size': len(f['data'])})
                    has_file = True

            # Create message
            chat_key = get_chat_key(s['id'], to_id)
            sender = find_user(s['username'])
            sender_display = sender.get('display_name', '') if sender else ''
            msg = {'id': secrets.token_hex(8), 'from': s['id'],
                'from_name': sender_display or s['username'],
                'text': text, 'time': int(time.time()), 'read': False,
                'attachments': attachments}
            save_message(chat_key, msg)

            # Push via WS
            _ws_broadcast_to_user(to_id, {'type':'message','chat':chat_key,'msg':msg})
            _ws_broadcast_to_user(s['id'], {'type':'sent','msg':msg,'chat':chat_key})
            # Refresh contacts
            _ws_refresh_all_contacts()
            return self._json(200, {'status': 'ok', 'msg': msg, 'chat': chat_key})

        data = self._read_json()
        if data is None: return

        if path == '/api/auth/setup':
            if load_users(): return self._json(400, {'error': 'Владелец уже создан'})
            u, p = data.get('username','').strip(), data.get('password','')
            ok, msg = validate_username(u)
            if not ok: return self._json(400, {'error': msg})
            if len(p) < 6: return self._json(400, {'error': 'Пароль минимум 6 символов'})
            ok, msg = create_user(u, p, 'arcana')
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
                device_info = {k: data.get(k, '') for k in ('device_id', 'user_agent', 'platform')}
                return self._json(200, {'token': create_session(user, device_info)})
            record_failed_login(client_ip)
            remaining = get_remaining_block(client_ip)
            if remaining > 0:
                return self._json(429, {'error': f'Слишком много попыток. Подождите {remaining} сек.'})
            return self._json(401, {'error': 'Неверный логин или пароль'})

        if path == '/api/auth/logout':
            token = get_token_from_handler(self)
            if token:
                with auth_lock:
                    if token in sessions: del sessions[token]
                save_sessions()
            return self._json(200, {'status': 'ok'})

        if path == '/api/auth/revoke_session':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            hint = data.get('token_hint', data.get('hint', ''))
            with auth_lock:
                for tk in list(sessions.keys()):
                    if tk[-6:] == hint and sessions[tk].get('id') == s['id']:
                        del sessions[tk]; break
            save_sessions()
            return self._json(200, {'status': 'ok'})

        if path == '/api/auth/set_pin_flag':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            hint = data.get('token_hint', data.get('hint', ''))
            pin_enabled = bool(data.get('pin_enabled', False))
            with auth_lock:
                for tk in list(sessions.keys()):
                    if tk[-6:] == hint and sessions[tk].get('id') == s['id']:
                        sessions[tk]['pin_enabled'] = pin_enabled; break
            save_sessions()
            return self._json(200, {'status': 'ok'})

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

        if path == '/api/settings':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            if s['role'] not in ('arcana', 'immortal'): return self._json(403, {'error': 'Нет доступа'})
            interval = int(data.get('poll_interval', 30))
            if interval in (15, 30, 45, 60):
                with _settings_lock:
                    st = load_settings()
                    st['poll_interval'] = interval
                    save_settings(st)
                ws_push_settings()
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

        # Push: subscribe
        if path == '/api/push/subscribe':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            sub = data.get('subscription')
            if not sub or not sub.get('endpoint'): return self._json(400, {'error': 'Invalid subscription'})
            save_push_sub(s['id'], sub)
            return self._json(200, {'status': 'ok'})

        # Push: unsubscribe
        if path == '/api/push/unsubscribe':
            s = get_session(self)
            if not s: return self._json(401, {'error': 'Unauthorized'})
            ep = data.get('endpoint', '')
            if ep: remove_push_sub(s['id'], ep)
            return self._json(200, {'status': 'ok'})

        # Default modules setting (god only)
        if path == '/api/settings/default-modules':
            s = require_role(self, 'arcana')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            mods = data.get('modules', [])
            st = load_settings()
            st['default_modules'] = mods
            save_settings(st)
            return self._json(200, {'status': 'ok'})

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
            s = require_role(self, 'arcana')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            u, p, r = data.get('username','').strip(), data.get('password',''), data.get('role','user')
            ok, msg = validate_username(u)
            if not ok: return self._json(400, {'error': msg})
            if len(p) < 6: return self._json(400, {'error': 'Пароль минимум 6 символов'})
            valid_roles = ('common','uncommon','rare','mythical','legendary','immortal')
            if r not in valid_roles: return self._json(400, {'error': 'Недопустимая роль'})
            dn = data.get('display_name', '')
            ok, msg = create_user(u, p, r, dn)
            if ok:
                # Push updated contacts to all connected WS clients
                _ws_refresh_all_contacts()
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
            s = require_role(self, 'arcana')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            uid = path.split('/api/users/')[1]
            ok, msg = update_user(uid, data)
            if ok: _ws_refresh_all_contacts()
            if ok and 'modules' in data:
                # Push updated modules to affected user
                user = next((u for u in load_users() if u['id'] == uid), None)
                if user:
                    user_mods = user.get('modules', ['messenger'])
                    all_mods = discover_modules()
                    visible = [m for m in all_mods if m['id'] in user_mods and m.get('min_role') != 'arcana']
                    _ws_broadcast_to_user(uid, {'type': 'modules_update', 'modules': [m['id'] for m in visible]})
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
            s = require_role(self, 'arcana')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            delete_avatar(path.split('/api/avatar/')[1])
            return self._json(200, {'status': 'ok'})
        if path.startswith('/api/users/'):
            s = require_role(self, 'arcana')
            if not s: return self._json(401, {'error': 'Unauthorized'})
            uid = path.split('/api/users/')[1]
            if uid == s['id']: return self._json(400, {'error': 'Нельзя удалить себя'})
            ok = delete_user(uid)
            if ok: _ws_refresh_all_contacts()
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
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _serve_file(self, filepath, base_dir=None):
        filepath = Path(filepath).resolve()
        # Path traversal guard: ensure file stays within its base directory
        if base_dir is not None:
            base_dir = Path(base_dir).resolve()
            if not str(filepath).startswith(str(base_dir) + '/') and filepath != base_dir:
                return self._json(403, {'error': 'Forbidden'})
        if not filepath.exists(): return self._json(404, {'error': 'Not found'})
        ext = filepath.suffix
        mime = MIME.get(ext, 'application/octet-stream')
        size = filepath.stat().st_size
        # Range requests for streaming
        rh = self.headers.get('Range')
        if rh and rh.startswith('bytes='):
            try:
                r = rh[6:].split('-')
                start = int(r[0]) if r[0] else 0
                end = int(r[1]) if r[1] else size - 1
                end = min(end, size - 1)
                ln = end - start + 1
                self.send_response(206)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.send_header('Content-Length', str(ln))
                self.send_header('Accept-Ranges', 'bytes')
                self.end_headers()
                with open(filepath, 'rb') as f:
                    f.seek(start); self.wfile.write(f.read(ln))
                return
            except: pass
        self.send_response(200)
        self.send_header('Content-Type', f'{mime}; charset=utf-8' if ext in ('.html','.css','.js','.json') else mime)
        self.send_header('Content-Length', str(size))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
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
    print("  HORSEOFF v2.187")
    print("=" * 50)
    migrate_user_roles()
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
