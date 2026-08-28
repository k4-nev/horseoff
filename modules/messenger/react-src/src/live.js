/* Что произошло у человека на глазах.

   Анимация появления имеет смысл, только если её видят: сообщение, пришедшее
   в закрытый чат или в свёрнутую вкладку, к моменту открытия — уже часть
   истории, и «влетающая» реплика читалась бы как повтор. Поэтому событие
   помечается здесь только в момент прихода, и только когда чат открыт, а
   вкладка на экране.

   Пометка живёт до конца анимации: строка снимает её в onAnimationEnd, иначе
   любой следующий рендер (галочка «прочитано», реакция) проигрывал бы вход
   заново. */

const msgs = new Set();
const reacts = new Set();

/** Видит ли человек ленту прямо сейчас. */
export function watching() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export function markLive(id) { if (id && watching()) msgs.add(id); }
export function isLive(id) { return msgs.has(id); }
export function clearLive(id) { msgs.delete(id); }

export function markReact(id) { if (id && watching()) reacts.add(id); }
export function isReact(id) { return reacts.has(id); }
export function clearReact(id) { reacts.delete(id); }

/** Смена чата: всё, что не успело проиграться, уже неактуально. */
export function resetLive() { msgs.clear(); reacts.clear(); }
