import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/* Мессенджер на React. Настоящий бэкенд подменяем на стороне оболочки:
   перехватываем Shell.wsSend и отвечаем теми же сообщениями, что шлёт сервер.
   Так проверяется именно контракт модуля с протоколом, а не выдуманный API. */

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:8896/core/shell.html';

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

const MODULES = [{ id: 'messenger', name: 'Сообщения', icon: 'messenger', entry: 'messenger.html' }];

const server = spawn('node', ['static-server.mjs'], { cwd: HERE, stdio: 'ignore' });
await waitForServer('http://localhost:8896/core/shell.css');
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

await p.route('**/api/**', (route) => {
  const u = route.request().url();
  const j = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (u.includes('/api/auth/status')) return j({ username: 'k4nev', role: 'arcana' });
  if (u.includes('/api/profile')) return j({ username: 'k4nev', role: 'arcana', id: 'me', display_name: 'Костя', avatar: null });
  if (u.includes('/api/modules')) return j(MODULES);
  if (u.includes('/api/version')) return j({ version: '2.334', build: 'b1' });
  if (u.includes('/api/msg/attachments')) {
    const t = new URL(u).searchParams.get('type');
    const T0 = Math.floor(Date.now() / 1000);
    if (t === 'image') return j([
      { id: 'a1', type: 'image', name: 'один.jpg', size: 1000, time: T0, msg_id: 'm1' },
      { id: 'a2', type: 'image', name: 'два.jpg', size: 2000, time: T0 - 90000, msg_id: 'm2' },
    ]);
    if (t === 'video') return j([{ id: 'a3', type: 'video', name: 'клип.mp4', size: 9000, duration: 12, time: T0 - 60, msg_id: 'm3' }]);
    if (t === 'audio') return j([{ id: 'a4', type: 'audio', name: 'voice_1.webm', duration: 7, time: T0, msg_id: 'm4' }]);
    if (t === 'file') return j([{ id: 'a5', type: 'file', name: 'отчёт.pdf', size: 51200, time: T0, msg_id: 'm4' }]);
    return j([]);
  }
  if (u.includes('/api/msg/contacts')) return j({ contacts: [] });
  return j({ status: 'ok' });
});

await p.addInitScript(() => { localStorage.setItem('ho_token', 't'); localStorage.removeItem('ho_pin'); });
await p.goto(BASE);
await p.waitForSelector('#appShell.active');

/* Подменяем транспорт: всё, что модуль шлёт, копим; ответы отдаём вручную. */
await p.evaluate(() => {
  window.__sent = [];
  Shell.wsReady = true;
  Shell.wsSend = (m) => { window.__sent.push(m); };
  window.__recv = (d) => window.Messenger.onWS(d);
});

const CONTACTS = [
  { id: 'u1', username: 'mysika', display_name: 'Мысика', role: 'arcana', avatar: null, unread: 2, online: true, last_msg: { text: 'Привет', time: Math.floor(Date.now() / 1000) } },
  { id: 'u2', username: 'dev', display_name: 'Разработчик', role: 'common', avatar: null, unread: 0, online: false, last_msg: { text: 'Готово', time: Math.floor(Date.now() / 1000) - 3600 } },
];
const T = Math.floor(Date.now() / 1000);
const HISTORY = [
  { id: 'm1', from: 'u1', from_name: 'Мысика', text: 'Первое сообщение', time: T - 400, read: true },
  { id: 'm2', from: 'u1', from_name: 'Мысика', text: 'И сразу второе', time: T - 395, read: true },
  { id: 'm3', from: 'me', from_name: 'Костя', text: 'Отвечаю', time: T - 300, read: true },
  { id: 'm4', from: 'u1', from_name: 'Мысика', text: 'Про прокси на втором', time: T - 100, read: false },
];

await p.evaluate(() => Shell.switchModule('messenger'));
await p.waitForSelector('.msg-wrap', { timeout: 8000 });
await p.evaluate((cs) => window.__recv({ type: 'contacts', contacts: cs }), CONTACTS);
await p.waitForTimeout(500);

console.log('── Список контактов ──');
check('контакты отрисованы', await p.locator('.msg-contact').count() === 2);
check('непрочитанное показано', (await p.locator('.msg-contact-unread').first().textContent()) === '2');
check('онлайн отмечен', await p.locator('.msg-online-badge').count() === 1);
check('без чата — приглашение выбрать', (await p.locator('.msg-chat-empty').textContent()).includes('Выберите контакт'));
await p.locator('.msg-search').fill('разраб');
await p.waitForTimeout(250);
check('поиск по контактам сузил список', await p.locator('.msg-contact').count() === 1);
await p.locator('.msg-search').fill('');
await p.waitForTimeout(250);

console.log('\n── Открытие чата ──');
await p.locator('.msg-contact').first().click();
await p.waitForTimeout(400);
const sent1 = await p.evaluate(() => window.__sent);
check('запросили историю', sent1.some((m) => m.type === 'history' && m.to === 'u1'));
check('отметили прочитанным', sent1.some((m) => m.type === 'read'));
check('оболочке сообщили о погружении', await p.evaluate(() => Shell._uiState.immersive === true));
check('счётчик контакта обнулился', await p.locator('.msg-contact-unread').count() === 0);

await p.evaluate((h) => window.__recv({ type: 'history', offset: 0, messages: h }), HISTORY);
await p.waitForTimeout(400);
check('история отрисована', await p.locator('.msg-row').count() === 4);
check('свои и чужие различаются',
  (await p.locator('.msg-row.mine').count()) === 1 && (await p.locator('.msg-row.theirs').count()) === 3);
check('подряд идущие сгруппированы — аватар скрыт',
  await p.locator('.msg-row-ava.hidden').count() === 1);
check('время только в конце группы', await p.locator('.msg-group-time').count() === 3);
check('имя отправителя один раз на группу', await p.locator('.msg-bubble-sender').count() === 2);

console.log('\n── Отправка ──');
await p.locator('.msg-input').fill('Проверка связи');
await p.waitForTimeout(200);
check('кнопка стала «отправить»', (await p.locator('.msg-send-btn').getAttribute('class')).includes('has-content'));
await p.locator('.msg-send-btn').click();
await p.waitForTimeout(300);
check('сообщение показано сразу', await p.locator('.msg-row').count() === 5);
const sentMsg = await p.evaluate(() => window.__sent.filter((m) => m.type === 'send').pop());
check('ушло в сеть с временным id', !!sentMsg && sentMsg.text === 'Проверка связи' && String(sentMsg.temp_id).startsWith('temp_'), JSON.stringify(sentMsg));
check('поле очищено', (await p.locator('.msg-input').inputValue()) === '');

await p.evaluate((tid) => window.__recv({
  type: 'sent', temp_id: tid, chat: 'me_u1',
  msg: { id: 'real1', from: 'me', from_name: 'Костя', text: 'Проверка связи', time: Math.floor(Date.now() / 1000), read: false },
}), sentMsg.temp_id);
await p.waitForTimeout(300);
check('временное заменилось настоящим, не задвоилось', await p.locator('.msg-row').count() === 5);
check('в разметке настоящий id', await p.locator('.msg-row[data-msgid="real1"]').count() === 1);

console.log('\n── Входящие события меняют ленту ──');
await p.evaluate(() => window.__recv({
  type: 'message', chat: 'me_u1',
  msg: { id: 'in1', from: 'u1', from_name: 'Мысика', text: 'Входящее', time: Math.floor(Date.now() / 1000), read: false },
}));
await p.waitForTimeout(300);
check('входящее добавилось', await p.locator('.msg-row').count() === 6);

await p.evaluate(() => window.__recv({ type: 'edited', chat: 'me_u1', msg_id: 'in1', text: 'Входящее, поправлено' }));
await p.waitForTimeout(250);
check('правка применилась', (await p.locator('.msg-row[data-msgid="in1"] .msg-text').textContent()) === 'Входящее, поправлено');
check('пометка «ред.» появилась', await p.locator('.msg-row[data-msgid="in1"] .msg-edited').count() === 1);

await p.evaluate(() => window.__recv({ type: 'reaction', chat: 'me_u1', msg_id: 'in1', reactions: { me: '🔥' } }));
await p.waitForTimeout(250);
check('реакция показана', (await p.locator('.msg-row[data-msgid="in1"] .msg-reaction-emoji').textContent()) === '🔥');

await p.evaluate(() => window.__recv({ type: 'read', chat: 'me_u1' }));
await p.waitForTimeout(250);
check('свои сообщения отмечены прочитанными',
  (await p.locator('.msg-row.mine .msg-check').first().textContent()).trim() === '✓✓');

await p.evaluate(() => window.__recv({ type: 'typing', chat: 'me_u1' }));
await p.waitForTimeout(200);
check('печатает — точки', await p.locator('.msg-typing-dots').count() === 1);

await p.evaluate(() => window.__recv({ type: 'deleted', chat: 'me_u1', msg_id: 'in1' }));
await p.waitForTimeout(250);
check('удалённое исчезло', await p.locator('.msg-row[data-msgid="in1"]').count() === 0);

console.log('\n── Меню сообщения ──');
await p.locator('.msg-row[data-msgid="m1"]').click({ button: 'right' });
await p.waitForTimeout(300);
check('меню открылось', await p.locator('.msg-ctx-menu').count() === 1);
check('быстрые реакции на месте', await p.locator('.msg-ctx-react-btn').count() === 5);
check('чужое сообщение нельзя править',
  (await p.locator('.msg-ctx-action').allTextContents()).every((t) => !t.includes('Изменить')));
await p.locator('.msg-ctx-action', { hasText: 'Ответить' }).click();
await p.waitForTimeout(300);
check('полоска ответа появилась', (await p.locator('.msg-action-bar.reply').textContent()).includes('Мысика'));
await p.locator('.msg-action-bar-close').click();
await p.waitForTimeout(200);
check('ответ отменён', await p.locator('.msg-action-bar').count() === 0);

await p.locator('.msg-row[data-msgid="real1"]').click({ button: 'right' });
await p.waitForTimeout(300);
check('своё свежее можно править',
  (await p.locator('.msg-ctx-action').allTextContents()).some((t) => t.includes('Изменить')));
await p.locator('.msg-ctx-action', { hasText: 'Изменить' }).click();
await p.waitForTimeout(300);
check('текст подставился в поле', (await p.locator('.msg-input').inputValue()) === 'Проверка связи');
check('полоска правки видна', await p.locator('.msg-edit-bar').count() === 1);
await p.locator('.msg-input').fill('Проверка связи, правка');
await p.locator('.msg-send-btn').click();
await p.waitForTimeout(300);
const editSent = await p.evaluate(() => window.__sent.filter((m) => m.type === 'edit').pop());
check('правка ушла в сеть', !!editSent && editSent.msg_id === 'real1' && editSent.text === 'Проверка связи, правка', JSON.stringify(editSent));

console.log('\n── Закрепление и поиск ──');
await p.evaluate(() => window.__recv({ type: 'pinned', msg_id: 'm1', text: 'Первое сообщение' }));
await p.waitForTimeout(250);
check('плашка закрепления показана', (await p.locator('.msg-pin-bar').textContent()).includes('Первое сообщение'));
await p.locator('.msg-pin-close').click();
await p.waitForTimeout(200);
check('открепление ушло в сеть', await p.evaluate(() => window.__sent.some((m) => m.type === 'unpin')));
await p.evaluate(() => window.__recv({ type: 'unpinned' }));
await p.waitForTimeout(200);
check('плашка убрана', await p.locator('.msg-pin-bar').count() === 0);

await p.locator('.msg-header-btn').click();
await p.waitForTimeout(250);
check('поиск по чату раскрылся', await p.locator('.msg-chat-search-wrap.open').count() === 1);
await p.locator('.msg-search-input').fill('прокси');
await p.waitForTimeout(350);
check('счётчик совпадений', (await p.locator('.msg-search-count').textContent()) === '1/1');
check('несовпавшие скрыты', await p.locator('.msg-row.search-hidden').count() > 0);
await p.locator('.msg-search-input').fill('заведомо-нет');
await p.waitForTimeout(300);
check('нет совпадений — ноль', (await p.locator('.msg-search-count').textContent()) === '0');
await p.locator('.msg-search-input').fill('');
await p.locator('.msg-header-btn').click();
await p.waitForTimeout(250);
check('поиск закрыт, строки вернулись', await p.locator('.msg-row.search-hidden').count() === 0);

console.log('\n── Меню контакта ──');
await p.locator('.msg-contact').nth(1).click({ button: 'right' });
await p.waitForTimeout(300);
check('меню контакта открылось', await p.locator('.msg-ctx-menu').count() === 1);
await p.locator('.msg-ctx-action', { hasText: 'Закрепить' }).click();
await p.waitForTimeout(250);
check('закрепление контакта ушло в сеть',
  await p.evaluate(() => window.__sent.some((m) => m.type === 'pin_contact' && m.contact_id === 'u2')));

await p.locator('.msg-contact').nth(1).click({ button: 'right' });
await p.waitForTimeout(300);
await p.locator('.msg-ctx-action', { hasText: 'Очистить чат' }).click();
await p.waitForTimeout(300);
check('очистка спрашивает подтверждение', (await p.locator('.msg-confirm-title').textContent()) === 'Очистить чат?');
await p.locator('.msg-confirm-btn.cancel').click();
await p.waitForTimeout(200);
check('отмена ничего не отправила', await p.evaluate(() => !window.__sent.some((m) => m.type === 'clear_chat')));

console.log('\n── Чужой текст выводится текстом ──');
const PAYLOAD = '<img src=x onerror="window.__pwned=1">';
await p.evaluate((s) => window.__recv({
  type: 'message', chat: 'me_u1',
  msg: { id: 'xss1', from: 'u1', from_name: s, text: s, time: Math.floor(Date.now() / 1000) },
}), PAYLOAD);
await p.waitForTimeout(400);
check('текст выведен буквально', (await p.locator('.msg-row[data-msgid="xss1"] .msg-text').textContent()) === PAYLOAD);
check('внедрённого тега нет', await p.evaluate(() => !document.querySelector('.msg-row[data-msgid="xss1"]').querySelector('img')));
check('ничего не выполнилось', await p.evaluate(() => window.__pwned === undefined));

console.log('\n── Панель профиля ──');
await p.locator('.msg-chat-peer').click();
await p.waitForTimeout(400);
check('панель открылась', await p.locator('.msg-profile.open').count() === 1);
check('имя и логин на месте',
  (await p.locator('.msg-profile-name').textContent()) === 'Мысика'
  && (await p.locator('.msg-profile-username').textContent()) === '@mysika');
check('вкладок вложений три', await p.locator('.msg-profile-tab').count() === 3);
check('медиа загрузились, а не «Пусто»', await p.locator('.msg-profile-attach-empty').count() === 0);
check('фото и видео вместе, с разбивкой по датам',
  (await p.locator('.msg-profile-attach-item').count()) === 3
  && (await p.locator('.msg-profile-date-header').count()) === 2);
await p.locator('.msg-profile-tab', { hasText: 'Аудио' }).click();
await p.waitForTimeout(400);
check('аудио загрузилось', await p.locator('.msg-profile-audio-item').count() === 1);
check('голосовое подписано как голосовое', (await p.locator('.msg-profile-audio-name').textContent()) === 'Голосовое');
await p.locator('.msg-profile-tab', { hasText: 'Файлы' }).click();
await p.waitForTimeout(400);
check('файлы загрузились', await p.locator('.msg-profile-attach-file').count() === 1);
check('у файла имя и размер',
  (await p.locator('.msg-profile-file-name').textContent()).includes('отчёт')
  && (await p.locator('.msg-profile-file-meta').textContent()).includes('50'));
await p.locator('.msg-profile-tab', { hasText: 'Медиа' }).click();
await p.waitForTimeout(400);

console.log('\n── Просмотрщик листает ──');
await p.locator('.msg-profile-attach-item').first().click();
await p.waitForTimeout(400);
check('просмотрщик открылся', await p.locator('.msg-gallery-overlay.active').count() === 1);
check('счётчик показывает место в пачке', (await p.locator('.msg-gallery-count').textContent()).replace(/\s/g, '') === '1/3');
check('стрелки обе на месте', await p.locator('.msg-gallery-nav').count() === 2);
await p.locator('.msg-gallery-nav.next').click();
await p.waitForTimeout(250);
check('вперёд листает', (await p.locator('.msg-gallery-count').textContent()).replace(/\s/g, '') === '2/3');
check('видео в пачке открывается видео, а не картинкой', await p.locator('.msg-gallery-overlay video').count() === 1);
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(250);
check('стрелка на клавиатуре тоже листает', (await p.locator('.msg-gallery-count').textContent()).replace(/\s/g, '') === '3/3');
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(250);
check('с конца уходит в начало', (await p.locator('.msg-gallery-count').textContent()).replace(/\s/g, '') === '1/3');
await p.locator('.msg-gallery-nav.prev').click();
await p.waitForTimeout(250);
check('назад с начала уходит в конец', (await p.locator('.msg-gallery-count').textContent()).replace(/\s/g, '') === '3/3');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
check('Esc закрыл просмотрщик', await p.locator('.msg-gallery-overlay.active').count() === 0);
await p.keyboard.press('Escape');
await p.waitForTimeout(400);
check('Esc закрыл панель', await p.locator('.msg-profile.open').count() === 0);

console.log('\n── Оболочка открывает чат по уведомлению ──');
await p.evaluate(() => window.Messenger.openChat('u2'));
await p.waitForTimeout(500);
check('чат открылся снаружи', (await p.locator('.msg-chat-name').textContent()).includes('Разработчик'));

console.log('\n── Пересылка снаружи ──');
await p.evaluate(() => window.Messenger.startForward({
  type: 'channel_forward', text: 'Переслано из #общий\\nМысика: смотри логи',
  fromName: 'Мысика', fromId: 'u1', preview: '#общий: смотри логи',
}));
await p.waitForTimeout(400);
check('чат закрылся под выбор получателя', await p.locator('.msg-chat-active').count() === 0);
check('плашка пересылки показана', (await p.locator('.msg-forward-banner-text').textContent()).includes('#общий'));
await p.locator('.msg-contact').nth(1).click();
await p.waitForTimeout(300);
await p.locator('.msg-send-btn').click();
await p.waitForTimeout(300);
const fwd = await p.evaluate(() => window.__sent.filter((m) => m.type === 'send').pop());
check('переслали текстом с подписью источника',
  !!fwd && fwd.to === 'u2' && fwd.text.includes('смотри логи') && fwd.forwarded_from && fwd.forwarded_from.name === 'Мысика',
  JSON.stringify(fwd));
check('плашка убралась после отправки', await p.locator('.msg-forward-banner').count() === 0);

console.log('\n── Мобильная адаптация ──');
await p.setViewportSize({ width: 390, height: 800 });
await p.waitForTimeout(400);
check('страница не едет вбок',
  await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  await p.evaluate(() => document.documentElement.scrollWidth + ' > ' + window.innerWidth));
check('в открытом чате список уступает место чату', !(await p.locator('.msg-contacts').isVisible()));
check('кнопка «назад» появилась', await p.locator('.msg-back-btn').isVisible());

await p.locator('.msg-back-btn').click();
await p.waitForTimeout(400);
check('чат закрыт', await p.locator('.msg-chat-active').count() === 0);
check('погружение снято', await p.evaluate(() => Shell._uiState.immersive === false));
check('оболочка забыла активный чат', await p.evaluate(() => Shell.activeChat === null));
check('список контактов снова виден', await p.locator('.msg-contact').first().isVisible());
check('список тянется до самого низа',
  await p.evaluate(() => {
    const r = document.querySelector('.msg-contacts').getBoundingClientRect();
    return r.bottom >= window.innerHeight - 1;
  }));

/* Лента отступает под реальную высоту поля ввода: полоска ответа и превью
   вложений раздвигают его, и на телефоне последнее сообщение уезжало под низ. */
const gap = () => p.evaluate(() => {
  const rows = document.querySelectorAll('.msg-row');
  const last = rows[rows.length - 1];
  if (!last) return null;
  return Math.round(document.querySelector('.msg-input-area').getBoundingClientRect().top
    - last.getBoundingClientRect().bottom);
});

console.log('\n── Последнее сообщение не уходит под ввод ──');
await p.locator('.msg-contact').first().click();
await p.waitForTimeout(300);
/* Ленту надо переполнить: на пустом экране сообщения и так висят сверху,
   и баг с накрытием не воспроизводится. */
const LONG = Array.from({ length: 40 }, (_, k) => ({
  id: 'L' + k, from: k % 3 === 0 ? 'me' : 'u1', from_name: k % 3 === 0 ? 'Костя' : 'Мысика',
  text: 'Строка истории номер ' + k, time: T - 4000 + k * 60, read: true,
}));
await p.evaluate((h) => window.__recv({ type: 'history', offset: 0, messages: h }), LONG);
await p.waitForTimeout(600);
check('лента переполнена — есть что скрывать под вводом',
  await p.evaluate(() => { const el = document.querySelector('.msg-messages'); return el.scrollHeight > el.clientHeight + 100; }));
const g1 = await gap();
check('последнее сообщение выше поля ввода', g1 !== null && g1 >= 0, 'зазор ' + g1);
check('лента доехала до низа',
  await p.evaluate(() => { const el = document.querySelector('.msg-messages'); return el.scrollHeight - el.scrollTop - el.clientHeight < 4; }));

await p.evaluate(() => window.__recv({
  type: 'message', chat: 'me_u1',
  msg: { id: 'tail1', from: 'u1', from_name: 'Мысика', text: 'Свежее сообщение', time: Math.floor(Date.now() / 1000) },
}));
await p.waitForTimeout(500);
const g2 = await gap();
check('пришедшее сообщение тоже видно целиком', g2 !== null && g2 >= 0, 'зазор ' + g2);

await p.locator('.msg-row[data-msgid="tail1"]').click({ button: 'right' });
await p.waitForTimeout(300);
await p.locator('.msg-ctx-action', { hasText: 'Ответить' }).click();
await p.waitForTimeout(500);
check('полоска ответа раздвинула поле, но не накрыла сообщение',
  (await p.locator('.msg-action-bar.reply').count()) === 1 && (await gap()) >= 0, 'зазор ' + (await gap()));
/* Самый злой случай: полоска ответа плюс многострочный текст — поле ввода
   вырастает в разы, и фиксированный отступ ленту уже не спасает. */
await p.locator('.msg-input').fill(Array.from({ length: 8 }, (_, k) => 'строка ответа номер ' + k).join('\n'));
await p.waitForTimeout(600);
const tall = await p.evaluate(() => document.querySelector('.msg-input-area').offsetHeight);
check('поле ввода действительно выросло', tall > 110, 'высота ' + tall);
check('лента всё равно кончается выше поля', (await gap()) >= 0, 'зазор ' + (await gap()));
await p.locator('.msg-input').fill('');
await p.waitForTimeout(400);

check('отступ ленты считается от занимаемого поля, вместе с его отступом',
  await p.evaluate(() => {
    const chat = document.querySelector('.msg-chat');
    const inp = document.querySelector('.msg-input-area');
    const h = parseInt(getComputedStyle(chat).getPropertyValue('--msg-composer-h'), 10);
    const taken = chat.getBoundingClientRect().bottom - inp.getBoundingClientRect().top;
    return h > 0 && Math.abs(h - taken) <= 1;
  }));

/* Вырез и home indicator Chromium не эмулирует, поэтому проверяем инвариант,
   который баг ломал: внутренние отступы «таблетки» симметричны, а полосу
   безопасной зоны она обходит внешним отступом. */
check('поле ввода не раздуто снизу — отступы внутри симметричны',
  await p.evaluate(() => {
    const st = getComputedStyle(document.querySelector('.msg-input-area'));
    return parseFloat(st.paddingBottom) === parseFloat(st.paddingTop);
  }),
  await p.evaluate(() => {
    const st = getComputedStyle(document.querySelector('.msg-input-area'));
    return st.paddingTop + ' / ' + st.paddingBottom;
  }));
check('безопасную зону поле обходит внешним отступом, а не внутренним',
  await p.evaluate(() => {
    const rules = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch (e) { return []; } });
    const flat = (r) => (r.cssRules ? [...r.cssRules].flatMap(flat) : [r]);
    return !rules.flatMap(flat).some((r) => r.selectorText === '.msg-input-area'
      && /safe-area-inset-bottom/.test(r.style.paddingBottom || ''));
  }));

/* Подставляем вырез руками: поле поднимается выше, лента обязана добрать
   отступ — иначе последнее сообщение снова уедет под него. */
const beforeH = await p.evaluate(() => parseInt(getComputedStyle(document.querySelector('.msg-chat')).getPropertyValue('--msg-composer-h'), 10));
await p.addStyleTag({ content: '.msg-input-area{margin-bottom:54px !important}' });
await p.setViewportSize({ width: 390, height: 801 }); // как поворот: вставки пересчитываются
await p.waitForTimeout(500);
const afterH = await p.evaluate(() => parseInt(getComputedStyle(document.querySelector('.msg-chat')).getPropertyValue('--msg-composer-h'), 10));
check('поднятое поле лента учитывает целиком', afterH - beforeH === 34, beforeH + ' -> ' + afterH);
check('последнее сообщение и с вырезом остаётся над полем', (await gap()) >= 0, 'зазор ' + (await gap()));
await p.locator('.msg-action-bar-close').click();
await p.waitForTimeout(300);
await p.locator('.msg-back-btn').click();
await p.waitForTimeout(400);

await p.screenshot({ path: 'shot-mobile.png' });
await p.setViewportSize({ width: 1440, height: 900 });
await p.locator('.msg-contact').first().click();
await p.waitForTimeout(300);
await p.evaluate((h) => window.__recv({ type: 'history', offset: 0, messages: h }), HISTORY);
await p.waitForTimeout(400);
check('после возврата история снова на месте', await p.locator('.msg-row').count() === 4);
await p.screenshot({ path: 'shot-desktop.png' });
await p.locator('.msg-chat-peer').click();
await p.waitForTimeout(500);
await p.screenshot({ path: 'shot-profile.png' });

await browser.close();
server.kill();
console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
