import { useState } from 'react';
import { roleAtLeast } from '../../../../core/react-src/src/shared/roles.js';
import TierChips from './TierChips.jsx';

export default function UserForm({ mode, user, onSave, onCancel, allModules }) {
  const isEdit = mode === 'edit';
  const [username, setUsername] = useState(isEdit ? user.username : '');
  const [displayName, setDisplayName] = useState(isEdit ? user.display_name || '' : '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(isEdit ? user.role : 'common');

  const AllowedModules = ({ role: r, allModules: mods }) => {
    const list = (mods || []).filter((m) => roleAtLeast(r, m.min_role));
    return (
      <div className="adm-role-gives">
        {list.length
          ? 'На этой ступени можно выдать: ' + list.map((m) => m.name).join(', ')
          : 'На этой ступени разделы выдать нельзя'}
      </div>
    );
  };

  function submit() {
    if (isEdit) {
      const body = { role, display_name: displayName.trim() };
      if (username.trim()) body.username = username.trim();
      if (password) body.password = password;
      onSave(body);
      return;
    }
    const name = username.trim();
    if (!name || !password) {
      window.Shell.toast('Логин и пароль', 'error');
      return;
    }
    if (password.length < 6) {
      window.Shell.toast('Пароль мин. 6 символов', 'error');
      return;
    }
    onSave({ username: name, password, role, display_name: displayName.trim() });
  }

  return (
    <>
      <label className="adm-field">
        <span>Логин</span>
        <input className="adm-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
      </label>
      <label className="adm-field">
        <span>Имя (необязательно)</span>
        <input className="adm-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Имя Фамилия" />
      </label>
      <label className="adm-field">
        <span>Пароль</span>
        <input
          className="adm-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isEdit ? 'оставить как есть' : '••••••'}
        />
      </label>
      <label className="adm-field">
        <span>Ранг</span>
        <TierChips value={role} onChange={setRole} />
        {/* Что даёт выбранная ступень — тут же, рядом с ней. Пороги живые:
            подвинули их в «Доступах ролей» — поедет и эта строка. */}
        <AllowedModules role={role} allModules={allModules} />
      </label>
      <div className="adm-drawer-actions">
        <button className="adm-btn" onClick={onCancel}>Отмена</button>
        <button className="adm-btn adm-btn-primary" onClick={submit}>{isEdit ? 'Сохранить' : 'Создать'}</button>
      </div>
    </>
  );
}
