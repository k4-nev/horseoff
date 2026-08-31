import { useEffect, useState } from 'react';

/* Доступы на стороне интерфейса.

   Правило простое и оно же — просьба заказчика: где элемент виден, но нажать
   нельзя, написано, какая ступень нужна; где элемента не видно вовсе,
   подсказки нет. Человеку незачем знать о том, чего для него не существует,
   а вот упереться в серую кнопку без объяснения — обидно.

   Пороги приходят с сервера (/api/roles) и лежат в одном месте: правка в
   админке меняет и запрет, и подпись под ним. Раньше клиент описывал те же
   правила своими словами — canManage = role==='immortal'||role==='arcana' —
   и рано или поздно расходился с сервером. */

let state = { caps: null, min: {}, role: null };
const subs = new Set();
let loading = null;

function emit() { subs.forEach((fn) => fn(state)); }

export function loadAccess(force) {
  if (loading && !force) return loading;
  const api = window.Shell && window.Shell.api;
  if (!api) return Promise.resolve(state);
  loading = window.Shell.api('/api/roles').then((d) => {
    if (d && d.actions) {
      const min = {};
      d.actions.forEach((a) => { min[a.id] = a.role; });
      state = { caps: null, min, role: d.my_role };
      emit();
    }
    return state;
  }).catch(() => state);
  return loading;
}

const ORDER = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal', 'arcana'];
const rank = (r) => ORDER.indexOf(r);

/** Тянет ли моя ступень это действие.

    Пока пороги не доехали — считаем, что нельзя. Показать кнопку, которая
    через миг ответит «нет доступа», хуже, чем на мгновение её не показать. */
export function may(action) {
  if (!state.role) return false;
  if (state.role === 'arcana') return true;
  const need = state.min[action];
  if (!need) return false;
  return rank(state.role) >= rank(need);
}

/** Доехали ли пороги — чтобы модуль не рисовал спорное до ответа. */
export const accessReady = () => !!state.role;

/** Какая ступень нужна — для подписи под запертым элементом. */
export const needRole = (action) => state.min[action] || '';

/** Подписка: перерисовать интерфейс, когда пороги доехали. */
export function useAccess() {
  const [s, set] = useState(state);
  useEffect(() => {
    subs.add(set);
    loadAccess();
    return () => subs.delete(set);
  }, []);
  return {
    role: s.role,
    ready: !!s.role,
    may: (a) => may(a),
    need: (a) => needRole(a),
  };
}

/* Обёртка для запертого элемента: показывает его серым и подписывает, чего
   не хватает. Если элемент решено не показывать вовсе — не оборачивайте,
   просто не рисуйте: подсказка тогда и не нужна. */
export function Locked({ action, children, title = 'Недоступно' }) {
  const need = needRole(action);
  return (
    <span className="ho-locked" title={title + (need ? ': нужна роль ' + need.toUpperCase() : '')}>
      {children}
      {need && <span className="ho-locked-why">нужна роль {need.toUpperCase()}</span>}
    </span>
  );
}
