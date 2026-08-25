import { useEffect, useState } from 'react';

const INTERVALS = [15000, 30000, 45000, 60000];

export default function SettingsModal({ open, onClose, currentInterval, onSetInterval, canManage, apiKeyStatus, onSaveApiKey }) {
  const [key, setKey] = useState('');

  // Оригинал перечитывает ключ с сервера при каждом openSettings() и
  // затирает поле его значением — держим то же поведение при каждом
  // приходе свежего apiKeyStatus (родитель дёргает loadApiKeyStatus на
  // каждое открытие модалки).
  useEffect(() => {
    setKey(apiKeyStatus?.value || '');
  }, [apiKeyStatus]);

  return (
    <div className={'modal-overlay' + (open ? ' active' : '')} id="srvSettingsModal">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Настройки</div>
          <button className="modal-close" onClick={onClose}>
            <span className="ico ico-18 ico-close" />
          </button>
        </div>
        <div className="form-label" style={{ marginBottom: 10 }}>Интервал обновления</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }} id="srvIntervalGroup">
          {INTERVALS.map((v) => (
            <div
              key={v}
              className="btn btn-secondary srv-interval-btn"
              style={{
                padding: '6px 12px', fontSize: 12, fontFamily: 'JetBrains Mono,monospace', cursor: 'pointer',
                ...(v === currentInterval ? { background: 'var(--accent-glow)', borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 } : {}),
              }}
              onClick={() => onSetInterval(v)}
            >
              {v / 1000}s
            </div>
          ))}
        </div>
        <div className="form-divider" />
        <div className="form-label" style={{ marginBottom: 10 }}>API VDS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, fontWeight: 600, color: 'var(--accent)', minWidth: 50 }}>ruvds</span>
          <input
            className="form-input"
            placeholder="API key..."
            style={{ flex: 1, minWidth: 120 }}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={!canManage}
          />
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => onSaveApiKey(key)} disabled={!canManage}>
            Сохранить
          </button>
          <span style={{ color: apiKeyStatus?.has_key ? 'var(--accent)' : 'var(--danger)' }}>
            {apiKeyStatus ? (apiKeyStatus.has_key ? '✓' : '✗') : ''}
          </span>
        </div>
        <div className="form-divider" />
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Horseoff — легковесная панель мониторинга серверов 3proxy.
        </div>
        <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: 'var(--accent)', marginTop: 8 }}>
          <span className="app-version">v2.235</span> · Created by k4nev with the support of mysika
        </div>
      </div>
    </div>
  );
}
