import { useEffect, useRef, useState } from 'react';
import { BANKS } from './mock.js';
import { Client, OrderAddr, OrderItems, fmtSec, stub } from './atoms.jsx';
import useOutside from '../../../../core/react-src/src/shared/useOutside.js';

/* Строка заказа — эталон, с которого списаны остальные таблицы модуля.
   Четыре состояния: в работе, ошибка, оплачено, запланировано. */

const Seg = ({ total, step, err }) => (
  <div className="mp-ord-seg">
    {Array.from({ length: total }, (_, i) => (
      <span key={i} className={i < step ? 'on' : (err && i === step ? 'err' : '')} />
    ))}
  </div>
);

function Status({ r, pay }) {
  const st = r.status;
  if (st.kind === 'in_progress') {
    const txt = pay === 'going' ? 'Выхожу на оплату…'
      : pay === 'paying' ? 'Ожидаю оплату по QR-коду'
        : `${st.label} · ${st.step} из ${st.total}`;
    return <><Seg total={st.total} step={st.step} /><div className="mp-ord-st-txt">{txt}</div></>;
  }
  if (st.kind === 'error') {
    return (
      <>
        <Seg total={st.total} step={st.step} err />
        <div className="mp-ord-st-err">{st.message}</div>
        <div className="mp-ord-st-code">{st.code}</div>
      </>
    );
  }
  if (st.kind === 'paid') {
    return (
      <div className="mp-ord-st-flex">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#30b46c" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><polyline points="8 12 11 15 16 9" />
        </svg>
        <span className="ttl ok">Оплачено</span>
        <span className="meta">{st.paidAt} · {st.bank}</span>
      </div>
    );
  }
  return (
    <div className="mp-ord-st-flex">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#a1a1a6" strokeWidth="2">
        <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
      </svg>
      <span className="ttl">Запланирован на</span>
      <span className="meta mp-ord-mono">{st.date} · {st.time}</span>
    </div>
  );
}

/* Оплата: выбрали банк → «Оплатить» → 1.4 с «выхожу на оплату» → QR и
   обратный отсчёт четыре минуты. Таймер живёт в состоянии строки, поэтому
   уходит вместе с ней и не течёт при размонтировании. */
function Action({ r, state, setState, onQr }) {
  const st = r.status;
  const [bankOpen, setBankOpen] = useState(false);
  const pillRef = useOutside(bankOpen, () => setBankOpen(false));
  const tick = useRef(null);

  useEffect(() => () => { clearTimeout(tick.current); clearInterval(tick.current); }, []);

  const startPay = () => {
    setState({ pay: 'going' });
    tick.current = setTimeout(() => {
      setState({ pay: 'paying', sec: 240 });
      tick.current = setInterval(() => {
        setState((s) => {
          if (s.pay !== 'paying') { clearInterval(tick.current); return s; }
          const sec = Math.max(0, (s.sec || 0) - 1);
          if (sec <= 0) clearInterval(tick.current);
          return { sec };
        });
      }, 1000);
    }, 1400);
  };

  if (st.kind === 'in_progress') {
    if (state.pay === 'going') {
      return (
        <div className="mp-ord-act">
          <span className="mp-ord-timer">{st.timer}</span>
          <div className="mp-ord-pill"><button className="mp-ord-bank locked">{state.bank}</button></div>
        </div>
      );
    }
    if (state.pay === 'paying') {
      return (
        <div className="mp-ord-act">
          <span className="mp-ord-timer red">{fmtSec(state.sec == null ? 240 : state.sec)}</span>
          <div className="mp-ord-pill">
            <button className="mp-ord-bank locked">{state.bank}</button>
            <button className="mp-ord-qr" onClick={onQr}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><line x1="14" y1="14" x2="14" y2="21" />
                <line x1="18" y1="14" x2="21" y2="14" /><line x1="21" y1="18" x2="21" y2="21" />
              </svg>QR-Код
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="mp-ord-act">
        <span className="mp-ord-timer">{st.timer}</span>
        <div className={'mp-ord-pill' + (bankOpen ? ' open' : '')} ref={pillRef}>
          <button className="mp-ord-bank" onClick={(e) => { e.stopPropagation(); setBankOpen((v) => !v); }}>
            <span>{state.bank}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          <button className="mp-ord-pay" disabled={state.bank === 'Выбрать банк'} onClick={startPay}>Оплатить</button>
          <div className="mp-ord-bank-list">
            {BANKS.map((b) => (
              <div
                key={b}
                className={'mp-ord-bank-opt' + (b === state.bank ? ' sel' : '')}
                onClick={(e) => { e.stopPropagation(); setState({ bank: b }); setBankOpen(false); }}
              >
                {b}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (st.kind === 'error') {
    return (
      <div className="mp-ord-act">
        <button className="mp-ord-retry" onClick={stub}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>Повторить
        </button>
      </div>
    );
  }
  if (st.kind === 'paid') return <div className="mp-ord-act" />;
  return (
    <div className="mp-ord-act">
      <button className="mp-ord-sbtn edit" onClick={() => setState({ editing: true })}>Изменить</button>
      <button className="mp-ord-sbtn del" onClick={stub}>Удалить</button>
    </div>
  );
}

/* Поле-теги: Enter добавляет, крестик убирает. У артикулов только цифры. */
function Tags({ values, onAdd, onDel, kind }) {
  const [draft, setDraft] = useState('');
  const isSku = kind === 'skus';
  return (
    <div className="mp-ord-tags">
      {values.map((v, i) => (
        <span className={'mp-ord-chip ' + (isSku ? 'sku' : 'kw')} key={v + i}>
          {v}<b onClick={() => onDel(i)}>✕</b>
        </span>
      ))}
      <input
        placeholder={isSku ? 'Добавить артикул' : 'Добавить слово'}
        value={draft}
        onChange={(e) => setDraft(isSku ? e.target.value.replace(/\D/g, '') : e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const v = draft.trim();
          if (!v) return;
          onAdd(v);
          setDraft('');
        }}
      />
    </div>
  );
}

function EditForm({ r, state, setState }) {
  const patch = (kind, next) => setState({ [kind]: next });
  return (
    <div className="mp-ord-edit">
      <div className="mp-ord-erow1">
        <div>
          <div className="mp-ord-flbl">Артикулы</div>
          <Tags
            kind="skus" values={state.skus}
            onAdd={(v) => patch('skus', state.skus.concat(v))}
            onDel={(i) => patch('skus', state.skus.filter((_, j) => j !== i))}
          />
          <div className="mp-ord-hint">Enter — добавить, только цифры</div>
        </div>
        <div>
          <div className="mp-ord-flbl">Ключевые слова</div>
          <Tags
            kind="keywords" values={state.keywords}
            onAdd={(v) => patch('keywords', state.keywords.concat(v))}
            onDel={(i) => patch('keywords', state.keywords.filter((_, j) => j !== i))}
          />
          <div className="mp-ord-hint">Ищем товар по названию, если артикул неизвестен</div>
        </div>
      </div>
      <div className="mp-ord-erow2">
        <div><div className="mp-ord-flbl">Адрес доставки</div><input className="mp-ord-finput" defaultValue={r.address.short} /></div>
        <div><div className="mp-ord-flbl">Дата</div><input className="mp-ord-finput mono" defaultValue={r.status.date} /></div>
        <div><div className="mp-ord-flbl">Время</div><input className="mp-ord-finput mono" defaultValue={r.status.time} /></div>
      </div>
      <div className="mp-ord-eact">
        <button className="cancel" onClick={() => setState({ editing: false })}>Отмена</button>
        <button className="save" onClick={() => setState({ editing: false })}>Сохранить</button>
      </div>
    </div>
  );
}

export default function OrderRow({ r, state, setState, onQr }) {
  return (
    <div className={'mp-ord-row k-' + r.status.kind + (state.editing ? ' editing' : '')}>
      <div className="mp-ord-grid mp-ord-main">
        <Client name={r.name} phone={r.phone} gender={r.gender} />
        <div className="mp-ord-cell"><OrderItems items={r.items} /></div>
        <div className="mp-ord-cell"><OrderAddr address={r.address} /></div>
        <div className="mp-ord-cell"><Status r={r} pay={state.pay} /></div>
        <div className="mp-ord-cell"><Action r={r} state={state} setState={setState} onQr={onQr} /></div>
      </div>
      {r.status.kind === 'scheduled' && <EditForm r={r} state={state} setState={setState} />}
    </div>
  );
}
