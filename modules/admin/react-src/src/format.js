const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const pad2 = (n) => String(n).padStart(2, '0');
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function formatLastSeen(lastSeen, now = new Date()) {
  if (!lastSeen) return '—';
  const d = new Date(lastSeen * 1000);
  const time = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  if (sameDay(d, now)) return 'Сегодня в ' + time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Вчера в ' + time;
  const yearPart = d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '';
  return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + yearPart + ' в ' + time;
}

export function formatPresence(status, lastSeen, now = new Date()) {
  if (status === 'online') return { dot: 'online', text: 'Онлайн' };
  if (status === 'away') return { dot: 'away', text: 'Отошёл' };
  return { dot: null, text: formatLastSeen(lastSeen, now) };
}
