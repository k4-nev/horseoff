import { useCallback, useEffect, useRef, useState } from 'react';
import { BUY_DATES } from './mock.js';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const TODAY = new Date('2026-08-11T00:00:00');

/* Лента дат: колесо и перетаскивание прокручивают, крайние плитки плавно
   уменьшаются и гаснут. Масштаб считаем по фактическому положению плитки
   в ленте, поэтому он не зависит от того, сколько дат в списке. */
export default function DayStrip({ active, onPick }) {
  const ref = useRef(null);
  const moved = useRef(false);

  const scale = useCallback(() => {
    const strip = ref.current;
    if (!strip) return;
    const r = strip.getBoundingClientRect();
    const zone = 140;
    strip.querySelectorAll('.mp-day-slot, .mp-sep-slot').forEach((slot) => {
      const sr = slot.getBoundingClientRect();
      const center = sr.left + sr.width / 2 - r.left;
      let t = 1;
      if (center < zone) t = center / zone;
      else if (center > r.width - zone) t = (r.width - center) / zone;
      t = Math.max(0, Math.min(1, t));
      slot.style.opacity = t.toFixed(3);
      slot.style.transform = slot.classList.contains('mp-sep-slot') ? '' : `scale(${(0.25 + 0.75 * t).toFixed(3)})`;
    });
  }, []);

  /* Центрируем выбранный день при первом показе и пересчитываем масштаб */
  useEffect(() => {
    const strip = ref.current;
    if (!strip) return undefined;
    const act = strip.querySelector('.mp-day.active');
    if (act) {
      const slot = act.parentElement;
      strip.scrollLeft = slot.offsetLeft - strip.clientWidth / 2 + slot.offsetWidth / 2;
    }
    scale();
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); }
    };
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => strip.removeEventListener('wheel', onWheel);
  }, [scale]);

  const drag = useRef({ down: false, x: 0, left: 0 });

  const rows = [];
  let prevMonth = null;
  BUY_DATES.forEach((ds) => {
    const d = new Date(ds + 'T00:00:00');
    const m = d.getMonth();
    if (prevMonth === null || m !== prevMonth) {
      rows.push(<div className="mp-sep-slot" key={'sep' + ds}><div className="mp-month-sep">{MONTHS[m]}</div></div>);
    }
    prevMonth = m;
    rows.push(
      <div className="mp-day-slot" key={ds}>
        <div
          className={'mp-day' + (d < TODAY ? ' past' : '') + (ds === active ? ' active' : '')}
          onClick={() => { if (!moved.current) onPick(ds, false); }}
        >
          <span className="mp-day-dow">{DOW[d.getDay()]}</span>
          <span className="mp-day-num">{String(d.getDate()).padStart(2, '0')}</span>
        </div>
      </div>
    );
  });

  return (
    <div
      className="mp-daystrip"
      ref={ref}
      onScroll={scale}
      onPointerDown={(e) => { drag.current = { down: true, x: e.clientX, left: ref.current.scrollLeft }; moved.current = false; }}
      onPointerMove={(e) => {
        if (!drag.current.down) return;
        const dx = e.clientX - drag.current.x;
        if (Math.abs(dx) > 4) moved.current = true;
        ref.current.scrollLeft = drag.current.left - dx;
      }}
      onPointerUp={() => { drag.current.down = false; }}
      onPointerLeave={() => { drag.current.down = false; }}
    >
      {rows}
    </div>
  );
}

/* Календарь: кликабельны только дни, по которым есть выкупы */
export function Calendar({ active, onPick }) {
  const first = new Date(active + 'T00:00:00');
  const [y, setY] = useState(first.getFullYear());
  const [m, setM] = useState(first.getMonth());

  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const has = new Set(BUY_DATES);

  const nav = (delta) => {
    let nm = m + delta;
    let ny = y;
    if (nm < 0) { nm = 11; ny -= 1; }
    if (nm > 11) { nm = 0; ny += 1; }
    setM(nm); setY(ny);
  };

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(<div className="mp-cal-day" key={'l' + i} />);
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isHas = has.has(key);
    cells.push(
      <div
        className={'mp-cal-day' + (isHas ? ' has' : '') + (key === active ? ' active' : '')}
        key={key}
        onClick={isHas ? () => onPick(key, true) : undefined}
      >
        {d}
      </div>
    );
  }

  return (
    <>
      <div className="mp-cal-head">
        <button className="mp-cal-nav" onClick={(e) => { e.stopPropagation(); nav(-1); }}>‹</button>
        <span className="mp-cal-title">{MONTHS[m]} {y}</span>
        <button className="mp-cal-nav" onClick={(e) => { e.stopPropagation(); nav(1); }}>›</button>
      </div>
      <div className="mp-cal-grid">
        {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((d) => <div className="mp-cal-dow" key={d}>{d}</div>)}
        {cells}
      </div>
      <div className="mp-cal-legend">
        <span><i style={{ background: 'var(--accent)' }} />есть выкуп</span>
        <span><i style={{ background: 'var(--surface2)' }} />нет данных</span>
      </div>
    </>
  );
}
