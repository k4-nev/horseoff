import { useEffect, useRef, useState } from 'react';
import { attUrl } from './media.js';
import './gallery.css';

/* Просмотрщик вложений: одно окно на картинку и видео, с листанием по всей
   пачке — вложениям сообщения или целой вкладке «Медиа».

   Общий для «Сообщений» и «Каналов»: в каналах раньше был свой, без
   листания вовсе — открыл картинку и закрыл, чтобы открыть соседнюю. */

export default function Gallery({ open, onClose }) {
  const items = open ? open.items : null;
  const [i, setI] = useState(0);
  const touch = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => { if (open) setI(open.index || 0); }, [open]);

  const n = items ? items.length : 0;
  const step = (d) => setI((k) => (n ? (k + d + n) % n : 0));

  /* Обработчик держим в ref: onClose приходит новой стрелкой на каждый
     рендер, и переподписка посреди dispatch съедает Escape у соседнего
     оверлея — так просмотрщик когда-то не закрывался поверх панели. */
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => {
      if (e.key === 'Escape') closeRef.current();
      else if (e.key === 'ArrowLeft') stepRef.current(-1);
      else if (e.key === 'ArrowRight') stepRef.current(1);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);

  if (!open || !n) return null;
  const cur = items[Math.min(i, n - 1)];
  const video = cur.type === 'video';

  const onStart = (e) => { touch.current = e.touches[0].clientX; };
  const onEnd = (e) => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  };

  const arrow = (dir) => (
    <button
      className={'ho-gallery-nav ' + (dir < 0 ? 'prev' : 'next')}
      onClick={(e) => { e.stopPropagation(); step(dir); }}
      aria-label={dir < 0 ? 'Предыдущее' : 'Следующее'}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points={dir < 0 ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
      </svg>
    </button>
  );

  return (
    <div
      className="ho-gallery"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={onStart}
      onTouchEnd={onEnd}
    >
      <button className="ho-gallery-close" onClick={onClose}>×</button>
      {n > 1 && arrow(-1)}
      {video
        ? <video key={cur.id} src={attUrl(cur.id)} controls autoPlay className="ho-gallery-media" />
        : <img key={cur.id} src={attUrl(cur.id)} alt="" className="ho-gallery-media" />}
      {n > 1 && arrow(1)}
      {n > 1 && <div className="ho-gallery-count">{(i % n) + 1} / {n}</div>}
    </div>
  );
}
