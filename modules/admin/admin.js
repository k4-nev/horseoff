const Admin = {
  users: [],
  allModules: [],
  selectedUser: null,
  editMode: false,
  deleteTarget: null,

  async init() {
    await this.loadModules();
    await this.loadUsers();
    this.initRolePicker();
  },

  async loadModules() {
    var d = await Shell.api('/api/modules/all');
    if (d) this.allModules = d.filter(m => m.min_role !== 'arcana');
  },

  async loadUsers() {
    var data = await Shell.api('/api/users');
    if (!data) return;
    this.users = data;
    this.renderList();
    if (this.selectedUser) {
      var still = this.users.find(u => u.id === this.selectedUser);
      if (still) this.showUser(this.selectedUser);
      else this.clearDetail();
    }
  },

  renderList() {
    var el = document.getElementById('admList');
    if (!el) return;
    if (!this.users.length) {
      el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:12px">Нет пользователей</div>';
      return;
    }
    el.innerHTML = this.users.map(u => {
      var ava = u.avatar
        ? '<div class="adm-user-ava"><img src="data:image/jpeg;base64,' + u.avatar + '"/></div>'
        : '<div class="adm-user-ava">' + (u.display_name || u.username).charAt(0).toUpperCase() + '</div>';
      var active = this.selectedUser === u.id ? ' active' : '';
      var dn = u.display_name || u.username;
      return '<div class="adm-user' + active + '" onclick="Admin.showUser(\'' + u.id + '\')">'
        + ava
        + '<div class="adm-user-info"><div class="adm-user-name">' + dn + '</div><div class="adm-user-sub">@' + u.username + '</div></div>'
        + '<span class="role-badge ' + u.role + '">' + u.role.toUpperCase() + '</span>'
        + '</div>';
    }).join('');
  },

  filter(query) {
    var q = query.toLowerCase().trim();
    document.querySelectorAll('.adm-user').forEach(row => {
      var name = (row.querySelector('.adm-user-name')?.textContent || '').toLowerCase();
      var sub = (row.querySelector('.adm-user-sub')?.textContent || '').toLowerCase();
      row.style.display = (q && !name.includes(q) && !sub.includes(q)) ? 'none' : '';
    });
  },

  showUser(uid) {
    this.selectedUser = uid;
    var u = this.users.find(x => x.id === uid);
    if (!u) return;
    this.renderList();
    document.getElementById('admEmpty').style.display = 'none';
    document.getElementById('admDetail').style.display = 'block';
    document.getElementById('admRight').classList.add('mobile-open');
    // Avatar
    var avaEl = document.getElementById('admDetailAva');
    if (u.avatar) {
      avaEl.innerHTML = '<img src="data:image/jpeg;base64,' + u.avatar + '"/>';
    } else {
      avaEl.textContent = (u.display_name || u.username).charAt(0).toUpperCase();
    }
    // Info
    var dn = u.display_name ? u.display_name + ' (@' + u.username + ')' : u.username;
    document.getElementById('admDetailName').textContent = dn;
    var roleEl = document.getElementById('admDetailRole');
    roleEl.className = 'role-badge ' + u.role; roleEl.textContent = u.role.toUpperCase();
    
    document.getElementById('admDetailDate').textContent = u.created || '';
    // Hide delete for GOD
    document.getElementById('admDetailDelBtn').style.display = u.role === 'arcana' ? 'none' : '';
    // Modules
    this.renderModules(u);
  },

  renderModules(u) {
    var el = document.getElementById('admModules');
    var isGod = u.role === 'arcana';
    var userMods = u.modules || ['messenger'];
    el.innerHTML = this.allModules.map(m => {
      var enabled = isGod || userMods.indexOf(m.id) !== -1;
      var disabled = isGod ? ' disabled' : '';
      return '<div class="adm-mod-row">'
        + '<span class="adm-mod-name">' + m.name + '</span>'
        + '<label class="adm-mod-toggle' + (isGod ? ' disabled' : '') + '">'
        + '<input type="checkbox"' + (enabled ? ' checked' : '') + disabled
        + ' onchange="Admin.toggleModule(\'' + u.id + '\',\'' + m.id + '\',this.checked)"/>'
        + '<span class="slider"></span></label></div>';
    }).join('');
    if (isGod) {
      el.insertAdjacentHTML('beforeend', '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;font-style:italic">GOD имеет доступ ко всем модулям</div>');
    }
  },

  async toggleModule(uid, modId, enabled) {
    var u = this.users.find(x => x.id === uid);
    if (!u) return;
    var mods = u.modules ? [...u.modules] : ['messenger'];
    if (enabled && mods.indexOf(modId) === -1) mods.push(modId);
    if (!enabled) mods = mods.filter(m => m !== modId);
    var d = await Shell.api('/api/users/' + uid, {method:'PUT', body:JSON.stringify({modules: mods})});
    if (d && d.status === 'ok') {
      u.modules = mods;
    } else {
      Shell.toast(d?.error || 'Ошибка', 'error');
      this.renderModules(u);
    }
  },

  clearDetail() {
    this.selectedUser = null;
    document.getElementById('admEmpty').style.display = 'flex';
    document.getElementById('admDetail').style.display = 'none';
    document.getElementById('admRight').classList.remove('mobile-open');
    this.renderList();
  },

  // Add/Edit
  openAdd() {
    this.editMode = false;
    document.getElementById('admEditId').value = '';
    document.getElementById('admModalTitle').textContent = 'Добавить пользователя';
    document.getElementById('admSaveBtn').textContent = 'Создать';
    document.getElementById('adm-name').value = '';
    document.getElementById('adm-name').disabled = false;
    document.getElementById('adm-pass').value = '';
    this.setRolePickerValue('common');
    document.getElementById('adm-display').value = '';
    document.getElementById('admAddModal').classList.add('active');
    document.getElementById('adm-name').focus();
  },

  openEdit(uid) {
    var u = this.users.find(x => x.id === uid);
    if (!u) return;
    this.editMode = true;
    document.getElementById('admEditId').value = u.id;
    document.getElementById('admModalTitle').textContent = 'Редактировать';
    document.getElementById('admSaveBtn').textContent = 'Сохранить';
    document.getElementById('adm-name').value = u.username;
    document.getElementById('adm-name').disabled = false;
    document.getElementById('adm-pass').value = '';
    this.setRolePickerValue(u.role);
    document.getElementById('adm-display').value = u.display_name || '';
    document.getElementById('admAddModal').classList.add('active');
  },

  async save() {
    var name = document.getElementById('adm-name').value.trim();
    var pass = document.getElementById('adm-pass').value;
    var role = document.getElementById('adm-role').value;
    var dn = document.getElementById('adm-display').value.trim();
    if (this.editMode) {
      var uid = document.getElementById('admEditId').value;
      var body = {role: role, display_name: dn};
      if (name) body.username = name;
      if (pass) body.password = pass;
      var d = await Shell.api('/api/users/' + uid, {method:'PUT', body:JSON.stringify(body)});
      if (d && d.status === 'ok') { Shell.toast('Обновлён'); Shell.closeModal('admAddModal'); this.loadUsers(); }
      else { Shell.toast(d?.error || 'Ошибка', 'error'); }
    } else {
      if (!name || !pass) { Shell.toast('Логин и пароль', 'error'); return; }
      if (pass.length < 6) { Shell.toast('Пароль мин. 6 символов', 'error'); return; }
      var d = await Shell.api('/api/users', {method:'POST', body:JSON.stringify({username:name,password:pass,role:role,display_name:dn})});
      if (d && d.status === 'ok') { Shell.toast('Создан'); Shell.closeModal('admAddModal'); this.loadUsers(); }
      else { Shell.toast(d?.error || 'Ошибка', 'error'); }
    }
  },

  openDelete(uid) {
    var u = this.users.find(x => x.id === uid);
    if (!u || u.role === 'arcana') return;
    this.deleteTarget = uid;
    document.getElementById('admDelInfo').textContent = u.display_name || u.username;
    document.getElementById('admDelModal').classList.add('active');
  },

  async confirmDelete() {
    if (!this.deleteTarget) return;
    var d = await Shell.api('/api/users/' + this.deleteTarget, {method:'DELETE'});
    if (d && d.status === 'ok') {
      Shell.toast('Удалён');
      Shell.closeModal('admDelModal');
      this.deleteTarget = null;
      if (this.selectedUser === this.deleteTarget) this.clearDetail();
      this.loadUsers();
    } else { Shell.toast(d?.error || 'Ошибка', 'error'); }
  },

  // Default modules
  async openDefaults() {
    var d = await Shell.api('/api/settings/default-modules');
    var current = d ? d.modules : ['messenger'];
    var el = document.getElementById('admDefaultModules');
    el.innerHTML = this.allModules.map(m => {
      var on = current.indexOf(m.id) !== -1;
      return '<div class="adm-mod-row"><span class="adm-mod-name">' + m.name + '</span>'
        + '<label class="adm-mod-toggle"><input type="checkbox" data-mod="' + m.id + '"' + (on ? ' checked' : '') + '/><span class="slider"></span></label></div>';
    }).join('');
    document.getElementById('admDefaultsModal').classList.add('active');
  },

  async saveDefaults() {
    var mods = [];
    document.querySelectorAll('#admDefaultModules input[type=checkbox]:checked').forEach(cb => {
      mods.push(cb.dataset.mod);
    });
    var d = await Shell.api('/api/settings/default-modules', {method:'POST', body:JSON.stringify({modules: mods})});
    if (d && d.status === 'ok') { Shell.toast('Сохранено'); Shell.closeModal('admDefaultsModal'); }
    else { Shell.toast(d?.error || 'Ошибка', 'error'); }
  },

  // Role picker
  _roles: ['common','uncommon','rare','mythical','legendary','immortal'],

  initRolePicker() {
    var dd = document.getElementById('admRoleDropdown');
    if (!dd) return;
    dd.innerHTML = this._roles.map(r =>
      '<div class="adm-role-option" onclick="Admin.selectRole(\'' + r + '\')">'
      + '<span class="role-badge ' + r + '">' + r.toUpperCase() + '</span></div>'
    ).join('');
  },

  toggleRolePicker() {
    var dd = document.getElementById('admRoleDropdown');
    if (dd) dd.classList.toggle('open');
  },

  selectRole(role) {
    document.getElementById('adm-role').value = role;
    var badge = document.getElementById('admRoleBadge');
    badge.className = 'role-badge ' + role;
    badge.textContent = role.toUpperCase();
    document.getElementById('admRoleDropdown').classList.remove('open');
  },

  setRolePickerValue(role) {
    document.getElementById('adm-role').value = role;
    var badge = document.getElementById('admRoleBadge');
    if (badge) {
      badge.className = 'role-badge ' + role;
      badge.textContent = role.toUpperCase();
    }
  }
};

document.addEventListener('click',function(e){if(!e.target.closest('.adm-role-picker')){var dd=document.getElementById('admRoleDropdown');if(dd)dd.classList.remove('open');}});
window.Admin = Admin;
Admin.init();
