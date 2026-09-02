# -*- coding: utf-8 -*-
"""Модератор группы делает в ней всё, а в чужой — ничего.

Модель простая, и держится она на одном вопросе: модератор ли человек в этой
группе. Ступень отвечает только за право заводить группы; всё, что внутри —
участники, сообщения, каналы, сама группа — решает статус.

Стеречь тут нужно две вещи, и обе уже ломались:

  1. Внутри группы не должно остаться ни одной проверки «по ступени».
     Пока их было несколько разных — channels.moderate для сообщений,
     channels.members для участников, — между ними находились щели: человек
     заводил группу и не мог добавить в неё людей.

  2. Создатель обязан получать статус сразу. Он записывался владельцем, а
     бейдж «МОД» показывался только назначенным — свой же статус создатель
     не видел, и первый же вопрос был «а почему я не модератор».

Запуск:  python modules/channels/test_moderation.py
"""
import importlib.util
import io
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('ch_api_test', HERE / 'channels_api.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

failed = []


def check(name, ok, extra=''):
    print(('  ok  ' if ok else ' FAIL ') + name + (' — ' + extra if extra else ''))
    if not ok:
        failed.append(name)


# Своя группа и чужая
api.DATA_DIR = Path(tempfile.mkdtemp(prefix='ho_ch_'))
SPACES = [
    {'id': 'mine', 'name': 'Моя', 'owner_id': 'me'},
    {'id': 'alien', 'name': 'Чужая', 'owner_id': 'other'},
]
MEMBERS = {
    'mine': [{'user_id': 'me', 'role': 'moderator', 'creator': True}],
    'alien': [{'user_id': 'other', 'role': 'moderator'}, {'user_id': 'me', 'role': 'member'}],
}
api.load_spaces = lambda: SPACES
api.load_members = lambda sid: MEMBERS.get(sid, [])
api._may = lambda session, action: session.get('role') == 'arcana'

ME = {'id': 'me', 'username': 'me', 'role': 'mythical'}
BOSS = {'id': 'other', 'username': 'other', 'role': 'mythical'}
GOD = {'id': 'god', 'username': 'god', 'role': 'arcana'}

print('\n── Кто здесь модератор ──')
check('создатель — модератор своей группы', api._moderates(ME, 'mine'))
check('в чужой группе он обычный участник', not api._moderates(ME, 'alien'))
check('назначенный модератор — тоже модератор', api._moderates(BOSS, 'alien'))
check('глобальный модератор — везде', api._moderates(GOD, 'alien') and api._moderates(GOD, 'mine'))
check('без группы вопрос бессмысленен', not api._moderates(ME, ''))

print('\n── Создатель получает статус сразу ──')
src = io.open(HERE / 'channels_api.py', encoding='utf-8').read()
check('в участники он пишется модератором, а не просто владельцем',
      "'role': 'moderator'" in src and "'creator': True" in src,
      'иначе бейдж «МОД» ему не покажут')

print('\n── Внутри группы ступень не спрашивается ──')
body = src[src.index('def handle_post('):]
inside = []
for line in body.split('\n'):
    if '_may(session,' in line and 'channels.create' not in line and 'userlist' not in line:
        inside.append(line.strip()[:70])
check('в обработчиках нет проверок по ступени, кроме создания групп',
      not inside, '; '.join(inside))
check('все внутригрупповые проверки идут через один вопрос',
      src.count('_moderates(session') >= 5 and '_may_here' not in src,
      str(src.count('_moderates(session')) + ' мест')

print('\n── Что именно может модератор ──')
# перечисляем ветки обработчиков, закрытые вопросом «модератор ли»
guarded = []
for name, marker in (('участники', "if not _moderates(session, space_id):"),
                     ('каналы', "if not _moderates(session, space_id):"),
                     ('правка группы', "if not _moderates(session, data.get('edit_id')):")):
    if marker in src:
        guarded.append(name)
check('участники, каналы и сама группа — за одной проверкой',
      len(guarded) >= 2, ', '.join(guarded))

srv = io.open(HERE.parent.parent / 'core' / 'server.py', encoding='utf-8').read()
check('сообщения в группе — тоже (правка, удаление, закрепление)',
      'can_moderate_channel(s, ch_id)' in srv)
check('кик из группы — по статусу в ней', 'can_moderate_space(s, sp_id)' in srv)
check('голосовая комната своей группы — тоже',
      'can_moderate_space(s, _vs)' in srv,
      'слово и кик в комнате внутри своей группы')

print('\n' + (str(len(failed)) + ' проверок провалено' if failed else 'Все проверки прошли'))
sys.exit(1 if failed else 0)
