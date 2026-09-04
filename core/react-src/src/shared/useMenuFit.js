import { useLayoutEffect, useRef, useState } from 'react';

/* Меню по координатам курсора, не вылезающее за экран.

   Так или иначе это делали в пяти местах, и в четырёх из них размер меню был
   вписан числом: «Каналы» вычитали 190 и 200, «Серверы» — 200 и 100. Стоит
   добавить в меню пункт, и число перестаёт соответствовать: у нижнего края
   меню либо обрезается, либо отскакивает слишком высоко.

   Здесь меню сначала рисуется, потом измеряется по-настоящему — этот способ
   пришёл из «Сообщений». Пока размер неизвестен, меню прозрачное: первый
   кадр в неверном месте иначе заметен глазом.

   offsetY — сдвиг вниз от точки нажатия (на телефоне под палец),
   flipY — на сколько поднять, когда меню не влезает вниз. */
export default function useMenuFit(open, { offsetY = 0, flipY, margin = 8 } = {}) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) { setPos(null); return; }
    const el = ref.current;
    let x = open.x;
    let y = open.y + offsetY;
    if (x + el.offsetWidth > window.innerWidth) x = window.innerWidth - el.offsetWidth - margin;
    if (y + el.offsetHeight > window.innerHeight) y -= el.offsetHeight + (flipY === undefined ? offsetY : flipY);
    setPos({ left: Math.max(margin, x), top: Math.max(margin, y) });
  }, [open, offsetY, flipY, margin]);

  return [ref, pos || { opacity: 0 }];
}
