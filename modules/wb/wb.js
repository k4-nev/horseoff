/* ═══════════════════════════════════════════════════════════
   Продвижение WB — модуль (визуальная оболочка, данные замоканы).
   Глобальные стили Horseoff; серверная логика — следующим этапом.
   ═══════════════════════════════════════════════════════════ */
var WB = {
  _servers: [], _active: null, _tab: 'accounts', _testOn: false,
  _sel: {}, _accSearch: '', _regSub: 'pool', _revSub: 'products', _revView: 'grid', _genderVal: 50,
  _pkSub: 'receive', _pkCity: 'all',
  _regSel: {}, _regCount: 10, _regDay: 'today', _regActSel: {}, _regStore: {},
  // покупки
  _buyDates: ['2026-08-01','2026-08-03','2026-08-05','2026-08-08','2026-08-10','2026-08-11','2026-08-12','2026-08-14','2026-08-16','2026-08-19','2026-08-23','2026-08-26','2026-08-29','2026-09-02','2026-09-05','2026-09-07','2026-09-11','2026-09-15','2026-09-19','2026-09-23','2026-09-28','2026-10-02','2026-10-06','2026-10-11'],
  _activeDay: '2026-08-11',
  _calOpen: false, _calY: 2026, _calM: 7,  // month 0-based (7=август)
  _MONTHS: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
  _DOW: ['вс','пн','вт','ср','чт','пт','сб'],

  _ddVal: {},

  init() {
    this._renderServers(); this._renderHeader(); this._renderActive();
    if (!this._wired) {
      this._wired = true;
      // клик мимо — закрыть открытые дропдауны и календарь
      document.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t.closest && t.closest('.wb-dd'))) document.querySelectorAll('.wb-dd.open').forEach(d => d.classList.remove('open'));
        if (!(t.closest && t.closest('.wb-cal-anchor')) && this._calOpen) { this._calOpen = false; const p = document.getElementById('wbCalPop'); if (p) p.classList.remove('open'); }
        if (!(t.closest && t.closest('.wb-ord-items, .wb-ord-addr, .wb-ord-pill'))) this._ordCloseOverlays();
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this._ordCloseOverlays(); this._ddCloseAll(); this.closeModal(); } });
      // скролл — закрыть открытые дропдауны (список позиционируется fixed)
      document.addEventListener('scroll', () => this._ddCloseAll(), true);
      window.addEventListener('resize', () => this._ddCloseAll());
      // смена модуля Horseoff → закрыть выдвижной сайдбар серверов
      if (window.Shell && Shell.switchModule && !Shell._wbHooked) {
        const orig = Shell.switchModule.bind(Shell);
        Shell.switchModule = function (id) { WB.closeSide(); return orig(id); };
        Shell._wbHooked = true;
      }
    }
  },

  // кастомный дропдаун (стилизованный, вместо нативного select)
  _dd(id, opts, val, width) {
    this._ddVal[id] = val;
    const style = width === 'full' ? 'display:block;width:100%' : (width ? 'width:' + width + 'px' : '');
    const chev = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
    return `<div class="wb-dd" id="dd-${id}" style="${style}">
      <button class="wb-dd-btn" onclick="WB._ddToggle('${id}',event)"><span id="dd-lbl-${id}">${this._esc(val)}</span>${chev}</button>
      <div class="wb-dd-list">${opts.map(o => `<div class="wb-dd-opt ${o === val ? 'sel' : ''}" onclick="WB._ddPick('${id}',this)">${this._esc(o)}</div>`).join('')}</div>
    </div>`;
  },
  _ddToggle(id, e) {
    if (e) e.stopPropagation();
    const el = document.getElementById('dd-' + id); if (!el) return;
    const open = el.classList.contains('open');
    document.querySelectorAll('.wb-dd.open').forEach(d => d.classList.remove('open'));
    if (!open) {
      el.classList.add('open');
      const btn = el.querySelector('.wb-dd-btn'), list = el.querySelector('.wb-dd-list');
      const r = btn.getBoundingClientRect();
      const w = Math.max(r.width, 150);
      list.style.width = w + 'px';
      let left = r.left, top = r.bottom + 5;
      // не вылезать за правый край / низ вьюпорта
      if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
      list.style.left = Math.max(8, left) + 'px';
      list.style.top = top + 'px';
    }
  },
  _ddCloseAll() { document.querySelectorAll('.wb-dd.open').forEach(d => d.classList.remove('open')); },
  _ddPick(id, opt) {
    const val = opt.textContent;
    this._ddVal[id] = val;
    const lbl = document.getElementById('dd-lbl-' + id); if (lbl) lbl.textContent = val;
    const el = document.getElementById('dd-' + id);
    if (el) { el.classList.remove('open'); el.querySelectorAll('.wb-dd-opt').forEach(o => o.classList.toggle('sel', o === opt)); }
  },

  // ─── мок тестового сервера ───────────────────────────────
  _buildTest() {
    const NF = ['Анна Петрова','Елена Кузнецова','Ольга Морозова','Полина Гуля','Катя Смирнова','Вера Ильина','Настя Лебедева'];
    const NM = ['Максим Орлов','Игнат Волков','Никита Соколов','Евгений Попов','Даниил Козлов','Артём Новиков'];
    const CITIES = ['Москва','Санкт-Петербург','Казань','Екатеринбург','Новосибирск','Нижний Новгород','Краснодар','Самара'];
    const ST = ['активен','активен','активен','новый','не прошел','ожидает в пвз','получен'];
    const products = [
      { id: 'p1', article: '833758227', keyword: 'вода парфюм', available: 12 },
      { id: 'p2', article: '996209813', keyword: 'духи с табаком', available: 7 },
      { id: 'p3', article: '451599302', keyword: 'часы кварцевые', available: 3 },
      { id: 'p4', article: '344985239', keyword: 'часы электронные', available: 21 },
      { id: 'p5', article: '500120276', keyword: 'пароочиститель', available: 9 },
      { id: 'p6', article: '108481477', keyword: 'гейнер масса', available: 15 },
      { id: 'p7', article: '123967154', keyword: 'робот пылесос', available: 5 },
    ];
    const accts = [];
    for (let i = 0; i < 30; i++) {
      const f = i % 2 === 0, pr = products[i % products.length];
      accts.push({
        id: 'a' + i, name: f ? NF[i % NF.length] : NM[i % NM.length], gender: f ? 'f' : 'm',
        phone: '+7 9' + (10 + i % 89) + ' ' + String(100 + i).padStart(3, '0') + '-' + String(11 + i % 88).padStart(2, '0') + '-' + String((i * 7) % 100).padStart(2, '0'),
        lastLogin: ['сейчас','2ч','вчера','5ч','3д'][i % 5], status: ST[i % ST.length],
        article: pr.article, keyword: pr.keyword,
        pvz: 'ул. Ленина, ' + (5 + i) + ', ПВЗ Wildberries', city: CITIES[i % CITIES.length]
      });
    }
    return { id: '__test__', name: 'Server-RU-01', platform: 'Wildberries', status: 'online', test: true, accounts: accts, products: products };
  },
  _PLATFORMS: ['Wildberries'],

  toggleTestServer() {
    this._testOn = !this._testOn;
    const btn = document.getElementById('wbDemoToggle');
    if (btn) btn.classList.toggle('demo-on', this._testOn);
    if (this._testOn) {
      this._servers.unshift(this._buildTest());
      this._renderServers(); this.selectServer('__test__');
      if (window.Shell && Shell.toast) Shell.toast('Тестовый сервер добавлен');
    } else {
      this._servers = this._servers.filter(s => s.id !== '__test__');
      if (this._active === '__test__') this._active = this._servers[0] ? this._servers[0].id : null;
      this._renderServers(); this._renderHeader(); this._renderActive();
    }
    if (navigator.vibrate) navigator.vibrate(15);
  },

  addServer() {
    this.openModal(`<div class="wb-modal-h"><h3>Новый сервер</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      <div class="wb-field"><label>Платформа</label>${this._dd('newSrvPlatform', this._PLATFORMS, this._PLATFORMS[0], 'full')}</div>
      <div class="wb-field"><label>Название сервера</label><input class="wb-input" id="wbNewSrvName" placeholder="Server-RU-02" autofocus></div>
      <p style="color:var(--text-dim);font-size:12px;margin-bottom:14px">Пока сервер создаётся локально (без бэкенда) — для дебага интерфейса. Сервер попадёт в группу выбранной платформы.</p>
      <button class="btn btn-primary wide" onclick="WB._createServer()">Создать сервер</button>`, 460);
    setTimeout(() => { const el = document.getElementById('wbNewSrvName'); if (el) el.focus(); }, 50);
  },
  _createServer() {
    const el = document.getElementById('wbNewSrvName');
    const name = el ? el.value.trim() : '';
    if (!name) { if (window.Shell && Shell.toast) Shell.toast('Введите название сервера'); return; }
    const platform = this._ddVal['newSrvPlatform'] || this._PLATFORMS[0];
    const base = this._buildTest();
    const srv = { id: 's' + Date.now(), name: name, platform: platform, status: 'online', accounts: base.accounts.slice(0, 8), products: base.products };
    this._servers.push(srv);
    this.closeModal();
    this._renderServers();
    this.selectServer(srv.id);
    if (window.Shell && Shell.toast) Shell.toast('Сервер создан');
  },

  _renderServers() {
    const el = document.getElementById('wbServerList');
    if (!el) return;
    if (!this._servers.length) {
      el.innerHTML = '<div style="padding:24px 14px;text-align:center;color:var(--text-dim);font-size:12px;line-height:1.6">Нет серверов.<br>Нажми «Тестовый сервер» для дебага интерфейса.</div>';
    } else {
      // группировка по платформе (группа = платформа)
      const groups = {};
      this._servers.forEach(s => { const p = s.platform || 'Без платформы'; (groups[p] = groups[p] || []).push(s); });
      const srvHtml = s => `
        <div class="wb-srv ${s.id === this._active ? 'active' : ''} ${s.test ? 'test' : ''}" onclick="WB.selectServer('${s.id}')">
          <span class="wb-srv-dot ${s.status}"></span>
          <div class="wb-srv-body"><div class="wb-srv-name">${this._esc(s.name)}</div><div class="wb-srv-sub">${s.accounts.length} аккаунтов</div></div>
        </div>`;
      el.innerHTML = Object.keys(groups).map(p => `<div class="wb-srv-group">${this._esc(p)}<span>${groups[p].length}</span></div>${groups[p].map(srvHtml).join('')}`).join('');
    }
    const online = this._servers.filter(s => s.status === 'online').length;
    const foot = document.getElementById('wbSideFoot');
    if (foot) foot.innerHTML = `<b>${online}</b> / ${this._servers.length} онлайн`;
  },

  selectServer(id) { this._active = id; this._sel = {}; this._renderServers(); this._renderHeader(); this._renderActive(); this.closeSide(); if (navigator.vibrate) navigator.vibrate(8); },
  _srv() { return this._servers.find(s => s.id === this._active); },

  // выдвижной сайдбар серверов
  toggleSide() { document.getElementById('wbWrap').classList.toggle('side-open'); if (navigator.vibrate) navigator.vibrate(8); },
  openSide() { document.getElementById('wbWrap').classList.add('side-open'); },
  closeSide() { document.getElementById('wbWrap').classList.remove('side-open'); },

  _renderHeader() {
    const s = this._srv();
    const dot = document.getElementById('wbHeadDot'), name = document.getElementById('wbHeadName'), cnt = document.getElementById('wbHeadCount');
    if (!s) { name.textContent = 'Сервер не выбран'; if (dot) dot.className = 'wb-hd-dot'; if (cnt) cnt.innerHTML = ''; return; }
    name.textContent = s.name;
    if (dot) dot.className = 'wb-hd-dot ' + (s.status === 'online' ? 'online' : 'offline');
    const n = s.accounts.length;
    if (cnt) cnt.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><b>${n}</b> ${this._plural(n, 'аккаунт', 'аккаунта', 'аккаунтов')}`;
  },
  _plural(n, one, few, many) { const a = n % 10, b = n % 100; if (a === 1 && b !== 11) return one; if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few; return many; },

  switchTab(tab) {
    this._tab = tab; this._calOpen = false;
    document.querySelectorAll('#wbTabs .wb-hd-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('#wbWorkspace .wb-pane').forEach(p => p.classList.toggle('active', p.id === 'wbPane-' + tab));
    this._renderActive(); if (navigator.vibrate) navigator.vibrate(6);
  },

  _renderActive() {
    const s = this._srv(), pane = document.getElementById('wbPane-' + this._tab);
    if (!pane) return;
    if (!s) { pane.innerHTML = this._emptyState('Сервер не выбран', 'Открой список серверов и выбери сервер, либо включи «Тестовый сервер» для просмотра интерфейса.', '<button class="btn btn-primary" onclick="WB.openSide()">Показать серверы</button>'); return; }
    ({ accounts: () => this._renderAccounts(pane, s), reg: () => this._renderReg(pane, s), warmup: () => this._renderWarmup(pane, s),
       purchases: () => this._renderPurchases(pane, s), pickup: () => this._renderPickup(pane, s), reviews: () => this._renderReviews(pane, s),
       stats: () => this._renderStats(pane, s) }[this._tab] || (() => {}))();
  },

  // ═══ 5.1 АККАУНТЫ ═══
  _accRows(s) {
    const ST = ['Прогретый', 'Проверка', 'Получен', 'Доставка', 'Ожидает на ПВЗ', 'Новый', 'Прошел', 'Не прошел'];
    const logins = [{ d: 0, t: '14:55' }, { d: 0, t: '09:12' }, { d: 1 }, { d: 2 }, { d: 3 }, { d: 7 }, { d: 14 }, { d: 0, t: '18:40' }];
    return s.accounts.map((a, i) => {
      const hasItems = i % 4 !== 3, hasAddr = i % 5 !== 4;
      return {
        id: a.id, name: a.name, phone: a.phone, gender: a.gender,
        login: logins[i % logins.length], status: ST[i % ST.length],
        items: hasItems ? s.products.slice(0, (i % 3) + 1).map((p, j) => ({ id: 'ai' + j, art: p.article, kw: p.keyword })) : [],
        address: hasAddr ? { short: a.city + ', ' + a.pvz.split(',').slice(0, 2).join(','), full: a.pvz + ', ' + a.city } : null,
        buys: (i * 3 + 2) % 17, reviews: (i * 2 + 1) % 9
      };
    });
  },
  _accBar(s, animate) {
    const selCount = Object.values(this._sel).filter(Boolean).length;
    const inner = selCount
      ? `<div class="wb-ac-selbar">Выбрано: <b>${selCount}</b><button class="wb-b wb-b-neutral sm" onclick="WB._toast()">Архивировать</button><button class="wb-b wb-b-neutral sm" onclick="WB._clearSel()">Снять</button></div>`
      : `<button class="wb-b wb-b-neutral sm" onclick="WB._toast()">Статус ▾</button><button class="wb-b wb-b-neutral sm" onclick="WB._toast()">Пол ▾</button>`;
    return `<div class="wb-ord-search" style="flex:1 1 300px;max-width:440px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input placeholder="Поиск: имя, номер, артикул, статус, адрес" value="${this._esc(this._accSearch)}" oninput="WB._accSearchInput(this.value)"></div><span style="flex:1"></span><div class="wb-btn-tray ${animate ? 'wb-appear' : ''}">${inner}</div>`;
  },
  _accList(s) {
    const g = 'display:grid;grid-template-columns:3px 18px 220px 155px 150px 128px 1fr 74px 74px 90px;gap:16px;align-items:center;padding:12px 20px 12px 0';
    const q = (this._accSearch || '').trim().toLowerCase();
    let rows = this._accRows(s);
    if (q) rows = rows.filter(r => [r.name, r.phone, r.status, r.address ? r.address.short + ' ' + r.address.full : ''].concat(r.items.map(i => i.art + ' ' + i.kw)).join(' ').toLowerCase().indexOf(q) >= 0);
    const allSel = rows.length > 0 && rows.every(r => this._sel[r.id]);
    const cart = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
    const star = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    const dash = '<span class="wb-ac-dash">—</span>';
    const body = rows.map(r => `<div class="wb-lgrow ${this._sel[r.id] ? 'sel' : ''}" style="${g}">
      <span class="wb-wu-notch" style="background:${this._lnotch(r.status)}"></span>
      <button class="wb-check ${this._sel[r.id] ? 'on' : ''}" onclick="WB._toggleSel('${r.id}')" aria-label="${this._esc(r.name)}"></button>
      ${this._client(r.name, r.phone, r.gender)}
      <span class="wb-lcell" style="font-size:12.5px;color:#76767d">${this._lastLogin(r.login)}</span>
      <span>${this._lstatus(r.status)}</span>
      <span>${r.items.length ? this._ordItems(r) : dash}</span>
      <span>${r.address ? this._ordAddr(r) : dash}</span>
      <span class="wb-ac-cnt">${cart}${r.buys}</span>
      <span class="wb-ac-cnt">${star}${r.reviews}</span>
      <span class="wb-pk-act"><button class="wb-b wb-b-neutral sm" onclick="WB._toast()">Архив</button></span>
    </div>`).join('') || `<div class="wb-empty"><div class="wb-empty-title" style="color:#54545c">Ничего не найдено</div></div>`;
    return `<div class="wb-lcard wb-sys" style="min-width:1180px">
      <div class="wb-lcard-head" style="${g}"><span></span><button class="wb-check ${allSel ? 'on' : ''}" onclick="WB._accAll()" aria-label="Выбрать все"></button><span>Клиент</span><span>Последний вход</span><span>Статус</span><span>Товары</span><span>Адрес</span><span>Покупки</span><span>Отзывы</span><span></span></div>
      ${body}</div>`;
  },
  _renderAccounts(pane, s) {
    this._accBarMode = Object.values(this._sel).filter(Boolean).length ? 'bulk' : 'filters';
    pane.innerHTML = `<div class="wb-sys" style="display:flex;flex-direction:column;gap:14px;min-width:1180px">
      <div class="wb-lbar" id="wbAccBar">${this._accBar(s, false)}</div>
      <div id="wbAccList">${this._accList(s)}</div>
    </div>`;
  },
  _renderAccBar() {
    const s = this._srv(), el = document.getElementById('wbAccBar'); if (!s || !el) return;
    const mode = Object.values(this._sel).filter(Boolean).length ? 'bulk' : 'filters';
    const animate = this._accBarMode !== undefined && this._accBarMode !== mode;
    this._accBarMode = mode;
    el.innerHTML = this._accBar(s, animate);
  },
  _renderAccList() { const s = this._srv(), el = document.getElementById('wbAccList'); if (s && el) el.innerHTML = this._accList(s); },
  _accSearchInput(v) { this._accSearch = v; this._renderAccList(); },
  _toggleSel(id) { this._sel[id] = !this._sel[id]; this._renderAccList(); this._renderAccBar(); },
  _accAll() {
    const s = this._srv(); if (!s) return;
    const q = (this._accSearch || '').trim().toLowerCase();
    let rows = this._accRows(s);
    if (q) rows = rows.filter(r => [r.name, r.phone, r.status, r.address ? r.address.short + ' ' + r.address.full : ''].concat(r.items.map(i => i.art + ' ' + i.kw)).join(' ').toLowerCase().indexOf(q) >= 0);
    const all = rows.length > 0 && rows.every(r => this._sel[r.id]);
    rows.forEach(r => this._sel[r.id] = !all);
    this._renderAccList(); this._renderAccBar();
  },
  _clearSel() { this._sel = {}; this._renderAccList(); this._renderAccBar(); },

  // ═══ 5.2 РЕГИСТРАТОР (light, стиль Прогрева) ═══
  _regData(s) {
    if (!this._regStore[s.id]) {
      const acc = s.accounts;
      this._regStore[s.id] = {
        pool: acc.slice(0, 10).map(a => ({ id: a.id, phone: a.phone })),
        active: acc.slice(10, 14).map((a, i) => ({ id: a.id, phone: a.phone, time: ['09:20', '11:40', '13:05', '15:30'][i], exec: ['running', 'pending', 'error', 'done'][i] }))
      };
    }
    return this._regStore[s.id];
  },
  _renderReg(pane, s) {
    if (this._regSub === 'archive') this._regSub = 'pool';
    const sub = this._regSub, d = this._regData(s); let body = '';
    const ph = (x) => `<span class="wb-lcell wb-ord-mono" style="font-size:13px;color:#44454e">${this._esc(x.phone)}</span>`;
    if (sub === 'pool') {
      const pool = d.pool, g = 'display:grid;grid-template-columns:3px 18px 1fr 230px 120px;gap:16px;align-items:center;padding:12px 20px 12px 0';
      const selCount = pool.filter(a => this._regSel[a.id]).length;
      const allSel = pool.length > 0 && pool.every(a => this._regSel[a.id]);
      const btnLabel = selCount ? 'Запланировать: ' + selCount : 'Запланировать';
      body = `
        <div class="wb-hud">
          <div class="wb-cap"><span class="wb-cap-lbl">Автопланирование</span></div>
          <div class="wb-cap" onmouseenter="WB._genderHover(true)" onmouseleave="WB._genderHover(false)"><span class="wb-ava f sm" id="wbGaF">Ж</span><input type="range" class="wb-slider" id="wbGenderSlider" min="0" max="100" value="${this._genderVal}" oninput="WB._genderInput()"><span class="wb-ava m sm" id="wbGaM">М</span></div>
          <div class="wb-cap"><span class="wb-cap-lbl">Кол-во</span><div class="wb-step"><button onclick="WB._regCountStep(-1)">−</button><span class="v wb-mono">${this._regCount}</span><button onclick="WB._regCountStep(1)">+</button></div></div>
          <div class="wb-cap"><span class="wb-cap-lbl">В пуле</span><b class="wb-mono">${pool.length}</b></div>
          <span class="wb-spacer"></span>
          <button class="wb-b wb-b-primary" ${pool.length ? '' : 'disabled'} onclick="WB._regSchedule()">${btnLabel}</button>
        </div>
        <div class="wb-lcard wb-sys" style="min-width:560px">
          <div class="wb-lcard-head" style="${g}"><span></span><button class="wb-check ${allSel ? 'on' : ''}" onclick="WB._regAllToggle()" aria-label="Выбрать все"></button><span>Телефон</span><span>Статус</span><span></span></div>
          ${pool.map(a => `<div class="wb-lgrow ${this._regSel[a.id] ? 'sel' : ''}" style="${g}"><span class="wb-wu-notch" style="background:#b4b4bb"></span><button class="wb-check ${this._regSel[a.id] ? 'on' : ''}" onclick="WB._regToggle('${a.id}')" aria-label="${this._esc(a.phone)}"></button>${ph(a)}${this._execStatus('pending', 'Готов к регистрации')}<span></span></div>`).join('') || `<div class="wb-empty"><div class="wb-empty-title" style="color:#54545c">Пул пуст — все отправлены в регистрацию</div></div>`}
        </div>`;
    } else {
      const act = d.active, g = 'display:grid;grid-template-columns:3px 18px 64px 1fr 200px 180px;gap:16px;align-items:center;padding:12px 20px 12px 0';
      const aSel = act.filter(a => this._regActSel[a.id]).length;
      const allSel = act.length > 0 && act.every(a => this._regActSel[a.id]);
      body = `
        <div class="wb-lbar" style="margin-bottom:2px"><span class="wb-subtabs"><button class="wb-subtab ${this._regDay === 'today' ? 'active' : ''}" onclick="WB._regDaySet('today')">Сегодня</button><button class="wb-subtab ${this._regDay === 'tomorrow' ? 'active' : ''}" onclick="WB._regDaySet('tomorrow')">Завтра</button></span><span style="flex:1"></span><button class="wb-wu-bulk" ${aSel ? '' : 'disabled'} onclick="WB._regActBulk()">${this._wuTrash()}${aSel ? 'Выбрано: ' + aSel : 'Снять на сегодня'}</button></div>
        <div class="wb-lcard wb-sys" style="min-width:720px">
          <div class="wb-lcard-head" style="${g}"><span></span><button class="wb-check ${allSel ? 'on' : ''}" onclick="WB._regActAll()" aria-label="Выбрать все"></button><span>Время</span><span>Телефон</span><span>Статус выполнения</span><span></span></div>
          ${act.map(a => `<div class="wb-lgrow ${this._regActSel[a.id] ? 'sel' : ''}" style="${g}"><span class="wb-wu-notch" style="background:${this._execNotch(a.exec)}"></span><button class="wb-check ${this._regActSel[a.id] ? 'on' : ''}" onclick="WB._regActToggle('${a.id}')" aria-label="${this._esc(a.phone)}"></button><span class="wb-lcell wb-ord-mono" style="font-size:13px;color:#44454e">${a.time || '—'}</span>${ph(a)}${this._execStatus(a.exec)}<span class="wb-pk-act">${a.exec === 'error' ? '<button class="wb-b wb-b-danger sm" onclick="WB._toast()">Повторить</button>' : ''}<button class="wb-b wb-b-neutral sm" onclick="WB._toast()">Время</button></span></div>`).join('') || `<div class="wb-empty"><div class="wb-empty-title" style="color:#54545c">Нет активных регистраций</div></div>`}
        </div>`;
    }
    pane.innerHTML = `<div style="margin-bottom:2px"><span class="wb-subtabs">
        <button class="wb-subtab ${sub === 'pool' ? 'active' : ''}" onclick="WB._regTab('pool')">Доступны</button>
        <button class="wb-subtab ${sub === 'active' ? 'active' : ''}" onclick="WB._regTab('active')">Активные</button>
      </span></div>${body}`;
  },
  _regActToggle(id) { this._regActSel[id] = !this._regActSel[id]; this._renderActive(); },
  _regActAll() { const s = this._srv(); if (!s) return; const act = this._regData(s).active, all = act.length > 0 && act.every(a => this._regActSel[a.id]); act.forEach(a => this._regActSel[a.id] = !all); this._renderActive(); },
  _regActBulk() {
    const s = this._srv(); if (!s) return;
    const d = this._regData(s), n = d.active.filter(a => this._regActSel[a.id]).length;
    if (!n) return;
    d.active = d.active.filter(a => !this._regActSel[a.id]);
    this._regActSel = {};
    if (window.Shell && Shell.notify) Shell.notify({ text: `Снято на сегодня ${n} ${this._plural(n, 'аккаунт', 'аккаунта', 'аккаунтов')}` });
    this._renderActive();
  },
  _regToggle(id) { this._regSel[id] = !this._regSel[id]; this._renderActive(); },
  _regAllToggle() { const s = this._srv(); if (!s) return; const pool = this._regData(s).pool, all = pool.length > 0 && pool.every(a => this._regSel[a.id]); pool.forEach(a => this._regSel[a.id] = !all); this._renderActive(); },
  _regCountStep(dl) { this._regCount = Math.max(1, (this._regCount || 10) + dl); this._renderActive(); },
  _regDaySet(d) { this._regDay = d; this._renderActive(); },
  _regSchedule() {
    const s = this._srv(); if (!s) return;
    const d = this._regData(s);
    let picked = d.pool.filter(p => this._regSel[p.id]);
    if (!picked.length) picked = d.pool.slice(0, Math.min(this._regCount, d.pool.length));
    if (!picked.length) { if (window.Shell && Shell.notify) Shell.notify({ text: 'В пуле нет доступных аккаунтов' }); return; }
    const n = picked.length, ids = {};
    picked.forEach(p => ids[p.id] = true);
    d.pool = d.pool.filter(p => !ids[p.id]);
    picked.forEach((p, i) => { const mins = 9 * 60 + Math.round(i * (11 * 60) / n); d.active.push({ id: p.id, phone: p.phone, time: String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'), exec: 'pending' }); });
    this._regSel = {};
    if (window.Shell && Shell.notify) Shell.notify({ text: `Отправлено в регистрацию ${n} ${this._plural(n, 'аккаунт', 'аккаунта', 'аккаунтов')}` });
    this._renderActive();
  },
  _regTab(t) { this._regSub = t; this._renderActive(); },

  // ползунок полов: при наведении/движении в кружках проценты, иначе Ж/М
  _genderInput() { const s = document.getElementById('wbGenderSlider'); if (s) { this._genderVal = +s.value; this._genderShow(true); } },
  _genderHover(on) { this._genderShow(on); },
  _genderShow(pct) {
    const f = document.getElementById('wbGaF'), m = document.getElementById('wbGaM'); if (!f || !m) return;
    if (pct) { f.textContent = (100 - this._genderVal); m.textContent = this._genderVal; f.style.fontSize = m.style.fontSize = '10px'; }
    else { f.textContent = 'Ж'; m.textContent = 'М'; f.style.fontSize = m.style.fontSize = ''; }
  },

  // ═══ 5.3 ПРОГРЕВ ═══
  _wuBuild(s) {
    const stages = ['Доставка', 'Прогретый', 'Ожидает на ПВЗ', 'Новый', 'Проверка'];
    const execs = ['done', 'running', 'pending', 'error', 'running', 'pending', 'done', 'running'];
    const times = ['09:15', '10:40', null, '13:05', '14:30', '16:10', '18:00', null];
    return s.accounts.slice(0, 8).map((a, i) => ({ accountId: a.id, name: a.name, phone: a.phone, gender: a.gender, scheduledAt: times[i], stage: stages[i % stages.length], exec: execs[i % execs.length] }));
  },
  _wuVisible(s) {
    const rows = this._wuBuild(s).filter(r => !this._wuRemoved[r.accountId]);
    rows.sort((a, b) => { if (!a.scheduledAt && !b.scheduledAt) return 0; if (!a.scheduledAt) return 1; if (!b.scheduledAt) return -1; return a.scheduledAt.localeCompare(b.scheduledAt); });
    return rows;
  },
  _renderWarmup(pane, s) {
    const rows = this._wuVisible(s);
    const notch = { done: '#4fae83', running: '#7d9dcf', pending: '#b4b4bb', error: '#dd8880' };
    const selCount = rows.filter(r => this._wuSel[r.accountId]).length;
    const allSel = rows.length > 0 && rows.every(r => this._wuSel[r.accountId]);
    const head = `<div class="wb-wu-grid wb-wu-head">
      <span></span>
      <button class="wb-check ${allSel ? 'on' : ''}" id="wuchkall" onclick="WB._wuAll()" aria-label="Выбрать все"></button>
      <span>Время</span><span>Аккаунт</span><span>Стадия</span><span>Прогрев</span>
      <button class="wb-wu-bulk" id="wubulk" ${selCount ? '' : 'disabled'} onclick="WB._wuBulk()">${this._wuTrash()}${selCount ? 'Выбрано: ' + selCount : 'Снять на сегодня'}</button>
    </div>`;
    const body = rows.map(r => `<div class="wb-wu-grid wb-wu-row ${this._wuSel[r.accountId] ? 'sel' : ''}" id="wurow-${r.accountId}">
      <span class="wb-wu-notch" style="background:${notch[r.exec]}"></span>
      <button class="wb-check ${this._wuSel[r.accountId] ? 'on' : ''}" id="wuchk-${r.accountId}" onclick="WB._wuToggle('${r.accountId}')" aria-label="${this._esc(r.name)}"></button>
      <span class="wb-wu-time">${r.scheduledAt || '<span style="color:#b4b4bb">—</span>'}</span>
      ${this._client(r.name, r.phone, r.gender)}
      <span class="wb-wu-stage">${this._esc(r.stage)}</span>
      ${this._execStatus(r.exec)}
      <span></span>
    </div>`).join('');
    pane.innerHTML = `<div class="wb-wu"><div class="wb-wu-card">${head}${body || '<div class="wb-empty"><div class="wb-empty-title" style="color:#54545c">На сегодня прогрев снят со всех</div></div>'}</div></div>`;
  },
  _wuTrash() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'; },
  _wuToggle(id) {
    const on = this._wuSel[id] = !this._wuSel[id];
    const chk = document.getElementById('wuchk-' + id);
    if (chk) { chk.classList.toggle('on', on); if (on) { chk.classList.remove('pop'); void chk.offsetWidth; chk.classList.add('pop'); } }
    const row = document.getElementById('wurow-' + id); if (row) row.classList.toggle('sel', on);
    this._wuRefreshBulk();
    if (navigator.vibrate) navigator.vibrate(6);
  },
  _wuRefreshBulk() {
    const s = this._srv(); if (!s) return;
    const rows = this._wuVisible(s);
    const selCount = rows.filter(r => this._wuSel[r.accountId]).length;
    const allSel = rows.length > 0 && rows.every(r => this._wuSel[r.accountId]);
    const bulk = document.getElementById('wubulk');
    if (bulk) { bulk.disabled = !selCount; bulk.innerHTML = this._wuTrash() + (selCount ? 'Выбрано: ' + selCount : 'Снять на сегодня'); }
    const all = document.getElementById('wuchkall'); if (all) all.classList.toggle('on', allSel);
  },
  _wuAll() {
    const s = this._srv(); if (!s) return;
    const rows = this._wuVisible(s), all = rows.length > 0 && rows.every(r => this._wuSel[r.accountId]);
    rows.forEach(r => this._wuSel[r.accountId] = !all);
    this._renderActive();
  },
  _wuBulk() {
    const s = this._srv(); if (!s) return;
    const n = this._wuVisible(s).filter(r => this._wuSel[r.accountId]).length;
    if (!n) return;
    this.openModal(`<div class="wb-modal-h"><h3>Снять прогрев на сегодня?</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      <p style="color:#54545c;font-size:14px;line-height:1.5;margin-bottom:18px">Вы точно хотите снять прогрев на сегодня для <b>${n}</b> ${this._plural(n, 'аккаунта', 'аккаунтов', 'аккаунтов')}? Расписание вернётся завтра автоматически.</p>
      <div style="display:flex;justify-content:flex-end;gap:10px"><button class="wb-wu-neutral" onclick="WB.closeModal()">Отмена</button><button class="wb-wu-danger" onclick="WB._wuRemove()">Снять</button></div>`, 420);
  },
  _wuRemove() {
    const s = this._srv(); if (s) this._wuVisible(s).forEach(r => { if (this._wuSel[r.accountId]) this._wuRemoved[r.accountId] = true; });
    this._wuSel = {}; this.closeModal(); this._renderActive();
  },

  // ═══ 5.4 ПОКУПКИ — новый OrderRow ═══
  _BANKS: ['Выбрать банк', 'Т-Банк', 'Альфа-Банк', 'Райффайзен', 'OZON', 'Яндекс Пей', 'ПСБ'],
  _ordState: {},
  _ordTimers: {},
  _buyFilter: { scheduled: true, in_progress: true, paid: true, error: true },
  _buySearch: '',
  _wuSel: {}, _wuRemoved: {},

  _buyRows(s) {
    const p = s.products, mk = (n) => p.concat(p).slice(0, n).map((x, i) => ({ id: 'i' + i, art: x.article, kw: x.keyword }));
    const addr = { short: 'Москва, ул. Ленина, 12', full: 'г. Москва, ул. Ленина, д. 12, корп. 3, кв. 45, подъезд 2, домофон 45К, ПВЗ Wildberries (вход со двора)' };
    return [
      { id: 'o1', name: 'Анна Петрова', phone: '+7 921 400-11-84', gender: 'f', items: mk(5), address: addr, status: { kind: 'in_progress', step: 5, total: 7, label: 'Ожидаю подтверждения оплаты', timer: '02:41' } },
      { id: 'o2', name: 'Максим Орлов', phone: '+7 921 400-11-85', gender: 'm', items: mk(4), address: { short: 'Санкт-Петербург, Невский пр., 28', full: 'г. Санкт-Петербург, Невский проспект, д. 28, лит. А, кв. 112, ПВЗ Wildberries' }, status: { kind: 'error', step: 3, total: 7, message: 'Не удалось добавить товар в корзину', code: 'ERR_ADD_ITEM_500' } },
      { id: 'o3', name: 'Елена Кузнецова', phone: '+7 921 400-11-86', gender: 'f', items: mk(2), address: addr, status: { kind: 'paid', paidAt: '12 мая, 14:22', bank: 'OZON' } },
      { id: 'o4', name: 'Даниил Козлов', phone: '+7 921 400-11-87', gender: 'm', items: mk(3), address: addr, status: { kind: 'scheduled', date: '14.05.2026', time: '09:00' } },
      { id: 'o5', name: 'Ольга Морозова', phone: '+7 921 400-11-88', gender: 'f', items: mk(1), address: addr, status: { kind: 'in_progress', step: 2, total: 7, label: 'Смотрю товары', timer: '30:30' } },
    ];
  },
  _buyCardsHtml(s) {
    const q = (this._buySearch || '').trim().toLowerCase();
    let rows = this._buyRows(s).filter(r => this._buyFilter[r.status.kind] !== false);
    if (q) rows = rows.filter(r => [r.name, r.phone, r.address.short, r.address.full].concat(r.items.map(i => i.art + ' ' + i.kw)).join(' ').toLowerCase().indexOf(q) >= 0);
    this._ordRows = rows;
    rows.forEach(r => { if (!this._ordState[r.id]) this._ordState[r.id] = { bank: 'Выбрать банк', skus: r.items.map(i => i.art), keywords: r.items.map(i => i.kw) }; });
    const head = `<div class="wb-ord-grid wb-ord-head"><span>Клиент</span><span>Товары</span><span>Адрес</span><span>Статус</span><span>Действие</span></div>`;
    // группы по порядку: В работе → Запланировано → Ошибка → Выполнено
    const groups = [
      { kind: 'in_progress', label: 'В работе', color: '#f5a623', sort: (a, b) => (b.status.step / b.status.total) - (a.status.step / a.status.total) },
      { kind: 'scheduled', label: 'Запланировано', color: '#2f5cf5', sort: (a, b) => (a.status.time || '').localeCompare(b.status.time || '') },
      { kind: 'error', label: 'Ошибка', color: '#d70015', sort: null },
      { kind: 'paid', label: 'Выполнено', color: '#30b46c', sort: null },
    ];
    let body = '';
    groups.forEach(g => {
      let gr = rows.filter(r => r.status.kind === g.kind);
      if (!gr.length) return;
      if (g.sort) gr = gr.slice().sort(g.sort);
      body += `<div class="wb-ord-gblock"><div class="wb-ord-group"><span class="gdot" style="background:${g.color}"></span>${g.label}<span class="gcount">${gr.length}</span></div>${gr.map(r => this._ordRowHtml(r)).join('')}</div>`;
    });
    if (!body) body = `<div class="wb-empty"><div class="wb-empty-title" style="color:#54545c">Ничего не найдено</div></div>`;
    return `<div class="wb-ord-wrap">${head}${body}</div>`;
  },
  _buySearchInput(v) { this._buySearch = v; this._renderBuyCards(); },
  _renderBuyCards() { const s = this._srv(), el = document.getElementById('wbBuyCards'); if (s && el) el.innerHTML = this._buyCardsHtml(s); },
  _buyStats(rows) {
    const c = { total: rows.length, scheduled: 0, in_progress: 0, paid: 0, error: 0 };
    rows.forEach(r => { c[r.status.kind] = (c[r.status.kind] || 0) + 1; });
    const pill = (key, label, color, count, toggle) => {
      const off = toggle && this._buyFilter[key] === false;
      return `<button class="wb-stat-pill ${toggle ? '' : 'static'} ${off ? 'off' : ''}" ${toggle ? `onclick="WB._buyToggle('${key}')"` : ''}><span class="wb-stat-dot" style="background:${color}"></span>${label}<span class="wb-stat-cnt">${count}</span></button>`;
    };
    return `<div class="wb-ord-stats">
      ${pill('total', 'Всего', '#8e8e93', c.total, false)}
      ${pill('scheduled', 'Запланировано', '#2f5cf5', c.scheduled, true)}
      ${pill('in_progress', 'В работе', '#f5a623', c.in_progress, true)}
      ${pill('paid', 'Выполнено', '#30b46c', c.paid, true)}
      ${pill('error', 'Ошибка', '#d70015', c.error, true)}
    </div>`;
  },
  _renderBuyStats() { const s = this._srv(), el = document.getElementById('wbBuyStats'); if (s && el) el.innerHTML = this._buyStats(this._buyRows(s)); },
  _buyToggle(key) { this._buyFilter[key] = this._buyFilter[key] === false ? true : false; this._renderBuyStats(); this._renderBuyCards(); if (navigator.vibrate) navigator.vibrate(8); },

  _ordSeg(total, step, isErr) {
    let h = '';
    for (let i = 0; i < total; i++) h += `<span class="${i < step ? 'on' : (isErr && i === step ? 'err' : '')}"></span>`;
    return `<div class="wb-ord-seg">${h}</div>`;
  },
  _ordItems(r) {
    const n = r.items.length, show = Math.min(3, n), more = n - show;
    let ph = '';
    for (let i = 0; i < show; i++) ph += this._photoLink(r.items[i].art, 'tm', 'wb-ord-photo');
    ph += more > 0 ? `<div class="wb-ord-more">+${more}</div>` : `<button class="wb-ord-dots" aria-label="Товары аккаунта">···</button>`;
    const list = r.items.map(it => `<div class="wb-ord-pop-row">${this._photoLink(it.art, 'tm', 'wb-ord-pop-ph')}<div><div class="wb-ord-pop-art wb-ord-mono">${it.art}</div><div class="wb-ord-pop-kw">${this._esc(it.kw)}</div></div></div>`).join('');
    return `<div class="wb-ord-items" onclick="WB._ordPop('${r.id}','items',event)">${ph}
      <div class="wb-ord-pop wb-ord-pop-items" id="pop-items-${r.id}"><div class="wb-ord-pop-title">Товары аккаунта</div>${list}</div></div>`;
  },
  _ordAddr(r) {
    return `<div class="wb-ord-addr" onclick="WB._ordPop('${r.id}','addr',event)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <span class="wb-ord-addr-txt">${this._esc(r.address.short)}</span>
      <div class="wb-ord-pop wb-ord-pop-addr" id="pop-addr-${r.id}"><div class="lbl">Адрес доставки</div><div class="txt">${this._esc(r.address.full)}</div></div></div>`;
  },
  _ordStatus(r) {
    const st = r.status;
    if (st.kind === 'in_progress') {
      const pay = this._ordState[r.id].pay;
      const txt = pay === 'going' ? 'Выхожу на оплату…' : pay === 'paying' ? 'Ожидаю оплату по QR-коду' : `${this._esc(st.label)} · ${st.step} из ${st.total}`;
      return `${this._ordSeg(st.total, st.step, false)}<div class="wb-ord-st-txt">${txt}</div>`;
    }
    if (st.kind === 'error') return `${this._ordSeg(st.total, st.step, true)}<div class="wb-ord-st-err">${this._esc(st.message)}</div><div class="wb-ord-st-code">${this._esc(st.code)}</div>`;
    if (st.kind === 'paid') return `<div class="wb-ord-st-flex"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#30b46c" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg><span class="ttl ok">Оплачено</span><span class="meta">${this._esc(st.paidAt)} · ${this._esc(st.bank)}</span></div>`;
    return `<div class="wb-ord-st-flex"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#a1a1a6" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg><span class="ttl">Запланирован на</span><span class="meta wb-ord-mono">${this._esc(st.date)} · ${this._esc(st.time)}</span></div>`;
  },
  _ordAction(r) {
    const st = r.status;
    if (st.kind === 'in_progress') {
      const s = this._ordState[r.id], bank = s.bank, dis = bank === 'Выбрать банк';
      // выхожу на оплату — банк зафиксирован, изменить нельзя
      if (s.pay === 'going') return `<div class="wb-ord-act"><span class="wb-ord-timer" id="otimer-${r.id}">${st.timer}</span><div class="wb-ord-pill"><button class="wb-ord-bank locked">${bank}</button></div></div>`;
      // на оплате — QR + подсвеченный банк + красный обратный таймер
      if (s.pay === 'paying') return `<div class="wb-ord-act"><span class="wb-ord-timer red" id="otimer-${r.id}">${this._fmt(s.sec == null ? 240 : s.sec)}</span>
        <div class="wb-ord-pill"><button class="wb-ord-bank locked">${bank}</button><button class="wb-ord-qr" onclick="WB._pickupCode()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="18" y1="14" x2="21" y2="14"/><line x1="21" y1="18" x2="21" y2="21"/></svg>QR-Код</button></div></div>`;
      // обычное — селект банка + Оплатить
      const opts = this._BANKS.map(b => `<div class="wb-ord-bank-opt ${b === bank ? 'sel' : ''}" onclick="WB._ordBankPick('${r.id}','${b}',event)">${b}</div>`).join('');
      return `<div class="wb-ord-act"><span class="wb-ord-timer" id="otimer-${r.id}">${st.timer}</span>
        <div class="wb-ord-pill" id="pill-${r.id}">
          <button class="wb-ord-bank" onclick="WB._ordBank('${r.id}',event)"><span id="bank-lbl-${r.id}">${bank}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>
          <button class="wb-ord-pay" id="pay-${r.id}" ${dis ? 'disabled' : ''} onclick="WB._ordPayStart('${r.id}')">Оплатить</button>
          <div class="wb-ord-bank-list">${opts}</div>
        </div></div>`;
    }
    if (st.kind === 'error') return `<div class="wb-ord-act"><button class="wb-ord-retry" onclick="WB._toast()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Повторить</button></div>`;
    if (st.kind === 'paid') return `<div class="wb-ord-act"></div>`;
    return `<div class="wb-ord-act"><button class="wb-ord-sbtn edit" onclick="WB._ordEdit('${r.id}',true)">Изменить</button><button class="wb-ord-sbtn del" onclick="WB._toast()">Удалить</button></div>`;
  },
  _ordCells(r) {
    return `${this._client(r.name, r.phone, r.gender)}
      <div class="wb-ord-cell">${this._ordItems(r)}</div>
      <div class="wb-ord-cell">${this._ordAddr(r)}</div>
      <div class="wb-ord-cell">${this._ordStatus(r)}</div>
      <div class="wb-ord-cell">${this._ordAction(r)}</div>`;
  },
  _ordRowHtml(r) {
    return `<div class="wb-ord-row k-${r.status.kind}" id="ord-${r.id}"><div class="wb-ord-grid wb-ord-main">${this._ordCells(r)}</div>${r.status.kind === 'scheduled' ? this._ordEditForm(r) : ''}</div>`;
  },
  _ordUpdateRow(id) {
    const row = document.getElementById('ord-' + id), r = (this._ordRows || []).find(x => x.id === id);
    if (!row || !r) return;
    const main = row.querySelector('.wb-ord-main'); if (main) main.innerHTML = this._ordCells(r);
  },
  _fmt(sec) { const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); },
  _ordPayStart(id) {
    const s = this._ordState[id]; if (!s || s.bank === 'Выбрать банк') return;
    s.pay = 'going'; this._ordUpdateRow(id);
    setTimeout(() => { const st = this._ordState[id]; if (st) { st.pay = 'paying'; st.sec = 240; this._ordUpdateRow(id); this._ordStartTimer(id); } }, 1400);
  },
  _ordStartTimer(id) {
    if (this._ordTimers[id]) clearInterval(this._ordTimers[id]);
    this._ordTimers[id] = setInterval(() => {
      const s = this._ordState[id];
      if (!s || s.pay !== 'paying') { clearInterval(this._ordTimers[id]); return; }
      s.sec = Math.max(0, (s.sec || 0) - 1);
      const el = document.getElementById('otimer-' + id); if (el) el.textContent = this._fmt(s.sec);
      if (s.sec <= 0) clearInterval(this._ordTimers[id]);
    }, 1000);
  },
  _ordEditForm(r) {
    const st = this._ordState[r.id];
    return `<div class="wb-ord-edit">
      <div class="wb-ord-erow1">
        <div><div class="wb-ord-flbl">Артикулы</div><div class="wb-ord-tags" id="tags-skus-${r.id}">${this._ordChipsHtml(r.id, 'skus')}<input placeholder="Добавить артикул" oninput="this.value=this.value.replace(/\\D/g,'')" onkeydown="WB._ordChipKey(event,'${r.id}','skus',this)"></div><div class="wb-ord-hint">Enter — добавить, только цифры</div></div>
        <div><div class="wb-ord-flbl">Ключевые слова</div><div class="wb-ord-tags" id="tags-keywords-${r.id}">${this._ordChipsHtml(r.id, 'keywords')}<input placeholder="Добавить слово" onkeydown="WB._ordChipKey(event,'${r.id}','keywords',this)"></div><div class="wb-ord-hint">Ищем товар по названию, если артикул неизвестен</div></div>
      </div>
      <div class="wb-ord-erow2">
        <div><div class="wb-ord-flbl">Адрес доставки</div><input class="wb-ord-finput" value="${this._esc(r.address.short)}"></div>
        <div><div class="wb-ord-flbl">Дата</div><input class="wb-ord-finput mono" value="${r.status.date}"></div>
        <div><div class="wb-ord-flbl">Время</div><input class="wb-ord-finput mono" value="${r.status.time}"></div>
      </div>
      <div class="wb-ord-eact"><button class="cancel" onclick="WB._ordEdit('${r.id}',false)">Отмена</button><button class="save" onclick="WB._ordEdit('${r.id}',false)">Сохранить</button></div>
    </div>`;
  },
  _ordChipsHtml(id, kind) {
    return (this._ordState[id][kind] || []).map((v, i) => `<span class="wb-ord-chip ${kind === 'skus' ? 'sku' : 'kw'}">${this._esc(v)}<b onclick="WB._ordChipDel('${id}','${kind}',${i})">✕</b></span>`).join('');
  },

  // взаимодействия
  _ordCloseOverlays() { document.querySelectorAll('.wb-ord-pop.open,.wb-ord-pill.open').forEach(el => el.classList.remove('open')); },
  _ordPop(id, which, e) {
    if (e) e.stopPropagation();
    const el = document.getElementById('pop-' + which + '-' + id); if (!el) return;
    const open = el.classList.contains('open');
    this._ordCloseOverlays();
    if (!open) el.classList.add('open');
  },
  _ordBank(id, e) {
    if (e) e.stopPropagation();
    const pill = document.getElementById('pill-' + id); if (!pill) return;
    const open = pill.classList.contains('open');
    this._ordCloseOverlays();
    if (!open) pill.classList.add('open');
  },
  _ordBankPick(id, val, e) {
    if (e) e.stopPropagation();
    this._ordState[id].bank = val;
    const lbl = document.getElementById('bank-lbl-' + id); if (lbl) lbl.textContent = val;
    const pay = document.getElementById('pay-' + id); if (pay) pay.disabled = (val === 'Выбрать банк');
    const pill = document.getElementById('pill-' + id);
    if (pill) { pill.querySelectorAll('.wb-ord-bank-opt').forEach(o => o.classList.toggle('sel', o.textContent === val)); pill.classList.remove('open'); }
  },
  _ordEdit(id, on) { const row = document.getElementById('ord-' + id); if (row) row.classList.toggle('editing', on); },
  _ordChipKey(e, id, kind, input) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = input.value.trim(); if (!v) return;
    this._ordState[id][kind].push(v);
    input.value = '';
    this._ordRefreshChips(id, kind);
  },
  _ordChipDel(id, kind, idx) { this._ordState[id][kind].splice(idx, 1); this._ordRefreshChips(id, kind); },
  _ordRefreshChips(id, kind) {
    const cont = document.getElementById('tags-' + kind + '-' + id); if (!cont) return;
    const isSku = kind === 'skus';
    cont.innerHTML = this._ordChipsHtml(id, kind) + `<input placeholder="${isSku ? 'Добавить артикул' : 'Добавить слово'}" ${isSku ? "oninput=\"this.value=this.value.replace(/\\D/g,'')\"" : ''} onkeydown="WB._ordChipKey(event,'${id}','${kind}',this)">`;
    const inp = cont.querySelector('input'); if (inp) inp.focus();
  },

  _renderPurchases(pane, s) {
    pane.innerHTML = `
      <div class="wb-toolbar">
        ${this._dayStrip()}
        <div class="wb-cal-anchor">
          <button class="wb-ico-btn" onclick="WB._toggleCal()" title="Календарь"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
          <div class="wb-cal-pop ${this._calOpen ? 'open' : ''}" id="wbCalPop">${this._calHtml()}</div>
        </div>
        <button class="wb-b wb-b-neutral" onclick="WB._massBuyout()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Массовый залив</button>
        <button class="wb-b wb-b-primary" onclick="WB._singleBuyout()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Одиночный выкуп</button>
      </div>
      <div class="wb-buy-bar">
        <div id="wbBuyStats">${this._buyStats(this._buyRows(s))}</div>
        <div class="wb-ord-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input placeholder="Поиск: имя, номер, артикул, адрес" value="${this._esc(this._buySearch)}" oninput="WB._buySearchInput(this.value)"></div>
      </div>
      <div id="wbBuyCards">${this._buyCardsHtml(s)}</div>`;
    requestAnimationFrame(() => this._wireStrip());
  },

  _dayStrip() {
    let prevMonth = null, html = '';
    const today = new Date('2026-08-11T00:00:00');
    this._buyDates.forEach(ds => {
      const d = new Date(ds + 'T00:00:00'), m = d.getMonth();
      if (prevMonth === null || m !== prevMonth) html += `<div class="wb-sep-slot"><div class="wb-month-sep">${this._MONTHS[m]}</div></div>`;
      prevMonth = m;
      const past = d < today;
      html += `<div class="wb-day-slot"><div class="wb-day ${past ? 'past' : ''} ${ds === this._activeDay ? 'active' : ''}" data-ds="${ds}" onclick="WB._pickDay('${ds}',false)"><span class="wb-day-dow">${this._DOW[d.getDay()]}</span><span class="wb-day-num">${String(d.getDate()).padStart(2, '0')}</span></div></div>`;
    });
    return `<div class="wb-daystrip" id="wbDayStrip">${html}</div>`;
  },
  // Точечное обновление: лента НЕ пересоздаётся (без вспышек/дёрганья).
  // fromCal=true — выбор из календаря, центрируем плитку; клик по плитке — нет.
  _pickDay(ds, fromCal) {
    this._activeDay = ds;
    const strip = document.getElementById('wbDayStrip');
    if (strip) strip.querySelectorAll('.wb-day').forEach(el => el.classList.toggle('active', el.dataset.ds === ds));
    if (this._calOpen) {
      const d = new Date(ds + 'T00:00:00'); this._calY = d.getFullYear(); this._calM = d.getMonth();
      const p = document.getElementById('wbCalPop'); if (p) p.innerHTML = this._calHtml();
    }
    this._renderBuyCards();
    if (fromCal && strip) {
      const tile = strip.querySelector('.wb-day.active');
      if (tile) { const slot = tile.parentElement; strip.scrollTo({ left: slot.offsetLeft - strip.clientWidth / 2 + slot.offsetWidth / 2, behavior: 'smooth' }); }
      requestAnimationFrame(() => this._stripScale(strip));
    }
  },

  // прокрутка ленты дат (колесо/драг) + плавное уменьшение крайних плиток
  _wireStrip() {
    const strip = document.getElementById('wbDayStrip'); if (!strip) return;
    strip.addEventListener('scroll', () => this._stripScale(strip), { passive: true });
    strip.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    let down = false, sx = 0, sl = 0, moved = false;
    strip.addEventListener('pointerdown', (e) => { down = true; moved = false; sx = e.clientX; sl = strip.scrollLeft; });
    strip.addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - sx; if (Math.abs(dx) > 4) moved = true; strip.scrollLeft = sl - dx; });
    const up = () => { down = false; };
    strip.addEventListener('pointerup', up); strip.addEventListener('pointerleave', up);
    strip.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    requestAnimationFrame(() => {
      const act = strip.querySelector('.wb-day.active');
      if (act) { const slot = act.parentElement; strip.scrollLeft = slot.offsetLeft - strip.clientWidth / 2 + slot.offsetWidth / 2; }
      this._stripScale(strip);
    });
  },
  _stripScale(strip) {
    const r = strip.getBoundingClientRect(), zone = 140, w = r.width;
    strip.querySelectorAll('.wb-day-slot, .wb-sep-slot').forEach(slot => {
      const sr = slot.getBoundingClientRect(), center = sr.left + sr.width / 2 - r.left;
      let t = 1;
      if (center < zone) t = center / zone;
      else if (center > w - zone) t = (w - center) / zone;
      t = Math.max(0, Math.min(1, t));
      const isSep = slot.classList.contains('wb-sep-slot');
      slot.style.opacity = t.toFixed(3);
      slot.style.transform = isSep ? '' : `scale(${(0.25 + 0.75 * t).toFixed(3)})`;
    });
  },

  // календарь
  _toggleCal() { this._calOpen = !this._calOpen; const p = document.getElementById('wbCalPop'); if (p) { p.classList.toggle('open', this._calOpen); p.innerHTML = this._calHtml(); } },
  _calNav(delta, e) { if (e) e.stopPropagation(); this._calM += delta; if (this._calM < 0) { this._calM = 11; this._calY--; } if (this._calM > 11) { this._calM = 0; this._calY++; } const p = document.getElementById('wbCalPop'); if (p) p.innerHTML = this._calHtml(); },
  _calHtml() {
    const y = this._calY, m = this._calM;
    const first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    const has = new Set(this._buyDates);
    let cells = '';
    for (let i = 0; i < lead; i++) cells += `<div class="wb-cal-day"></div>`;
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isHas = has.has(key), isAct = key === this._activeDay;
      cells += `<div class="wb-cal-day ${isHas ? 'has' : ''} ${isAct ? 'active' : ''}" ${isHas ? `onclick="WB._pickDay('${key}',true)"` : ''}>${d}</div>`;
    }
    return `
      <div class="wb-cal-head"><button class="wb-cal-nav" onclick="WB._calNav(-1,event)">‹</button><span class="wb-cal-title">${this._MONTHS[m]} ${y}</span><button class="wb-cal-nav" onclick="WB._calNav(1,event)">›</button></div>
      <div class="wb-cal-grid">${['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'].map(d => `<div class="wb-cal-dow">${d}</div>`).join('')}${cells}</div>
      <div class="wb-cal-legend"><span><i style="background:var(--accent)"></i>есть выкуп</span><span><i style="background:var(--surface2)"></i>нет данных</span></div>`;
  },

  // ═══ 5.5 ПОЛУЧЕНИЕ / ДОСТАВКА (light, табличный) ═══
  _pkRows(s) {
    const dmap = [{ t: 'Будет в ПВЗ 26 авг', c: 'blue' }, { t: 'Задерживается', c: 'amber' }, { t: 'Отменён', c: 'red' }];
    return s.accounts.map((a, i) => ({
      id: a.id, name: a.name, phone: a.phone, gender: a.gender, city: a.city,
      items: s.products.slice(0, (i % 3) + 1).map((p, j) => ({ id: 'pi' + j, art: p.article, kw: p.keyword })),
      address: { short: a.city + ', ' + a.pvz.split(',').slice(0, 2).join(','), full: a.pvz + ', ' + a.city },
      code: String(100000 + ((i * 73137 + 40193) % 900000)),
      tab: i % 3 === 2 ? 'delivery' : 'receive',
      dstatus: dmap[i % dmap.length]
    }));
  },
  _cityDd(cities) {
    const cur = this._pkCity || 'all', label = cur === 'all' ? 'Все города' : cur;
    const chev = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
    const opts = [{ v: 'all', t: 'Все города' }].concat(cities.map(c => ({ v: c, t: c })));
    return `<div class="wb-dd" id="dd-pkcity" style="min-width:180px"><button class="wb-dd-btn" onclick="WB._ddToggle('pkcity',event)"><span>${this._esc(label)}</span>${chev}</button><div class="wb-dd-list">${opts.map(o => `<div class="wb-dd-opt ${o.v === cur ? 'sel' : ''}" onclick="WB._pkCitySet('${this._esc(o.v).replace(/'/g, '')}',event)">${this._esc(o.t)}</div>`).join('')}</div></div>`;
  },
  _pkCitySet(v, e) { if (e) e.stopPropagation(); this._pkCity = v; this._ddCloseAll(); this._renderActive(); },
  _pkSubSet(t) { this._pkSub = t; this._renderActive(); },
  _renderPickup(pane, s) {
    const cities = [...new Set(s.accounts.map(a => a.city))];
    const sub = this._pkSub, city = this._pkCity;
    let rows = this._pkRows(s).filter(r => r.tab === sub && (city === 'all' || r.city === city));
    let body;
    if (sub === 'receive') {
      const g = 'display:grid;grid-template-columns:3px 220px 130px 1fr 180px 100px 180px;gap:16px;align-items:center;padding:12px 20px 12px 0';
      body = `<div class="wb-lcard wb-sys" style="min-width:1120px">
        <div class="wb-lcard-head" style="${g}"><span></span><span>Клиент</span><span>Товары</span><span>Адрес</span><span>Статус</span><span>Код</span><span></span></div>
        ${rows.map(r => `<div class="wb-lgrow" style="${g}"><span class="wb-wu-notch" style="background:${this._lnotchC('amber')}"></span>${this._client(r.name, r.phone, r.gender)}<div>${this._ordItems(r)}</div>${this._ordAddr(r)}${this._lstatusC('Ожидает получения', 'amber')}<span class="wb-ord-mono" style="font-size:14px;font-weight:600;color:#35353b">${this._fmtCode(r.code)}</span><span class="wb-pk-act"><button class="wb-b wb-b-primary sm" onclick="WB._pickupCode('${r.code}')">Получить</button><button class="wb-b wb-b-neutral sm" onclick="WB._toast()">Найти ПВЗ</button></span></div>`).join('') || `<div class="wb-empty"><div class="wb-empty-title" style="color:#54545c">Нет аккаунтов для получения</div></div>`}
      </div>`;
    } else {
      const g = 'display:grid;grid-template-columns:3px 220px 130px 1fr 230px;gap:16px;align-items:center;padding:12px 20px 12px 0';
      body = `<div class="wb-lcard wb-sys" style="min-width:840px">
        <div class="wb-lcard-head" style="${g}"><span></span><span>Клиент</span><span>Товары</span><span>Адрес</span><span>Статус</span></div>
        ${rows.map(r => `<div class="wb-lgrow" style="${g}"><span class="wb-wu-notch" style="background:${this._lnotchC(r.dstatus.c)}"></span>${this._client(r.name, r.phone, r.gender)}<div>${this._ordItems(r)}</div>${this._ordAddr(r)}${this._lstatusC(r.dstatus.t, r.dstatus.c)}</div>`).join('') || `<div class="wb-empty"><div class="wb-empty-title" style="color:#54545c">Нет отправлений</div></div>`}
      </div>`;
    }
    pane.innerHTML = `<div class="wb-lbar wb-sys">
        <span class="wb-subtabs"><button class="wb-subtab ${sub === 'receive' ? 'active' : ''}" onclick="WB._pkSubSet('receive')">Получение</button><button class="wb-subtab ${sub === 'delivery' ? 'active' : ''}" onclick="WB._pkSubSet('delivery')">Доставка</button></span>
        <span style="flex:1"></span>
        ${this._cityDd(cities)}
        ${sub === 'receive' ? '<button class="wb-b wb-b-neutral" onclick="WB._pickupExport()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Выгрузить получение</button>' : ''}
      </div>
      <div class="wb-sys" style="margin-top:14px">${body}</div>`;
  },
  _pickupExport() {
    const s = this._srv(); if (!s) return;
    const city = this._pkCity || 'all';
    const rows = this._pkRows(s).filter(r => r.tab === 'receive' && (city === 'all' || r.city === city));
    if (!rows.length) { if (window.Shell && Shell.toast) Shell.toast('Нет аккаунтов для выгрузки'); return; }
    const trs = rows.map(r => `<tr><td>${this._esc(r.phone)}</td><td>${this._esc(r.name)}</td><td>${r.items.map(i => i.art).join(', ')}</td><td>${this._esc(r.address.full)}</td><td>${this._fmtCode(r.code)}</td><td><img src="${this._qrDataUri(r.code)}" width="84" height="84"/></td></tr>`).join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:13px"><thead><tr style="background:#f0f0f3"><th>Номер</th><th>Имя</th><th>Товары</th><th>Адрес</th><th>Код получения</th><th>QR-Код</th></tr></thead><tbody>${trs}</tbody></table></body></html>`;
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const d = new Date(), date = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
    const a = document.createElement('a'); a.href = url; a.download = `получение_${city === 'all' ? 'все_города' : city}_${date}.xls`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (window.Shell && Shell.toast) Shell.toast(`Выгружено: ${rows.length} ${this._plural(rows.length, 'аккаунт', 'аккаунта', 'аккаунтов')}`);
  },

  // ═══ 5.6 ОТЗЫВЫ ═══
  _renderReviews(pane, s) {
    const sub = this._revSub; let body = '';
    if (sub === 'products') {
      if (this._revView === 'grid') {
        body = `<div class="wb-rev-grid">${s.products.map((p, i) => `<div class="wb-rev-card" onclick="WB._composer()"><img class="wb-rev-img" src="${this._wbUrls(p.article, 'c516x688').image}" loading="lazy" onerror="this.remove()" alt=""><div class="wb-rev-top"><div class="wb-rev-art">${p.article}</div><div class="wb-rev-kw">${this._esc(p.keyword)}</div></div><div class="wb-rev-bot"><div class="wb-rev-avail">Доступно: ${p.available}</div><div class="wb-rev-meta">план ${2 + i} · архив ${5 + i}</div></div></div>`).join('')}</div>`;
      } else {
        const g = 'display:grid;grid-template-columns:40px 1fr 140px auto;gap:16px;align-items:center';
        body = `<div class="wb-lwrap wb-sys" style="min-width:520px"><div class="wb-lhead" style="${g}"><span></span><span>Товар</span><span></span><span></span></div>${s.products.map(p => `<div class="wb-lrow" style="${g}">${this._photoLink(p.article, 'tm', 'wb-prod-ph')}<div class="wb-lcell"><div class="wb-ord-mono" style="font-weight:500;color:#44454e;font-size:13px">${p.article}</div><div style="color:#8a8a92;font-size:12px">${this._esc(p.keyword)}</div></div><span class="wb-lstatus green">Доступно: ${p.available}</span><span style="justify-self:end"><button class="wb-b wb-b-neutral sm" onclick="WB._composer()">Отзыв</button></span></div>`).join('')}</div>`;
      }
    } else {
      const isPlan = sub === 'plan', list = s.accounts.slice(0, 6);
      const REV = ['Товар супер, пришло быстро, качество на высоте, рекомендую', 'Всё понравилось, размер подошёл идеально, цвет как на фото', 'Хорошая вещь за свои деньги, упаковка целая, доставили вовремя', 'Отличный продавец, отвечает быстро, буду заказывать ещё', 'Ожидал большего по описанию, но в целом норм за эту цену', 'Пришло раньше срока, всё аккуратно упаковано, спасибо'];
      const g = 'display:grid;grid-template-columns:200px 34px 108px 82px 1fr 118px auto;gap:16px;align-items:center';
      body = `<div class="wb-lwrap wb-sys" style="min-width:920px">
        <div class="wb-lhead" style="${g}"><span>Клиент</span><span>Фото</span><span>Товар</span><span>Оценка</span><span>Отзыв</span><span>${isPlan ? 'План' : 'Дата'}</span><span></span></div>
        ${list.map((a, i) => { const art = s.products[i % s.products.length].article;
          return `<div class="wb-lrow" style="${g}">${this._client(a.name, a.phone, a.gender)}${this._photoLink(art, 'tm', 'wb-prod-ph')}<span class="wb-lcell wb-ord-mono" style="font-size:12.5px;color:#44454e">${art}</span><span style="color:#e6a817;letter-spacing:1px">${'★'.repeat(4 + (i % 2))}${'☆'.repeat(1 - (i % 2))}</span><span class="wb-lcell" style="font-size:12.5px;color:#76767d" title="${this._esc(REV[i % REV.length])}">${this._esc(REV[i % REV.length])}</span><span class="wb-lcell wb-ord-mono" style="font-size:12.5px;color:#8a8a92">0${(i % 5) + 1}.09 · 1${i}:00</span><span style="justify-self:end">${isPlan ? '<button class="wb-b wb-b-danger sm" onclick="WB._toast()">Отменить</button>' : this._lstatus(i % 2 ? 'опубликован' : 'написан')}</span></div>`; }).join('')}
      </div>`;
    }
    pane.innerHTML = `<div class="wb-toolbar">
        <span class="wb-subtabs">
          <button class="wb-subtab ${sub === 'products' ? 'active' : ''}" onclick="WB._revTab('products')">Товары</button>
          <button class="wb-subtab ${sub === 'plan' ? 'active' : ''}" onclick="WB._revTab('plan')">План</button>
          <button class="wb-subtab ${sub === 'archive' ? 'active' : ''}" onclick="WB._revTab('archive')">Архив</button>
        </span>
        <span class="wb-spacer"></span>
        ${sub === 'products' ? `<span class="wb-subtabs"><button class="wb-subtab ${this._revView === 'grid' ? 'active' : ''}" onclick="WB._revViewSet('grid')">Сетка</button><button class="wb-subtab ${this._revView === 'list' ? 'active' : ''}" onclick="WB._revViewSet('list')">Список</button></span>` : ''}
      </div>${body}`;
  },
  _revTab(t) { this._revSub = t; this._renderActive(); },
  _revViewSet(v) { this._revView = v; this._renderActive(); },

  // ═══ 5.7 СТАТИСТИКА ═══
  _renderStats(pane, s) {
    const kpis = [
      { l: 'Всего аккаунтов', v: s.accounts.length, d: '+3', up: true },
      { l: 'Активных', v: s.accounts.filter(a => a.status === 'активен').length, d: '+1', up: true },
      { l: 'В работе', v: 4, d: '−1', up: false },
      { l: 'Ошибок', v: 2, d: '+2', up: false },
    ];
    const days = 14, W = 560, H = 120, mk = (seed) => Array.from({ length: days }, (_, i) => 20 + Math.round(30 * Math.abs(Math.sin(i * 0.7 + seed)) + i));
    const series = [{ c: '#16a34a', d: mk(1) }, { c: '#2563eb', d: mk(2.4) }, { c: '#c98a04', d: mk(4) }];
    const max = Math.max(...series.flatMap(x => x.d));
    const path = (arr) => arr.map((v, i) => `${(i / (days - 1) * W).toFixed(1)},${(H - v / max * H).toFixed(1)}`).join(' ');
    const chart = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:140px" preserveAspectRatio="none">${series.map(x => `<polyline points="${path(x.d)}" fill="none" stroke="${x.c}" stroke-width="2" stroke-linejoin="round"/>`).join('')}</svg>`;
    const srvBars = this._servers.length ? this._servers : [s], barMax = Math.max(...srvBars.map(x => x.accounts.length), 1);
    pane.innerHTML = `
      <div class="wb-kpi-row">${kpis.map(k => `<div class="wb-kpi"><div class="wb-kpi-lbl">${k.l}</div><div class="wb-kpi-val">${k.v}</div><div class="wb-kpi-delta ${k.up ? 'up' : 'down'}">${k.d} за неделю</div></div>`).join('')}</div>
      <div class="wb-card"><div class="wb-sec-h"><h3>Активность за 14 дней</h3><span class="wb-spacer"></span><span style="font-size:11px;color:var(--text-dim)"><span style="color:#16a34a">●</span> Покупки&nbsp; <span style="color:#2563eb">●</span> Отзывы&nbsp; <span style="color:#c98a04">●</span> Регистрации</span></div>${chart}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="wb-card"><div class="wb-sec-h" style="margin-bottom:12px"><h3>По серверам</h3></div>${srvBars.map(x => `<div class="wb-bar-row"><span class="wb-bar-lbl">${this._esc(x.name)}</span><div class="wb-bar-track"><div style="width:${x.accounts.length / barMax * 100}%"></div></div><span class="wb-bar-val">${x.accounts.length}</span></div>`).join('')}</div>
        <div class="wb-card"><div class="wb-sec-h" style="margin-bottom:12px"><h3>По артикулам</h3></div>${s.products.map((p, i) => `<div class="wb-bar-row"><span class="wb-bar-lbl">${this._esc(p.keyword)}</span><div class="wb-bar-track"><div style="width:${90 - i * 18}%"></div></div><span class="wb-bar-val">${40 - i * 7}</span></div>`).join('')}</div>
      </div>`;
  },

  // ─── модалки-заглушки ────────────────────────────────────
  _singleBuyout() {
    this.openModal(`<div class="wb-modal-h"><h3>Одиночный выкуп</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      <div style="display:flex;gap:10px;margin-bottom:14px"><div class="wb-cap" style="flex:1"><span class="wb-ava f sm">Ж</span><span class="wb-cap-lbl">Доступно</span><b>18</b></div><div class="wb-cap" style="flex:1"><span class="wb-ava m sm">М</span><span class="wb-cap-lbl">Доступно</span><b>11</b></div></div>
      <div class="wb-field"><label>Товары (артикул + ключевое слово)</label><input class="wb-input" placeholder="187264500 · платье летнее"><div style="margin-top:7px"><button class="btn btn-secondary sm" onclick="WB._toast()">+ Добавить товар</button></div></div>
      <div class="wb-field"><label>Пол</label>${this._dd('sb-gender', ['Любой', 'Женский', 'Мужской'], 'Любой', 'full')}</div>
      <div class="wb-field"><label>Адрес ПВЗ</label><input class="wb-input" placeholder="Город, улица…"></div>
      <div style="display:flex;gap:10px"><div class="wb-field" style="flex:1"><label>Дата</label><input class="wb-input" type="date"></div><div class="wb-field" style="flex:1"><label>С</label><input class="wb-input" type="time"></div><div class="wb-field" style="flex:1"><label>До</label><input class="wb-input" type="time"></div></div>
      <button class="btn btn-primary wide" onclick="WB.closeModal()">Запустить выкуп</button>`);
  },
  _massBuyout() {
    this.openModal(`<div class="wb-modal-h"><h3>Массовый залив</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      <div style="border:2px dashed var(--border);border-radius:12px;padding:32px;text-align:center;color:var(--text-dim);margin-bottom:13px">Перетащи Excel-файл сюда<br><span style="font-size:12px">или нажми для выбора</span></div>
      <div style="display:flex;gap:10px"><div class="wb-field" style="flex:1"><label>Дата</label><input class="wb-input" type="date"></div><div class="wb-field" style="flex:1"><label>С</label><input class="wb-input" type="time"></div><div class="wb-field" style="flex:1"><label>До</label><input class="wb-input" type="time"></div></div>
      <p style="color:var(--text-dim);font-size:12px">После загрузки здесь появится таблица разобранных строк с полами, адресами и товарами.</p>`, 1080);
  },
  _pickupCode(code) {
    code = code || '340193';
    this.openModal(`<div class="wb-modal-h"><h3>Код получения</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      <div style="text-align:center;padding:6px"><img src="${this._qrDataUri(code)}" style="width:180px;height:180px;margin:0 auto 14px;border-radius:12px;border:1px solid var(--border)"><div class="wb-mono" style="font-size:30px;font-weight:800;letter-spacing:5px;color:var(--text)">${this._fmtCode(code)}</div><div style="color:var(--text-dim);font-size:12px;margin-top:6px">Назовите код или покажите QR на ПВЗ</div></div>`);
  },
  _composer() {
    this.openModal(`<div class="wb-modal-h"><h3>Новый отзыв</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      <div class="wb-field"><label>Оценка</label><div class="wb-stars" style="font-size:26px">★★★★★</div></div>
      <div class="wb-field"><label>Пол аккаунта</label>${this._dd('cm-gender', ['Любой', 'Женский', 'Мужской'], 'Любой', 'full')}</div>
      <div style="display:flex;gap:10px"><div class="wb-field" style="flex:1"><label>Дата</label><input class="wb-input" type="date"></div><div class="wb-field" style="flex:1"><label>Время</label><input class="wb-input" type="time"></div></div>
      <div class="wb-field"><label>Плюсы</label><input class="wb-input"></div>
      <div class="wb-field"><label>Минусы</label><input class="wb-input"></div>
      <div class="wb-field"><label>Комментарий</label><textarea class="wb-input" rows="3"></textarea></div>
      <div class="wb-field"><label>Фото / видео</label><div style="display:flex;gap:8px"><div class="wb-prod-ph" style="width:48px;height:48px"></div><button class="btn btn-secondary" style="width:48px;height:48px;padding:0;font-size:20px" onclick="WB._toast()">+</button></div></div>
      <button class="btn btn-primary wide" onclick="WB.closeModal()">Сохранить в план</button>`);
  },

  openModal(html, width) { const box = document.getElementById('wbModalBox'); box.style.width = (width || 560) + 'px'; box.innerHTML = html; document.getElementById('wbModal').classList.add('open'); },
  closeModal() { document.getElementById('wbModal').classList.remove('open'); },

  // ─── helpers ─────────────────────────────────────────────
  _ava(g) { return `<div class="wb-ava ${g}">${g === 'f' ? 'Ж' : 'М'}</div>`; },
  _chev() { return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:.6"><polyline points="6 9 12 15 18 9"/></svg>`; },
  _badge(status) {
    const map = {
      'активен': 'green', 'прошел': 'green', 'получен': 'blue', 'опубликован': 'green', 'не прошел': 'red', 'ошибка': 'red', 'новый': 'gray', 'написан': 'gray', 'ожидает в пвз': 'yellow', 'ожидает': 'yellow', 'в работе': 'blue', 'готов к регистрации': 'gray', 'запланирован': 'blue',
      // Прогрев — статус выполнения
      'Выполнен': 'green', 'В работе': 'blue', 'Ожидает': 'yellow', 'Ошибка': 'red',
      // Прогрев — статус аккаунта
      'Прогретый': 'green', 'Прошел': 'green', 'Доставка': 'blue', 'Ожидает на ПВЗ': 'yellow', 'Проверка': 'blue', 'Новый': 'gray'
    };
    return `<span class="wb-badge ${map[status] || 'gray'}">${this._esc(status)}</span>`;
  },
  // ссылки WB из артикула (без запросов) — товар в селлере + фото нужного размера
  _wbUrls(article, size) {
    const n = parseInt(article, 10) || 0;
    const vol = Math.floor(n / 100000), part = Math.floor(n / 1000);
    return { product: `https://www.wildberries.ru/catalog/${n}/detail.aspx`, image: `https://sam-basket-cdn-01.geobasket.ru/vol${vol}/part${part}/${n}/images/${size || 'big'}/1.webp` };
  },
  // кликабельное фото товара → переход на товар; при ошибке фото остаётся пустышкой
  _photoLink(article, size, cls) {
    const u = this._wbUrls(article, size);
    return `<a class="${cls} wb-photo" href="${u.product}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><img src="${u.image}" loading="lazy" onerror="this.remove()" alt=""></a>`;
  },
  // ─── ОБЩИЕ АТОМЫ (эталон из Покупок) ───
  _gAva(g) { return `<div class="wb-ord-ava ${g}">${g === 'f' ? 'Ж' : 'М'}</div>`; },
  _client(name, phone, gender) {
    return `<div class="wb-ord-client">${this._gAva(gender)}<div style="min-width:0"><div class="wb-ord-name">${this._esc(name)}</div><div class="wb-ord-phone wb-ord-mono">${this._esc(phone)}</div></div></div>`;
  },
  _execStatus(exec, label) {
    const map = {
      done: ['Выполнен', '<circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/>'],
      running: ['В работе', '<circle cx="12" cy="12" r="9"/><polyline points="12 8 12 12 14.5 13.5"/>'],
      pending: ['Ожидает', '<circle cx="12" cy="12" r="9" stroke-dasharray="2.6 2.6"/>'],
      error: ['Ошибка', '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12" y2="16.01"/>'],
    };
    const v = map[exec] || map.pending;
    return `<div class="wb-exec ${exec}"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${v[1]}</svg><span>${label || v[0]}</span></div>`;
  },
  _execNotch(exec) { return { done: '#4fae83', running: '#7d9dcf', pending: '#b4b4bb', error: '#dd8880' }[exec] || '#b4b4bb'; },
  _statusColor(status) {
    const m = { 'активен': 'green', 'прошел': 'green', 'прогретый': 'green', 'получен': 'blue', 'доставка': 'blue', 'опубликован': 'green', 'ожидает в пвз': 'amber', 'ожидает на пвз': 'amber', 'проверка': 'amber', 'новый': 'grey', 'написан': 'grey', 'не прошел': 'red', 'ошибка': 'red', 'готов к регистрации': 'grey', 'запланирован': 'blue' };
    return m[String(status).toLowerCase()] || 'grey';
  },
  _lstatus(status) { return `<span class="wb-lstatus ${this._statusColor(status)}">${this._esc(status)}</span>`; },
  _lnotch(status) { return { green: '#4fae83', blue: '#7d9dcf', amber: '#d0a24a', grey: '#b4b4bb', red: '#dd8880' }[this._statusColor(status)]; },
  _lstatusC(text, c) { return `<span class="wb-lstatus ${c}">${this._esc(text)}</span>`; },
  _lnotchC(c) { return { green: '#4fae83', blue: '#7d9dcf', amber: '#d0a24a', grey: '#b4b4bb', red: '#dd8880' }[c] || '#b4b4bb'; },
  _fmtCode(c) { c = String(c); return c.slice(0, 3) + ' ' + c.slice(3); },
  // QR-плейсхолдер: детерминированный узор из кода (реальный QR — с бэкендом)
  _qrDataUri(code) {
    const n = 21, cell = 4, sz = n * cell;
    let seed = 5381; for (const ch of String(code)) seed = ((seed * 33) ^ ch.charCodeAt(0)) >>> 0;
    const bit = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 17) & 1; };
    let r = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const corner = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9); if (!corner && bit()) r += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`; }
    const f = (ox, oy) => `<rect x="${ox}" y="${oy}" width="${7 * cell}" height="${7 * cell}" fill="none" stroke="#000" stroke-width="${cell}"/><rect x="${ox + 2 * cell}" y="${oy + 2 * cell}" width="${3 * cell}" height="${3 * cell}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}"><rect width="${sz}" height="${sz}" fill="#fff"/><g fill="#000">${r}</g>${f(0, 0)}${f((n - 7) * cell, 0)}${f(0, (n - 7) * cell)}</svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  },
  _lastLogin(l) {
    if (!l) return '<span class="wb-ac-dash">—</span>';
    if (l.d === 0) return 'Сегодня в ' + (l.t || '—');
    if (l.d === 1) return 'вчера';
    return l.d + ' ' + this._plural(l.d, 'день', 'дня', 'дней') + ' назад';
  },
  _prodChips(products, showN) {
    if (!products || !products.length) return '';
    const first = products.slice(0, showN), more = products.length - first.length;
    let h = first.map(p => `<span class="wb-prod">${this._photoLink(p.article, 'tm', 'wb-prod-ph')}<span class="wb-mono">${p.article}</span></span>`).join('');
    if (more > 0) h += `<span class="wb-prod-more" onclick="WB._prodMore()">+${more}</span>`;
    return `<div class="wb-prod-list">${h}</div>`;
  },
  _prodMore() {
    const s = this._srv(); if (!s) return;
    this.openModal(`<div class="wb-modal-h"><h3>Товары аккаунта</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      ${s.products.map((p, i) => `<div style="display:flex;align-items:center;gap:11px;padding:10px 0;${i < s.products.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">${this._photoLink(p.article, 'tm', 'wb-prod-ph')}<div><div class="wb-mono" style="font-weight:700;color:var(--text)">${p.article}</div><div style="color:var(--text-dim);font-size:12px">${this._esc(p.keyword)}</div></div></div>`).join('')}`, 380);
  },
  _emptyState(title, sub, action) {
    return `<div class="wb-empty"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg><div class="wb-empty-title">${title}</div><div>${sub}</div>${action ? '<div style="margin-top:6px">' + action + '</div>' : ''}</div>`;
  },
  _toast() { if (window.Shell && Shell.toast) Shell.toast('Серверная логика будет реализована позже'); if (navigator.vibrate) navigator.vibrate(10); },
  _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

  onWS(data) { /* серверная синхронизация — следующий этап */ },
};

window.WB = WB;
WB.init();
