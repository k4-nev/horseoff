import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/* Проверяем каркас целиком: ядро (core/shell.js) поднимается как в проде,
   бэкенд подменён перехватом /api/**, модули — заглушками. Так видно, что
   React-каркас и ядро сходятся друг с другом, а не только по отдельности. */

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:8901/core/shell.html';

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

const MODULES = [
  { id: 'messenger', name: 'Сообщения', icon: 'messenger', entry: 'messenger.html' },
  { id: 'channels', name: 'Каналы', icon: 'channels', entry: 'channels.html' },
  { id: 'servers', name: 'Серверы', icon: 'servers', entry: 'servers.html' },
  { id: 'bots', name: 'Боты', icon: 'bots', entry: 'bots.html' },
  { id: 'wb', name: 'MP продвижение', icon: 'wb', entry: 'wb.html' },
  { id: 'valentine', name: 'Признания', icon: 'valentine', entry: 'valentine.html' },
  { id: 'admin', name: 'Пользователи', icon: 'users', entry: 'admin.html', min_role: 'arcana' },
];

const server = spawn('node', ['static-server.mjs'], { cwd: HERE, stdio: 'ignore' });
await waitForServer('http://localhost:8901/core/shell.css');
const browser = await chromium.launch();

async function open(opts = {}) {
  const p = await browser.newPage({ viewport: opts.viewport || { width: 1280, height: 860 } });
  p.on('pageerror', (e) => { console.log(' FAIL  [pageerror] ' + e.message); failed++; });
  p.on('console', (m) => {
    const s = m.text();
    // 404 на /sw.js — статика харнесса, в проде service worker лежит в корне
    if (m.type() === 'error' && !/WebSocket|Failed to load resource|fetching the script/i.test(s)) { console.log(' FAIL  [console] ' + s); failed++; }
  });

  await p.route('**/api/**', async (route) => {
    const url = route.request().url();
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.includes('/api/auth/status')) return json({ username: 'k4nev', role: 'arcana' });
    if (url.includes('/api/profile')) return json({ username: 'k4nev', role: 'arcana', id: 'u1', display_name: 'Костя', avatar: null });
    if (url.includes('/api/modules')) return json(opts.modules || MODULES);
    if (url.includes('/api/version')) return json({ version: '2.240' });
    if (url.includes('/api/auth/sessions')) return json([]);
    if (url.includes('/api/push/key')) return json({ available: false });
    return json({ status: 'ok' });
  });
  /* Модули подменяем заглушками: настоящие тянут свой бэкенд, а нам нужно
     проверить только контракт загрузки. */
  await p.route('**/modules/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('.css')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.endsWith('.js')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    const id = url.split('/modules/')[1].split('/')[0];
    return route.fulfill({ status: 200, contentType: 'text/html', body: `<div class="stub" data-stub="${id}">${id}</div>` });
  });

  await p.addInitScript(() => { localStorage.setItem('ho_token', 'test-token'); localStorage.removeItem('ho_pin'); localStorage.removeItem('ho_mod_uses'); });
  await p.goto(BASE);
  await p.waitForSelector('#appShell.active', { timeout: 8000 });
  await p.waitForTimeout(500);
  return p;
}

/* Шары непрерывно качаются на своих орбитах, поэтому Playwright никогда не
   считает их «стабильными» — кликаем по координатам, а не через locator. */
async function clickOrb(p, title) {
  const b = await p.locator(`.ho-orb[title="${title}"]`).boundingBox();
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

async function openRing(p) {
  const h = await p.locator('.ho-fab').boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await p.mouse.down();
  await p.mouse.up();
  await p.waitForTimeout(1300);
}

/* Кнопка обязана быть в левом нижнем углу и ничего не сдвигать: слой
   навигации fixed, у каркаса нет резервных отступов. */
async function fabCorner(p) {
  return p.evaluate(() => {
    const f = document.querySelector('.ho-fab');
    const r = f.getBoundingClientRect();
    const shell = getComputedStyle(document.getElementById('appShell'));
    return {
      left: Math.round(r.left),
      fromBottom: Math.round(innerHeight - r.bottom),
      padL: parseFloat(shell.paddingLeft),
      padR: parseFloat(shell.paddingRight),
      fixed: getComputedStyle(f).position === 'fixed',
    };
  });
}

try {
  console.log('\n── Каркас поднимается и грузит модуль по умолчанию ──');
  const p = await open();
  check('React отрисовал каркас (#appShell.active)', await p.locator('#appShell.active').count() === 1);
  check('старого сайдбара в DOM нет', await p.locator('.sidebar, #sidebarModules, #profileBtn').count() === 0);
  check('контейнер модулей на месте', await p.locator('#moduleContent').count() === 1);
  check('по умолчанию открыт мессенджер', await p.locator('#moduleContent .stub[data-stub="messenger"]').count() === 1);
  check('тема по умолчанию светлая', await p.evaluate(() => document.body.classList.contains('theme-light')));
  check('узел голосовой плашки существует (его пишет модуль «Каналы»)', await p.locator('#sidebarVoiceBar').count() === 1);
  const fc = await fabCorner(p);
  check('кнопка «Приложения» в левом нижнем углу', fc.left < 40 && fc.fromBottom < 40 && fc.fixed, JSON.stringify(fc));
  check('каркас ничего не резервирует под навигацию', fc.padL < 1 && fc.padR < 1, JSON.stringify(fc));

  console.log('\n── Кольцо: разлёт, выбор модуля, размытие ──');
  await openRing(p);
  const orbs = await p.locator('.ho-orb').count();
  check('шаров = модулей + профиль', orbs === MODULES.length + 1, String(orbs));
  check('кольцо открыто', await p.locator('.ho-nav.open').count() === 1);
  check('анимации реально идут (WAAPI)', (await p.evaluate(() => document.getAnimations().length)) > MODULES.length);
  check('«Пользователи» — обычный шар, а не отдельная кнопка',
    await p.locator('.ho-orb[title="Пользователи"]').count() === 1);
  check('профильный шар подписан именем', await p.locator('.ho-orb[title="Костя"]').count() === 1);

  await clickOrb(p, 'Серверы');
  await p.waitForTimeout(900);
  check('выбор шара переключил модуль', await p.locator('#moduleContent .stub[data-stub="servers"]').count() === 1);
  check('кольцо закрылось', await p.locator('.ho-nav.open').count() === 0);
  check('активный шар помечен', await p.evaluate(() => {
    const s = document.querySelector('.ho-orb[title="Серверы"]');
    return !!s && s.classList.contains('on');
  }));
  check('прежний контейнер модуля сохранён (кэш не потерян)',
    await p.locator('#moduleContent .stub[data-stub="messenger"]').count() === 1);

  console.log('\n── Тычок мимо шара сворачивает кольцо ──');
  await openRing(p);
  await p.mouse.click(p.viewportSize().width - 80, 120);
  await p.waitForTimeout(900);
  check('клик в пустое место закрыл кольцо', await p.locator('.ho-nav.open').count() === 0);

  console.log('\n── Позиции шаров не пляшут между открытиями ──');
  const snap = async () => {
    await openRing(p);
    const s = await p.evaluate(() => {
      const o = {};
      document.querySelectorAll('.ho-bub').forEach((b) => {
        const r = b.getBoundingClientRect();
        o[b.querySelector('.ho-orb').title] = Math.round(r.left / 8) + ':' + Math.round(r.top / 8);
      });
      return o;
    });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(900);
    return s;
  };
  const a1 = await snap();
  await openRing(p);
  await clickOrb(p, 'Каналы');
  await p.waitForTimeout(1000);
  const a2 = await snap();
  check('после переключения модуля места шаров те же', JSON.stringify(a1) === JSON.stringify(a2),
    JSON.stringify(a1) + ' vs ' + JSON.stringify(a2));

  console.log('\n── Счётчики приходят из ядра ──');
  await p.evaluate(() => { Shell.unreadTotal = 7; Shell.updateMsgBadge(); });
  await p.waitForTimeout(200);
  await openRing(p);
  check('непрочитанное на шаре «Сообщения»', (await p.locator('.ho-bub .ho-tag').first().textContent()) === '7');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(700);
  check('Esc закрывает кольцо', await p.locator('.ho-nav.open').count() === 0);

  console.log('\n── Живая выдача и снятие доступов (WS modules_update) ──');
  const p2 = await open();
  await p2.evaluate(() => Shell.onModulesUpdate(['messenger', 'servers']));
  await p2.waitForTimeout(400);
  await openRing(p2);
  check('после снятия остались два модуля и профиль', await p2.locator('.ho-orb').count() === 3,
    String(await p2.locator('.ho-orb').count()));
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(600);
  await p2.evaluate(() => Shell.onModulesUpdate(['messenger', 'servers', 'bots']));
  await p2.waitForTimeout(500);
  await openRing(p2);
  check('выданный модуль появился', await p2.locator('.ho-orb[title="Боты"]').count() === 1);
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(600);

  console.log('\n── Снятие открытого модуля уводит на другой ──');
  await p2.evaluate(() => Shell.switchModule('bots'));
  await p2.waitForTimeout(500);
  await p2.evaluate(() => Shell.onModulesUpdate(['messenger', 'servers']));
  await p2.waitForTimeout(700);
  check('ушли с отобранного модуля', await p2.evaluate(() => Shell.activeModule) !== 'bots',
    await p2.evaluate(() => Shell.activeModule));
  await p2.close();

  console.log('\n── Мобильная адаптация ──');
  const p3 = await open({ viewport: { width: 390, height: 780 } });
  const fc3 = await fabCorner(p3);
  check('кнопка в том же левом нижнем углу', fc3.left < 40 && fc3.fromBottom < 46, JSON.stringify(fc3));
  check('на телефоне каркас тоже ничего не резервирует', fc3.padL < 1 && fc3.padR < 1);
  check('шары на телефоне крупнее', await p3.evaluate(() => Math.round(document.querySelector('.ho-orb').getBoundingClientRect().width)) >= 54);
  check('нижней панели не осталось', await p3.evaluate(() => {
    const c = getComputedStyle(document.querySelector('.content'));
    return parseFloat(c.paddingBottom) < 1;
  }));
  await openRing(p3);
  const box = await p3.evaluate(() => {
    const bs = [...document.querySelectorAll('.ho-bub')].map((b) => b.getBoundingClientRect());
    return {
      left: Math.min(...bs.map((r) => r.left)),
      right: Math.max(...bs.map((r) => r.right)),
      top: Math.min(...bs.map((r) => r.top)),
      bottom: Math.max(...bs.map((r) => r.bottom)),
      w: window.innerWidth, h: window.innerHeight,
    };
  });
  check('шары не вылезают за экран телефона',
    box.left > -2 && box.right < box.w + 2 && box.top > -2 && box.bottom < box.h + 2,
    JSON.stringify(box));
  console.log('\n── Погружение: в чате кнопка уходит ──');
  await p3.keyboard.press('Escape');
  await p3.waitForTimeout(800);
  await p3.evaluate(() => Shell.setImmersive(true));
  await p3.waitForTimeout(450);
  check('в чате кнопка спрятана', await p3.evaluate(() => {
    const f = document.querySelector('.ho-fab');
    return getComputedStyle(f).opacity === '0' && getComputedStyle(f).pointerEvents === 'none';
  }));
  await p3.evaluate(() => Shell.setImmersive(false));
  await p3.waitForTimeout(450);
  check('вернулись в список — кнопка на месте',
    await p3.evaluate(() => getComputedStyle(document.querySelector('.ho-fab')).opacity === '1'));
  check('на десктопе погружение кнопку не прячет', await p.evaluate(async () => {
    Shell.setImmersive(true);
    await new Promise((r) => setTimeout(r, 300));
    const vis = getComputedStyle(document.querySelector('.ho-fab')).opacity === '1';
    Shell.setImmersive(false);
    return vis;
  }));
  await p3.close();
  await p.close();

  console.log('\n── Выход и повторный вход ──');
  const p4 = await open();
  await p4.evaluate(() => Shell.logout());
  await p4.waitForTimeout(400);
  check('каркас скрыт после выхода', await p4.locator('#appShell').count() === 0);
  check('экран входа показан', await p4.evaluate(() => !document.getElementById('loginScreen').classList.contains('hidden')));
  await p4.evaluate(() => { Shell.token = 'test-token'; return Shell.verifyToken().then(() => Shell.showApp()); });
  await p4.waitForSelector('#appShell.active', { timeout: 5000 });
  await p4.waitForTimeout(600);
  check('после повторного входа каркас вернулся', await p4.locator('#appShell.active').count() === 1);
  check('модули снова на месте', await p4.evaluate(() => Shell._uiState.modules.length) === MODULES.length);
  await p4.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
