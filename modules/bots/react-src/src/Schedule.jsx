import { useEffect, useRef, useState } from 'react';
import {
  DOW, MONTHS, b64, buzz, fmtSchedDt, fmtSchedDtDisplay, fmtSchedTime,
  pad2, parseSchedDt, parseSchedTime, toast,
} from './lib.js';
import useOutside from '../../../../core/react-src/src/shared/useOutside.js';

/* Пикер расписания: часы-минуты, для datetime — ещё и календарь.

   Значение бота (ctrl_update) не должно перебивать то, что человек прямо
   сейчас крутит, поэтому пока пикер открыт входящие значения игнорируются —
   это правило было и в исходной версии, и оно важнее, чем свежесть. */

function Drum({ value, onStep }) {
  const [flip, setFlip] = useState(0);
  const step = (d) => { setFlip((f) => f + 1); buzz(6); onStep(d); };
  return (
    <div className="bt-drum">
      <button className="bt-drum-btn" onClick={() => step(1)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
      </button>
      <div className="bt-drum-val bt-drum-flip" key={flip}>{pad2(value)}</div>
      <button className="bt-drum-btn" onClick={() => step(-1)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
    </div>
  );
}

function Calendar({ d, mo, y, onPick, onNav }) {
  const first = new Date(y, mo - 1, 1).getDay();
  const offset = (first + 6) % 7;
  const days = new Date(y, mo, 0).getDate();
  const now = new Date();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(<div key={'e' + i} />);
  for (let day = 1; day <= days; day++) {
    const sel = day === d;
    const today = day === now.getDate() && mo === now.getMonth() + 1 && y === now.getFullYear();
    cells.push(
      <div
        key={day}
        className={'bt-sched-cal-day' + (sel ? ' selected' : today ? ' today' : '')}
        onClick={() => { buzz(8); onPick(day); }}
      >
        {day}
      </div>,
    );
  }
  return (
    <div>
      <div className="bt-sched-cal-head">
        <button className="bt-sched-cal-nav" onClick={() => onNav(-1)}>‹</button>
        <span>{MONTHS[mo - 1]} {y}</span>
        <button className="bt-sched-cal-nav" onClick={() => onNav(1)}>›</button>
      </div>
      <div className="bt-sched-cal-grid">
        {DOW.map((w) => <div className="bt-sched-cal-dow" key={w}>{w}</div>)}
        {cells}
      </div>
    </div>
  );
}

export default function Schedule({ ctrl, send }) {
  const isDt = ctrl.type === 'schedule_datetime';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => (isDt ? parseSchedDt(ctrl.value) : parseSchedTime(ctrl.value)));
  const [shown, setShown] = useState(ctrl.value || '');
  const ref = useOutside(open, () => setOpen(false), { capture: true });

  /* Значение с бота принимаем, только когда пикер закрыт И оно действительно
     новое. Иначе закрытие пикера после «Сохранить» тут же возвращало на экран
     старое значение из манифеста: бот ещё не успел подтвердить. */
  const lastProp = useRef(ctrl.value);
  useEffect(() => {
    if (open || ctrl.value === lastProp.current) return;
    lastProp.current = ctrl.value;
    setShown(ctrl.value || '');
    setDraft(isDt ? parseSchedDt(ctrl.value) : parseSchedTime(ctrl.value));
  }, [ctrl.value, open, isDt]);

  const empty = !shown || !String(shown).trim();
  let display = '—';
  if (!empty) {
    if (isDt) { const dt = parseSchedDt(shown); display = fmtSchedDtDisplay(dt.d, dt.mo, dt.y, dt.h, dt.mi); }
    else { const t = parseSchedTime(shown); display = fmtSchedTime(t.h, t.mi); }
  }

  const stepH = (dir) => setDraft((s) => ({ ...s, h: (s.h + dir + 24) % 24 }));
  const stepM = (dir) => setDraft((s) => ({ ...s, mi: ((s.mi / 5 + dir + 12) % 12) * 5 }));
  const navMonth = (delta) => setDraft((s) => {
    let mo = s.mo + delta, y = s.y;
    if (mo > 12) { mo = 1; y++; }
    if (mo < 1) { mo = 12; y--; }
    return { ...s, mo, y };
  });

  const save = () => {
    const value = isDt ? fmtSchedDt(draft.d, draft.mo, draft.y, draft.h, draft.mi) : fmtSchedTime(draft.h, draft.mi);
    const disp = isDt ? fmtSchedDtDisplay(draft.d, draft.mo, draft.y, draft.h, draft.mi) : value;
    setShown(value);
    setOpen(false);
    send(ctrl.id, 'set', b64(value));
    toast('Отправлено боту: ' + disp);
    buzz(18);
  };

  return (
    <div ref={ref}>
      <div className="bt-ctrl-label">{ctrl.label || (isDt ? 'Дата и время' : 'Время')}</div>
      <div className="bt-sched-display" onClick={() => setOpen((v) => !v)}>
        {isDt ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        )}
        <span className="bt-sched-val-txt">{display}</span>
        <svg className="bt-sched-edit-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
      </div>
      <div className={'bt-sched-picker' + (open ? ' open' : '')}>
        {isDt && (
          <Calendar
            d={draft.d} mo={draft.mo} y={draft.y}
            onPick={(day) => setDraft((s) => ({ ...s, d: day }))}
            onNav={navMonth}
          />
        )}
        <div className="bt-sched-drums">
          <Drum value={draft.h} onStep={stepH} />
          <div className="bt-sched-sep">:</div>
          <Drum value={draft.mi} onStep={stepM} />
        </div>
        <button className="btn btn-primary" onClick={save}>Сохранить</button>
      </div>
    </div>
  );
}
