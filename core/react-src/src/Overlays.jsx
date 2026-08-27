/* Всплывающее поверх всего: тост, облака у аватарки, уведомление о новом
   сообщении и баннер про push. Всё это ядро раньше собирало руками через
   document.createElement + innerHTML. Текст здесь выводится как текст —
   это и есть главная причина переезда: в уведомление о сообщении попадает
   чужой ввод. */

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={'toast ' + toast.type} key={toast.id}>
      <span>{toast.type === 'success' ? '✓' : '✗'}</span>
      <span>{toast.msg}</span>
    </div>
  );
}

export function Clouds({ clouds }) {
  if (!clouds.length) return null;
  return (
    <div className="cloud-stack">
      {clouds.map((c) => (
        <div
          key={c.id}
          className="cloud"
          onMouseEnter={() => window.Shell._cloudHold(c.id, true)}
          onMouseLeave={() => window.Shell._cloudHold(c.id, false)}
        >
          <div className="cloud-text">{c.text}</div>
          {c.label && <button className="cloud-btn" onClick={() => window.Shell._cloudAction(c.id)}>{c.label}</button>}
          {!c.persistent && (
            <button className="cloud-close" title="Закрыть" onClick={() => window.Shell.dismissCloud(c.id)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function MsgNote({ note }) {
  if (!note) return null;
  return (
    <div className="msg-notify" key={note.id}>
      <div className="msg-notify-body" onClick={() => window.Shell.goToChat(note.from)}>
        <div className="msg-notify-ava">
          {note.avatar
            ? <img alt="" src={'data:image/jpeg;base64,' + note.avatar} />
            : (note.name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="msg-notify-content">
          <div className="msg-notify-name">{note.name}</div>
          <div className="msg-notify-text">{note.text}</div>
        </div>
      </div>
      <button className="msg-notify-close" onClick={() => window.Shell.dismissNote()} aria-label="Закрыть">×</button>
    </div>
  );
}

export function PushBanner({ show }) {
  if (!show) return null;
  return (
    <div className="ho-push-banner">
      <div className="ho-push-text">Включите уведомления, чтобы не пропустить сообщения</div>
      <button className="btn btn-primary ho-push-on" onClick={() => window.Shell.enablePush()}>Включить</button>
      <button className="ho-push-x" onClick={() => window.Shell.dismissPushBanner()} aria-label="Закрыть">×</button>
    </div>
  );
}
