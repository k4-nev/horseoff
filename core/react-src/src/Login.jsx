import { useEffect, useRef, useState } from 'react';

/* Экран входа. Два режима — обычный вход и первый запуск (создание
   администратора): их различает setup из состояния ядра. Логику и сеть
   по-прежнему держит ядро, форма только собирает поля и зовёт его. */

const Logo = () => (
  <svg viewBox="155 100 195 295" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g transform="translate(505,0) scale(-1,1)">
      <rect x="202.843" y="339.947" fill="var(--accent)" width="122.157" height="45.529" />
      <rect x="175" y="339.947" fill="var(--accent-dark)" width="27.843" height="45.529" />
      <rect x="182.95" y="299.899" fill="var(--accent)" width="133.277" height="34.786" />
      <rect x="182.959" y="299.899" fill="var(--accent-dark)" width="46.326" height="34.786" />
      <path fill="var(--accent)" d="M214.627,294.646c0,0-18.763-22.139-17.332-31.296c1.76-11.267,49.999-66.548,49.999-66.548c-12.83-8.554-51.174,22.887-51.174,22.887s-21.001-17.957-18.272-19.29c9.236-5.005,3.256-3.985-0.346-6.766c3.245-15.14,14.442-12.786,40.568-49.999c11.264-16.045,4.758-16.249,4.758-16.249l1.769-12.861c10.344,12.643,83.146,34.762,88.893,91.08c5.747,56.318-26.453,89.041-26.453,89.041H214.627z" />
      <path fill="var(--accent-dark)" d="M216.038,205.562c-10.818,6.664-19.919,14.127-19.919,14.127s-21.001-17.957-18.271-19.29c9.236-5.006,3.256-3.985-0.346-6.766c2.722-12.699,11.037-13.091,29.063-34.843l0,0C196.058,179.804,216.038,205.562,216.038,205.562z" />
      <path fill="var(--accent-dark)" d="M220.978,228.34c-7.005,24.224,38.652,66.306,38.652,66.306h-45.004c0,0-18.94-22.169-17.332-31.296C198.65,255.656,220.978,228.34,220.978,228.34z" />
    </g>
  </svg>
);

/* Поле пароля с глазком. Раньше глазок дёргал Shell.toggleEye и лазил в
   соседний input через parentNode — здесь это обычное состояние. */
function PassField({ label, value, onChange, autoComplete, onEnter }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="input-eye">
        <input
          className="form-input"
          type={shown ? 'text' : 'password'}
          placeholder="••••••••"
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }}
        />
        <button className="eye-btn" type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Скрыть пароль' : 'Показать пароль'}>
          <span className={'ico ico-16 ' + (shown ? 'ico-eye-closed' : 'ico-eye-open')} />
        </button>
      </div>
    </div>
  );
}

export default function Login({ setup, error, busy, version }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const userRef = useRef(null);

  useEffect(() => { if (userRef.current) userRef.current.focus(); }, []);

  const submit = () => {
    if (busy) return;
    if (setup) window.Shell.handleSetup(user, pass, pass2);
    else window.Shell.handleAuth(user, pass);
  };

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo">
          <div className="logo-icon"><Logo /></div>
          <h2>Horseoff</h2>
        </div>
        <div className="login-subtitle">
          {setup ? 'Создайте учётную запись администратора' : 'Войдите в панель управления'}
        </div>
        <div className="login-form">
          <div className="form-group">
            <label className="form-label">Логин</label>
            <input
              ref={userRef}
              className="form-input"
              placeholder="admin"
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
          </div>
          <PassField
            label="Пароль"
            value={pass}
            onChange={setPass}
            autoComplete={setup ? 'new-password' : 'current-password'}
            onEnter={submit}
          />
          {setup && (
            <PassField label="Повторите пароль" value={pass2} onChange={setPass2} autoComplete="new-password" onEnter={submit} />
          )}
          <button className="login-btn" onClick={submit} disabled={busy}>
            {setup ? 'Создать аккаунт' : 'Войти'}
          </button>
          {error && <div className="login-error" style={{ display: 'block' }}>{error}</div>}
        </div>
        <div className="login-footer">
          horseoff{version ? <> <span className="app-version">v{version}</span></> : null}
          <br />Created by k4nev with the support of mysika
        </div>
      </div>
    </div>
  );
}
