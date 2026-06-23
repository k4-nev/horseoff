/* ════════════════════════════════════════
   BOTS MODULE  v1.0
   ════════════════════════════════════════ */
var Bots = {

  _bots: [],          // [{id, name, group, status, version, sub, badge, last_seen, api_key_hint, access}]
  _selected: null,    // current bot id
  _apiKeyVisible: false,
  _apiKeyFull: '',
  _autoScroll: true,
  _logLines: [],
  _logMax: 500,
  _snippetMode: 'cs',
  _testBotEnabled: false,

  _TEST_BOT: {
    id: '__test__', name: 'Demo Bot', group: 'Demo',
    status: 'online', version: '1.0', sub: 'Все элементы управления',
    badge: 0, last_seen: null, api_key: 'hb_demo_not_real',
    access: [],
    controls: [
      { type: 'section', label: 'Управление потоком' },
      { type: 'buttons', id: 'flow', buttons: [
        { label: 'Запустить', action: 'start', style: 'primary' },
        { label: 'Стоп', action: 'stop', style: 'danger' },
        { label: 'Сброс', action: 'reset', style: 'secondary' }
      ]},
      { type: 'section', label: 'Параметры' },
      { type: 'input', id: 'target', label: 'Целевой аккаунт', placeholder: '@username', apply_label: 'Применить' },
      { type: 'textarea', id: 'notes', label: 'Заметки', placeholder: 'Произвольный текст...' },
      { type: 'stepper', id: 'threads', label: 'Потоки', value: 3, min: 1, max: 20 },
      { type: 'slider', id: 'delay', label: 'Задержка (сек)', value: 5, min: 1, max: 60 },
      { type: 'select', id: 'mode', label: 'Режим работы', value: 'soft', options: [
        { value: 'soft', label: 'Мягкий' },
        { value: 'normal', label: 'Стандартный' },
        { value: 'aggressive', label: 'Агрессивный' }
      ]},
      { type: 'toggle', id: 'auto_restart', label: 'Авто-рестарт при ошибке', value: true },
      { type: 'section', label: 'Данные' },
      { type: 'filelist', id: 'accounts', label: 'Список аккаунтов', list_count: 120 },
      { type: 'section', label: 'Состояние' },
      { type: 'progress', id: 'prog', label: 'Прогресс задачи', value: 62, total: 'Обработано 620 из 1000' },
      { type: 'stats', items: [
        { id: 's1', label: 'Обработано', value: '1 248', delta: '+84', trend: 'up' },
        { id: 's2', label: 'Успешно', value: '1 102', delta: '+78', trend: 'up' },
        { id: 's3', label: 'Ошибки', value: '146', delta: '-6', trend: 'down' }
      ]},
      { type: 'badges', label: 'Статус', items: [
        { label: 'Running', style: 'running' },
        { label: 'Online', style: 'online' }
      ]},
      { type: 'section', label: 'Etap 3 — новые типы' },
      { type: 'label', id: 'status_txt', label: 'Текущий статус', text: 'Ожидание задачи...', style: 'accent' },
      { type: 'image', id: 'screenshot', label: 'Последний скриншот', value: '' },
      { type: 'code', id: 'last_result', label: 'Последний результат', value: '{\n  "status": "ok",\n  "processed": 620,\n  "errors": 12\n}' },
      { type: 'table', id: 'accounts_tbl', label: 'Аккаунты', columns: [
        { key: 'login', label: 'Логин' },
        { key: 'status', label: 'Статус' },
        { key: 'done', label: 'Выполнено' }
      ], rows: [
        { login: '@alice_ig', status: 'OK', done: '84', _style: { status: 'ok' } },
        { login: '@bob_ig',   status: 'WARN', done: '31', _style: { status: 'warn' } },
        { login: '@carol_zp', status: 'ERR', done: '0',  _style: { status: 'err' } }
      ]}
    ],
    stats: {
      kpi: [
        { label: 'Обработано', value: '1 248', delta: '+84', trend: 'up' },
        { label: 'Успешно', value: '1 102', delta: '+78', trend: 'up' },
        { label: 'Ошибки', value: '146', delta: '-6', trend: 'down' }
      ],
      hourly: Array.from({length: 24}, (_, i) => ({ label: String(i).padStart(2,'0'), v: Math.floor(Math.random()*80+10) })),
      daily: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => ({ label: d, v: Math.floor(Math.random()*200+50) }))
    }
  },

  // ─── Init ───────────────────────────────────────────────────
  async init() {
    this._renderFooter();
    await this.loadBots();
  },

  async loadBots() {
    const d = await Shell.api('/api/mod/bots/list');
    if (!d) return;
    this._bots = d.bots || [];
    this._renderList();
    if (this._selected) {
      const still = this._bots.find(b => b.id === this._selected);
      if (still) this._openBot(still.id);
    }
  },

  _renderFooter() {
    const el = document.getElementById('btSidebarFooter');
    if (!el || !Shell.user) return;
    const u = Shell.user;
    const avaHtml = u.avatar
      ? `<img src="data:image/jpeg;base64,${u.avatar}" />`
      : (u.display_name || u.username || '?').charAt(0).toUpperCase();
    el.innerHTML = `
      <div class="bt-footer-ava">${avaHtml}</div>
      <div><div class="bt-footer-name">${this._esc(u.display_name || u.username)}</div>
      <div class="bt-footer-role">${u.role || ''}</div></div>`;
  },

  // ─── List rendering ─────────────────────────────────────────
  _renderList(filter) {
    const list = document.getElementById('btList');
    if (!list) return;
    filter = (filter || '').toLowerCase();

    const bots = filter
      ? this._bots.filter(b => b.name.toLowerCase().includes(filter) || (b.group || '').toLowerCase().includes(filter))
      : this._bots;

    // Group by group field
    const groups = {};
    bots.forEach(b => {
      const g = b.group || 'Без группы';
      if (!groups[g]) groups[g] = [];
      groups[g].push(b);
    });

    list.innerHTML = '';
    Object.keys(groups).forEach((gname, gi) => {
      const groupBots = groups[gname];
      const div = document.createElement('div');
      div.className = 'bt-group';
      div.dataset.group = gname;

      const totalH = groupBots.length * 55 + 8;
      div.innerHTML = `
        <div class="bt-group-header" onclick="Bots._toggleGroup(this)">
          <svg class="bt-group-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="bt-group-name">${this._esc(gname)}</span>
          <span class="bt-group-count">${groupBots.length}</span>
        </div>
        <div class="bt-group-bots" style="max-height:${totalH}px">
          ${groupBots.map((b, i) => this._botRowHtml(b, i * 0.03)).join('')}
        </div>`;
      list.appendChild(div);
    });

    if (!bots.length) {
      list.innerHTML = '<div style="text-align:center;padding:30px 16px;font-size:12px;color:var(--text-dim)">Ничего не найдено</div>';
    }
  },

  _botRowHtml(b, delay) {
    const badge = b.badge ? `<div class="bt-badge">${b.badge}</div>` : '';
    const activeCls = b.id === this._selected ? ' active' : '';
    const offlineCls = b.status === 'offline' ? ' offline-bot' : '';
    return `<div class="bt-bot-row${activeCls}${offlineCls}" onclick="Bots._openBot('${b.id}')"
      style="animation-delay:${delay}s" data-bot-id="${b.id}">
      <div class="bt-dot ${b.status}"></div>
      <div class="bt-bot-info">
        <div class="bt-bot-row-name">${this._esc(b.name)}</div>
        <div class="bt-bot-row-sub">${this._esc(b.sub || '')}</div>
      </div>
      ${badge}
    </div>`;
  },

  _toggleGroup(header) {
    const group = header.closest('.bt-group');
    const bots = group.querySelector('.bt-group-bots');
    const isCollapsed = group.classList.contains('collapsed');
    if (isCollapsed) {
      group.classList.remove('collapsed');
      bots.style.maxHeight = bots.scrollHeight + 'px';
    } else {
      group.classList.add('collapsed');
      bots.style.maxHeight = '0';
    }
    // haptic on mobile
    if (navigator.vibrate) navigator.vibrate(8);
  },

  filterBots(val) {
    this._renderList(val);
  },

  // ─── Open bot ───────────────────────────────────────────────
  async _openBot(id) {
    this._selected = id;
    const b = this._bots.find(x => x.id === id);
    if (!b) return;

    // Clear badge
    if (b.badge) {
      b.badge = 0;
      await Shell.api(`/api/mod/bots/${id}/read`, { method: 'POST' });
    }

    // Update sidebar active state
    document.querySelectorAll('.bt-bot-row').forEach(r => {
      r.classList.toggle('active', r.dataset.botId === id);
    });

    document.getElementById('btEmpty').style.display = 'none';
    const ws = document.getElementById('btWorkspace');
    ws.style.display = 'flex';
    ws.style.flexDirection = 'column';

    // Topbar
    const dot = document.getElementById('btTopDot');
    dot.className = 'bt-bot-dot ' + b.status;
    document.getElementById('btTopName').textContent = b.name;
    const verEl = document.getElementById('btTopVersion');
    verEl.textContent = b.version ? 'v' + b.version : '';
    verEl.style.display = b.version ? '' : 'none';
    const pill = document.getElementById('btStatusPill');
    const labels = { online: 'Online', idle: 'Idle', offline: 'Offline' };
    pill.className = 'bt-status-pill ' + b.status;
    pill.textContent = labels[b.status] || b.status;

    const lastSeenEl = document.getElementById('btLastSeen');
    if (b.status === 'offline' && b.last_seen) {
      lastSeenEl.textContent = 'был ' + this._relTime(b.last_seen);
    } else {
      lastSeenEl.textContent = '';
    }

    if (b.status === 'offline') {
      this._showOfflineState(b);
    } else {
      this._showOnlineState(b);
    }

    // Reset to controls tab
    this.switchTab('controls');
    // Load full bot data
    this._loadBotDetails(id);
    // On mobile: close sidebar drawer when bot is opened
    this.closeSidebar();
    if (navigator.vibrate) navigator.vibrate(15);
  },

  _showOfflineState(b) {
    document.getElementById('btOfflineState').style.display = 'flex';
    document.getElementById('btTabs').style.display = 'flex';
    document.getElementById('btPanes').style.display = 'none';
    document.getElementById('btOfflineName').textContent = b.name;
    document.getElementById('btOfflineSeen').textContent = b.last_seen ? 'Последний раз онлайн: ' + this._relTime(b.last_seen) : 'Статус неизвестен';
    const q = b.queue_count || 0;
    const qEl = document.getElementById('btOfflineQueue');
    qEl.style.display = q ? 'flex' : 'none';
    document.getElementById('btOfflineQueueText').textContent = q + ' ' + this._plural(q, 'команда', 'команды', 'команд') + ' в очереди';
    // Mark non-settings tabs as disabled
    document.querySelectorAll('.bt-tab').forEach(t => {
      t.classList.toggle('bt-tab-disabled', t.id !== 'btTab-settings');
    });
  },

  _showOnlineState(b) {
    document.getElementById('btOfflineState').style.display = 'none';
    document.getElementById('btTabs').style.display = 'flex';
    document.getElementById('btPanes').style.display = 'block';
    document.querySelectorAll('.bt-tab').forEach(t => t.classList.remove('bt-tab-disabled'));
    document.getElementById('btPanes').style.position = 'relative';
    document.getElementById('btPanes').style.flex = '1';
    document.getElementById('btPanes').style.overflow = 'hidden';
  },

  async _loadBotDetails(id) {
    // Test bot — render directly from _TEST_BOT, no API call
    if (id === '__test__') {
      const b = Object.assign({}, this._TEST_BOT);
      this.renderControls(b.controls);
      this._renderKpi(b.stats);
      this._renderSettings(b);
      return;
    }
    const d = await Shell.api(`/api/mod/bots/${id}`);
    if (!d || !d.bot) return;
    const b = d.bot;
    // Merge into local bots
    const idx = this._bots.findIndex(x => x.id === id);
    if (idx >= 0) this._bots[idx] = Object.assign(this._bots[idx], b);
    if (this._selected !== id) return;

    this.renderControls(b.controls || this._defaultControls());
    this._renderKpi(b.stats);
    this._renderSettings(b);
  },

  // ─── Controls rendering ─────────────────────────────────────
  _defaultControls() {
    return [
      { type: 'section', label: 'Управление потоком' },
      { type: 'buttons', id: 'flow', buttons: [
        { label: 'Запустить', action: 'start', style: 'primary' },
        { label: 'Стоп', action: 'stop', style: 'danger' },
        { label: 'Сброс', action: 'reset', style: 'secondary' }
      ]},
      { type: 'section', label: 'Параметры' },
      { type: 'input', id: 'target', label: 'Целевой аккаунт', placeholder: '@username', apply_label: 'Применить' },
      { type: 'stepper', id: 'threads', label: 'Потоки', value: 3, min: 1, max: 20 },
      { type: 'slider', id: 'delay', label: 'Задержка (сек)', value: 5, min: 1, max: 60 },
      { type: 'select', id: 'mode', label: 'Режим работы', value: 'soft', options: [
        { value: 'soft', label: 'Мягкий' },
        { value: 'normal', label: 'Стандартный' },
        { value: 'aggressive', label: 'Агрессивный' }
      ]},
      { type: 'toggle', id: 'auto_restart', label: 'Авто-рестарт при ошибке', value: true },
      { type: 'section', label: 'Данные' },
      { type: 'filelist', id: 'accounts', label: 'Список аккаунтов' },
      { type: 'section', label: 'Состояние' },
      { type: 'progress', id: 'prog', label: 'Прогресс задачи', value: 62, total: 'Обработано 620 из 1000' },
      { type: 'stats', items: [
        { id: 's1', label: 'Обработано', value: '1 248', delta: '+84', trend: 'up' },
        { id: 's2', label: 'Успешно', value: '1 102', delta: '+78', trend: 'up' },
        { id: 's3', label: 'Ошибки', value: '146', delta: '-6', trend: 'down' }
      ]},
      { type: 'badges', label: 'Статус', items: [
        { label: 'Running', style: 'running' }
      ]}
    ];
  },

  renderControls(controls) {
    const grid = document.getElementById('btControlsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    controls.forEach(ctrl => {
      const el = this._buildControl(ctrl);
      if (el) grid.appendChild(el);
    });
  },

  _buildControl(ctrl) {
    const wrap = document.createElement('div');
    switch (ctrl.type) {
      case 'section':
        wrap.className = 'bt-section-divider';
        wrap.innerHTML = `<div class="bt-section-divider-line"></div>
          <span class="bt-section-divider-label">${this._esc(ctrl.label)}</span>
          <div class="bt-section-divider-line"></div>`;
        return wrap;

      case 'buttons':
        wrap.className = 'bt-ctrl-card';
        if (ctrl.label) wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>`;
        const btnGroup = document.createElement('div');
        btnGroup.className = 'bt-btn-group';
        ctrl.buttons.forEach(btn => {
          const b = document.createElement('button');
          const _styleMap = {primary:'btn btn-primary',danger:'btn btn-danger',secondary:'btn btn-secondary'};
          b.className = _styleMap[btn.style] || 'btn btn-secondary';
          b.textContent = btn.label;
          b.onclick = () => this._sendCommand(ctrl.id || btn.action, btn.action, null, b);
          btnGroup.appendChild(b);
        });
        wrap.appendChild(btnGroup);
        return wrap;

      case 'input':
        wrap.className = 'bt-ctrl-card';
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <div class="bt-input-row">
            <input class="bt-input" id="btCtrl_${ctrl.id}" placeholder="${this._esc(ctrl.placeholder || '')}" value="${this._esc(ctrl.value || '')}"/>
            <button class="btn btn-secondary" onclick="Bots._applyInput('${ctrl.id}', this)">${this._esc(ctrl.apply_label || 'Применить')}</button>
          </div>`;
        return wrap;

      case 'textarea':
        wrap.className = 'bt-ctrl-card';
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <textarea class="bt-textarea" id="btCtrl_${ctrl.id}" placeholder="${this._esc(ctrl.placeholder || '')}">${this._esc(ctrl.value || '')}</textarea>
          <div style="margin-top:8px;display:flex;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="Bots._applyInput('${ctrl.id}', this)">${this._esc(ctrl.apply_label || 'Сохранить')}</button>
          </div>`;
        return wrap;

      case 'stepper':
        wrap.className = 'bt-ctrl-card';
        const sv = ctrl.value || ctrl.min || 1;
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <div class="bt-stepper" id="btStepperWrap_${ctrl.id}">
            <button class="bt-stepper-btn" onclick="Bots._stepperChange('${ctrl.id}', ${ctrl.min || 1}, ${ctrl.max || 99}, -1)">−</button>
            <div class="bt-stepper-val" id="btStepperVal_${ctrl.id}">${sv}</div>
            <button class="bt-stepper-btn" onclick="Bots._stepperChange('${ctrl.id}', ${ctrl.min || 1}, ${ctrl.max || 99}, 1)">+</button>
          </div>`;
        return wrap;

      case 'slider':
        wrap.className = 'bt-ctrl-card';
        const slv = ctrl.value !== undefined ? ctrl.value : ctrl.min || 0;
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <div class="bt-slider-header">
            <span style="font-size:11px;color:var(--text-dim)">${ctrl.min || 0}</span>
            <span class="bt-slider-val" id="btSliderVal_${ctrl.id}">${slv}</span>
          </div>
          <input type="range" class="bt-slider" id="btCtrl_${ctrl.id}" min="${ctrl.min || 0}" max="${ctrl.max || 100}" value="${slv}"
            oninput="document.getElementById('btSliderVal_${ctrl.id}').textContent=this.value"
            onchange="Bots._sendCommand('${ctrl.id}', 'set', this.value)"/>
          <div class="bt-slider-minmax"><span>${ctrl.min || 0}</span><span>${ctrl.max || 100}</span></div>`;
        return wrap;

      case 'toggle':
        wrap.className = 'bt-ctrl-card';
        const tv = ctrl.value ? 'checked' : '';
        wrap.innerHTML = `<label class="bt-toggle-wrap" onclick="if(navigator.vibrate)navigator.vibrate(18)">
            <input type="checkbox" ${tv} id="btCtrl_${ctrl.id}" onchange="Bots._sendCommand('${ctrl.id}', 'set', this.checked)"/>
            <div class="bt-toggle-track"><div class="bt-toggle-thumb"></div></div>
            <span class="bt-toggle-text">${this._esc(ctrl.label)}</span>
          </label>`;
        return wrap;

      case 'select':
        wrap.className = 'bt-ctrl-card';
        const opts = (ctrl.options || []).map(o =>
          `<option value="${this._esc(o.value)}" ${o.value === ctrl.value ? 'selected' : ''}>${this._esc(o.label)}</option>`
        ).join('');
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <div class="bt-select-wrap">
            <select class="bt-select" id="btCtrl_${ctrl.id}" onchange="Bots._sendCommand('${ctrl.id}', 'set', this.value)">${opts}</select>
            <svg class="bt-select-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>`;
        return wrap;

      case 'progress':
        wrap.className = 'bt-ctrl-card';
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <div class="bt-progress-header">
            <span style="font-size:12px;color:var(--text-dim)">${this._esc(ctrl.total || '')}</span>
            <span class="bt-progress-pct">${ctrl.value || 0}%</span>
          </div>
          <div class="bt-progress-track"><div class="bt-progress-fill" style="width:${ctrl.value || 0}%"></div></div>`;
        return wrap;

      case 'filelist':
        wrap.className = 'bt-ctrl-card';
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <button class="bt-filelist-btn" onclick="Bots._uploadList('${ctrl.id}', this)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
            Загрузить список
          </button>
          <div class="bt-filelist-status" id="btFileStatus_${ctrl.id}">${ctrl.list_count ? ctrl.list_count + ' строк загружено' : ''}</div>`;
        return wrap;

      case 'stats':
        wrap.className = '';
        wrap.innerHTML = `<div class="bt-stat-row">${(ctrl.items || []).map((s, i) => `
          <div class="bt-stat-card" style="animation-delay:${i * 0.05}s">
            <div class="bt-stat-val">${this._esc(String(s.value))}</div>
            <div class="bt-stat-label">${this._esc(s.label)}</div>
            ${s.delta ? `<div class="bt-stat-delta ${s.trend || 'up'}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="${s.trend === 'down' ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"/>
              </svg>${this._esc(s.delta)}</div>` : ''}
          </div>`).join('')}</div>`;
        return wrap;

      case 'badges':
        wrap.className = 'bt-ctrl-card';
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label || 'Статус')}</div>
          <div class="bt-badges-row">${(ctrl.items || []).map(bd =>
            `<span class="bt-badge-status ${bd.style || ''}">${this._esc(bd.label)}</span>`
          ).join('')}</div>`;
        return wrap;

      case 'label':
        wrap.className = 'bt-ctrl-card';
        wrap.id = ctrl.id ? 'btCtrlCard_' + ctrl.id : '';
        wrap.innerHTML = `${ctrl.label ? `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>` : ''}
          <div class="bt-label-ctrl ${ctrl.style || ''}" id="btCtrl_${ctrl.id || ''}">${this._esc(ctrl.text || ctrl.value || '')}</div>`;
        return wrap;

      case 'image':
        wrap.className = 'bt-ctrl-card';
        wrap.id = ctrl.id ? 'btCtrlCard_' + ctrl.id : '';
        const hasImg = ctrl.value || ctrl.src;
        wrap.innerHTML = `${ctrl.label ? `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>` : ''}
          <div class="bt-image-ctrl" id="btCtrl_${ctrl.id || ''}">
            ${hasImg
              ? `<img src="${this._esc(ctrl.value || ctrl.src)}" alt="${this._esc(ctrl.label || '')}"/>
                 <span class="bt-image-ts">${ctrl.ts ? this._relTime(ctrl.ts) : ''}</span>`
              : `<div class="bt-image-empty"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Нет изображения</div>`
            }
          </div>`;
        return wrap;

      case 'table': {
        wrap.className = 'bt-ctrl-card';
        wrap.id = ctrl.id ? 'btCtrlCard_' + ctrl.id : '';
        const cols = ctrl.columns || [];
        const rows = ctrl.rows || [];
        const thead = cols.map(c => `<th>${this._esc(c.label || c)}</th>`).join('');
        const tbody = rows.map(r => `<tr>${cols.map(c => {
          const key = c.key || c;
          const val = r[key] !== undefined ? r[key] : '';
          const cls = r._style && r._style[key] ? ' class="' + r._style[key] + '"' : '';
          return `<td${cls}>${this._esc(String(val))}</td>`;
        }).join('')}</tr>`).join('');
        wrap.innerHTML = `${ctrl.label ? `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>` : ''}
          <div class="bt-table-wrap"><table class="bt-table">
            <thead><tr>${thead}</tr></thead>
            <tbody id="btCtrl_${ctrl.id || ''}">${tbody}</tbody>
          </table></div>`;
        return wrap;
      }

      case 'code':
        wrap.className = 'bt-ctrl-card';
        wrap.id = ctrl.id ? 'btCtrlCard_' + ctrl.id : '';
        wrap.innerHTML = `${ctrl.label ? `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>` : ''}
          <div style="position:relative">
            <pre class="bt-code-ctrl" id="btCtrl_${ctrl.id || ''}">${this._esc(ctrl.value || '')}</pre>
            <button class="bt-code-copy" onclick="Bots._copyCode('${ctrl.id}')">Копировать</button>
          </div>`;
        return wrap;

      default:
        return null;
    }
  },

  // ─── Live control update (Etap 3) ────────────────────────────
  _updateCtrl(ctrlId, data) {
    const card = document.getElementById('btCtrlCard_' + ctrlId);
    const el = document.getElementById('btCtrl_' + ctrlId);
    if (!el && !card) return;

    // Flash animation
    const target = card || el;
    target.classList.remove('bt-ctrl-updated');
    void target.offsetWidth;
    target.classList.add('bt-ctrl-updated');

    // Update value depending on element type
    const tag = el ? el.tagName : '';
    if (tag === 'INPUT' && el.type === 'range') {
      el.value = data.value;
      const valEl = document.getElementById('btSliderVal_' + ctrlId);
      if (valEl) valEl.textContent = data.value;
    } else if (tag === 'INPUT' && el.type === 'checkbox') {
      el.checked = !!data.value;
    } else if (tag === 'SELECT') {
      el.value = data.value;
    } else if (tag === 'PRE') {
      el.textContent = data.value || '';
    } else if (el && el.classList.contains('bt-label-ctrl')) {
      el.textContent = data.text || data.value || '';
      el.className = 'bt-label-ctrl ' + (data.style || '');
    } else if (el && el.classList.contains('bt-image-ctrl')) {
      if (data.value || data.src) {
        el.innerHTML = `<img src="${this._esc(data.value || data.src)}" alt=""/>
          <span class="bt-image-ts">${data.ts ? this._relTime(data.ts) : 'сейчас'}</span>`;
      }
    } else if (el && el.tagName === 'TBODY') {
      // table rows update
      const cols = data.columns || [];
      if (data.rows && cols.length) {
        el.innerHTML = data.rows.map(r => `<tr>${cols.map(c => {
          const key = c.key || c; const val = r[key] !== undefined ? r[key] : '';
          const cls = r._style && r._style[key] ? ' class="' + r._style[key] + '"' : '';
          return `<td${cls}>${this._esc(String(val))}</td>`;
        }).join('')}</tr>`).join('');
      }
    } else if (card) {
      // progress card
      const fill = card.querySelector('.bt-progress-fill');
      const pct = card.querySelector('.bt-progress-pct');
      const sub = card.querySelector('[style*="text-dim"]');
      if (fill && data.value !== undefined) {
        fill.style.width = data.value + '%';
        if (pct) pct.textContent = data.value + '%';
        if (sub && data.total) sub.textContent = data.total;
      }
      // stepper
      const sv = document.getElementById('btStepperVal_' + ctrlId);
      if (sv && data.value !== undefined) sv.textContent = data.value;
    }

    if (navigator.vibrate) navigator.vibrate(8);
  },

  _copyCode(ctrlId) {
    const el = document.getElementById('btCtrl_' + ctrlId);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
      Shell.toast('Скопировано');
      if (navigator.vibrate) navigator.vibrate(15);
    });
  },

  // ─── Control actions ────────────────────────────────────────
  _stepperChange(id, min, max, delta) {
    const el = document.getElementById('btStepperVal_' + id);
    if (!el) return;
    let v = parseInt(el.textContent) + delta;
    v = Math.max(min, Math.min(max, v));
    el.textContent = v;
    el.style.transform = 'scale(1.25)';
    setTimeout(() => el.style.transform = '', 120);
    if (navigator.vibrate) navigator.vibrate(12);
    this._sendCommand(id, 'set', v);
  },

  _applyInput(id, btn) {
    const el = document.getElementById('btCtrl_' + id);
    if (!el) return;
    btn.textContent = '✓';
    btn.style.color = '#3bc96b';
    setTimeout(() => { btn.textContent = 'Применить'; btn.style.color = ''; }, 1200);
    if (navigator.vibrate) navigator.vibrate(20);
    this._sendCommand(id, 'set', el.value);
  },

  _uploadList(id, btn) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      btn.textContent = 'Загрузка...';
      if (navigator.vibrate) navigator.vibrate(20);
      // Count lines
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim()).length;
      const st = document.getElementById('btFileStatus_' + id);
      if (st) st.textContent = lines + ' строк загружено';
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> Загрузить список';
      this._sendCommand(id, 'file', text);
    };
    input.click();
  },

  async _sendCommand(ctrlId, action, value, btnEl) {
    if (!this._selected) return;
    if (btnEl) {
      btnEl.disabled = true;
      const orig = btnEl.textContent;
      btnEl.style.opacity = '0.6';
      setTimeout(() => { btnEl.disabled = false; btnEl.style.opacity = ''; }, 600);
    }
    if (navigator.vibrate) navigator.vibrate(18);
    await Shell.api(`/api/mod/bots/${this._selected}/command`, {
      method: 'POST',
      body: JSON.stringify({ ctrl_id: ctrlId, action, value })
    });
  },

  // ─── Stats tab ──────────────────────────────────────────────
  _renderKpi(stats) {
    const row = document.getElementById('btKpiRow');
    if (!row) return;
    const items = stats && stats.kpi ? stats.kpi : [
      { label: 'Обработано', value: '—', delta: null },
      { label: 'Успешно', value: '—', delta: null },
      { label: 'Ошибки', value: '—', delta: null }
    ];
    row.innerHTML = items.map((s, i) => `
      <div class="bt-stat-card" style="animation-delay:${i*0.06}s">
        <div class="bt-stat-val">${this._esc(String(s.value))}</div>
        <div class="bt-stat-label">${this._esc(s.label)}</div>
        ${s.delta ? `<div class="bt-stat-delta ${s.trend || 'up'}">${this._esc(s.delta)}</div>` : ''}
      </div>`).join('');
    this._drawCharts(stats);
  },

  _drawCharts(stats) {
    this._drawLineChart(stats && stats.hourly ? stats.hourly : []);
    this._drawBarChart(stats && stats.daily ? stats.daily : []);
  },

  _drawLineChart(data) {
    const canvas = document.getElementById('btLineChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 600;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!data.length) { this._drawChartEmpty(ctx, W, H); return; }
    const max = Math.max(...data.map(d => d.v || 0), 1);
    const pad = { l: 30, r: 10, t: 10, b: 24 };
    const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
    const isDark = !document.body.classList.contains('theme-light');
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#4a5568' : '#9aa3b0';
    // Grid lines
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const y = pad.t + iH * f;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    });
    // Area fill
    const pts = data.map((d, i) => ({
      x: pad.l + (i / (data.length - 1 || 1)) * iW,
      y: pad.t + iH * (1 - (d.v || 0) / max)
    }));
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + iH);
    grad.addColorStop(0, 'rgba(59,201,107,0.3)');
    grad.addColorStop(1, 'rgba(59,201,107,0)');
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, pad.t + iH);
    ctx.lineTo(pts[0].x, pad.t + iH);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    // Line
    ctx.beginPath(); ctx.strokeStyle = '#3bc96b'; ctx.lineWidth = 2;
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    // Labels
    ctx.fillStyle = textColor; ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
      if (i % Math.ceil(data.length / 6) === 0) {
        ctx.fillText(d.label || '', pad.l + (i / (data.length - 1 || 1)) * iW, H - 4);
      }
    });
  },

  _drawBarChart(data) {
    const canvas = document.getElementById('btBarChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 600;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!data.length) { this._drawChartEmpty(ctx, W, H); return; }
    const max = Math.max(...data.map(d => d.v || 0), 1);
    const pad = { l: 10, r: 10, t: 10, b: 24 };
    const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
    const barW = Math.max(6, iW / data.length - 4);
    const isDark = !document.body.classList.contains('theme-light');
    const textColor = isDark ? '#4a5568' : '#9aa3b0';
    ctx.fillStyle = textColor; ctx.font = '10px JetBrains Mono, monospace'; ctx.textAlign = 'center';
    data.forEach((d, i) => {
      const x = pad.l + (i + 0.5) * (iW / data.length);
      const barH = ((d.v || 0) / max) * iH;
      const y = pad.t + iH - barH;
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, '#5cf08e'); grad.addColorStop(1, '#3bc96b');
      ctx.fillStyle = grad;
      const r = Math.min(4, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x - barW / 2 + r, y); ctx.lineTo(x + barW / 2 - r, y);
      ctx.arcTo(x + barW / 2, y, x + barW / 2, y + r, r);
      ctx.lineTo(x + barW / 2, y + barH); ctx.lineTo(x - barW / 2, y + barH);
      ctx.arcTo(x - barW / 2, y, x - barW / 2 + r, y, r);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = textColor;
      ctx.fillText(d.label || '', x, H - 4);
    });
  },

  _drawChartEmpty(ctx, W, H) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#4a5568'; ctx.font = '12px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Нет данных', W / 2, H / 2 + 4);
  },

  // ─── Log tab ────────────────────────────────────────────────
  addLogLine(level, msg) {
    const console_ = document.getElementById('btLogConsole');
    if (!console_) return;
    const now = new Date();
    const ts = now.toTimeString().slice(0, 8);
    this._logLines.push({ ts, level, msg });
    if (this._logLines.length > this._logMax) this._logLines.shift();
    const line = document.createElement('div');
    line.className = 'bt-log-line';
    line.innerHTML = `<span class="bt-log-time">${ts}</span>
      <span class="bt-log-level ${level}">[${level}]</span>
      <span class="bt-log-msg">${this._esc(msg)}</span>`;
    console_.appendChild(line);
    const countEl = document.getElementById('btLogCount');
    if (countEl) countEl.textContent = this._logLines.length + ' записей';
    if (this._autoScroll) console_.scrollTop = console_.scrollHeight;
  },

  clearLog() {
    this._logLines = [];
    const el = document.getElementById('btLogConsole');
    if (el) el.innerHTML = '';
    const countEl = document.getElementById('btLogCount');
    if (countEl) countEl.textContent = '0 записей';
    if (navigator.vibrate) navigator.vibrate(20);
  },

  onAutoScrollChange(val) {
    this._autoScroll = val;
    if (val) {
      const el = document.getElementById('btLogConsole');
      if (el) el.scrollTop = el.scrollHeight;
    }
    if (navigator.vibrate) navigator.vibrate(15);
  },

  // ─── Settings tab ────────────────────────────────────────────
  _renderSettings(b) {
    const nameEl = document.getElementById('btSettingsName');
    if (nameEl) nameEl.value = b.name || '';
    // API key (masked)
    this._apiKeyFull = b.api_key || '';
    this._apiKeyVisible = false;
    const keyEl = document.getElementById('btApiKeyInput');
    if (keyEl) keyEl.value = this._apiKeyFull ? '•'.repeat(Math.min(32, this._apiKeyFull.length)) : '';
    this._renderAccessList(b.access || []);
  },

  _renderAccessList(users) {
    const list = document.getElementById('btAccessList');
    if (!list) return;
    list.innerHTML = users.length ? users.map(u => `
      <div class="bt-access-row">
        <div class="bt-access-ava">${u.avatar ? `<img src="data:image/jpeg;base64,${u.avatar}"/>` : this._esc((u.display_name || u.username || '?').charAt(0).toUpperCase())}</div>
        <div class="bt-access-name">${this._esc(u.display_name || u.username)}</div>
        <span class="bt-access-role">${this._esc(u.role || '')}</span>
        <button class="bt-access-remove" onclick="Bots._removeAccess('${u.id}')" title="Убрать доступ">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`) .join('') : '<div style="font-size:12px;color:var(--text-dim);padding:4px 0">Доступ только у владельца</div>';
  },

  toggleApiKey() {
    this._apiKeyVisible = !this._apiKeyVisible;
    const el = document.getElementById('btApiKeyInput');
    if (el) el.value = this._apiKeyVisible ? this._apiKeyFull : '•'.repeat(Math.min(32, this._apiKeyFull.length));
    if (navigator.vibrate) navigator.vibrate(12);
  },

  copyApiKey() {
    if (!this._apiKeyFull) return;
    navigator.clipboard.writeText(this._apiKeyFull).then(() => {
      Shell.toast('API-ключ скопирован');
      if (navigator.vibrate) navigator.vibrate(20);
    });
  },

  async saveBotName() {
    const el = document.getElementById('btSettingsName');
    if (!el || !this._selected) return;
    const name = el.value.trim();
    if (!name) return;
    if (navigator.vibrate) navigator.vibrate(20);
    const d = await Shell.api(`/api/mod/bots/${this._selected}`, {
      method: 'PUT',
      body: JSON.stringify({ name })
    });
    if (d && d.ok) {
      const b = this._bots.find(x => x.id === this._selected);
      if (b) { b.name = name; this._renderList(); this._openBot(this._selected); }
      Shell.toast('Название обновлено');
    }
  },

  async regenApiKey() {
    if (!this._selected) return;
    if (!confirm('Перегенерировать API-ключ? Старый ключ перестанет работать.')) return;
    if (navigator.vibrate) navigator.vibrate(30);
    const d = await Shell.api(`/api/mod/bots/${this._selected}/regen_key`, { method: 'POST' });
    if (d && d.api_key) {
      this._apiKeyFull = d.api_key;
      this._apiKeyVisible = true;
      const el = document.getElementById('btApiKeyInput');
      if (el) el.value = d.api_key;
      Shell.toast('Ключ обновлён — сохраните его');
    }
  },

  async _removeAccess(userId) {
    if (!this._selected) return;
    if (navigator.vibrate) navigator.vibrate(20);
    await Shell.api(`/api/mod/bots/${this._selected}/access`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: userId })
    });
    await this._loadBotDetails(this._selected);
  },

  async confirmDeleteBot() {
    if (!this._selected) return;
    const b = this._bots.find(x => x.id === this._selected);
    if (!confirm(`Удалить бота "${b ? b.name : ''}"? Это действие нельзя отменить.`)) return;
    if (navigator.vibrate) navigator.vibrate(40);
    await Shell.api(`/api/mod/bots/${this._selected}`, { method: 'DELETE' });
    this._selected = null;
    document.getElementById('btEmpty').style.display = 'flex';
    document.getElementById('btWorkspace').style.display = 'none';
    await this.loadBots();
    Shell.toast('Бот удалён');
  },

  // ─── Tab switching ───────────────────────────────────────────
  switchTab(tab) {
    const b = this._bots.find(x => x.id === this._selected);
    const isOffline = b && b.status === 'offline';
    if (isOffline && tab !== 'settings') return;
    document.querySelectorAll('.bt-tab').forEach(t => t.classList.toggle('active', t.id === 'btTab-' + tab));
    document.querySelectorAll('.bt-pane').forEach(p => p.classList.toggle('active', p.id === 'btPane-' + tab));
    if (isOffline && tab === 'settings') {
      document.getElementById('btOfflineState').style.display = 'none';
      document.getElementById('btPanes').style.display = 'block';
      document.getElementById('btPanes').style.position = 'relative';
      document.getElementById('btPanes').style.flex = '1';
      document.getElementById('btPanes').style.overflow = 'hidden';
    }
    if (navigator.vibrate) navigator.vibrate(8);
    if (tab === 'stats') {
      setTimeout(() => {
        this._drawCharts(b && b.stats ? b.stats : null);
      }, 50);
    }
    if (tab === 'log' && this._autoScroll) {
      setTimeout(() => {
        const el = document.getElementById('btLogConsole');
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }
    if (tab === 'settings') {
      if (b) this._renderSettings(b);
    }
  },

  // ─── Mobile sidebar ─────────────────────────────────────────
  openSidebar() {
    document.querySelector('.bt-wrap').classList.remove('mob-bot-open');
    if (navigator.vibrate) navigator.vibrate(8);
  },

  closeSidebar() {
    document.querySelector('.bt-wrap').classList.add('mob-bot-open');
  },

  // ─── Add Bot modal ──────────────────────────────────────────
  openAddModal() {
    document.getElementById('btAddStep1').style.display = 'block';
    document.getElementById('btAddStep2').style.display = 'none';
    document.getElementById('btNewBotName').value = '';
    document.getElementById('btNewBotGroup').value = '';
    // Populate group datalist from existing bots
    const dl = document.getElementById('btGroupList');
    if (dl) {
      const groups = [...new Set(this._bots.map(b => b.group).filter(g => g && g !== 'Без группы'))];
      dl.innerHTML = groups.map(g => `<option value="${this._esc(g)}">`).join('');
    }
    document.getElementById('btAddModal').classList.add('active');
    setTimeout(() => document.getElementById('btNewBotName').focus(), 80);
    if (navigator.vibrate) navigator.vibrate(15);
  },

  closeAddModal() {
    document.getElementById('btAddModal').classList.remove('active');
  },

  async createBot() {
    const name = document.getElementById('btNewBotName').value.trim();
    const group = document.getElementById('btNewBotGroup').value.trim();
    if (!name) { document.getElementById('btNewBotName').focus(); return; }
    if (navigator.vibrate) navigator.vibrate(20);
    const d = await Shell.api('/api/mod/bots/create', {
      method: 'POST',
      body: JSON.stringify({ name, group: group || 'Без группы' })
    });
    if (!d || !d.bot) { Shell.toast('Ошибка создания бота', 'error'); return; }
    this._bots.push(d.bot);
    this._renderList();
    // Show step 2
    document.getElementById('btAddStep1').style.display = 'none';
    document.getElementById('btAddStep2').style.display = 'block';
    document.getElementById('btCreatedKey').value = d.api_key;
    this._updateSnippets(d.api_key, name);
  },

  copyCreatedKey() {
    const el = document.getElementById('btCreatedKey');
    if (!el) return;
    navigator.clipboard.writeText(el.value).then(() => {
      Shell.toast('API-ключ скопирован');
      if (navigator.vibrate) navigator.vibrate(20);
    });
  },

  switchSnippet(mode) {
    this._snippetMode = mode;
    document.querySelectorAll('.bt-snip-tab').forEach(t => t.classList.toggle('active', t.id === 'btSnipTab-' + mode));
    document.getElementById('btSnippetCs').style.display = mode === 'cs' ? 'block' : 'none';
    document.getElementById('btSnippetZp').style.display = mode === 'zp' ? 'block' : 'none';
    if (navigator.vibrate) navigator.vibrate(10);
  },

  _updateSnippets(key, name) {
    const host = location.origin;
    document.getElementById('btSnippetCs').textContent =
`// Horseoff Bot Connector — C#
// Добавьте в отдельный поток ZennoPoster

using System.Net.WebSockets;
using System.Text;
using Newtonsoft.Json;

string API_KEY = "${key}";
string WS_URL  = "${host.replace('http', 'ws')}/ws/bots";

var ws = new ClientWebSocket();
await ws.ConnectAsync(new Uri(WS_URL), CancellationToken.None);

// 1. Авторизация
var auth = JsonConvert.SerializeObject(new { type = "auth", api_key = API_KEY });
await ws.SendAsync(Encoding.UTF8.GetBytes(auth), WebSocketMessageType.Text, true, default);

// 2. Отправить манифест (описание элементов управления)
var manifest = JsonConvert.SerializeObject(new {
    type    = "manifest",
    name    = "${name}",
    version = "1.0",
    controls = new[] {
        new { type = "input",  id = "target", label = "Целевой аккаунт" },
        new { type = "button", id = "start",  label = "Запустить", style = "primary" },
        new { type = "button", id = "stop",   label = "Стоп",      style = "danger"  }
    }
});
await ws.SendAsync(Encoding.UTF8.GetBytes(manifest), WebSocketMessageType.Text, true, default);

// 3. Основной цикл — получать команды / слать данные
while (ws.State == WebSocketState.Open) {
    var buf = new byte[8192];
    var result = await ws.ReceiveAsync(buf, default);
    var msg = JsonConvert.DeserializeObject<dynamic>(
        Encoding.UTF8.GetString(buf, 0, result.Count));

    if (msg.type == "command") {
        // msg.ctrl_id, msg.action, msg.value
        HandleCommand(msg);
    }

    // Отправить данные (лог, прогресс, статистику)
    await SendData(ws, new { type = "log", level = "INFO", msg = "Шаг выполнен" });
}`;

    document.getElementById('btSnippetZp').textContent =
`' Horseoff Bot Connector — ZennoPoster (VB-style pseudo-code)
' Создайте отдельный поток и вставьте C#-действие

Dim apiKey As String = "${key}"
Dim wsUrl  As String = "${host.replace('http', 'ws')}/ws/bots"

' Используйте C#-действие внутри ZennoPoster:
' Вставьте код из вкладки C# в блок "Запустить C# код"
' Поток должен быть помечен как фоновый (Background thread)

' Пример отправки данных из основного потока:
project.Variables["hoz_cmd"].Value = "start"

' Пример получения команды:
If project.Variables["hoz_cmd"].Value = "stop" Then
    ' остановить задачи
End If`;

    this._snippetMode = 'cs';
    this.switchSnippet('cs');
  },

  // ─── Access modal ────────────────────────────────────────────
  async openAccessModal() {
    const d = await Shell.api('/api/mod/channels/users');
    const list = document.getElementById('btAccessUserList');
    if (!list) return;
    const b = this._bots.find(x => x.id === this._selected);
    const existing = b && b.access ? b.access.map(u => u.id) : [];
    const users = d && d.users ? d.users : [];
    list.innerHTML = users.map(u => `
      <div class="bt-access-user-item${existing.includes(u.id) ? ' already' : ''}" onclick="Bots._grantAccess('${u.id}')">
        <div class="bt-access-ava">${u.avatar ? `<img src="data:image/jpeg;base64,${u.avatar}"/>` : this._esc((u.display_name || u.username || '?').charAt(0).toUpperCase())}</div>
        <div class="bt-access-name">${this._esc(u.display_name || u.username)}</div>
        <span class="bt-access-role">${this._esc(u.role || '')}</span>
        ${existing.includes(u.id) ? '<span style="font-size:11px;color:var(--accent);margin-left:auto">уже есть</span>' : ''}
      </div>`).join('');
    document.getElementById('btAccessModal').classList.add('active');
    if (navigator.vibrate) navigator.vibrate(15);
  },

  closeAccessModal() {
    document.getElementById('btAccessModal').classList.remove('active');
  },

  async _grantAccess(userId) {
    if (!this._selected) return;
    if (navigator.vibrate) navigator.vibrate(20);
    await Shell.api(`/api/mod/bots/${this._selected}/access`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
    this.closeAccessModal();
    await this._loadBotDetails(this._selected);
  },

  // ─── Test bot ────────────────────────────────────────────────
  toggleTestBot() {
    this._testBotEnabled = !this._testBotEnabled;
    const btn = document.getElementById('btDemoToggle');
    if (btn) btn.classList.toggle('demo-on', this._testBotEnabled);
    if (navigator.vibrate) navigator.vibrate(20);
    if (this._testBotEnabled) {
      this._bots.unshift(Object.assign({}, this._TEST_BOT));
      this._renderList();
      this._openBot('__test__');
      // Inject some demo log lines after a short delay
      setTimeout(() => {
        if (this._selected === '__test__') this.switchTab('log');
        const levels = ['INFO','INFO','WARN','INFO','INFO','ERROR','INFO'];
        const msgs = [
          'Бот запущен, подключение к API...',
          'Авторизация прошла успешно',
          'Задержка API > 500ms, переключаюсь на резервный',
          'Обработано 100 аккаунтов',
          'Успешно: 94 / Ошибки: 6',
          'Connection timeout — retry 1/3',
          'Задача завершена, ожидаю следующую итерацию'
        ];
        levels.forEach((l, i) => setTimeout(() => this.addLogLine(l, msgs[i]), i * 300));
      }, 300);
    } else {
      this._bots = this._bots.filter(b => b.id !== '__test__');
      this._renderList();
      if (this._selected === '__test__') {
        this._selected = null;
        document.getElementById('btEmpty').style.display = 'flex';
        document.getElementById('btWorkspace').style.display = 'none';
      }
    }
  },

  // ─── WebSocket messages from Shell ────────────────────────────
  onWS(data) {
    if (data.type === 'bot_update') {
      const { bot_id, status, controls, version, sub } = data;
      const idx = this._bots.findIndex(b => b.id === bot_id);
      if (idx >= 0) {
        if (status !== undefined) this._bots[idx].status = status;
        if (version !== undefined) this._bots[idx].version = version;
        if (sub !== undefined) this._bots[idx].sub = sub;
        // Update dot in list
        const row = document.querySelector(`.bt-bot-row[data-bot-id="${bot_id}"]`);
        if (row) {
          const dot = row.querySelector('.bt-dot');
          if (dot) dot.className = 'bt-dot ' + (status || 'offline');
          row.classList.toggle('offline-bot', status === 'offline');
        }
        // If this bot is open, refresh workspace
        if (this._selected === bot_id) {
          this._openBot(bot_id);
          if (controls && status === 'online') {
            this._bots[idx].controls = controls;
            this.renderControls(controls);
          }
        }
      }
    } else if (data.type === 'bot_log') {
      if (this._selected === data.bot_id) {
        this.addLogLine(data.level || 'INFO', data.msg || '');
      }
    } else if (data.type === 'ctrl_update') {
      if (this._selected === data.bot_id) {
        this._updateCtrl(data.ctrl_id, data.data || {});
      }
    }
  },

  // ─── Helpers ─────────────────────────────────────────────────
  _esc(t) { const d = document.createElement('div'); d.textContent = String(t || ''); return d.innerHTML; },

  _relTime(ts) {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return 'только что';
    if (diff < 3600) return Math.floor(diff / 60) + ' мин назад';
    if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
    return Math.floor(diff / 86400) + ' дн назад';
  },

  _plural(n, f1, f2, f5) {
    const mod = n % 100;
    if (mod >= 11 && mod <= 14) return f5;
    const m = n % 10;
    if (m === 1) return f1;
    if (m >= 2 && m <= 4) return f2;
    return f5;
  }
};

window.Bots = Bots; Bots.init();
