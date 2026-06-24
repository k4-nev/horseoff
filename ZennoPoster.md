# ZennoPoster ↔ Horseoff: интеграция ботов

Контекст разработки моста между ботами ZennoPoster и приложением horseoff.
Читать целиком перед любой работой по этой теме — иначе потеряется логика.

## Что мы вообще делаем и зачем

Боты крутятся на сервере **ZennoPoster** (версия 7.8.12.0). Задача — связать их
с приложением **horseoff**, чтобы прямо в вебе видеть состояние ботов, их
прогресс, логи, таблицы и управлять ими. ZennoPoster выступает источником
данных, horseoff — панелью управления и мониторинга.

У ZennoPoster **нет внешнего REST API** в этой версии — только внутренние
C# методы. Поэтому связь делаем через **WebSocket-клиент на C#**, который
запускается прямо внутри проекта ZennoPoster (C#-блок) и стучится в
horseoff по WS.

## Архитектура связи

- horseoff поднимает WS-сервер для ботов на пути `/ws/bots`.
- Бот (C# в ZennoPoster) подключается, авторизуется по `api_key`,
  отправляет **манифест** (описание интерфейса — какие контролы рисовать),
  затем шлёт обновления данных (`ctrl_update`), логи (`log`), события (`event`).
- horseoff рисует интерфейс динамически по манифесту и обновляет значения
  контролов в реальном времени.

### Протокол WS (типы сообщений бот → сервер)

- `{"type":"auth","api_key":"hb_..."}` — авторизация (первое сообщение).
- `{"type":"manifest","version":"1.0","sub":"...","controls":[...]}` —
  описание интерфейса. **Сохраняется на диск сервера**, шлётся один раз.
- `{"type":"ctrl_update","ctrl_id":"<id>","data":{...}}` — обновить значение
  одного контрола. **Сохраняется на диск** (чтобы при переключении модулей
  не было пустоты). Сбрасывается, когда бот уходит в офлайн.
- `{"type":"log","level":"INFO|WARN|ERROR|SUCCESS","msg":"..."}` — лог.
  На уровне ERROR шлётся push (rate-limit 20 сек на бота).
- `{"type":"event","title":"...","body":"..."}` — явный запрос push-уведомления.
- `{"type":"stats","kpi":[...],"hourly":[...],"daily":[...]}` — статистика.
- `{"type":"ping"}` → сервер отвечает `{"type":"pong"}`.

Сервер → бот:
- `{"type":"auth_ok","bot_id":"...","name":"..."}`
- `{"type":"command","cmd":...}` — команды из horseoff (очередь флушится при коннекте).
- `{"type":"error","msg":"..."}`

### Форматы данных контролов (`ctrl_update.data`)

- **label** (тип `label`): `{"text":"20"}`. Если `style` не передан — стиль
  (цвет) сохраняется. Только число/текст. Стиль `accent` = зелёный.
- **progress** (тип `progress`): `{"value":6,"total":"1038 из 15000"}`.
  `value` — процент 0–100, `total` — текст под прогрессбаром.
- **table** (тип `table`): `{"columns":[{"key":"q","label":"Запрос"},...],"rows":[{...}]}`.

## Подключение / сеть (ВАЖНО)

- Сервер horseoff: `157.22.207.243`. HTTP на `8550`, WS на `8551` (внутренние).
- **Снаружи порты 8550/8551 ЗАКРЫТЫ.** Открыты только 80 и 443 (nginx).
- ZennoPoster должен подключаться по **тому же адресу, что в браузере**,
  заменив `https://` → `wss://`. Пример: `wss://ТВОЙ_ДОМЕН/ws/bots`.
- НЕ использовать `ws://157.22.207.243:8551` — даст
  «Невозможно соединиться с удаленным сервером».
- Браузерный WS строится как `window.location.host + '/ws'`, бот идёт на
  `/ws/bots` через тот же nginx.

## Эволюция архитектуры бота (как пришли к текущему решению)

1. **Сначала** был один большой C#-блок с бесконечным циклом внутри
   (connect → auth → manifest → loop: send data + ping). Работало, но:
   - **проблема остановки:** бесконечный цикл внутри C# не давал ZennoPoster
     остановить поток — ZP ждёт завершения C#-блока, а оно не наступает.
   - идея с переменной `horseoff_stop` отвергнута: в работающем процессе
     ZennoPoster нельзя управлять переменными извне.

2. **Текущее решение — 3 отдельных C#-блока + общий статический класс.**
   Цикл навешивает сам пользователь средствами ZennoPoster (вокруг блока 2),
   поэтому остановка работает штатно — управление возвращается ZP между
   итерациями.

   - Объект `ClientWebSocket` нельзя положить в переменную ZP (там строки),
     поэтому он живёт в **статическом классе `HoBridge`** в «Своём коде»
     проекта — статика жива всё время работы проекта.

3. **Проблема ухода в офлайн при разрыве:** сервер настроен с
   `ping_interval=20, ping_timeout=10` — шлёт protocol-level PING и ждёт PONG.
   `ClientWebSocket` отвечает на PING **только пока кто-то вызывает
   `ReceiveAsync`**. В схеме из 3 блоков фонового приёма не было → PONG не
   уходил → сервер рвал коннект через ~30 сек.
   **Фикс:** в блоке 1 запускается фоновая `Task`, которая постоянно читает
   сокет (`HoBridge.Recv`) — держит соединение живым и принимает команды.

## Интервал обновления

Изначально цикл слал данные каждые **5 секунд**. Цикл вокруг блока 2 в
ZennoPoster ставить на **5 сек** (можно меньше, но 5 норм).

## Текущий рабочий код (для проекта «Склик конкурентов»)

Переменные проекта ZennoPoster:
- `horseoff_sklik_api` — API-ключ бота (`hb_...`).
- `horseoff_sklik_task` — имя задачи для `ZennoPoster.GetThreadsCount(taskName)`.
- Таблица: `"Процесс Склик"` (хардкод). Колонки: 0=Запрос, 1=Артикул,
  2=Статус, 3=Кол-во(total), 4=Выполнено(done).

### Свой код проекта (Project Settings → «Свой код»)

```csharp
public static class HoBridge {
    public static System.Net.WebSockets.ClientWebSocket Ws;
    public static System.Threading.Tasks.Task Recv;

    public static void Send(string msg) {
        var bytes = System.Text.Encoding.UTF8.GetBytes(msg);
        Ws.SendAsync(new System.ArraySegment<byte>(bytes),
            System.Net.WebSockets.WebSocketMessageType.Text, true,
            System.Threading.CancellationToken.None).GetAwaiter().GetResult();
    }

    public static string Esc(string s) {
        if (s == null) return "";
        return s.Replace("\\","\\\\").Replace("\"","\\\"")
                .Replace("\n","\\n").Replace("\r","").Replace("\t"," ");
    }

    public static int Num(string s) {
        if (string.IsNullOrEmpty(s)) return 0;
        var m = System.Text.RegularExpressions.Regex.Match(s, "\\d+");
        return m.Success ? int.Parse(m.Value) : 0;
    }
}
```

### Блок 1 — подключение + манифест (ОДИН раз в начале)

```csharp
string apiKey = project.Variables["horseoff_sklik_api"].Value;
string wsUrl  = "wss://ТВОЙ_ДОМЕН/ws/bots";

HoBridge.Ws = new System.Net.WebSockets.ClientWebSocket();
HoBridge.Ws.ConnectAsync(new System.Uri(wsUrl),
    System.Threading.CancellationToken.None).GetAwaiter().GetResult();

// auth
HoBridge.Send("{\"type\":\"auth\",\"api_key\":\"" + HoBridge.Esc(apiKey) + "\"}");

// manifest (вёрстка) — сохранится на сервере, шлём один раз
string cols = "[{\"key\":\"q\",\"label\":\"Запрос\"},{\"key\":\"art\",\"label\":\"Артикул\"},{\"key\":\"status\",\"label\":\"Статус\"},{\"key\":\"total\",\"label\":\"Кол-во\"},{\"key\":\"done\",\"label\":\"Выполнено\"}]";
HoBridge.Send("{\"type\":\"manifest\",\"version\":\"1.0\",\"sub\":\"Склик конкурентов\",\"controls\":["
    + "{\"type\":\"section\",\"label\":\"Состояние\"},"
    + "{\"type\":\"label\",\"id\":\"threads\",\"label\":\"Активных потоков\",\"text\":\"0\",\"style\":\"accent\"},"
    + "{\"type\":\"progress\",\"id\":\"progress\",\"label\":\"Общий прогресс\",\"value\":0,\"total\":\"0 из 0\"},"
    + "{\"type\":\"section\",\"label\":\"Задания\"},"
    + "{\"type\":\"table\",\"id\":\"tasks\",\"label\":\"Процесс склика\",\"columns\":" + cols + ",\"rows\":[]}"
    + "]}");

// ФОНОВЫЙ ПРИЁМ — держит соединение живым (авто-PONG) + принимает команды
HoBridge.Recv = System.Threading.Tasks.Task.Run(() => {
    var buf = new byte[16384];
    try {
        while (HoBridge.Ws != null &&
               HoBridge.Ws.State == System.Net.WebSockets.WebSocketState.Open) {
            var r = HoBridge.Ws.ReceiveAsync(new System.ArraySegment<byte>(buf),
                System.Threading.CancellationToken.None).GetAwaiter().GetResult();
            if (r.MessageType == System.Net.WebSockets.WebSocketMessageType.Close) break;
            // при желании: разбор команд
            // string txt = System.Text.Encoding.UTF8.GetString(buf, 0, r.Count);
        }
    } catch {}
});
```

### Блок 2 — отправка данных (ОДНА итерация; цикл навешивает ZP, ~5 сек)

```csharp
string tableName = "Процесс Склик";
string taskName  = project.Variables["horseoff_sklik_task"].Value;
string cols = "[{\"key\":\"q\",\"label\":\"Запрос\"},{\"key\":\"art\",\"label\":\"Артикул\"},{\"key\":\"status\",\"label\":\"Статус\"},{\"key\":\"total\",\"label\":\"Кол-во\"},{\"key\":\"done\",\"label\":\"Выполнено\"}]";

// если соединение закрылось — выходим (return null, не return! ZP ждёт object)
if (HoBridge.Ws == null || HoBridge.Ws.State != System.Net.WebSockets.WebSocketState.Open)
    return null;

int threads = 0;
try { threads = ZennoPoster.GetThreadsCount(taskName); } catch {}

var rows = new System.Text.StringBuilder("[");
var t = project.Tables[tableName];
int rc = t.RowCount;
int sumDone = 0, sumTotal = 0;
for (int i = 0; i < rc; i++) {
    int total = HoBridge.Num(t.GetCell(3, i));
    int done  = HoBridge.Num(t.GetCell(4, i));
    sumTotal += total; sumDone += done;
    if (i > 0) rows.Append(",");
    rows.Append("{")
        .Append("\"q\":\"").Append(HoBridge.Esc(t.GetCell(0, i))).Append("\",")
        .Append("\"art\":\"").Append(HoBridge.Esc(t.GetCell(1, i))).Append("\",")
        .Append("\"status\":\"").Append(HoBridge.Esc(t.GetCell(2, i))).Append("\",")
        .Append("\"total\":\"").Append(HoBridge.Esc(t.GetCell(3, i))).Append("\",")
        .Append("\"done\":\"").Append(HoBridge.Esc(t.GetCell(4, i))).Append("\"")
        .Append("}");
}
rows.Append("]");
int pct = sumTotal > 0 ? (int)(sumDone * 100L / sumTotal) : 0;

HoBridge.Send("{\"type\":\"ctrl_update\",\"ctrl_id\":\"tasks\",\"data\":{\"columns\":" + cols + ",\"rows\":" + rows.ToString() + "}}");
HoBridge.Send("{\"type\":\"ctrl_update\",\"ctrl_id\":\"threads\",\"data\":{\"text\":\"" + threads + "\"}}");
HoBridge.Send("{\"type\":\"ctrl_update\",\"ctrl_id\":\"progress\",\"data\":{\"value\":" + pct + ",\"total\":\"" + sumDone + " из " + sumTotal + "\"}}");
HoBridge.Send("{\"type\":\"ping\"}");
```

### Блок 3 — закрытие (на остановке / в конце проекта)

```csharp
try {
    if (HoBridge.Ws != null) {
        HoBridge.Ws.Abort();
        HoBridge.Ws.Dispose();
        HoBridge.Ws = null;
    }
} catch {}
```

## Грабли C# в ZennoPoster (важно помнить)

- C#-блок ожидает `return object`. **`return;` не компилируется** — ошибка
  CS0126 «An object of a type convertible to 'object' is required».
  Использовать `return null;`.
- Объекты между блоками нельзя гонять через `project.Variables` (только
  строки) — использовать статический класс в «Своём коде».
- `ZennoPoster.GetThreadsCount("имя задачи")` — число активных потоков по
  имени задачи, Guid не нужен.
- `ClientWebSocket` отвечает на PING только пока вызывается `ReceiveAsync` —
  обязателен фоновый приёмный цикл, иначе сервер отвалит по ping_timeout.
- Бесконечный цикл внутри C#-блока = ZP не может остановить поток. Цикл
  делать средствами ZP вокруг короткого блока.

## Серверная часть (horseoff) — что уже реализовано

`modules/bots/bots_api.py`, `handle_bot_ws()`:
- `ctrl_update` **сохраняет** новое значение в `bot['controls']` на диск
  (чтобы при переключении модулей данные не пропадали).
- При уходе в офлайн (finally) — живые поля контролов (`text`, `value`,
  `rows`, `total`, `src`) **сбрасываются**, чтобы не показывать протухшее.
- ERROR-логи → push (rate-limit 20 сек на бота).
- Манифест (`controls`, `name`, `version`, `sub`) сохраняется на диск.

`modules/bots/bots.js`:
- `progress`-карточка получает `id` (`btCtrlCard_<id>`), иначе живые
  обновления не доходят.
- `label` при `ctrl_update` без `style` сохраняет текущий класс (цвет).
- Per-bot кеш контролов и логов (`_botControls`, `_botLogs`) — состояние
  не теряется при переключении ботов.

## TODO / возможные следующие шаги

- Приём и обработка команд из horseoff в фоновом цикле (кнопки «Стоп»/«Старт»).
- Отправка `stats` (KPI/графики) из ZennoPoster.
- Скриншоты (тип контрола `image`).
