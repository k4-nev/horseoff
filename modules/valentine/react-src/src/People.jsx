import { initials, avatarSrc } from './icons.jsx';

function Skeleton() {
  return <div className="vl-person"><div className="vl-face vl-skel" style={{ height: 138 }} /></div>;
}

export default function People({ contacts, onPick }) {
  if (contacts === null) {
    return (
      <>
        <div className="vl-label">Кому отправим</div>
        <div className="vl-people">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} />)}</div>
      </>
    );
  }

  if (!contacts.length) {
    return (
      <div className="vl-empty">
        <div className="vl-ic">💌</div>
        <div className="vl-t">Пока некому писать</div>
        <div className="vl-s">Добавь друзей, чтобы отправить признание</div>
      </div>
    );
  }

  return (
    <>
      <div className="vl-label">Кому отправим</div>
      <div className="vl-people">
        {contacts.map((c) => {
          const name = c.display_name || c.username;
          const src = avatarSrc(c.avatar);
          return (
            <button key={c.id} className="vl-person" onClick={() => onPick(c)}>
              <span className="vl-face">
                <span className="vl-ava">{src ? <img src={src} alt="" /> : initials(name)}</span>
                <span className="vl-txtwrap">
                  <span className="vl-nm">{name}</span>
                  <span className="vl-un">@{c.username}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
