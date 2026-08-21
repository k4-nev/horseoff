import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { forWhom, initials, fmtTime, avatarSrc, HEART, TRASH, T } from './icons.jsx';

export default function Reveal({ valentine, originRect, reduced, onClose, onDelete }) {
  const [page, setPage] = useState(0);
  const [folded, setFolded] = useState(!!originRect && !reduced);
  const [chromeOn, setChromeOn] = useState(!originRect || reduced);
  const mainRef = useRef(null);
  const dotsRef = useRef(null);
  const pillRef = useRef(null);
  const touchX = useRef(null);

  const total = valentine.pages.length;

  /* Полёт карточки из её места в списке в центр (FLIP).
     useLayoutEffect — чтобы поставить стартовый transform до первой отрисовки
     и не показать кадр, где карточка уже в центре. */
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el || !originRect || reduced) return undefined;
    const to = el.getBoundingClientRect();
    const dx = (originRect.left + originRect.width / 2) - (to.left + to.width / 2);
    const dy = (originRect.top + originRect.height / 2) - (to.top + to.height / 2);
    const sx = originRect.width / to.width;
    const sy = originRect.height / to.height;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = 'transform var(--vl-t-xl) var(--vl-e-io)';
      el.style.transform = '';
    }));

    // Соседи выезжают из-под неё, пока она ещё летит; обвязка — следом
    const t1 = setTimeout(() => setFolded(false), Math.round(T.xl * 0.41));
    const t2 = setTimeout(() => setChromeOn(true), Math.round(T.xl * 0.33));
    const t3 = setTimeout(() => { if (mainRef.current) mainRef.current.style.transition = ''; }, T.xl + 60);
    return () => { cancelAnimationFrame(id); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Ползунок точек едет по дорожке, а не прыгает
  useEffect(() => {
    const dots = dotsRef.current;
    const pill = pillRef.current;
    if (!dots || !pill) return;
    const active = dots.querySelectorAll('.vl-dot')[page];
    if (active) pill.style.transform = `translate(${active.offsetLeft - 7.5}px, -50%)`;
  }, [page, chromeOn]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setPage((p) => Math.min(total - 1, p + 1));
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total, onClose]);

  const offOf = (i) => {
    const d = i - page;
    return Math.abs(d) > 2 ? 'far' : String(d);
  };

  const src = avatarSrc(valentine.from_avatar);

  return (
    <>
      <div className={'vl-chrome' + (chromeOn ? ' vl-on' : '')}>
        <div className="vl-head">
          <div>
            <button className="vl-back" onClick={onClose}>‹ Назад</button>
            <h1>От {forWhom(valentine.from_name)}</h1>
            <div className="vl-sub">Признание из пяти карточек · {fmtTime(valentine.time)}</div>
          </div>
          <div className="vl-mark">{HEART}</div>
        </div>
      </div>

      <div
        className="vl-viewer"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) < 45) return;
          setPage((p) => Math.max(0, Math.min(total - 1, p + (dx < 0 ? 1 : -1))));
        }}
      >
        <div className={'vl-deck' + (folded ? ' vl-folded' : '')}>
          {valentine.pages.map((p, i) => (
            <div
              key={i}
              className="vl-slide"
              data-off={offOf(i)}
              ref={i === 0 ? mainRef : null}
              onClick={() => setPage(i)}
            >
              <div className="vl-card">
                <span className="vl-cap">Любовь это…</span>
                <span className="vl-num">{i + 1} / {total}</span>
                <span className="vl-art"><img src={p.sticker} alt="" /></span>
                <span className="vl-txt">{p.text}</span>
              </div>
            </div>
          ))}
        </div>

        <div className={'vl-chrome' + (chromeOn ? ' vl-on' : '')}>
          <div className="vl-dots" ref={dotsRef}>
            <span className="vl-dpill" ref={pillRef} />
            {valentine.pages.map((_, i) => (
              <button
                key={i}
                className={'vl-dot' + (i === page ? ' vl-under' : '')}
                aria-label={'Карточка ' + (i + 1)}
                onClick={() => setPage(i)}
              />
            ))}
          </div>
        </div>

        <div className={'vl-chrome vl-from' + (chromeOn ? ' vl-on' : '')}>
          <span className="vl-a">{src ? <img src={src} alt="" /> : initials(valentine.from_name)}</span>
          от {forWhom(valentine.from_name)}, с любовью
        </div>

        <div className={'vl-chrome' + (chromeOn ? ' vl-on' : '')}>
          <button className="vl-btn vl-trash" onClick={() => onDelete(valentine.id)}>{TRASH}Удалить</button>
        </div>
      </div>
    </>
  );
}
