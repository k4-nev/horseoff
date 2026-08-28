import { useEffect, useRef, useState } from 'react';

/* Общие атомы модуля: клиент, фото товара, статусы, пустое состояние.
   Раньше это были функции, склеивающие HTML-строки; здесь — компоненты,
   поэтому имена и адреса больше не проходят через ручное экранирование. */

/* ── Ссылки Wildberries из артикула ────────────────────────────────────
   Имя wb здесь про площадку, а не про модуль: адрес каталога и CDN
   считается по формуле vol/part, без единого запроса. */
export function wbUrls(article, size) {
  const n = parseInt(article, 10) || 0;
  const vol = Math.floor(n / 100000);
  const part = Math.floor(n / 1000);
  return {
    product: `https://www.wildberries.ru/catalog/${n}/detail.aspx`,
    image: `https://sam-basket-cdn-01.geobasket.ru/vol${vol}/part${part}/${n}/images/${size || 'big'}/1.webp`,
  };
}

/* Фото товара — ссылка на карточку. Если картинка не загрузилась, убираем
   её совсем: пустая рамка честнее битого значка. */
export function Photo({ article, size, cls }) {
  const [dead, setDead] = useState(false);
  const u = wbUrls(article, size);
  return (
    <a
      className={(cls || '') + ' wb-photo'}
      href={u.product}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      {!dead && <img src={u.image} loading="lazy" alt="" onError={() => setDead(true)} />}
    </a>
  );
}

export const plural = (n, one, few, many) => {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
  return many;
};

export const GenderAva = ({ g, sm }) => (
  <div className={'mp-ord-ava ' + g + (sm ? ' sm' : '')}>{g === 'f' ? 'Ж' : 'М'}</div>
);

export const Client = ({ name, phone, gender }) => (
  <div className="mp-ord-client">
    <GenderAva g={gender} />
    <div style={{ minWidth: 0 }}>
      <div className="mp-ord-name">{name}</div>
      <div className="mp-ord-phone mp-ord-mono">{phone}</div>
    </div>
  </div>
);

/* ── Статусы ──────────────────────────────────────────────────────────── */
const EXEC = {
  done: ['Выполнен', <><circle cx="12" cy="12" r="9" /><polyline points="8 12 11 15 16 9" /></>],
  running: ['В работе', <><circle cx="12" cy="12" r="9" /><polyline points="12 8 12 12 14.5 13.5" /></>],
  pending: ['Ожидает', <circle cx="12" cy="12" r="9" strokeDasharray="2.6 2.6" />],
  error: ['Ошибка', <><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12" y2="16.01" /></>],
};

export const NOTCH = { done: '#4fae83', running: '#7d9dcf', pending: '#b4b4bb', error: '#dd8880' };
export const execNotch = (exec) => NOTCH[exec] || NOTCH.pending;

export function ExecStatus({ exec, label }) {
  const v = EXEC[exec] || EXEC.pending;
  return (
    <div className={'mp-exec ' + exec}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{v[1]}</svg>
      <span>{label || v[0]}</span>
    </div>
  );
}

const STATUS_COLOR = {
  'активен': 'green', 'прошел': 'green', 'прогретый': 'green', 'получен': 'blue',
  'доставка': 'blue', 'опубликован': 'green', 'ожидает в пвз': 'amber',
  'ожидает на пвз': 'amber', 'проверка': 'amber', 'новый': 'grey', 'написан': 'grey',
  'не прошел': 'red', 'ошибка': 'red', 'готов к регистрации': 'grey', 'запланирован': 'blue',
};
const COLOR_HEX = { green: '#4fae83', blue: '#7d9dcf', amber: '#d0a24a', grey: '#b4b4bb', red: '#dd8880' };

export const statusColor = (s) => STATUS_COLOR[String(s).toLowerCase()] || 'grey';
export const statusNotch = (s) => COLOR_HEX[statusColor(s)];
export const colorNotch = (c) => COLOR_HEX[c] || COLOR_HEX.grey;

export const LStatus = ({ status, color }) => (
  <span className={'mp-lstatus ' + (color || statusColor(status))}>{status}</span>
);

export const Notch = ({ color }) => <span className="mp-wu-notch" style={{ background: color }} />;

export const Check = ({ on, onClick, label }) => (
  <button className={'mp-check' + (on ? ' on' : '')} onClick={onClick} aria-label={label} />
);

export function lastLogin(l) {
  if (!l) return null;
  if (l.d === 0) return 'Сегодня в ' + (l.t || '—');
  if (l.d === 1) return 'вчера';
  return l.d + ' ' + plural(l.d, 'день', 'дня', 'дней') + ' назад';
}

export const Dash = () => <span className="mp-ac-dash">—</span>;

export const fmtCode = (c) => String(c).slice(0, 3) + ' ' + String(c).slice(3);
export const fmtSec = (sec) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');

/* QR-плейсхолдер: детерминированный узор из кода. Настоящий QR появится
   вместе с бэкендом — сейчас рисовать нечего, но место должно быть занято. */
export function qrDataUri(code) {
  const n = 21;
  const cell = 4;
  const sz = n * cell;
  let seed = 5381;
  for (const ch of String(code)) seed = ((seed * 33) ^ ch.charCodeAt(0)) >>> 0;
  const bit = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 17) & 1; };
  let r = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const corner = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      if (!corner && bit()) r += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`;
    }
  }
  const f = (ox, oy) => `<rect x="${ox}" y="${oy}" width="${7 * cell}" height="${7 * cell}" fill="none" stroke="#000" stroke-width="${cell}"/><rect x="${ox + 2 * cell}" y="${oy + 2 * cell}" width="${3 * cell}" height="${3 * cell}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}"><rect width="${sz}" height="${sz}" fill="#fff"/><g fill="#000">${r}</g>${f(0, 0)}${f((n - 7) * cell, 0)}${f(0, (n - 7) * cell)}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

/* ── Поповеры товаров и адреса ────────────────────────────────────────
   Открытый поповер закрывается кликом мимо и по Escape. */
function useOutside(open, close) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

export function OrderItems({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  const n = items.length;
  const show = Math.min(3, n);
  const more = n - show;
  return (
    <div className="mp-ord-items" ref={ref} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
      {items.slice(0, show).map((it) => <Photo key={it.id} article={it.art} size="tm" cls="mp-ord-photo" />)}
      {more > 0
        ? <div className="mp-ord-more">+{more}</div>
        : <button className="mp-ord-dots" aria-label="Товары аккаунта">···</button>}
      <div className={'mp-ord-pop mp-ord-pop-items' + (open ? ' open' : '')}>
        <div className="mp-ord-pop-title">Товары аккаунта</div>
        {items.map((it) => (
          <div className="mp-ord-pop-row" key={it.id}>
            <Photo article={it.art} size="tm" cls="mp-ord-pop-ph" />
            <div>
              <div className="mp-ord-pop-art mp-ord-mono">{it.art}</div>
              <div className="mp-ord-pop-kw">{it.kw}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrderAddr({ address }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return (
    <div className="mp-ord-addr" ref={ref} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
      </svg>
      <span className="mp-ord-addr-txt">{address.short}</span>
      <div className={'mp-ord-pop mp-ord-pop-addr' + (open ? ' open' : '')}>
        <div className="lbl">Адрес доставки</div>
        <div className="txt">{address.full}</div>
      </div>
    </div>
  );
}

/* ── Свой выпадающий список вместо нативного select ───────────────────
   Список позиционируется fixed, поэтому закрывается ещё и на скролле. */
export function Dropdown({ value, options, onPick, width, minWidth }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);
  const ref = useOutside(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  const toggle = (e) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = btnRef.current.getBoundingClientRect();
    const w = Math.max(r.width, 150);
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
    setPos({ left: Math.max(8, left), top: r.bottom + 5, width: w });
    setOpen(true);
  };

  const style = width === 'full' ? { display: 'block', width: '100%' } : (width ? { width } : (minWidth ? { minWidth } : undefined));
  const label = options.find((o) => (o.v ?? o) === value);

  return (
    <div className={'mp-dd' + (open ? ' open' : '')} style={style} ref={ref}>
      <button className="mp-dd-btn" ref={btnRef} onClick={toggle} type="button">
        <span>{label ? (label.t ?? label) : value}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      <div className="mp-dd-list" style={pos ? { left: pos.left, top: pos.top, width: pos.width } : undefined}>
        {options.map((o) => {
          const v = o.v ?? o;
          const t = o.t ?? o;
          return (
            <div
              key={v}
              className={'mp-dd-opt' + (v === value ? ' sel' : '')}
              onClick={(e) => { e.stopPropagation(); onPick(v); setOpen(false); }}
            >
              {t}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Empty = ({ title, sub, action }) => (
  <div className="mp-empty">
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
    <div className="mp-empty-title">{title}</div>
    {sub && <div>{sub}</div>}
    {action && <div style={{ marginTop: 6 }}>{action}</div>}
  </div>
);

export const EmptyRow = ({ children }) => (
  <div className="mp-empty"><div className="mp-empty-title" style={{ color: '#54545c' }}>{children}</div></div>
);

export const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

/* «Серверная логика будет позже» — единая заглушка для кнопок без бэкенда */
export function stub() {
  if (window.Shell && window.Shell.toast) window.Shell.toast('Серверная логика будет реализована позже');
  if (navigator.vibrate) navigator.vibrate(10);
}

export function buzz(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}
