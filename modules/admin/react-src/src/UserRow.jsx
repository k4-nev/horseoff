import Icon from './Icon.jsx';
import { formatPresence } from './format.js';
import Avatar from '../../../../core/react-src/src/shared/Avatar.jsx';
import Switch from '../../../../core/react-src/src/shared/Switch.jsx';
import RoleBadge from '../../../../core/react-src/src/shared/RoleBadge.jsx';
import { roleAtLeast } from '../../../../core/react-src/src/shared/roles.js';

/* Модуль с min_role выше роли пользователя выдать нельзя: сервер его всё
   равно не покажет, а тумблер бы врал. Лестница ролей — общая, она обязана
   совпадать с ROLE_RANK в core/server.py. */

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
      <RoleBadge role={u.role} />
    </div>
  );

  return (
    <div className={'adm-row-wrap' + (expanded ? ' expanded' : '')}>
      <div className="adm-row" onClick={() => onToggleExpand(u.id)}>
        <button className="adm-chevron" aria-label="Развернуть">
          <Icon name="chevron" />
        </button>
        <div className="adm-user">
          <Avatar cls="adm-ava" src={u.avatar} letter={initials(displayName || u.username)} />
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
                  <Switch
                    on={on}
                    disabled={isGod || !allowed}
                    label={m.name}
                    onChange={(next) => onToggleModule(u.id, m.id, next)}
                  />
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
