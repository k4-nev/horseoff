# -*- coding: utf-8 -*-
"""Лестница доступов: ступени, пороги и выдача разделов.

Роли решают, кто что видит и кому что можно выдать. До переделки лестница из
семи ступеней работала как три: uncommon, rare и mythical не открывали ровным
счётом ничего, а «кто тут главный» было записано в коде трижды и по-разному —
ADMIN_ROLES в каналах, _OWNER_ROLES в ботах, чёрный список в серверах.

Здесь стережём четыре вещи:
  1. каждая ступень что-то добавляет — иначе она бессмысленна;
  2. лестница накопительная: старший может всё, что может младший;
  3. порог редактора порогов не двигается ничем — иначе тот, кому его
     однажды открыли, поднимает себе права до владельца;
  4. раздел можно выдать только тому, чья ступень его тянет, и при подъёме
     порога выдача, переставшая действовать, снимается.

Запуск:  python core/test_roles.py
"""
import io
import json
import shutil
import sys
import tempfile
from pathlib import Path

CORE = Path(__file__).resolve().parent
sys.path.insert(0, str(CORE))
import roles as R  # noqa: E402

failed = []


def check(name, ok, extra=''):
    print(('  ok  ' if ok else ' FAIL ') + name + (' — ' + extra if extra else ''))
    if not ok:
        failed.append(name)


tmp = Path(tempfile.mkdtemp(prefix='ho_roles_'))
R.init(tmp)

print('\n── Ступени ──')
by_role = {}
for a, r, _s, _t in R.ACTIONS:
    by_role.setdefault(r, []).append(a)
empty = [r for r in R.ROLES_ASC if r != 'common' and not by_role.get(r)]
check('каждая ступень выше common что-то открывает',
      not empty, 'пустые: ' + (', '.join(empty) or 'нет'))
check('все семь ступеней использованы',
      len({r for _a, r, _s, _t in R.ACTIONS}) >= 6,
      ', '.join(sorted(by_role, key=R.ROLES_ASC.index)))

print('\n── Накопительность ──')
broken = []
for a in R.DEFAULTS:
    need = R.min_role(a)
    for role in R.ROLES_ASC[R.ROLES_ASC.index(need):]:
        if not R.may(role, a):
            broken.append(role + ' не тянет ' + a)
check('старшая ступень тянет всё, что тянет младшая', not broken, '; '.join(broken[:3]))
check('common не тянет ничего сверх базового',
      not [a for a in R.DEFAULTS if R.min_role(a) != 'common' and R.may('common', a)])
check('arcana тянет всё', all(R.may('arcana', a) for a in R.DEFAULTS))

print('\n── Разделы выдаются по ступени ──')
check('серверы — с той же ступени, что и право их видеть',
      R.module_min_role('servers') == R.min_role('servers.view'),
      R.module_min_role('servers'))
check('uncommon серверы выдать нельзя, rare — можно',
      not R.can_have_module('uncommon', 'servers') and R.can_have_module('rare', 'servers'))
check('админку нельзя выдать никому, кроме владельца',
      not any(R.can_have_module(r, 'admin') for r in R.ROLES_ASC if r != 'arcana'))

print('\n── Правка порогов ──')
taken, refused = R.set_thresholds({'servers.view': 'uncommon'})
check('порог опускается', R.min_role('servers.view') == 'uncommon', str(taken))
check('вместе с ним едет и выдача раздела',
      R.can_have_module('uncommon', 'servers'))
taken, refused = R.set_thresholds({'roles.edit': 'immortal'})
check('порог редактора порогов не сдвинуть',
      R.min_role('roles.edit') == 'arcana' and 'roles.edit' in refused,
      str(refused))
taken, refused = R.set_thresholds({'выдуманное': 'rare', 'servers.view': 'богоподобный'})
check('мусор в правке отвергается', len(refused) == 2 and not taken, str(refused))

print('\n── Правки переживают перезапуск ──')
R.set_thresholds({'servers.view': 'mythical'})
R.init(tmp)
check('порог поднялся и сохранился', R.min_role('servers.view') == 'mythical')
saved = json.loads((tmp / 'roles.json').read_text(encoding='utf-8'))
check('в файле только правки, без умолчаний',
      set(saved['actions']) <= set(R.DEFAULTS) and 'roles.edit' not in saved['actions'],
      ', '.join(saved['actions']))

print('\n── Согласие с сервером ──')
srv = io.open(CORE / 'server.py', encoding='utf-8').read()
check('ядро больше не держит свою копию лестницы',
      'ROLE_RANK = roles_mod.ROLE_RANK' in srv)
check('в ядре есть общая проверка may()', 'def may(session, action):' in srv)
check('роль для проверки берётся из записи, а не из сессии',
      "u = find_user(session['username'])" in srv.split('def may(session, action):')[1][:400])
mods = io.open(CORE.parent / 'modules' / 'channels' / 'channels_api.py', encoding='utf-8').read()
check('в каналах не осталось своего набора админов',
      "session['role'] not in ADMIN_ROLES" not in mods)
srvs = io.open(CORE.parent / 'modules' / 'servers' / 'servers_api.py', encoding='utf-8').read()
check('в серверах не осталось чёрного списка ролей',
      "in ('common','uncommon','rare','mythical','legendary')" not in srvs)

shutil.rmtree(tmp, ignore_errors=True)
print('\n' + (str(len(failed)) + ' проверок провалено' if failed else 'Все проверки прошли'))
sys.exit(1 if failed else 0)
