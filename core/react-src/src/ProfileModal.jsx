import { useEffect, useRef, useState } from 'react';
import Avatar from './shared/Avatar.jsx';

/* Модалка профиля: аккаунт, безопасность, сессии. Данные приходят из ядра
   (Shell._uiState.profile / .sessions), действия уходят обратно в ядро.
   Вкладки — локальное состояние: ядру о них знать незачем. */

const TABS = [
  { id: 'account', name: 'Аккаунт' },
  { id: 'security', name: 'Безопасность' },
  { id: 'sessions', name: 'Сессии' },
];

/* Разбор user-agent для списка сессий — перенесено из ядра как есть. */
function deviceName(ua) {
  if (!ua) return '💻 Устройство';
  if (/iPhone/.test(ua)) {
    const m = ua.match(/iPhone OS ([\d_]+)/);
    return '📱 iPhone' + (m ? ' ' + m[1].replace(/_/g, '.') : '');
  }
  if (/iPad/.test(ua)) return '📱 iPad';
  if (/Android/.test(ua)) {
    const m = ua.match(/Android [^;]+;\s*([^)]+)/);
    let model = m ? m[1].trim() : 'Android';
    if (model.length > 28) model = model.slice(0, 28) + '…';
    return '📱 ' + model;
  }
  if (/Windows NT 10/.test(ua)) return '💻 Windows 10/11';
  if (/Windows NT 6/.test(ua)) return '💻 Windows';
  if (/Macintosh/.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/);
    return '💻 macOS' + (m ? ' ' + m[1].replace(/_/g, '.') : '');
  }
  if (/Linux/.test(ua)) return '💻 Linux';
  return '💻 Устройство';
}

function relTime(ts) {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин. назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч. назад';
  return Math.floor(diff / 86400) + ' дн. назад';
}

function PassField({ label, value, onChange }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="form-group">
      <label className="prof-section-lbl">{label}</label>
      <div className="input-eye">
        <input
          className="form-input prof-pass-input"
          type={shown ? 'text' : 'password'}
          placeholder="••••••••"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button className="eye-btn" type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Скрыть пароль' : 'Показать пароль'}>
          <span className={'ico ico-16 ' + (shown ? 'ico-eye-closed' : 'ico-eye-open')} />
        </button>
      </div>
    </div>
  );
}

export default function ProfileModal({ profile, sessions, pinEnabled, theme }) {
  const darkOpen = !!(window.Shell && window.Shell.canPreview && window.Shell.canPreview());
  const [tab, setTab] = useState('account');
  const [name, setName] = useState('');
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const fileRef = useRef(null);
  const open = !!profile;

  /* Поля перезаполняются на каждое открытие: пароль в них оставаться не должен,
     а имя должно показывать то, что сейчас на сервере. */
  useEffect(() => {
    if (!open) return;
    setName(profile.display_name || '');
    setOldPass('');
    setNewPass('');
    setTab('account');
  }, [open, profile && profile.username]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') window.Shell.closeProfile(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const shown = profile.display_name || profile.username;
  const count = sessions ? sessions.length : null;

  return (
    <div
      className="modal-overlay active"
      onMouseDown={(e) => { if (e.target === e.currentTarget) window.Shell.closeProfile(); }}
    >
      <div className="modal prof-modal" role="dialog" aria-modal="true" aria-label="Профиль">
        <div className="modal-header">
          <div className="modal-title">Профиль</div>
          <button className="modal-close" onClick={() => window.Shell.closeProfile()} aria-label="Закрыть">
            <span className="ico ico-18 ico-close" />
          </button>
        </div>

        <div className="prof-identity">
          <Avatar
            cls="profile-avatar" imgCls="profile-avatar-img" letterCls="profile-avatar-letter"
            src={profile.avatar} name={shown}
            onClick={() => fileRef.current && fileRef.current.click()} title="Загрузить фото"
          >
            <div className="profile-avatar-overlay">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M10 8a3 3 0 1 0 0 6a3 3 0 0 0 0-6m8-3h-2.4a.89.89 0 0 1-.789-.57l-.621-1.861A.89.89 0 0 0 13.4 2H6.6c-.33 0-.686.256-.789.568L5.189 4.43A.89.89 0 0 1 4.4 5H2C.9 5 0 5.9 0 7v9c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m-8 11a5 5 0 0 1-5-5a5 5 0 1 1 10 0a5 5 0 0 1-5 5m7.5-7.8a.7.7 0 1 1 0-1.4a.7.7 0 0 1 0 1.4" /></svg>
            </div>
          </Avatar>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; window.Shell.uploadAvatar(f); }}
          />
          <div className="prof-identity-info">
            <div className="prof-identity-name">
              <span className="prof-identity-display">{shown}</span>{' '}
              <span className={'role-badge ' + profile.role}>{(profile.role || '').toUpperCase()}</span>
            </div>
            <div className="prof-identity-username">@{profile.username}</div>
            {profile.avatar && (
              <button className="prof-avatar-remove" onClick={() => window.Shell.removeAvatar()}>Удалить фото</button>
            )}
          </div>
        </div>

        <div className="prof-tabs">
          {TABS.map((tb) => (
            <button key={tb.id} className={'prof-tab' + (tab === tb.id ? ' active' : '')} onClick={() => setTab(tb.id)}>
              {tb.name}
            </button>
          ))}
        </div>

        <div className="prof-panes">
          <div className={'prof-pane' + (tab === 'account' ? ' active' : '')}>
            <div className="prof-section-lbl">ТЕМА ОФОРМЛЕНИЯ</div>
            {/* Тёмная тема не доделана. Кнопка видна, но заперта и подписана —
                правило то же, что и везде: где элемент виден, но нажать
                нельзя, объясняем почему. Недоделанное открыто только
                владельцу (dev.preview в core/roles.py). */}
            <div className="theme-seg" style={{ width: '100%' }}>
              <button className={'theme-seg-btn' + (theme === 'light' ? ' active' : '')} onClick={() => window.Shell.setTheme('light')}>☀ Светлая</button>
              <button
                className={'theme-seg-btn' + (theme === 'dark' ? ' active' : '') + (darkOpen ? '' : ' locked')}
                disabled={!darkOpen}
                title={darkOpen ? undefined : 'Тёмная тема ещё в разработке'}
                onClick={() => window.Shell.setTheme('dark')}
              >
                ☾ Тёмная
                {!darkOpen && <span className="theme-seg-why">в разработке</span>}
              </button>
            </div>
            <div className="prof-section-lbl" style={{ marginTop: 20 }}>ОТОБРАЖАЕМОЕ ИМЯ</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                placeholder="Не указано"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') window.Shell.saveDisplayName(name); }}
              />
              <button className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => window.Shell.saveDisplayName(name)}>
                Сохранить
              </button>
            </div>
            <div className="form-hint" style={{ marginTop: 6 }}>Только буквы и пробелы. Если не указано — отображается логин.</div>
          </div>

          <div className={'prof-pane' + (tab === 'security' ? ' active' : '')}>
            <PassField label="ТЕКУЩИЙ ПАРОЛЬ" value={oldPass} onChange={setOldPass} />
            <PassField label="НОВЫЙ ПАРОЛЬ" value={newPass} onChange={setNewPass} />
            <button
              className="btn btn-primary prof-btn-pill"
              onClick={async () => {
                const ok = await window.Shell.changePassword(oldPass, newPass);
                if (!ok) { setOldPass(''); setNewPass(''); }
              }}
            >
              Сменить пароль
            </button>
            <div className="prof-pin-row">
              <div className="prof-pin-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="prof-pin-info">
                <div className="prof-pin-name">PIN-код</div>
                <div className="prof-pin-sub">{pinEnabled ? 'Включён на этом устройстве' : 'Не настроен'}</div>
              </div>
              {pinEnabled
                ? <button className="prof-pin-btn off" onClick={() => window.Shell._disablePin()}>Отключить</button>
                : <button className="prof-pin-btn on" onClick={() => window.Shell._setPinFlow()}>Включить</button>}
            </div>
          </div>

          <div className={'prof-pane' + (tab === 'sessions' ? ' active' : '')}>
            {sessions === null && <div className="prof-sess-empty">Загрузка…</div>}
            {sessions && sessions.length === 0 && <div className="prof-sess-empty">Не удалось загрузить</div>}
            {sessions && sessions.map((s) => (
              <div className="prof-sess" key={s.hint}>
                <div className="prof-sess-main">
                  <div className="prof-sess-dev">
                    {deviceName(s.device_info && s.device_info.user_agent)}
                    {s.is_current && <span className="prof-sess-tag cur">текущая</span>}
                    {s.pin_enabled && <span className="prof-sess-tag pin">PIN</span>}
                  </div>
                  <div className="prof-sess-time">{s.last_seen ? relTime(s.last_seen) : '—'}</div>
                </div>
                {!s.is_current && (
                  <button className="prof-sess-kill" onClick={() => window.Shell._revokeSession(s.hint)}>Завершить</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="prof-footer">
          <span className="prof-session-count">{count === null ? '' : 'Сессий активно: ' + count}</span>
          <button className="btn btn-danger" style={{ gap: 6, flex: 0, padding: '8px 16px' }} onClick={() => window.Shell.logout()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}
