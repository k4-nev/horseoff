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

let VERSION = '2.240';
let BUILD = 'build-a';

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
    if (url.includes('/api/auth/status')) {
      if (opts.setup) return json({ setup_required: true });
      if (opts.noToken) return json({});
      return json({ username: 'k4nev', role: 'arcana' });
    }
    if (url.includes('/api/profile')) return json({ username: 'k4nev', role: 'arcana', id: 'u1', display_name: 'Костя', avatar: null });
    if (url.includes('/api/modules')) return json(opts.modules || MODULES);
    if (url.includes('/api/version')) return json({ version: VERSION, build: BUILD });
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

  await p.addInitScript(([tok, pin]) => {
    if (tok) localStorage.setItem('ho_token', tok); else localStorage.removeItem('ho_token');
    if (pin) localStorage.setItem('ho_pin', pin); else localStorage.removeItem('ho_pin');
    localStorage.removeItem('ho_mod_uses');
  }, [opts.noToken ? null : 'test-token', opts.pin || null]);
  await p.goto(BASE);
  if (opts.pin) {
    await p.waitForSelector('.ho-pin-screen', { timeout: 8000 });
  } else if (opts.noToken) {
    await p.waitForSelector('.login-screen', { timeout: 8000 });
  } else {
    await p.waitForSelector('#appShell.active', { timeout: 8000 });
  }
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

  console.log('\n── Палитра: база штатная, кнопки Cloud Dancer ──');
  const pal = await p.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'x';
    document.body.appendChild(btn);
    const b = getComputedStyle(btn);
    const r = {
      accent: cs.getPropertyValue('--accent').trim(),
      success: cs.getPropertyValue('--success').trim(),
      bg: cs.getPropertyValue('--bg').trim(),
      soft: cs.getPropertyValue('--accent-soft').trim(),
      line: cs.getPropertyValue('--accent-line').trim(),
      btn: b.backgroundImage + ' | ' + b.backgroundColor,
    };
    btn.remove();
    return r;
  });
  /* Акцент выбран из стенда — индиго. Бирюза выведена, и вместе с ней ушли
     прибитые гвоздями rgba(0,212,170,…): все оттенки считаются от токена. */
  check('--accent — индиго', pal.accent === '#4c4fd8', pal.accent);
  check('оттенки акцента заданы вместе с ним',
    pal.soft === '#e8e8fb' && pal.line === '#cdcef6', pal.soft + ' / ' + pal.line);
  check('зелёный --success на месте', pal.success === '#22c55e', pal.success);
  check('базовый фон штатный', pal.bg === '#f2f4f8', pal.bg);
  /* Кнопка не должна быть бирюзовой: в её заливке нет rgb(0,212,170), зато
     есть уголь Cloud Dancer — #413c36 / #4a453f / #5d574f. */
  check('кнопка в угле Cloud Dancer, а не в бирюзе',
    !/\b0,\s*212,\s*170\b/.test(pal.btn) && /rgb\((65|74|93),\s*(60|69|87),\s*(54|63|79)\)/.test(pal.btn), pal.btn);

  console.log('\n── Модуль успевает сказать слово перед уходом ──');
  /* «Боты» на этом держат вопрос «сохранить раскладку?». Метод был у модуля
     и раньше, но оболочка его не звала — правки терялись молча. */
  await p.evaluate(() => Shell.switchModule('servers'));
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    window.__said = [];
    window.Servers = { onDeactivate: () => window.__said.push('servers') };
  });
  await p.evaluate(() => Shell.switchModule('bots'));
  await p.waitForTimeout(600);
  check('уходя из модуля, оболочка предупреждает его',
    await p.evaluate(() => window.__said.length === 1 && window.__said[0] === 'servers'),
    JSON.stringify(await p.evaluate(() => window.__said)));
  await p.evaluate(() => Shell.switchModule('bots'));
  await p.waitForTimeout(400);
  check('повторный выбор того же модуля его не будит',
    await p.evaluate(() => window.__said.length === 1));

  console.log('\n── Плашка голосовой ловит клики ──');
  const vb = await p.evaluate(() => {
    const bar = document.getElementById('sidebarVoiceBar');
    bar.style.display = 'flex';
    bar.innerHTML = '<div class="sb-voice-bar-ico">x</div>';
    const r = bar.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const res = { pe: getComputedStyle(bar).pointerEvents, hit: !!(top && bar.contains(top)) };
    bar.style.display = 'none';
    bar.innerHTML = '';
    return res;
  });
  check('плашка не сквозная для кликов', vb.pe === 'auto' && vb.hit, JSON.stringify(vb));

  console.log('\n── Оверлеи модулей накрывают кнопку ──');
  /* Кнопка обязана быть поверх интерфейса, но под затемнениями, панелями и
     размытиями модулей. Все они живут на z-index:1000 внутри .content —
     проверяем, что .content их больше не запирает под слоем навигации. */
  const layers = await p.evaluate(() => {
    const nav = document.querySelector('.ho-nav');
    const fab = document.querySelector('.ho-fab');
    const r = fab.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const before = document.elementFromPoint(x, y);

    const host = document.getElementById('moduleContent');
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.4)';
    host.appendChild(ov);
    const after = document.elementFromPoint(x, y);
    ov.remove();

    return {
      navZ: parseInt(getComputedStyle(nav).zIndex, 10),
      contentZ: getComputedStyle(host).zIndex,
      fabOnTop: !!(before && fab.contains(before)),
      coveredByOverlay: after === ov,
    };
  });
  check('.content не создаёт контекст наложения', layers.contentZ === 'auto', layers.contentZ);
  check('без оверлея кнопка кликабельна поверх модуля', layers.fabOnTop, JSON.stringify(layers));
  check('затемнение модуля накрывает кнопку', layers.coveredByOverlay, JSON.stringify(layers));
  check('слой навигации между обвязкой и оверлеями', layers.navZ === 60, String(layers.navZ));

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

  console.log('\n── Модалка профиля на React ──');
  const pp = await open();
  await pp.evaluate(() => Shell.openProfile());
  await pp.waitForTimeout(500);
  check('профиль открылся', await pp.locator('.prof-modal').count() === 1);
  check('имя и логин подставлены', await pp.evaluate(() => {
    const n = document.querySelector('.prof-identity-display').textContent;
    const u = document.querySelector('.prof-identity-username').textContent;
    return n === 'Костя' && u === '@k4nev';
  }));
  check('по умолчанию вкладка «Аккаунт»',
    (await pp.locator('.prof-tab.active').textContent()) === 'Аккаунт');
  await pp.locator('.prof-tab', { hasText: 'Сессии' }).click();
  await pp.waitForTimeout(200);
  check('вкладка переключилась', (await pp.locator('.prof-tab.active').textContent()) === 'Сессии');
  check('счётчик сессий из ядра', (await pp.locator('.prof-session-count').textContent()) === 'Сессий активно: 0');
  await pp.locator('.prof-tab', { hasText: 'Безопасность' }).click();
  await pp.waitForTimeout(200);
  check('PIN не настроен', (await pp.locator('.prof-pin-sub').textContent()) === 'Не настроен');
  await pp.keyboard.press('Escape');
  await pp.waitForTimeout(300);
  check('Esc закрыл профиль', await pp.locator('.prof-modal').count() === 0);
  check('состояние профиля очищено', await pp.evaluate(() => Shell._uiState.profile === null));

  console.log('\n── Одна очередь вместо трёх механизмов ──');
  await pp.evaluate(() => Shell.dismissNote());
  await pp.evaluate(() => Shell.toast('Сервер удалён'));
  await pp.waitForTimeout(250);
  check('подтверждение — карточка очереди', await pp.locator('.hq .hq-card.hq-k-ok').count() === 1);
  check('текст на месте', (await pp.locator('.hq-title').first().textContent()) === 'Сервер удалён');
  check('старых механизмов не осталось',
    (await pp.locator('.toast').count()) === 0
    && (await pp.locator('.cloud').count()) === 0
    && (await pp.locator('.msg-notify').count()) === 0);

  await pp.evaluate(() => Shell.showNotification({ from: 'u9', from_name: 'Мысика', text: 'прокси лёг' }));
  await pp.evaluate(() => Shell.notify({ id: 'x1', text: 'Есть событие', action: { label: 'Открыть', fn: () => { window.__acted = 1; } } }));
  await pp.waitForTimeout(300);
  check('три вида в одной стопке', await pp.locator('.hq .hq-card').count() === 3);
  check('стопка одна', await pp.locator('.hq').count() === 1);
  check('сообщение со своим видом', await pp.locator('.hq-card.hq-k-msg').count() === 1);
  check('у сообщения кликается вся карточка, отдельной кнопки нет',
    (await pp.locator('.hq-card.hq-k-msg .hq-open').count()) === 1
    && (await pp.locator('.hq-card.hq-k-msg .hq-do').count()) === 0);

  await pp.locator('.hq-card.hq-k-info .hq-do').click();
  check('кнопка карточки вызвала обработчик', await pp.evaluate(() => window.__acted === 1));
  await pp.waitForTimeout(250);
  check('карточка ушла после действия', await pp.locator('.hq-card.hq-k-info').count() === 0);

  console.log('\n── Больше трёх — счётчик, а не простыня ──');
  await pp.evaluate(() => { Shell.dismissNote(); for (let i = 0; i < 6; i++) Shell.toast('Событие ' + i); });
  await pp.waitForTimeout(350);
  check('видно только три', await pp.locator('.hq .hq-card').count() === 3);
  check('остальные посчитаны', (await pp.locator('.hq-more').textContent()).includes('3'));
  check('внизу стопки — самое свежее',
    (await pp.locator('.hq-card .hq-title').last().textContent()) === 'Событие 5');
  await pp.locator('.hq-more').click();
  await pp.waitForTimeout(250);
  check('счётчик раскрывает всю очередь', await pp.locator('.hq .hq-card').count() === 6);
  await pp.evaluate(() => Shell.dismissNote());
  await pp.waitForTimeout(200);

  console.log('\n── Версия проставляется в одном месте ──');
  /* Оболочка заполняет .app-version и при загрузке версии, и при загрузке
     модуля. Без второго прохода модули, открытые позже входа, оставались
     с тем, что зашито у них в разметке. */
  const ver = await pp.evaluate(async () => {
    const host = document.getElementById('moduleContent');
    const box = document.createElement('div');
    box.className = 'module-container';
    box.innerHTML = '<span class="app-version">ЗАШИТО</span>';
    host.appendChild(box);
    const before = box.querySelector('.app-version').textContent;
    Shell._stampVersion();
    const after = box.querySelector('.app-version').textContent;
    box.remove();
    return { before, after, state: Shell._uiState.version };
  });
  check('до прохода в разметке остаётся зашитое', ver.before === 'ЗАШИТО');
  check('оболочка проставляет реальный номер', ver.after === 'v' + ver.state, JSON.stringify(ver));
  check('номер тот же, что в состоянии ядра', ver.state === VERSION, ver.state);

  console.log('\n── Обновление приложения ──');
  /* Сравниваем сборку, а не номер версии: version.json правят руками и на
     деплое забывают — из-за этого уведомление не приходило вообще. */
  await pp.evaluate(() => { Shell.appBuild = 'old-build'; });
  BUILD = 'new-build';
  VERSION = '2.341';
  await pp.evaluate(() => Shell._checkVersion());
  await pp.waitForTimeout(400);
  check('обновление пришло', await pp.locator('.hq-card.hq-k-update').count() === 1);
  check('версия написана прямо в карточке',
    (await pp.locator('.hq-card.hq-k-update .hq-text').textContent()) === 'Версия 2.341');
  check('закрыть обновление нельзя', await pp.locator('.hq-card.hq-k-update .hq-x').count() === 0);
  check('версия обновилась и в состоянии', await pp.evaluate(() => Shell._uiState.version) === '2.341');

  await pp.evaluate(() => Shell._checkVersion());
  await pp.waitForTimeout(300);
  check('повторная проверка не плодит карточки', await pp.locator('.hq-card.hq-k-update').count() === 1);

  console.log('\n── Раскрытое кольцо и очередь не спорят за место ──');
  await openRing(pp);
  check('пока кольцо открыто, стопки нет', await pp.locator('.hq').count() === 0);
  check('счёт переехал на кнопку', (await pp.locator('.ho-fab-tag').textContent()) === '1');
  await pp.keyboard.press('Escape');
  await pp.waitForTimeout(800);
  check('кольцо закрылось — карточка вернулась', await pp.locator('.hq-card.hq-k-update').count() === 1);
  check('счёт с кнопки убран', await pp.locator('.ho-fab-tag').count() === 0);
  await pp.evaluate(() => Shell.dismissNote());

  console.log('\n── Чужой текст приходит как текст, а не как разметка ──');
  /* Уведомление о новом сообщении раньше собиралось склейкой innerHTML:
     текст чужого сообщения попадал в разметку как есть. */
  const PAYLOAD = '<img src=x onerror="window.__pwned=1">';
  await pp.evaluate((s) => Shell.showNotification({ from: 'u9', from_name: s, text: s + ' привет' }), PAYLOAD);
  await pp.waitForTimeout(300);
  check('уведомление показано', await pp.locator('.hq-card.hq-k-msg').count() === 1);
  check('имя выведено буквально', (await pp.locator('.hq-card.hq-k-msg .hq-title').textContent()) === PAYLOAD);
  check('внедрённого тега нет', await pp.evaluate(() => !document.querySelector('.hq-card').querySelector('img')));
  await pp.evaluate(() => Shell.toast('<b>жирный</b>'));
  await pp.waitForTimeout(200);
  check('подтверждение тоже выводит текстом',
    await pp.evaluate(() => ![...document.querySelectorAll('.hq-card')].some((c) => c.querySelector('b'))));
  await pp.waitForTimeout(400);
  check('ничего не выполнилось', await pp.evaluate(() => window.__pwned === undefined));
  await pp.evaluate(() => Shell.dismissNote());
  await pp.close();

  console.log('\n── Экран входа и первый запуск ──');
  const pl = await open({ noToken: true });
  check('показан экран входа', await pl.locator('.login-screen').count() === 1);
  check('каркаса нет', await pl.locator('#appShell').count() === 0);
  check('в обычном входе одно поле пароля', await pl.locator('.input-eye').count() === 1);
  await pl.locator('.login-btn').click();
  await pl.waitForTimeout(200);
  check('пустая форма ругается', await pl.locator('.login-error').count() === 1);
  await pl.locator('.eye-btn').click();
  check('глазок открывает пароль',
    (await pl.locator('.input-eye input').getAttribute('type')) === 'text');
  await pl.close();

  const ps = await open({ noToken: true, setup: true });
  check('первый запуск: два поля пароля', await ps.locator('.input-eye').count() === 2);
  check('первый запуск: своя подпись',
    (await ps.locator('.login-subtitle').textContent()).includes('администратора'));
  check('первый запуск: своя кнопка', (await ps.locator('.login-btn').textContent()) === 'Создать аккаунт');
  await ps.close();

  console.log('\n── PIN-экран ──');
  const pn = await open({ pin: '1234' });
  check('PIN-экран показан', await pn.locator('.ho-pin-screen').count() === 1);
  check('формы входа под ним нет', await pn.locator('.login-screen').count() === 0);
  check('четыре точки', await pn.locator('.ho-pin-screen .pin-dot').count() === 4);
  await pn.locator('.ho-pin-key', { hasText: '9' }).click();
  await pn.waitForTimeout(120);
  check('точка заполнилась', await pn.locator('.pin-dot.on').count() === 1);
  for (const d of ['9', '9', '9']) await pn.locator('.ho-pin-key', { hasText: d }).first().click();
  await pn.waitForTimeout(250);
  check('неверный PIN — ошибка', (await pn.locator('.ho-pin-error').textContent()).includes('Неверный'));
  check('точки сброшены', await pn.locator('.pin-dot.on').count() === 0);
  for (const d of ['1', '2', '3', '4']) await pn.locator('.ho-pin-key', { hasText: d }).first().click();
  await pn.waitForSelector('#appShell.active', { timeout: 8000 });
  check('верный PIN пустил в приложение', await pn.locator('.ho-pin-screen').count() === 0);

  console.log('\n── Замок: запереть уже открытое приложение ──');
  /* Замок не выкидывает из приложения, а накрывает его экраном PIN: сокет не
     рвётся, открытый модуль остаётся открытым. Проверяем именно это — что
     под экраном всё живо и после разблокировки на месте. */
  await pn.waitForTimeout(600);
  await openRing(pn);
  check('шар замка появился, раз PIN задан',
    await pn.locator('.ho-orb[title="Заблокировать"]').count() === 1);
  /* Имя иконки подставляется в mask-image: выдуманное даёт пустой квадрат
     и ни одной ошибки в консоли. */
  const lockIco = await pn.evaluate(async () => {
    const el = document.querySelector('.ho-orb[title="Заблокировать"] .ico');
    const url = getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage;
    const m = /url\("?([^")]+)"?\)/.exec(url);
    if (!m) return { url: url, ok: false };
    const r = await fetch(m[1]);
    return { url: m[1], ok: r.ok, size: (await r.text()).length };
  });
  check('иконка замка есть на диске, а не только в классе',
    lockIco.ok && lockIco.size > 80, JSON.stringify(lockIco));

  const beforeLock = await pn.evaluate(() => ({
    active: Shell._uiState.active,
    stub: document.querySelector('#moduleContent .stub')
      ? document.querySelector('#moduleContent .stub').dataset.stub : null,
  }));
  await clickOrb(pn, 'Заблокировать');
  await pn.waitForSelector('.ho-pin-screen', { timeout: 5000 });
  check('экран PIN закрыл приложение', await pn.locator('.ho-pin-screen').count() === 1);
  check('само приложение под ним осталось', await pn.locator('#appShell').count() === 1);
  check('экран непрозрачный и поверх всего', await pn.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.ho-pin-screen'));
    return cs.position === 'fixed' && Number(cs.zIndex) >= 1000
      && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
  }));

  for (const d of ['1', '2', '3', '4']) await pn.locator('.ho-pin-key', { hasText: d }).first().click();
  await pn.waitForTimeout(500);
  check('верный PIN снял блокировку', await pn.locator('.ho-pin-screen').count() === 0);
  const afterLock = await pn.evaluate(() => ({
    active: Shell._uiState.active,
    stub: document.querySelector('#moduleContent .stub')
      ? document.querySelector('#moduleContent .stub').dataset.stub : null,
  }));
  check('модуль остался тем же, приложение не перезагрузилось',
    afterLock.active === beforeLock.active && afterLock.stub === beforeLock.stub,
    JSON.stringify(beforeLock) + ' → ' + JSON.stringify(afterLock));
  await pn.close();

  /* Без заданного PIN замка в кольце нет: возвращаться было бы некуда. */
  const pnl = await open();
  await openRing(pnl);
  check('без PIN замка в кольце нет',
    await pnl.locator('.ho-orb[title="Заблокировать"]').count() === 0);
  await pnl.evaluate(() => Shell.lock());
  await pnl.waitForTimeout(300);
  check('и программная блокировка без PIN не запирает',
    await pnl.locator('.ho-pin-screen').count() === 0);
  await pnl.close();

  console.log('\n── Выход и повторный вход ──');
  const p4 = await open();
  await p4.evaluate(() => Shell.logout());
  await p4.waitForTimeout(400);
  check('каркас скрыт после выхода', await p4.locator('#appShell').count() === 0);
  check('экран входа показан', await p4.locator('.login-screen').count() === 1);
  await p4.evaluate(() => { Shell.token = 'test-token'; return Shell.verifyToken().then(() => Shell.showApp()); });
  await p4.waitForSelector('#appShell.active', { timeout: 5000 });
  await p4.waitForTimeout(600);
  check('после повторного входа каркас вернулся', await p4.locator('#appShell.active').count() === 1);
  check('модули снова на месте', await p4.evaluate(() => Shell._uiState.modules.length) === MODULES.length);

  /* Хвосты прежней ванильной оболочки. Каждый из них правил разметку мимо
     React: toggleEye лез к соседнему input через parentNode, closeModal и
     два глобальных слушателя снимали класс active с окон, которые рисует
     React. Модули должны закрывать свои окна сами. */
  const ghosts = await p4.evaluate(() => ({
    toggleEye: typeof window.Shell.toggleEye,
    closeModal: typeof window.Shell.closeModal,
    relTime: typeof window.Shell._relTime,
    deviceName: typeof window.Shell._deviceName,
  }));
  check('ядро не отдаёт императивных остатков старой оболочки',
    Object.values(ghosts).every((t) => t === 'undefined'), JSON.stringify(ghosts));

  const stray = await p4.evaluate(() => {
    const box = document.createElement('div');
    box.className = 'modal-overlay active';
    box.id = 'ho-probe-modal';
    document.body.appendChild(box);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const still = box.classList.contains('active');
    box.remove();
    return still;
  });
  check('Escape не гасит чужие окна за спиной у модулей', stray === true);
  await p4.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
