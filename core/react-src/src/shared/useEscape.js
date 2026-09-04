import { useEffect, useRef } from 'react';

/* Закрытие по Escape для любого оверлея.

   Раньше это делал один глобальный слушатель в ядре: он снимал класс active
   со всех .modal-overlay. Разметку теперь рисует React, и такое закрытие шло
   мимо состояния — окно исчезало с экрана, но модуль считал его открытым, а
   следующая же перерисовка возвращала его обратно.

   Обработчик держим в ref: onClose приходит новой стрелкой на каждый рендер,
   и переподписка посреди dispatch съедает Escape у соседнего оверлея. */
export default function useEscape(open, onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);
}
