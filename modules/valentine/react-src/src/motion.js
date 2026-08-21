import { useEffect, useState } from 'react';

/* Режимом движения управляет КЛАСС на корне модуля, а не media-query.
   Причина: на системах с отключёнными анимациями Windows (обычное дело для
   Server и RDP) браузер репортит prefers-reduced-motion: reduce, и глухое
   правило вида *{transition-duration:.01ms} превращает весь модуль в набор
   мгновенных скачков — пользователь не видит дизайн вообще. Здесь вместо
   этого мягкая деградация плюс возможность включить движение осознанно.

   Подсказку показываем ТОЛЬКО тем, у кого система просит меньше движения,
   и её можно закрыть навсегда: для человека, отключившего анимации
   намеренно (укачивание, вестибулярные нарушения), это осознанный выбор,
   а не проблема, которую нужно чинить всплывашкой. */
const MQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const KEY = 'vl-motion';

const read = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
const write = (v) => {
  try { localStorage.setItem(KEY, v); } catch { /* приватный режим — не критично */ }
};

export function useMotionMode() {
  const systemReduce = !!(MQ && MQ.matches);
  const [choice, setChoice] = useState(read); // 'on' | 'dismissed' | null

  useEffect(() => {
    if (!MQ || !MQ.addEventListener) return undefined;
    const sync = () => setChoice(read());
    MQ.addEventListener('change', sync);
    return () => MQ.removeEventListener('change', sync);
  }, []);

  return {
    reduced: systemReduce && choice !== 'on',
    // Подсказка только пока человек не сделал выбор
    showHint: systemReduce && choice === null,
    enable: () => { write('on'); setChoice('on'); },
    dismiss: () => { write('dismissed'); setChoice('dismissed'); },
  };
}
