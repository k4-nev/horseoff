# -*- coding: utf-8 -*-
"""Каждое действие лестницы где-то действительно проверяется.

Объявить действие в core/roles.py и забыть поставить проверку — самая тихая
из возможных ошибок: в админке порог виден, в справке написан, а на сервере
не спрашивается никто. Так и вышло с «Писать в каналы»: ступень значилась
uncommon, а common спокойно писал.

Здесь каждое действие обязано быть либо названо в коде сервера — то есть
проверено поимённо, — либо оказаться «смотровым» действием раздела: такие
закрывает общий привратник модульных API, ему хватает одной проверки на все
разделы сразу.

Запуск:  python core/test_enforcement.py
"""
import glob
import io
import sys
from pathlib import Path

CORE = Path(__file__).resolve().parent
ROOT = CORE.parent
sys.path.insert(0, str(CORE))
import roles as R  # noqa: E402

failed = []


def check(name, ok, extra=''):
    print(('  ok  ' if ok else ' FAIL ') + name + (' — ' + extra if extra else ''))
    if not ok:
        failed.append(name)


server_files = [CORE / 'server.py'] + [Path(p) for p in sorted(glob.glob(str(ROOT / 'modules' / '*' / '*_api.py')))]
blob = '\n'.join(io.open(f, encoding='utf-8').read() for f in server_files)

# Действия владельца проходят через require_role('arcana') — отдельный путь,
# заведённый до лестницы и сохранённый как есть.
OWNER = {'users.manage', 'modules.grant', 'push.test', 'roles.edit', 'dev.preview'}
BY_GATE = set(R.MODULE_VIEW.values())   # закрывает привратник разделов

print('\n── Проверки на месте ──')
missing = []
for act, _default, _section, title in R.ACTIONS:
    if act in OWNER or act in BY_GATE:
        continue
    if ("'" + act + "'") not in blob:
        missing.append(act + ' (' + title + ')')
check('каждое действие проверяется поимённо', not missing, '; '.join(missing))

check('смотровые действия закрывает привратник разделов',
      'def _module_gate(' in blob and 'can_have_module' in blob)
check('привратник спрашивает и выдачу раздела',
      "granted = (u or {}).get('modules')" in blob)

print('\n── Отказ объясняет, чего не хватает ──')
check('по HTTP в ответе есть нужная ступень', "'need_role': roles_mod.min_role(action)" in blob)
check('по вебсокету — тоже', "'type': 'denied'" in blob)

print(chr(10) + '── Модерация — от статуса в группе ──')
srv = io.open(CORE / 'server.py', encoding='utf-8').read()
mod = srv[srv.index('def can_moderate_channel('):]
mod = mod[:mod.index('def can_moderate_space(')]
check('право модерировать канал даёт статус в группе, а не ступень',
      'is_space_boss' in mod and 'moderate_own' not in mod,
      'ступень отвечает только за право заводить группы')
check('удаление сообщения не рассылается, если отказано',
      "await _deny(websocket, 'channels.moderate')" in srv,
      'иначе сообщение пропадает у всех и возвращается при перезагрузке')

print(chr(10) + '── Подсказки не запрещают, а объясняют ──')
acc = io.open(CORE / 'react-src' / 'src' / 'shared' / 'access.jsx', encoding='utf-8').read()
head = acc[acc.index('export function may(action)'):]
check('пока пороги не приехали, интерфейс ничего не прячет',
      'if (!state.role) return true;' in head[:400],
      'иначе один неудачный запрос молча убирает кнопки у всех')

print('\n── Разделение похожих прав ──')
pairs = [
    ('channels.read', 'channels.post', 'читать канал и писать в него'),
    ('bots.view', 'bots.control', 'видеть бота и управлять им'),
    ('servers.view', 'servers.manage', 'видеть серверы и менять их'),
    ('channels.create', 'channels.moderate', 'завести свою группу и модерировать все'),
]
for low, high, what in pairs:
    check('разные ступени: ' + what,
          R.ROLE_RANK[R.min_role(low)] <= R.ROLE_RANK[R.min_role(high)],
          R.min_role(low) + ' / ' + R.min_role(high))

print('\n' + (str(len(failed)) + ' проверок провалено' if failed else 'Все проверки прошли'))
sys.exit(1 if failed else 0)
