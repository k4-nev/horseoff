/* Общие мелочи модуля: адреса вложений, форматирование, группировка.

   Экранирования здесь нет и быть не должно: раньше почти каждая из этих
   функций возвращала строку HTML и обязана была звать escapeHtml. Теперь всё
   выводится React'ом как текст, и забыть про экранирование невозможно. */

export const S = () => window.Shell;

export const chatKey = (a, b) => [a, b].sort().join('_');

export const wsSend = (m) => { const s = S(); if (s && s.wsSend) s.wsSend(m); };
export const toast = (t, type) => { const s = S(); if (s && s.toast) s.toast(t, type); };
export const buzz = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); };

/* Токен в query: файлы вложений отдаются по нему, заголовок к <img> не
   приложить. */
export function attUrl(id, suffix) {
  const s = S();
  const tk = s && s.token ? '?token=' + encodeURIComponent(s.token) : '';
  return '/api/msg/file/' + id + (suffix || '') + tk;
}

export const displayName = (c) => (c ? c.display_name || c.username : '');

export const fmtSize = (b) => {
  if (b < 1024) return b + ' Б';
  if (b < 1048576) return Math.round(b / 1024) + ' КБ';
  return (b / 1048576).toFixed(1) + ' МБ';
};

export const fmtDuration = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
};

export const fmtTime = (t) =>
  new Date(t * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const fmtDay = (t) =>
  new Date(t * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

export const fmtDayFull = (t) =>
  t ? new Date(t * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Без даты';

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
    const day = fmtDay(m.time);
    const dayChanged = day !== lastDay;
    const prev = dayChanged ? null : msgs[i - 1];
    lastDay = day;

    const isNew = !prev || prev.from !== m.from || m.time - prev.time > GROUP_GAP;

    const next = msgs[i + 1];
    const isEnd = !next
      || next.from !== m.from
      || fmtDay(next.time) !== day
      || next.time - m.time > GROUP_GAP;

    return { m, day: dayChanged ? day : null, isNew, isEnd, mine: m.from === meId };
  });
}

export function groupByDate(items) {
  const groups = new Map();
  items.forEach((a) => {
    const d = fmtDayFull(a.time);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(a);
  });
  return [...groups.entries()];
}

export const EMOJIS = ['😊', '😂', '❤️', '👍', '👋', '🔥', '😎', '🤔', '👌', '🙏', '😅', '🎉', '💪', '😍', '🤝', '👀', '✅', '❌', '⚡', '💯', '🚀', '😢', '😡', '🤣', '😘', '🥰', '😏', '😁', '😉', '🙂', '😐', '😑', '🤷', '💬', '📡', '🖥️', '⚙️', '🔧', '✨', '💀'];
export const TOP_REACTIONS = ['❤️', '👍', '😂', '🔥', '😢'];

/* Ссылки в тексте. Возвращаем куски, а не HTML: текст остаётся текстом. */
const URL_RE = /(https?:\/\/[^\s]+)/g;
export function linkify(text) {
  const out = [];
  let last = 0;
  String(text || '').replace(URL_RE, (url, offset) => {
    if (offset > last) out.push({ t: text.slice(last, offset) });
    out.push({ t: url, url });
    last = offset + url.length;
    return url;
  });
  if (last < (text || '').length) out.push({ t: text.slice(last) });
  return out;
}

/* Ограничения на вложения. Правила те же, что были — просто собраны в одном
   месте, а не размазаны по десятку if внутри цикла. */
const IMG = /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)$/i;
const AUD = /\.(mp3|ogg|wav|m4a|aac|wma|flac)$/i;
const VID = /\.(mp4|mov|avi|mkv|webm|3gp)$/i;
const FIL = /\.(pdf|doc|docx|xls|xlsx|zip|rar|txt|csv|pptx|json|xml)$/i;

export function mediaType(name) {
  if (IMG.test(name)) return 'image';
  if (VID.test(name)) return 'video';
  if (AUD.test(name)) return 'audio';
  if (FIL.test(name)) return 'file';
  return 'unknown';
}

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

/* Столбики звуковой дорожки. Высоты фиксированные: настоящую огибающую
   считать не по чему — сервер её не отдаёт. */
export const WAVE_H = [8, 15, 22, 12, 18, 9, 14, 20, 7, 13, 17, 10, 16, 19, 11, 21, 8, 14];
