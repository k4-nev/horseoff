"""Valentine module API — v1.0"""
import json, time, secrets, threading
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT_DIR / 'data' / 'valentines'
DATA_DIR.mkdir(parents=True, exist_ok=True)
STICKERS_DIR = ROOT_DIR / 'stickers'
STICKERS_DIR.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()
PNG_EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}

def _json(handler, code, data):
    handler.send_response(code)
    handler.send_header('Content-Type', 'application/json')
    handler.end_headers()
    handler.wfile.write(json.dumps(data, ensure_ascii=False).encode())

def _load_valentines(user_id):
    f = DATA_DIR / f'{user_id}.json'
    try:
        if f.exists(): return json.loads(f.read_text())
    except: pass
    return []

def _save_valentines(user_id, valentines):
    with _lock:
        (DATA_DIR / f'{user_id}.json').write_text(json.dumps(valentines, ensure_ascii=False, indent=2))

def _get_stickers():
    if not STICKERS_DIR.exists(): return []
    return sorted(
        [f'/stickers/{f.name}' for f in STICKERS_DIR.iterdir() if f.suffix.lower() in PNG_EXTS],
        key=lambda p: p.lower()
    )

def handle_get(handler, s, path):
    if path == '/api/valentine/received':
        return _json(handler, 200, _load_valentines(s['id']))

    if path == '/api/valentine/stickers':
        return _json(handler, 200, {'stickers': _get_stickers()})

    return _json(handler, 404, {'error': 'Not found'})

def handle_post(handler, s, path, data):
    if path == '/api/valentine/send':
        to_id = data.get('to', '').strip()
        pages  = data.get('pages', [])

        if not to_id:
            return _json(handler, 400, {'error': 'Не указан получатель'})
        if len(pages) != 5:
            return _json(handler, 400, {'error': 'Нужно заполнить 5 страниц'})
        for p in pages:
            if not p.get('sticker') or not str(p.get('text', '')).strip():
                return _json(handler, 400, {'error': 'Каждая страница должна иметь картинку и текст'})

        import server as srv
        users = srv.load_users()
        if not any(u['id'] == to_id for u in users):
            return _json(handler, 404, {'error': 'Получатель не найден'})

        sender = srv.find_user(s['username'])
        sender_name   = (sender.get('display_name') or s['username']) if sender else s['username']
        sender_avatar = srv.get_avatar_b64(s['id'])

        valentine = {
            'id': secrets.token_hex(10),
            'from': s['id'],
            'from_name': sender_name,
            'from_avatar': sender_avatar,
            'to': to_id,
            'time': int(time.time()),
            'read': False,
            'pages': [{'sticker': p['sticker'], 'text': str(p['text']).strip()} for p in pages]
        }

        valentines = _load_valentines(to_id)
        valentines.append(valentine)
        _save_valentines(to_id, valentines)

        unread = sum(1 for v in valentines if not v.get('read'))

        # WebSocket live notification
        srv._ws_broadcast_to_user(to_id, {
            'type': 'valentine',
            'id': valentine['id'],
            'from': s['id'],
            'from_name': sender_name,
            'from_avatar': sender_avatar,
            'unread': unread
        })

        # Push notification
        if srv.HAS_PUSH:
            threading.Thread(
                target=srv.send_push,
                args=(to_id, sender_name, 'Вам секретное письмо 💌', '/', s['id']),
                daemon=True
            ).start()

        return _json(handler, 200, {'status': 'ok', 'id': valentine['id']})

    if path == '/api/valentine/read':
        val_id = data.get('id', '')
        vs = _load_valentines(s['id'])
        changed = False
        for v in vs:
            if v['id'] == val_id and not v.get('read'):
                v['read'] = True; changed = True
        if changed: _save_valentines(s['id'], vs)
        return _json(handler, 200, {'status': 'ok'})

    return _json(handler, 404, {'error': 'Not found'})

def handle_delete(handler, s, path):
    if path.startswith('/api/valentine/'):
        val_id = path.split('/api/valentine/')[1]
        vs = _load_valentines(s['id'])
        vs = [v for v in vs if v['id'] != val_id]
        _save_valentines(s['id'], vs)
        return _json(handler, 200, {'status': 'ok'})
    return _json(handler, 404, {'error': 'Not found'})

def register_routes():
    return {
        '/api/valentine': {
            'GET':    handle_get,
            'POST':   handle_post,
            'DELETE': handle_delete,
        }
    }
