# -*- coding: utf-8 -*-
"""Насколько быстро замечается упавший сервер и чем за это платим.

Прежде метрики собирались полным опросом по SSH и рассылались всем вошедшим
раз в полминуты — независимо от того, открыт ли у кого-то раздел. Когда
рассылку сделали по подписке, опрос без зрителей разредили до пяти минут, и
падение стало замечаться слишком поздно.

Сейчас опроса два, и это главное, что здесь стережётся:

  живость — TCP-коннект к SSH-порту, три секунды таймаута, никаких процессов.
            Идёт всегда, раз в LIVE_INTERVAL, смотрит на раздел кто-нибудь
            или нет;
  метрики — ssh-процесс на каждую машину, шелл-конвейер, до десяти секунд.
            Только пока на раздел кто-то смотрит.

Отсюда проверки: тревога приходит через два неудачных прохода живости (один
пропущенный чаще означает сетевую икоту, чем упавшую машину), при этом SSH
не запускается ни разу, а когда сервер поднимается — приходит вторая весть.

Запуск:  python modules/servers/test_liveness.py
"""
import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('srv_api_test', HERE / 'servers_api.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

failed = []


def check(name, ok, extra=''):
    print(('  ok  ' if ok else ' FAIL ') + name + (' — ' + extra if extra else ''))
    if not ok:
        failed.append(name)


SERVERS = [
    {'name': 'Horseoff', 'ip': '10.0.0.1', 'role': 'host', 'ssh_port': 22},
    {'name': 'Proxy-01', 'ip': '5.5.5.5', 'role': 'proxy', 'ssh_port': 22},
]

notices = []
ssh_calls = []
alive_state = {'5.5.5.5': True}

api.notify_module_users = lambda mod, act, payload, push=None: notices.append((payload['type'], payload.get('name'), push))
api._check_port = lambda ip, port, timeout=3: alive_state.get(ip, True)
api._ssh = lambda *a, **k: ssh_calls.append(a) or None
api.ws_push_servers = lambda data: None
sys.modules['server'] = type('stub', (), {
    'ws_push_servers': staticmethod(lambda data: None),
    'notify_module_users': staticmethod(api.notify_module_users),
    'has_metric_subs': staticmethod(lambda: False),
    'get_poll_interval': staticmethod(lambda: 30),
})

print('\n── Живость проверяется дёшево ──')
alive = api._alive_pass(SERVERS)
check('свой сервер не проверяем — на нём всё и крутится',
      next(a for a in alive if a['ip'] == '10.0.0.1')['online'] is True)
check('SSH при проверке живости не запускается ни разу',
      not ssh_calls, str(len(ssh_calls)) + ' вызовов')

print('\n── Сколько ждать тревоги ──')
alive_state['5.5.5.5'] = False
api._announce_down(api._alive_pass(SERVERS))
check('на первом неудачном проходе молчим — это может быть икота сети',
      not notices, str(notices))
api._announce_down(api._alive_pass(SERVERS))
down = [n for n in notices if n[0] == 'server_down']
check('на втором — тревога', len(down) == 1, str(notices))
check('и в ней написано, какая машина', down and down[0][1] == 'Proxy-01', str(down))
check('в push уходит то же самое', down and down[0][2] and 'не отвечает' in down[0][2][1], str(down))

secs = 2 * api.LIVE_INTERVAL
check('от падения до тревоги — не больше минуты', secs <= 60, str(secs) + ' с')

api._announce_down(api._alive_pass(SERVERS))
check('дважды об одном не сообщаем',
      len([n for n in notices if n[0] == 'server_down']) == 1, str(len(notices)))

print('\n── Возвращение ──')
alive_state['5.5.5.5'] = True
api._announce_down(api._alive_pass(SERVERS))
up = [n for n in notices if n[0] == 'server_up']
check('о поднявшемся сервере сообщают', len(up) == 1, str(notices))
check('SSH так и не понадобился', not ssh_calls, str(len(ssh_calls)) + ' вызовов')

print('\n' + (str(len(failed)) + ' проверок провалено' if failed else 'Все проверки прошли'))
sys.exit(1 if failed else 0)
