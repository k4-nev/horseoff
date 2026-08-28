# -*- coding: utf-8 -*-
"""Версия поднимается ровно на изменение выложенных файлов и ни на что больше.

Номер живёт в одном месте — core/version.json — и пишет туда сервер, сравнивая
отпечаток статики с записанным. Руками файл трогать не нужно.

Две ловушки, которые здесь стерегутся:

Самобамп. version.json лежит в core/ рядом с остальной статикой; попади он в
собственный отпечаток — запись меняла бы его mtime, отпечаток снова расходился
бы, и версия росла бы на каждом запросе.

Пропущенный подъём. Если в файле есть номер, но нет отпечатка, сверять не с
чем — значит считаем, что файлы изменились, и поднимаем. Ровно в этом
состоянии находится выкладка, которая ставит саму авто-версию: не поднять там
означало прислать уведомление с той же версией, что уже стоит у человека.

Запуск:  python core/test_version.py
"""
import importlib.util
import io
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

SRC = Path(__file__).resolve().parent / 'server.py'
spec = importlib.util.spec_from_file_location('horseoff_srv_ver', SRC)
srv = importlib.util.module_from_spec(spec)
sys.modules['horseoff_srv_ver'] = srv
spec.loader.exec_module(srv)

fails = []


def check(name, ok, extra=''):
    print(('  ok  ' if ok else ' FAIL ') + name + (' — ' + str(extra) if extra else ''))
    if not ok:
        fails.append(name)


# Своя песочница: настоящий core/ трогать нельзя
box = Path(tempfile.mkdtemp())
core = box / 'core'
mods = box / 'modules' / 'demo'
core.mkdir(parents=True)
mods.mkdir(parents=True)
(core / 'shell.js').write_text('// код', encoding='utf-8')
(mods / 'demo.js').write_text('// модуль', encoding='utf-8')

srv.ROOT_DIR = box
srv.CORE_DIR = core
srv.MODULES_DIR = box / 'modules'
srv.VERSION_FILE = core / 'version.json'
(core / 'version.json').write_text(json.dumps({'version': '2.333'}), encoding='utf-8')


def fresh():
    """Сбрасываем 10-секундный кэш отпечатка — в тесте файлы меняются чаще."""
    srv._BUILD_CACHE['at'] = 0
    return srv.ensure_version()


first = fresh()
# Номер есть, отпечатка нет — сверить не с чем, значит файлы считаем
# изменившимися. Ровно так выглядит выкладка, которая ставит авто-версию.
check('номер без отпечатка поднимается', first['version'] == '2.334', first)
check('отпечаток записан в файл', 'build' in json.loads((core / 'version.json').read_text(encoding='utf-8')))

again = fresh()
check('повторный вызов без изменений не поднимает', again['version'] == '2.334', again)

# Ключевая проверка: сервер только что переписал version.json
for i in range(4):
    again = fresh()
check('запись version.json не поднимает саму себя', again['version'] == '2.334', again)

# Меняем файл — как при выкладке
time.sleep(1.1)
(core / 'shell.js').write_text('// код, версия два', encoding='utf-8')
after = fresh()
check('изменение файла поднимает номер', after['version'] == '2.335', after)
check('отпечаток тоже сменился', after['build'] != first['build'])

still = fresh()
check('после подъёма снова тихо', still['version'] == '2.335', still)

# Новый файл модуля
time.sleep(1.1)
(mods / 'extra.css').write_text('.a{}', encoding='utf-8')
check('новый файл модуля поднимает номер', fresh()['version'] == '2.336')

# Данные пользователей на версию не влияют
data = box / 'data'
data.mkdir()
time.sleep(1.1)
(data / 'users.json').write_text('[]', encoding='utf-8')
check('изменения в data/ версию не трогают', fresh()['version'] == '2.336')

# Исходники React в браузер не едут
rs = mods / 'react-src' / 'src'
rs.mkdir(parents=True)
time.sleep(1.1)
(rs / 'App.jsx').write_text('x', encoding='utf-8')
(rs / 'main.js').write_text('x', encoding='utf-8')
check('исходники react-src версию не трогают', fresh()['version'] == '2.336')

# Формат номера
check('поднимается последняя компонента', srv._bump('2.333') == '2.334', srv._bump('2.333'))
check('трёхзначный номер тоже', srv._bump('1.2.9') == '1.2.10', srv._bump('1.2.9'))
check('нечисловой хвост не роняет', srv._bump('2.beta') == '2.beta.1', srv._bump('2.beta'))

# Установка с нуля: файла нет вовсе — сверять не с чем и незачем
box2 = Path(tempfile.mkdtemp())
(box2 / 'core').mkdir(parents=True)
(box2 / 'modules').mkdir()
(box2 / 'core' / 'shell.js').write_text('x', encoding='utf-8')
srv.ROOT_DIR, srv.CORE_DIR, srv.MODULES_DIR = box2, box2 / 'core', box2 / 'modules'
srv.VERSION_FILE = box2 / 'core' / 'version.json'
srv._BUILD_CACHE['at'] = 0
check('установка с нуля начинает с базового номера', srv.ensure_version()['version'] == '2.0')
srv._BUILD_CACHE['at'] = 0
check('и сразу после неё тихо', srv.ensure_version()['version'] == '2.0')
shutil.rmtree(box2, ignore_errors=True)
srv.ROOT_DIR, srv.CORE_DIR, srv.MODULES_DIR = box, core, box / 'modules'
srv.VERSION_FILE = core / 'version.json'

# Битый файл не роняет сервер
(core / 'version.json').write_text('{не json', encoding='utf-8')
srv._BUILD_CACHE['at'] = 0
try:
    out = srv.ensure_version()
    check('битый version.json пересоздаётся', out['version'] == '2.0', out)
except Exception as e:
    check('битый version.json пересоздаётся', False, repr(e))

shutil.rmtree(box, ignore_errors=True)
print('\n' + ('ВСЁ ЗЕЛЁНОЕ' if not fails else str(len(fails)) + ' провалено'))
raise SystemExit(1 if fails else 0)
