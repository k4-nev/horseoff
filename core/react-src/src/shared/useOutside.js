import { useEffect, useRef } from 'react';

/* Закрытие по клику мимо (и по Escape).

   Девять инлайновых копий на приложение, и все чуть разные: где-то забыт
   Escape, где-то подписка откладывалась через setTimeout, где-то обработчик
   пересоздавался на каждый рендер.

   Про кнопку-переключатель. В этом приложении обработчики React отрабатывают
   ПОЗЖЕ обычных слушателей на document — замерено на пикере эмодзи: клик по
   его же кнопке сначала закрывал поповер отсюда, а следом onClick кнопки
   переключал состояние обратно, и поповер открывался снова. Закрыть его
   собственной кнопкой становилось невозможно. Поэтому кнопку (и всё, что
   само управляет открытием) передавайте в ignore — клики по ней мы не
   трогаем, ими распоряжается сам компонент.

   Слушаем в фазе всплытия: подписка живёт только пока open, и открывающий
   клик к моменту подписки уже закончился — поповер не схлопывается сам себе
   на открытии. */
export default function useOutside(open, onOutside, { escape = true, capture = false, ignore } = {}) {
  const ref = useRef(null);
  const cb = useRef(onOutside);
  cb.current = onOutside;
  const skip = useRef(ignore);
  skip.current = ignore;

  useEffect(() => {
    if (!open) return undefined;
    const inside = (t) => {
      if (ref.current && ref.current.contains(t)) return true;
      const list = skip.current ? [].concat(skip.current) : [];
      return list.some((r) => r && r.current && r.current.contains(t));
    };
    const hit = (e) => { if (!inside(e.target)) cb.current(e); };
    const key = (e) => { if (e.key === 'Escape') cb.current(e); };
    document.addEventListener('click', hit, capture);
    if (escape) document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('click', hit, capture);
      if (escape) document.removeEventListener('keydown', key);
    };
  }, [open, escape, capture]);

  return ref;
}
