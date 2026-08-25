import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:8899/modules/servers/react-src/harness.html';

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

const server = spawn('node', ['static-server.mjs'], { cwd: HERE, stdio: 'ignore' });
await waitForServer('http://localhost:8899/modules/servers/servers.html');

const browser = await chromium.launch();

async function open(url, viewport = { width: 1280, height: 860 }) {
  const p = await browser.newPage({ viewport });
  p.on('pageerror', (e) => { console.log(' FAIL  [pageerror] ' + e.message); failed++; });
  p.on('console', (m) => { if (m.type() === 'error') { console.log(' FAIL  [console] ' + m.text()); failed++; } });
  await p.goto(url);
  await p.waitForFunction(() => window.__ready === true);
  await p.waitForTimeout(400); // WS servers_request round-trip
  return p;
}

try {
  console.log('\n── Список: группировка по роли, сортировка, спарклайны, RAM-бар ──');
  const p = await open(BASE);
  const headTexts = await p.locator('.srv-table-head').allTextContents();
  check('3 категорийных заголовка (host/proxy/client)', headTexts.length === 3, JSON.stringify(headTexts.map(t => t.slice(0, 20))));
  const roleOrder = await p.locator('.srv-row').evaluateAll((els) => els.map((e) => e.dataset.role));
  check('порядок host → proxy → proxy → client', JSON.stringify(roleOrder) === JSON.stringify(['host', 'proxy', 'proxy', 'client']), JSON.stringify(roleOrder));
  const sparkPoints = await p.locator('.srv-row[data-srvip="5.5.5.5"] .spark-line').getAttribute('points');
  check('спарклайн CPU у онлайн-сервера с историей отрисован', !!sparkPoints && sparkPoints.split(' ').length >= 5, sparkPoints);
  const noHistSpark = await p.locator('.srv-row[data-srvip="6.6.6.6"] .cpu-cell').innerHTML();
  check('офлайн-сервер без CPU — пустой спарклайн (spark-empty)', noHistSpark.includes('spark-empty'));
  const ramText = (await p.locator('.srv-row[data-srvip="5.5.5.5"] .row-metric').nth(1).textContent()).trim();
  check('RAM% посчитан верно (900/2000=45%)', ramText.startsWith('45'), ramText);
  await p.close();

  console.log('\n── Фильтры pill: toggle скрывает строки и заголовок целиком ──');
  const p2 = await open(BASE);
  await p2.locator('.srv-pill.host').click();
  await p2.waitForTimeout(50);
  const hostRowsVisible = await p2.locator('.srv-row[data-role="host"]').count();
  const headersAfter = await p2.locator('.srv-table-head').count();
  check('после снятия HOST-фильтра host-строк не видно', hostRowsVisible === 0);
  check('заголовок HOST пропал (остались 2: proxy/client)', headersAfter === 2, 'headers=' + headersAfter);
  await p2.close();

  console.log('\n── Разворачивание VDS-инфо и подсказка без API-ключа ──');
  const p3 = await open(BASE);
  await p3.locator('.srv-row[data-srvip="5.5.5.5"]').click();
  await p3.waitForTimeout(250); // expandIn анимация
  const expandOpen = await p3.locator('#expand-5-5-5-5').evaluate((el) => el.classList.contains('open'));
  check('клик по client/proxy-строке разворачивает VDS-инфо', expandOpen);
  const vdsText = await p3.locator('#expand-5-5-5-5').textContent();
  check('в развороте видна стоимость из vds_info', vdsText.includes('450'), vdsText.slice(0, 80));
  await p3.locator('.srv-row[data-srvip="6.6.6.6"]').click();
  await p3.waitForTimeout(250);
  const hintText = await p3.locator('#expand-6-6-6-6').textContent();
  check('proxy без vds_info — подсказка "API-ключ не установлен"', hintText.includes('API-ключ не установлен'));
  await p3.close();

  console.log('\n── Видимость управляющих кнопок: только immortal/arcana (выровнено с бэкендом) ──');
  for (const role of ['common', 'uncommon', 'rare', 'mythical', 'legendary']) {
    const pr = await open(BASE + '?role=' + role);
    const btns = await pr.locator('.srv-add-btn, .srv-settings-btn').count();
    const rowActions = await pr.locator('.row-actions button').count();
    check(`role=${role}: нет кнопок Создать/Добавить/Настройки`, btns === 0, 'found=' + btns);
    check(`role=${role}: нет edit/delete в строках`, rowActions === 0, 'found=' + rowActions);
    await pr.close();
  }
  for (const role of ['immortal', 'arcana']) {
    const pr = await open(BASE + '?role=' + role);
    const btns = await pr.locator('.srv-add-btn, .srv-settings-btn').count();
    check(`role=${role}: 3 управляющие кнопки видны`, btns === 3, 'found=' + btns);
    const hostEdit = await pr.locator('.srv-row[data-role="host"] .row-actions').count();
    check(`role=${role}: у HOST-строки нет edit/delete даже для менеджера`, hostEdit === 0);
    await pr.close();
  }

  console.log('\n── Интервал опроса ──');
  const p4 = await open(BASE); // arcana по умолчанию
  await p4.locator('button.srv-settings-btn').click();
  await p4.waitForTimeout(50);
  const active30 = await p4.locator('.srv-interval-btn', { hasText: '30s' }).evaluate((el) => getComputedStyle(el).fontWeight);
  check('дефолтный интервал 30s подсвечен (fontWeight 700)', active30 === '700', active30);
  await p4.locator('.srv-interval-btn', { hasText: '45s' }).click();
  await p4.waitForTimeout(50);
  const wsSent = await p4.evaluate(() => window.__wsSent.filter((m) => m.type === 'set_interval'));
  check('смена интервала шлёт set_interval по WS с interval:45', wsSent.length === 1 && wsSent[0].interval === 45, JSON.stringify(wsSent));
  await p4.close();

  const p4b = await open(BASE + '?role=uncommon&wsready=0');
  // uncommon вообще не видит кнопку настроек — интервал недоступен структурно
  const noSettingsBtn = await p4b.locator('.srv-settings-btn').count();
  check('role=uncommon: настройки недоступны в принципе (нет входа в интервал)', noSettingsBtn === 0);
  await p4b.close();

  console.log('\n── Создать (createServer): валидация, provisioning, result, IP-конфликт ──');
  const p5 = await open(BASE);
  await p5.locator('.srv-add-btn', { hasText: 'Создать' }).click();
  await p5.locator('.modal-actions .btn-primary', { hasText: 'Создать' }).click();
  let toasts = await p5.evaluate(() => window.__toasts);
  check('пустая форма создания -> toast "Заполните все поля"', toasts.some((t) => t.msg === 'Заполните все поля' && t.type === 'error'));

  await p5.fill('#srvCreateModal input[placeholder="Proxy-01"]', 'New-Proxy');
  await p5.fill('#srvCreateModal input[placeholder="123.45.67.89"]', '9.9.9.9');
  await p5.fill('#srvCreateModal input[type="password"] >> nth=0', 'sshpass123');
  await p5.fill('#srvCreateModal input[placeholder="proxyuser"]', 'puser');
  await p5.fill('#srvCreateModal input[type="password"] >> nth=1', 'ppass123');
  await p5.locator('.modal-actions .btn-primary', { hasText: 'Создать' }).click();
  await p5.waitForTimeout(150);
  const progressOpen = await p5.locator('#srvProgressModal').evaluate((el) => el.classList.contains('active'));
  check('успешный create -> открылась progress-модалка', progressOpen);
  await p5.waitForTimeout(6000); // 4 шага поллинга по 1с + финальная задержка 800мс
  const resultOpen = await p5.locator('#srvResultModal').evaluate((el) => el.classList.contains('active'));
  check('provisioning завершился -> result-модалка открылась', resultOpen);
  const httpVal = await p5.locator('.srv-result-row', { hasText: 'HTTP' }).locator('.srv-result-value').textContent();
  check('result содержит http_proxy строку с новым ip', httpVal.startsWith('9.9.9.9:'), httpVal);
  await p5.locator('.srv-result-row', { hasText: 'HTTP' }).click();
  toasts = await p5.evaluate(() => window.__toasts);
  check('клик по result-строке -> toast "Скопировано"', toasts.some((t) => t.msg === 'Скопировано'));
  const newRowCount = await p5.locator('.srv-row[data-srvip="9.9.9.9"]').count();
  check('новый сервер появился в списке после провижининга', newRowCount === 1);
  await p5.close();

  const p5b = await open(BASE);
  await p5b.locator('.srv-add-btn', { hasText: 'Создать' }).click();
  await p5b.fill('#srvCreateModal input[placeholder="Proxy-01"]', 'Dup');
  await p5b.fill('#srvCreateModal input[placeholder="123.45.67.89"]', '5.5.5.5'); // уже существует
  await p5b.fill('#srvCreateModal input[type="password"] >> nth=0', 'x');
  await p5b.fill('#srvCreateModal input[placeholder="proxyuser"]', 'u');
  await p5b.fill('#srvCreateModal input[type="password"] >> nth=1', 'x');
  await p5b.locator('.modal-actions .btn-primary', { hasText: 'Создать' }).click();
  await p5b.waitForTimeout(150);
  toasts = await p5b.evaluate(() => window.__toasts);
  check('create с существующим IP -> toast "IP уже существует", модалка не закрылась', toasts.some((t) => t.msg === 'IP уже существует'));
  const stillOpen = await p5b.locator('#srvCreateModal').evaluate((el) => el.classList.contains('active'));
  check('модалка создания осталась открытой после ошибки', stillOpen);
  await p5b.close();

  console.log('\n── Создать: ошибка provisioning (steps error, close-кнопка, без result) ──');
  const p5c = await open(BASE);
  await p5c.locator('.srv-add-btn', { hasText: 'Создать' }).click();
  await p5c.fill('#srvCreateModal input[placeholder="Proxy-01"]', 'ErrTest');
  await p5c.fill('#srvCreateModal input[placeholder="123.45.67.89"]', 'ERR.PROVISION.TEST');
  await p5c.fill('#srvCreateModal input[type="password"] >> nth=0', 'x');
  await p5c.fill('#srvCreateModal input[placeholder="proxyuser"]', 'u');
  await p5c.fill('#srvCreateModal input[type="password"] >> nth=1', 'x');
  await p5c.locator('.modal-actions .btn-primary', { hasText: 'Создать' }).click();
  await p5c.waitForTimeout(2500);
  const errText = await p5c.locator('#srvProgressError').textContent();
  check('ошибочный provisioning показывает текст ошибки', errText.includes('SSH недоступен'), errText);
  const closeBtnVisible = await p5c.locator('#srvProgressModal .modal-close').isVisible();
  check('кнопка закрытия появилась после ошибки', closeBtnVisible);
  const resultShown = await p5c.locator('#srvResultModal').evaluate((el) => el.classList.contains('active'));
  check('result-модалка НЕ открылась при ошибке', !resultShown);
  await p5c.locator('#srvProgressModal .modal-close').click();
  const closedAfterErr = await p5c.locator('#srvProgressModal').evaluate((el) => !el.classList.contains('active'));
  check('progress-модалку можно закрыть после ошибки', closedAfterErr);
  await p5c.close();

  console.log('\n── Добавить (addServer): без пароля мгновенно, с паролем — provisioning ──');
  const p6 = await open(BASE);
  await p6.locator('.srv-add-btn', { hasText: 'Добавить' }).click();
  await p6.locator('.modal-actions .btn-primary', { hasText: 'Добавить' }).click();
  toasts = await p6.evaluate(() => window.__toasts);
  check('пустая форма добавления -> toast "Заполните название и IP"', toasts.some((t) => t.msg === 'Заполните название и IP'));
  await p6.fill('#srvAddModal2 input[placeholder="Proxy-01"]', 'Quick-Add');
  await p6.fill('#srvAddModal2 input[placeholder="123.45.67.89"]', '8.8.4.4');
  const vdsSelectAdd = p6.locator('#srvAddModal2 select:has(option[value="ruvds"])');
  check('поле "Провайдер VDS" видно в форме добавления (раньше было display:none навсегда)', await vdsSelectAdd.isVisible());
  await vdsSelectAdd.selectOption('ruvds');
  await p6.locator('#srvAddModal2 .modal-actions .btn-primary').click();
  await p6.waitForTimeout(150);
  const progressAfterAdd = await p6.locator('#srvProgressModal').evaluate((el) => el.classList.contains('active'));
  check('добавление без пароля НЕ открывает progress-модалку', !progressAfterAdd);
  toasts = await p6.evaluate(() => window.__toasts);
  check('добавление без пароля -> toast "Quick-Add добавлен"', toasts.some((t) => t.msg === 'Quick-Add добавлен'));
  const addedRow = await p6.locator('.srv-row[data-srvip="8.8.4.4"]').count();
  check('сервер сразу появился в списке', addedRow === 1);
  const addCall = await p6.evaluate(() => window.__calls.find((c) => c.path === '/api/mod/servers/add' && c.body.ip === '8.8.4.4'));
  check('vds_provider="ruvds" реально ушёл в теле запроса добавления', addCall?.body.vds_provider === 'ruvds', JSON.stringify(addCall?.body));
  await p6.close();

  const p6b = await open(BASE);
  await p6b.locator('.srv-add-btn', { hasText: 'Добавить' }).click();
  await p6b.fill('#srvAddModal2 input[placeholder="Proxy-01"]', 'Add-WithKey');
  await p6b.fill('#srvAddModal2 input[placeholder="123.45.67.89"]', '3.3.3.3');
  await p6b.fill('#srvAddModal2 input[type="password"]', 'somepass');
  await p6b.locator('#srvAddModal2 .modal-actions .btn-primary').click();
  await p6b.waitForTimeout(150);
  const progressAfterAddPw = await p6b.locator('#srvProgressModal').evaluate((el) => el.classList.contains('active'));
  check('добавление С паролем открывает тот же progress-путь', progressAfterAddPw);
  await p6b.close();

  console.log('\n── Редактирование: префилл, скрытие портов для client, IP-конфликт, host нельзя ──');
  const p7 = await open(BASE);
  await p7.locator('.srv-row[data-srvip="5.5.5.5"] .btn-icon[title="Edit"]').click();
  await p7.waitForTimeout(50);
  const nameVal = await p7.locator('#srvAddModal input[placeholder="Proxy-01"]').inputValue();
  check('редактирование префилнуло имя', nameVal === 'Proxy-01', nameVal);
  const portsVisibleForProxy = await p7.locator('#srvAddModal input[type="number"]').count(); // ssh_port + http + socks = 3
  check('для роли proxy показаны порты (3 number-инпута)', portsVisibleForProxy === 3, portsVisibleForProxy);
  const vdsSelectEdit = p7.locator('#srvAddModal select:has(option[value="ruvds"])');
  check('поле "Провайдер VDS" видно в форме редактирования (раньше было display:none навсегда)', await vdsSelectEdit.isVisible());
  await p7.selectOption('#srvAddModal select', 'client');
  await p7.waitForTimeout(50);
  const portsAfterClient = await p7.locator('#srvAddModal input[type="number"]').count();
  check('смена роли на client скрывает группу портов (1 number — только ssh_port)', portsAfterClient === 1, portsAfterClient);
  await p7.locator('#srvAddModal .modal-close').click();
  await p7.close();

  const p7b = await open(BASE);
  await p7b.locator('.srv-row[data-srvip="7.7.7.7"] .btn-icon[title="Edit"]').click();
  await p7b.fill('#srvAddModal input[placeholder="123.45.67.89"]', '5.5.5.5'); // конфликт
  await p7b.locator('.modal-actions .btn-primary', { hasText: 'Сохранить' }).click();
  await p7b.waitForTimeout(150);
  toasts = await p7b.evaluate(() => window.__toasts);
  check('редактирование с IP-конфликтом -> toast "IP уже существует"', toasts.some((t) => t.msg === 'IP уже существует'));
  await p7b.close();

  const p7c = await open(BASE);
  const hostEditBtn = await p7c.locator('.srv-row[data-role="host"] .btn-icon[title="Edit"]').count();
  check('у HOST-строки нет кнопки редактирования в DOM вообще', hostEditBtn === 0);
  await p7c.close();

  console.log('\n── Удаление: подтверждение и отмена ──');
  const p8 = await open(BASE);
  await p8.locator('.srv-row[data-srvip="7.7.7.7"] .btn-icon.del').click();
  await p8.waitForTimeout(50);
  const delInfo = await p8.locator('#srvDelModal .form-input').textContent();
  check('модалка удаления показывает имя и ip', delInfo.includes('Client-01') && delInfo.includes('7.7.7.7'), delInfo);
  await p8.locator('#srvDelModal .btn-secondary', { hasText: 'Отмена' }).click();
  let calls = await p8.evaluate(() => window.__calls.filter((c) => c.method === 'DELETE'));
  check('отмена не отправила DELETE', calls.length === 0);
  await p8.locator('.srv-row[data-srvip="7.7.7.7"] .btn-icon.del').click();
  await p8.locator('#srvDelModal .btn-danger').click();
  await p8.waitForTimeout(150);
  calls = await p8.evaluate(() => window.__calls.filter((c) => c.method === 'DELETE'));
  check('подтверждение отправило DELETE на верный ip', calls.length === 1 && calls[0].path.endsWith('7.7.7.7'), JSON.stringify(calls));
  const goneRow = await p8.locator('.srv-row[data-srvip="7.7.7.7"]').count();
  check('удалённый сервер пропал из списка', goneRow === 0);
  await p8.close();

  console.log('\n── Настройки → API-ключ VDS ──');
  const p9 = await open(BASE);
  await p9.locator('button.srv-settings-btn').click();
  await p9.waitForTimeout(150);
  const statusBefore = await p9.locator('#srvSettingsModal span', { hasText: '✗' }).count();
  check('изначально ключ не установлен (✗)', statusBefore >= 1);
  await p9.fill('#srvSettingsModal input[placeholder="API key..."]', 'ruvds-secret-key');
  await p9.locator('#srvSettingsModal .btn-secondary', { hasText: 'Сохранить' }).click();
  await p9.waitForTimeout(150);
  toasts = await p9.evaluate(() => window.__toasts);
  check('сохранение ключа -> toast "API-ключ сохранён"', toasts.some((t) => t.msg === 'API-ключ сохранён'));
  const statusAfter = await p9.locator('#srvSettingsModal span', { hasText: '✓' }).count();
  check('после сохранения статус стал ✓', statusAfter >= 1);
  await p9.close();

  console.log('\n── Контекстное меню (right-click): Копировать / Переслать ──');
  const p10 = await open(BASE);
  await p10.locator('.srv-row[data-srvip="5.5.5.5"]').click({ button: 'right' });
  await p10.waitForTimeout(50);
  const ctxVisible = await p10.locator('.srv-ctx-menu').count();
  check('right-click открывает контекстное меню', ctxVisible === 1);
  await p10.locator('.srv-ctx-action', { hasText: 'Копировать' }).click();
  toasts = await p10.evaluate(() => window.__toasts);
  check('"Копировать" -> toast "Скопировано"', toasts.some((t) => t.msg === 'Скопировано'));
  const ctxClosedAfterClick = await p10.locator('.srv-ctx-menu').count();
  check('меню закрылось после клика по действию', ctxClosedAfterClick === 0);
  await p10.locator('.srv-row[data-srvip="5.5.5.5"]').click({ button: 'right' });
  await p10.waitForTimeout(50);
  await p10.locator('body').click({ position: { x: 5, y: 5 } });
  await p10.waitForTimeout(50);
  const ctxClosedByOutside = await p10.locator('.srv-ctx-menu').count();
  check('клик вне меню закрывает его', ctxClosedByOutside === 0);
  await p10.close();

  console.log('\n── Пустой список серверов ──');
  const p11 = await open(BASE + '?empty=1');
  const skelRightAfterLoad = await p11.locator('.srv-skel').count();
  check('сразу после первого (пустого) апдейта — скелетон, не "Нет серверов" (firstLoad ещё true)', skelRightAfterLoad > 0);
  const totalTile = await p11.locator('.srv-metric-value').first().textContent();
  check('метрика "Серверов" уже 0 (не "--"), хотя список ещё скелетон', totalTile.trim() === '0', totalTile);
  // Оригинал ставит this.firstLoad=false через 5с как ПРОСТОЕ ПОЛЕ — это не
  // триггерит перерисовку сама по себе, так что вживую скелетон завис бы,
  // пока не придёт следующий WS-пуш. В React-порте firstLoad — состояние,
  // поэтому таймаут сам вызывает ре-рендер. Это реальное отличие от 1:1 —
  // сознательно оставлено как улучшение (иначе пустой список завис бы на
  // скелетоне до следующего опроса), см. отчёт.
  await p11.waitForTimeout(5200);
  const emptyText = await p11.locator('#srvList').textContent();
  check('через 5с safety-таймаут сам переключает на "Нет серверов" (React state, а не мёртвое поле)', emptyText.includes('Нет серверов'));
  await p11.close();

  console.log('\n── WS-путь: onServersUpdate/onSettingsUpdate доступны из оболочки ──');
  const p12 = await open(BASE);
  const hasHandlers = await p12.evaluate(() => typeof window.Servers?.onServersUpdate === 'function' && typeof window.Servers?.onSettingsUpdate === 'function');
  check('window.Servers.onServersUpdate/onSettingsUpdate выставлены (контракт WS-диспетчеризации shell.js)', hasHandlers);
  await p12.evaluate(() => window.Servers.onSettingsUpdate({ poll_interval: 60 }));
  await p12.locator('button.srv-settings-btn').click();
  await p12.waitForTimeout(50);
  const highlighted60 = await p12.locator('.srv-interval-btn', { hasText: '60s' }).evaluate((el) => getComputedStyle(el).fontWeight);
  check('входящий WS settings-пуш обновляет подсветку интервала', highlighted60 === '700', highlighted60);
  await p12.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
