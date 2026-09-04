/* PIN: экран разблокировки при старте и диалог установки нового кода.
   Клавиатура одна и та же, различие только в обёртке и в том, что диалог
   можно отменить. Раньше оба собирались склейкой innerHTML с инлайновыми
   стилями прямо в строке — теперь разметка здесь, оформление в shell.ui.css. */

const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, '⌫'];

function Pad({ onKey }) {
  return (
    <div className="ho-pin-pad">
      {KEYS.map((k, i) => (k === null
        ? <span key={i} className="ho-pin-gap" />
        : (
          <button key={i} type="button" className="ho-pin-key" onClick={() => onKey(String(k))}>
            {k}
          </button>
        )))}
    </div>
  );
}

function Dots({ len }) {
  return (
    <div className="ho-pin-dots">
      {[0, 1, 2, 3].map((i) => <span key={i} className={'pin-dot' + (i < len ? ' on' : '')} />)}
    </div>
  );
}

export default function PinScreen({ pin }) {
  if (!pin) return null;
  const key = (k) => window.Shell._pinKey(k);

  if (pin.mode === 'set') {
    return (
      <div className="ho-pin-dlg-overlay">
        <div className="ho-pin-dlg" role="dialog" aria-modal="true" aria-label={pin.title}>
          <div className="ho-pin-title">{pin.title}</div>
          <Dots len={pin.len} />
          <Pad onKey={key} />
          <button type="button" className="ho-pin-link" onClick={() => window.Shell._pinCancel()}>Отмена</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ho-pin-screen">
      <div className="ho-pin-title">{pin.title}</div>
      <Dots len={pin.len} />
      <div className="ho-pin-error">{pin.error}</div>
      <Pad onKey={key} />
      <button type="button" className="ho-pin-link" onClick={() => window.Shell.logout()}>Войти с паролем</button>
    </div>
  );
}
