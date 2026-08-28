import { useState } from 'react';
import {
  Check, EmptyRow, ExecStatus, Notch, TrashIcon, execNotch, plural,
} from './atoms.jsx';

const POOL_GRID = {
  display: 'grid', gridTemplateColumns: '3px 18px 1fr 230px 120px',
  gap: 16, alignItems: 'center', padding: '12px 20px 12px 0',
};
const ACT_GRID = {
  display: 'grid', gridTemplateColumns: '3px 18px 64px 1fr 200px 180px',
  gap: 16, alignItems: 'center', padding: '12px 20px 12px 0',
};

const Phone = ({ children }) => (
  <span className="mp-lcell mp-ord-mono" style={{ fontSize: 13, color: '#44454e' }}>{children}</span>
);

/* Ползунок полов: в покое кружки показывают Ж/М, при наведении и движении —
   проценты. Это подсказка, а не подпись, поэтому по умолчанию буквы. */
function GenderSlider({ value, onChange }) {
  const [pct, setPct] = useState(false);
  return (
    <div className="mp-cap" onMouseEnter={() => setPct(true)} onMouseLeave={() => setPct(false)}>
      <span className="mp-ava f sm" style={pct ? { fontSize: 10 } : undefined}>{pct ? 100 - value : 'Ж'}</span>
      <input
        type="range" className="mp-slider" min="0" max="100" value={value}
        onChange={(e) => { setPct(true); onChange(+e.target.value); }}
      />
      <span className="mp-ava m sm" style={pct ? { fontSize: 10 } : undefined}>{pct ? value : 'М'}</span>
    </div>
  );
}

export default function TabReg({ reg, setReg }) {
  const [sub, setSub] = useState('pool');
  const [poolSel, setPoolSel] = useState({});
  const [actSel, setActSel] = useState({});
  const [count, setCount] = useState(10);
  const [day, setDay] = useState('today');
  const [gender, setGender] = useState(50);

  const { pool, active } = reg;

  const notify = (text) => {
    if (window.Shell && window.Shell.notify) window.Shell.notify({ text });
  };

  /* Отобранные уезжают из пула в активные: время раскидываем равномерно
     по рабочему дню с 09:00, статус — «ожидает». */
  const schedule = () => {
    let picked = pool.filter((p) => poolSel[p.id]);
    if (!picked.length) picked = pool.slice(0, Math.min(count, pool.length));
    if (!picked.length) { notify('В пуле нет доступных аккаунтов'); return; }
    const n = picked.length;
    const ids = new Set(picked.map((p) => p.id));
    const added = picked.map((p, i) => {
      const mins = 9 * 60 + Math.round((i * (11 * 60)) / n);
      return {
        id: p.id, phone: p.phone,
        time: String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'),
        exec: 'pending',
      };
    });
    setReg({ pool: pool.filter((p) => !ids.has(p.id)), active: active.concat(added) });
    setPoolSel({});
    notify(`Отправлено в регистрацию ${n} ${plural(n, 'аккаунт', 'аккаунта', 'аккаунтов')}`);
  };

  const dropActive = () => {
    const n = active.filter((a) => actSel[a.id]).length;
    if (!n) return;
    setReg({ pool, active: active.filter((a) => !actSel[a.id]) });
    setActSel({});
    notify(`Снято на сегодня ${n} ${plural(n, 'аккаунт', 'аккаунта', 'аккаунтов')}`);
  };

  const poolAllSel = pool.length > 0 && pool.every((a) => poolSel[a.id]);
  const actAllSel = active.length > 0 && active.every((a) => actSel[a.id]);
  const poolCount = pool.filter((a) => poolSel[a.id]).length;
  const actCount = active.filter((a) => actSel[a.id]).length;

  return (
    <>
      <div style={{ marginBottom: 2 }}>
        <span className="mp-subtabs">
          <button className={'mp-subtab' + (sub === 'pool' ? ' active' : '')} onClick={() => setSub('pool')}>Доступны</button>
          <button className={'mp-subtab' + (sub === 'active' ? ' active' : '')} onClick={() => setSub('active')}>Активные</button>
        </span>
      </div>

      {sub === 'pool' ? (
        <>
          <div className="mp-hud">
            <div className="mp-cap"><span className="mp-cap-lbl">Автопланирование</span></div>
            <GenderSlider value={gender} onChange={setGender} />
            <div className="mp-cap">
              <span className="mp-cap-lbl">Кол-во</span>
              <div className="mp-step">
                <button onClick={() => setCount((c) => Math.max(1, c - 1))}>−</button>
                <span className="v mp-mono">{count}</span>
                <button onClick={() => setCount((c) => c + 1)}>+</button>
              </div>
            </div>
            <div className="mp-cap"><span className="mp-cap-lbl">В пуле</span><b className="mp-mono">{pool.length}</b></div>
            <span className="mp-spacer" />
            <button className="mp-b mp-b-primary" disabled={!pool.length} onClick={schedule}>
              {poolCount ? 'Запланировать: ' + poolCount : 'Запланировать'}
            </button>
          </div>

          <div className="mp-lcard mp-sys" style={{ minWidth: 560 }}>
            <div className="mp-lcard-head" style={POOL_GRID}>
              <span />
              <Check on={poolAllSel} onClick={() => {
                const next = {};
                pool.forEach((a) => { next[a.id] = !poolAllSel; });
                setPoolSel(next);
              }} label="Выбрать все" />
              <span>Телефон</span><span>Статус</span><span />
            </div>
            {pool.length === 0 && <EmptyRow>Пул пуст — все отправлены в регистрацию</EmptyRow>}
            {pool.map((a) => (
              <div className={'mp-lgrow' + (poolSel[a.id] ? ' sel' : '')} style={POOL_GRID} key={a.id}>
                <Notch color="#b4b4bb" />
                <Check on={!!poolSel[a.id]} onClick={() => setPoolSel((p) => ({ ...p, [a.id]: !p[a.id] }))} label={a.phone} />
                <Phone>{a.phone}</Phone>
                <ExecStatus exec="pending" label="Готов к регистрации" />
                <span />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mp-lbar" style={{ marginBottom: 2 }}>
            <span className="mp-subtabs">
              <button className={'mp-subtab' + (day === 'today' ? ' active' : '')} onClick={() => setDay('today')}>Сегодня</button>
              <button className={'mp-subtab' + (day === 'tomorrow' ? ' active' : '')} onClick={() => setDay('tomorrow')}>Завтра</button>
            </span>
            <span style={{ flex: 1 }} />
            <button className="mp-wu-bulk" disabled={!actCount} onClick={dropActive}>
              <TrashIcon />{actCount ? 'Выбрано: ' + actCount : 'Снять на сегодня'}
            </button>
          </div>

          <div className="mp-lcard mp-sys" style={{ minWidth: 720 }}>
            <div className="mp-lcard-head" style={ACT_GRID}>
              <span />
              <Check on={actAllSel} onClick={() => {
                const next = {};
                active.forEach((a) => { next[a.id] = !actAllSel; });
                setActSel(next);
              }} label="Выбрать все" />
              <span>Время</span><span>Телефон</span><span>Статус выполнения</span><span />
            </div>
            {active.length === 0 && <EmptyRow>Нет активных регистраций</EmptyRow>}
            {active.map((a) => (
              <div className={'mp-lgrow' + (actSel[a.id] ? ' sel' : '')} style={ACT_GRID} key={a.id}>
                <Notch color={execNotch(a.exec)} />
                <Check on={!!actSel[a.id]} onClick={() => setActSel((p) => ({ ...p, [a.id]: !p[a.id] }))} label={a.phone} />
                <span className="mp-lcell mp-ord-mono" style={{ fontSize: 13, color: '#44454e' }}>{a.time || '—'}</span>
                <Phone>{a.phone}</Phone>
                <ExecStatus exec={a.exec} />
                <span className="mp-pk-act">
                  {a.exec === 'error' && <button className="mp-b mp-b-danger sm" onClick={() => window.Shell && window.Shell.toast('Серверная логика будет реализована позже')}>Повторить</button>}
                  <button className="mp-b mp-b-neutral sm" onClick={() => window.Shell && window.Shell.toast('Серверная логика будет реализована позже')}>Время</button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
