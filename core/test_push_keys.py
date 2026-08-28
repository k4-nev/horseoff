# -*- coding: utf-8 -*-
"""Ключи VAPID переезжают из pwa/ в data/ сами, и пуши это переживают.

Приватный ключ раньше лежал в pwa/ — каталоге, который сервер раздаёт как
статику, — и качался по HTTP. Путь перевели на data/, но на уже работающих
установках файлы остались на старом месте: после выкладки send_push молча
выходил в первой же строке, а /api/push/key отдавал available:false. Ни
ошибки, ни записи в логе — просто перестали приходить уведомления.

Здесь стережётся именно это: перенос происходит, старый файл не остаётся
(иначе возвращается та самая дыра), повторный запуск ничего не портит, а уже
переехавший ключ не затирается устаревшей копией.

Запуск:  python core/test_push_keys.py
"""
import importlib.util
import io
import shutil
import sys
import tempfile
from pathlib import Path

SRC = Path(__file__).resolve().parent / 'server.py'

# Консоль под Windows по умолчанию cp1251 — вывод здесь русский
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

fails = []


def check(name, ok, extra=''):
    print(('  ok  ' if ok else ' FAIL ') + name + (' — ' + str(extra) if extra else ''))
    if not ok:
        fails.append(name)


def load(root):
    """Свежий модуль сервера с ROOT_DIR внутри временного дерева."""
    src = io.open(SRC, encoding='utf-8').read()
    # ROOT_DIR вычисляется от расположения файла — подкладываем копию на место
    core = root / 'core'
    core.mkdir(parents=True, exist_ok=True)
    dst = core / 'server.py'
    io.open(dst, 'w', encoding='utf-8').write(src)
    name = 'horseoff_srv_push_' + root.name
    spec = importlib.util.spec_from_file_location(name, dst)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def tree():
    root = Path(tempfile.mkdtemp(prefix='ho_push_'))
    (root / 'pwa').mkdir()
    return root


print('\n── Ключи переезжают из pwa/ в data/ ──')
root = tree()
io.open(root / 'pwa' / 'vapid_private.pem', 'w').write('PRIVATE-KEY-BODY')
io.open(root / 'pwa' / 'vapid_public.txt', 'w').write('PUBLIC-KEY')
srv = load(root)
check('до переноса приватного ключа на новом месте нет', not srv.VAPID_PRIVATE_KEY.exists())
srv.migrate_vapid_keys()
check('приватный ключ переехал', srv.VAPID_PRIVATE_KEY.exists())
check('содержимое не потерялось', srv.VAPID_PRIVATE_KEY.read_text() == 'PRIVATE-KEY-BODY')
check('публичный ключ переехал следом',
      srv.VAPID_PUBLIC_KEY_FILE.exists() and srv.get_vapid_public_key() == 'PUBLIC-KEY')
check('в раздаваемом pwa/ приватного ключа не осталось',
      not (root / 'pwa' / 'vapid_private.pem').exists())
check('и публичного тоже', not (root / 'pwa' / 'vapid_public.txt').exists())

print('\n── Повторный запуск ничего не ломает ──')
srv.migrate_vapid_keys()
check('ключ на месте и после второго прохода',
      srv.VAPID_PRIVATE_KEY.exists() and srv.VAPID_PRIVATE_KEY.read_text() == 'PRIVATE-KEY-BODY')

print('\n── Уже переехавший ключ не затирается старой копией ──')
root2 = tree()
srv2 = load(root2)
srv2.VAPID_PRIVATE_KEY.write_text('НОВЫЙ')
io.open(root2 / 'pwa' / 'vapid_private.pem', 'w').write('СТАРЫЙ')
srv2.migrate_vapid_keys()
check('на новом месте остался новый ключ', srv2.VAPID_PRIVATE_KEY.read_text() == 'НОВЫЙ')
check('старая копия не тронута — переносом такое не решают',
      (root2 / 'pwa' / 'vapid_private.pem').exists())

print('\n── Пустая установка переживает перенос молча ──')
root3 = tree()
srv3 = load(root3)
srv3.migrate_vapid_keys()
check('без ключей ничего не создаётся', not srv3.VAPID_PRIVATE_KEY.exists())
check('строка состояния объясняет, почему пуши молчат',
      'выключены' in srv3.push_status(), srv3.push_status())

print('\n── Строка состояния при живых ключах ──')
srv.PUSH_DIR.mkdir(exist_ok=True)
(srv.PUSH_DIR / 'u1.json').write_text('[]')
(srv.PUSH_DIR / 'u2.json').write_text('[]')
st = srv.push_status()
check('видно, что пуши работают и сколько подписчиков',
      ('работают' in st and '2' in st) if srv.HAS_PUSH else 'pywebpush' in st, st)

for r in (root, root2, root3):
    shutil.rmtree(r, ignore_errors=True)

print('\n' + (f'{len(fails)} проверок провалено' if fails else 'Все проверки прошли'))
sys.exit(1 if fails else 0)
