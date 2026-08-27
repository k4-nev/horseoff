import { useEffect, useState } from 'react';
import Drawer from './Drawer.jsx';

const INTERVALS = [15000, 30000, 45000, 60000];

/* Настройки живут в той же выезжающей справа панели, что «создать»,
   «добавить» и «редактировать»: одна оболочка Drawer, одна раскладка полей
   (.srv-field / .srv-input / .srv-drawer-actions) — отдельная центральная
   модалка на телефоне снова упиралась бы в вьюпорт. */
export default function SettingsModal({ open, onClose, currentInterval, onSetInterval, canManage, apiKeyStatus, onSaveApiKey }) {
  const [key, setKey] = useState('');

  // Оригинал перечитывает ключ с сервера при каждом openSettings() и
  // затирает поле его значением — держим то же поведение при каждом
  // приходе свежего apiKeyStatus (родитель дёргает loadApiKeyStatus на
  // каждое открытие панели).
  useEffect(() => {
    setKey(apiKeyStatus?.value || '');
  }, [apiKeyStatus]);

  return (
    <Drawer
      open={open}
      id="srvSettingsModal"
      title="Настройки"
      subtitle="Обновление статусов и доступ к API провайдера"
      onClose={onClose}
    >
      <div className="srv-field">
        <span>Интервал обновления</span>
        <div className="srv-seg" id="srvIntervalGroup" role="radiogroup" aria-label="Интервал обновления">
          {INTERVALS.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={v === currentInterval}
              className={'srv-seg-btn srv-interval-btn' + (v === currentInterval ? ' on' : '')}
              onClick={() => onSetInterval(v)}
            >
              {v / 1000}s
            </button>
          ))}
        </div>
      </div>

      <div className="srv-field">
        <span>API-ключ VDS · ruvds</span>
        <div className="srv-eye">
          <input
            className="srv-input"
            type="password"
            placeholder="API key..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={!canManage}
          />
          <button className="srv-eye-btn" type="button" onClick={(e) => window.Shell.toggleEye(e.currentTarget)}>
            <span className="ico ico-16 ico-eye-open" />
          </button>
        </div>
        <div className="srv-key-row">
          <span className={'srv-key-state' + (apiKeyStatus?.has_key ? ' on' : '')}>
            {apiKeyStatus ? (apiKeyStatus.has_key ? 'Ключ сохранён' : 'Ключ не задан') : 'Проверка…'}
          </span>
          <button className="btn btn-secondary" type="button" onClick={() => onSaveApiKey(key)} disabled={!canManage}>
            Сохранить
          </button>
        </div>
        {!canManage && <div className="srv-key-note">Менять ключ может только администратор.</div>}
      </div>

      <div className="srv-about">
        Horseoff — легковесная панель мониторинга серверов 3proxy.
        <div className="srv-about-v">
          <span className="app-version">v2.235</span> · Created by k4nev with the support of mysika
        </div>
      </div>
    </Drawer>
  );
}
