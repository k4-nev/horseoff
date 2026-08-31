import { useEffect, useRef, useState } from 'react';
import { api, buzz, compressImage, toast } from './lib.js';
import Avatar from '../../../../core/react-src/src/shared/Avatar.jsx';

/* Вкладка «Настройки»: фото, название, группа, API-ключ, доступ, удаление.

   Ключ показывается точками до нажатия на глаз — он даёт полный доступ боту
   и мелькать на экране рядом с чужими глазами ему незачем. */

function AvatarBox({ src }) {
  return src
    ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
    : (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.3">
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
      </svg>
    );
}

export default function SettingsTab({ bot, groups, onPatch, onDelete, onAccessOpen, onAccessRemove, isTest }) {
  const [name, setName] = useState(bot.name || '');
  const [group, setGroup] = useState(bot.group && bot.group !== 'Без группы' ? bot.group : '');
  const [keyShown, setKeyShown] = useState(false);
  const [key, setKey] = useState(bot.api_key || '');
  const fileRef = useRef(null);

  useEffect(() => {
    setName(bot.name || '');
    setGroup(bot.group && bot.group !== 'Без группы' ? bot.group : '');
    setKey(bot.api_key || '');
    setKeyShown(false);
  }, [bot.id, bot.name, bot.group, bot.api_key]);

  const pickAvatar = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const avatar = await compressImage(ev.target.result);
      onPatch({ avatar }, 'Фото обновлено');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const regen = async () => {
    if (isTest) { toast('У тест-бота ключа нет'); return; }
    if (!window.confirm('Перегенерировать API-ключ? Старый ключ перестанет работать.')) return;
    buzz(30);
    const d = await api(`/api/mod/bots/${bot.id}/regen_key`, { method: 'POST' });
    if (d && d.api_key) {
      setKey(d.api_key);
      setKeyShown(true);
      toast('Ключ обновлён — сохраните его');
    }
  };

  const access = bot.access || [];

  return (
    <div className="bt-settings-wrap">
      <div className="bt-settings-section">
        <div className="bt-settings-label">Фото бота</div>
        <div className="bt-avatar-settings-row">
          <div className="bt-avatar-preview-wrap">
            <div className="bt-avatar-preview"><AvatarBox src={bot.avatar} /></div>
          </div>
          <div className="bt-avatar-actions">
            <button className="btn btn-secondary" onClick={() => fileRef.current.click()}>Изменить фото</button>
            {bot.avatar && (
              <button className="btn btn-danger" onClick={() => onPatch({ avatar: '' }, 'Фото удалено')}>Удалить</button>
            )}
          </div>
          <input type="file" accept="image/*" style={{ display: 'none' }} ref={fileRef} onChange={pickAvatar} />
        </div>
      </div>

      <div className="bt-settings-section">
        <div className="bt-settings-label">Название бота</div>
        <div className="bt-settings-row">
          <input className="bt-input" placeholder="Имя бота" value={name} onChange={(e) => setName(e.target.value)} />
          <button
            className="btn btn-secondary"
            onClick={() => { const v = name.trim(); if (v) onPatch({ name: v }, 'Название обновлено'); }}
          >
            Сохранить
          </button>
        </div>
      </div>

      <div className="bt-settings-section">
        <div className="bt-settings-label">Группа</div>
        <div className="bt-settings-row">
          <input
            className="bt-input" placeholder="Без группы" list="btGroupOptions" autoComplete="off"
            value={group} onChange={(e) => setGroup(e.target.value)}
          />
          <datalist id="btGroupOptions">
            {groups.map((g) => <option value={g} key={g} />)}
          </datalist>
          <button className="btn btn-secondary" onClick={() => onPatch({ group: group.trim() || 'Без группы' }, 'Группа обновлена')}>
            Сохранить
          </button>
        </div>
      </div>

      <div className="bt-settings-section">
        <div className="bt-settings-label">API-ключ</div>
        <div className="bt-apikey-wrap">
          <div className="bt-apikey-field">
            <input
              className="bt-input bt-mono" readOnly
              value={keyShown ? key : '•'.repeat(Math.min(32, key.length))}
            />
            <button className="bt-icon-btn" title="Показать/скрыть" onClick={() => { buzz(12); setKeyShown((v) => !v); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
            <button
              className="bt-icon-btn" title="Скопировать"
              onClick={() => { if (key && navigator.clipboard) navigator.clipboard.writeText(key).then(() => { toast('API-ключ скопирован'); buzz(20); }); }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            </button>
          </div>
          <button className="btn btn-secondary bt-regen-btn" onClick={regen}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            Перегенерировать
          </button>
        </div>
      </div>

      <div className="bt-settings-section">
        <div className="bt-settings-label">Доступ</div>
        <div className="bt-access-list">
          {access.length ? access.map((u) => (
            <div className="bt-access-row" key={u.id}>
              <Avatar cls="bt-access-ava" src={u.avatar} name={u.display_name || u.username} />
              <div className="bt-access-name">{u.display_name || u.username}</div>
              <span className={'role-badge ' + (u.role || 'common')}>{u.role || ''}</span>
              {u.is_owner
                ? <span className="bt-access-owner-tag" title="Владелец — доступ по роли">по роли</span>
                : (
                  <button className="bt-access-remove" title="Убрать доступ" onClick={() => onAccessRemove(u.id)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
            </div>
          )) : <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '4px 0' }}>Доступ только у владельца</div>}
        </div>
        <button className="btn btn-secondary bt-add-access-btn" onClick={onAccessOpen}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Добавить пользователя
        </button>
      </div>

      <div className="bt-settings-section bt-danger-zone">
        <div className="bt-settings-label">Опасная зона</div>
        <div className="bt-danger-card">
          <div>
            <div className="bt-danger-title">Удалить бота</div>
            <div className="bt-danger-sub">Все данные и API-ключ будут удалены безвозвратно</div>
          </div>
          <button className="btn btn-danger" onClick={onDelete}>Удалить</button>
        </div>
      </div>
    </div>
  );
}
