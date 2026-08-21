import { chromium } from 'playwright';

const URL = 'http://localhost:8899/modules/valentine/react-src/concept-app.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console error]', m.text()); });

const box = (sel) => page.locator(sel).first().boundingBox();

await page.goto(URL);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(900);
await page.screenshot({ path: 'app-1-people.png' });

// Контакты должны быть карточками в сетке, а не строками во всю ширину
const p0 = await box('.person'), p1 = await page.locator('.person').nth(1).boundingBox();
console.log('1 контакты:', Math.round(p0.width) + 'x' + Math.round(p0.height),
  '| в одном ряду:', p0.y === p1.y ? 'да' : 'нет',
  '| ширина < половины экрана:', p0.width < 640);

// Транзишены реально заданы (не мгновенные)
const durs = await page.evaluate(() => {
  const g = (sel, prop) => { const el = document.querySelector(sel); const cs = getComputedStyle(el, prop || null); return cs.transitionDuration; };
  return { person: g('.person .face'), personStack: g('.person', '::before'), tabpill: g('.tabpill'), pane: g('.pane') };
});
console.log('2 длительности:', JSON.stringify(durs));

// Ховер по контакту — стопка проявляется
await page.locator('.person').first().hover();
await page.waitForTimeout(750);
await page.screenshot({ path: 'app-2-person-hover.png' });
const stackOpacity = await page.evaluate(() => getComputedStyle(document.querySelector('.person'), '::before').opacity);
console.log('3 ховер контакта — стопка opacity:', stackOpacity);

// Переключение вкладки: индикатор едет, панели перетекают
const pillBefore = await page.evaluate(() => document.getElementById('tabpill').style.transform);
// Профиль кривой: на 20% времени прогресс должен быть заметно меньше 50%,
// иначе движение читается как рывок с незаметным хвостом.
const curve = await page.evaluate(async () => {
  const pts = [];
  const t0 = performance.now();
  document.getElementById('tabB').click();
  await new Promise((res) => {
    const tick = () => {
      const o = parseFloat(getComputedStyle(document.getElementById('paneB')).opacity);
      pts.push({ t: Math.round(performance.now() - t0), o });
      if (performance.now() - t0 < 800) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  return pts;
});
const at = (ms) => { const p = curve.reduce((a, b) => (Math.abs(b.t - ms) < Math.abs(a.t - ms) ? b : a)); return p.o; };
console.log('4 профиль перехода вкладки (прогресс проявления paneB):',
  '\n   156мс(20%):', at(156).toFixed(2), '| 390мс(50%):', at(390).toFixed(2), '| 624мс(80%):', at(624).toFixed(2),
  '\n   мягкий старт (на 20% меньше 0.45):', at(156) < 0.45 ? 'да' : 'НЕТ — рывок');
await page.screenshot({ path: 'app-3-tab-mid.png' });
await page.waitForTimeout(900);
const pillAfter = await page.evaluate(() => document.getElementById('tabpill').style.transform);
console.log('5 индикатор вкладок сдвинулся:', pillBefore !== pillAfter, pillBefore, '->', pillAfter);
await page.screenshot({ path: 'app-4-album.png' });

const m = await box('.mini');
console.log('6 карточка архива:', Math.round(m.width) + 'x' + Math.round(m.height), 'соотношение', (m.width / m.height).toFixed(3), '(ждём 0.625)');

// Раскрытие признания — FLIP. Замеряем реальное движение по кадрам,
// а не по таймингу (клик Playwright сам съедает непредсказуемое время).
const flight = await page.evaluate(async () => {
  const samples = [];
  const t0 = performance.now();
  document.querySelector('.mini .face').click();
  await new Promise((res) => {
    const tick = () => {
      const s = document.querySelector('.slide[data-off="0"]');
      const deck = document.querySelector('.deck');
      if (s) samples.push({
        t: Math.round(performance.now() - t0),
        m: getComputedStyle(s).transform,
        folded: deck ? deck.classList.contains('folded') : null,
        chrome: !!document.querySelector('.chrome.on'),
      });
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  return samples;
});
const uniqM = new Set(flight.map((f) => f.m)).size;
const foldedEarly = flight.find((f) => f.t < 200);
const chromeLate = flight[flight.length - 1];
console.log('7 полёт карточки: различных значений transform за 1.5с =', uniqM,
  '(>10 = реально анимируется, а не прыгает)',
  '\n   на', foldedEarly.t + 'мс колода сложена =', foldedEarly.folded, ', обвязка скрыта =', !foldedEarly.chrome,
  '\n   в конце: обвязка видна =', chromeLate.chrome);
await page.screenshot({ path: 'app-5-open-start.png' });
await page.waitForTimeout(400);
await page.screenshot({ path: 'app-6-open-done.png' });
const late = await page.evaluate(() => ({
  folded: !!document.querySelector('.deck.folded'),
  chromeOn: !!document.querySelector('.chrome.on'),
  offs: [...document.querySelectorAll('#deck .slide')].map(e => e.dataset.off).join(','),
  pill: document.getElementById('dpill').style.transform,
}));
console.log('8 после раскрытия: колода развёрнута =', !late.folded, '| обвязка видна =', late.chromeOn,
  '| офсеты:', late.offs, '| ползунок:', late.pill);

// Ползунок точек перетекает
await page.click('.dot[data-d="3"]');
await page.waitForTimeout(900);
const pill2 = await page.evaluate(() => document.getElementById('dpill').style.transform);
console.log('9 ползунок переехал:', late.pill !== pill2, late.pill, '->', pill2);
await page.screenshot({ path: 'app-7-slid.png' });

// Мобильный: контакты снова строками
const mob = await browser.newPage({ viewport: { width: 400, height: 850 }, deviceScaleFactor: 2 });
await mob.goto(URL);
await mob.evaluate(() => document.fonts.ready);
await mob.waitForTimeout(900);
await mob.screenshot({ path: 'app-8-mobile-people.png' });
const mp = await mob.locator('.person').first().boundingBox();
const mp1 = await mob.locator('.person').nth(1).boundingBox();
console.log('10 мобильные контакты:', Math.round(mp.width) + 'x' + Math.round(mp.height),
  '| строками (разные ряды):', mp.y !== mp1.y);
await mob.click('#tabB'); await mob.waitForTimeout(900);
await mob.locator('.mini .face').first().click(); await mob.waitForTimeout(1400);
await mob.screenshot({ path: 'app-9-mobile-viewer.png' });

const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const mov = await mob.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
console.log('11 горизонтальный скролл: desktop', ov, '| mobile', mov, '(ждём false/false)');

await browser.close();
