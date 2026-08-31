import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:8898/modules/admin/react-src/harness.html';

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
await waitForServer('http://localhost:8898/modules/admin/admin.html');

const browser = await chromium.launch();

async function open(url, viewport = { width: 1280, height: 860 }) {
  const p = await browser.newPage({ viewport });
  p.on('pageerror', (e) => { console.log(' FAIL  [pageerror] ' + e.message); failed++; });
  p.on('console', (m) => { if (m.type() === 'error') { console.log(' FAIL  [console] ' + m.text()); failed++; } });
  await p.goto(url);
  await p.waitForFunction(() => window.__ready === true);
  await p.waitForTimeout(300);
  return p;
}

try {
  console.log('\n── Таблица, поиск, фильтр по роли ──');
  const p = await open(BASE);

  check('модуль смонтировался', await p.locator('.adm-shell').count() === 1);
  check('три строки в таблице', await p.locator('.adm-row-wrap').count() === 3);

  await p.fill('.adm-search input', 'иван');
  await p.waitForTimeout(50);
  check('поиск по display_name сузил список до 1', await p.locator('.adm-row-wrap').count() === 1);
  await p.fill('.adm-search input', '');
  await p.waitForTimeout(50);
  check('очистка поиска вернула всех', await p.locator('.adm-row-wrap').count() === 3);

  await p.fill('.adm-search input', 'anna');
  await p.waitForTimeout(50);
  check('поиск по @username находит', await p.locator('.adm-row-wrap').count() === 1);
  await p.fill('.adm-search input', '');
  await p.waitForTimeout(50);

  await p.locator('.adm-dd-btn').click();
  await p.waitForTimeout(120);
  check('дропдаун фильтра открыт', await p.locator('.adm-dd.open').count() === 1);
  const firstItemBox = await p.locator('.adm-dd-item').nth(1).boundingBox();
  const menuBox = await p.locator('.adm-dd-menu').boundingBox();
  check('пункты дропдауна выровнены по левому краю (не уехали вправо)', Math.abs(firstItemBox.x - menuBox.x) < 12, `item.x=${firstItemBox.x} menu.x=${menuBox.x}`);
  await p.locator('.adm-dd-item', { hasText: 'RARE' }).click();
  await p.waitForTimeout(80);
  check('фильтр по роли RARE сузил список до 1', await p.locator('.adm-row-wrap').count() === 1);
  check('дропдаун закрылся после выбора', await p.locator('.adm-dd.open').count() === 0);
  check('кнопка фильтра показывает RARE', (await p.locator('.adm-dd-btn').textContent()).includes('RARE'));
  await p.locator('.adm-dd-btn').click();
  await p.locator('.adm-dd-item', { hasText: 'Все роли' }).click();
  await p.waitForTimeout(80);
  check('сброс фильтра вернул всех', await p.locator('.adm-row-wrap').count() === 3);

  console.log('\n── Планировка строки ──');
  const annaRow = p.locator('.adm-row-wrap').filter({ hasText: 'anna' });
  check('юзер без display_name показывает только @ник', (await annaRow.locator('.adm-name').textContent()) === '@anna');
  check('у юзера без имени нет отдельной строки @ника под именем', await annaRow.locator('.adm-handle').count() === 0);
  const ivanRow = p.locator('.adm-row-wrap').filter({ hasText: 'Иван Иванов' });
  check('у юзера с именем есть @ник под именем', (await ivanRow.locator('.adm-handle').textContent()) === '@ivan');
  check('шильдик роли в одной строке с именем', await ivanRow.locator('.adm-line1 .role-badge').count() === 1);

  console.log('\n── Присутствие: онлайн-точка и последняя активность ──');
  const godRowPresence = p.locator('.adm-row-wrap').filter({ hasText: 'god' });
  check('god (online) — пульсирующая точка без .away', await godRowPresence.locator('.adm-live-dot:not(.away)').count() === 1);
  check('god (online) — текст «Онлайн»', (await godRowPresence.locator('.adm-presence').textContent()).trim() === 'Онлайн');
  check('ivan (away) — точка с классом .away', await ivanRow.locator('.adm-live-dot.away').count() === 1);
  check('ivan (away) — текст «Отошёл»', (await ivanRow.locator('.adm-presence').textContent()).trim() === 'Отошёл');
  check('anna (offline) — точки нет вообще', await annaRow.locator('.adm-live-dot').count() === 0);
  check('anna (offline, вчера 19:30) — текст «Вчера в 19:30»', (await annaRow.locator('.adm-presence').textContent()).trim() === 'Вчера в 19:30');
  const presenceColor = await annaRow.locator('.adm-presence span').last().evaluate((el) => getComputedStyle(el).color);
  const faintColor = await p.locator('.adm-handle').first().evaluate((el) => getComputedStyle(el).color);
  check('текст последней активности — тот же нейтральный серый токен, что и @ник', presenceColor === faintColor, `presence=${presenceColor} faint=${faintColor}`);

  console.log('\n── Разворот строки, тумблеры, PUT ──');
  await ivanRow.locator('.adm-row').click();
  await p.waitForTimeout(350);
  check('строка развёрнута (класс expanded)', (await ivanRow.getAttribute('class')).includes('expanded'));
  check('в развороте 3 модуля (admin отфильтрован по min_role=arcana)', await ivanRow.locator('.adm-tog-row').count() === 3);
  const sectionTitleGap = await ivanRow.locator('.adm-expand-in').evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  check('у "Доступ к модулям" есть заметный отступ сверху (было 2px, прижато)', sectionTitleGap >= 10, 'padding-top=' + sectionTitleGap);
  const checkedCount = await p.evaluate(() => {
    const row = [...document.querySelectorAll('.adm-row-wrap')].find((r) => r.textContent.includes('Иван Иванов'));
    return [...row.querySelectorAll('.adm-switch')].filter((s) => s.classList.contains('on')).length;
  });
  check('у ivan включено ровно 2 модуля', checkedCount === 2, 'on=' + checkedCount);

  await p.evaluate(() => { window.__calls.length = 0; });
  await ivanRow.locator('.adm-tog-row', { hasText: 'Признания' }).locator('.adm-switch').click();
  await p.waitForTimeout(100);
  const putCall = await p.evaluate(() => window.__calls.find((c) => c.method === 'PUT'));
  check('PUT ушёл на /api/users/u2', !!putCall && putCall.path === '/api/users/u2', JSON.stringify(putCall));
  check('тело PUT содержит valentine', !!putCall && putCall.body.modules.includes('valentine'), JSON.stringify(putCall?.body));

  console.log('\n── GOD/arcana: тумблеры checked+disabled, удаление скрыто ──');
  const godRow = p.locator('.adm-row-wrap').filter({ hasText: 'god' });
  await godRow.locator('.adm-row').click();
  await p.waitForTimeout(350);
  check('кнопка удаления скрыта для arcana', await godRow.locator('.adm-icon-btn.danger').count() === 0);
  const godStates = await p.evaluate(() => {
    const row = [...document.querySelectorAll('.adm-row-wrap')].find((r) => r.textContent.includes('Хозяин') || r.textContent.includes('god'));
    return [...row.querySelectorAll('.adm-switch')].map((s) => ({ on: s.classList.contains('on'), disabled: s.disabled }));
  });
  check('у arcana все тумблеры on+disabled', godStates.length === 3 && godStates.every((s) => s.on && s.disabled), JSON.stringify(godStates));
  check('пометка про Arcana показана', (await godRow.textContent()).includes('Arcana имеет доступ'));
  const godDots = await godRow.locator('.adm-dot').evaluateAll((els) => els.map((el) => el.classList.contains('on')));
  check('у arcana все точки .adm-dots горят (доступ ко всем модулям, а не 1)', godDots.length === 3 && godDots.every(Boolean), JSON.stringify(godDots));
  await godRow.locator('.adm-row').click();
  await p.waitForTimeout(350);

  console.log('\n── Drawer добавления (крестик по центру, валидация, тир-чипы) ──');
  await p.locator('.adm-tray .adm-btn-primary').click();
  await p.waitForTimeout(450);
  check('drawer открыт с заголовком «Добавить пользователя»', (await p.locator('.adm-drawer-head span').textContent()) === 'Добавить пользователя');
  check('логин пуст', (await p.locator('.adm-input').first().inputValue()) === '');
  check('ранг по умолчанию COMMON активен', await p.locator('.adm-tier-chip.on', { hasText: 'COMMON' }).count() === 1);

  const xBox = await p.locator('.adm-x').boundingBox();
  const xIconBox = await p.locator('.adm-x .adm-ic').boundingBox();
  const xCenterX = xBox.x + xBox.width / 2, xCenterY = xBox.y + xBox.height / 2;
  const iCenterX = xIconBox.x + xIconBox.width / 2, iCenterY = xIconBox.y + xIconBox.height / 2;
  check('крестик закрытия по центру кнопки', Math.abs(xCenterX - iCenterX) < 2 && Math.abs(xCenterY - iCenterY) < 2,
    `btn=(${xCenterX.toFixed(1)},${xCenterY.toFixed(1)}) icon=(${iCenterX.toFixed(1)},${iCenterY.toFixed(1)})`);

  await p.evaluate(() => { window.__toasts.length = 0; });
  await p.locator('.adm-drawer-actions .adm-btn-primary').click();
  await p.waitForTimeout(50);
  let lastToast = await p.evaluate(() => window.__toasts[window.__toasts.length - 1]);
  check('пустая форма -> toast «Логин и пароль»', lastToast && lastToast.msg === 'Логин и пароль' && lastToast.type === 'error', JSON.stringify(lastToast));

  await p.fill('.adm-input >> nth=0', 'newuser');
  await p.fill('.adm-input[type=password]', '123');
  await p.evaluate(() => { window.__toasts.length = 0; });
  await p.locator('.adm-drawer-actions .adm-btn-primary').click();
  await p.waitForTimeout(50);
  lastToast = await p.evaluate(() => window.__toasts[window.__toasts.length - 1]);
  check('короткий пароль -> toast про 6 символов', lastToast && lastToast.msg.includes('6 символов'), JSON.stringify(lastToast));

  await p.locator('.adm-tier-chip', { hasText: 'LEGENDARY' }).click();
  await p.waitForTimeout(150);
  check('ранг сменился на LEGENDARY (активный чип полноценного цвета)', await p.locator('.adm-tier-chip.on', { hasText: 'LEGENDARY' }).count() === 1);
  check('COMMON-чип больше не активен (приглушён)', await p.locator('.adm-tier-chip.on', { hasText: 'COMMON' }).count() === 0);

  await p.fill('.adm-input[type=password]', 'longpass1');
  await p.evaluate(() => { window.__calls.length = 0; });
  await p.locator('.adm-drawer-actions .adm-btn-primary').click();
  await p.waitForTimeout(450);
  const postCall = await p.evaluate(() => window.__calls.find((c) => c.method === 'POST' && c.path === '/api/users'));
  check('POST /api/users ушёл с ролью legendary', !!postCall && postCall.body.role === 'legendary', JSON.stringify(postCall));
  check('drawer закрылся после успешного создания', await p.locator('.adm-drawer-overlay').count() === 0);
  check('новый пользователь в таблице (4 всего)', await p.locator('.adm-row-wrap').count() === 4);

  console.log('\n── Drawer редактирования — тот же компонент, что «Добавить» ──');
  const annaRow2 = p.locator('.adm-row-wrap').filter({ hasText: 'anna' });
  await annaRow2.locator('[aria-label="Изменить"]').click();
  await p.waitForTimeout(450);
  check('drawer открыт с заголовком «Редактировать»', (await p.locator('.adm-drawer-head span').textContent()) === 'Редактировать');
  check('подпись объясняет что это та же панель', (await p.locator('.adm-drawer-sub').textContent()).includes('Добавить'));
  check('логин префилнут (anna)', (await p.locator('.adm-input').first().inputValue()) === 'anna');
  check('ранг префилнут (RARE)', await p.locator('.adm-tier-chip.on', { hasText: 'RARE' }).count() === 1);
  await p.locator('.adm-x').click();
  await p.waitForTimeout(450);
  check('drawer закрылся по крестику', await p.locator('.adm-drawer-overlay').count() === 0);

  console.log('\n── Удаление: подтверждение и отмена ──');
  await annaRow2.locator('[aria-label="Удалить"]').click();
  await p.waitForTimeout(120);
  check('модалка удаления открыта с именем', (await p.locator('.modal-overlay.active .form-input').textContent()).trim() === 'anna');
  await p.locator('.modal-overlay.active .btn-secondary').click();
  await p.waitForTimeout(80);
  const noDeleteCall = await p.evaluate(() => window.__calls.some((c) => c.method === 'DELETE'));
  check('отмена не отправила DELETE', noDeleteCall === false);

  /* Escape и клик по фону закрывают окно по-настоящему. Раньше этим ведал
     глобальный слушатель в ядре: он снимал класс active с React-овской
     разметки — окно пропадало с экрана, но модуль считал его открытым. */
  await annaRow2.locator('[aria-label="Удалить"]').click();
  await p.waitForTimeout(120);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  check('Escape закрыл окно удаления', await p.locator('.modal-overlay.active').count() === 0);
  await annaRow2.locator('[aria-label="Удалить"]').click();
  await p.waitForTimeout(120);
  await p.locator('.modal-overlay.active').click({ position: { x: 6, y: 6 } });
  await p.waitForTimeout(150);
  check('клик по фону закрыл окно удаления', await p.locator('.modal-overlay.active').count() === 0);
  check('за закрытия ничего не удалилось',
    await p.evaluate(() => window.__calls.every((c) => c.method !== 'DELETE')));

  await annaRow2.locator('[aria-label="Удалить"]').click();
  await p.waitForTimeout(120);
  await p.evaluate(() => { window.__calls.length = 0; });
  await p.locator('.modal-overlay.active .btn-danger').click();
  await p.waitForTimeout(150);
  const deleteCall = await p.evaluate(() => window.__calls.find((c) => c.method === 'DELETE'));
  check('DELETE ушёл на /api/users/u3', !!deleteCall && deleteCall.path === '/api/users/u3', JSON.stringify(deleteCall));
  check('пользователь пропал из таблицы (3 осталось)', await p.locator('.adm-row-wrap').count() === 3);

  console.log('\n── Drawer «Модули по умолчанию» ──');
  await p.locator('.adm-tray .adm-btn', { hasText: 'Модули по умолчанию' }).click();
  await p.waitForTimeout(450);
  check('drawer дефолтов открыт', (await p.locator('.adm-drawer-head span').textContent()) === 'Модули по умолчанию');
  await p.waitForTimeout(100);
  const preChecked = await p.evaluate(() => [...document.querySelectorAll('.adm-defaults-list .adm-switch')].filter((s) => s.classList.contains('on')).length);
  check('изначально включён только messenger', preChecked === 1, 'on=' + preChecked);
  await p.locator('.adm-defaults-list .adm-tog-row', { hasText: 'Каналы' }).locator('.adm-switch').click();
  await p.evaluate(() => { window.__calls.length = 0; });
  await p.locator('.adm-drawer-actions .adm-btn-primary').click();
  await p.waitForTimeout(500);
  const defaultsCall = await p.evaluate(() => window.__calls.find((c) => c.method === 'POST' && c.path === '/api/settings/default-modules'));
  check('POST default-modules содержит messenger и channels',
    !!defaultsCall && defaultsCall.body.modules.includes('messenger') && defaultsCall.body.modules.includes('channels'),
    JSON.stringify(defaultsCall));
  check('drawer дефолтов закрылся после сохранения', await p.locator('.adm-drawer-overlay').count() === 0);

  await p.screenshot({ path: 'shot-final.png' });
  await p.close();

  console.log('\n── Пустой список пользователей ──');
  const p2 = await open(BASE + '?empty=1');
  check('нет строк пользователей', await p2.locator('.adm-row-wrap').count() === 0);
  check('показано «Никого не нашлось»', (await p2.locator('.adm-empty').textContent()).includes('Никого не нашлось'));
  await p2.close();

  console.log('\n── Форматирование последней активности (сегодня/вчера/старше/нет данных) ──');
  const p3 = await open(BASE + '?presence=1');
  const todayText = (await p3.locator('.adm-row-wrap').filter({ hasText: 'Сегодняшний' }).locator('.adm-presence').textContent()).trim();
  check('сегодня -> «Сегодня в HH:MM»', /^Сегодня в \d{2}:\d{2}$/.test(todayText), todayText);
  const yestText = (await p3.locator('.adm-row-wrap').filter({ hasText: 'Вчерашний' }).locator('.adm-presence').textContent()).trim();
  check('вчера (зафиксировано 19:30) -> «Вчера в 19:30»', yestText === 'Вчера в 19:30', yestText);
  const oldText = (await p3.locator('.adm-row-wrap').filter({ hasText: 'Старый' }).locator('.adm-presence').textContent()).trim();
  check('старше суток -> «24 августа <прошлый год> в 13:45» (родительный падеж, год т.к. не текущий)', /^24 августа \d{4} в 13:45$/.test(oldText), oldText);
  const nodataText = (await p3.locator('.adm-row-wrap').filter({ hasText: 'Без данных' }).locator('.adm-presence').textContent()).trim();
  check('нет last_seen -> «—», без краша', nodataText === '—', nodataText);
  await p3.close();

  console.log('\n── Мобильный тулбар <473px: поиск своей строкой, фильтр+лоток кнопок — второй, "Все роли" не сжата, без overflow ──');
  console.log('\n── Поиск — общий компонент каркаса ──');
  const ps = await open(BASE);
  check('поле поиска собрано из общего элемента',
    await ps.locator('.adm-search.ho-search').count() === 1);
  check('лупа и ввод внутри одного поля',
    await ps.locator('.adm-search .ho-search-ic').count() === 1
    && await ps.locator('.adm-search input').count() === 1);
  const ADM_LOOK = await ps.evaluate((sel) => {
      const f = document.querySelector(sel);
      const i = f.querySelector('input');
      const fs = getComputedStyle(f);
      const is = getComputedStyle(i);
      return [
        fs.backgroundColor,
        fs.borderRadius,
        Math.round(f.getBoundingClientRect().height) + 'px',
        fs.boxShadow,
        is.color,
        is.fontSize,
        is.fontFamily.split(',')[0].replace(/["']/g, ''),
      ].join(' | ');
    }, '.adm-search');
  console.log('        эталон: ' + ADM_LOOK);
  check('поле выглядит ровно так, как задумано в модуле', ADM_LOOK === 'rgb(246, 244, 251) | 10px | 36px | rgba(45, 30, 70, 0.1) 0px 2px 4px 0px inset, rgba(255, 255, 255, 0.7) 0px -1px 0px 0px inset, rgba(45, 30, 70, 0.05) 0px 0px 0px 0.5px | rgb(31, 26, 43) | 12.6px | Inter', ADM_LOOK);
  check('ширина поля осталась прежней',
    await ps.evaluate(() => Math.round(document.querySelector('.adm-search').getBoundingClientRect().width)) === 220,
    String(await ps.evaluate(() => Math.round(document.querySelector('.adm-search').getBoundingClientRect().width))));
  await ps.locator('.adm-search input').fill('к');
  await ps.waitForTimeout(250);
  check('крестик очистки на месте', await ps.locator('.adm-search .ho-search-clear').count() === 1);
  await ps.locator('.adm-search .ho-search-clear').click();
  await ps.waitForTimeout(250);
  check('крестик очищает поиск', (await ps.locator('.adm-search input').inputValue()) === '');
  await ps.close();

  for (const width of [1280, 474, 473, 375]) {
    const pm = await open(BASE, { width, height: 860 });
    const overflow = await pm.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`width=${width}: нет горизонтального overflow`, overflow <= 1, 'overflow=' + overflow);
    if (width <= 473) {
      check(`width=${width}: подпись "Модули по умолчанию" скрыта`, await pm.locator('.adm-btn-label').isVisible() === false);
      const searchBox = await pm.locator('.adm-search').boundingBox();
      const ddBox = await pm.locator('.adm-dd-btn').boundingBox();
      const trayBox = await pm.locator('.adm-toolbar .adm-tray').boundingBox();
      check(`width=${width}: поиск — отдельная строка над фильтром/лотком`, searchBox.y < ddBox.y - 4, `search.y=${searchBox.y} dd.y=${ddBox.y}`);
      check(`width=${width}: фильтр ролей и лоток кнопок в одной строке`, Math.abs(ddBox.y - trayBox.y) < 4, `dd.y=${ddBox.y} tray.y=${trayBox.y}`);
      check(`width=${width}: "Все роли" не сжата (полная ширина кнопки)`, ddBox.width >= 80, 'dd.width=' + ddBox.width);
      const ddText = (await pm.locator('.adm-dd-btn').textContent()).trim();
      check(`width=${width}: текст фильтра не обрезан`, ddText.startsWith('ВСЕ РОЛИ') || ddText.startsWith('Все роли'), ddText);
    } else {
      check(`width=${width}: подпись "Модули по умолчанию" видна`, await pm.locator('.adm-btn-label').isVisible() === true);
    }
    await pm.close();
  }
} finally {
  
await browser.close();
  server.kill();
}

console.log('\n' + (failed === 0 ? 'Все проверки прошли' : failed + ' проверок провалено'));
process.exit(failed === 0 ? 0 : 1);
