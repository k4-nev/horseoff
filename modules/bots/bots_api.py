"""Bots module API — v1.0"""
import json, secrets, time
from pathlib import Path

BOTS_DATA_DIR = Path(__file__).resolve().parent.parent.parent / 'data' / 'bots'
BOTS_DATA_DIR.mkdir(parents=True, exist_ok=True)
BOTS_INDEX = BOTS_DATA_DIR / 'index.json'

_OWNER_ROLES = {'arcana', 'immortal'}


# ── Persistence ──────────────────────────────────────────────────────────────
def _load(path, default=None):
    try:
        if path.exists(): return json.loads(path.read_text())
    except: pass
    return default if default is not None else {}

def _save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

def _load_index(): return _load(BOTS_INDEX, [])
def _save_index(d): _save(BOTS_INDEX, d)
def _bot_path(bid): return BOTS_DATA_DIR / f'{bid}.json'
def _load_bot(bid): return _load(_bot_path(bid), None)
def _save_bot(b): _save(_bot_path(b['id']), b)
def _gen_key(): return 'hb_' + secrets.token_urlsafe(32)

def _can_access(session, bot):
    if session['role'] in _OWNER_ROLES: return True
    return session['id'] in (bot.get('access_ids') or [])

def _bot_summary(bot):
    return {
        'id': bot['id'], 'name': bot['name'],
        'group': bot.get('group', 'Без группы'),
        'status': bot.get('status', 'offline'),
        'version': bot.get('version', ''),
        'sub': bot.get('sub', ''),
        'badge': bot.get('badge', 0),
        'last_seen': bot.get('last_seen'),
        'queue_count': len(bot.get('command_queue', [])),
    }

def _bot_detail(bot, session):
    from server import get_avatar_b64, load_users
    access_users = []
    for u in load_users():
        if u['id'] in (bot.get('access_ids') or []):
            access_users.append({
                'id': u['id'], 'username': u['username'],
                'display_name': u.get('display_name', ''),
                'role': u.get('role', ''),
                'avatar': get_avatar_b64(u['id'])
            })
    return {
        **_bot_summary(bot),
        'api_key': bot.get('api_key', '') if session['role'] in _OWNER_ROLES else '',
        'controls': bot.get('controls'),
        'stats': bot.get('stats'),
        'access': access_users,
    }

def _json(handler, code, data):
    handler.send_response(code)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('X-Content-Type-Options', 'nosniff')
    handler.end_headers()
    handler.wfile.write(json.dumps(data, ensure_ascii=False).encode())

def _read_json(handler):
    length = int(handler.headers.get('Content-Length', 0))
    body = handler.rfile.read(length)
    try: return json.loads(body) if body else {}
    except: _json(handler, 400, {'error': 'Invalid JSON'}); return None


# ── GET ───────────────────────────────────────────────────────────────────────
def handle_get(handler, session, path):
    p = path.split('?')[0]

    # GET /api/mod/bots/list
    if p.endswith('/list'):
        bots = []
        for entry in _load_index():
            bot = _load_bot(entry['id'])
            if bot and _can_access(session, bot):
                bots.append(_bot_summary(bot))
        return _json(handler, 200, {'bots': bots})

    # GET /api/mod/bots/:id
    parts = p.split('/api/mod/bots/')
    if len(parts) == 2:
        bot_id = parts[1].split('/')[0]
        if bot_id and bot_id != 'list':
            bot = _load_bot(bot_id)
            if not bot: return _json(handler, 404, {'error': 'Not found'})
            if not _can_access(session, bot): return _json(handler, 403, {'error': 'Forbidden'})
            return _json(handler, 200, {'bot': _bot_detail(bot, session)})

    return _json(handler, 404, {'error': 'Not found'})


# ── POST ──────────────────────────────────────────────────────────────────────
def handle_post(handler, session, path, data=None):
    p = path.split('?')[0]
    if data is None: data = _read_json(handler) or {}

    # POST /api/mod/bots/create
    if p.endswith('/create'):
        if session['role'] not in _OWNER_ROLES:
            return _json(handler, 403, {'error': 'Forbidden'})
        name = (data.get('name') or '').strip()
        if not name: return _json(handler, 400, {'error': 'Name required'})
        api_key = _gen_key()
        bot_id = secrets.token_hex(8)
        bot = {
            'id': bot_id, 'name': name,
            'group': data.get('group', 'Без группы'),
            'status': 'offline', 'version': '', 'sub': '',
            'badge': 0, 'last_seen': None,
            'api_key': api_key, 'api_key_hint': api_key[-6:],
            'owner_id': session['id'], 'access_ids': [],
            'command_queue': [], 'controls': None, 'stats': None,
            'created_at': int(time.time()),
        }
        _save_bot(bot)
        index = _load_index()
        index.append({'id': bot_id, 'name': name})
        _save_index(index)
        return _json(handler, 200, {'bot': _bot_summary(bot), 'api_key': api_key})

    # Paths with bot id
    parts = p.split('/api/mod/bots/')
    if len(parts) == 2:
        segs = parts[1].split('/')
        bot_id = segs[0]
        sub = segs[1] if len(segs) > 1 else ''
        bot = _load_bot(bot_id)
        if not bot: return _json(handler, 404, {'error': 'Not found'})
        if not _can_access(session, bot): return _json(handler, 403, {'error': 'Forbidden'})

        # POST /api/mod/bots/:id/command
        if sub == 'command':
            cmd = {
                'id': secrets.token_hex(4),
                'ctrl_id': data.get('ctrl_id'),
                'action': data.get('action'),
                'value': data.get('value'),
                'ts': int(time.time()),
                'user_id': session['id'],
            }
            if bot.get('status') == 'offline':
                bot.setdefault('command_queue', []).append(cmd)
                _save_bot(bot)
                return _json(handler, 200, {'queued': True})
            # Etap 2: deliver via WebSocket
            return _json(handler, 200, {'ok': True, 'cmd': cmd})

        # POST /api/mod/bots/:id/regen_key
        if sub == 'regen_key':
            if session['role'] not in _OWNER_ROLES:
                return _json(handler, 403, {'error': 'Forbidden'})
            new_key = _gen_key()
            bot['api_key'] = new_key
            bot['api_key_hint'] = new_key[-6:]
            _save_bot(bot)
            return _json(handler, 200, {'api_key': new_key})

        # POST /api/mod/bots/:id/access — grant
        if sub == 'access':
            uid = data.get('user_id')
            if uid and uid not in bot.setdefault('access_ids', []):
                bot['access_ids'].append(uid)
                _save_bot(bot)
            return _json(handler, 200, {'ok': True})

        # POST /api/mod/bots/:id/read — clear badge
        if sub == 'read':
            bot['badge'] = 0
            _save_bot(bot)
            return _json(handler, 200, {'ok': True})

    return _json(handler, 404, {'error': 'Not found'})


# ── PATCH ─────────────────────────────────────────────────────────────────────
def handle_put(handler, session, path):
    p = path.split('?')[0]
    data = _read_json(handler)
    if data is None: return
    parts = p.split('/api/mod/bots/')
    if len(parts) == 2:
        bot_id = parts[1].split('/')[0]
        bot = _load_bot(bot_id)
        if not bot: return _json(handler, 404, {'error': 'Not found'})
        if not _can_access(session, bot): return _json(handler, 403, {'error': 'Forbidden'})
        if 'name' in data:
            name = data['name'].strip()
            if name:
                bot['name'] = name
                index = _load_index()
                for e in index:
                    if e['id'] == bot_id: e['name'] = name
                _save_index(index)
        if 'group' in data: bot['group'] = data['group']
        if 'sub' in data: bot['sub'] = data['sub']
        if 'version' in data: bot['version'] = data['version']
        _save_bot(bot)
        return _json(handler, 200, {'ok': True})
    return _json(handler, 404, {'error': 'Not found'})


# ── DELETE ────────────────────────────────────────────────────────────────────
def handle_delete(handler, session, path):
    p = path.split('?')[0]
    parts = p.split('/api/mod/bots/')
    if len(parts) == 2:
        segs = parts[1].split('/')
        bot_id = segs[0]
        sub = segs[1] if len(segs) > 1 else ''
        bot = _load_bot(bot_id)
        if not bot: return _json(handler, 404, {'error': 'Not found'})
        if not _can_access(session, bot): return _json(handler, 403, {'error': 'Forbidden'})

        # DELETE /api/mod/bots/:id/access — revoke
        if sub == 'access':
            length = int(handler.headers.get('Content-Length', 0))
            body = handler.rfile.read(length)
            try: data = json.loads(body) if body else {}
            except: data = {}
            uid = data.get('user_id')
            if uid in bot.get('access_ids', []):
                bot['access_ids'].remove(uid)
                _save_bot(bot)
            return _json(handler, 200, {'ok': True})

        # DELETE /api/mod/bots/:id
        if not sub:
            if session['role'] not in _OWNER_ROLES and session['id'] != bot.get('owner_id'):
                return _json(handler, 403, {'error': 'Forbidden'})
            _bot_path(bot_id).unlink(missing_ok=True)
            _save_index([e for e in _load_index() if e['id'] != bot_id])
            return _json(handler, 200, {'ok': True})

    return _json(handler, 404, {'error': 'Not found'})


# ── Registration ──────────────────────────────────────────────────────────────
def register_routes():
    return {'/api/mod/bots': {
        'GET': handle_get,
        'POST': handle_post,
        'PUT': handle_put,
        'DELETE': handle_delete,
    }}
