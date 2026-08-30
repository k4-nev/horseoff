import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import MessageRow from './MessageRow.jsx';
import { fmtTime, layoutMessages } from './lib.js';

/* Лента сообщений. Скролл вверх подгружает старые, кнопка вниз считает
   пропущенное. Раньше всё это жило в onscroll поверх innerHTML: догрузка
   вставлялась через insertAdjacentHTML, и позиция скролла после неё уезжала.
   Здесь позиция удерживается явно. */

const Skeleton = () => {
  const rows = [
    { s: 'theirs', w: [200] }, { s: 'theirs', w: [140] },
    { s: 'mine', w: [170] }, { s: 'mine', w: [220] },
    { s: 'theirs', w: [100, 160] }, { s: 'mine', w: [130] },
  ];
  return (
    <div className="msg-skeleton">
      {rows.map((r, i) => (
        <div className={'msg-skel-row ' + r.s} key={i}>
          {r.s === 'theirs' && <div className="msg-skel-ava" style={i > 0 && rows[i - 1].s === 'theirs' ? { visibility: 'hidden' } : undefined} />}
          <div className="msg-skel-group">
            {r.w.map((w, j) => <div className="msg-skel-bubble" style={{ width: w }} key={j} />)}
          </div>
          {r.s === 'mine' && <div className="msg-skel-ava" style={i < rows.length - 1 && rows[i + 1].s === 'mine' ? { visibility: 'hidden' } : undefined} />}
        </div>
      ))}
    </div>
  );
};

export default function MessageList({
  messages, loading, meId, avaOf, search, highlightId,
  onLoadMore, onCtx, onToggleReaction, onOpenMedia, onJumpTo,
  scrollRef, upload,
}) {
  const [unreadBelow, setUnreadBelow] = useState(0);
  const [showBtn, setShowBtn] = useState(false);
  const keepScroll = useRef(null);
  const prevLen = useRef(0);
  const prevChat = useRef(null);

  const rows = layoutMessages(messages, meId);

  const q = (search || '').trim().toLowerCase();
  const matches = q ? messages.filter((m) => (m.text || '').toLowerCase().includes(q)).map((m) => m.id) : null;
  const hiddenIds = matches ? new Set(messages.filter((m) => !matches.includes(m.id)).map((m) => m.id)) : null;

  const atBottom = useCallback(() => {
    const el = scrollRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }, [scrollRef]);

  /* Поле ввода растёт вместе с набранным текстом (а на телефоне ещё и
     клавиатура, полоска ответа, превью вложений) — лента при этом ужимается,
     и последние сообщения уезжают под ввод: набрал длинное — переписка
     «поднялась», отправил и поле схлопнулось — «опустилась». Браузер
     scrollTop при таком сжатии не трогает, поэтому подтягиваем сами: если до
     изменения размера человек был внизу — остаётся внизу. */
  const pinned = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (!pinned.current) return;
      el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);

  /* Новые сообщения снизу: если человек внизу — доезжаем, иначе копим счёт.
     Догруженные сверху не считаются — у них меняется только длина. */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (keepScroll.current != null) {
      // Подгрузили старые: удерживаем то, что человек читал
      el.scrollTop = el.scrollHeight - keepScroll.current;
      keepScroll.current = null;
      prevLen.current = messages.length;
      return;
    }
    const grew = messages.length > prevLen.current;
    prevLen.current = messages.length;
    if (!grew) return;
    const last = messages[messages.length - 1];
    if (atBottom() || (last && last.from === meId)) {
      el.scrollTop = el.scrollHeight;
      setUnreadBelow(0);
    } else {
      setUnreadBelow((n) => n + 1);
    }
  }, [messages, meId, atBottom, scrollRef]);

  /* Смена чата — всегда вниз, без анимации */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = true;
    el.scrollTop = el.scrollHeight;
    setUnreadBelow(0);
    setShowBtn(false);
  }, [messages.length === 0, scrollRef]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    /* Порог сам по себе выполняется и на короткой переписке: лента чуть выше
       экрана, доехали до низа — scrollTop почти ноль, и модуль идёт за
       предыдущей страницей без повода. Проверяем, что выше правда есть что
       листать. */
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll > 240 && el.scrollTop < 80) {
      keepScroll.current = el.scrollHeight - el.scrollTop;
      onLoadMore();
    }
    const below = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinned.current = below < 24;
    if (below < 120) setUnreadBelow(0);
    setShowBtn(below > 120);
  };

  const toBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setUnreadBelow(0);
  };

  /* Совпадения поиска: прокручиваем к текущему */
  useEffect(() => {
    if (!highlightId) return;
    const el = scrollRef.current;
    if (!el) return;
    const row = el.querySelector('.msg-row[data-msgid="' + CSS.escape(highlightId) + '"]');
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, scrollRef]);

  let lastVisibleDay = null;

  return (
    <>
      <div className="msg-messages" ref={scrollRef} onScroll={onScroll}>
        {loading && messages.length === 0 && <Skeleton />}
        {!loading && messages.length === 0 && !upload && (
          <div style={{ textAlign: 'center', padding: 40, color: '#bbb', fontSize: 13 }}>Начните диалог</div>
        )}

        {rows.map((row) => {
          const hidden = hiddenIds ? hiddenIds.has(row.m.id) : false;
          /* Разделитель дня прячем, если под ним не осталось видимых строк —
             иначе при поиске остаются висеть пустые даты. */
          let daySep = null;
          if (row.day && !hidden) { daySep = row.day; lastVisibleDay = row.day; }
          else if (row.day) { daySep = null; }
          return (
            <div key={row.m.id} style={{ display: 'contents' }}>
              {daySep && <div className="msg-date-sep">{daySep}</div>}
              <MessageRow
                row={row}
                meId={meId}
                avaOf={avaOf}
                timeLabel={fmtTime(row.m.time)}
                hidden={hidden}
                highlighted={highlightId === row.m.id}
                onCtx={onCtx}
                onToggleReaction={onToggleReaction}
                onOpenMedia={onOpenMedia}
                onJumpTo={onJumpTo}
              />
            </div>
          );
        })}

        {upload && (
          <div className="msg-row mine group-end msg-anim">
            <div className="msg-content">
              <div className="msg-upload-card">
                {/* Кольцо процентов вместо иконки: состояние отправки одинаково
                    для фото, документа и голосового, поэтому карточка одна. */}
                <div className="msg-upload-icon">
                  <span className="msg-upload-ring" style={{ '--pct': (upload.pct / 100).toFixed(3) + 'turn' }} />
                  <span className="msg-upload-num">{upload.pct}</span>
                </div>
                <div className="msg-upload-body">
                  <div className="msg-upload-name-row">
                    <span className="msg-upload-name">{upload.name}</span>
                  </div>
                  <div className="msg-upload-meta">отправляется…</div>
                  <div className="msg-upload-track"><div className="msg-upload-fill" style={{ width: upload.pct + '%' }} /></div>
                </div>
                <button className="msg-upload-action" aria-label="Отменить">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <button className={'msg-scroll-btn' + (showBtn ? ' visible' : '')} onClick={toBottom}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
        {unreadBelow > 0 && <span className="msg-scroll-badge" style={{ display: 'flex' }}>{unreadBelow > 99 ? '99+' : unreadBelow}</span>}
      </button>
    </>
  );
}
