/* Форматирование дат, времени и числительных.

   Каждая из этих функций была написана в двух-трёх модулях. Различия были
   не всегда осмысленные: два варианта plural давали одинаковый результат на
   всех числах от нуля до пяти тысяч, просто написаны разными руками.

   А вот разница между «5 сентября» и «Сегодня/Вчера» осмысленная, поэтому
   это две функции с разными именами, а не одна с флагом. */

/** Часы и минуты: 14:05. */
export const fmtTime = (ts) =>
  new Date(ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** Дата словами: «5 сентября». */
export const fmtDate = (ts) =>
  new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

/** Дата с годом или «Без даты». */
export const fmtDateFull = (ts) => (ts
  ? new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  : 'Без даты');

/** Разделитель дней в переписке: «Сегодня», «Вчера» или дата. */
export function fmtDay(ts) {
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return fmtDate(ts);
}

/** Сколько прошло: «только что», «5 мин назад», «3 ч назад», «2 дн назад».
    longAsDate — после вчерашнего показывать дату, а не число дней. */
export function relTime(ts, { longAsDate } = {}) {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
  if (longAsDate) return diff < 86400 * 2 ? 'вчера' : fmtDate(ts);
  return Math.floor(diff / 86400) + ' дн назад';
}

/** Форма слова при числе: plural(n, 'файл', 'файла', 'файлов'). */
export function plural(n, one, few, many) {
  const mod = n % 100;
  if (mod >= 11 && mod <= 14) return many;
  const m = n % 10;
  if (m === 1) return one;
  if (m >= 2 && m <= 4) return few;
  return many;
}

/** Отображаемое имя: своё, иначе логин. */
export const displayName = (u) => (u ? u.display_name || u.username : '');
