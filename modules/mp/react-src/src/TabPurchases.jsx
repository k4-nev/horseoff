import { useMemo, useState } from 'react';
import { buyRows } from './mock.js';
import { EmptyRow, SearchIcon, buzz } from './atoms.jsx';
import DayStrip, { Calendar } from './DayStrip.jsx';
import OrderRow from './OrderRow.jsx';
import useOutside from '../../../../core/react-src/src/shared/useOutside.js';

/* Группы идут по осмысленному порядку, а не по алфавиту: сначала то, что
   происходит прямо сейчас, в конце — уже сделанное. */
const GROUPS = [
  { kind: 'in_progress', label: 'В работе', color: '#f5a623', sort: (a, b) => (b.status.step / b.status.total) - (a.status.step / a.status.total) },
  { kind: 'scheduled', label: 'Запланировано', color: '#2f5cf5', sort: (a, b) => (a.status.time || '').localeCompare(b.status.time || '') },
  { kind: 'error', label: 'Ошибка', color: '#d70015', sort: null },
  { kind: 'paid', label: 'Выполнено', color: '#30b46c', sort: null },
];

const PILLS = [
  { key: 'scheduled', label: 'Запланировано', color: '#2f5cf5' },
  { key: 'in_progress', label: 'В работе', color: '#f5a623' },
  { key: 'paid', label: 'Выполнено', color: '#30b46c' },
  { key: 'error', label: 'Ошибка', color: '#d70015' },
];

export default function TabPurchases({ server, day, setDay, onModal }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ scheduled: true, in_progress: true, paid: true, error: true });
  const [calOpen, setCalOpen] = useState(false);
  const calRef = useOutside(calOpen, () => setCalOpen(false));

  const all = useMemo(() => buyRows(server), [server]);

  /* Состояние строки (банк, оплата, теги) живёт здесь: при фильтрации строка
     перерисовывается, и локальный стейт внутри неё бы обнулялся. */
  const [rowState, setRowState] = useState(() => {
    const init = {};
    all.forEach((r) => { init[r.id] = { bank: 'Выбрать банк', skus: r.items.map((i) => i.art), keywords: r.items.map((i) => i.kw) }; });
    return init;
  });
  const patch = (id) => (upd) => setRowState((p) => ({
    ...p,
    [id]: { ...p[id], ...(typeof upd === 'function' ? upd(p[id]) : upd) },
  }));

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = all.filter((r) => filter[r.status.kind] !== false);
    if (q) {
      list = list.filter((r) => [r.name, r.phone, r.address.short, r.address.full]
        .concat(r.items.map((i) => i.art + ' ' + i.kw)).join(' ').toLowerCase().includes(q));
    }
    return list;
  }, [all, search, filter]);

  const counts = { total: all.length, scheduled: 0, in_progress: 0, paid: 0, error: 0 };
  all.forEach((r) => { counts[r.status.kind] += 1; });

  const showQr = (code) => onModal({ kind: 'qr', code: code || '340193' });

  return (
    <>
      <div className="mp-toolbar">
        <DayStrip active={day} onPick={(ds) => setDay(ds)} />
        <div className="mp-cal-anchor" ref={calRef}>
          <button className="mp-ico-btn" onClick={(e) => { e.stopPropagation(); setCalOpen((v) => !v); }} title="Календарь">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
          <div className={'mp-cal-pop' + (calOpen ? ' open' : '')}>
            {calOpen && <Calendar active={day} onPick={(ds) => { setDay(ds); }} />}
          </div>
        </div>
        <button className="mp-b mp-b-neutral" onClick={() => onModal({ kind: 'mass' })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>Массовый залив
        </button>
        <button className="mp-b mp-b-primary" onClick={() => onModal({ kind: 'single' })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>Одиночный выкуп
        </button>
      </div>

      <div className="mp-buy-bar">
        <div>
          <div className="mp-ord-stats">
            <button className="mp-stat-pill static">
              <span className="mp-stat-dot" style={{ background: '#8e8e93' }} />Всего
              <span className="mp-stat-cnt">{counts.total}</span>
            </button>
            {PILLS.map((p) => (
              <button
                key={p.key}
                className={'mp-stat-pill' + (filter[p.key] === false ? ' off' : '')}
                onClick={() => { setFilter((f) => ({ ...f, [p.key]: f[p.key] === false })); buzz(8); }}
              >
                <span className="mp-stat-dot" style={{ background: p.color }} />{p.label}
                <span className="mp-stat-cnt">{counts[p.key]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mp-ord-search">
          <SearchIcon />
          <input placeholder="Поиск: имя, номер, артикул, адрес" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div>
        <div className="mp-ord-wrap">
          <div className="mp-ord-grid mp-ord-head">
            <span>Клиент</span><span>Товары</span><span>Адрес</span><span>Статус</span><span>Действие</span>
          </div>
          {rows.length === 0 && <EmptyRow>Ничего не найдено</EmptyRow>}
          {GROUPS.map((g) => {
            let gr = rows.filter((r) => r.status.kind === g.kind);
            if (!gr.length) return null;
            if (g.sort) gr = gr.slice().sort(g.sort);
            return (
              <div className="mp-ord-gblock" key={g.kind}>
                <div className="mp-ord-group">
                  <span className="gdot" style={{ background: g.color }} />{g.label}
                  <span className="gcount">{gr.length}</span>
                </div>
                {gr.map((r) => (
                  <OrderRow key={r.id} r={r} state={rowState[r.id]} setState={patch(r.id)} onQr={() => showQr()} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
