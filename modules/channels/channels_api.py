"""Channels module API."""
import json, time, secrets, threading, base64
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / 'data' / 'channels'
DATA_DIR.mkdir(parents=True, exist_ok=True)

SPACES_FILE = DATA_DIR / 'spaces.json'
_lock = threading.Lock()
ADMIN_ROLES = ('arcana', 'immortal', 'legendary')

def _load(path, default=None):
    if default is None: default = []
    try:
        if path.exists(): return json.loads(path.read_text())
    except: pass
    return default

def _save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

def _json(handler, code, data):
    handler.send_response(code)
    handler.send_header('Content-Type', 'application/json')
    handler.end_headers()
    handler.wfile.write(json.dumps(data, ensure_ascii=False).encode())

def load_spaces(): return _load(SPACES_FILE, [])
def save_spaces(spaces):
    with _lock: _save(SPACES_FILE, spaces)

def load_channels(space_id): return _load(DATA_DIR / f'space_{space_id}_channels.json', [])
def save_channels(space_id, ch): _save(DATA_DIR / f'space_{space_id}_channels.json', ch)

def load_members(space_id): return _load(DATA_DIR / f'space_{space_id}_members.json', [])
def save_members(space_id, m): _save(DATA_DIR / f'space_{space_id}_members.json', m)

def load_messages(channel_id, limit=50):
    msgs = _load(DATA_DIR / f'chan_{channel_id}.json', [])
    return msgs[-limit:]

def save_message(channel_id, msg):
    path = DATA_DIR / f'chan_{channel_id}.json'
    msgs = _load(path, [])
    msgs.append(msg)
    if len(msgs) > 5000: msgs = msgs[-5000:]
    _save(path, msgs)

def get_space_photo_b64(space_id):
    p = DATA_DIR / f'space_{space_id}.jpg'
    if p.exists():
        return base64.b64encode(p.read_bytes()).decode()
    return None

def save_space_photo(space_id, data_b64):
    try:
        from PIL import Image
        import io
        raw = base64.b64decode(data_b64)
        img = Image.open(io.BytesIO(raw))
        img = img.convert('RGB')
        img.thumbnail((64, 64))
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=80)
        (DATA_DIR / f'space_{space_id}.jpg').write_bytes(buf.getvalue())
        return True
    except: return False

def delete_space_photo(space_id):
    p = DATA_DIR / f'space_{space_id}.jpg'
    p.unlink(missing_ok=True)

def load_read_state(user_id):
    return _load(DATA_DIR / f'read_{user_id}.json', {})

def save_read_state(user_id, state):
    _save(DATA_DIR / f'read_{user_id}.json', state)

def get_unread_count(channel_id, user_id):
    state = load_read_state(user_id)
    last_read = state.get(channel_id, 0)
    msgs = _load(DATA_DIR / f'chan_{channel_id}.json', [])
    return sum(1 for m in msgs if m.get('time', 0) > last_read and m.get('from') != user_id)

def mark_channel_read(channel_id, user_id):
    state = load_read_state(user_id)
    import time as _t
    state[channel_id] = _t.time()
    save_read_state(user_id, state)

def load_pins(channel_id):
    return _load(DATA_DIR / f'pins_{channel_id}.json', [])

def save_pins(channel_id, pins):
    _save(DATA_DIR / f'pins_{channel_id}.json', pins)

def is_member(space_id, user_id):
    return any(m['user_id'] == user_id for m in load_members(space_id))

def _get_param(handler, key):
    from urllib.parse import urlparse, parse_qs
    return parse_qs(urlparse(handler.path).query).get(key, [None])[0]

# ─── Route handlers ───

def handle_get(handler, session, path):
    # Strip query string for matching
    p = path.split('?')[0]

    # GET /api/mod/channels/init — all spaces + channels + voice rooms in one request
    if p.endswith('/init'):
        spaces = load_spaces()
        result_spaces = []
        channels_by_space = {}
        for sp in spaces:
            if not (is_member(sp['id'], session['id']) or sp['owner_id'] == session['id']):
                continue
            s = dict(sp)
            s['photo'] = get_space_photo_b64(sp['id'])
            result_spaces.append(s)
            chs = load_channels(sp['id'])
            for ch in chs:
                ch['unread'] = get_unread_count(ch['id'], session['id'])
            channels_by_space[sp['id']] = chs
        voice_rooms_data = {}
        try:
            from server import voice_rooms, voice_rooms_lock
            with voice_rooms_lock:
                for rid, room in voice_rooms.items():
                    voice_rooms_data[rid] = {
                        'total': len(room['speakers']) + len(room['listeners']),
                        'speaker_count': len(room['speakers']),
                        'speakers': [{'user_id': p['user_id'], 'username': p['username'], 'avatar': p.get('avatar')} for p in room['speakers']]
                    }
        except: pass
        return _json(handler, 200, {'spaces': result_spaces, 'channels': channels_by_space, 'voice_rooms': voice_rooms_data})

    # GET /api/mod/channels/spaces
    if p.endswith('/spaces'):
        spaces = load_spaces()
        result = []
        for sp in spaces:
            if is_member(sp['id'], session['id']) or sp['owner_id'] == session['id']:
                s = dict(sp)
                s['photo'] = get_space_photo_b64(sp['id'])
                result.append(s)
        return _json(handler, 200, result)

    # GET /api/mod/channels/channels?space_id=xxx
    if p.endswith('/channels'):
        space_id = _get_param(handler, 'space_id')
        channels = load_channels(space_id) if space_id else []
        for ch in channels:
            ch['unread'] = get_unread_count(ch['id'], session['id'])
        return _json(handler, 200, channels)

    # GET /api/mod/channels/members?space_id=xxx
    if p.endswith('/members'):
        space_id = _get_param(handler, 'space_id')
        if not space_id: return _json(handler, 400, {'error': 'space_id required'})
        from server import load_users, get_avatar_b64, ws_clients
        users = load_users()
        members = load_members(space_id)
        online_ids = set(cl['user_id'] for cl in ws_clients.values())
        result = []
        for m in members:
            u = next((u for u in users if u['id'] == m['user_id']), None)
            if u:
                online = u['id'] in online_ids
                result.append({'user_id':u['id'],'username':u['username'],'display_name':u.get('display_name',''),
                    'role':u['role'],'space_role':m.get('role','member'),'avatar':get_avatar_b64(u['id']),
                    'online':online,'status':'online' if online else 'offline'})
        return _json(handler, 200, result)

    # GET /api/mod/channels/voice_rooms?space_id=xxx
    if p.endswith('/voice_rooms'):
        space_id = _get_param(handler, 'space_id')
        try:
            from server import voice_rooms, voice_rooms_lock
            with voice_rooms_lock:
                result = {}
                for rid, room in voice_rooms.items():
                    if room.get('space_id') == space_id:
                        result[rid] = {
                            'total': len(room['speakers']) + len(room['listeners']),
                            'speaker_count': len(room['speakers']),
                            'speakers': [{'user_id':p['user_id'],'username':p['username'],'avatar':p.get('avatar')} for p in room['speakers']]
                        }
        except: result = {}
        return _json(handler, 200, result)

    # GET /api/mod/channels/read?channel_id=xxx
    if p.endswith('/read'):
        ch_id = _get_param(handler, 'channel_id')
        if ch_id: mark_channel_read(ch_id, session['id'])
        return _json(handler, 200, {'status':'ok'})

    # GET /api/mod/channels/pins?channel_id=xxx
    if p.endswith('/pins'):
        ch_id = _get_param(handler, 'channel_id')
        return _json(handler, 200, load_pins(ch_id) if ch_id else [])

    # GET /api/mod/channels/messages?channel_id=xxx
    if p.endswith('/messages'):
        ch_id = _get_param(handler, 'channel_id')
        offset = int(_get_param(handler, 'offset') or 0)
        limit = int(_get_param(handler, 'limit') or 50)
        msgs = _load(DATA_DIR / f'chan_{ch_id}.json', []) if ch_id else []
        total = len(msgs)
        if offset > 0:
            msgs = msgs[max(0,total-offset-limit):total-offset]
        else:
            msgs = msgs[-limit:]
        state = load_read_state(session['id'])
        last_read = state.get(ch_id, 0)
        return _json(handler, 200, {'messages': msgs, 'last_read': last_read})

    # GET /api/mod/channels/users
    if p.endswith('/users'):
        if session['role'] not in ADMIN_ROLES: return _json(handler, 403, {'error': 'Нет доступа'})
        from server import load_users, get_avatar_b64
        users = load_users()
        return _json(handler, 200, [{'id':u['id'],'username':u['username'],'display_name':u.get('display_name',''),'role':u['role'],'avatar':get_avatar_b64(u['id'])} for u in users])

    return _json(handler, 404, {'error': 'Not found'})

def handle_post(handler, session, path, data):
    p = path.split('?')[0]
    # POST /api/mod/channels/spaces (create or edit)
    if p.endswith('/spaces'):
        if session['role'] not in ADMIN_ROLES: return _json(handler, 403, {'error': 'Нет доступа'})
        name = data.get('name', '').strip()
        if not name or len(name) > 40: return _json(handler, 400, {'error': 'Название группы 1-40 символов'})
        photo_b64 = data.get('photo')
        edit_id = data.get('edit_id')
        spaces = load_spaces()
        if edit_id:
            for sp in spaces:
                if sp['id'] == edit_id:
                    sp['name'] = name
                    break
            save_spaces(spaces)
            if photo_b64: save_space_photo(edit_id, photo_b64)
            elif data.get('remove_photo'): delete_space_photo(edit_id)
            return _json(handler, 200, {'status': 'ok'})
        sp_type = data.get('type', 'text')
        if sp_type not in ('text', 'voice_group'): sp_type = 'text'
        space = {'id': secrets.token_hex(6), 'name': name, 'type': sp_type, 'owner_id': session['id'], 'created': time.strftime('%Y-%m-%d %H:%M:%S')}
        spaces.append(space)
        save_spaces(spaces)
        save_members(space['id'], [{'user_id': session['id'], 'role': 'owner', 'joined': space['created']}])
        if photo_b64: save_space_photo(space['id'], photo_b64)
        return _json(handler, 200, {'status': 'ok', 'space': space})

    # POST /api/mod/channels/channels (create or edit)
    if p.endswith('/channels'):
        if session['role'] not in ADMIN_ROLES: return _json(handler, 403, {'error': 'Нет доступа'})
        space_id = data.get('space_id', '')
        name = data.get('name', '').strip()
        icon = data.get('icon', 'channels')
        if not name or len(name) > 30: return _json(handler, 400, {'error': 'Название 1-30 символов'})
        edit_id = data.get('edit_id')
        channels = load_channels(space_id)
        if edit_id:
            for ch in channels:
                if ch['id'] == edit_id:
                    ch['name'] = name
                    ch['icon'] = icon
                    break
            save_channels(space_id, channels)
            return _json(handler, 200, {'status': 'ok'})
        ch_type = data.get('type', 'text')
        if ch_type not in ('text', 'voice'): ch_type = 'text'
        channel = {'id': secrets.token_hex(6), 'name': name, 'icon': icon, 'type': ch_type, 'space_id': space_id, 'created': time.strftime('%Y-%m-%d %H:%M:%S')}
        channels.append(channel)
        save_channels(space_id, channels)
        return _json(handler, 200, {'status': 'ok', 'channel': channel})

    # POST /api/mod/channels/members
    if p.endswith('/members'):
        if session['role'] not in ADMIN_ROLES: return _json(handler, 403, {'error': 'Нет доступа'})
        space_id = data.get('space_id', '')
        user_ids = data.get('user_ids', [])
        set_mod = data.get('set_moderator')  # {user_id, value}
        members = load_members(space_id)
        if set_mod:
            uid = set_mod.get('user_id')
            val = set_mod.get('value', False)
            for m in members:
                if m['user_id'] == uid:
                    m['role'] = 'moderator' if val else 'member'
                    break
            save_members(space_id, members)
            return _json(handler, 200, {'status': 'ok'})
        existing = set(m['user_id'] for m in members)
        now = time.strftime('%Y-%m-%d %H:%M:%S')
        for uid in user_ids:
            if uid not in existing:
                members.append({'user_id': uid, 'role': 'member', 'joined': now})
        save_members(space_id, members)
        return _json(handler, 200, {'status': 'ok'})

    return _json(handler, 404, {'error': 'Not found'})

def handle_delete(handler, session, path):
    p = path.split('?')[0]
    if session['role'] not in ADMIN_ROLES: return _json(handler, 403, {'error': 'Нет доступа'})
    data = {}
    cl = int(handler.headers.get('Content-Length') or 0)
    if cl > 0:
        try: data = json.loads(handler.rfile.read(cl))
        except: pass
    # Also check query params as fallback
    if not data:
        from urllib.parse import parse_qs
        q = parse_qs(handler.path.split('?',1)[1] if '?' in handler.path else '')
        for k in ('space_id','channel_id','user_id'):
            if k in q: data[k] = q[k][0]

    # DELETE space
    if p.endswith('/spaces'):
        space_id = data.get('space_id', '')
        spaces = load_spaces()
        spaces = [sp for sp in spaces if sp['id'] != space_id]
        save_spaces(spaces)
        for f in DATA_DIR.glob(f'space_{space_id}_*'): f.unlink(missing_ok=True)
        delete_space_photo(space_id)
        return _json(handler, 200, {'status': 'ok'})

    # DELETE channel
    if p.endswith('/channels'):
        space_id = data.get('space_id', '')
        channel_id = data.get('channel_id', '')
        channels = load_channels(space_id)
        channels = [ch for ch in channels if ch['id'] != channel_id]
        save_channels(space_id, channels)
        (DATA_DIR / f'chan_{channel_id}.json').unlink(missing_ok=True)
        return _json(handler, 200, {'status': 'ok'})

    # DELETE member
    if p.endswith('/members'):
        space_id = data.get('space_id', '')
        user_id = data.get('user_id', '')
        members = load_members(space_id)
        members = [m for m in members if m['user_id'] != user_id]
        save_members(space_id, members)
        return _json(handler, 200, {'status': 'ok'})

    return _json(handler, 404, {'error': 'Not found'})

def register_routes():
    return {'/api/mod/channels': {'GET': handle_get, 'POST': handle_post, 'DELETE': handle_delete}}
