import { useEffect, useRef, useState } from 'react';
import { forWhom, HEART, SEND } from './icons.jsx';
import { sendValentine } from './api.js';

const EMPTY = () => Array.from({ length: 5 }, () => ({ sticker: null, text: '' }));

/* Плитка с картинкой. Мерцание показываем только пока идёт загрузка, и
   проверяем img.complete в ref-колбэке: если картинка уже в кэше, браузер
   не выстрелит onLoad, и скелетон завис бы навсегда; а показывать его на
   кадр для уже готовой картинки — лишний скачок в интерфейсе. */
function Tile({ src, selected, onPick }) {
  const [ready, setReady] = useState(false);
  return (
    <button
      className={'vl-tile' + (selected ? ' vl-sel' : '')}
      aria-label="Выбрать картинку"
      aria-pressed={selected}
      onClick={onPick}
    >
      <span className={'vl-face' + (ready ? '' : ' vl-loading')}>
        <img
          src={src}
          alt=""
          loading="lazy"
          className={ready ? 'vl-ready' : ''}
          ref={(el) => { if (el && el.complete) setReady(true); }}
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
        />
      </span>
    </button>
  );
}

export default function Compose({ contact, stickers, onDone, onCancel, toast }) {
  const [pages, setPages] = useState(EMPTY);
  const [page, setPage] = useState(0);
  const [sending, setSending] = useState(false);
  const [writing, setWriting] = useState(false); // строка подписи в фокусе
  const inputRef = useRef(null);

  useEffect(() => { setPages(EMPTY()); setPage(0); }, [contact]);

  const cur = pages[page];
  const ready = !!(cur.sticker && cur.text.trim());

  const patch = (p) => setPages((prev) => prev.map((x, i) => (i === page ? { ...x, ...p } : x)));

  async function advance() {
    if (page < 4) { setPage(page + 1); return; }
    setSending(true);
    const payload = pages.map((p) => ({ sticker: p.sticker, text: p.text }));
    const result = await sendValentine(contact.id, payload);
    setSending(false);
    if (result && result.status === 'ok') {
      onDone(contact); // подтверждение показывает полёт сердца, а не строка текста
    } else {
      toast((result && result.error) || 'Не удалось отправить — попробуй ещё раз');
    }
  }

  return (
    <>
      <div className="vl-head">
        <div>
          <button className="vl-back" onClick={onCancel}>‹ Назад</button>
          <h1>Признание для {forWhom(contact.display_name || contact.username)}</h1>
          <div className="vl-sub">Собери пять карточек — по одной на каждое «любовь это…»</div>
        </div>
        <div className="vl-mark">{HEART}</div>
      </div>

      <div className="vl-compose">
        <div className="vl-pickwrap">
          <div className="vl-ttl">Выбери картинку</div>
          <div className="vl-hint">Страница {page + 1} из 5</div>
          <div className="vl-grid">
            {stickers.map((src) => (
              <Tile
                key={src}
                src={src}
                selected={cur.sticker === src}
                onPick={() => {
                  patch({ sticker: src });
                  if (!cur.text && inputRef.current) inputRef.current.focus();
                }}
              />
            ))}
          </div>
        </div>

        <div className="vl-stage">
          <div className="vl-slots">
            {pages.map((p, i) => (
              <div key={i} className={'vl-slot' + (i === page ? ' vl-now' : p.sticker ? ' vl-done' : '')}>
                {p.sticker && <img src={p.sticker} alt="" />}
              </div>
            ))}
          </div>

          <div className="vl-card">
            <span className="vl-cap">Любовь это…</span>
            <span className="vl-num">{page + 1} / 5</span>
            <span className="vl-art">
              {cur.sticker
                ? <img key={cur.sticker} src={cur.sticker} alt="" />
                : (
                  <span className="vl-await">
                    <span className="vl-ic">{HEART}</span>
                    Выбери картинку — она встанет сюда
                  </span>
                )}
            </span>
            {/* Подпись пишется прямо на карточке. Каретка скрыта: вместо
                мигающей палки под строкой пульсирует «Пиши», и подсказка
                гаснет, как только появился текст. */}
            <div className="vl-writewrap">
              <input
                ref={inputRef}
                className="vl-write"
                value={cur.text}
                maxLength={60}
                aria-label="Продолжение фразы «Любовь это…»"
                onFocus={() => setWriting(true)}
                onBlur={() => setWriting(false)}
                onChange={(e) => patch({ text: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && ready && !sending) advance(); }}
              />
              {/* Своя подсказка вместо placeholder: лежит внутри строки и
                  пульсирует, пока поле в фокусе и пустое */}
              {!cur.text && (
                <span className={'vl-nudge' + (writing ? ' vl-pulse' : '')} aria-hidden="true">Пиши</span>
              )}
            </div>
          </div>

          <div className="vl-nav">
            {page > 0 && <button className="vl-btn vl-ghost" onClick={() => setPage(page - 1)}>Назад</button>}
            <button className="vl-btn vl-main" disabled={!ready || sending} onClick={advance}>
              {page === 4 && !sending && SEND}
              {sending ? 'Отправляю…' : page === 4 ? 'Отправить' : 'Далее'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
