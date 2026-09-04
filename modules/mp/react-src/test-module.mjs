import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/* Модуль MP на React. Бэкенда у него нет — всё на мок-данных, поэтому
   проверяем именно интерфейс: семь вкладок, выбор сервера, поиск, выбор
   строк, планирование регистрации, оплата и календарь. */

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:8897/core/shell.html';

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

const MODULES = [{ id: 'mp', name: 'MP продвижение', icon: 'mp', entry: 'mp.html', min_role: 'immortal' }];

const server = spawn('node', ['static-server.mjs'], { cwd: HERE, stdio: 'ignore' });
await waitForServer('http://localhost:8897/core/shell.css');
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });

p.on('pageerror', (e) => { console.log(' FAIL  [pageerror] ' + e.message); failed++; });
p.on('console', (m) => {
  const s = m.text();
  if (m.type() === 'error' && !/WebSocket|Failed to load resource|fetching the script|favicon|geobasket|wildberries/i.test(s)) {
    console.log(' FAIL  [console] ' + s);
    failed++;
  }
});

await p.route('**/api/**', (route) => {
  const u = route.request().url();
  const j = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (u.includes('/api/auth/status')) return j({ username: 'k4nev', role: 'arcana' });
  if (u.includes('/api/profile')) return j({ username: 'k4nev', role: 'arcana', id: 'u1', display_name: 'Костя' });
  if (u.includes('/api/modules')) return j(MODULES);
  if (u.includes('/api/version')) return j({ version: '2.333', build: 'b1' });
  return j({ status: 'ok' });
});
// Картинки товаров ходят на CDN площадки — в тесте отдаём заглушку
await p.route('**/*.webp', (route) => route.fulfill({ status: 404, body: '' }));

await p.addInitScript(() => { localStorage.setItem('ho_token', 't'); localStorage.removeItem('ho_pin'); });
await p.goto(BASE);
await p.waitForSelector('#appShell.active');
await p.evaluate(() => Shell.switchModule('mp'));
await p.waitForSelector('.mp-wrap', { timeout: 8000 });
await p.waitForTimeout(600);

console.log('── Каркас модуля ──');
check('модуль отрисовался', await p.locator('.mp-wrap').count() === 1);
check('семь вкладок', await p.locator('.mp-hd-tab').count() === 7);
check('без сервера — пустое состояние', (await p.locator('.mp-empty-title').textContent()) === 'Сервер не выбран');
check('точка входа для оболочки объявлена', await p.evaluate(() => typeof window.MP.onWS === 'function'));

console.log('\n── Серверы ──');
await p.locator('.mp-hd-srv').click();
await p.waitForTimeout(400);
check('сайдбар открылся', await p.locator('.mp-wrap.side-open').count() === 1);
check('пока серверов нет — так и написано',
  (await p.locator('.mp-side-list').textContent()).includes('Нет серверов'));
await p.locator('.mp-ico-btn[title="Тестовый сервер"]').click();
await p.waitForTimeout(500);
check('тестовый сервер добавлен и выбран', await p.locator('.mp-srv.active').count() === 1);
check('сайдбар закрылся сам', await p.locator('.mp-wrap.side-open').count() === 0);
check('в шапке имя сервера', (await p.locator('.mp-hd-name').textContent()) === 'Server-RU-01');
check('счётчик аккаунтов', (await p.locator('.mp-hd-count').textContent()).includes('30 аккаунтов'));
check('подвал сайдбара считает онлайн', (await p.locator('.mp-side-foot').textContent()).includes('1 / 1'));

console.log('\n── Аккаунты ──');
const rows0 = await p.locator('.mp-lgrow').count();
check('строки аккаунтов отрисованы', rows0 === 30, String(rows0));
await p.locator('.mp-ord-search input').fill('Казань');
await p.waitForTimeout(300);
const found = await p.locator('.mp-lgrow').count();
check('поиск сузил список', found > 0 && found < 30, String(found));
await p.locator('.mp-ord-search input').fill('заведомо-нет-такого');
await p.waitForTimeout(300);
check('пустой результат подписан', (await p.locator('.mp-empty-title').textContent()) === 'Ничего не найдено');
await p.locator('.mp-ord-search input').fill('');
await p.waitForTimeout(300);
await p.locator('.mp-lgrow .mp-check').first().click();
await p.waitForTimeout(250);
check('выбор строки показывает массовые действия',
  (await p.locator('.mp-ac-selbar').textContent()).includes('Выбрано: 1'));
await p.locator('.mp-ac-selbar button', { hasText: 'Снять' }).click();
await p.waitForTimeout(250);
check('«Снять» вернуло фильтры', await p.locator('.mp-ac-selbar').count() === 0);

console.log('\n── Регистратор ──');
await p.locator('.mp-hd-tab', { hasText: 'Регистратор' }).click();
await p.waitForTimeout(400);
check('пул из десяти', await p.locator('.mp-lgrow').count() === 10);
const poolBefore = await p.locator('.mp-lgrow').count();
await p.locator('.mp-b-primary', { hasText: 'Запланировать' }).click();
await p.waitForTimeout(400);
check('пул опустел после планирования', await p.locator('.mp-lgrow').count() === 0, String(poolBefore));
await p.locator('.mp-subtab', { hasText: 'Активные' }).click();
await p.waitForTimeout(400);
check('запланированные попали в активные', await p.locator('.mp-lgrow').count() === 14);
check('у активных проставлено время',
  /^\d\d:\d\d$/.test((await p.locator('.mp-lgrow .mp-ord-mono').first().textContent()).trim()));

console.log('\n── Прогрев ──');
await p.locator('.mp-hd-tab', { hasText: 'Прогрев' }).click();
await p.waitForTimeout(400);
const wu = await p.locator('.mp-wu-row').count();
check('строки прогрева', wu === 8, String(wu));
await p.locator('.mp-wu-row .mp-check').first().click();
await p.waitForTimeout(250);
await p.locator('.mp-wu-bulk').click();
await p.waitForTimeout(400);
check('снятие спрашивает подтверждение',
  (await p.locator('.mp-modal h3').textContent()) === 'Снять прогрев на сегодня?');
await p.locator('.mp-wu-danger').click();
await p.waitForTimeout(400);
check('после подтверждения строк на одну меньше', await p.locator('.mp-wu-row').count() === 7);

console.log('\n── Покупки ──');
await p.locator('.mp-hd-tab', { hasText: 'Покупки' }).click();
await p.waitForTimeout(600);
check('заказы сгруппированы', await p.locator('.mp-ord-gblock').count() >= 3);
check('строк заказов пять', await p.locator('.mp-ord-row').count() === 5);
const pills = await p.locator('.mp-stat-pill').count();
check('фильтр-пилюли на месте', pills === 5, String(pills));
await p.locator('.mp-stat-pill', { hasText: 'Выполнено' }).click();
await p.waitForTimeout(350);
check('фильтр убрал группу', await p.locator('.mp-ord-row').count() === 4);
await p.locator('.mp-stat-pill', { hasText: 'Выполнено' }).click();
await p.waitForTimeout(350);

// оплата: банк → Оплатить → QR
const row = p.locator('.mp-ord-row.k-in_progress').first();
check('кнопка оплаты заблокирована без банка', await row.locator('.mp-ord-pay').isDisabled());
await row.locator('.mp-ord-bank').click();
await p.waitForTimeout(250);
await row.locator('.mp-ord-bank-opt', { hasText: 'OZON' }).click();
await p.waitForTimeout(250);
check('банк выбран', (await row.locator('.mp-ord-bank').textContent()).includes('OZON'));
check('оплата разблокировалась', !(await row.locator('.mp-ord-pay').isDisabled()));
await row.locator('.mp-ord-pay').click();
await p.waitForTimeout(300);
check('перешли в «выхожу на оплату»', (await row.textContent()).includes('Выхожу на оплату'));
await p.waitForTimeout(1600);
check('появился QR и обратный отсчёт', await row.locator('.mp-ord-qr').count() === 1);
check('таймер красный', await row.locator('.mp-ord-timer.red').count() === 1);

// календарь
await p.locator('.mp-cal-anchor .mp-ico-btn').click();
await p.waitForTimeout(350);
check('календарь открылся', await p.locator('.mp-cal-pop.open').count() === 1);
check('дни с выкупами помечены', await p.locator('.mp-cal-day.has').count() > 0);
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
check('Escape закрыл календарь', await p.locator('.mp-cal-pop.open').count() === 0);

console.log('\n── Получение ──');
await p.locator('.mp-hd-tab', { hasText: 'Получение' }).click();
await p.waitForTimeout(500);
const pk = await p.locator('.mp-lgrow').count();
check('строки получения', pk > 0, String(pk));
check('код получения отформатирован',
  /^\d{3} \d{3}$/.test((await p.locator('.mp-pk-code').first().textContent()).trim()));
await p.locator('.mp-dd-btn').first().click();
await p.waitForTimeout(300);
check('список городов раскрылся', await p.locator('.mp-dd.open .mp-dd-opt').count() > 1);
await p.locator('.mp-dd-opt', { hasText: 'Казань' }).first().click();
await p.waitForTimeout(350);
const byCity = await p.locator('.mp-lgrow').count();
check('фильтр по городу сузил список', byCity > 0 && byCity < pk, String(byCity));
await p.locator('.mp-b-primary', { hasText: 'Получить' }).first().click();
await p.waitForTimeout(400);
check('открылся код получения', (await p.locator('.mp-modal h3').textContent()) === 'Код получения');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
await p.locator('.mp-subtab', { hasText: 'Доставка' }).click();
await p.waitForTimeout(400);
check('вкладка доставки отрисовалась', await p.locator('.mp-lgrow').count() > 0);

console.log('\n── Отзывы ──');
await p.locator('.mp-hd-tab', { hasText: 'Отзывы' }).click();
await p.waitForTimeout(500);
check('сетка товаров', await p.locator('.mp-rev-card').count() === 7);
await p.locator('.mp-subtab', { hasText: 'Список' }).click();
await p.waitForTimeout(350);
check('список товаров', await p.locator('.mp-lrow').count() === 7);
await p.locator('.mp-subtab', { hasText: 'План' }).click();
await p.waitForTimeout(350);
check('план отзывов', await p.locator('.mp-lrow').count() === 6);

console.log('\n── Статистика ──');
await p.locator('.mp-hd-tab', { hasText: 'Статистика' }).click();
await p.waitForTimeout(400);
check('четыре KPI', await p.locator('.mp-kpi').count() === 4);
check('график нарисован', await p.locator('.mp-card svg polyline').count() === 3);
check('полосы по артикулам', await p.locator('.mp-bar-row').count() >= 7);

console.log('\n── Состояние переживает переключение вкладок ──');
await p.locator('.mp-hd-tab', { hasText: 'Регистратор' }).click();
await p.waitForTimeout(400);
await p.locator('.mp-subtab', { hasText: 'Активные' }).click();
await p.waitForTimeout(400);
check('запланированное не потерялось', await p.locator('.mp-lgrow').count() === 14);
await p.locator('.mp-hd-tab', { hasText: 'Прогрев' }).click();
await p.waitForTimeout(400);
check('снятое с прогрева не вернулось', await p.locator('.mp-wu-row').count() === 7);

console.log('\n── Мобильная адаптация ──');
await p.setViewportSize({ width: 390, height: 800 });
await p.waitForTimeout(500);
const noOverflow = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check('страница не едет вбок', noOverflow,
  await p.evaluate(() => document.documentElement.scrollWidth + ' > ' + window.innerWidth));

await browser.close();
server.kill();
console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
