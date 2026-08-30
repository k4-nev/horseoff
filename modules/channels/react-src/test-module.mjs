import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/* Модуль «Каналы» на React.

   Бэкенд подменён на уровне HTTP, WS-события подаются так же, как их отдаёт
   оболочка: window.Channels.onWS(...). Проверяется дискордовская модель —
   группы с каналами, общий поток сообщений, роли, голосовые комнаты — и то,
   что детали сообщения общие с «Сообщениями». */

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:8894/core/shell.html';

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

const MODULES = [{ id: 'channels', name: 'Каналы', icon: 'channels', entry: 'channels.html' }];

const SPACES = [
  { id: 's1', name: 'Команда', type: 'text', photo: null },
  { id: 's2', name: 'Голосовая', type: 'voice_group', photo: null },
];
const CHANNELS = {
  s1: [
    { id: 'c1', name: 'общий', type: 'text', icon: 'channels', unread: 0 },
    { id: 'c2', name: 'релизы', type: 'text', icon: 'servers', unread: 3 },
  ],
  s2: [{ id: 'v1', name: 'Планёрка', type: 'voice', icon: 'mic' }],
};
const T = Math.floor(Date.now() / 1000);
const MESSAGES = [
  { id: 'm1', from: 'u2', from_name: 'Мысика', role: 'arcana', text: 'Прокси на втором лежит', time: T - 600, reactions: {} },
  { id: 'm2', from: 'u2', from_name: 'Мысика', role: 'arcana', text: 'перезапусти когда сможешь', time: T - 580, reactions: {} },
  {
    id: 'm3', from: 'me', from_name: 'Костя', role: 'arcana', text: 'уже поднял', time: T - 300,
    reactions: { '👍': ['u2'] },
    reply_to: 'm1', reply_name: 'Мысика', reply_text: 'Прокси на втором лежит',
  },
  {
    id: 'm4', from: 'u3', from_name: 'Дежурный', role: 'rare', text: 'вот логи', time: T - 100, reactions: {},
    attachments: [
      { id: 'a1', type: 'audio', name: 'voice_1755.webm', duration: 7, size: 24000 },
      { id: 'a2', type: 'file', name: 'логи.txt', size: 2048 },
      { id: 'a3', type: 'image', name: 'wide.jpg', size: 1000, w: 1920, h: 1080 },
      { id: 'a4', type: 'image', name: 'tall.jpg', size: 1000, w: 1080, h: 1920 },
    ],
  },
];
const MEMBERS = [
  { user_id: 'me', username: 'k4nev', display_name: 'Костя', role: 'arcana', online: true, status: 'online' },
  { user_id: 'u2', username: 'mysika', display_name: 'Мысика', role: 'arcana', online: true, status: 'online', space_role: 'moderator' },
  { user_id: 'u3', username: 'duty', display_name: 'Дежурный', role: 'rare', online: false },
];

const server = spawn('node', ['static-server.mjs'], { cwd: HERE, stdio: 'ignore' });
await waitForServer('http://localhost:8894/core/shell.css');
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
const p = await ctx.newPage();

p.on('pageerror', (e) => { console.log(' FAIL  [pageerror] ' + e.message); failed++; });
p.on('console', (m) => {
  const s = m.text();
  if (m.type() === 'error' && !/WebSocket|Failed to load resource|fetching the script|favicon/i.test(s)) {
    console.log(' FAIL  [console] ' + s);
    failed++;
  }
});

const posted = [];
const historyOffsets = [];
await p.route('**/api/**', (route) => {
  const req = route.request();
  const u = req.url();
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
  if (u.includes('/api/mod/channels/init')) return j({ spaces: SPACES, channels: CHANNELS, voice_rooms: { v1: { total: 1, speaker_count: 1, speakers: [{ user_id: 'u2', username: 'mysika' }] } } });
  if (u.includes('/api/mod/channels/messages')) {
    const off = Number(new URL(u).searchParams.get('offset') || 0);
    historyOffsets.push(off);
    // Догрузка отдаёт ещё страницу — на ней и было видно, как лента подпрыгивает
    if (off > 0) {
      return j({ messages: Array.from({ length: 20 }, (_, i) => ({
        id: 'old' + off + '_' + i, from: 'u2', from_name: 'Мысика', role: 'common',
        text: 'ранее ' + off + '-' + i, time: T - 5000 + i * 20,
      })) });
    }
    return j({ messages: MESSAGES, last_read: T - 400 });
  }
  if (u.includes('/api/mod/channels/members')) return j(MEMBERS);
  if (u.includes('/api/mod/channels/pins')) return j([{ id: 'm1', from_name: 'Мысика', text: 'Прокси на втором лежит' }]);
  if (u.includes('/api/mod/channels/users')) return j([{ id: 'u9', username: 'new', display_name: 'Новичок', role: 'common' }]);
  return j({ ok: true });
});

await p.addInitScript(() => {
  localStorage.setItem('ho_token', 't');
  localStorage.removeItem('ho_pin');
  localStorage.removeItem('ho_voice_devices');
  // Чем именно просят микрофон и камеру — иначе выбор устройства не проверить
  window.__gum = [];
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (c) => { window.__gum.push(JSON.parse(JSON.stringify(c))); return real(c); };
  // Полный экран в headless не дают без жеста — запоминаем сам факт запроса
  window.__fs = [];
  Element.prototype.requestFullscreen = function req() {
    window.__fs.push(this.className);
    return Promise.resolve();
  };
});
await p.goto(BASE);
await p.waitForSelector('#appShell.active');
await p.evaluate(() => {
  window.__sent = [];
  Shell.wsReady = true;
  Shell.wsSend = (m) => window.__sent.push(m);
  window.__recv = (d) => window.Channels.onWS(d);
});
await p.evaluate(() => Shell.switchModule('channels'));
await p.waitForSelector('.ch-wrap', { timeout: 8000 });
await p.waitForTimeout(600);

console.log('── Группы и каналы ──');
check('группы отрисованы', await p.locator('.ch-space-group').count() === 2);
check('внутри группы её каналы', await p.locator('.ch-space-group[data-sid="s1"] .ch-channel').count() === 2);
check('голосовая группа помечена', await p.locator('.ch-space-voice-badge').count() === 1);
check('голосовая комната — отдельная строка', await p.locator('.ch-voice-room').count() === 1);
check('в комнате видно, сколько человек', (await p.locator('.ch-vr-count').textContent()) === '1/6');
check('непрочитанное на канале', (await p.locator('.ch-channel[data-chid="c2"] .ch-unread-badge').textContent()) === '3');
await p.locator('.ch-space-header').first().click();
await p.waitForTimeout(300);
check('группа сворачивается', await p.locator('.ch-space-group[data-sid="s1"] .ch-channel').count() === 0);
await p.locator('.ch-space-header').first().click();
await p.waitForTimeout(300);

console.log('\n── Поток сообщений ──');
await p.locator('.ch-channel[data-chid="c1"]').click();
await p.waitForTimeout(600);
check('сообщения загрузились', await p.locator('.ch-msg').count() === 4);
check('подряд идущие от одного автора сгруппированы',
  await p.locator('.ch-msg.grouped').count() === 1,
  'сгруппировано ' + await p.locator('.ch-msg.grouped').count());
check('у сообщения видно автора и роль',
  (await p.locator('.ch-msg .ch-msg-author').first().textContent()) === 'Мысика'
  && (await p.locator('.ch-msg .role-badge').first().textContent()) === 'ARCANA');
check('своё сообщение помечено', await p.locator('.ch-msg-author.me').count() === 1);
check('цитата ответа показана', (await p.locator('.ch-msg-reply-text').textContent()) === 'Прокси на втором лежит');
/* Строка сообщения прозрачная, под ней живой фон: у цитаты должна быть своя
   плотная подложка, иначе её на фоне не видно. */
check('цитата не просвечивает фоном',
  await p.evaluate(() => {
    const st = getComputedStyle(document.querySelector('.ch-msg-reply'));
    const a = st.backgroundColor.match(/[\d.]+/g);
    const opaque = a.length < 4 || Number(a[3]) > 0.9;
    return opaque && parseFloat(st.borderLeftWidth) >= 2 && parseFloat(st.borderTopWidth) >= 1;
  }),
  await p.evaluate(() => {
    const st = getComputedStyle(document.querySelector('.ch-msg-reply'));
    return st.backgroundColor + ', рамка ' + st.borderTopWidth + '/' + st.borderLeftWidth;
  }));
check('разделитель непрочитанного на месте', await p.locator('.ch-new-sep').count() === 1);
check('канал отмечен прочитанным на сервере',
  await p.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('/channels/read'))));

console.log('\n── Вложения — общие с «Сообщениями» ──');
check('голосовое рисует общий плеер', await p.locator('.ho-audio--voice').count() === 1);
check('у голосового есть кольцо и волна',
  await p.locator('.ho-audio-ring').count() === 1 && await p.locator('.ho-audio-bar').count() > 20);
check('файл — общая карточка', (await p.locator('.ho-att-file-icon').textContent()) === 'TXT');
check('фото разложены общей сеткой', await p.locator('.ho-att-thumb').count() === 2);
check('пропорции сохранены, а не квадрат',
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('.ho-att-thumb')].map((e) => e.getBoundingClientRect());
    return t[0].width / t[0].height > 1.5 && t[1].width / t[1].height < 0.75;
  }));
await p.locator('.ho-att-thumb').first().click();
await p.waitForTimeout(400);
check('просмотрщик общий и листает', await p.locator('.ho-gallery').count() === 1
  && (await p.locator('.ho-gallery-count').textContent()).replace(/\s/g, '') === '1/2');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);

console.log('\n── Отправка и правка ──');
await p.locator('.ch-input').fill('привет каналу');
await p.waitForTimeout(200);
check('кнопка стала «отправить»', await p.locator('.ch-send-btn .ico-send').count() === 1);
await p.locator('.ch-send-btn').click();
await p.waitForTimeout(300);
const sent = await p.evaluate(() => window.__sent.filter((m) => m.type === 'ch_send').pop());
check('сообщение ушло с каналом и группой',
  !!sent && sent.text === 'привет каналу' && sent.channel_id === 'c1' && sent.space_id === 's1',
  JSON.stringify(sent));


await p.locator('.ch-msg[data-msgid="m3"]').hover();
await p.locator('.ch-msg[data-msgid="m3"] .ch-msg-qbtn[title="Ответить"]').click();
await p.waitForTimeout(300);
check('полоска ответа появилась', (await p.locator('.ch-reply-bar').textContent()).includes('Костя'));
await p.locator('.ch-reply-close').click();
await p.waitForTimeout(200);

await p.locator('.ch-msg[data-msgid="m3"]').hover();
await p.locator('.ch-msg[data-msgid="m3"] .ch-msg-qbtn[title="Изменить"]').click();
await p.waitForTimeout(300);
check('текст подставился в поле для правки', (await p.locator('.ch-input').inputValue()) === 'уже поднял');
await p.locator('.ch-input').fill('уже поднял, смотри логи');
await p.locator('.ch-send-btn').click();
await p.waitForTimeout(300);
const edited = await p.evaluate(() => window.__sent.filter((m) => m.type === 'ch_edit').pop());
check('правка ушла в сеть', !!edited && edited.msg_id === 'm3' && edited.text === 'уже поднял, смотри логи', JSON.stringify(edited));

console.log('\n── Реакции ──');
check('реакция с сервера показана', (await p.locator('.ch-msg[data-msgid="m3"] .ch-reaction').textContent()).includes('👍'));
await p.locator('.ch-msg[data-msgid="m1"]').hover();
await p.locator('.ch-msg[data-msgid="m1"] .ch-msg-qemoji').first().click();
await p.waitForTimeout(300);
const reacted = await p.evaluate(() => window.__sent.filter((m) => m.type === 'ch_react').pop());
check('быстрая реакция ушла в сеть', !!reacted && reacted.msg_id === 'm1' && reacted.emoji === '👍', JSON.stringify(reacted));
await p.evaluate(() => window.__recv({ type: 'ch_reacted', channel_id: 'c1', msg_id: 'm1', reactions: { '👍': ['me', 'u2'] } }));
await p.waitForTimeout(300);
check('счётчик реакции обновился с сервера',
  (await p.locator('.ch-msg[data-msgid="m1"] .ch-reaction').textContent()).trim() === '👍 2');
check('своя реакция отмечена', await p.locator('.ch-msg[data-msgid="m1"] .ch-reaction.mine').count() === 1);

console.log('\n── Живые события ──');
await p.evaluate((t) => window.__recv({
  type: 'ch_message', channel_id: 'c1', space_id: 's1',
  msg: { id: 'live1', from: 'u2', from_name: 'Мысика', role: 'arcana', text: 'свежее сообщение', time: t },
}), T);
await p.waitForTimeout(300);
check('входящее добавилось в поток', await p.locator('.ch-msg[data-msgid="live1"]').count() === 1);
await p.evaluate(() => window.__recv({ type: 'ch_edited', channel_id: 'c1', msg_id: 'live1', text: 'поправлено' }));
await p.waitForTimeout(250);
check('правка применилась', (await p.locator('.ch-msg[data-msgid="live1"] .ch-msg-text').textContent()).includes('поправлено'));
await p.evaluate(() => window.__recv({ type: 'ch_deleted', channel_id: 'c1', msg_id: 'live1' }));
await p.waitForTimeout(250);
check('удалённое исчезло', await p.locator('.ch-msg[data-msgid="live1"]').count() === 0);
await p.evaluate((t) => window.__recv({
  type: 'ch_message', channel_id: 'c2', space_id: 's1',
  msg: { id: 'other1', from: 'u2', from_name: 'Мысика', text: 'в другой канал', time: t },
}), T);
await p.waitForTimeout(300);
check('сообщение в другой канал поднимает его счётчик',
  (await p.locator('.ch-channel[data-chid="c2"] .ch-unread-badge').textContent()) === '4');
check('и не попадает в открытый поток', await p.locator('.ch-msg[data-msgid="other1"]').count() === 0);

await p.evaluate(() => window.__recv({ type: 'ch_typing', channel_id: 'c1', user_id: 'u2', username: 'Мысика' }));
await p.waitForTimeout(300);
check('печатает — видно в ленте', (await p.locator('.ch-typing').textContent()).includes('Мысика печатает'));

console.log('\n── Упоминания ──');
await p.locator('.ch-input').fill('');
await p.locator('.ch-input').type('@мы');
await p.waitForTimeout(350);
check('подсказка упоминаний появилась', await p.locator('.ch-mention-item').count() >= 1,
  'в поле ' + JSON.stringify(await p.locator('.ch-input').inputValue())
  + ', участников ' + await p.evaluate(() => document.querySelectorAll('.ch-member').length));
await p.locator('.ch-mention-item').first().click();
await p.waitForTimeout(300);
check('ник подставился в текст', (await p.locator('.ch-input').inputValue()).startsWith('@mysika '));
await p.locator('.ch-input').fill('');

console.log('\n── Закрепления ──');
check('плашка закрепления показана', (await p.locator('.ch-pin-bar').textContent()).includes('Прокси на втором'));
await p.locator('.ch-pin-bar').click();
await p.waitForTimeout(300);
check('панель закреплённых раскрылась', await p.locator('.ch-pin-item').count() === 1);
await p.locator('.ch-pin-unpin').click();
await p.waitForTimeout(300);
check('открепление ушло в сеть', await p.evaluate(() => window.__sent.some((m) => m.type === 'ch_unpin')));
await p.evaluate(() => window.__recv({ type: 'ch_pinned', channel_id: 'c1', pins: [] }));
await p.waitForTimeout(250);
check('плашка убралась', await p.locator('.ch-pin-bar').count() === 0);

console.log('\n── Поиск по каналу ──');
await p.locator('.ch-action-btn[title="Поиск"]').click();
await p.waitForTimeout(300);
check('поиск — общий компонент каркаса', await p.locator('.ch-search-field.ho-search').count() === 1);
await p.locator('.ch-search-field input').fill('логи');
await p.waitForTimeout(400);
check('счётчик совпадений', (await p.locator('.ch-search-count').textContent()) === '1/1',
  await p.locator('.ch-search-count').textContent());
check('найденное подсвечено в тексте', await p.locator('mark.ch-msg-search-match').count() >= 1);
check('остальные сообщения остались на месте', await p.locator('.ch-msg').count() >= 4);
await p.locator('.ch-search-field input').fill('заведомо-нет');
await p.waitForTimeout(300);
check('без совпадений — ноль', (await p.locator('.ch-search-count').textContent()) === '0');
await p.locator('.ch-action-btn[title="Поиск"]').click();
await p.waitForTimeout(250);

console.log('\n── Участники ──');
check('участники сгруппированы по присутствию',
  (await p.locator('.ch-member-group-title').allTextContents()).join('|').includes('Онлайн — 2'));
check('модератор отмечен', await p.locator('.ch-mod-badge').count() === 1);
check('оффлайн отдельной группой', await p.locator('.ch-member.offline').count() === 1);
/* Правой кнопкой по обычному участнику: над arcana модераторских действий
   быть не должно — это правило было и раньше. */
await p.locator('.ch-member').nth(1).click({ button: 'right' });
await p.waitForTimeout(300);
check('меню участника открылось', await p.locator('.ch-ctx').count() === 1);
check('можно написать в личку', (await p.locator('.ch-ctx-item').allTextContents()).some((t) => t.includes('Написать')));
check('над arcana модератором не назначают',
  !(await p.locator('.ch-ctx-item').allTextContents()).some((t) => t.includes('модератор')));
await p.keyboard.press('Escape');
await p.locator('.ch-ctx-item').first().click({ position: { x: -50, y: -50 } }).catch(() => {});
await p.mouse.click(700, 500);
await p.waitForTimeout(250);

await p.locator('.ch-member.offline').click({ button: 'right' });
await p.waitForTimeout(300);
await p.locator('.ch-ctx-item', { hasText: 'Назначить модератором' }).click();
await p.waitForTimeout(300);
check('назначение модератора ушло на сервер',
  posted.some((r) => r.url.includes('/channels/members') && r.body.set_moderator && r.body.set_moderator.value === true),
  JSON.stringify(posted.filter((r) => r.url.includes('/channels/members')).pop()));

console.log('\n── Лента не подпрыгивает ──');
/* Своё же сообщение доводит ленту до низа. Когда переписка чуть длиннее
   экрана, scrollTop после этого всего пара десятков пикселей — и лента
   считала, что доехала до начала истории: тянула предыдущую страницу и
   подскакивала вверх. Второе сообщение уводило scrollTop за порог, поэтому
   выглядело это как «первое подкидывает, второе опускает». */
// Добираем строки по одной ровно до той точки, где лента только-только
// переросла экран: запас прокрутки в пару десятков пикселей — это и есть
// ловушка.
await p.evaluate((t) => new Promise((done) => {
  const el = document.querySelector('.ch-messages');
  let i = 0;
  const step = () => {
    if (i >= 40 || el.scrollHeight - el.clientHeight > 0) return done(i);
    window.__recv({
      type: 'ch_message', channel_id: 'c1', space_id: 's1',
      msg: { id: 'fill' + i, from: 'u2', from_name: 'Мысика', role: 'common', text: 'строка ' + i, time: t - 300 + i },
    });
    i += 1;
    return setTimeout(step, 60);
  };
  step();
}), T);
await p.waitForTimeout(400);
historyOffsets.length = 0;
const slack = await p.evaluate(() => {
  const el = document.querySelector('.ch-messages');
  el.scrollTop = 0;
  return Math.round(el.scrollHeight - el.clientHeight);
});
await p.waitForTimeout(500);
check('лента едва переросла экран — запас ' + slack + ' px', slack > 0 && slack < 240);
check('у самого верха короткой ленты история не запрашивается',
  historyOffsets.length === 0, 'запросы истории: ' + historyOffsets.join(', '));

await p.evaluate(() => { const el = document.querySelector('.ch-messages'); el.scrollTop = el.scrollHeight; });
await p.waitForTimeout(400);
historyOffsets.length = 0;
const jumpBefore = await p.evaluate(() => {
  const el = document.querySelector('.ch-messages');
  return { rows: document.querySelectorAll('.ch-msg').length, top: Math.round(el.scrollTop), h: Math.round(el.scrollHeight) };
});
await p.evaluate((t) => window.__recv({
  type: 'ch_message', channel_id: 'c1', space_id: 's1',
  msg: { id: 'own1', from: 'me', from_name: 'Костя', role: 'arcana', text: 'своё письмо', time: t },
}), T);
await p.waitForTimeout(600);
const jumpAfter = await p.evaluate(() => {
  const el = document.querySelector('.ch-messages');
  return {
    rows: document.querySelectorAll('.ch-msg').length,
    top: Math.round(el.scrollTop), h: Math.round(el.scrollHeight),
    bottom: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight),
  };
});
check('короткая лента не тянет старую историю',
  historyOffsets.length === 0, 'запросы истории: ' + historyOffsets.join(', '));
check('после своего сообщения прибавилась одна строка, а не страница',
  jumpAfter.rows === jumpBefore.rows + 1,
  jumpBefore.rows + ' → ' + jumpAfter.rows);
check('лента осталась внизу', jumpAfter.bottom < 4, JSON.stringify(jumpAfter));

/* И обратная сторона: на длинной переписке догрузка обязана работать. */
await p.evaluate((t) => {
  for (let i = 0; i < 40; i++) {
    window.__recv({
      type: 'ch_message', channel_id: 'c1', space_id: 's1',
      msg: { id: 'more' + i, from: 'u2', from_name: 'Мысика', role: 'common', text: 'ещё ' + i, time: t + 10 + i },
    });
  }
}, T);
await p.waitForTimeout(600);
historyOffsets.length = 0;
await p.evaluate(() => { const el = document.querySelector('.ch-messages'); el.scrollTop = 0; });
await p.waitForTimeout(700);
check('на длинной ленте верх по-прежнему догружает старое',
  historyOffsets.some((o) => o > 0), 'запросы истории: ' + historyOffsets.join(', '));

/* Поле ввода растёт под длинный текст, лента на столько же ужимается — и
   последние сообщения уезжали под ввод: набрал — «поднялось», отправил —
   «опустилось». Лента должна оставаться прижатой к низу. */
await p.evaluate(() => { const el = document.querySelector('.ch-messages'); el.scrollTop = el.scrollHeight; });
await p.waitForTimeout(300);
const grow = async () => p.evaluate(() => {
  const list = document.querySelector('.ch-messages');
  const input = document.querySelector('.ch-input-area');
  const all = document.querySelectorAll('.ch-msg');
  const last = all[all.length - 1];
  return {
    inputH: Math.round(input.getBoundingClientRect().height),
    below: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
    gap: Math.round(input.getBoundingClientRect().top - last.getBoundingClientRect().bottom),
  };
});
const calm = await grow();
await p.locator('.ch-input').fill('очень длинное сообщение, которое обязательно займёт несколько строк и заставит поле ввода вырасти вверх, отобрав высоту у ленты сообщений');
await p.waitForTimeout(400);
const typed = await grow();
check('поле ввода правда выросло', typed.inputH > calm.inputH + 8, calm.inputH + ' → ' + typed.inputH);
check('переписка не ушла под выросшее поле ввода',
  typed.below < 4 && typed.gap >= 0, JSON.stringify(typed));
await p.locator('.ch-input').fill('');
await p.waitForTimeout(400);
const back = await grow();
check('поле схлопнулось, лента по-прежнему внизу', back.below < 4 && back.gap >= 0, JSON.stringify(back));

console.log('\n── Настройки устройств ──');
/* Выбор в настройках раньше никуда не уходил: select ни к чему не привязан,
   при следующем открытии — снова первый пункт, и живая дорожка оставалась
   от системного устройства. */
await p.locator('.ch-voice-room').click();
await p.waitForTimeout(500);
await p.locator('.srv-settings-btn').click();
await p.waitForTimeout(700);
check('окно настроек голоса открылось', await p.locator('select[data-kind="mic"]').count() === 1);
const micOpts = await p.evaluate(() => [...document.querySelectorAll('select[data-kind="mic"] option')].map((o) => o.value));
check('микрофоны перечислены', micOpts.length >= 2, micOpts.length + ' пунктов');
const chosenMic = micOpts.find((v) => v);
await p.selectOption('select[data-kind="mic"]', chosenMic);
await p.waitForTimeout(400);
check('выбор микрофона сохранён',
  await p.evaluate(() => (JSON.parse(localStorage.getItem('ho_voice_devices') || '{}').mic || '') !== ''),
  await p.evaluate(() => localStorage.getItem('ho_voice_devices')));
const camOpts = await p.evaluate(() => [...document.querySelectorAll('select[data-kind="cam"] option')].map((o) => o.value));
const chosenCam = camOpts.find((v) => v);
if (chosenCam) {
  await p.selectOption('select[data-kind="cam"]', chosenCam);
  await p.waitForTimeout(300);
}
await p.locator('.modal-actions .btn-primary').click();
await p.waitForTimeout(400);
await p.locator('.srv-settings-btn').click();
await p.waitForTimeout(600);
check('при повторном открытии выбор на месте',
  (await p.locator('select[data-kind="mic"]').inputValue()) === chosenMic,
  await p.locator('select[data-kind="mic"]').inputValue());
await p.locator('.modal-actions .btn-primary').click();
await p.waitForTimeout(400);

await p.evaluate(() => { window.__gum = []; });
await p.locator('.ch-vpj-join-btn').click();
await p.waitForTimeout(900);
check('вход в комнату берёт выбранный микрофон',
  await p.evaluate((id) => window.__gum.some((c) => c.audio && c.audio.deviceId && c.audio.deviceId.exact === id), chosenMic),
  JSON.stringify(await p.evaluate(() => window.__gum)));
await p.locator('.ch-va-ctrl-leave').click();
await p.waitForTimeout(600);

console.log('\n── Голосовая комната ──');
await p.locator('.ch-voice-room').click();
await p.waitForTimeout(600);
check('показан экран перед входом', await p.locator('.ch-vpj-wrap').count() === 1);
check('видно, кто уже в комнате', (await p.locator('.ch-vpj-status').textContent()).includes('1 участник'));
check('текстового ввода в голосовом канале нет', await p.locator('.ch-input-area').count() === 0);
/* Состав комнаты сервер присылает сразу за voice_join — в том же кадре, до
   первой перерисовки. Отвечаем синхронно прямо из отправки, иначе проверка
   не поймает то, что было в модуле: он спрашивал номер комнаты у состояния
   экрана, там ещё пусто, и весь состав уходил в мусор. */
await p.evaluate(() => {
  const send = Shell.wsSend;
  Shell.wsSend = (m) => {
    send(m);
    if (m.type === 'voice_join') {
      window.__recv({
        type: 'voice_state',
        you_are: 'speaker',
        room: {
          speakers: [
            { user_id: 'me', username: 'k4nev', muted: true, video_muted: true },
            { user_id: 'u2', username: 'mysika', muted: false, video_muted: true },
          ],
          listeners: [{ user_id: 'u3', username: 'duty', raised_hand: true }],
        },
      });
    }
  };
});
await p.locator('.ch-vpj-join-btn').click();
await p.waitForTimeout(800);
const joined = await p.evaluate(() => window.__sent.filter((m) => m.type === 'voice_join').pop());
check('вход в комнату ушёл в сеть', !!joined && joined.room_id === 'v1' && joined.space_id === 's2', JSON.stringify(joined));
check('плитки участников появились', await p.locator('.ch-va-tile').count() === 2);
check('слушатели отдельной полосой', (await p.locator('.ch-va-listeners').textContent()).includes('Слушатели (1)'));
check('поднятая рука видна', (await p.locator('.ch-va-listener').textContent()).includes('✋'));
check('можно дать слово', await p.locator('.ch-vp-promote-btn').count() === 1);
check('микрофон по умолчанию выключен', await p.locator('.ch-va-ctrl-off .ico-mic-off').count() >= 1);

await p.locator('.ch-va-ctrl').first().click();
await p.waitForTimeout(300);
const muteMsg = await p.evaluate(() => window.__sent.filter((m) => m.type === 'voice_mute').pop());
check('включение микрофона ушло в сеть', !!muteMsg && muteMsg.muted === false, JSON.stringify(muteMsg));
await p.evaluate(() => window.__recv({ type: 'voice_speaking', user_id: 'u2', speaking: true }));
await p.waitForTimeout(250);
check('говорящий подсвечен', await p.locator('.ch-va-tile.ch-va-speaking').count() === 1);
await p.evaluate(() => window.__recv({ type: 'voice_mute_update', user_id: 'u2', muted: true, video_muted: true }));
await p.waitForTimeout(250);
check('чужое приглушение видно на плитке', await p.locator('.ch-va-tile.ch-va-muted').count() >= 1);

/* Сетка считает колонки от размера контейнера. Проверяем, что она правда
   меняется с числом участников и с шириной, а плитка нигде не схлопывается
   в нечитаемый прямоугольник. */
const fill = (n) => p.evaluate((cnt) => window.__recv({
  type: 'voice_state',
  you_are: 'speaker',
  room: {
    speakers: Array.from({ length: cnt }, (_, i) => ({
      user_id: i === 0 ? 'me' : 'p' + i, username: 'user' + i, muted: false, video_muted: true,
    })),
    listeners: [],
  },
}), n);
const tileBox = () => p.evaluate(() => {
  const t = document.querySelector('.ch-va-tile');
  const g = document.querySelector('.ch-va-grid');
  const r = t.getBoundingClientRect();
  const cs = getComputedStyle(g);
  return {
    w: Math.round(r.width),
    h: Math.round(r.height),
    cols: cs.gridTemplateColumns.split(' ').length,
    over: Math.round(g.scrollWidth - g.clientWidth),
  };
});

const wide = {};
for (const n of [1, 2, 4, 9]) { await fill(n); await p.waitForTimeout(350); wide[n] = await tileBox(); }
check('на широком экране одна плитка занимает почти всё',
  wide[1].cols === 1 && wide[1].w > 700, JSON.stringify(wide[1]));
/* Колонок не становится меньше от прибавления людей, и на девятерых сетка
   уходит вширь, а не в столбик из полосок. Вдвоём на почти квадратном поле
   выгоднее два широких кадра друг под другом — это ожидаемо. */
check('колонок не убывает с числом участников и на девятерых их несколько',
  wide[1].cols <= wide[2].cols && wide[2].cols <= wide[4].cols
    && wide[4].cols <= wide[9].cols && wide[9].cols >= 3,
  [1, 2, 4, 9].map((n) => n + ':' + wide[n].cols).join(' '));
check('плитка нигде не вытягивается в ленту',
  Object.values(wide).every((b) => b.w / b.h < 2.6 && b.h / b.w < 2.6),
  Object.entries(wide).map(([n, b]) => n + ':' + (b.w / b.h).toFixed(2)).join(' '));
check('плитки на пк остаются крупными',
  Object.values(wide).every((b) => b.w >= 220 && b.h >= 104),
  Object.entries(wide).map(([n, b]) => n + ':' + b.w + 'x' + b.h).join(' '));

await p.setViewportSize({ width: 390, height: 780 });
await p.waitForTimeout(400);
const narrow = {};
for (const n of [2, 4, 6]) { await fill(n); await p.waitForTimeout(350); narrow[n] = await tileBox(); }
check('на телефоне сетка сама переходит в одну-две колонки',
  narrow[2].cols <= 2 && narrow[6].cols <= 2,
  Object.entries(narrow).map(([n, b]) => n + ':' + b.cols).join(' '));
check('на телефоне плитка не превращается в полоску',
  Object.values(narrow).every((b) => b.w >= 150 && b.h >= 104),
  Object.entries(narrow).map(([n, b]) => n + ':' + b.w + 'x' + b.h).join(' '));
check('сетка не разъезжается вбок', Object.values(narrow).every((b) => b.over <= 0),
  Object.values(narrow).map((b) => b.over).join(' '));
check('когда ряды не влезли, сетка прокручивается',
  await p.evaluate(() => {
    const g = document.querySelector('.ch-va-grid');
    return g.dataset.scroll !== '1' || g.scrollHeight > g.clientHeight;
  }));
check('аватар ужимается вместе с плиткой',
  await p.evaluate(() => {
    const v = getComputedStyle(document.querySelector('.ch-va-grid')).getPropertyValue('--va-av');
    return parseInt(v, 10) >= 34 && parseInt(v, 10) <= 84;
  }));
await p.setViewportSize({ width: 1440, height: 900 });
await p.waitForTimeout(400);
await fill(2);
await p.waitForTimeout(300);

/* «На весь экран» должно быть экраном устройства, а не колонкой чата: слой
   выносится в body и просит настоящий полный экран. */
await p.evaluate(() => { window.__fs = []; });
await p.locator('.ch-va-tile').first().click();
await p.waitForTimeout(500);
check('развёрнутая плитка живёт в body, а не внутри чата',
  await p.evaluate(() => {
    const o = document.querySelector('.ch-va-overlay');
    return !!o && o.parentElement === document.body;
  }));
const ovBox = await p.evaluate(() => {
  const o = document.querySelector('.ch-va-overlay');
  const r = o.getBoundingClientRect();
  const cs = getComputedStyle(o);
  return { w: Math.round(r.width), h: Math.round(r.height), pos: cs.position, z: cs.zIndex };
});
check('слой накрывает всё окно, а не область чата',
  ovBox.pos === 'fixed' && ovBox.w === 1440 && ovBox.h === 900 && Number(ovBox.z) >= 1000,
  JSON.stringify(ovBox));
check('запрошен полный экран устройства',
  await p.evaluate(() => window.__fs.some((c) => c.indexOf('ch-va-overlay') !== -1)),
  JSON.stringify(await p.evaluate(() => window.__fs)));
await p.locator('.ch-va-ov-close').click();
await p.waitForTimeout(400);
check('закрытие убирает слой', await p.locator('.ch-va-overlay').count() === 0);

check('плашка комнаты появилась в каркасе',
  await p.evaluate(() => document.querySelector('#sidebarVoiceBar .sb-voice-bar-ico') !== null));
await p.locator('.ch-va-ctrl-leave').click();
await p.waitForTimeout(500);
check('выход ушёл в сеть', await p.evaluate(() => window.__sent.some((m) => m.type === 'voice_leave')));
check('плашка убралась', await p.evaluate(() => document.querySelector('#sidebarVoiceBar .sb-voice-bar-ico') === null));
check('снова экран перед входом', await p.locator('.ch-vpj-wrap').count() === 1);

console.log('\n── Живой фон ──');
await p.locator('.ch-channel[data-chid="c1"]').click();
await p.waitForTimeout(600);
check('слой фона есть и не ловит события',
  await p.evaluate(() => {
    const c = document.querySelector('.ch-chat .ho-backdrop');
    if (!c) return false;
    const st = getComputedStyle(c);
    const r = c.getBoundingClientRect();
    return st.pointerEvents === 'none' && r.width > 100 && r.height > 100;
  }));
check('фон нарисован, а не пустой холст',
  await p.evaluate(() => {
    const c = document.querySelector('.ch-chat .ho-backdrop');
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) return true;
    return false;
  }));
/* Рисунок должен отличаться от «Сообщений»: там редкие точки, здесь круги,
   расходящиеся от случайных точек. Проверяем и объявленный рисунок, и то,
   что холст действительно им заполнен. */
check('модуль просит рисунок кругами',
  await p.evaluate(() => document.querySelector('.ch-chat .ho-backdrop').dataset.variant) === 'rings');
check('холст заполнен, а не усыпан редкими точками',
  await p.evaluate(() => {
    const c = document.querySelector('.ch-chat .ho-backdrop');
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 6) painted++;
    return painted / (px.length / 4) > 0.25;
  }),
  await p.evaluate(() => {
    const c = document.querySelector('.ch-chat .ho-backdrop');
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 6) painted++;
    return 'закрашено ' + Math.round((painted / (px.length / 4)) * 100) + '%';
  }));

console.log('\n── Создание группы и канала ──');
await p.locator('.ch-head-add').click();
await p.waitForTimeout(400);
check('окно группы открылось', await p.locator('.ch-type-picker').count() === 1);
await p.locator('.modal .form-input').first().fill('Новая группа');
await p.locator('.modal-actions .btn-primary').click();
await p.waitForTimeout(400);
check('группа ушла на сервер',
  posted.some((r) => r.url.includes('/channels/spaces') && r.body.name === 'Новая группа' && r.body.type === 'text'));

await p.locator('.ch-space-header').first().click({ button: 'right' });
await p.waitForTimeout(300);
check('меню группы открылось', await p.locator('.ch-ctx-item', { hasText: 'Создать канал' }).count() === 1);
await p.locator('.ch-ctx-item', { hasText: 'Создать канал' }).click();
await p.waitForTimeout(400);
check('окно канала с выбором иконки', await p.locator('.ch-icon-picker .ch-icon-opt').count() > 5);
await p.locator('.modal .form-input').first().fill('новый-канал');
await p.locator('.ch-icon-picker .ch-icon-opt').nth(2).click();
await p.locator('.modal-actions .btn-primary').click();
await p.waitForTimeout(400);
const chCreate = posted.filter((r) => r.url.includes('/channels/channels')).pop();
check('канал ушёл на сервер с иконкой',
  !!chCreate && chCreate.body.name === 'новый-канал' && !!chCreate.body.icon,
  JSON.stringify(chCreate && chCreate.body));

await p.screenshot({ path: 'shot-desktop.png' });

console.log('\n── Иконки существуют ──');
/* Имя иконки подставляется в mask-image: выдуманное даёт пустой квадрат и
   никакой ошибки. В прежней версии так и было с ico-microphone — файла с
   таким именем в /svg нет и не было. */
const icoNames = await p.evaluate(() => {
  const out = new Set();
  document.querySelectorAll('[class*="ico-"]').forEach((el) => {
    el.classList.forEach((c) => { if (c.startsWith('ico-') && !/^ico-\d+$/.test(c)) out.add(c.slice(4)); });
  });
  return [...out];
});
const missing = [];
for (const name of icoNames) {
  const r = await fetch('http://localhost:8894/svg/' + name + '.svg');
  if (!r.ok) missing.push(name);
}
check('каждая иконка на экране существует в /svg', missing.length === 0, missing.join(', ') || (icoNames.length + ' проверено'));

/* Пикер иконок канала предлагает только существующие. */
await p.locator('.ch-space-header').first().click({ button: 'right' });
await p.waitForTimeout(300);
await p.locator('.ch-ctx-item', { hasText: 'Создать канал' }).click();
await p.waitForTimeout(400);
const pickerNames = await p.evaluate(() => [...document.querySelectorAll('.ch-icon-picker .ico')]
  .map((el) => [...el.classList].find((c) => c.startsWith('ico-') && !/^ico-\d+$/.test(c)).slice(4)));
const badPicker = [];
for (const name of pickerNames) {
  const r = await fetch('http://localhost:8894/svg/' + name + '.svg');
  if (!r.ok) badPicker.push(name);
}
check('в пикере иконок нет выдуманных', badPicker.length === 0, badPicker.join(', ') || (pickerNames.length + ' вариантов'));
await p.locator('.modal-close').click();
await p.waitForTimeout(300);

console.log('\n── Мобильная адаптация ──');
await p.setViewportSize({ width: 390, height: 800 });
await p.waitForTimeout(500);
check('страница не едет вбок',
  await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  await p.evaluate(() => document.documentElement.scrollWidth + ' > ' + window.innerWidth));
check('открытый канал занимает экран', await p.locator('.ch-chat.mobile-open').count() === 1);
await p.locator('.ch-back-btn').click();
await p.waitForTimeout(400);
check('назад возвращает к списку каналов', await p.locator('.ch-chat.mobile-open').count() === 0);
await p.screenshot({ path: 'shot-mobile.png' });

await browser.close();
server.kill();
console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
