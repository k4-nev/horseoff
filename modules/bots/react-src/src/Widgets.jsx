import { useEffect, useRef, useState } from 'react';
import Schedule from './Schedule.jsx';
import { buzz, relTime, toast } from './lib.js';
import Switch from './Toggle.jsx';
import SharedSelect from '../../../../core/react-src/src/shared/Select.jsx';

/* Карточки контролов. Состав приходит из манифеста бота, поэтому здесь
   ровно один компонент на тип и ни одной сборки HTML строками: значения
   с бота (ctrl_update) прилетают в props и перерисовывают карточку сами.

   Раньше живое обновление лезло в DOM по id (btCtrl_<id>) и разбирало
   элемент по tagName, чтобы понять, что именно обновлять. Любое изменение
   разметки ломало обновления молча. */

const BTN_STYLE = { primary: 'btn btn-primary', danger: 'btn btn-danger', secondary: 'btn btn-secondary' };

function Label({ children }) {
  return children ? <div className="bt-ctrl-label">{children}</div> : null;
}

/* ── Кнопки ───────────────────────────────────────────────────────────── */
function Buttons({ ctrl, send }) {
  const disabled = Array.isArray(ctrl.disabled) ? ctrl.disabled : [];
  const [busy, setBusy] = useState(null);
  return (
    <>
      <Label>{ctrl.label}</Label>
      <div className="bt-btn-group">
        {(ctrl.buttons || []).map((b) => {
          const off = disabled.includes(b.action) || busy === b.action;
          return (
            <button
              key={b.action}
              className={BTN_STYLE[b.style] || BTN_STYLE.secondary}
              data-action={b.action}
              disabled={off}
              style={off ? { opacity: 0.4 } : undefined}
              onClick={() => {
                setBusy(b.action);
                setTimeout(() => setBusy(null), 600);
                send(ctrl.id || b.action, b.action, null);
              }}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ── Ввод с кнопкой «Применить» ───────────────────────────────────────── */
function TextInput({ ctrl, send, area }) {
  const [val, setVal] = useState(ctrl.value || '');
  const [sent, setSent] = useState(false);
  const dirty = useRef(false);
  // Значение с бота подхватываем, пока человек не начал править сам
  useEffect(() => { if (!dirty.current) setVal(ctrl.value || ''); }, [ctrl.value]);

  const apply = () => {
    dirty.current = false;
    setSent(true);
    setTimeout(() => setSent(false), 1200);
    buzz(20);
    send(ctrl.id, 'set', val);
  };
  const onChange = (e) => { dirty.current = true; setVal(e.target.value); };

  return (
    <>
      <Label>{ctrl.label}</Label>
      {area ? (
        <>
          <textarea className="bt-textarea" placeholder={ctrl.placeholder || ''} value={val} onChange={onChange} />
          <button className="btn btn-secondary" style={{ alignSelf: 'flex-end', marginTop: 6 }} onClick={apply}>
            {sent ? '✓' : (ctrl.apply_label || 'Сохранить')}
          </button>
        </>
      ) : (
        <div className="bt-input-row">
          <input className="bt-input" placeholder={ctrl.placeholder || ''} value={val} onChange={onChange} />
          <button className="btn btn-secondary" style={sent ? { color: '#3bc96b' } : undefined} onClick={apply}>
            {sent ? '✓' : (ctrl.apply_label || 'Применить')}
          </button>
        </div>
      )}
    </>
  );
}

/* ── Счётчик ──────────────────────────────────────────────────────────── */
function Stepper({ ctrl, send }) {
  const min = ctrl.min || 1;
  const max = ctrl.max || 99;
  const [val, setVal] = useState(ctrl.value || min);
  const [pop, setPop] = useState(false);
  useEffect(() => { if (ctrl.value !== undefined) setVal(ctrl.value); }, [ctrl.value]);

  const step = (d) => {
    const next = Math.max(min, Math.min(max, val + d));
    if (next === val) return;
    setVal(next);
    setPop(true);
    setTimeout(() => setPop(false), 120);
    buzz(12);
    send(ctrl.id, 'set', next);
  };
  return (
    <>
      <Label>{ctrl.label}</Label>
      <div className="bt-stepper">
        <button className="bt-stepper-btn" onClick={() => step(-1)}>−</button>
        <div className="bt-stepper-val" style={pop ? { transform: 'scale(1.25)' } : undefined}>{val}</div>
        <button className="bt-stepper-btn" onClick={() => step(1)}>+</button>
      </div>
    </>
  );
}

/* ── Ползунок ─────────────────────────────────────────────────────────── */
function Slider({ ctrl, send }) {
  const min = ctrl.min || 0;
  const max = ctrl.max || 100;
  const [val, setVal] = useState(ctrl.value !== undefined ? ctrl.value : min);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current && ctrl.value !== undefined) setVal(ctrl.value); }, [ctrl.value]);

  return (
    <>
      <Label>{ctrl.label}</Label>
      <div className="bt-slider-header">
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{min}</span>
        <span className="bt-slider-val">{val}</span>
      </div>
      <input
        type="range" className="bt-slider" min={min} max={max} value={val}
        onInput={(e) => { dragging.current = true; setVal(Number(e.target.value)); }}
        onChange={(e) => { dragging.current = false; send(ctrl.id, 'set', e.target.value); }}
      />
      <div className="bt-slider-minmax"><span>{min}</span><span>{max}</span></div>
    </>
  );
}

/* ── Переключатель ────────────────────────────────────────────────────── */
function Toggle({ ctrl, send }) {
  const [on, setOn] = useState(!!ctrl.value);
  useEffect(() => { if (ctrl.value !== undefined) setOn(!!ctrl.value); }, [ctrl.value]);
  return (
    <Switch
      on={on} label={ctrl.label}
      onChange={(next) => { setOn(next); send(ctrl.id, 'set', next); }}
    />
  );
}

/* ── Выпадающий список ──────────────────────────────────────────────────
   Оформление своё, поведение общее: клавиатура и роль listbox достались
   бесплатно — раньше их здесь не было вовсе. */
const BT_SELECT = {
  wrap: 'bt-cs', btn: 'bt-cs-trigger', val: 'bt-cs-label',
  menu: 'bt-cs-drop', item: 'bt-cs-opt', on: 'selected',
};
const BT_CARET = (
  <svg className="bt-cs-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
);

function Select({ ctrl, send }) {
  const options = ctrl.options || [];
  const [value, setValue] = useState(ctrl.value);
  useEffect(() => { if (ctrl.value !== undefined) setValue(ctrl.value); }, [ctrl.value]);

  return (
    <>
      <Label>{ctrl.label}</Label>
      <SharedSelect
        value={value === undefined && options[0] ? options[0].value : value}
        options={options}
        classes={BT_SELECT}
        caret={BT_CARET}
        flip={false}
        onChange={(v) => { setValue(v); send(ctrl.id, 'set', v); }}
      />
    </>
  );
}

/* ── Прогресс ─────────────────────────────────────────────────────────── */
function Progress({ ctrl }) {
  const v = ctrl.value || 0;
  return (
    <>
      <Label>{ctrl.label}</Label>
      <div className="bt-progress-header">
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{ctrl.total || ''}</span>
        <span className="bt-progress-pct">{v}%</span>
      </div>
      <div className="bt-progress-track"><div className="bt-progress-fill" style={{ width: v + '%' }} /></div>
    </>
  );
}

/* ── Загрузка списка ──────────────────────────────────────────────────── */
function FileList({ ctrl, send }) {
  const [status, setStatus] = useState(ctrl.list_count ? ctrl.list_count + ' строк загружено' : '');
  const [busy, setBusy] = useState(false);
  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      setBusy(true);
      buzz(20);
      const text = await file.text();
      setStatus(text.split('\n').filter((l) => l.trim()).length + ' строк загружено');
      setBusy(false);
      send(ctrl.id, 'file', text);
    };
    input.click();
  };
  return (
    <>
      <Label>{ctrl.label}</Label>
      <button className="bt-filelist-btn" onClick={pick}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /></svg>
        {busy ? 'Загрузка…' : 'Загрузить список'}
      </button>
      <div className="bt-filelist-status">{status}</div>
    </>
  );
}

/* ── Показатель ───────────────────────────────────────────────────────── */
function Stat({ ctrl }) {
  const s = ctrl._item || ctrl;
  const val = ctrl.value !== undefined ? ctrl.value : (ctrl.text !== undefined ? ctrl.text : s.value);
  return (
    <>
      <div className="bt-stat-val">{String(val === undefined || val === null || val === '' ? '—' : val)}</div>
      <div className="bt-stat-label">{s.label || ''}</div>
      {s.delta ? (
        <div className={'bt-stat-delta ' + (s.trend || 'up')}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points={s.trend === 'down' ? '6 9 12 15 18 9' : '18 15 12 9 6 15'} />
          </svg>
          {s.delta}
        </div>
      ) : null}
    </>
  );
}

/* ── Прочее ───────────────────────────────────────────────────────────── */
function Badges({ ctrl }) {
  return (
    <>
      <Label>{ctrl.label || 'Статус'}</Label>
      <div className="bt-badges-row">
        {(ctrl.items || []).map((b, i) => (
          <span className={'bt-badge-status ' + (b.style || '')} key={i}>{b.label}</span>
        ))}
      </div>
    </>
  );
}

function TextLabel({ ctrl }) {
  return (
    <div className="bt-label-inner">
      <Label>{ctrl.label}</Label>
      <div className={'bt-label-ctrl ' + (ctrl.style || '')}>{ctrl.text || ctrl.value || ''}</div>
    </div>
  );
}

function ImageCtrl({ ctrl }) {
  const src = ctrl.value || ctrl.src;
  return (
    <>
      <Label>{ctrl.label}</Label>
      <div className="bt-image-ctrl">
        {src ? (
          <>
            <img src={src} alt={ctrl.label || ''} />
            <span className="bt-image-ts">{ctrl.ts ? relTime(ctrl.ts) : 'сейчас'}</span>
          </>
        ) : (
          <div className="bt-image-empty">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            Нет изображения
          </div>
        )}
      </div>
    </>
  );
}

function Code({ ctrl }) {
  const text = ctrl.value || '';
  return (
    <>
      <Label>{ctrl.label}</Label>
      <div style={{ position: 'relative' }}>
        <pre className="bt-code-ctrl">{text}</pre>
        <button
          className="bt-code-copy"
          onClick={() => {
            if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { toast('Скопировано'); buzz(15); });
          }}
        >
          Копировать
        </button>
      </div>
    </>
  );
}

function Table({ ctrl, locked, onClear, onEdit }) {
  const cols = ctrl.columns || [];
  const rows = ctrl.rows || [];
  const editable = Array.isArray(ctrl.edit_cols) && ctrl.edit_cols.length && ctrl.id;
  return (
    <>
      <div className="bt-table-head">
        {ctrl.label ? <div className="bt-ctrl-label">{ctrl.label}</div> : <span />}
        {editable && (
          <div className="bt-table-tools">
            <button className="bt-table-tool danger" disabled={locked} onClick={() => onClear(ctrl)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              Стереть
            </button>
            <button className="bt-table-tool" disabled={locked} onClick={() => onEdit(ctrl)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Редактировать
            </button>
          </div>
        )}
      </div>
      <div className="bt-table-wrap">
        <table className="bt-table">
          <thead>
            <tr>{cols.map((c, i) => <th key={i}>{c.label || c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {cols.map((c, ci) => {
                  const key = c.key || c;
                  const cls = r._style && r._style[key] ? r._style[key] : undefined;
                  return <td className={cls} key={ci}>{r[key] !== undefined ? String(r[key]) : ''}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Карточка целиком ─────────────────────────────────────────────────── */
const CLS = {
  buttons: 'bt-ctrl--buttons', input: 'bt-ctrl--input', textarea: 'bt-ctrl--textarea',
  stepper: 'bt-ctrl--stepper', slider: 'bt-ctrl--slider', toggle: 'bt-ctrl--toggle',
  select: 'bt-ctrl--select', progress: 'bt-ctrl--progress', filelist: 'bt-ctrl--filelist',
  stat: 'bt-ctrl--stat', badges: 'bt-ctrl--badges', label: 'bt-ctrl--label',
  image: 'bt-ctrl--image', code: 'bt-ctrl--code', table: 'bt-ctrl--table',
  schedule_time: 'bt-ctrl--sched', schedule_datetime: 'bt-ctrl--sched',
};

export default function Widget({ ctrl, send, locked, onTableClear, onTableEdit, style, children }) {
  const t = ctrl.type;
  const cls = CLS[t];
  if (!cls) return null;

  let inner = null;
  if (t === 'buttons') inner = <Buttons ctrl={ctrl} send={send} />;
  else if (t === 'input') inner = <TextInput ctrl={ctrl} send={send} />;
  else if (t === 'textarea') inner = <TextInput ctrl={ctrl} send={send} area />;
  else if (t === 'stepper') inner = <Stepper ctrl={ctrl} send={send} />;
  else if (t === 'slider') inner = <Slider ctrl={ctrl} send={send} />;
  else if (t === 'toggle') inner = <Toggle ctrl={ctrl} send={send} />;
  else if (t === 'select') inner = <Select ctrl={ctrl} send={send} />;
  else if (t === 'progress') inner = <Progress ctrl={ctrl} />;
  else if (t === 'filelist') inner = <FileList ctrl={ctrl} send={send} />;
  else if (t === 'stat') inner = <Stat ctrl={ctrl} />;
  else if (t === 'badges') inner = <Badges ctrl={ctrl} />;
  else if (t === 'label') inner = <TextLabel ctrl={ctrl} />;
  else if (t === 'image') inner = <ImageCtrl ctrl={ctrl} />;
  else if (t === 'code') inner = <Code ctrl={ctrl} />;
  else if (t === 'table') inner = <Table ctrl={ctrl} locked={locked} onClear={onTableClear} onEdit={onTableEdit} />;
  else if (t === 'schedule_time' || t === 'schedule_datetime') inner = <Schedule ctrl={ctrl} send={send} />;

  /* Сетку вешаем на саму карточку, а не на обёртку: обёртка развела бы
     размеры и оформление по разным узлам, и .bt-ctrl-card перестала бы
     занимать выделенную ей клетку. */
  return (
    <div className={'bt-ctrl-card ' + cls} data-ctrl-id={ctrl.id} data-ctrl-type={t} style={style}>
      {inner}
      {children}
    </div>
  );
}
