import { relTime } from '../../../../core/react-src/src/shared/format.js';
/* Токены времени продублированы из app.css: если задержки хореографии
   разъедутся с CSS, слои начнут исчезать раньше, чем закончится анимация. */
export const T = { xs: 190, s: 300, m: 445, back: 520, l: 560, xl: 660 };

export const HEART = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
);

export const TRASH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

/* Бумажный самолётик со следом — «отправить письмо» без эмодзи */
export const SEND = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.2 3.1 2.9 10.4c-.6.2-.6 1 0 1.2l6.4 2.2 2.2 6.4c.2.6 1 .6 1.2 0L21.2 3.1z" />
    <path d="M21.2 3.1 9.3 13.8" />
  </svg>
);

export const initials = (name) => {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
};

/* Родительный падеж имён: «для Ани», а не «для Аня».
   -я → -и; -а → -и после шипящих и к/г/х, иначе -ы. Прочее не трогаем. */
export function forWhom(name) {
  const n = (name || '').trim();
  if (!n) return n;
  const last = n.slice(-1);
  const prev = n.slice(-2, -1).toLowerCase();
  if (last === 'я') return n.slice(0, -1) + 'и';
  if (last === 'а') return n.slice(0, -1) + ('жчшщкгх'.includes(prev) ? 'и' : 'ы');
  return n;
}

/* «Только что», «5 мин назад», а после вчерашнего — дата. */
export const fmtTime = (ts) => relTime(ts, { longAsDate: true });

export const avatarSrc = (b64) => (b64 ? 'data:image/jpeg;base64,' + b64 : null);
