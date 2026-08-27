import Icon from './Icon.jsx';
import { formatPresence } from './format.js';

/* Та же лестница ролей, что на сервере (ROLE_RANK в core/server.py).
   Модуль с min_role выше роли пользователя выдать нельзя: сервер его всё
   равно не покажет, а тумблер бы врал. */
const ROLE_RANK = { arcana: 7, immortal: 6, legendary: 5, mythical: 4, rare: 3, uncommon: 2, common: 1 };
const roleAtLeast = (role, min) => !min || (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 0);

const initials = (s) => (s || '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export default function UserRow({ user, allModules, expanded, onToggleExpand, onEdit, onDelete, onToggleModule }) {
  const u = user;
  const mods = u.modules || [];
  const isGod = u.role === 'arcana';
  const displayName = u.display_name || null;
  const presence = formatPresence(u.status, u.last_seen);
  const nameLine = (
    <div className="adm-line1">
      <span className={'adm-name' + (!displayName ? ' handle-only' : '')}>
        {displayName || '@' + u.username}
      </span>
      <span className={'role-badge ' + u.role}>{u.role.toUpperCase()}</span>
    </div>
  );

  return (
    <div className={'adm-row-wrap' + (expanded ? ' expanded' : '')}>
      <div className="adm-row" onClick={() => onToggleExpand(u.id)}>
        <button className="adm-chevron" aria-label="Развернуть">
          <Icon name="chevron" />
        </button>
        <div className="adm-user">
          <div className="adm-ava">
            {u.avatar ? (
              <img src={'data:image/jpeg;base64,' + u.avatar} alt="" />
            ) : (
              initials(displayName || u.username)
            )}
          </div>
          <div className="adm-meta">
            {nameLine}
            {displayName && <div className="adm-handle">@{u.username}</div>}
            <div className="adm-presence">
              {presence.dot && <span className={'adm-live-dot' + (presence.dot === 'away' ? ' away' : '')} />}
              <span>{presence.text}</span>
            </div>
          </div>
        </div>
        <div className="adm-dots" title={(isGod ? allModules.length : mods.length) + '/' + allModules.length + ' модулей'}>
          {allModules.map((m) => (
            <span key={m.id} className={'adm-dot' + (isGod || mods.includes(m.id) ? ' on' : '')} />
          ))}
        </div>
        <div className="adm-row-actions" onClick={(e) => e.stopPropagation()}>
          <div className="adm-tray">
            <button className="adm-icon-btn" onClick={() => onEdit(u)} aria-label="Изменить">
              <Icon name="pencil" />
            </button>
            {!isGod && (
              <button className="adm-icon-btn danger" onClick={() => onDelete(u)} aria-label="Удалить">
                <Icon name="trash" />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="adm-expand">
        <div className="adm-expand-in">
          <div className="adm-section-title">Доступ к модулям</div>
          <div className="adm-toggles">
            {allModules.map((m) => {
              const allowed = isGod || roleAtLeast(u.role, m.min_role);
              const on = allowed && (isGod || mods.includes(m.id));
              return (
                <div className={'adm-tog-row' + (allowed ? '' : ' locked')} key={m.id}>
                  <span>
                    {m.name}
                    {!allowed && <em className="adm-tog-why">нужна роль {m.min_role}</em>}
                  </span>
                  <button
                    className={'adm-switch' + (on ? ' on' : '') + (isGod || !allowed ? ' disabled' : '')}
                    role="switch"
                    aria-checked={on}
                    disabled={isGod || !allowed}
                    onClick={() => onToggleModule(u.id, m.id, !on)}
                  >
                    <span className="adm-switch-knob" />
                  </button>
                </div>
              );
            })}
          </div>
          {isGod && <div className="adm-god-note">Arcana имеет доступ ко всем модулям</div>}
        </div>
      </div>
    </div>
  );
}
