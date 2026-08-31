import { useCallback, useEffect, useState } from 'react';
import * as api from './api.js';
import SearchField from '../../../../core/react-src/src/shared/SearchField.jsx';
import Icon from './Icon.jsx';
import UserRow from './UserRow.jsx';
import Drawer from './Drawer.jsx';
import UserForm from './UserForm.jsx';
import DefaultsForm from './DefaultsForm.jsx';
import DeleteModal from './DeleteModal.jsx';
import { useMotionMode } from './motion.js';
import './admin.css';
import useOutside from '../../../../core/react-src/src/shared/useOutside.js';
import RoleBadge from '../../../../core/react-src/src/shared/RoleBadge.jsx';
import { ROLES_ASC } from '../../../../core/react-src/src/shared/roles.js';


export default function App() {
  const [users, setUsers] = useState([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [allModules, setAllModules] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [drawer, setDrawer] = useState(null); // null | {mode:'add'} | {mode:'edit', user} | {mode:'defaults'}
  const [deleteTarget, setDeleteTarget] = useState(null);
  const filterRef = useOutside(filterOpen, () => setFilterOpen(false));
  const motion = useMotionMode();

  const loadUsers = useCallback(async () => {
    const data = await api.getUsers();
    if (!data) return;
    setUsers(data);
    setUsersLoaded(true);
  }, []);

  useEffect(() => {
    (async () => {
      const mods = await api.getAllModules();
      if (mods) setAllModules(mods.filter((m) => m.min_role !== 'arcana'));
      await loadUsers();
    })();
  }, [loadUsers]);

  useEffect(() => {
    if (usersLoaded && expandedId && !users.some((u) => u.id === expandedId)) setExpandedId(null);
  }, [users, usersLoaded, expandedId]);

  async function toggleModule(uid, modId, enabled) {
    const u = users.find((x) => x.id === uid);
    if (!u) return;
    let mods = u.modules ? [...u.modules] : ['messenger'];
    if (enabled && mods.indexOf(modId) === -1) mods.push(modId);
    if (!enabled) mods = mods.filter((m) => m !== modId);
    const d = await api.updateUser(uid, { modules: mods });
    if (d && d.status === 'ok') {
      setUsers((prev) => prev.map((x) => (x.id === uid ? { ...x, modules: mods } : x)));
    } else {
      window.Shell.toast(d?.error || 'Ошибка', 'error');
    }
  }

  async function saveUser(payload) {
    if (drawer?.mode === 'edit') {
      const d = await api.updateUser(drawer.user.id, payload);
      if (d && d.status === 'ok') {
        window.Shell.toast('Обновлён');
        setDrawer(null);
        loadUsers();
      } else {
        window.Shell.toast(d?.error || 'Ошибка', 'error');
      }
      return;
    }
    const d = await api.createUser(payload);
    if (d && d.status === 'ok') {
      window.Shell.toast('Создан');
      setDrawer(null);
      loadUsers();
    } else {
      window.Shell.toast(d?.error || 'Ошибка', 'error');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const d = await api.deleteUser(deleteTarget.id);
    if (d && d.status === 'ok') {
      window.Shell.toast('Удалён');
      if (expandedId === deleteTarget.id) setExpandedId(null);
      setDeleteTarget(null);
      loadUsers();
    } else {
      window.Shell.toast(d?.error || 'Ошибка', 'error');
    }
  }

  const filtered = users.filter((u) => {
    if (filter && u.role !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (u.display_name || '').toLowerCase();
      if (!name.includes(q) && !u.username.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const filterLabel = filter ? filter.toUpperCase() : 'Все роли';
  const drawerOpen = !!drawer;
  const drawerTitle = drawer?.mode === 'edit' ? 'Редактировать' : drawer?.mode === 'defaults' ? 'Модули по умолчанию' : 'Добавить пользователя';
  const drawerSub =
    drawer?.mode === 'edit'
      ? 'Та же панель, что и «Добавить» — просто заполнена'
      : drawer?.mode === 'add'
      ? 'Логин и пароль обязательны, остальное можно позже'
      : null;

  return (
    <div className="adm-shell" data-motion={motion.reduced ? 'off' : 'on'}>
      <div className="adm-toolbar">
        <SearchField
          className="adm-search"
          placeholder="Найти пользователя…"
          value={search}
          onChange={setSearch}
          clearable
        />
        <div className={'adm-dd' + (filterOpen ? ' open' : '')} ref={filterRef}>
          <button className="adm-dd-btn" onClick={() => setFilterOpen((v) => !v)}>
            {filterLabel}
            <Icon name="chevron" />
          </button>
          <div className="adm-dd-menu">
            <button className={'adm-dd-item' + (!filter ? ' on' : '')} onClick={() => { setFilter(null); setFilterOpen(false); }}>
              Все роли
            </button>
            {ROLES_ASC.map((t) => (
              <button key={t} className={'adm-dd-item' + (filter === t ? ' on' : '')} onClick={() => { setFilter(t); setFilterOpen(false); }}>
                <RoleBadge role={t} />
              </button>
            ))}
          </div>
        </div>
        <div className="adm-tray">
          <button className="adm-btn" title="Модули по умолчанию" onClick={() => setDrawer({ mode: 'defaults' })}>
            <Icon name="gear" />
            <span className="adm-btn-label">Модули по умолчанию</span>
          </button>
          <button className="adm-btn adm-btn-primary" onClick={() => setDrawer({ mode: 'add' })}>
            <Icon name="plus" />
            Добавить
          </button>
        </div>
      </div>

      <div className="adm-head-row">
        <span />
        <span>Пользователь</span>
        <span>Доступ</span>
        <span />
      </div>
      <div className="adm-table">
        {!usersLoaded ? (
          <div className="adm-empty">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="adm-empty">Никого не нашлось</div>
        ) : (
          filtered.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              allModules={allModules}
              expanded={expandedId === u.id}
              onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
              onEdit={(user) => setDrawer({ mode: 'edit', user })}
              onDelete={setDeleteTarget}
              onToggleModule={toggleModule}
            />
          ))
        )}
      </div>

      {motion.showHint && (
        <div className="adm-motion-hint">
          Анимации приглушены системной настройкой.
          <button onClick={motion.enable}>Включить</button>
          <button onClick={motion.dismiss}>Скрыть</button>
        </div>
      )}

      <Drawer open={drawerOpen} title={drawerTitle} subtitle={drawerSub} onClose={() => setDrawer(null)} reduced={motion.reduced}>
        {drawer?.mode === 'defaults' ? (
          <DefaultsForm allModules={allModules} onClose={() => setDrawer(null)} />
        ) : drawer ? (
          <UserForm mode={drawer.mode} user={drawer.user} onSave={saveUser} onCancel={() => setDrawer(null)} />
        ) : null}
      </Drawer>

      {deleteTarget && <DeleteModal user={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
    </div>
  );
}
