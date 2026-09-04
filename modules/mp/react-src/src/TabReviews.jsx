import { useState } from 'react';
import { REVIEW_TEXTS } from './mock.js';
import { Client, LStatus, Photo, stub, wbUrls } from './atoms.jsx';

const LIST_GRID = { display: 'grid', gridTemplateColumns: '40px 1fr 140px auto', gap: 16, alignItems: 'center' };
const PLAN_GRID = { display: 'grid', gridTemplateColumns: '200px 34px 108px 82px 1fr 118px auto', gap: 16, alignItems: 'center' };

/* Карточка товара с крупной картинкой: отзыв пишется «по товару», и увидеть
   товар важнее, чем прочитать артикул. */
function ProductCard({ p, i, onCompose }) {
  const [dead, setDead] = useState(false);
  return (
    <div className="mp-rev-card" onClick={onCompose}>
      {!dead && (
        <img
          className="mp-rev-img"
          src={wbUrls(p.article, 'c516x688').image}
          loading="lazy" alt=""
          onError={() => setDead(true)}
        />
      )}
      <div className="mp-rev-top">
        <div className="mp-rev-art">{p.article}</div>
        <div className="mp-rev-kw">{p.keyword}</div>
      </div>
      <div className="mp-rev-bot">
        <div className="mp-rev-avail">Доступно: {p.available}</div>
        <div className="mp-rev-meta">план {2 + i} · архив {5 + i}</div>
      </div>
    </div>
  );
}

export default function TabReviews({ server, onModal }) {
  const [sub, setSub] = useState('products');
  const [view, setView] = useState('grid');

  const compose = () => onModal({ kind: 'composer' });
  const isPlan = sub === 'plan';

  return (
    <>
      <div className="mp-toolbar">
        <span className="mp-subtabs">
          <button className={'mp-subtab' + (sub === 'products' ? ' active' : '')} onClick={() => setSub('products')}>Товары</button>
          <button className={'mp-subtab' + (sub === 'plan' ? ' active' : '')} onClick={() => setSub('plan')}>План</button>
          <button className={'mp-subtab' + (sub === 'archive' ? ' active' : '')} onClick={() => setSub('archive')}>Архив</button>
        </span>
        <span className="mp-spacer" />
        {sub === 'products' && (
          <span className="mp-subtabs">
            <button className={'mp-subtab' + (view === 'grid' ? ' active' : '')} onClick={() => setView('grid')}>Сетка</button>
            <button className={'mp-subtab' + (view === 'list' ? ' active' : '')} onClick={() => setView('list')}>Список</button>
          </span>
        )}
      </div>

      {sub === 'products' ? (
        view === 'grid' ? (
          <div className="mp-rev-grid">
            {server.products.map((p, i) => <ProductCard key={p.id} p={p} i={i} onCompose={compose} />)}
          </div>
        ) : (
          <div className="mp-lwrap mp-sys" style={{ minWidth: 520 }}>
            <div className="mp-lhead" style={LIST_GRID}><span /><span>Товар</span><span /><span /></div>
            {server.products.map((p) => (
              <div className="mp-lrow" style={LIST_GRID} key={p.id}>
                <Photo article={p.article} size="tm" cls="mp-prod-ph" />
                <div className="mp-lcell">
                  <div className="mp-ord-mono" style={{ fontWeight: 500, color: '#44454e', fontSize: 13 }}>{p.article}</div>
                  <div style={{ color: '#8a8a92', fontSize: 12 }}>{p.keyword}</div>
                </div>
                <span className="mp-lstatus green">Доступно: {p.available}</span>
                <span style={{ justifySelf: 'end' }}>
                  <button className="mp-b mp-b-neutral sm" onClick={compose}>Отзыв</button>
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="mp-lwrap mp-sys" style={{ minWidth: 920 }}>
          <div className="mp-lhead" style={PLAN_GRID}>
            <span>Клиент</span><span>Фото</span><span>Товар</span><span>Оценка</span>
            <span>Отзыв</span><span>{isPlan ? 'План' : 'Дата'}</span><span />
          </div>
          {server.accounts.slice(0, 6).map((a, i) => {
            const art = server.products[i % server.products.length].article;
            const text = REVIEW_TEXTS[i % REVIEW_TEXTS.length];
            return (
              <div className="mp-lrow" style={PLAN_GRID} key={a.id}>
                <Client name={a.name} phone={a.phone} gender={a.gender} />
                <Photo article={art} size="tm" cls="mp-prod-ph" />
                <span className="mp-lcell mp-ord-mono" style={{ fontSize: 12.5, color: '#44454e' }}>{art}</span>
                <span style={{ color: '#e6a817', letterSpacing: 1 }}>
                  {'★'.repeat(4 + (i % 2))}{'☆'.repeat(1 - (i % 2))}
                </span>
                <span className="mp-lcell" style={{ fontSize: 12.5, color: '#76767d' }} title={text}>{text}</span>
                <span className="mp-lcell mp-ord-mono" style={{ fontSize: 12.5, color: '#8a8a92' }}>
                  0{(i % 5) + 1}.09 · 1{i}:00
                </span>
                <span style={{ justifySelf: 'end' }}>
                  {isPlan
                    ? <button className="mp-b mp-b-danger sm" onClick={stub}>Отменить</button>
                    : <LStatus status={i % 2 ? 'опубликован' : 'написан'} />}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
