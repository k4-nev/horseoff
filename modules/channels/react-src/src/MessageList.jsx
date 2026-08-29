import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Attachments from '../../../../core/react-src/src/shared/chat/Attachments.jsx';
import { linkify } from '../../../../core/react-src/src/shared/chat/media.js';
import { QUICK_REACTIONS, fmtTime, layoutMessages } from './lib.js';

/* Лента канала. Строки, а не облака: у Discord сообщение — запись в общем
   потоке с автором и ролью, а не реплика в диалоге. Подряд идущие сообщения
   одного человека сливаются в пачку — аватар и шапка только у первой. */

const Skeleton = () => (
  <div className="ch-skeleton">
    {[['w40', 'w80'], ['w60', 'w40'], ['w80', 'w60']].map((w, i) => (
      <div className="ch-skel-row" key={i}>
        <div className="ch-skel-ava" />
        <div className="ch-skel-lines">
          <div className={'ch-skel-line ' + w[0]} />
          <div className={'ch-skel-line ' + w[1]} />
        </div>
      </div>
    ))}
  </div>
);

/* Подсветка поиска идёт по обычным кускам текста, а не по innerHTML:
   выделять найденное в разметке — это снова собирать HTML из чужого текста. */
function mark(text, q, key) {
  if (!q) return <span key={key}>{text}</span>;
  const parts = [];
  const low = text.toLowerCase();
  let i = 0;
  let at = low.indexOf(q);
  while (at !== -1) {
    if (at > i) parts.push(text.slice(i, at));
    parts.push(<mark className="ch-msg-search-match" key={key + '-' + at}>{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
    at = low.indexOf(q, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return <span key={key}>{parts}</span>;
}

function Text({ value, q, onMention }) {
  return (
    <>
      {linkify(value).map((p, i) => {
        if (p.url) return <a href={p.url} target="_blank" rel="noopener noreferrer" key={i}>{p.t}</a>;
        if (p.mention) return <span className="ch-mention" key={i} onClick={() => onMention && onMention(p.mention)}>{p.t}</span>;
        return mark(p.t, q, i);
      })}
    </>
  );
}

/* Сервер отдаёт «эмодзи → список user_id»: и счётчик, и «моя ли реакция»
   считаются по нему, отдельного поля для этого нет. */
function Reactions({ reactions, msgId, meId, onToggle }) {
  const entries = Object.entries(reactions || {});
  if (!entries.length) return null;
  return (
    <div className="ch-reactions">
      {entries.map(([emoji, users]) => {
        const list = Array.isArray(users) ? users : [];
        return (
          <span
            className={'ch-reaction' + (list.includes(meId) ? ' mine' : '')}
            key={emoji}
            onClick={(e) => { e.stopPropagation(); onToggle(msgId, emoji); }}
          >
            {emoji} {list.length}
          </span>
        );
      })}
    </div>
  );
}

const Row = memo(function Row({
  row, admin, meId, q, active, onCtx, onReply, onForward, onPin, onEdit, onDelete, onReact, onOpenMedia, onJump,
}) {
  const { m, grouped, mine } = row;
  const role = m.role || 'common';
  const t = fmtTime(m.time);

  return (
    <div
      className={'ch-msg' + (grouped ? ' grouped' : '') + (m._fresh ? ' ch-msg-in' : '') + (active ? ' ch-msg-found' : '')}
      data-msgid={m.id}
      onContextMenu={(e) => { e.preventDefault(); onCtx(e, m); }}
    >
      {grouped && <span className="ch-msg-gtime">{t}</span>}
      <div className="ch-msg-ava">
        {m.avatar ? <img src={'data:image/jpeg;base64,' + m.avatar} alt="" /> : (m.from_name || '?').charAt(0).toUpperCase()}
      </div>
      <div className="ch-msg-body">
        <div className="ch-msg-header">
          <span className={'ch-msg-author' + (mine ? ' me' : '')}>{m.from_name || m.from}</span>
          <span className={'role-badge ' + role} style={{ fontSize: 8, padding: '1px 5px' }}>{role.toUpperCase()}</span>
          <span className="ch-msg-time">{t}</span>
        </div>
        {m.reply_to && (
          <div className="ch-msg-reply" onClick={() => onJump(m.reply_to)}>
            <div className="ch-msg-reply-name">{m.reply_name || ''}</div>
            <div className="ch-msg-reply-text">{m.reply_text || ''}</div>
          </div>
        )}
        {m.text ? (
          <div className="ch-msg-text">
            <Text value={m.text} q={q} />
            {m.edited && <span className="ch-msg-edited"> изменено</span>}
          </div>
        ) : null}
        {m.attachments && m.attachments.length ? (
          <div className="ch-att-wrap"><Attachments items={m.attachments} onOpenMedia={onOpenMedia} /></div>
        ) : null}
        <Reactions reactions={m.reactions} msgId={m.id} meId={meId} onToggle={onReact} />
      </div>

      <div className="ch-msg-quick">
        <div className="ch-msg-quick-emojis">
          {QUICK_REACTIONS.map((e) => (
            <button className="ch-msg-qemoji" key={e} onClick={(ev) => { ev.stopPropagation(); onReact(m.id, e); }}>{e}</button>
          ))}
        </div>
        <button className="ch-msg-qbtn" title="Ответить" onClick={(e) => { e.stopPropagation(); onReply(m); }}>
          <span className="ico ico-14 ico-reply" />
        </button>
        <button className="ch-msg-qbtn" title="Переслать" onClick={(e) => { e.stopPropagation(); onForward(m); }}>
          <span className="ico ico-14 ico-forward" />
        </button>
        {admin && (
          <button className="ch-msg-qbtn" title="Закрепить" onClick={(e) => { e.stopPropagation(); onPin(m); }}>
            <span className="ico ico-14 ico-pin" />
          </button>
        )}
        {mine && (
          <button className="ch-msg-qbtn" title="Изменить" onClick={(e) => { e.stopPropagation(); onEdit(m); }}>
            <span className="ico ico-14 ico-pencil" />
          </button>
        )}
        {(mine || admin) && (
          <button className="ch-msg-qbtn" title="Удалить" onClick={(e) => { e.stopPropagation(); onDelete(m); }}>
            <span className="ico ico-14 ico-trash" />
          </button>
        )}
      </div>
    </div>
  );
});

export default function MessageList({
  messages, loading, meId, admin, lastRead, search, activeMatch, scrollRef,
  onLoadMore, onCtx, onReply, onForward, onPin, onEdit, onDelete, onReact, onOpenMedia, onJump,
}) {
  const [showBtn, setShowBtn] = useState(false);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const keep = useRef(null);
  const prevLen = useRef(0);

  const rows = layoutMessages(messages, meId, lastRead);
  const q = (search || '').trim().toLowerCase();

  const atBottom = () => {
    const el = scrollRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (keep.current != null) {
      // Подгрузили старые: держим то, что человек читал
      el.scrollTop = el.scrollHeight - keep.current;
      keep.current = null;
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
  }, [messages, meId, scrollRef]);

  useEffect(() => {
    if (!activeMatch) return;
    const el = scrollRef.current;
    if (!el) return;
    const row = el.querySelector('.ch-msg[data-msgid="' + CSS.escape(activeMatch) + '"]');
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeMatch, scrollRef]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop < 60) {
      keep.current = el.scrollHeight - el.scrollTop;
      onLoadMore();
    }
    const below = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (below < 120) setUnreadBelow(0);
    setShowBtn(below > 120);
  };

  const toBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setUnreadBelow(0);
  };

  return (
    <>
      <div className="ch-messages" ref={scrollRef} onScroll={onScroll}>
        {loading && !messages.length && <Skeleton />}
        {!loading && !messages.length && (
          <div className="ch-empty-chat">
            <span className="ico ico-32 ico-channels" style={{ opacity: 0.12 }} />
            <p>Начните общение</p>
            <p style={{ fontSize: 11, color: 'var(--text-dim)', opacity: 0.7 }}>Напишите первое сообщение в этом канале</p>
          </div>
        )}

        {rows.map((row) => (
          <div style={{ display: 'contents' }} key={row.m.id}>
            {row.newHere && <div className="ch-new-sep"><span>новые сообщения</span></div>}
            <Row
              row={row} admin={admin} meId={meId} q={q} active={activeMatch === row.m.id}
              onCtx={onCtx} onReply={onReply} onForward={onForward} onPin={onPin}
              onEdit={onEdit} onDelete={onDelete} onReact={onReact}
              onOpenMedia={onOpenMedia} onJump={onJump}
            />
          </div>
        ))}
      </div>

      <button className={'ch-scroll-btn' + (showBtn ? ' visible' : '')} onClick={toBottom}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
        {unreadBelow > 0 && <span className="ch-scroll-badge" style={{ display: 'flex' }}>{unreadBelow > 99 ? '99+' : unreadBelow}</span>}
      </button>
    </>
  );
}
