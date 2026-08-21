import { useState } from 'react';
import { initials, fmtTime, avatarSrc, TRASH, T } from './icons.jsx';

function Skeleton() {
  return <div className="vl-mini"><div className="vl-face vl-skel" style={{ height: '100%' }} /></div>;
}

export default function Album({ received, dimFor, onOpen, onDelete }) {
  // Карточка, которую удаляют, сначала сжимается — и только потом исчезает из списка
  const [going, setGoing] = useState(null);

  if (received === null) {
    return <div className="vl-album">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} />)}</div>;
  }

  if (!received.length) {
    return (
      <div className="vl-empty">
        <div className="vl-ic">💌</div>
        <div className="vl-t">Пока тихо…</div>
        <div className="vl-s">Здесь появятся признания, которые тебе отправят</div>
      </div>
    );
  }

  const sorted = [...received].sort((a, b) => b.time - a.time);

  function handleDelete(id) {
    setGoing(id);
    setTimeout(() => { setGoing(null); onDelete(id); }, T.m);
  }

  return (
    <div className={'vl-album' + (dimFor ? ' vl-dim' : '')} id="vl-album">
      {sorted.map((v) => {
        const first = v.pages && v.pages[0];
        const src = avatarSrc(v.from_avatar);
        const cls = 'vl-mini'
          + (!v.read ? ' vl-new' : '')
          + (going === v.id ? ' vl-going' : '')
          + (dimFor === v.id ? ' vl-origin' : '');
        return (
          <div key={v.id} className={cls} id={'vl-m-' + v.id}>
            {!v.read && <span className="vl-ribbon">новое</span>}
            <button
              className="vl-del"
              title="Удалить признание"
              onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }}
            >
              {TRASH}
            </button>
            {/* Событие нужно наверх: из него берётся стартовый прямоугольник для полёта карточки */}
            <button className="vl-face" onClick={(e) => onOpen(v, e)}>
              <span className="vl-art">{first && first.sticker && <img src={first.sticker} alt="" />}</span>
              <span className="vl-cp">{first ? first.text : ''}</span>
              <span className="vl-who">
                <span className="vl-a">{src ? <img src={src} alt="" /> : initials(v.from_name)}</span>
                {v.from_name} · {fmtTime(v.time)}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
