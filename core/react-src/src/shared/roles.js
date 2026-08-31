/* Роли пользователей.

   Лестница здесь та же, что ROLE_RANK в core/server.py, — и это главное,
   ради чего файл появился. Копий было четыре, и они уже разошлись: в
   TierChips «Админки» ролей было шесть вместо семи.

   arcana — роль владельца: её выдаёт только первичная установка
   (create_user при setup), из интерфейса назначить нельзя. Поэтому в списке
   назначаемых её нет, и это не потеря, а правило. */

export const ROLE_RANK = {
  arcana: 7, immortal: 6, legendary: 5, mythical: 4, rare: 3, uncommon: 2, common: 1,
};

/** От младших к старшим — так роли показывает «Админка». */
export const ROLES_ASC = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal', 'arcana'];

/** От старших к младшим — так сортируются участники в «Каналах». */
export const ROLES_DESC = [...ROLES_ASC].reverse();

/** Что можно выдать из интерфейса. */
export const ASSIGNABLE_ROLES = ROLES_ASC.filter((r) => r !== 'arcana');

/** Кому в модулях доступны действия администратора. */
export const ADMIN_ROLES = ['arcana', 'immortal', 'legendary'];
export const isAdminRole = (role) => ADMIN_ROLES.indexOf(role) !== -1;

/** Роль не ниже требуемой. Пустое требование проходит всегда. */
export const roleAtLeast = (role, min) => !min || (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 0);
