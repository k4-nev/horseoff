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


# ── Push notifications on bot events ─────────────────────────────────────────
_push_cooldown = {}      # bot_id → last error-push monotonic time
_PUSH_ERROR_COOLDOWN = 20  # seconds between ERROR pushes per bot

def _bot_recipients(bot):
    """User ids that should be notified: owners (by role) + explicit access."""
    try:
        from server import load_users
        ids = {u['id'] for u in load_users() if u.get('role') in _OWNER_ROLES}
    except Exception:
        ids = set()
    ids.update(bot.get('access_ids') or [])
    return ids

def _notify_bot_users(bot, title, body):
    """Send a web-push to everyone with access to this bot (non-blocking)."""
    def _run():
        try:
            from server import send_push
            for uid in _bot_recipients(bot):
                try:
                    send_push(uid, title, body, url='/')
                except Exception as e:
                    print(f"[BOTS PUSH] send error {uid}: {e}")
        except Exception as e:
            print(f"[BOTS PUSH] {e}")
    threading.Thread(target=_run, daemon=True).start()


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

def _reset_all_offline():
    """On server startup no bot is connected — clear stale online/status state.
    Otherwise a bot that was 'online'/'завершает потоки' before a restart keeps
    showing that phantom status until it's manually restarted."""
    for entry in _load_index():
        try:
            bid = entry['id'] if isinstance(entry, dict) else entry
            bot = _load_bot(bid)
            if not bot:
                continue
            dirty = bot.get('status') != 'offline' or bot.get('status_text') \
                or bot.get('status_dot') or bot.get('status_lock')
            if not dirty:
                continue
            bot['status'] = 'offline'
            bot['status_text'] = ''
            bot['status_dot'] = ''
            bot['status_lock'] = False
            for ctrl in (bot.get('controls') or []):
                for field in ('text', 'value', 'rows', 'total', 'src'):
                    ctrl.pop(field, None)
            _save_bot(bot)
        except Exception as e:
            print(f"[BOTS] reset offline error: {e}")

_reset_all_offline()

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
        'status_text': bot.get('status_text', ''),
        'status_dot': bot.get('status_dot', ''),
        'status_lock': bot.get('status_lock', False),
    }

def _bot_detail(bot, session):
    from server import get_avatar_b64, load_users
    access_users = []
    seen = set()
    access_ids = bot.get('access_ids') or []
    for u in load_users():
        is_owner = u.get('role') in _OWNER_ROLES
        if (is_owner or u['id'] in access_ids) and u['id'] not in seen:
            seen.add(u['id'])
            access_users.append({
                'id': u['id'], 'username': u['username'],
                'display_name': u.get('display_name', ''),
                'role': u.get('role', ''),
                'avatar': get_avatar_b64(u['id']),
                'is_owner': is_owner,
            })
    # Owners first, then granted users
    access_users.sort(key=lambda x: (not x['is_owner']))
    return {
        **_bot_summary(bot),
        'api_key': bot.get('api_key', '') if session['role'] in _OWNER_ROLES else '',
        'controls': bot.get('controls'),
        'stats': bot.get('stats'),
        'logs': bot.get('logs') or [],
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

    # POST /api/mod/bots/group/rename — rename a group across all its bots
    if p.endswith('/group/rename'):
        if session['role'] not in _OWNER_ROLES:
            return _json(handler, 403, {'error': 'Forbidden'})
        old = (data.get('old') or '').strip()
        new = (data.get('new') or '').strip()
        if not old or not new:
            return _json(handler, 400, {'error': 'old and new required'})
        count = 0
        for entry in _load_index():
            b = _load_bot(entry['id'])
            if b and b.get('group', 'Без группы') == old:
                b['group'] = new
                _save_bot(b)
                count += 1
        return _json(handler, 200, {'ok': True, 'count': count})

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
                try:
                    from server import _ws_broadcast_to_user
                    _ws_broadcast_to_user(uid, {'type': 'bot_access_update', 'bot_id': bot_id, 'action': 'granted'})
                except Exception as e:
                    print(f'[BOTS] access broadcast error: {e}')
            return _json(handler, 200, {'ok': True})

        # POST /api/mod/bots/:id/read — clear badge
        if sub == 'read':
            bot['badge'] = 0
            _save_bot(bot)
            return _json(handler, 200, {'ok': True})

        # POST /api/mod/bots/:id/clear_log — wipe stored logs
        if sub == 'clear_log':
            bot['logs'] = []
            _save_bot(bot)
            _broadcast_bot({'type': 'bot_log_clear', 'bot_id': bot_id})
            return _json(handler, 200, {'ok': True})

    return _json(handler, 404, {'error': 'Not found'})


# ── PATCH ─────────────────────────────────────────────────────────────────────
def handle_put(handler, session, path, data=None):
    p = path.split('?')[0]
    if data is None: data = _read_json(handler) or {}
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
                try:
                    from server import _ws_broadcast_to_user
                    _ws_broadcast_to_user(uid, {'type': 'bot_access_update', 'bot_id': bot_id, 'action': 'revoked'})
                except Exception as e:
                    print(f'[BOTS] access broadcast error: {e}')
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
                    level = (msg.get('level') or 'INFO').upper()
                    text = msg.get('msg', '')
                    ts = time.strftime('%H:%M:%S')
                    # Persist last 500 log lines per bot (survive reload/restart)
                    bot = _load_bot(bot_id)
                    if bot:
                        logs = bot.get('logs') or []
                        logs.append({'ts': ts, 'level': level, 'msg': text})
                        if len(logs) > 500:
                            logs = logs[-500:]
                        bot['logs'] = logs
                        _save_bot(bot)
                    _broadcast_bot({'type': 'bot_log', 'bot_id': bot_id,
                                    'ts': ts, 'level': level, 'msg': text})
                    # Push on ERROR-level logs, rate-limited per bot
                    if level == 'ERROR':
                        now = time.monotonic()
                        if now - _push_cooldown.get(bot_id, 0) >= _PUSH_ERROR_COOLDOWN:
                            _push_cooldown[bot_id] = now
                            b = _load_bot(bot_id)
                            if b:
                                _notify_bot_users(b, f'⚠️ {b.get("name", "Бот")}: ошибка',
                                                  (text or 'Произошла ошибка')[:140])

                elif mt == 'event':
                    # Bot explicitly requests a push notification
                    b = _load_bot(bot_id)
                    if b:
                        title = msg.get('title') or b.get('name', 'Бот')
                        body = msg.get('body') or msg.get('msg') or ''
                        _notify_bot_users(b, str(title)[:80], str(body)[:140])

                elif mt == 'ctrl_update':
                    ctrl_id = msg.get('ctrl_id', '')
                    data = msg.get('data', {})
                    if ctrl_id == '__status__':
                        # Bot live status — store and broadcast as bot_update
                        bot = _load_bot(bot_id)
                        if bot:
                            bot['status_text'] = data.get('text', '')
                            bot['status_dot']  = data.get('dot', 'online')
                            bot['status_lock'] = bool(data.get('lock', False))
                            _save_bot(bot)
                        _broadcast_bot({'type': 'bot_update', 'bot_id': bot_id,
                                        'status_text': data.get('text', ''),
                                        'status_dot':  data.get('dot', 'online'),
                                        'status_lock': bool(data.get('lock', False))})
                    else:
                        # Persist updated value into stored controls
                        bot = _load_bot(bot_id)
                        if bot and bot.get('controls'):
                            for ctrl in bot['controls']:
                                if ctrl.get('id') == ctrl_id:
                                    ctrl.update(data)
                                    break
                            _save_bot(bot)
                        _broadcast_bot({'type': 'ctrl_update', 'bot_id': bot_id,
                                        'ctrl_id': ctrl_id, 'data': data})

                elif mt == 'stats':
                    bot = _load_bot(bot_id)
                    if bot:
                        # Block-based stats: bot declares which stat components it needs.
                        if 'blocks' in msg:
                            stats = {'blocks': msg['blocks']}
                        else:
                            # legacy kpi/hourly/daily
                            stats = {k: msg[k] for k in ('kpi', 'hourly', 'daily') if k in msg}
                        bot['stats'] = stats
                        _save_bot(bot)
                        _broadcast_bot({'type': 'bot_stats', 'bot_id': bot_id, 'stats': stats})

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
                bot['status_text'] = ''
                bot['status_dot'] = ''
                bot['status_lock'] = False
                # Reset live control values so stale data isn't shown on reconnect
                for ctrl in (bot.get('controls') or []):
                    for field in ('text', 'value', 'rows', 'total', 'src'):
                        ctrl.pop(field, None)
                _save_bot(bot)
                _broadcast_bot({'type': 'bot_update', 'bot_id': bot_id, 'status': 'offline',
                                'status_text': '', 'status_dot': '', 'status_lock': False})


# ── Registration ──────────────────────────────────────────────────────────────
def register_routes():
    return {'/api/mod/bots': {
        'GET': handle_get,
        'POST': handle_post,
        'PUT': handle_put,
        'DELETE': handle_delete,
    }}
