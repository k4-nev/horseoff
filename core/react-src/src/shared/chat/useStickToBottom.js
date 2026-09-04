import { useEffect, useRef } from 'react';

/* Лента, которая держится за низ.

   Написано было дважды — в «Сообщениях» и «Каналах» — и оба раза из-за
   одной и той же жалобы: чат «прыгает».

   Ловушек тут две, и обе неочевидны.

   Первая: поле ввода растёт вместе с набранным текстом (а на телефоне ещё
   клавиатура, полоска ответа, превью вложений) — лента при этом ужимается,
   scrollTop браузер не трогает, и последние сообщения уезжают под ввод.
   Набрал длинное — переписка «поднялась», отправил и поле схлопнулось —
   «опустилась». Поэтому следим за размером самой ленты.

   Вторая: картинки и вложения досчитывают высоту уже после отрисовки. Тут
   меняется не лента, а её содержимое, поэтому нужен второй наблюдатель — на
   обёртке (flowRef). Без него конец переписки тихо уезжал за нижний край, а
   первое своё сообщение возвращало его рывком.

   И общая мина: когда лента выросла сама, браузер тоже шлёт scroll. По
   такому событию выходит, будто человек ушёл вверх, — после чего лента
   обратно уже не возвращается. Поэтому «прижатость» меняем только по живой
   прокрутке: признак — что высота содержимого с прошлого раза не менялась. */

export default function useStickToBottom(scrollRef) {
  const pinned = useRef(true);
  const lastH = useRef(0);
  const flowRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (!pinned.current) return;
      el.scrollTop = el.scrollHeight;
      lastH.current = el.scrollHeight;
    });
    ro.observe(el);
    if (flowRef.current) ro.observe(flowRef.current);
    return () => ro.disconnect();
  }, [scrollRef]);

  /** Довести до низа и запомнить, что прижаты. */
  const toBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = true;
    el.scrollTop = el.scrollHeight;
    lastH.current = el.scrollHeight;
  };

  /** Человек читает выше — новые сообщения его не дёргают. */
  const release = () => { pinned.current = false; };

  /** Вызывать из onScroll. Возвращает расстояние до низа. */
  const noteScroll = () => {
    const el = scrollRef.current;
    if (!el) return 0;
    const below = el.scrollHeight - el.scrollTop - el.clientHeight;
    const grownItself = el.scrollHeight !== lastH.current;
    lastH.current = el.scrollHeight;
    if (!grownItself) pinned.current = below < 24;
    return below;
  };

  return { flowRef, toBottom, release, noteScroll };
}
