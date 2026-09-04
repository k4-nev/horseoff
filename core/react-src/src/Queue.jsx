import { useEffect, useRef, useState } from 'react';
import Avatar from './shared/Avatar.jsx';

/* Очередь уведомлений у кнопки «Приложения».

   Раньше на это было три независимых механизма: тост в правом нижнем углу,
   облако в левом нижнем и плашка нового сообщения — снова в правом нижнем.
   Плюс плашка голосовой комнаты и сама кнопка. Пять жильцов на два угла.
   Здесь всё сведено в один тип карточки и одну стопку: тип события кодирует
   не место, а цветной рельс слева.

   Стопка растёт вверх от кнопки, свежее — ниже, у самой кнопки. Больше трёх
   карточек не показываем: остальные считаются в шапке стопки и раскрываются
   по нажатию. */

const SHOWN = 3;

const ICON = {
  ok: <path d="M20 6 9 17l-5-5" />,
  error: <path d="M18 6 6 18M6 6l12 12" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>,
  update: <><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></>,
};

function Glyph({ kind }) {
  const d = ICON[kind] || ICON.info;
  return (
    <span className="hq-glyph">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
    </span>
  );
}

function Card({ note, onAct, onClose, onHold }) {
  const ref = useRef(null);
  const seen = useRef(false);

  /* Вылет — один раз на появление карточки. Дальше карточка живёт молча:
     повторный въезд на каждую перерисовку стопки читался бы как дёрганье. */
  useEffect(() => {
    if (seen.current || !ref.current) return;
    seen.current = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current.animate(
      [
        { opacity: 0, transform: 'translate(-14px,16px) scale(.92)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: reduced ? 220 : 380, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }
    );
  }, []);

  const msg = note.kind === 'msg';
  const hasAct = !!(window.Shell._noteFns && window.Shell._noteFns[note.id]);
  return (
    <div
      ref={ref}
      className={'hq-card hq-k-' + note.kind + (msg ? ' msg' : '')}
      onMouseEnter={() => onHold(true)}
      onMouseLeave={() => onHold(false)}
    >
      <span className={'hq-rail ' + note.kind} />
      {msg
        ? <Avatar cls="hq-ava" src={note.avatar} name={note.title} />
        : <Glyph kind={note.kind} />}

      {/* Событие с подписанным действием получает кнопку; у сообщения
          действие одно — открыть чат, и им становится само тело карточки. */}
      {note.label ? (
        <span className="hq-body">
          <span className="hq-title">{note.title}</span>
          {note.text && <span className="hq-text">{note.text}</span>}
          <button className="hq-do" type="button" onClick={onAct}>{note.label}</button>
        </span>
      ) : hasAct ? (
        <button className="hq-body hq-open" type="button" onClick={onAct}>
          <span className="hq-title">{note.title}</span>
          {note.text && <span className="hq-text">{note.text}</span>}
        </button>
      ) : (
        <span className="hq-body">
          <span className="hq-title">{note.title}</span>
          {note.text && <span className="hq-text">{note.text}</span>}
        </span>
      )}

      {!note.persistent && (
        <button className="hq-x" type="button" onClick={onClose} aria-label="Закрыть">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function Queue({ notes, ringOpen, immersive, isMobile }) {
  const [all, setAll] = useState(false);

  useEffect(() => { if (!notes.length) setAll(false); }, [notes.length]);

  if (!notes.length) return null;

  /* Пока раскрыто кольцо, стопка уходит: шары вылетают ровно в то место,
     где она стоит, и карточка ложилась бы поверх них. Ничего не теряется —
     счётчик висит на кнопке, карточки возвращаются на закрытии. */
  if (ringOpen) return null;

  const visible = all ? notes : notes.slice(-SHOWN);
  const hidden = notes.length - visible.length;

  /* На телефоне в чате кнопка спрятана, а низ занят полем ввода —
     стопка переезжает под верхнюю кромку. */
  const cls = 'hq' + (isMobile && immersive ? ' top' : '');

  return (
    <div className={cls} role="log" aria-live="polite">
      {hidden > 0 && (
        <button className="hq-more" type="button" onClick={() => setAll(true)}>
          Ещё {hidden}
        </button>
      )}
      {visible.map((n) => (
        <Card
          key={n.id}
          note={n}
          onAct={() => { window.Shell._noteAction(n.id); if (!n.persistent) window.Shell.dismissNote(n.id); }}
          onClose={() => window.Shell.dismissNote(n.id)}
          onHold={(h) => window.Shell._noteHold(n.id, h)}
        />
      ))}
    </div>
  );
}
