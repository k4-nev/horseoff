/* Общее для модуля «Каналы».

   Модель тут дискордовская, а не телеграмная: группы (spaces) с каналами
   внутри, текстовые и голосовые, общий список участников на группу и роли.
   Поэтому от «Сообщений» переиспользуются детали сообщения — вложения, звук,
   просмотрщик, фон, — но не устройство ленты. */

/* Мост к оболочке — общий на все модули. */
export { S, api, wsSend, toast, buzz, me, meId } from '../../../../core/react-src/src/shared/shell.js';

/* Роли общие на всё приложение: лестница обязана совпадать с ROLE_RANK
   в core/server.py. ROLE_ORDER — порядок в списке участников, от старших. */
export { ADMIN_ROLES, isAdminRole, ROLES_DESC as ROLE_ORDER } from '../../../../core/react-src/src/shared/roles.js';

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

/* Даты, время и числительные — общие на всё приложение. */
export { fmtTime, fmtDay, displayName, plural } from '../../../../core/react-src/src/shared/format.js';

export const EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😍', '🤔', '😐', '😴', '😎', '🥳', '😢', '😭', '😡', '🤯', '🥶', '👍', '👎', '👏', '🙏', '💪', '🤝', '👀', '🔥', '💯', '✅', '❌', '⚡', '🎉', '🚀', '💡', '📌', '📎', '🔔', '⏰', '🎯', '🧠', '☕', '🍕', '🌙'];
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

/* Иконки каналов — только те, что реально лежат в /svg: имена подставляются
   в mask-image, и выдуманное имя даёт пустой квадрат вместо иконки. */
export const CHANNEL_ICONS = [
  'channels', 'servers', 'messenger', 'users', 'settings', 'search', 'file', 'play',
  'bots', 'mp', 'pin', 'speaker', 'video', 'mic',
];

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
