/* Общее для модуля «Каналы».

   Модель тут дискордовская, а не телеграмная: группы (spaces) с каналами
   внутри, текстовые и голосовые, общий список участников на группу и роли.
   Поэтому от «Сообщений» переиспользуются детали сообщения — вложения, звук,
   просмотрщик, фон, — но не устройство ленты. */

export const S = () => window.Shell;

export const api = (url, opts) => {
  const s = S();
  return s && s.api ? s.api(url, opts) : Promise.resolve(null);
};
export const wsSend = (m) => { const s = S(); if (s && s.wsSend) s.wsSend(m); };
export const toast = (t, type) => { const s = S(); if (s && s.toast) s.toast(t, type); };
export const buzz = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); };
export const me = () => { const s = S(); return (s && s.user) || {}; };

export const ADMIN_ROLES = ['arcana', 'immortal', 'legendary'];
export const isAdminRole = (role) => ADMIN_ROLES.indexOf(role) !== -1;

/** Порядок ролей в списке участников — от старших к младшим. */
export const ROLE_ORDER = ['arcana', 'immortal', 'legendary', 'mythical', 'rare', 'uncommon', 'common'];

/* Группировка по-дискордовски: подряд идущие сообщения одного автора в
   пределах двух минут сливаются в одну «пачку» — аватар и шапка только у
   первого. Ответ и разделитель непрочитанного пачку разрывают. */
export const GROUP_GAP = 120;

export function layoutMessages(msgs, meId, lastRead) {
  let sepDone = false;
  return msgs.map((m, i) => {
    const prev = i > 0 ? msgs[i - 1] : null;
    const newHere = !sepDone && lastRead > 0 && m.time > lastRead && m.from !== meId;
    if (newHere) sepDone = true;
    const grouped = !!prev && prev.from === m.from && (m.time - prev.time) < GROUP_GAP && !m.reply_to && !newHere;
    return { m, grouped, newHere, mine: m.from === meId };
  });
}

export const fmtTime = (ts) => new Date(ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function fmtDay(ts) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return 'Сегодня';
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export const displayName = (u) => (u ? u.display_name || u.username : '');

export const EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😍', '🤔', '😐', '😴', '😎', '🥳', '😢', '😭', '😡', '🤯', '🥶', '👍', '👎', '👏', '🙏', '💪', '🤝', '👀', '🔥', '💯', '✅', '❌', '⚡', '🎉', '🚀', '💡', '📌', '📎', '🔔', '⏰', '🎯', '🧠', '☕', '🍕', '🌙'];
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

/* Иконки каналов — только те, что реально лежат в /svg: имена подставляются
   в mask-image, и выдуманное имя даёт пустой квадрат вместо иконки. */
export const CHANNEL_ICONS = [
  'channels', 'servers', 'messenger', 'users', 'settings', 'search', 'file', 'play',
  'bots', 'mp', 'pin', 'speaker', 'video', 'mic',
];

export function plural(n, f1, f2, f5) {
  const mod = n % 100;
  if (mod >= 11 && mod <= 14) return f5;
  const m = n % 10;
  if (m === 1) return f1;
  if (m >= 2 && m <= 4) return f2;
  return f5;
}

/** Фото группы уезжает в JSON — ужимаем до 128px. */
export function compressImage(dataURL, maxPx = 128) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
    };
    img.onerror = () => resolve('');
    img.src = dataURL;
  });
}
