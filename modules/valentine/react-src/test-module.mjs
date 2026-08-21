import { chromium } from 'playwright';

const URL = 'http://localhost:8899/modules/valentine/react-src/harness.html';
const browser = await chromium.launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ok  ' : ' FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (!ok) failed++;
};

async function open(width, height, reducedMotion = 'no-preference') {
  const p = await browser.newPage({ viewport: { width, height }, reducedMotion, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => { console.log(' FAIL  [pageerror] ' + e.message); failed++; });
  p.on('console', (m) => { if (m.type() === 'error') { console.log(' FAIL  [console] ' + m.text()); failed++; } });
  await p.goto(URL);
  await p.waitForFunction(() => window.__ready === true);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(700);
  return p;
}

console.log('\n── ПК, обычный режим ──');
const p = await open(1280, 860);

check('модуль смонтировался', await p.locator('#vl-root').count() === 1);

/* Ловушка, на которой модуль уже падал в проде: у оболочки нет цепочки
   определённых высот, поэтому height:100% схлопывается в ноль и модуль
   становится невидимым, хотя в DOM он есть. */
const rootBox = await p.locator('#vl-root').boundingBox();
check('у модуля есть реальная высота', rootBox && rootBox.height > 400,
  rootBox ? Math.round(rootBox.width) + 'x' + Math.round(rootBox.height) : 'нет коробки');
check('шапка видна на экране', (await p.locator('.vl-head h1').boundingBox()).height > 10);
check('контракт window.Valentine.onWS', await p.evaluate(() => typeof window.Valentine?.onWS === 'function'));
check('модуль светлый, а не тёмный от оболочки',
  (await p.evaluate(() => getComputedStyle(document.querySelector('#vl-root')).backgroundColor)).includes('253, 247, 241'));

const pb = await p.locator('.vl-person').first().boundingBox();
const pb2 = await p.locator('.vl-person').nth(1).boundingBox();
check('контакты карточками в ряд', pb.y === pb2.y && pb.width < 640, Math.round(pb.width) + 'x' + Math.round(pb.height));
await p.screenshot({ path: 'mod-1-people.png' });

// Архив
await p.click('.vl-tab:has-text("Признания")');
await p.waitForTimeout(800);
const mb = await p.locator('.vl-mini').first().boundingBox();
check('карточки архива 10:16', Math.abs(mb.width / mb.height - 0.625) < 0.01, (mb.width / mb.height).toFixed(3));
check('непрочитанные помечены', await p.locator('.vl-ribbon').count() === 2);
await p.screenshot({ path: 'mod-2-album.png' });

// Раскрытие с полётом
const flight = await p.evaluate(async () => {
  const out = [];
  const t0 = performance.now();
  document.querySelector('.vl-mini .vl-face').click();
  await new Promise((res) => {
    const tick = () => {
      const s = document.querySelector('.vl-slide');
      if (s) out.push(getComputedStyle(s).transform);
      if (performance.now() - t0 < 1400) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  return new Set(out).size;
});
check('карточка летит, а не прыгает', flight > 10, flight + ' кадров');
await p.waitForTimeout(500);
check('обвязка проявилась', await p.locator('.vl-chrome.vl-on').count() > 0);
check('соседи развернулись', await p.locator('.vl-deck.vl-folded').count() === 0);
await p.screenshot({ path: 'mod-3-viewer.png' });

// Ползунок точек
const pill1 = await p.evaluate(() => document.querySelector('.vl-dpill').style.transform);
await p.locator('.vl-dot').nth(3).click();
await p.waitForTimeout(800);
const pill2 = await p.evaluate(() => document.querySelector('.vl-dpill').style.transform);
check('ползунок точек переехал', pill1 !== pill2, pill1 + ' -> ' + pill2);

// Удаление из просмотра + отмена
await p.click('.vl-btn.vl-trash');
await p.waitForTimeout(600);
check('после удаления вернулись в архив', await p.locator('.vl-album').count() === 1);
check('тост с отменой показан', await p.locator('.vl-toast.vl-show').count() === 1);
const before = await p.locator('.vl-mini').count();
await p.click('.vl-toast button');
await p.waitForTimeout(400);
check('«Вернуть» восстановило карточку', await p.locator('.vl-mini').count() === before + 1);
check('на сервер запрос не ушёл', await p.evaluate(() => window.__deleted === undefined));

// Конструктор и отправка
await p.click('.vl-tab:has-text("Создать")');
await p.waitForTimeout(700);
await p.locator('.vl-person').first().click();
await p.waitForTimeout(700);
check('конструктор открылся', await p.locator('.vl-compose').count() === 1);
check('имя склонилось', (await p.locator('.vl-head h1').innerText()).includes('для Ани'),
  await p.locator('.vl-head h1').innerText());
await p.screenshot({ path: 'mod-4-compose.png' });

for (let i = 0; i < 5; i++) {
  await p.locator('.vl-tile').nth(i).click();
  await p.fill('.vl-write', 'страница номер ' + (i + 1));
  await p.waitForTimeout(120);
  await p.click('.vl-btn.vl-main');
  await p.waitForTimeout(220);
}
await p.waitForTimeout(700);
const sent = await p.evaluate(() => window.__sent);
check('отправлено 5 страниц', sent && sent.pages && sent.pages.length === 5);
check('у всех страниц есть картинка и текст',
  sent && sent.pages.every((x) => x.sticker && x.text.trim()));
check('вернулись в список после отправки', await p.locator('.vl-people').count() === 1);
await p.screenshot({ path: 'mod-5-sent.png' });

console.log('\n── Телефон ──');
const m = await open(400, 850);
const mp = await m.locator('.vl-person').first().boundingBox();
const mp2 = await m.locator('.vl-person').nth(1).boundingBox();
check('контакты строками', mp.y !== mp2.y, Math.round(mp.width) + 'x' + Math.round(mp.height));
await m.click('.vl-tab:has-text("Признания")');
await m.waitForTimeout(700);
await m.locator('.vl-mini .vl-face').first().click();
await m.waitForTimeout(1300);
await m.screenshot({ path: 'mod-6-mobile-viewer.png' });
check('нет горизонтального скролла (телефон)',
  !(await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)));

console.log('\n── Обычный пользователь: подсказки быть не должно ──');
check('у пользователя с анимациями подсказки нет',
  await p.locator('.vl-toast:has-text("отключены анимации")').count() === 0);

console.log('\n── Режим «уменьшить движение» ──');
const r = await open(1280, 860, 'reduce');
check('плашка про анимации показана', await r.locator('.vl-toast:has-text("отключены анимации")').count() === 1);
const redDur = await r.evaluate(() => getComputedStyle(document.querySelector('.vl-person .vl-face')).transitionDuration);
check('деградация мягкая, не в ноль', redDur.split(',').every((d) => d.trim() === '0.14s'), redDur);
// Закрытие подсказки крестиком должно запоминаться и не мешать дальше
const r2 = await open(1280, 860, 'reduce');
await r2.click('.vl-toast button.vl-quiet');
await r2.waitForTimeout(300);
check('подсказку можно закрыть навсегда', await r2.locator('.vl-toast').count() === 0);
await r2.reload();
await r2.waitForFunction(() => window.__ready === true);
await r2.waitForTimeout(600);
check('после перезагрузки закрытая подсказка не возвращается',
  await r2.locator('.vl-toast:has-text("отключены анимации")').count() === 0);

await r.click('.vl-toast button:not(.vl-quiet)');
await r.waitForTimeout(400);
const afterDur = await r.evaluate(() => getComputedStyle(document.querySelector('.vl-person .vl-face')).transitionDuration);
const stillReduced = await r.evaluate(() => document.querySelector('#vl-root').classList.contains('vl-reduce'));
// transition-duration возвращает по значению на каждое анимируемое свойство
check('после включения движение полноценное',
  afterDur.split(',').every((d) => d.trim() === '0.575s') && !stillReduced,
  'длительность ' + afterDur + ', класс vl-reduce остался: ' + stillReduced);
await r.screenshot({ path: 'mod-7-reduced.png' });

console.log(failed ? `\n✗ провалено проверок: ${failed}\n` : '\n✓ все проверки пройдены\n');
await browser.close();
process.exit(failed ? 1 : 0);
