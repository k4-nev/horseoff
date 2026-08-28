import { useEffect, useRef } from 'react';
import { buzz } from './lib.js';

/* Вкладка «Лог». Уровни фильтруются на лету, авто-скролл держит хвост.

   Записи хранятся у бота, а не у вкладки: переключение ботов и вкладок не
   должно терять историю, а сервер отдаёт её же после перезагрузки. */

const LEVELS = ['INFO', 'SUCCESS', 'WARN', 'ERROR'];

export default function LogTab({ lines, hidden, setHidden, autoScroll, setAutoScroll, onClear }) {
  const ref = useRef(null);
  const shown = lines.filter((l) => !hidden.includes(l.level));

  useEffect(() => {
    if (autoScroll && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [shown.length, autoScroll]);

  const toggle = (lv) => {
    buzz(10);
    setHidden(hidden.includes(lv) ? hidden.filter((x) => x !== lv) : hidden.concat(lv));
  };

  return (
    <div className="bt-log-wrap">
      <div className="bt-log-toolbar">
        <span className="bt-log-count">{shown.length} записей</span>
        <div className="bt-log-filters">
          {LEVELS.map((lv) => (
            <button
              className={'bt-log-filter ' + lv + (hidden.includes(lv) ? ' off' : '')}
              data-level={lv} key={lv} onClick={() => toggle(lv)}
            >
              {lv}
            </button>
          ))}
        </div>
        <div className="bt-log-actions">
          <label className="bt-autoscroll-toggle">
            <input
              type="checkbox" checked={autoScroll}
              onChange={(e) => { buzz(15); setAutoScroll(e.target.checked); }}
            />
            <span className="bt-toggle-track"><span className="bt-toggle-thumb" /></span>
            <span className="bt-toggle-label">Авто-скролл</span>
          </label>
          <button className="bt-log-clear-btn" onClick={onClear}>Очистить</button>
        </div>
      </div>
      <div className="bt-log-console" ref={ref}>
        {shown.map((l, i) => (
          <div className="bt-log-line" key={i}>
            <span className="bt-log-time">{l.ts}</span>
            <span className={'bt-log-level ' + l.level}>[{l.level}]</span>
            <span className="bt-log-msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
