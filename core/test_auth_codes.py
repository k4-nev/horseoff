# -*- coding: utf-8 -*-
"""401 не должен обозначать отказ по правам.

Клиент на 401 считает токен мёртвым и выходит из приложения:

    if (r.status === 401 && this.token) { this.logout(); return null; }

Пока ролевые точки отвечали 401 живому пользователю, один выданный не по
роли модуль выбрасывал его из Horseoff насовсем — вход, загрузка модуля,
отказ, выход, и так по кругу. Отказ по правам обязан быть 403.

Правило проверки: у каждого 401 смотрим, чем получена сессия, которую он
отвергает. get_session — выясняли, кто пришёл, 401 уместен. require_role —
выясняли, что ему можно, и тогда это 403.

Числовой литерал ищем через tokenize, поэтому ни комментарии, ни строки
вроде этой в выборку не попадают.

Запуск:  python core/test_auth_codes.py
"""
import io
import re
import sys
import token as T
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [ROOT / 'core' / 'server.py'] + sorted((ROOT / 'modules').glob('*/*_api.py'))

ASSIGN = re.compile(r'^\s*\w+\s*=\s*(\w+)\s*\(')
AUTHN_FN = {'get_session', 'get_session_by_token', 'find_session'}
AUTHZ_FN = {'require_role'}
LOOK_BACK = 8


def status_lines(path):
    """Номера строк, где 401 стоит как число, а не в тексте."""
    out = []
    with io.open(path, 'rb') as f:
        for tok in tokenize.tokenize(f.readline):
            if tok.type == T.NUMBER and tok.string == '401':
                out.append(tok.start[0])
    return out


def classify(lines, n):
    """Чем получена сессия, которую отвергает 401 на строке n."""
    line = lines[n - 1]
    # Отказ во входе: логина ещё не было, это тоже «кто ты»
    if 'Неверный логин или пароль' in line:
        return 'authn', 'отказ во входе'
    for k in range(n - 1, max(0, n - 1 - LOOK_BACK) - 1, -1):
        src = lines[k]
        if 'get_session_by_token(' in src and 'not' in src:
            return 'authn', 'get_session_by_token'
        # Ветка вида `if get_session(self): ... 403` — сессию проверяют
        # прямо в условии, без присваивания
        if re.match(r'^\s*if\s+(not\s+)?get_session\(', src):
            return 'authn', 'get_session в условии'
        m = ASSIGN.match(src)
        if m:
            fn = m.group(1)
            if fn in AUTHZ_FN:
                return 'authz', fn
            if fn in AUTHN_FN:
                return 'authn', fn
            return 'unknown', fn
    return 'unknown', 'не нашли, откуда сессия'


bad = []
rows = []

for path in TARGETS:
    lines = io.open(path, encoding='utf-8').read().split('\n')
    for n in status_lines(path):
        kind, why = classify(lines, n)
        rows.append((path, n, kind, why))
        if kind != 'authn':
            bad.append((path.relative_to(ROOT), n, why, lines[n - 1].strip()))

by_file = {}
for path, n, kind, why in rows:
    by_file.setdefault(path, []).append(kind)

print('Проверено мест с 401:')
for path, kinds in by_file.items():
    name = str(path.relative_to(ROOT)).replace('\\', '/')
    print('  %-34s %d' % (name, len(kinds)))
for path in TARGETS:
    if path not in by_file:
        print('  %-34s 0' % str(path.relative_to(ROOT)).replace('\\', '/'))

if bad:
    print('\nОтказ по правам под видом 401 — это выкидывает пользователя из приложения:')
    for p, n, why, src in bad:
        print('  %s:%s  (%s)  %s' % (str(p).replace('\\', '/'), n, why, src))
    sys.exit(1)

print('\nВсе 401 отвергают сессию, полученную через get_session — то есть')
print('отвечают на вопрос «кто пришёл». Отказы по правам отдают 403.')
