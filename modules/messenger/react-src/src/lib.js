/* Общие мелочи модуля: адреса вложений, форматирование, группировка.

   Экранирования здесь нет и быть не должно: раньше почти каждая из этих
   функций возвращала строку HTML и обязана была звать escapeHtml. Теперь всё
   выводится React'ом как текст, и забыть про экранирование невозможно. */

/* Вложения, звук и разбор текста общие с «Каналами» — они живут в каркасе.
   Реэкспорт оставлен, чтобы остальной модуль не знал, откуда они приходят. */
export {
  attUrl, fmtSize, fmtDuration, linkify, mediaType, layoutMedia, MEDIA_W, WAVE_H,
} from '../../../../core/react-src/src/shared/chat/media.js';

export const chatKey = (a, b) => [a, b].sort().join('_');

/* Мост к оболочке — общий на все модули. */
export { S, api, wsSend, toast, buzz, me, meId, denyMessage } from '../../../../core/react-src/src/shared/shell.js';

/* Даты, время и имя — общие на всё приложение. Разделитель дней здесь
   именно дата, без «Сегодня»: она же служит ключом группировки. */
export { fmtTime, fmtDate, fmtDateFull, displayName } from '../../../../core/react-src/src/shared/format.js';
import { fmtDate, fmtDateFull } from '../../../../core/react-src/src/shared/format.js';

/* Время в списке контактов: сегодня — часы, иначе дата */
export function fmtContactTime(t) {
  const d = new Date(t * 1000);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

/* Чем показать чат в списке, если текста нет */
export function lastPreview(msg) {
  if (!msg) return '';
  if (msg.text) return msg.text;
  const a = msg.attachments && msg.attachments[0];
  if (!a) return '';
  if (a.type === 'image') return '📷 Фото';
  if (a.type === 'video') return '🎬 Видео';
  if (a.type === 'audio') return (a.name || '').startsWith('voice_') ? '🎤 Голосовое' : '🎵 Аудио';
  return '📎 Файл';
}

export const GROUP_GAP = 120;
export const TWO_DAYS = 172800;

/* Разметка ленты: где начинается новая группа, где её конец, где день сменился.
   Считается один раз по всему списку — раньше то же самое делалось при склейке
   строк, а для доклеенного сообщения ещё раз и по-другому, из-за чего
   догруженное и пришедшее по сети группировались по разным правилам. */
export function layoutMessages(msgs, meId) {
  let lastDay = '';
  return msgs.map((m, i) => {
    const day = fmtDate(m.time);
    const dayChanged = day !== lastDay;
    const prev = dayChanged ? null : msgs[i - 1];
    lastDay = day;

    const isNew = !prev || prev.from !== m.from || m.time - prev.time > GROUP_GAP;

    const next = msgs[i + 1];
    const isEnd = !next
      || next.from !== m.from
      || fmtDate(next.time) !== day
      || next.time - m.time > GROUP_GAP;

    return { m, day: dayChanged ? day : null, isNew, isEnd, mine: m.from === meId };
  });
}

export function groupByDate(items) {
  const groups = new Map();
  items.forEach((a) => {
    const d = fmtDateFull(a.time);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(a);
  });
  return [...groups.entries()];
}

export const EMOJIS = ['😊', '😂', '❤️', '👍', '👋', '🔥', '😎', '🤔', '👌', '🙏', '😅', '🎉', '💪', '😍', '🤝', '👀', '✅', '❌', '⚡', '💯', '🚀', '😢', '😡', '🤣', '😘', '🥰', '😏', '😁', '😉', '🙂', '😐', '😑', '🤷', '💬', '📡', '🖥️', '⚙️', '🔧', '✨', '💀'];
export const TOP_REACTIONS = ['❤️', '👍', '😂', '🔥', '😢'];

/* Ограничения на вложения. Правила те же, что были — просто собраны в одном
   месте, а не размазаны по десятку if внутри цикла. */
const IMG = /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)$/i;
const AUD = /\.(mp3|ogg|wav|m4a|aac|wma|flac)$/i;
const VID = /\.(mp4|mov|avi|mkv|webm|3gp)$/i;
const FIL = /\.(pdf|doc|docx|xls|xlsx|zip|rar|txt|csv|pptx|json|xml)$/i;

/** Можно ли добавить файл к уже набранным. Возвращает текст отказа или null. */
export function rejectFile(file, current) {
  const t = mediaType(file.name);
  const n = (k) => current.filter((f) => f.mediaType === k).length;
  const img = n('image'); const vid = n('video'); const aud = n('audio'); const fil = n('file');

  if (t === 'audio' && (img || vid || fil || aud >= 1)) return 'Аудио отправляется отдельно (макс 1)';
  if (t === 'video' && (aud || fil || vid >= 1)) return 'Макс 1 видео';
  if (t === 'video' && file.size > 50 * 1024 * 1024) return 'Видео макс 50 МБ';
  if (t === 'image' && (aud || fil)) return 'Фото нельзя с файлами или аудио';
  if (t === 'image' && img >= 6) return 'Макс 6 фото';
  if (t === 'file' && (img || vid || aud)) return 'Файлы отправляются отдельно';
  if (t !== 'video' && file.size > 10 * 1024 * 1024) return 'Макс 10 МБ: ' + file.name;
  return null;
}

