import { useEffect, useState } from 'react';

/* Режимом движения управляет КЛАСС на корне модуля, а не media-query.
   Причина: на системах с отключёнными анимациями Windows (обычное дело для
   Server и RDP) браузер репортит prefers-reduced-motion: reduce, и глухое
   правило вида *{transition-duration:.01ms} превращает весь модуль в набор
   мгновенных скачков — пользователь не видит дизайн вообще. Здесь вместо
   этого мягкая деградация (короткие фейды) плюс возможность включить
   движение осознанно. */
const MQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const KEY = 'vl-motion';

const forced = () => {
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
};

export function enableMotion() {
  try { localStorage.setItem(KEY, 'on'); } catch { /* приватный режим — не критично */ }
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => !!(MQ && MQ.matches) && !forced());

  useEffect(() => {
    if (!MQ) return;
    const sync = () => setReduced(MQ.matches && !forced());
    if (MQ.addEventListener) {
      MQ.addEventListener('change', sync);
      return () => MQ.removeEventListener('change', sync);
    }
    return undefined;
  }, []);

  return [reduced, () => { enableMotion(); setReduced(false); }];
}
