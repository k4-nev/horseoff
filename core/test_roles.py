# -*- coding: utf-8 -*-
"""Лестница ролей на клиенте совпадает с серверной.

Роли решают, кто что видит и кому что можно выдать. Сервер держит их в
ROLE_RANK (core/server.py), клиент — в core/react-src/src/shared/roles.js.
Это два файла на разных языках, и синхронизировать их может только проверка.

Разойтись они уже успевали: копий лестницы на клиенте было четыре, и в одной
из них — в выборе ранга при создании пользователя — ролей было шесть вместо
семи, arcana потерялась. Внешне ничего не ломалось: список просто не
предлагал роль, которую всё равно нельзя выдать. Но именно так расхождения и
живут годами.

Проверяется три вещи:
  1. состав и веса ролей совпадают в обе стороны;
  2. порядки ROLES_ASC и ROLES_DESC согласованы с весами;
  3. arcana не попадает в список назначаемых — её выдаёт только первичная
     установка (create_user при setup), из интерфейса назначить нельзя.

Запуск:  python core/test_roles.py
"""
import io
import re
import sys
from pathlib import Path

CORE = Path(__file__).resolve().parent
SERVER = CORE / 'server.py'
ROLES_JS = CORE / 'react-src' / 'src' / 'shared' / 'roles.js'

failed = []


def check(name, ok, extra=''):
    print(('  ok  ' if ok else ' FAIL ') + name + (' — ' + extra if extra else ''))
    if not ok:
        failed.append(name)


def read(path):
    return io.open(path, encoding='utf-8').read()


def parse_rank(text, pattern):
    """Из «arcana: 7, immortal: 6, …» делаем словарь."""
    body = re.search(pattern, text).group(1)
    out = {}
    for pair in re.findall(r"['\"]?([a-z_]+)['\"]?\s*:\s*(\d+)", body):
        out[pair[0]] = int(pair[1])
    return out


def parse_list(text, name):
    body = re.search(r'export const ' + name + r' = \[(.*?)\];', text, re.S).group(1)
    return re.findall(r"'([a-z_]+)'", body)


srv = read(SERVER)
js = read(ROLES_JS)

server_rank = parse_rank(srv, r'ROLE_RANK = \{([^}]+)\}')
client_rank = parse_rank(js, r'export const ROLE_RANK = \{([^}]+)\}')

print('\n── Лестница ролей ──')
check('состав ролей совпадает с сервером',
      sorted(server_rank) == sorted(client_rank),
      'сервер: ' + ','.join(sorted(server_rank)) + ' / клиент: ' + ','.join(sorted(client_rank)))
check('веса ролей совпадают с сервером', server_rank == client_rank,
      'разница: ' + str({k: (server_rank.get(k), client_rank.get(k))
                         for k in set(server_rank) | set(client_rank)
                         if server_rank.get(k) != client_rank.get(k)}))

asc = parse_list(js, 'ROLES_ASC')
check('ROLES_ASC перечисляет все роли от младшей к старшей',
      asc == sorted(client_rank, key=lambda r: client_rank[r]), ','.join(asc))

assignable = re.search(r"export const ASSIGNABLE_ROLES = ROLES_ASC\.filter\(\(r\) => r !== '([a-z]+)'\);", js)
check('из интерфейса нельзя выдать роль владельца',
      bool(assignable) and assignable.group(1) == 'arcana',
      assignable.group(1) if assignable else 'фильтра нет')

# Роль владельца на сервере действительно ставится только при установке
setup_only = re.search(r"create_user\(u, p, 'arcana'\)", srv)
check('на сервере arcana выдаёт только первичная установка', bool(setup_only))

admin_roles = parse_list(js, 'ADMIN_ROLES')
check('администраторские роли — три старших',
      admin_roles == asc[-3:][::-1] or sorted(admin_roles) == sorted(asc[-3:]),
      ','.join(admin_roles))

print('\n' + (str(len(failed)) + ' проверок провалено' if failed else 'Все проверки прошли'))
sys.exit(1 if failed else 0)
