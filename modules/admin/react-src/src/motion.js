import { useEffect, useState } from 'react';

/* Тот же паттерн, что в modules/valentine/react-src/src/motion.js: режимом
   движения управляет класс на корне модуля, а не голая media-query. На
   системах с отключёнными анимациями Windows (обычное дело для Server/RDP)
   браузер репортит prefers-reduced-motion: reduce, и глухое правило вида
   *{transition-duration:.01ms} превращает интерфейс в набор мгновенных
   скачков. Здесь вместо этого мягкая деградация плюс осознанное включение. */
const MQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const KEY = 'adm-motion';

const read = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
const write = (v) => {
  try { localStorage.setItem(KEY, v); } catch { /* приватный режим — не критично */ }
};

export function useMotionMode() {
  const systemReduce = !!(MQ && MQ.matches);
  const [choice, setChoice] = useState(read);

  useEffect(() => {
    if (!MQ || !MQ.addEventListener) return undefined;
    const sync = () => setChoice(read());
    MQ.addEventListener('change', sync);
    return () => MQ.removeEventListener('change', sync);
  }, []);

  return {
    reduced: systemReduce && choice !== 'on',
    showHint: systemReduce && choice === null,
    enable: () => { write('on'); setChoice('on'); },
    dismiss: () => { write('dismissed'); setChoice('dismissed'); },
  };
}
