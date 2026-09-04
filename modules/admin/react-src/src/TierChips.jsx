import RoleBadge from '../../../../core/react-src/src/shared/RoleBadge.jsx';
import { ASSIGNABLE_ROLES } from '../../../../core/react-src/src/shared/roles.js';

/* Выбор роли при создании и правке пользователя. arcana в списке нет
   намеренно: роль владельца выдаёт только первичная установка. Раньше это
   был отдельный список из шести ролей, и он молча разошёлся с лестницей —
   теперь исключение выражено явно. */
export default function TierChips({ value, onChange }) {
  return (
    <div className="adm-tier-strip">
      {ASSIGNABLE_ROLES.map((t) => (
        <button
          key={t}
          type="button"
          className={'adm-tier-chip' + (t === value ? ' on' : '')}
          onClick={() => onChange(t)}
        >
          <RoleBadge role={t} />
        </button>
      ))}
    </div>
  );
}
