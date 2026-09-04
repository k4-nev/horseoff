/* Баннер про push-уведомления. Всё остальное всплывающее — тост, события
   с действием, новые сообщения — живёт одной очередью в Queue.jsx. */

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
