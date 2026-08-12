/* ═══════════════════════════════════════════════════════════
   Продвижение WB — модуль (визуальная оболочка, данные замоканы).
   Глобальные стили Horseoff; серверная логика — следующим этапом.
   ═══════════════════════════════════════════════════════════ */
var WB = {
  _servers: [], _active: null, _tab: 'accounts', _testOn: false,
  _sel: {}, _regSub: 'pool', _revSub: 'products', _revView: 'grid', _genderVal: 50,
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
      });
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
    const CITIES = ['Москва','Санкт-Петербург','Казань','Екатеринбург','Новосибирск'];
    const ST = ['активен','активен','активен','новый','не прошел','ожидает в пвз','получен'];
    const accts = [];
    for (let i = 0; i < 14; i++) {
      const f = i % 2 === 0;
      accts.push({
        id: 'a' + i, name: f ? NF[i % NF.length] : NM[i % NM.length], gender: f ? 'f' : 'm',
        phone: '+7 921 400-11-' + String(80 + i).padStart(2, '0'),
        lastLogin: ['сейчас','2ч','вчера','5ч','3д'][i % 5], status: ST[i % ST.length],
        article: '' + (187264500 + i * 2), keyword: ['платье летнее','сарафан','джинсы','кроссовки','футболка'][i % 5],
        pvz: 'ул. Ленина, ' + (5 + i) + ', ПВЗ Wildberries', city: CITIES[i % CITIES.length]
      });
    }
    const products = [
      { id: 'p1', article: '187264500', keyword: 'платье летнее', available: 12 },
      { id: 'p2', article: '187264502', keyword: 'сарафан', available: 7 },
      { id: 'p3', article: '187264504', keyword: 'джинсы', available: 3 },
      { id: 'p4', article: '187264506', keyword: 'кроссовки', available: 21 },
    ];
    return { id: '__test__', name: 'Server-RU-01', status: 'online', test: true, accounts: accts, products: products };
  },

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
      <div class="wb-field"><label>Название сервера</label><input class="wb-input" id="wbNewSrvName" placeholder="Server-RU-02" autofocus></div>
      <p style="color:var(--text-dim);font-size:12px;margin-bottom:14px">Пока сервер создаётся локально (без бэкенда) — для дебага интерфейса. Реальная привязка появится позже.</p>
      <button class="btn btn-primary wide" onclick="WB._createServer()">Создать сервер</button>`, 460);
    setTimeout(() => { const el = document.getElementById('wbNewSrvName'); if (el) el.focus(); }, 50);
  },
  _createServer() {
    const el = document.getElementById('wbNewSrvName');
    const name = el ? el.value.trim() : '';
    if (!name) { if (window.Shell && Shell.toast) Shell.toast('Введите название сервера'); return; }
    const base = this._buildTest();
    const srv = { id: 's' + Date.now(), name: name, status: 'online', accounts: base.accounts.slice(0, 8), products: base.products };
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
      el.innerHTML = this._servers.map(s => `
        <div class="wb-srv ${s.id === this._active ? 'active' : ''} ${s.test ? 'test' : ''}" onclick="WB.selectServer('${s.id}')">
          <span class="wb-srv-dot ${s.status}"></span>
          <div class="wb-srv-body"><div class="wb-srv-name">${this._esc(s.name)}</div><div class="wb-srv-sub">${s.accounts.length} аккаунтов</div></div>
        </div>`).join('');
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
    const name = document.getElementById('wbHeadName'), st = document.getElementById('wbHeadStatus'), cnt = document.getElementById('wbHeadCount');
    if (!s) { name.textContent = 'Сервер не выбран'; st.innerHTML = ''; cnt.innerHTML = ''; return; }
    name.textContent = s.name;
    st.innerHTML = `<span class="wb-srv-dot ${s.status}"></span>${s.status === 'online' ? 'Online' : 'Offline'}`;
    cnt.innerHTML = `<b>${s.accounts.length}</b> аккаунтов`;
  },

  switchTab(tab) {
    this._tab = tab; this._calOpen = false;
    document.querySelectorAll('#wbTabs .wb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
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
  _renderAccounts(pane, s) {
    const selCount = Object.values(this._sel).filter(Boolean).length;
    const rows = s.accounts.map(a => `
      <div class="wb-row" style="min-width:960px">
        <span class="wb-chk ${this._sel[a.id] ? 'on' : ''}" onclick="WB._toggleSel('${a.id}')"></span>
        ${this._ava(a.gender)}
        <div class="wb-cell" style="width:180px"><div class="wb-acc-name">${this._esc(a.name)}</div><div class="wb-acc-phone wb-mono">${this._esc(a.phone)}</div></div>
        <div class="wb-cell wb-mono" style="width:60px;color:var(--text-dim);font-size:12px">${a.lastLogin}</div>
        <div class="wb-cell" style="width:120px">${this._badge(a.status)}</div>
        <div class="wb-cell wb-mono" style="width:150px;font-size:12px"><div style="color:var(--text)">${a.article}</div><div style="color:var(--text-dim)">${this._esc(a.keyword)}</div></div>
        <div class="wb-cell" style="width:210px;color:var(--text-dim);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${this._esc(a.pvz || '')}">${a.pvz ? this._esc(a.pvz) : '—'}</div>
        <span class="wb-spacer"></span>
        <button class="btn btn-secondary sm" onclick="WB._toast()">Архив</button>
      </div>`).join('');
    pane.innerHTML = `
      <div class="wb-toolbar">
        <div class="wb-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input placeholder="Поиск по имени, телефону, артикулу…"></div>
        <span class="wb-chip">Статус ${this._chev()}</span>
        <span class="wb-chip">Пол ${this._chev()}</span>
      </div>
      ${selCount ? `<div class="wb-bulk">Выбрано: <b>${selCount}</b><span class="wb-spacer"></span><button class="btn btn-secondary sm" onclick="WB._toast()">Архивировать</button><button class="btn btn-secondary sm" onclick="WB._clearSel()">Снять выделение</button></div>` : ''}
      <div class="wb-card flush"><div class="wb-table-wrap">
        <div class="wb-thead" style="min-width:960px"><span style="width:17px"></span><span style="width:30px"></span><span style="width:180px">Аккаунт</span><span style="width:60px">Вход</span><span style="width:120px">Статус</span><span style="width:150px">Артикул / ключ</span><span style="width:210px">Последний ПВЗ</span><span class="wb-spacer"></span><span></span></div>
        ${rows}
      </div></div>`;
  },
  _toggleSel(id) { this._sel[id] = !this._sel[id]; this._renderActive(); },
  _clearSel() { this._sel = {}; this._renderActive(); },

  // ═══ 5.2 РЕГИСТРАТОР ═══
  _renderReg(pane, s) {
    const sub = this._regSub; let body = '';
    if (sub === 'pool') {
      const pool = s.accounts.slice(0, 6);
      body = `
        <div class="wb-hud">
          <div class="wb-cap"><span class="wb-cap-lbl">Автопланирование</span></div>
          <div class="wb-cap" onmouseenter="WB._genderHover(true)" onmouseleave="WB._genderHover(false)"><span class="wb-ava f sm" id="wbGaF">Ж</span><input type="range" class="wb-slider" id="wbGenderSlider" min="0" max="100" value="${this._genderVal}" oninput="WB._genderInput()"><span class="wb-ava m sm" id="wbGaM">М</span></div>
          <div class="wb-cap"><span class="wb-cap-lbl">Кол-во</span><div class="wb-step"><button onclick="WB._toast()">−</button><span class="v wb-mono">10</span><button onclick="WB._toast()">+</button></div></div>
          <div class="wb-cap"><span class="wb-cap-lbl">В пуле</span><b class="wb-mono">${pool.length}</b></div>
          <span class="wb-spacer"></span>
          <button class="btn btn-primary" onclick="WB._toast()">Запланировать</button>
        </div>
        <div class="wb-card flush"><div class="wb-table-wrap">
          <div class="wb-thead" style="min-width:380px"><span style="width:17px"></span><span style="width:30px"></span><span style="width:150px">Телефон</span><span class="wb-spacer"></span><span>Статус</span></div>
          ${pool.map(a => `<div class="wb-row" style="min-width:380px"><span class="wb-chk"></span>${this._ava(a.gender)}<div class="wb-cell wb-mono" style="width:150px">${this._esc(a.phone)}</div><span class="wb-spacer"></span>${this._badge('готов к регистрации')}</div>`).join('')}
        </div></div>
        <div><button class="btn btn-secondary" onclick="WB._toast()">Запланировать выбранные</button></div>`;
    } else if (sub === 'active') {
      const act = s.accounts.slice(0, 5);
      body = `
        <div class="wb-toolbar"><span class="wb-subtabs"><button class="wb-subtab active">Сегодня</button><button class="wb-subtab">Завтра</button></span></div>
        <div class="wb-card flush"><div class="wb-table-wrap">
          <div class="wb-thead" style="min-width:690px"><span style="width:30px"></span><span style="width:160px">Телефон</span><span style="width:120px">Статус</span><span style="width:70px">Время</span><span class="wb-spacer"></span><span></span></div>
          ${act.map((a, i) => { const err = i === 1;
            return `<div class="wb-row" style="min-width:690px">${this._ava(a.gender)}<div class="wb-cell wb-mono" style="width:160px">${this._esc(a.phone)}</div><div class="wb-cell" style="width:120px">${this._badge(err ? 'ошибка' : 'запланирован')}</div><div class="wb-cell wb-mono" style="width:70px;color:var(--text)">${['09:20','11:40','13:05','15:30','18:10'][i]}</div><span class="wb-spacer"></span>${err ? '<button class="btn btn-danger sm" onclick="WB._toast()">Повторить</button>' : ''}<button class="btn btn-secondary sm" onclick="WB._toast()">Время</button></div>`; }).join('')}
        </div></div>`;
    } else {
      const arc = s.accounts.slice(0, 6);
      body = `<div class="wb-card flush"><div class="wb-table-wrap">
        <div class="wb-thead" style="min-width:600px"><span style="width:30px"></span><span style="width:160px">Телефон</span><span style="width:140px">Результат</span><span class="wb-spacer"></span><span>Дата</span></div>
        ${arc.map((a, i) => `<div class="wb-row" style="min-width:600px">${this._ava(a.gender)}<div class="wb-cell wb-mono" style="width:160px">${this._esc(a.phone)}</div><div class="wb-cell" style="width:140px">${this._badge(i % 3 === 2 ? 'не прошел' : 'прошел')}</div><span class="wb-spacer"></span><span class="wb-mono" style="color:var(--text-dim)">0${(i % 3) + 1}.09</span></div>`).join('')}
      </div></div>`;
    }
    pane.innerHTML = `<div class="wb-toolbar"><span class="wb-subtabs">
        <button class="wb-subtab ${sub === 'pool' ? 'active' : ''}" onclick="WB._regTab('pool')">Доступны</button>
        <button class="wb-subtab ${sub === 'active' ? 'active' : ''}" onclick="WB._regTab('active')">Активные</button>
        <button class="wb-subtab ${sub === 'archive' ? 'active' : ''}" onclick="WB._regTab('archive')">Архив</button>
      </span></div>${body}`;
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
  _renderWarmup(pane, s) {
    const accSt = ['Прогретый', 'Доставка', 'Ожидает на ПВЗ', 'Проверка', 'Прошел', 'Новый'];
    const execSt = ['Выполнен', 'В работе', 'Ожидает', 'Ошибка'];
    const times = ['14:30', '09:15', '—', '16:40', '11:00', '13:20', '18:05', '10:10'];
    const rows = s.accounts.slice(0, 8).map((a, i) => `
      <div class="wb-row" style="min-width:860px">
        ${this._ava(a.gender)}
        <div class="wb-cell" style="width:200px"><div class="wb-acc-name">${this._esc(a.name)}</div><div class="wb-acc-phone wb-mono">${this._esc(a.phone)}</div></div>
        <div class="wb-cell wb-mono" style="width:80px;color:var(--text)">${times[i]}</div>
        <div class="wb-cell" style="width:170px">${this._badge(accSt[i % accSt.length])}</div>
        <div class="wb-cell" style="width:150px">${this._badge(execSt[i % execSt.length])}</div>
        <span class="wb-spacer"></span>
        <button class="btn btn-secondary sm" onclick="WB._toast()">Снять на сегодня</button>
      </div>`).join('');
    pane.innerHTML = `
      <div class="wb-card" style="display:flex;align-items:center;gap:10px;color:var(--text-dim);font-size:12px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>Прогрев планируется вне интерфейса и выполняется автоматически в течение дня. Здесь — только просмотр.</div>
      <div class="wb-card flush"><div class="wb-table-wrap">
        <div class="wb-thead" style="min-width:860px"><span style="width:30px"></span><span style="width:200px">Аккаунт</span><span style="width:80px">Время</span><span style="width:170px">Статус</span><span style="width:150px">Статус выполнения</span><span class="wb-spacer"></span><span></span></div>
        ${rows}
      </div></div>`;
  },

  // ═══ 5.4 ПОКУПКИ ═══
  _buyCardsHtml(s) {
    const stageNames = ['Проверка аккаунта','Смотрю товары','Смотрю конкурентов','Добавляю товар','Выбираю ПВЗ','Ожидаю подтверждение оплаты','Проверяю оплату'];
    return s.accounts.slice(0, 5).map((a, i) => {
      const planned = i >= 4, noAcc = i === 3, stage = [2, 5, 6, 3, 0][i];
      const tcls = ['green', 'yellow', 'red', 'green', 'green'][i], timers = ['01:33:40', '15:40', '04:20', '30:30', ''];
      const seg = `<div class="wb-seg">${stageNames.map((_, si) => `<span class="${si < stage ? 'on' : ''}"></span>`).join('')}</div>`;
      const stageBlock = planned
        ? `<span style="color:var(--text-dim);font-size:12px">запуск <b class="wb-mono" style="color:var(--text)">10:00–14:00</b></span>`
        : `<div class="wb-stage-head"><span class="wb-stage-name">${stageNames[Math.min(stage, 6)]}</span><span class="wb-stage-cnt">${stage} / 7</span></div>${seg}`;
      const nameBlock = noAcc ? `<span style="color:var(--danger);font-weight:700">Нет аккаунта</span>`
        : `<div class="wb-acc-name">${this._esc(a.name)}</div><div class="wb-acc-phone wb-mono">${this._esc(a.phone)}</div>`;
      let sub = '';
      if (stage === 5 && !planned) sub = `<div class="wb-buy-sub"><span class="wb-cap-lbl">Оплата:</span>${this._dd('bank' + i, ['Выбрать банк', 'Сбербанк', 'Т-Банк', 'Альфа-Банк', 'ВТБ'], 'Выбрать банк', 170)}<span class="wb-spacer"></span><button class="btn btn-primary sm" onclick="WB._toast()">Оплатить</button></div>`;
      if (i === 2) sub = `<div class="wb-buy-sub"><span class="wb-badge red">Ошибка выполнения</span><span class="wb-spacer"></span><button class="btn btn-danger sm" onclick="WB._toast()">Перезапуск</button></div>`;
      return `<div class="wb-buy"><div class="wb-buy-main">
        ${this._ava(a.gender)}
        <div class="wb-cell" style="width:150px">${nameBlock}</div>
        <div class="wb-cell" style="width:170px">${this._prodChips(s.products, 1)}</div>
        <div class="wb-cell" style="width:200px">${stageBlock}</div>
        <span class="wb-spacer"></span>
        ${planned ? '' : `<span class="wb-timer ${tcls}">${timers[i]}</span>`}
      </div>${sub}</div>`;
    }).join('');
  },
  _renderBuyCards() { const s = this._srv(), el = document.getElementById('wbBuyCards'); if (s && el) el.innerHTML = this._buyCardsHtml(s); },

  _renderPurchases(pane, s) {
    pane.innerHTML = `
      <div class="wb-toolbar">
        ${this._dayStrip()}
        <div class="wb-cal-anchor">
          <button class="wb-ico-btn" onclick="WB._toggleCal()" title="Календарь"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
          <div class="wb-cal-pop ${this._calOpen ? 'open' : ''}" id="wbCalPop">${this._calHtml()}</div>
        </div>
        <button class="btn btn-secondary" onclick="WB._massBuyout()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Массовый залив</button>
        <button class="btn btn-primary" onclick="WB._singleBuyout()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Одиночный выкуп</button>
      </div>
      <div class="wb-sec-h" style="margin-top:2px"><h3>Сегодня</h3><span style="color:var(--text-dim);font-size:12px;font-weight:600">4 выкупа в работе</span></div>
      <div id="wbBuyCards" style="display:flex;flex-direction:column;gap:12px">${this._buyCardsHtml(s)}</div>`;
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

  // ═══ 5.5 ПОЛУЧЕНИЕ ═══
  _renderPickup(pane, s) {
    const rows = s.accounts.slice(0, 7).map((a, i) => `
      <div class="wb-row" style="min-width:1050px">${this._ava(a.gender)}
        <div class="wb-cell" style="width:170px"><div class="wb-acc-name">${this._esc(a.name)}</div><div class="wb-acc-phone wb-mono">${this._esc(a.phone)}</div></div>
        <div class="wb-cell" style="width:220px">${this._prodChips(s.products, 1)}</div>
        <div class="wb-cell" style="width:230px;color:var(--text-dim);font-size:12px" title="${this._esc(a.pvz)}">${this._esc(a.pvz)}</div>
        <div class="wb-cell" style="width:180px">${i % 2 ? '<span class="wb-badge blue">будет в ПВЗ 26 авг</span>' : '<span class="wb-badge yellow">ожидает до 30 авг</span>'}</div>
        <span class="wb-spacer"></span>
        <button class="btn btn-primary sm" onclick="WB._pickupCode()">Получить</button>
        <button class="btn btn-secondary sm" onclick="WB._toast()">Найти ПВЗ</button>
      </div>`).join('');
    pane.innerHTML = `
      <div class="wb-toolbar"><span class="wb-chip">Город ${this._chev()}</span><span class="wb-spacer"></span><button class="btn btn-secondary" onclick="WB._toast()">Выгрузить получение</button></div>
      <div class="wb-card flush"><div class="wb-table-wrap">
        <div class="wb-thead" style="min-width:1050px"><span style="width:30px"></span><span style="width:170px">Аккаунт</span><span style="width:220px">Товары</span><span style="width:230px">Адрес ПВЗ</span><span style="width:180px">Статус</span><span class="wb-spacer"></span><span></span></div>
        ${rows}
      </div></div>`;
  },

  // ═══ 5.6 ОТЗЫВЫ ═══
  _renderReviews(pane, s) {
    const sub = this._revSub; let body = '';
    if (sub === 'products') {
      if (this._revView === 'grid') {
        body = `<div class="wb-rev-grid">${s.products.concat(s.products).map((p, i) => `<div class="wb-rev-card" onclick="WB._composer()"><div class="wb-rev-top"><div class="wb-rev-art">${p.article}</div><div class="wb-rev-kw">${this._esc(p.keyword)}</div></div><div class="wb-rev-bot"><div class="wb-rev-avail">Доступно: ${p.available}</div><div class="wb-rev-meta">план ${2 + i} · архив ${5 + i}</div></div></div>`).join('')}</div>`;
      } else {
        body = `<div class="wb-card flush"><div class="wb-table-wrap">${s.products.map(p => `<div class="wb-row" style="min-width:500px"><div class="wb-prod-ph" style="width:36px;height:36px"></div><div class="wb-cell" style="width:140px"><div class="wb-mono" style="font-weight:700;color:var(--text)">${p.article}</div><div style="color:var(--text-dim);font-size:12px">${this._esc(p.keyword)}</div></div><span class="wb-spacer"></span><span class="wb-badge green">Доступно: ${p.available}</span><button class="btn btn-secondary sm" onclick="WB._composer()">Отзыв</button></div>`).join('')}</div></div>`;
      }
    } else {
      const isPlan = sub === 'plan', list = s.accounts.slice(0, 6);
      body = `<div class="wb-card flush"><div class="wb-table-wrap">
        <div class="wb-thead" style="min-width:850px"><span style="width:30px"></span><span style="width:170px">Аккаунт</span><span style="width:50px">Фото</span><span style="width:150px">Товар</span><span style="width:90px">Оценка</span><span style="width:110px">${isPlan ? 'План' : 'Дата'}</span><span class="wb-spacer"></span><span></span></div>
        ${list.map((a, i) => `<div class="wb-row" style="min-width:850px">${this._ava(a.gender)}<div class="wb-cell" style="width:170px"><div class="wb-acc-name">${this._esc(a.name)}</div><div class="wb-acc-phone wb-mono">${this._esc(a.phone)}</div></div><div class="wb-cell wb-prod-ph" style="width:34px;height:34px"></div><div class="wb-cell wb-mono" style="width:150px;font-size:12px;color:var(--text)">${s.products[i % s.products.length].article}</div><div class="wb-cell wb-stars" style="width:90px">${'★'.repeat(4 + (i % 2))}${'☆'.repeat(1 - (i % 2))}</div><div class="wb-cell wb-mono" style="width:110px;font-size:12px;color:var(--text-dim)">0${(i % 5) + 1}.09 1${i}:00</div><span class="wb-spacer"></span>${isPlan ? '<button class="btn btn-danger sm" onclick="WB._toast()">Отменить</button>' : this._badge(i % 2 ? 'опубликован' : 'написан')}</div>`).join('')}
      </div></div>`;
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
  _pickupCode() {
    this.openModal(`<div class="wb-modal-h"><h3>Код получения</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      <div style="text-align:center;padding:10px"><div style="width:180px;height:180px;margin:0 auto 14px;background:repeating-linear-gradient(45deg,var(--text),var(--text) 6px,var(--surface) 6px,var(--surface) 12px);border-radius:12px"></div><div class="wb-mono" style="font-size:30px;font-weight:800;letter-spacing:5px;color:var(--text)">4821</div><div style="color:var(--text-dim);font-size:12px;margin-top:6px">Назовите код на ПВЗ</div></div>`);
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
  _prodChips(products, showN) {
    if (!products || !products.length) return '';
    const first = products.slice(0, showN), more = products.length - first.length;
    let h = first.map(p => `<span class="wb-prod"><span class="wb-prod-ph">фо</span><span class="wb-mono">${p.article}</span></span>`).join('');
    if (more > 0) h += `<span class="wb-prod-more" onclick="WB._prodMore()">+${more}</span>`;
    return `<div class="wb-prod-list">${h}</div>`;
  },
  _prodMore() {
    const s = this._srv(); if (!s) return;
    this.openModal(`<div class="wb-modal-h"><h3>Товары аккаунта</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      ${s.products.map((p, i) => `<div style="display:flex;align-items:center;gap:11px;padding:10px 0;${i < s.products.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}"><div class="wb-prod-ph" style="width:40px;height:40px"></div><div><div class="wb-mono" style="font-weight:700;color:var(--text)">${p.article}</div><div style="color:var(--text-dim);font-size:12px">${this._esc(p.keyword)}</div></div></div>`).join('')}`, 380);
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
