function copyRow(e) {
  const val = e.currentTarget.querySelector('.srv-result-value');
  if (!val) return;
  const text = val.textContent;
  // .catch: writeText() rejects (permission denied / insecure context / unfocused
  // document) in some browser states — оригинал этого не ловил, что оставляло
  // unhandled promise rejection в консоли даже при рабочем fallback-тосте ниже.
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  else {
    const t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  window.Shell.toast('Скопировано');
  e.currentTarget.style.borderColor = 'var(--accent)';
  setTimeout(() => { e.currentTarget.style.borderColor = ''; }, 1000);
}

export default function ResultModal({ open, result, onClose }) {
  return (
    <div className={'modal-overlay' + (open ? ' active' : '')} id="srvResultModal">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Сервер готов</div>
          <button className="modal-close" onClick={onClose}>
            <span className="ico ico-18 ico-close" />
          </button>
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 12 }}>Прокси настроены и работают:</div>
        <div className="srv-result-row" onClick={copyRow}>
          <div className="srv-result-label">HTTP</div>
          <div className="srv-result-value">{(result && result.http_proxy) || '—'}</div>
        </div>
        <div className="srv-result-row" onClick={copyRow}>
          <div className="srv-result-label">SOCKS5</div>
          <div className="srv-result-value">{(result && result.socks_proxy) || '—'}</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>Нажмите на строку для копирования</div>
      </div>
    </div>
  );
}
