import { useMemo, useState } from 'react';
import { pickupRows } from './mock.js';
import {
  Client, Dropdown, EmptyRow, LStatus, Notch, OrderAddr, OrderItems,
  colorNotch, fmtCode, plural, qrDataUri, stub,
} from './atoms.jsx';

const RECEIVE_GRID = {
  display: 'grid', gridTemplateColumns: '3px 220px 130px 1fr 180px 100px 180px',
  gap: 16, alignItems: 'center', padding: '12px 20px 12px 0',
};
const DELIVERY_GRID = {
  display: 'grid', gridTemplateColumns: '3px 220px 130px 1fr 230px',
  gap: 16, alignItems: 'center', padding: '12px 20px 12px 0',
};

export default function TabPickup({ server, onModal }) {
  const [sub, setSub] = useState('receive');
  const [city, setCity] = useState('all');

  const cities = useMemo(() => [...new Set(server.accounts.map((a) => a.city))], [server]);
  const rows = useMemo(
    () => pickupRows(server).filter((r) => r.tab === sub && (city === 'all' || r.city === city)),
    [server, sub, city]
  );

  /* Выгрузка — HTML-таблица под видом .xls: Excel её открывает, а строгий
     .xlsx с картинками потребовал бы библиотеки ради одной кнопки. */
  const exportXls = () => {
    if (!rows.length) {
      if (window.Shell && window.Shell.toast) window.Shell.toast('Нет аккаунтов для выгрузки');
      return;
    }
    const esc = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const trs = rows.map((r) => `<tr><td>${esc(r.phone)}</td><td>${esc(r.name)}</td><td>${r.items.map((i) => i.art).join(', ')}</td><td>${esc(r.address.full)}</td><td>${fmtCode(r.code)}</td><td><img src="${qrDataUri(r.code)}" width="84" height="84"/></td></tr>`).join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:13px"><thead><tr style="background:#f0f0f3"><th>Номер</th><th>Имя</th><th>Товары</th><th>Адрес</th><th>Код получения</th><th>QR-Код</th></tr></thead><tbody>${trs}</tbody></table></body></html>`;
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const date = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
    const a = document.createElement('a');
    a.href = url;
    a.download = `получение_${city === 'all' ? 'все_города' : city}_${date}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (window.Shell && window.Shell.toast) {
      window.Shell.toast(`Выгружено: ${rows.length} ${plural(rows.length, 'аккаунт', 'аккаунта', 'аккаунтов')}`);
    }
  };

  return (
    <>
      <div className="mp-lbar mp-sys">
        <span className="mp-subtabs">
          <button className={'mp-subtab' + (sub === 'receive' ? ' active' : '')} onClick={() => setSub('receive')}>Получение</button>
          <button className={'mp-subtab' + (sub === 'delivery' ? ' active' : '')} onClick={() => setSub('delivery')}>Доставка</button>
        </span>
        <span style={{ flex: 1 }} />
        <Dropdown
          value={city}
          minWidth={180}
          options={[{ v: 'all', t: 'Все города' }].concat(cities.map((c) => ({ v: c, t: c })))}
          onPick={setCity}
        />
        {sub === 'receive' && (
          <button className="mp-b mp-b-neutral" onClick={exportXls}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>Выгрузить получение
          </button>
        )}
      </div>

      <div className="mp-sys" style={{ marginTop: 14 }}>
        {sub === 'receive' ? (
          <div className="mp-lcard mp-sys" style={{ minWidth: 1120 }}>
            <div className="mp-lcard-head" style={RECEIVE_GRID}>
              <span /><span>Клиент</span><span>Товары</span><span>Адрес</span><span>Статус</span><span>Код</span><span />
            </div>
            {rows.length === 0 && <EmptyRow>Нет аккаунтов для получения</EmptyRow>}
            {rows.map((r) => (
              <div className="mp-lgrow" style={RECEIVE_GRID} key={r.id}>
                <Notch color={colorNotch('amber')} />
                <Client name={r.name} phone={r.phone} gender={r.gender} />
                <div><OrderItems items={r.items} /></div>
                <OrderAddr address={r.address} />
                <LStatus status="Ожидает получения" color="amber" />
                <span className="mp-pk-code mp-ord-mono">{fmtCode(r.code)}</span>
                <span className="mp-pk-act">
                  <button className="mp-b mp-b-primary sm" onClick={() => onModal({ kind: 'qr', code: r.code })}>Получить</button>
                  <button className="mp-b mp-b-neutral sm" onClick={stub}>Найти ПВЗ</button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mp-lcard mp-sys" style={{ minWidth: 840 }}>
            <div className="mp-lcard-head" style={DELIVERY_GRID}>
              <span /><span>Клиент</span><span>Товары</span><span>Адрес</span><span>Статус</span>
            </div>
            {rows.length === 0 && <EmptyRow>Нет отправлений</EmptyRow>}
            {rows.map((r) => (
              <div className="mp-lgrow" style={DELIVERY_GRID} key={r.id}>
                <Notch color={colorNotch(r.dstatus.c)} />
                <Client name={r.name} phone={r.phone} gender={r.gender} />
                <div><OrderItems items={r.items} /></div>
                <OrderAddr address={r.address} />
                <LStatus status={r.dstatus.t} color={r.dstatus.c} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
