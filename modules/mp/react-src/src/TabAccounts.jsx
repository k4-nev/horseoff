import { useMemo, useRef, useState } from 'react';
import { accountRows } from './mock.js';
import {
  Check, Client, Dash, EmptyRow, LStatus, Notch, OrderAddr, OrderItems,
  SearchIcon, lastLogin, statusNotch, stub,
} from './atoms.jsx';

const GRID = {
  display: 'grid',
  gridTemplateColumns: '3px 18px 220px 155px 150px 128px 1fr 74px 74px 90px',
  gap: 16,
  alignItems: 'center',
  padding: '12px 20px 12px 0',
};

const CartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);
const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export default function TabAccounts({ server }) {
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState({});
  /* Лоток въезжает только при смене режима (фильтры ↔ массовое действие),
     а не на каждый чих выбора — иначе он дёргался бы на каждой галке. */
  const prevMode = useRef('filters');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = accountRows(server);
    if (!q) return all;
    return all.filter((r) => [
      r.name, r.phone, r.status,
      r.address ? r.address.short + ' ' + r.address.full : '',
    ].concat(r.items.map((i) => i.art + ' ' + i.kw)).join(' ').toLowerCase().includes(q));
  }, [server, search]);

  const selCount = rows.filter((r) => sel[r.id]).length;
  const allSel = rows.length > 0 && rows.every((r) => sel[r.id]);
  const nextMode = selCount ? 'bulk' : 'filters';
  const animate = prevMode.current !== nextMode;
  prevMode.current = nextMode;

  const toggle = (id) => setSel((p) => ({ ...p, [id]: !p[id] }));
  const toggleAll = () => setSel((p) => {
    const next = { ...p };
    rows.forEach((r) => { next[r.id] = !allSel; });
    return next;
  });

  return (
    <div className="mp-sys" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 1180 }}>
      <div className="mp-lbar">
        <div className="mp-ord-search" style={{ flex: '1 1 300px', maxWidth: 440 }}>
          <SearchIcon />
          <input
            placeholder="Поиск: имя, номер, артикул, статус, адрес"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span style={{ flex: 1 }} />
        <div className={'mp-btn-tray' + (animate ? ' mp-appear' : '')}>
          {selCount ? (
            <div className="mp-ac-selbar">
              Выбрано: <b>{selCount}</b>
              <button className="mp-b mp-b-neutral sm" onClick={stub}>Архивировать</button>
              <button className="mp-b mp-b-neutral sm" onClick={() => setSel({})}>Снять</button>
            </div>
          ) : (
            <>
              <button className="mp-b mp-b-neutral sm" onClick={stub}>Статус ▾</button>
              <button className="mp-b mp-b-neutral sm" onClick={stub}>Пол ▾</button>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="mp-lcard mp-sys" style={{ minWidth: 1180 }}>
          <div className="mp-lcard-head" style={GRID}>
            <span />
            <Check on={allSel} onClick={toggleAll} label="Выбрать все" />
            <span>Клиент</span><span>Последний вход</span><span>Статус</span>
            <span>Товары</span><span>Адрес</span><span>Покупки</span><span>Отзывы</span><span />
          </div>
          {rows.length === 0 && <EmptyRow>Ничего не найдено</EmptyRow>}
          {rows.map((r) => (
            <div className={'mp-lgrow' + (sel[r.id] ? ' sel' : '')} style={GRID} key={r.id}>
              <Notch color={statusNotch(r.status)} />
              <Check on={!!sel[r.id]} onClick={() => toggle(r.id)} label={r.name} />
              <Client name={r.name} phone={r.phone} gender={r.gender} />
              <span className="mp-lcell" style={{ fontSize: 12.5, color: '#76767d' }}>{lastLogin(r.login)}</span>
              <span><LStatus status={r.status} /></span>
              <span>{r.items.length ? <OrderItems items={r.items} /> : <Dash />}</span>
              <span>{r.address ? <OrderAddr address={r.address} /> : <Dash />}</span>
              <span className="mp-ac-cnt"><CartIcon />{r.buys}</span>
              <span className="mp-ac-cnt"><StarIcon />{r.reviews}</span>
              <span className="mp-pk-act">
                <button className="mp-b mp-b-neutral sm" onClick={stub}>Архив</button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
