"""Bots module API — v1.0"""
import json, secrets, time, asyncio, threading
from pathlib import Path

BOTS_DATA_DIR = Path(__file__).resolve().parent.parent.parent / 'data' / 'bots'
BOTS_DATA_DIR.mkdir(parents=True, exist_ok=True)
BOTS_INDEX = BOTS_DATA_DIR / 'index.json'
print(f"  [BOTS] data dir: {BOTS_DATA_DIR}")

_OWNER_ROLES = {'arcana', 'immortal'}

# ── Bot WebSocket connections (bot_id → websocket) ───────────────────────────
bot_ws_connections = {}
_bws_lock = threading.Lock()

def _broadcast_bot(data):
    """Broadcast bot update to all management UI clients via Shell WS queue."""
    try:
        from server import _ws_broadcast_all
        _ws_broadcast_all(data)
    except Exception as e:
        print(f"[BOTS WS] Broadcast error: {e}")


# ── Persistence ──────────────────────────────────────────────────────────────
def _load(path, default=None):
    try:
        if path.exists(): return json.loads(path.read_text())
    except: pass
    return default if default is not None else {}

def _save(path, data):
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"[BOTS] Save error {path}: {e}")

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
        'avatar': bot.get('avatar', ''),
        'layout': bot.get('layout', None),
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
            'avatar': data.get('avatar', ''),
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
            with _bws_lock:
                ws = bot_ws_connections.get(bot_id)
            if ws:
                # Deliver in real-time via bot's WebSocket
                async def _send():
                    try: await ws.send(json.dumps({'type': 'command', 'cmd': cmd}))
                    except: pass
                try:
                    from server import ws_loop
                    if ws_loop:
                        asyncio.run_coroutine_threadsafe(_send(), ws_loop)
                except: pass
                return _json(handler, 200, {'ok': True, 'cmd': cmd})
            else:
                bot.setdefault('command_queue', []).append(cmd)
                _save_bot(bot)
                return _json(handler, 200, {'queued': True})

        # POST /api/mod/bots/:id/layout
        if sub == 'layout':
            bot['layout'] = data.get('layout', [])
            _save_bot(bot)
            return _json(handler, 200, {'ok': True})

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
        if 'avatar' in data: bot['avatar'] = data['avatar']
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


# ── Bot WebSocket handler ─────────────────────────────────────────────────────
async def handle_bot_ws(websocket):
    """Handle WebSocket connection from a bot (ZennoPoster / C# client)."""
    bot_id = None
    try:
        raw = await asyncio.wait_for(websocket.recv(), timeout=15)
        data = json.loads(raw)
        if data.get('type') != 'auth' or not data.get('api_key'):
            await websocket.close(); return

        # Find bot by API key
        bot = None
        for entry in _load_index():
            b = _load_bot(entry['id'])
            if b and b.get('api_key') == data['api_key']:
                bot = b; break

        if not bot:
            await websocket.send(json.dumps({'type': 'error', 'msg': 'Invalid API key'}))
            await websocket.close(); return

        bot_id = bot['id']
        with _bws_lock:
            bot_ws_connections[bot_id] = websocket

        # Mark online + flush queued commands
        bot['status'] = 'online'
        bot['last_seen'] = int(time.time())
        queued = bot.get('command_queue', [])
        bot['command_queue'] = []
        _save_bot(bot)

        await websocket.send(json.dumps({'type': 'auth_ok', 'bot_id': bot_id, 'name': bot['name']}))
        for cmd in queued:
            await websocket.send(json.dumps({'type': 'command', 'cmd': cmd}))

        _broadcast_bot({'type': 'bot_update', 'bot_id': bot_id, 'status': 'online',
                        'version': bot.get('version', ''), 'sub': bot.get('sub', '')})

        # Message loop
        async for raw in websocket:
            try:
                msg = json.loads(raw)
                mt = msg.get('type')

                if mt == 'ping':
                    await websocket.send(json.dumps({'type': 'pong'}))

                elif mt == 'manifest':
                    bot = _load_bot(bot_id)
                    if bot:
                        for field in ('name', 'version', 'sub', 'controls'):
                            if msg.get(field) is not None:
                                bot[field] = msg[field]
                        _save_bot(bot)
                        _broadcast_bot({'type': 'bot_update', 'bot_id': bot_id,
                                        'status': 'online', 'version': bot.get('version', ''),
                                        'sub': bot.get('sub', ''), 'controls': bot.get('controls')})

                elif mt == 'log':
                    _broadcast_bot({'type': 'bot_log', 'bot_id': bot_id,
                                    'level': msg.get('level', 'INFO'), 'msg': msg.get('msg', '')})

                elif mt == 'ctrl_update':
                    # Bot pushes live value update for a single control
                    _broadcast_bot({'type': 'ctrl_update', 'bot_id': bot_id,
                                    'ctrl_id': msg.get('ctrl_id', ''), 'data': msg.get('data', {})})

                elif mt == 'stats':
                    bot = _load_bot(bot_id)
                    if bot:
                        bot['stats'] = {k: msg[k] for k in ('kpi', 'hourly', 'daily') if k in msg}
                        _save_bot(bot)

            except (json.JSONDecodeError, KeyError):
                pass

    except Exception as e:
        print(f"[BOT WS] {e}")
    finally:
        if bot_id:
            with _bws_lock:
                bot_ws_connections.pop(bot_id, None)
            bot = _load_bot(bot_id)
            if bot:
                bot['status'] = 'offline'
                bot['last_seen'] = int(time.time())
                _save_bot(bot)
                _broadcast_bot({'type': 'bot_update', 'bot_id': bot_id, 'status': 'offline'})


# ── Registration ──────────────────────────────────────────────────────────────
def register_routes():
    return {'/api/mod/bots': {
        'GET': handle_get,
        'POST': handle_post,
        'PUT': handle_put,
        'DELETE': handle_delete,
    }}
