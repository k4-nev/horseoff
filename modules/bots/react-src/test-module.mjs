import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/* Модуль «Боты» на React.

   Бэкенд подменён на уровне HTTP, а WS-события про ботов подаются так же,
   как их отдаёт оболочка: window.Bots.onWS(...). Проверяется именно контракт
   с манифестом (ZennoPoster.md), а не выдуманный API. */

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:8895/core/shell.html';

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ok  ' : ' FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (!ok) failed++;
};

function waitForServer(url, tries = 40) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      fetch(url).then(() => resolve()).catch(() => {
        if (n <= 0) return reject(new Error('server did not start'));
        setTimeout(() => attempt(n - 1), 150);
      });
    };
    attempt(tries);
  });
}

const MODULES = [{ id: 'bots', name: 'Боты', icon: 'bots', entry: 'bots.html' }];

/* Манифест «Склика» — эталонный набор из ZennoPoster.md */
const CONTROLS = [
  { type: 'section', label: 'Управление' },
  { type: 'buttons', id: 'ctrl', buttons: [
    { label: 'Запустить', action: 'start', style: 'primary' },
    { label: 'Пауза', action: 'pause', style: 'secondary' },
    { label: 'Стоп', action: 'stop', style: 'danger' },
  ] },
  { type: 'section', label: 'Расписание отчётов' },
  { type: 'schedule_time', id: 'regular_report', label: 'Регулярный отчёт', value: '' },
  { type: 'schedule_datetime', id: 'final_report', label: 'Финальный отчёт', value: '' },
  { type: 'section', label: 'Состояние' },
  { type: 'stat', id: 'threads', label: 'Активных потоков', value: '0' },
  { type: 'progress', id: 'progress', label: 'Общий прогресс', value: 0, total: '0 из 0' },
  { type: 'section', label: 'Задания' },
  { type: 'table', id: 'tasks', label: 'Процесс склика', edit_cols: ['q', 'art'], columns: [
    { key: 'q', label: 'Запрос' }, { key: 'art', label: 'Артикул' }, { key: 'status', label: 'Статус' },
  ], rows: [{ q: 'экдистерон', art: '29189428', status: 'OK' }] },
];

const BOT = {
  id: 'b1', name: 'Склик Ozon', group: 'Склики', status: 'online', version: '1.4',
  sub: 'Склик конкурентов', badge: 2, last_seen: null, api_key: 'hb_secret_key_value',
  tabs: ['stats', 'log'], access: [], layout: [], controls: CONTROLS,
  logs: [
    { ts: '10:00:01', level: 'INFO', msg: 'Бот запущен' },
    { ts: '10:00:02', level: 'ERROR', msg: 'Connection timeout' },
  ],
  stats: { blocks: [
    { type: 'kpi', items: [{ label: 'Скликов за неделю', value: '1 248', delta: '+84', trend: 'up' }] },
    { type: 'linechart', title: 'Склики по дням', data: [{ label: 'пн', v: 10 }, { label: 'вт', v: 40 }] },
    { type: 'ranklist', title: 'Топ товаров', items: [{ title: 'Экдистерон', sub: '29189428', value: 1239 }] },
  ] },
};

const OFFLINE_BOT = {
  id: 'b2', name: 'Склик WB', group: 'Склики', status: 'offline', version: '1.1',
  sub: 'Склик конкурентов', badge: 0, last_seen: Math.floor(Date.now() / 1000) - 7200,
  queue_count: 3, api_key: 'hb_wb', access: [], controls: CONTROLS, logs: [],
};

const server = spawn('node', ['static-server.mjs'], { cwd: HERE, stdio: 'ignore' });
await waitForServer('http://localhost:8895/core/shell.css');
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });

p.on('pageerror', (e) => { console.log(' FAIL  [pageerror] ' + e.message); failed++; });
p.on('console', (m) => {
  const s = m.text();
  if (m.type() === 'error' && !/WebSocket|Failed to load resource|fetching the script|favicon/i.test(s)) {
    console.log(' FAIL  [console] ' + s);
    failed++;
  }
});

const posted = [];
await p.route('**/api/**', (route) => {
  const u = route.request().url();
  const req = route.request();
  const j = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (req.method() !== 'GET') {
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (e) { body = {}; }
    posted.push({ url: u, method: req.method(), body });
  }
  if (u.includes('/api/auth/status')) return j({ username: 'k4nev', role: 'arcana' });
  if (u.includes('/api/profile')) return j({ username: 'k4nev', role: 'arcana', id: 'me', display_name: 'Костя' });
  if (u.includes('/api/modules')) return j(MODULES);
  if (u.includes('/api/version')) return j({ version: '2.334', build: 'b1' });
  if (u.includes('/api/users')) return j([
    { id: 'u9', username: 'dev', display_name: 'Разработчик', role: 'common' },
    { id: 'u8', username: 'ops', display_name: 'Дежурный', role: 'rare' },
  ]);
  if (u.includes('/api/mod/bots/list')) return j({ bots: [BOT, OFFLINE_BOT] });
  if (/\/api\/mod\/bots\/b1$/.test(u.split('?')[0])) return req.method() === 'GET' ? j({ bot: BOT }) : j({ ok: true });
  if (/\/api\/mod\/bots\/b2$/.test(u.split('?')[0])) return req.method() === 'GET' ? j({ bot: OFFLINE_BOT }) : j({ ok: true });
  if (u.includes('/api/mod/bots/create')) return j({ bot: { ...BOT, id: 'b3', name: 'Новый', group: 'Тест', badge: 0 }, api_key: 'hb_new_key' });
  return j({ ok: true });
});

await p.addInitScript(() => { localStorage.setItem('ho_token', 't'); localStorage.removeItem('ho_pin'); });
await p.goto(BASE);
await p.waitForSelector('#appShell.active');
await p.evaluate(() => { window.__recv = (d) => window.Bots.onWS(d); });
await p.evaluate(() => Shell.switchModule('bots'));
await p.waitForSelector('.bt-wrap', { timeout: 8000 });
await p.waitForTimeout(500);

console.log('── Список ботов ──');
check('боты отрисованы', await p.locator('.bt-bot-row').count() === 2);
check('сгруппированы по группе', await p.locator('.bt-group').count() === 1
  && (await p.locator('.bt-group-name').textContent()) === 'Склики');
check('счётчик группы верный', (await p.locator('.bt-group-count').textContent()) === '2');
check('непрочитанное на строке бота', (await p.locator('.bt-badge').first().textContent()) === '2');
check('офлайн-бот помечен', await p.locator('.bt-bot-row.offline-bot').count() === 1);
check('без выбора — приглашение', (await p.locator('.bt-empty-text').textContent()) === 'Выберите бота');
check('поиск — общий компонент каркаса', await p.locator('.bt-search-field.ho-search').count() === 1);
await p.locator('.bt-search-field input').fill('wb');
await p.waitForTimeout(250);
check('поиск сужает список', await p.locator('.bt-bot-row').count() === 1);
await p.locator('.bt-search-field .ho-search-clear').click();
await p.waitForTimeout(250);

console.log('\n── Открытие бота: манифест превращается в карточки ──');
await p.locator('.bt-bot-row').first().click();
await p.waitForTimeout(600);
check('шапка показывает имя и версию',
  (await p.locator('.bt-bot-name').textContent()) === 'Склик Ozon'
  && (await p.locator('.bt-bot-version').textContent()) === 'v1.4');
check('индикатор состояния — online', (await p.locator('.bt-bot-dot').getAttribute('class')).includes('online'));
check('счётчик непрочитанного сброшен и отмечен на сервере',
  await p.locator('.bt-badge').count() === 0
  && posted.some((r) => /\/read$/.test(r.url) && r.method === 'POST'));
check('секции манифеста стали контейнерами', await p.locator('.bt-section-wrap').count() === 4);
check('заголовки секций на месте',
  (await p.locator('.bt-section-divider-label').allTextContents()).join('|') === 'Управление|Расписание отчётов|Состояние|Задания');
check('кнопки управления отрисованы', await p.locator('.bt-ctrl--buttons button').count() === 3);
check('прогресс, показатель, таблица и два пикера на месте',
  await p.locator('.bt-ctrl--progress').count() === 1
  && await p.locator('.bt-ctrl--stat').count() === 1
  && await p.locator('.bt-ctrl--table').count() === 1
  && await p.locator('.bt-ctrl--sched').count() === 2);
check('строка задания видна в таблице',
  (await p.locator('.bt-ctrl--table tbody td').first().textContent()) === 'экдистерон');

await p.screenshot({ path: 'shot-controls.png' });

console.log('\n── Команды уходят боту ──');
await p.locator('.bt-ctrl--buttons button', { hasText: 'Запустить' }).click();
await p.waitForTimeout(300);
const startCmd = posted.filter((r) => /\/command$/.test(r.url)).pop();
check('кнопка шлёт команду с ctrl_id и action',
  !!startCmd && startCmd.body.ctrl_id === 'ctrl' && startCmd.body.action === 'start',
  JSON.stringify(startCmd && startCmd.body));

console.log('\n── Живое обновление контролов ──');
await p.evaluate(() => window.__recv({ type: 'ctrl_update', bot_id: 'b1', ctrl_id: 'progress', data: { value: 62, total: '620 из 1000' } }));
await p.waitForTimeout(250);
check('прогресс обновился',
  (await p.locator('.bt-progress-pct').textContent()) === '62%'
  && (await p.evaluate(() => document.querySelector('.bt-progress-fill').style.width)) === '62%');
check('подпись под прогрессом тоже', (await p.locator('.bt-ctrl--progress .bt-progress-header span').first().textContent()) === '620 из 1000');

await p.evaluate(() => window.__recv({ type: 'ctrl_update', bot_id: 'b1', ctrl_id: 'threads', data: { text: '8' } }));
await p.waitForTimeout(250);
check('показатель обновился', (await p.locator('.bt-ctrl--stat .bt-stat-val').textContent()) === '8');

await p.evaluate(() => window.__recv({
  type: 'ctrl_update', bot_id: 'b1', ctrl_id: 'tasks',
  data: { columns: [{ key: 'q', label: 'Запрос' }, { key: 'art', label: 'Артикул' }, { key: 'status', label: 'Статус' }],
    rows: [{ q: 'первый', art: '1', status: 'OK' }, { q: 'второй', art: '2', status: 'WARN' }] },
}));
await p.waitForTimeout(250);
check('таблица перерисовалась целиком', await p.locator('.bt-ctrl--table tbody tr').count() === 2);

await p.evaluate(() => window.__recv({ type: 'ctrl_update', bot_id: 'b1', ctrl_id: 'ctrl', data: { disabled: ['start'] } }));
await p.waitForTimeout(250);
check('бот может гасить свои кнопки',
  await p.locator('.bt-ctrl--buttons button[data-action="start"]').isDisabled()
  && !(await p.locator('.bt-ctrl--buttons button[data-action="stop"]').isDisabled()));

console.log('\n── Статус бота в шапке и списке ──');
await p.evaluate(() => window.__recv({
  type: 'bot_update', bot_id: 'b1', status: 'idle', status_dot: 'idle',
  status_text: 'Ожидает задачу', status_lock: true, version: '1.5',
}));
await p.waitForTimeout(300);
check('подпись статуса из бота, а не из словаря', (await p.locator('.bt-status-pill').textContent()) === 'Ожидает задачу');
check('индикатор сменился на idle', (await p.locator('.bt-bot-dot').getAttribute('class')).includes('idle'));
check('версия обновилась', (await p.locator('.bt-bot-version').textContent()) === 'v1.5');
check('строка в списке тоже показывает статус',
  (await p.locator('.bt-bot-row').first().locator('.bt-bot-row-sub').textContent()) === 'Ожидает задачу');
check('при активном проекте таблица только для чтения',
  await p.locator('.bt-table-tool').first().isDisabled());

console.log('\n── Таблица заданий ──');
await p.evaluate(() => window.__recv({ type: 'bot_update', bot_id: 'b1', status: 'online', status_dot: 'online', status_lock: false }));
await p.waitForTimeout(300);
check('после остановки правка доступна', !(await p.locator('.bt-table-tool').first().isDisabled()));
await p.locator('.bt-table-tool', { hasText: 'Редактировать' }).click();
await p.waitForTimeout(400);
check('редактор открылся только по правимым колонкам',
  await p.locator('.bt-xls-th').count() === 3, // # + Запрос + Артикул
  (await p.locator('.bt-xls-th').allTextContents()).join('|'));
check('существующие строки подставлены',
  (await p.locator('.bt-xls-cell').first().inputValue()) === 'первый');
check('пустая строка снизу всегда есть', await p.locator('.bt-xls-num').count() === 3);
await p.locator('.bt-xls-cell').nth(4).fill('третий');
await p.waitForTimeout(250);
check('после ввода добавляется следующая пустая', await p.locator('.bt-xls-num').count() === 4);
await p.locator('.bt-edit-box .btn-primary', { hasText: 'Сохранить' }).click();
await p.waitForTimeout(300);
const loadCmd = posted.filter((r) => /\/command$/.test(r.url)).pop();
const decoded = loadCmd ? Buffer.from(loadCmd.body.value, 'base64').toString('utf8') : '';
check('задание уходит base64 с табами и переводами строк',
  !!loadCmd && loadCmd.body.action === 'load_table' && decoded.split('\n').length === 3 && decoded.includes('\t'),
  JSON.stringify(decoded));
check('кириллица не побилась в base64', decoded.includes('первый') && decoded.includes('третий'));

console.log('\n── Расписание ──');
await p.locator('.bt-ctrl--sched .bt-sched-display').first().click();
await p.waitForTimeout(300);
check('пикер раскрылся', await p.locator('.bt-sched-picker.open').count() === 1);
check('пусто показывается прочерком', (await p.locator('.bt-sched-val-txt').first().textContent()) === '—');
await p.locator('.bt-sched-picker.open .bt-drum-btn').first().click();
await p.waitForTimeout(200);
check('барабан часов крутится', (await p.locator('.bt-sched-picker.open .bt-drum-val').first().textContent()) === '01');
await p.locator('.bt-sched-picker.open .btn-primary').click();
await p.waitForTimeout(300);
const schedCmd = posted.filter((r) => /\/command$/.test(r.url)).pop();
check('время ушло боту в base64',
  !!schedCmd && schedCmd.body.ctrl_id === 'regular_report' && Buffer.from(schedCmd.body.value, 'base64').toString('utf8') === '01:00',
  JSON.stringify(schedCmd && schedCmd.body));
check('значение видно на карточке', (await p.locator('.bt-sched-val-txt').first().textContent()) === '01:00');

console.log('\n── Лог ──');
await p.locator('.bt-tab', { hasText: 'Лог' }).click();
await p.waitForTimeout(300);
check('лог с сервера подхватился', await p.locator('.bt-log-line').count() === 2);
await p.evaluate(() => window.__recv({ type: 'bot_log', bot_id: 'b1', level: 'WARN', ts: '10:00:03', msg: 'Прокси не отвечает' }));
await p.waitForTimeout(250);
check('живая строка добавилась', await p.locator('.bt-log-line').count() === 3);
check('счётчик записей верный', (await p.locator('.bt-log-count').textContent()) === '3 записей');
await p.locator('.bt-log-filter.ERROR').click();
await p.waitForTimeout(250);
check('фильтр уровня прячет строки', await p.locator('.bt-log-line').count() === 2);
await p.locator('.bt-log-filter.ERROR').click();
await p.waitForTimeout(250);
await p.locator('.bt-log-clear-btn').click();
await p.waitForTimeout(300);
check('очистка убирает записи и уходит на сервер',
  await p.locator('.bt-log-line').count() === 0
  && posted.some((r) => /clear_log$/.test(r.url)));
await p.evaluate(() => window.__recv({ type: 'bot_log', bot_id: 'b2', level: 'INFO', ts: '10:01', msg: 'чужой бот' }));
await p.waitForTimeout(250);
check('лог чужого бота в открытый не попадает', await p.locator('.bt-log-line').count() === 0);

console.log('\n── Статистика ──');
await p.locator('.bt-tab', { hasText: 'Статистика' }).click();
await p.waitForTimeout(400);
check('KPI, график и топ отрисованы',
  await p.locator('.bt-kpi-row .bt-stat-card').count() === 1
  && await p.locator('canvas.bt-chart').count() === 1
  && await p.locator('.bt-rank-item').count() === 1);
check('график действительно нарисован, а не пустой холст',
  await p.evaluate(() => {
    const c = document.querySelector('canvas.bt-chart');
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) return true;
    return false;
  }));
await p.evaluate(() => window.__recv({
  type: 'bot_stats', bot_id: 'b1',
  stats: { blocks: [{ type: 'kpi', items: [{ label: 'Скликов за неделю', value: '9 999' }] }] },
}));
await p.waitForTimeout(300);
check('живая статистика заменяет прежнюю', (await p.locator('.bt-kpi-row .bt-stat-val').textContent()) === '9 999');

console.log('\n── Настройки ──');
await p.locator('.bt-tab', { hasText: 'Настройки' }).click();
await p.waitForTimeout(300);
check('ключ по умолчанию скрыт точками',
  /^•+$/.test(await p.locator('.bt-apikey-field input').inputValue()));
await p.locator('.bt-icon-btn').first().click();
await p.waitForTimeout(200);
check('глаз открывает ключ', (await p.locator('.bt-apikey-field input').inputValue()) === 'hb_secret_key_value');
await p.locator('.bt-settings-section').filter({ hasText: 'Название бота' }).locator('input').fill('Склик Озон 2');
await p.locator('.bt-settings-section').filter({ hasText: 'Название бота' }).locator('button').click();
await p.waitForTimeout(300);
const rename = posted.filter((r) => r.method === 'PUT').pop();
check('имя сохраняется через PUT', !!rename && rename.body.name === 'Склик Озон 2', JSON.stringify(rename && rename.body));
check('имя обновилось и в шапке, и в списке',
  (await p.locator('.bt-bot-name').textContent()) === 'Склик Озон 2'
  && (await p.locator('.bt-bot-row').first().locator('.bt-bot-row-name').textContent()) === 'Склик Озон 2',
  (await p.locator('.bt-bot-name').textContent()) + ' / ' + (await p.locator('.bt-bot-row').first().locator('.bt-bot-row-name').textContent()));

await p.locator('.bt-add-access-btn').click();
await p.waitForTimeout(400);
check('список пользователей загрузился, владельцы отфильтрованы',
  await p.locator('.bt-access-user-item').count() === 2);
await p.locator('.bt-access-user-item').first().click();
await p.waitForTimeout(300);
check('доступ выдаётся по user_id',
  posted.some((r) => /\/access$/.test(r.url) && r.method === 'POST' && r.body.user_id === 'u9'));
await p.locator('.modal-overlay .btn-secondary', { hasText: 'Закрыть' }).click();
await p.waitForTimeout(300);

console.log('\n── Офлайн-бот ──');
await p.locator('.bt-bot-row').nth(1).click();
await p.waitForTimeout(500);
check('вместо управления — заглушка', await p.locator('.bt-offline-state').count() === 1);
check('видно, когда был онлайн', (await p.locator('.bt-offline-seen').textContent()).includes('2 ч назад'));
check('очередь команд показана', (await p.locator('.bt-offline-queue').textContent()).includes('3 команды в очереди'));
check('вкладки, кроме настроек, заблокированы',
  await p.locator('.bt-tab.bt-tab-disabled').count() === (await p.locator('.bt-tab').count()) - 1);
check('правка раскладки офлайн недоступна',
  await p.locator('.bt-topbar-right .btn-icon-only').first().isDisabled());
await p.locator('.bt-tab', { hasText: 'Настройки' }).click();
await p.waitForTimeout(300);
check('настройки офлайн открываются', await p.locator('.bt-settings-wrap').isVisible());

console.log('\n── Тест-бот ──');
await p.locator('.bt-demo-btn').click();
await p.waitForTimeout(600);
check('тест-бот появился и открылся',
  await p.locator('.bt-bot-row[data-bot-id="__test__"]').count() === 1
  && (await p.locator('.bt-bot-name').textContent()) === 'Demo Bot');
check('в нём есть все типы контролов',
  await p.evaluate(() => new Set([...document.querySelectorAll('[data-ctrl-type]')].map((e) => e.dataset.ctrlType)).size >= 13),
  await p.evaluate(() => [...new Set([...document.querySelectorAll('[data-ctrl-type]')].map((e) => e.dataset.ctrlType))].join(',')));
const before = posted.length;
await p.locator('.bt-ctrl--buttons button', { hasText: 'Запустить' }).click();
await p.waitForTimeout(300);
check('команды тест-бота никуда не уходят', posted.length === before);
await p.locator('.bt-demo-btn').click();
await p.waitForTimeout(400);
check('тест-бот убирается', await p.locator('.bt-bot-row[data-bot-id="__test__"]').count() === 0);

console.log('\n── Добавление бота ──');
await p.locator('.bt-head-add').nth(1).click();
await p.waitForTimeout(400);
check('окно открылось на первом шаге', await p.locator('.bt-modal-avatar-row').count() === 1);
check('существующие группы предложены чипами', await p.locator('.bt-group-chip').count() === 1);
await p.locator('.bt-modal-field input').first().fill('Новый бот');
await p.locator('.bt-modal-actions .btn-primary', { hasText: 'Создать' }).click();
await p.waitForTimeout(400);
check('второй шаг показывает ключ', (await p.locator('.bt-apikey-field input').inputValue()) === 'hb_new_key');
check('в подсказке C# подставлены ключ и адрес',
  (await p.locator('.bt-code').textContent()).includes('hb_new_key')
  && (await p.locator('.bt-code').textContent()).includes('/ws/bots'));
await p.locator('.bt-snip-tab', { hasText: 'ZennoPoster' }).click();
await p.waitForTimeout(250);
check('вторая вкладка подсказки — ZennoPoster', (await p.locator('.bt-code').textContent()).includes('project.Variables'));
await p.locator('.bt-modal-actions .btn-primary', { hasText: 'Готово' }).click();
await p.waitForTimeout(300);
check('созданный бот появился в списке', await p.locator('.bt-bot-row').count() === 3);

console.log('\n── Правка раскладки ──');
await p.locator('.bt-bot-row').first().click();
await p.waitForTimeout(500);
await p.locator('.bt-topbar-right .btn-icon-only').first().click();
await p.waitForTimeout(400);
check('режим правки включился', await p.locator('.bt-controls-grid.bt-edit-mode').count() === 1);
check('у карточек появились ручки', await p.locator('.bt-edit-handle').count() > 3);
check('размер подписан на карточке', await p.locator('.bt-edit-size-badge').count() > 3);
check('кнопка авто-сортировки показалась', await p.locator('.bt-sort-btn').count() === 1);

/* Тянем правый край карточки прогресса — ширина должна вырасти на колонку */
const progW = () => p.evaluate(() => Math.round(document.querySelector('.bt-ctrl--progress').getBoundingClientRect().width));
const w0 = await progW();
const rh = await p.locator('.bt-ctrl--progress .bt-rh-w').boundingBox();
await p.mouse.move(rh.x + rh.width / 2, rh.y + rh.height / 2);
await p.mouse.down();
await p.mouse.move(rh.x + rh.width / 2 - 200, rh.y + rh.height / 2, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(400);
const w1 = await progW();
check('карточку можно сузить перетаскиванием края', w1 < w0 - 40, w0 + ' -> ' + w1);

await p.locator('.bt-topbar-right .btn-icon-only').first().click();
await p.waitForTimeout(400);
const layout = posted.filter((r) => /\/layout$/.test(r.url)).pop();
check('выход из режима сохраняет раскладку',
  !!layout && Array.isArray(layout.body.layout) && layout.body.layout.length === (await p.evaluate(() => document.querySelectorAll('[data-ctrl-id]').length)),
  layout ? layout.body.layout.length + ' элементов' : 'не отправлено');
check('размер попал в сохранённую раскладку',
  !!layout && layout.body.layout.some((l) => l.id === 'progress' && l.w < 8),
  JSON.stringify(layout && layout.body.layout.find((l) => l.id === 'progress')));

console.log('\n── Уход из модуля во время правки ──');
await p.locator('.bt-topbar-right .btn-icon-only').first().click();
await p.waitForTimeout(400);
check('режим правки снова включён', await p.locator('.bt-controls-grid.bt-edit-mode').count() === 1);
/* Оболочка обязана предупредить модуль об уходе — иначе правки раскладки
   молча теряются при переключении. */
await p.evaluate(() => window.Bots.onDeactivate());
await p.waitForTimeout(300);
check('модуль спрашивает про сохранение', await p.locator('.bt-confirm-box').count() === 1);
check('вопрос именно про раскладку',
  (await p.locator('.bt-confirm-title').textContent()) === 'Сохранить изменения?');
const beforeSave = posted.filter((r) => /\/layout$/.test(r.url)).length;
await p.locator('.bt-confirm-actions .btn-primary').click();
await p.waitForTimeout(400);
check('согласие сохраняет раскладку',
  posted.filter((r) => /\/layout$/.test(r.url)).length === beforeSave + 1);
check('режим правки закрыт', await p.locator('.bt-controls-grid.bt-edit-mode').count() === 0);

console.log('\n── Мобильная адаптация ──');
await p.setViewportSize({ width: 390, height: 800 });
await p.waitForTimeout(500);
check('страница не едет вбок',
  await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  await p.evaluate(() => document.documentElement.scrollWidth + ' > ' + window.innerWidth));
check('при открытом боте список уезжает', await p.locator('.bt-wrap.mob-bot-open').count() === 1);
await p.locator('.bt-mob-menu-btn').click();
await p.waitForTimeout(400);
check('кнопка меню возвращает список', await p.locator('.bt-wrap.mob-bot-open').count() === 0);
await p.locator('.bt-bot-row').first().click();
await p.waitForTimeout(400);
check('выбор бота снова прячет список', await p.locator('.bt-wrap.mob-bot-open').count() === 1);
await p.screenshot({ path: 'shot-mobile.png' });

await p.setViewportSize({ width: 1440, height: 900 });
await p.waitForTimeout(400);
await p.screenshot({ path: 'shot-desktop.png' });

await browser.close();
server.kill();
console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
