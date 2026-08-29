import { memo } from 'react';
import Attachments from '../../../../core/react-src/src/shared/chat/Attachments.jsx';
import { clearLive, clearReact, isLive, isReact } from './live.js';
import { linkify } from './lib.js';

/* Одно сообщение. Раньше строка собиралась склейкой HTML вместе с
   oncontextmenu, куда текст сообщения подставлялся через escapeAttr —
   экранирование внутри строки внутри атрибута. Здесь обработчик обычный. */

function Ava({ src, letter, hidden }) {
  return (
    <div className={'msg-row-ava' + (hidden ? ' hidden' : '')}>
      {src ? <img src={'data:image/jpeg;base64,' + src} alt="" /> : letter}
    </div>
  );
}

const Reactions = memo(function Reactions({ reactions, side, meId, avaOf, onToggle, animate, onAnimEnd }) {
  const ids = Object.keys(reactions || {});
  if (!ids.length) return null;
  return (
    <div className="msg-reactions">
      {ids.map((uid) => {
        const emoji = reactions[uid];
        const mine = uid === meId;
        const ava = avaOf(uid);
        return (
          <div
            className={'msg-reaction-capsule ' + (side === 'mine' ? 'on-mine' : 'on-theirs') + (animate ? ' animate' : '')}
            onAnimationEnd={(e) => { onAnimEnd(); e.currentTarget.classList.remove('animate'); }}
            key={uid}
            onClick={mine ? (e) => { e.stopPropagation(); onToggle(emoji); } : undefined}
          >
            <span className="msg-reaction-emoji">{emoji}</span>
            <div className="msg-reaction-ava">
              {ava.src ? <img src={'data:image/jpeg;base64,' + ava.src} alt="" /> : <span>{ava.letter}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
});

function Text({ value }) {
  return (
    <div className="msg-text">
      {linkify(value).map((p, i) => (p.url
        ? <a className="msg-link" href={p.url} target="_blank" rel="noopener noreferrer" key={i}>{p.t}</a>
        : <span key={i}>{p.t}</span>))}
    </div>
  );
}

function MessageRow({
  row, meId, avaOf, timeLabel, hidden, highlighted,
  onCtx, onToggleReaction, onOpenMedia, onJumpTo, rowRef,
}) {
  const { m, isNew, isEnd, mine } = row;
  const side = mine ? 'mine' : 'theirs';
  const ava = avaOf(m.from, m.from_name);
  /* Вход проигрываем только тому, кто в этот момент смотрел в чат */
  const fresh = isLive(m.id);
  const reactFresh = isReact(m.id);

  const ctx = (e) => { e.preventDefault(); e.stopPropagation(); onCtx(e, m); };

  return (
    <div
      ref={rowRef}
      className={'msg-row ' + side + (isEnd ? ' group-end' : '') + (hidden ? ' search-hidden' : '')
        + (highlighted ? ' msg-highlight' : '') + (fresh ? ' msg-anim' : '')}
      data-msgid={m.id}
      onContextMenu={ctx}
      onAnimationEnd={(e) => { clearLive(m.id); e.currentTarget.classList.remove('msg-anim'); }}
    >
      <Ava src={ava.src} letter={ava.letter} hidden={!isNew} />

      <div className="msg-content">
        {!mine && isNew && m.from_name && <div className="msg-bubble-sender">{m.from_name}</div>}

        {m.forwarded_from && (
          <div className="msg-forward-header">
            <span className="ico" style={{ width: 12, height: 12, WebkitMaskImage: 'url(/svg/forward.svg)', maskImage: 'url(/svg/forward.svg)' }} />
            {' Переслано от '}
            <span className="msg-forward-name">{m.forwarded_from.name || ''}</span>
          </div>
        )}

        {m.reply_to && (
          <div className="msg-reply-block" onClick={() => onJumpTo(m.reply_to.msg_id)}>
            <div className="msg-reply-line" />
            <div className="msg-reply-content">
              <div className="msg-reply-name">{m.reply_to.from_name || ''}</div>
              <div className="msg-reply-text">{m.reply_to.text || 'Сообщение удалено'}</div>
            </div>
          </div>
        )}

        <Attachments items={m.attachments} mine={mine} onOpenMedia={onOpenMedia} />

        {m.text ? (
          <div className={'msg-bubble ' + side}>
            <Text value={m.text} />
            <Reactions
              reactions={m.reactions} side={side} meId={meId} avaOf={avaOf}
              animate={reactFresh} onAnimEnd={() => clearReact(m.id)}
              onToggle={(em) => onToggleReaction(m.id, em)}
            />
          </div>
        ) : (m.reactions && Object.keys(m.reactions).length ? (
          <div className="msg-reactions-standalone">
            <Reactions
              reactions={m.reactions} side={side} meId={meId} avaOf={avaOf}
              animate={reactFresh} onAnimEnd={() => clearReact(m.id)}
              onToggle={(em) => onToggleReaction(m.id, em)}
            />
          </div>
        ) : null)}
      </div>

      {isEnd && (
        <div className="msg-group-time">
          {timeLabel}
          {m.edited && <span className="msg-edited"> ред.</span>}
          {mine && <span className="msg-check"> {m.read ? '✓✓' : '✓'}</span>}
        </div>
      )}
    </div>
  );
}

export default memo(MessageRow);
