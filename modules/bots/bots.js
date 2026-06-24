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
  _editMode: false,
  _orderedControls: [],
  _dragState: null,
  _newBotAvatar: '',

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
          <button class="bt-group-rename" onclick="event.stopPropagation();Bots.renameGroup('${this._esc(gname).replace(/'/g, "\\'")}')" title="Переименовать группу">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
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
    const ava = b.avatar
      ? `<div class="bt-bot-ava"><img src="${this._esc(b.avatar)}" /><div class="bt-ava-dot ${b.status}"></div></div>`
      : `<div class="bt-dot ${b.status}"></div>`;
    return `<div class="bt-bot-row${activeCls}${offlineCls}" onclick="Bots._openBot('${b.id}')"
      style="animation-delay:${delay}s" data-bot-id="${b.id}">
      ${ava}
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
    document.querySelectorAll('.bt-tab').forEach(t => {
      t.classList.toggle('bt-tab-disabled', t.id !== 'btTab-settings');
    });
    // Disable edit button, exit edit mode if active
    const editBtn = document.getElementById('btEditBtn');
    const sortBtn = document.getElementById('btSortBtn');
    if (editBtn) { editBtn.disabled = true; editBtn.title = 'Недоступно офлайн'; }
    if (sortBtn) sortBtn.style.display = 'none';
    if (this._editMode) { this._editMode = false; if (editBtn) editBtn.classList.remove('btn-icon-only--active'); }
  },

  _showOnlineState(b) {
    document.getElementById('btOfflineState').style.display = 'none';
    document.getElementById('btTabs').style.display = 'flex';
    document.getElementById('btPanes').style.display = 'block';
    document.querySelectorAll('.bt-tab').forEach(t => t.classList.remove('bt-tab-disabled'));
    document.getElementById('btPanes').style.position = 'relative';
    document.getElementById('btPanes').style.flex = '1';
    document.getElementById('btPanes').style.overflow = 'hidden';
    const editBtn = document.getElementById('btEditBtn');
    if (editBtn) { editBtn.disabled = false; editBtn.title = 'Редактировать'; }
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

  // ─── Grid layout constants ───────────────────────────────────
  _getGridCols() { return window.innerWidth <= 768 ? 2 : 8; },
  _ROW_PX: 90,  // one row unit height in px (excl. gap)
  _GAP_PX: 10,

  _defHeight(type) {
    return {textarea:2,table:3,code:2,image:2,section:3,stat:1}[type] || 1;
  },

  _defWidth(type) {
    return {section:8,input:8,textarea:8,slider:8,progress:8,table:8,code:8,stat:4}[type] || 4;
  },

  _minWidth(type) {
    return {section:2,input:2,textarea:2,slider:2,progress:2,table:4,code:4,stat:1,image:2}[type] || 2;
  },

  _minHeight(type) {
    return {textarea:2,image:1}[type] || 1;
  },

  // Groups flat _orderedControls into [{section, children}] for rendering
  _groupControls() {
    const groups = [];
    let cur = null;
    this._orderedControls.forEach(ctrl => {
      if (ctrl.type === 'section') {
        cur = { section: ctrl, children: [] };
        groups.push(cur);
      } else if (cur) {
        cur.children.push(ctrl);
      } else {
        if (!groups.length || groups[groups.length-1].section) groups.push({ section: null, children: [] });
        groups[groups.length-1].children.push(ctrl);
      }
    });
    return groups;
  },

  // Calculates the pixel height a section-wrap needs to show all its children
  _calcSectionHeight(children, sw) {
    const HEADER = 26, GAP = 8, PAD_BOT = 5;
    if (!children.length) return HEADER + GAP + PAD_BOT;
    // Simulate inner grid auto-placement (greedy row-major)
    let col = 0, row = 0, rowH = 1, innerRows = 0;
    children.forEach(ctrl => {
      const cw = Math.min(ctrl._w || this._defWidth(ctrl.type), sw);
      const ch = ctrl._h || this._defHeight(ctrl.type);
      if (col + cw > sw) { innerRows += rowH; row = innerRows; col = 0; rowH = 1; }
      rowH = Math.max(rowH, ch);
      col += cw;
      if (col >= sw) { innerRows += rowH; row = innerRows; col = 0; rowH = 1; }
    });
    if (col > 0) innerRows += rowH; // last partial row
    innerRows = Math.max(1, innerRows);
    const innerH = innerRows * this._ROW_PX + (innerRows - 1) * this._GAP_PX;
    return HEADER + GAP + innerH + PAD_BOT;
  },

  // ─── Render controls (flat 8-col grid with explicit placement) ─
  renderControls(controls) {
    // Assign IDs then expand stats → individual stat items
    controls.forEach((ctrl, i) => { if (!ctrl.id) ctrl.id = ctrl.type + '_' + i; });
    const flat = [];
    controls.forEach(ctrl => {
        if (ctrl.type === 'stats') {
            (ctrl.items || []).forEach((item, j) => {
                flat.push({ type: 'stat', id: ctrl.id + '__' + (item.id || j), _item: item });
            });
        } else {
            flat.push(ctrl);
        }
    });
    controls = flat;

    const b = this._bots.find(x => x.id === this._selected);
    const savedLayout = b && b.layout && b.layout.length ? b.layout : null;
    const cols = this._getGridCols();

    if (savedLayout) {
      const byId = {};
      controls.forEach(c => { byId[c.id] = c; });
      this._orderedControls = [];
      savedLayout.forEach(l => {
        const c = byId[l.id];
        if (c) {
          this._orderedControls.push({...c, _w: Math.min(l.w || this._defWidth(c.type), cols), _h: l.h || this._defHeight(c.type)});
          delete byId[l.id];
        }
      });
      Object.values(byId).forEach(c => this._orderedControls.push({...c, _w: Math.min(this._defWidth(c.type), cols), _h: this._defHeight(c.type)}));
    } else {
      this._orderedControls = controls.map(c => ({...c, _w: Math.min(this._defWidth(c.type), cols), _h: this._defHeight(c.type)}));
    }

    this._renderControlsDOM(true);
  },

  _renderControlsDOM(rebuild) {
    const grid = document.getElementById('btControlsGrid');
    if (!grid) return;
    const cols = this._getGridCols();
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.classList.toggle('bt-edit-mode', this._editMode);

    grid.innerHTML = '';

    const groups = this._groupControls();

    groups.forEach(group => {
      if (group.section) {
        const sect = group.section;
        const sw = Math.min(sect._w || this._defWidth('section'), cols);
        // Section height is calculated from content — no grid-row span
        const sectionH = this._calcSectionHeight(group.children, sw);

        const wrap = document.createElement('div');
        wrap.className = 'bt-section-wrap';
        wrap.dataset.ctrlId = sect.id;
        wrap.style.gridColumn = `span ${sw}`;
        wrap.style.height = `${sectionH}px`;

        const header = document.createElement('div');
        header.className = 'bt-section-divider';
        header.innerHTML = `<div class="bt-section-divider-line"></div>
          <span class="bt-section-divider-label">${this._esc(sect.label)}</span>
          <div class="bt-section-divider-line"></div>`;
        wrap.appendChild(header);

        const innerGrid = document.createElement('div');
        innerGrid.className = 'bt-section-inner-grid';
        innerGrid.style.gridTemplateColumns = `repeat(${sw}, 1fr)`;

        group.children.forEach(ctrl => {
          const el = this._buildControl(ctrl);
          if (!el) return;
          el.dataset.ctrlId = ctrl.id;
          el.dataset.parentSection = sect.id;
          const cw = Math.min(ctrl._w || this._defWidth(ctrl.type), sw);
          const ch = ctrl._h || this._defHeight(ctrl.type);
          el.style.gridColumn = `span ${cw}`;
          el.style.gridRow = `span ${ch}`;
          if (this._editMode) this._addEditHandles(el, ctrl.id, ctrl.type, cw, ch, sw);
          innerGrid.appendChild(el);
        });

        wrap.appendChild(innerGrid);

        if (this._editMode) {
          wrap.style.position = 'relative';
          const grip = document.createElement('div');
          grip.className = 'bt-edit-handle bt-sect-handle';
          grip.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.8"/><circle cx="15" cy="5" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="19" r="1.8"/><circle cx="15" cy="19" r="1.8"/></svg>';
          grip.addEventListener('pointerdown', ev => this._startDrag(ev, sect.id));
          wrap.appendChild(grip);
          const badge = document.createElement('div');
          badge.className = 'bt-edit-size-badge bt-sect-handle';
          badge.textContent = `${sw}×`;
          wrap.appendChild(badge);
          // Width resize only — height is auto-calculated
          const rw = document.createElement('div');
          rw.className = 'bt-resize-handle bt-rh-w bt-sect-handle';
          rw.innerHTML = '<svg width="6" height="14" viewBox="0 0 6 20" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="2" x2="2" y2="18"/><line x1="5" y1="2" x2="5" y2="18"/></svg>';
          rw.addEventListener('pointerdown', ev => this._startResize(ev, sect.id, 'w'));
          wrap.appendChild(rw);
        }

        grid.appendChild(wrap);
      } else {
        group.children.forEach(ctrl => {
          const el = this._buildControl(ctrl);
          if (!el) return;
          el.dataset.ctrlId = ctrl.id;
          const w = Math.min(ctrl._w || this._defWidth(ctrl.type), cols);
          const h = ctrl._h || this._defHeight(ctrl.type);
          el.style.gridColumn = `span ${w}`;
          // Explicit pixel height — no grid-auto-rows dependency for outer grid
          el.style.height = `${h * this._ROW_PX + (h - 1) * this._GAP_PX}px`;
          if (this._editMode) this._addEditHandles(el, ctrl.id, ctrl.type, w, h, cols);
          grid.appendChild(el);
        });
      }
    });
  },

  // ─── Edit mode ───────────────────────────────────────────────
  toggleEditMode() {
    if (!this._orderedControls.length) return;
    this._editMode = !this._editMode;
    const btn = document.getElementById('btEditBtn');
    const sortBtn = document.getElementById('btSortBtn');
    if (btn) btn.classList.toggle('btn-icon-only--active', this._editMode);
    if (sortBtn) sortBtn.style.display = this._editMode ? '' : 'none';
    if (this._editMode) {
      Shell.toast('Режим редактирования: перетаскивайте и тяните за угол');
      if (navigator.vibrate) navigator.vibrate([8, 40, 8]);
    } else {
      this._saveLayout();
    }
    this._renderControlsDOM(false);
  },

  _autoSort() {
    if (!this._editMode || !this._orderedControls.length) return;
    // Separate sections from non-sections, keep sections in order
    const sections = this._orderedControls.filter(c => c.type === 'section');
    const nonSections = this._orderedControls.filter(c => c.type !== 'section');
    // Sort non-sections by area desc (tallest/widest first)
    nonSections.sort((a, b) => {
      const aH = a._h || this._defHeight(a.type);
      const bH = b._h || this._defHeight(b.type);
      const aW = a._w || this._defWidth(a.type);
      const bW = b._w || this._defWidth(b.type);
      return (bH * bW) - (aH * aW) || bH - aH || bW - aW;
    });
    // Rebuild: place sections evenly, distribute non-sections between them
    if (!sections.length) {
      this._orderedControls = nonSections;
    } else {
      const perSection = Math.ceil(nonSections.length / sections.length);
      const result = [];
      sections.forEach((sec, i) => {
        result.push(sec);
        const chunk = nonSections.splice(0, perSection);
        chunk.forEach(c => result.push(c));
      });
      this._orderedControls = result;
    }
    this._renderControlsDOM(false);
    Shell.toast('Элементы перестроены по оптимальной схеме');
  },

  _addEditHandles(el, ctrlId, type, w, h, cols) {
    el.style.position = 'relative';

    const grip = document.createElement('div');
    grip.className = 'bt-edit-handle';
    grip.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.8"/><circle cx="15" cy="5" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="19" r="1.8"/><circle cx="15" cy="19" r="1.8"/></svg>';
    grip.addEventListener('pointerdown', e => this._startDrag(e, ctrlId));
    el.appendChild(grip);

    const badge = document.createElement('div');
    badge.className = 'bt-edit-size-badge';
    badge.textContent = `${w}×${h}`;
    el.appendChild(badge);

    // Right edge: width resize
    const rw = document.createElement('div');
    rw.className = 'bt-resize-handle bt-rh-w';
    rw.innerHTML = '<svg width="6" height="14" viewBox="0 0 6 20" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="2" x2="2" y2="18"/><line x1="5" y1="2" x2="5" y2="18"/></svg>';
    rw.addEventListener('pointerdown', e => this._startResize(e, ctrlId, 'w'));
    el.appendChild(rw);

    // Bottom edge: height resize (not for sections)
    if (type !== 'section') {
        const rh = document.createElement('div');
        rh.className = 'bt-resize-handle bt-rh-h';
        rh.innerHTML = '<svg width="14" height="6" viewBox="0 0 20 6" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="2" x2="18" y2="2"/><line x1="2" y1="5" x2="18" y2="5"/></svg>';
        rh.addEventListener('pointerdown', e => this._startResize(e, ctrlId, 'h'));
        el.appendChild(rh);
    }
  },

  _startDrag(e, ctrlId) {
    if (e.button && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const ctrl = this._orderedControls.find(c => c.id === ctrlId);
    if (!ctrl) return;
    const isSection = ctrl.type === 'section';

    const card = document.querySelector(`[data-ctrl-id="${ctrlId}"]`);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const parentSect = card.dataset.parentSection || null;

    const ghost = card.cloneNode(true);
    ghost.querySelectorAll('.bt-edit-handle,.bt-resize-handle,.bt-edit-size-badge').forEach(h => h.remove());
    Object.assign(ghost.style, {
      position:'fixed', left:rect.left+'px', top:rect.top+'px',
      width:rect.width+'px', height:rect.height+'px',
      pointerEvents:'none', zIndex:'9999', margin:'0',
      opacity:'0.88', boxShadow:'0 12px 40px rgba(0,0,0,0.3)',
      transform:'scale(1.03)', borderStyle:'solid',
    });
    document.body.appendChild(ghost);
    card.classList.add('bt-drag-source');

    let targetCtrlId = null, targetBefore = true;

    const onMove = ev => {
      ghost.style.transform = `translate(${ev.clientX-e.clientX}px,${ev.clientY-e.clientY}px) scale(1.03)`;
      ghost.style.pointerEvents = 'none';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      ghost.style.pointerEvents = '';
      const tc = under && under.closest('[data-ctrl-id]');
      let newId = null;
      if (tc && tc.dataset.ctrlId !== ctrlId) {
        if (isSection) {
          const tcCtrl = this._orderedControls.find(c => c.id === tc.dataset.ctrlId);
          if (tcCtrl && tcCtrl.type === 'section') newId = tc.dataset.ctrlId;
        } else {
          // Allow dropping on any card or section-wrap (cross-section move)
          newId = tc.dataset.ctrlId;
        }
      }
      if (newId) {
        const tcEl = document.querySelector(`[data-ctrl-id="${newId}"]`);
        const tr = tcEl.getBoundingClientRect();
        const before = ev.clientY < tr.top + tr.height / 2;
        if (newId !== targetCtrlId || before !== targetBefore) {
          targetCtrlId = newId; targetBefore = before;
          document.querySelectorAll('[data-ctrl-id]').forEach(c => c.classList.remove('bt-drop-before','bt-drop-after'));
          tcEl.classList.add(before ? 'bt-drop-before' : 'bt-drop-after');
        }
      } else {
        document.querySelectorAll('[data-ctrl-id]').forEach(c => c.classList.remove('bt-drop-before','bt-drop-after'));
        targetCtrlId = null;
      }
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      ghost.remove();
      card.classList.remove('bt-drag-source');
      document.querySelectorAll('[data-ctrl-id]').forEach(c => c.classList.remove('bt-drop-before','bt-drop-after'));

      if (targetCtrlId && targetCtrlId !== ctrlId) {
        const snap = new Map();
        document.querySelectorAll('[data-ctrl-id]').forEach(el => snap.set(el.dataset.ctrlId, el.getBoundingClientRect()));

        if (isSection) {
          const groups = this._groupControls();
          const dragGroup = groups.find(g => g.section && g.section.id === ctrlId);
          const targetGroup = groups.find(g => g.section && g.section.id === targetCtrlId);
          if (dragGroup && targetGroup) {
            const dragItems = [dragGroup.section, ...dragGroup.children];
            dragItems.forEach(item => {
              const idx = this._orderedControls.indexOf(item);
              if (idx >= 0) this._orderedControls.splice(idx, 1);
            });
            let ti = this._orderedControls.indexOf(targetGroup.section);
            if (!targetBefore) {
              let end = ti + 1;
              while (end < this._orderedControls.length && this._orderedControls[end].type !== 'section') end++;
              ti = end;
            }
            this._orderedControls.splice(Math.max(0, ti), 0, ...dragItems);
          }
        } else {
          const fi = this._orderedControls.findIndex(c => c.id === ctrlId);
          const [item] = this._orderedControls.splice(fi, 1);
          const targetCtrl = this._orderedControls.find(c => c.id === targetCtrlId);
          let ti = this._orderedControls.findIndex(c => c.id === targetCtrlId);
          if (targetCtrl && targetCtrl.type === 'section') {
            // Dropped on a section header — insert as first child of that section
            ti = ti + 1;
          } else {
            if (!targetBefore) ti++;
          }
          this._orderedControls.splice(Math.max(0, ti), 0, item);
        }

        this._renderControlsDOM(true);

        requestAnimationFrame(() => {
          document.querySelectorAll('[data-ctrl-id]').forEach(el => {
            const old = snap.get(el.dataset.ctrlId);
            if (!old) return;
            const cur = el.getBoundingClientRect();
            const dx = old.left - cur.left, dy = old.top - cur.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            el.style.transition = 'none';
            el.style.transform = `translate(${dx}px,${dy}px)`;
            requestAnimationFrame(() => {
              el.style.transition = 'transform 0.32s cubic-bezier(.4,0,.2,1)';
              el.style.transform = '';
              el.addEventListener('transitionend', () => { el.style.transition=''; el.style.transform=''; }, {once:true});
            });
          });
        });
      }
      if (navigator.vibrate) navigator.vibrate(15);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  },

  _startResize(e, ctrlId, dir) {
    e.preventDefault(); e.stopPropagation();
    const card = document.querySelector(`[data-ctrl-id="${ctrlId}"]`);
    if (!card) return;
    const ctrl = this._orderedControls.find(c => c.id === ctrlId);
    if (!ctrl) return;

    const isSection = ctrl.type === 'section';
    const grid = document.getElementById('btControlsGrid');
    const cols = this._getGridCols();
    const startW = ctrl._w || this._defWidth(ctrl.type);
    const startH = ctrl._h || this._defHeight(ctrl.type);
    const minW = this._minWidth(ctrl.type);
    const minH = this._minHeight(ctrl.type);
    const startX = e.clientX, startY = e.clientY;
    const cellW = (grid.clientWidth - this._GAP_PX * (cols - 1)) / cols;

    card.classList.add('bt-resizing');
    document.body.style.cursor = dir === 'w' ? 'ew-resize' : 'ns-resize';

    const onMove = ev => {
        if (dir === 'w') {
            const newW = Math.max(minW, Math.min(cols, startW + Math.round((ev.clientX - startX) / cellW)));
            if (newW !== ctrl._w) {
                ctrl._w = newW;
                card.style.gridColumn = `span ${newW}`;
                const badge = card.querySelector('.bt-edit-size-badge');
                if (isSection) {
                    const innerGrid = card.querySelector('.bt-section-inner-grid');
                    if (innerGrid) innerGrid.style.gridTemplateColumns = `repeat(${newW}, 1fr)`;
                    // Recalculate section height for new width
                    const groups = this._groupControls();
                    const grp = groups.find(g => g.section && g.section.id === ctrlId);
                    if (grp) card.style.height = `${this._calcSectionHeight(grp.children, newW)}px`;
                    if (badge) badge.textContent = `${newW}×`;
                } else {
                    if (badge) badge.textContent = `${newW}×${ctrl._h || startH}`;
                }
            }
        } else {
            const newH = Math.max(minH, startH + Math.round((ev.clientY - startY) / (this._ROW_PX + this._GAP_PX)));
            if (newH !== ctrl._h) {
                ctrl._h = newH;
                // Use explicit pixel height (outer grid has no grid-auto-rows)
                card.style.height = `${newH * this._ROW_PX + (newH - 1) * this._GAP_PX}px`;
                const badge = card.querySelector('.bt-edit-size-badge');
                if (badge) badge.textContent = `${ctrl._w || startW}×${newH}`;
            }
        }
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      card.classList.remove('bt-resizing');
      document.body.style.cursor = '';
      if (navigator.vibrate) navigator.vibrate(10);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  },

  async _saveLayout() {
    if (!this._selected || this._selected === '__test__' || !this._orderedControls.length) return;
    const layout = this._orderedControls.map(c => ({
      id: c.id,
      w: c._w || this._defWidth(c.type),
      h: c._h || this._defHeight(c.type),
    }));
    const b = this._bots.find(x => x.id === this._selected);
    if (b) b.layout = layout;
    const d = await Shell.api(`/api/mod/bots/${this._selected}/layout`, {
      method: 'POST', body: JSON.stringify({layout})
    });
    if (d && d.ok) Shell.toast('Расположение сохранено');
  },

  _buildControl(ctrl) {
    const wrap = document.createElement('div');
    switch (ctrl.type) {
      case 'section':
        return null;

      case 'buttons':
        wrap.className = 'bt-ctrl-card bt-ctrl--buttons';
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
        wrap.className = 'bt-ctrl-card bt-ctrl--input';
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <div class="bt-input-row">
            <input class="bt-input" id="btCtrl_${ctrl.id}" placeholder="${this._esc(ctrl.placeholder || '')}" value="${this._esc(ctrl.value || '')}"/>
            <button class="btn btn-secondary" onclick="Bots._applyInput('${ctrl.id}', this)">${this._esc(ctrl.apply_label || 'Применить')}</button>
          </div>`;
        return wrap;

      case 'textarea':
        wrap.className = 'bt-ctrl-card bt-ctrl--textarea';
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <textarea class="bt-textarea" id="btCtrl_${ctrl.id}" placeholder="${this._esc(ctrl.placeholder || '')}">${this._esc(ctrl.value || '')}</textarea>
          <button class="btn btn-secondary" style="align-self:flex-end;margin-top:6px" onclick="Bots._applyInput('${ctrl.id}', this)">${this._esc(ctrl.apply_label || 'Сохранить')}</button>`;
        return wrap;

      case 'stepper':
        wrap.className = 'bt-ctrl-card bt-ctrl--stepper';
        const sv = ctrl.value || ctrl.min || 1;
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <div class="bt-stepper" id="btStepperWrap_${ctrl.id}">
            <button class="bt-stepper-btn" onclick="Bots._stepperChange('${ctrl.id}', ${ctrl.min || 1}, ${ctrl.max || 99}, -1)">−</button>
            <div class="bt-stepper-val" id="btStepperVal_${ctrl.id}">${sv}</div>
            <button class="bt-stepper-btn" onclick="Bots._stepperChange('${ctrl.id}', ${ctrl.min || 1}, ${ctrl.max || 99}, 1)">+</button>
          </div>`;
        return wrap;

      case 'slider':
        wrap.className = 'bt-ctrl-card bt-ctrl--slider';
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
        wrap.className = 'bt-ctrl-card bt-ctrl--toggle';
        const tv = ctrl.value ? 'checked' : '';
        wrap.innerHTML = `<label class="bt-toggle-wrap" onclick="if(navigator.vibrate)navigator.vibrate(18)">
            <input type="checkbox" ${tv} id="btCtrl_${ctrl.id}" onchange="Bots._sendCommand('${ctrl.id}', 'set', this.checked)"/>
            <div class="bt-toggle-track"><div class="bt-toggle-thumb"></div></div>
            <span class="bt-toggle-text">${this._esc(ctrl.label)}</span>
          </label>`;
        return wrap;

      case 'select': {
        wrap.className = 'bt-ctrl-card bt-ctrl--select';
        const options = ctrl.options || [];
        const selOpt = options.find(o => o.value === ctrl.value) || options[0] || {label:'', value:''};
        const optsHtml = options.map(o =>
          `<div class="bt-cs-opt${o.value === ctrl.value ? ' selected' : ''}" data-value="${this._esc(o.value)}"
            onclick="Bots._selectOption('${ctrl.id}','${this._esc(o.value)}','${this._esc(o.label)}')">${this._esc(o.label)}</div>`
        ).join('');
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <div class="bt-cs" id="btCs_${ctrl.id}">
            <div class="bt-cs-trigger" onclick="Bots._toggleSelect('${ctrl.id}')">
              <span class="bt-cs-label">${this._esc(selOpt.label)}</span>
              <svg class="bt-cs-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="bt-cs-drop">${optsHtml}</div>
          </div>`;
        return wrap;
      }

      case 'progress':
        wrap.className = 'bt-ctrl-card bt-ctrl--progress';
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <div class="bt-progress-header">
            <span style="font-size:12px;color:var(--text-dim)">${this._esc(ctrl.total || '')}</span>
            <span class="bt-progress-pct">${ctrl.value || 0}%</span>
          </div>
          <div class="bt-progress-track"><div class="bt-progress-fill" style="width:${ctrl.value || 0}%"></div></div>`;
        return wrap;

      case 'filelist':
        wrap.className = 'bt-ctrl-card bt-ctrl--filelist';
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>
          <button class="bt-filelist-btn" onclick="Bots._uploadList('${ctrl.id}', this)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
            Загрузить список
          </button>
          <div class="bt-filelist-status" id="btFileStatus_${ctrl.id}">${ctrl.list_count ? ctrl.list_count + ' строк загружено' : ''}</div>`;
        return wrap;

      case 'stat': {
        wrap.className = 'bt-ctrl-card bt-ctrl--stat';
        const s = ctrl._item || {};
        wrap.innerHTML = `
            <div class="bt-stat-val">${this._esc(String(s.value || '—'))}</div>
            <div class="bt-stat-label">${this._esc(s.label || '')}</div>
            ${s.delta ? `<div class="bt-stat-delta ${s.trend || 'up'}">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="${s.trend === 'down' ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"/>
                </svg>${this._esc(s.delta)}</div>` : ''}
        `;
        return wrap;
      }

      case 'badges':
        wrap.className = 'bt-ctrl-card bt-ctrl--badges';
        wrap.innerHTML = `<div class="bt-ctrl-label">${this._esc(ctrl.label || 'Статус')}</div>
          <div class="bt-badges-row">${(ctrl.items || []).map(bd =>
            `<span class="bt-badge-status ${bd.style || ''}">${this._esc(bd.label)}</span>`
          ).join('')}</div>`;
        return wrap;

      case 'label':
        wrap.className = 'bt-ctrl-card bt-ctrl--label';
        wrap.id = ctrl.id ? 'btCtrlCard_' + ctrl.id : '';
        wrap.innerHTML = `${ctrl.label ? `<div class="bt-ctrl-label">${this._esc(ctrl.label)}</div>` : ''}
          <div class="bt-label-ctrl ${ctrl.style || ''}" id="btCtrl_${ctrl.id || ''}">${this._esc(ctrl.text || ctrl.value || '')}</div>`;
        return wrap;

      case 'image':
        wrap.className = 'bt-ctrl-card bt-ctrl--image';
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
        wrap.className = 'bt-ctrl-card bt-ctrl--table';
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
        wrap.className = 'bt-ctrl-card bt-ctrl--code';
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

  _toggleSelect(ctrlId) {
    const wrap = document.getElementById('btCs_' + ctrlId);
    if (!wrap) return;
    const isOpen = wrap.classList.contains('open');
    document.querySelectorAll('.bt-cs.open').forEach(el => el.classList.remove('open'));
    if (!isOpen) {
      wrap.classList.add('open');
      if (!this._csListener) {
        this._csListener = ev => {
          if (!ev.target.closest('.bt-cs')) document.querySelectorAll('.bt-cs.open').forEach(el => el.classList.remove('open'));
        };
        document.addEventListener('click', this._csListener, true);
      }
    }
  },

  _selectOption(ctrlId, value, label) {
    const wrap = document.getElementById('btCs_' + ctrlId);
    if (!wrap) return;
    const lbl = wrap.querySelector('.bt-cs-label');
    if (lbl) lbl.textContent = label;
    wrap.querySelectorAll('.bt-cs-opt').forEach(o => o.classList.toggle('selected', o.dataset.value === value));
    wrap.classList.remove('open');
    this._sendCommand(ctrlId, 'set', value);
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
    // Avatar
    const avaPreview = document.getElementById('btSettingsAvaPreview');
    const avaDeleteBtn = document.getElementById('btAvaDeleteBtn');
    if (avaPreview) {
      if (b.avatar) {
        avaPreview.innerHTML = `<img src="${this._esc(b.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
        if (avaDeleteBtn) avaDeleteBtn.style.display = '';
      } else {
        avaPreview.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
        if (avaDeleteBtn) avaDeleteBtn.style.display = 'none';
      }
    }
    const nameEl = document.getElementById('btSettingsName');
    if (nameEl) nameEl.value = b.name || '';
    const groupEl = document.getElementById('btSettingsGroup');
    if (groupEl) groupEl.value = (b.group && b.group !== 'Без группы') ? b.group : '';
    // Datalist of existing groups
    const dl = document.getElementById('btGroupOptions');
    if (dl) {
      const names = [...new Set(this._bots.map(x => x.group).filter(g => g && g !== 'Без группы'))];
      dl.innerHTML = names.map(g => `<option value="${this._esc(g)}"></option>`).join('');
    }
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

  async saveBotGroup() {
    const el = document.getElementById('btSettingsGroup');
    if (!el || !this._selected) return;
    const group = el.value.trim() || 'Без группы';
    if (navigator.vibrate) navigator.vibrate(20);
    const d = await Shell.api(`/api/mod/bots/${this._selected}`, {
      method: 'PUT',
      body: JSON.stringify({ group })
    });
    if (d && d.ok) {
      const b = this._bots.find(x => x.id === this._selected);
      if (b) b.group = group;
      this._renderList();
      Shell.toast('Группа обновлена');
    }
  },

  async renameGroup(oldName) {
    const next = prompt('Новое название группы:', oldName);
    if (next === null) return;
    const newName = next.trim();
    if (!newName || newName === oldName) return;
    if (navigator.vibrate) navigator.vibrate(20);
    const d = await Shell.api('/api/mod/bots/group/rename', {
      method: 'POST',
      body: JSON.stringify({ old: oldName, new: newName })
    });
    if (d && d.ok) {
      await this.loadBots();
      Shell.toast(`Группа переименована (${d.count})`);
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

  // ─── Save-edit guard modal ───────────────────────────────────
  _showSaveEditModal(onProceed) {
    const overlay = document.createElement('div');
    overlay.className = 'bt-confirm-overlay';
    overlay.innerHTML = `
      <div class="bt-confirm-box">
        <div class="bt-confirm-title">Сохранить изменения?</div>
        <div class="bt-confirm-sub">Вы редактировали расположение элементов управления</div>
        <div class="bt-confirm-actions">
          <button class="btn btn-secondary" id="btConfirmNo">Не сохранять</button>
          <button class="btn btn-primary" id="btConfirmYes">Сохранить</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = save => {
      overlay.remove();
      if (save) this._saveLayout();
      this._editMode = false;
      const btn = document.getElementById('btEditBtn');
      if (btn) { btn.classList.remove('btn-icon-only--active'); btn.disabled = false; }
      this._renderControlsDOM(true);
      onProceed();
    };
    overlay.querySelector('#btConfirmYes').onclick = () => close(true);
    overlay.querySelector('#btConfirmNo').onclick = () => close(false);
    overlay.onclick = e => { if (e.target === overlay) close(false); };
    if (navigator.vibrate) navigator.vibrate([8, 40, 8]);
  },

  // Called when user leaves this module — show save guard if edit mode active
  onDeactivate() {
    if (this._editMode) this._showSaveEditModal(() => {});
  },

  // ─── Tab switching ───────────────────────────────────────────
  switchTab(tab) {
    // Guard: if in edit mode and switching away from controls, show save modal
    if (this._editMode && tab !== 'controls') {
      this._showSaveEditModal(() => this.switchTab(tab));
      return;
    }
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
    this._newBotAvatar = '';
    const avaPreview = document.getElementById('btNewBotAvaPreview');
    if (avaPreview) avaPreview.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.35"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    // Group chips
    const groups = [...new Set(this._bots.map(b => b.group).filter(g => g && g !== 'Без группы'))];
    const chipsEl = document.getElementById('btGroupChips');
    if (chipsEl) {
      if (groups.length) {
        chipsEl.style.display = 'flex';
        chipsEl.innerHTML = groups.map(g =>
          `<div class="bt-group-chip" onclick="Bots._selectGroupChip(this,'${this._esc(g)}')">${this._esc(g)}</div>`
        ).join('');
      } else {
        chipsEl.style.display = 'none';
        chipsEl.innerHTML = '';
      }
    }
    document.getElementById('btAddModal').classList.add('active');
    setTimeout(() => document.getElementById('btNewBotName').focus(), 80);
    if (navigator.vibrate) navigator.vibrate(15);
  },

  _selectGroupChip(el, group) {
    document.getElementById('btNewBotGroup').value = group;
    document.querySelectorAll('.bt-group-chip').forEach(c => c.classList.toggle('active', c === el));
    if (navigator.vibrate) navigator.vibrate(8);
  },

  _compressImage(dataURL, maxPx = 96) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const webp = canvas.toDataURL('image/webp', 0.7);
        resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.65));
      };
      img.onerror = () => resolve(dataURL);
      img.src = dataURL;
    });
  },

  _onAvaSelect(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const compressed = await this._compressImage(e.target.result);
      this._newBotAvatar = compressed;
      const prev = document.getElementById('btNewBotAvaPreview');
      if (prev) prev.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
    };
    reader.readAsDataURL(file);
  },

  _onSettingsAvaSelect(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const avatar = await this._compressImage(e.target.result);
      const d = await Shell.api(`/api/mod/bots/${this._selected}`, {
        method: 'PUT', body: JSON.stringify({ avatar })
      });
      if (!d || !d.ok) { Shell.toast('Ошибка сохранения фото', 'error'); return; }
      const b = this._bots.find(x => x.id === this._selected);
      if (b) { b.avatar = avatar; this._renderSettings(b); this._renderList(); }
      Shell.toast('Фото обновлено');
    };
    reader.readAsDataURL(file);
  },

  async deleteAvatar() {
    if (!this._selected) return;
    const d = await Shell.api(`/api/mod/bots/${this._selected}`, {
      method: 'PUT', body: JSON.stringify({ avatar: '' })
    });
    if (!d || !d.ok) { Shell.toast('Ошибка', 'error'); return; }
    const b = this._bots.find(x => x.id === this._selected);
    if (b) { b.avatar = ''; this._renderSettings(b); this._renderList(); }
    Shell.toast('Фото удалено');
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
      body: JSON.stringify({ name, group: group || 'Без группы', avatar: this._newBotAvatar || '' })
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
  _accessAllUsers: [],

  async openAccessModal() {
    document.getElementById('btAccessModal').classList.add('active');
    if (navigator.vibrate) navigator.vibrate(15);
    const searchEl = document.getElementById('btAccessSearch');
    if (searchEl) searchEl.value = '';

    const d = await Shell.api('/api/users');
    if (!Array.isArray(d)) { document.getElementById('btAccessUserList').innerHTML = '<div style="font-size:12px;color:var(--text-dim);padding:8px 0">Нет доступа к списку пользователей</div>'; return; }
    // Filter out owner-role users (they have access by default) and self
    const meId = Shell.user && Shell.user.id;
    this._accessAllUsers = d.filter(u => !['arcana','immortal'].includes(u.role) && u.id !== meId);
    this._renderAccessUserList('');
  },

  _renderAccessUserList(filter) {
    const list = document.getElementById('btAccessUserList');
    if (!list) return;
    const b = this._bots.find(x => x.id === this._selected);
    const existing = b && b.access ? b.access.map(u => u.id) : [];
    const q = (filter || '').toLowerCase();
    const users = this._accessAllUsers.filter(u =>
      !q || (u.display_name || u.username || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q)
    );
    if (!users.length) {
      list.innerHTML = '<div style="font-size:12px;color:var(--text-dim);padding:8px 0;text-align:center">Пользователей не найдено</div>';
      return;
    }
    list.innerHTML = users.map(u => {
      const has = existing.includes(u.id);
      const ava = u.avatar
        ? `<img src="data:image/jpeg;base64,${u.avatar}"/>`
        : this._esc((u.display_name || u.username || '?').charAt(0).toUpperCase());
      return `<div class="bt-access-user-item${has ? ' already' : ''}" onclick="Bots._grantAccess('${u.id}')">
        <div class="bt-access-ava">${ava}</div>
        <div>
          <div class="bt-access-name">${this._esc(u.display_name || u.username)}</div>
          <div style="font-size:11px;color:var(--text-dim)">${this._esc(u.username)}</div>
        </div>
        <span class="bt-access-role" style="margin-left:auto">${this._esc(u.role || '')}</span>
        ${has ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>`;
    }).join('');
  },

  _filterAccessList(val) {
    this._renderAccessUserList(val);
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
    await this._loadBotDetails(this._selected);
    // Refresh modal list to show checkmark
    const b = this._bots.find(x => x.id === this._selected);
    if (b && b.access) this._renderAccessUserList(document.getElementById('btAccessSearch')?.value || '');
    Shell.toast('Доступ выдан');
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
    } else if (data.type === 'bot_access_update') {
      // Access granted/revoked — reload bot list so bot appears/disappears for this user
      this.loadBots();
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
