# -*- coding: utf-8 -*-
"""Лестница доступов: что открывает каждая ступень.

Ранги — это ступени, а не звания: каждая следующая добавляет к предыдущей и
ничего не отменяет. Здесь записано, с какой ступени открывается каждое
действие, и это единственное место, где такое написано. До этого проверки
жили в трёх разных видах — ADMIN_ROLES в каналах, _OWNER_ROLES в ботах и
чёрный список в серверах, — и три из семи ступеней не открывали ничего.

Пороги можно менять из админки: правки ложатся в data/roles.json поверх
значений по умолчанию. Два исключения не двигаются ничем — см. FIXED:
редактор порогов и всё недоделанное.

Доступ к модулю выводится отсюда же: модуль можно выдать тому, чья ступень
тянет его «смотровое» действие. Поднялся порог — выдача, переставшая
действовать, снимается (см. sync_grants).

Отдельная история — каналы. Право модерировать даёт не ступень, а статус в
самой группе: кто её создал, тот в ней и хозяин, и делает всё, что делает
модератор. Ступень отвечает только за право заводить группы и каналы
(channels.create); в чужих группах человек остаётся обычным участником.
Глобальная модерация (channels.moderate) — отдельная ступень поверх этого.
"""
import json
import threading
from pathlib import Path

ROLE_RANK = {'arcana': 7, 'immortal': 6, 'legendary': 5, 'mythical': 4,
             'rare': 3, 'uncommon': 2, 'common': 1}
ROLES_ASC = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal', 'arcana']

# Пороги, которые не опускаются ничем.
#   roles.edit  — сам редактор порогов: открой его кому-то, и он поднимет
#                 себе права до владельца;
#   dev.preview — всё недоделанное. Правило общее: если функция в разработке,
#                 её видит только владелец. Так незаконченное можно держать
#                 в общей сборке, не пряча за отдельными ветками, и никто,
#                 кроме владельца, на него не наткнётся.
FIXED = {'roles.edit': 'arcana', 'dev.preview': 'arcana'}

# (действие, ступень по умолчанию, раздел, человеческое название)
ACTIONS = [
    ('msg.attach',           'uncommon',  'messenger', 'Файлы в личных сообщениях'),
    ('msg.clear',            'mythical',  'messenger', 'Очистка переписки'),

    ('channels.read',        'common',    'channels',  'Читать каналы'),
    ('channels.post',        'uncommon',  'channels',  'Писать в каналы'),
    ('channels.attach',      'uncommon',  'channels',  'Файлы в каналах'),
    ('voice.join',           'uncommon',  'channels',  'Входить в голосовую комнату'),
    ('channels.create',      'mythical',  'channels',  'Создавать группы и каналы'),
    ('channels.moderate',    'legendary', 'channels',  'Модерация всех каналов'),
    ('channels.members',     'legendary', 'channels',  'Состав участников групп'),
    ('channels.userlist',    'legendary', 'channels',  'Список пользователей для добавления'),
    ('voice.moderate',       'legendary', 'channels',  'Модерация голосовой комнаты'),

    ('servers.view',         'rare',      'servers',   'Видеть серверы и метрики'),
    ('servers.manage',       'immortal',  'servers',   'Добавлять и удалять серверы'),
    ('servers.keys',         'immortal',  'servers',   'Ключи VDS'),
    ('servers.interval',     'immortal',  'servers',   'Интервал опроса'),

    ('bots.view',            'rare',      'bots',      'Видеть выданных ботов'),
    ('bots.control',         'mythical',  'bots',      'Управлять ботом'),
    ('bots.manage',          'immortal',  'bots',      'Создавать ботов и ключи'),
    ('bots.access',          'immortal',  'bots',      'Выдавать доступ к боту'),

    ('mp.view',              'immortal',  'mp',        'Раздел MP продвижения'),

    ('users.manage',         'arcana',    'admin',     'Пользователи: создание и правка'),
    ('modules.grant',        'arcana',    'admin',     'Выдача модулей'),
    ('push.test',            'arcana',    'admin',     'Тестовое уведомление'),
    ('roles.edit',           'arcana',    'admin',     'Настройки доступов ролей'),
    ('dev.preview',          'arcana',    'admin',     'Функции в разработке'),
]

DEFAULTS = {a: r for a, r, _, _ in ACTIONS}
SECTION = {a: s for a, _, s, _ in ACTIONS}
TITLE = {a: t for a, _, _, t in ACTIONS}

# Действие, без которого раздел бессмысленен: им и определяется, кому его
# вообще можно выдать. Разделы, которых тут нет, доступны всем.
MODULE_VIEW = {
    'channels': 'channels.read',
    'servers': 'servers.view',
    'bots': 'bots.view',
    'mp': 'mp.view',
    'admin': 'users.manage',
}

_lock = threading.Lock()
_overrides = {}
_path = None


def init(data_dir):
    """Подхватываем сохранённые пороги. Зовётся один раз при старте."""
    global _path, _overrides
    _path = Path(data_dir) / 'roles.json'
    with _lock:
        _overrides = {}
        if _path.exists():
            try:
                saved = json.loads(_path.read_text(encoding='utf-8'))
                for a, r in (saved.get('actions') or {}).items():
                    if a in DEFAULTS and a not in FIXED and r in ROLE_RANK:
                        _overrides[a] = r
            except Exception as e:
                print(f"  roles.json не прочитан ({e}) — берём пороги по умолчанию")


def matrix():
    """Действующие пороги: умолчания плюс правки."""
    with _lock:
        out = dict(DEFAULTS)
        out.update(_overrides)
        out.update(FIXED)
        return out


def min_role(action):
    return matrix().get(action, 'arcana')


def role_at_least(role, need):
    if not need:
        return True
    return ROLE_RANK.get(role, 0) >= ROLE_RANK.get(need, 0)


def may(role, action):
    """Тянет ли ступень это действие. arcana тянет всё всегда."""
    if role == 'arcana':
        return True
    return role_at_least(role, min_role(action))


def module_min_role(module_id):
    """С какой ступени раздел вообще имеет смысл выдавать."""
    act = MODULE_VIEW.get(module_id)
    return min_role(act) if act else 'common'


def can_have_module(role, module_id):
    return role == 'arcana' or role_at_least(role, module_min_role(module_id))


def set_thresholds(changes):
    """Сохранить новые пороги. Возвращает (принятые, отклонённые)."""
    taken, refused = {}, {}
    with _lock:
        for a, r in (changes or {}).items():
            if a in FIXED:
                refused[a] = 'порог закреплён за владельцем'
            elif a not in DEFAULTS:
                refused[a] = 'неизвестное действие'
            elif r not in ROLE_RANK:
                refused[a] = 'неизвестная ступень'
            else:
                _overrides[a] = r
                taken[a] = r
        snapshot = dict(_overrides)
    if _path is not None:
        try:
            _path.write_text(json.dumps({'actions': snapshot}, ensure_ascii=False, indent=2),
                             encoding='utf-8')
        except Exception as e:
            print(f"  roles.json не сохранён: {e}")
    return taken, refused


def describe():
    """Для админки и справки: ступени, действия, разделы — одним куском."""
    m = matrix()
    return {
        'roles': ROLES_ASC,
        'fixed': list(FIXED),
        'actions': [
            {'id': a, 'title': TITLE[a], 'section': SECTION[a],
             'role': m[a], 'default': DEFAULTS[a], 'locked': a in FIXED}
            for a, _, _, _ in ACTIONS
        ],
        'modules': {mid: module_min_role(mid) for mid in MODULE_VIEW},
    }
