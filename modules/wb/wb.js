/* ═══════════════════════════════════════════════════════════
   Выкупы WB — модуль (пока визуальная оболочка, данные замоканы)
   Серверная логика подключается следующим этапом.
   ═══════════════════════════════════════════════════════════ */
var WB = {
  _servers: [],
  _active: null,
  _tab: 'accounts',
  _testOn: false,
  _sel: {},          // выбранные чекбоксы (Аккаунты)
  _regSub: 'pool',
  _revSub: 'products',
  _revView: 'grid',
  _pickCity: '',

  init() {
    this._renderServers();
    this._renderHeader();
    this._renderActive();
  },

  // ─── мок тестового сервера ───────────────────────────────
  _buildTest() {
    const NAMES_F = ['Диана','Ольга','Полина','Гуля','Катя','Анжелика','Юнус','Настя','Вера','Лиза'];
    const NAMES_M = ['Игнат','Волков','Никита','Евгений','Даниил','Артём','Роман','Егор'];
    const CITIES = ['Москва','Санкт-Петербург','Казань','Екатеринбург','Новосибирск'];
    const ST = ['активен','активен','активен','новый','не прошел','ожидает в пвз','получен'];
    const accts = [];
    for (let i = 0; i < 14; i++) {
      const f = Math.random() > 0.45;
      const nm = f ? NAMES_F[i % NAMES_F.length] : NAMES_M[i % NAMES_M.length];
      accts.push({
        id: 'a' + i, name: nm, gender: f ? 'f' : 'm',
        phone: '+7 9' + (10 + i) + ' ' + (100 + i * 7) + '-' + (10 + i) + '-' + (20 + i),
        lastLogin: ['сейчас','2ч','вчера','5ч','3д'][i % 5],
        status: ST[i % ST.length],
        article: '' + (843071833 + i * 137), keyword: ['платье летнее','сарафан','джинсы','кроссовки','футболка'][i % 5],
        pvz: 'ул. Ленина, ' + (5 + i) + ', ПВЗ Wildberries', city: CITIES[i % CITIES.length]
      });
    }
    const products = [
      { id: 'p1', article: '843071833', keyword: 'платье летнее', available: 12, image: '' },
      { id: 'p2', article: '940664540', keyword: 'сарафан', available: 7, image: '' },
      { id: 'p3', article: '462435410', keyword: 'джинсы', available: 3, image: '' },
      { id: 'p4', article: '456467683', keyword: 'кроссовки', available: 21, image: '' },
    ];
    return {
      id: '__test__', name: 'Тестовый сервер', status: 'online', test: true,
      accounts: accts, products: products
    };
  },

  toggleTestServer() {
    this._testOn = !this._testOn;
    const btn = document.getElementById('wbDemoToggle');
    if (btn) btn.classList.toggle('demo-on', this._testOn);
    if (this._testOn) {
      this._servers.unshift(this._buildTest());
      this._renderServers();
      this.selectServer('__test__');
      if (window.Shell && Shell.toast) Shell.toast('Тестовый сервер добавлен');
    } else {
      this._servers = this._servers.filter(s => s.id !== '__test__');
      if (this._active === '__test__') this._active = this._servers[0] ? this._servers[0].id : null;
      this._renderServers();
      this._renderHeader();
      this._renderActive();
    }
    if (navigator.vibrate) navigator.vibrate(15);
  },

  addServer() {
    if (window.Shell && Shell.toast) Shell.toast('Управление серверами появится позже');
  },

  // ─── серверы ─────────────────────────────────────────────
  _renderServers() {
    const el = document.getElementById('wbServerList');
    if (!el) return;
    if (!this._servers.length) {
      el.innerHTML = '<div style="padding:20px 12px;text-align:center;color:var(--dim);font-size:12px;line-height:1.5">Нет серверов.<br>Нажми «Тестовый сервер» для дебага.</div>';
    } else {
      el.innerHTML = this._servers.map(s => `
        <div class="wb-srv ${s.id === this._active ? 'active' : ''} ${s.test ? 'test' : ''}" onclick="WB.selectServer('${s.id}')">
          <span class="wb-srv-dot ${s.status}"></span>
          <div class="wb-srv-body">
            <div class="wb-srv-name">${this._esc(s.name)}</div>
            <div class="wb-srv-sub">${s.accounts ? s.accounts.length : 0} аккаунтов</div>
          </div>
        </div>`).join('');
    }
    const online = this._servers.filter(s => s.status === 'online').length;
    const foot = document.getElementById('wbSideFoot');
    if (foot) foot.innerHTML = `<b>${online}</b> / ${this._servers.length} онлайн`;
  },

  selectServer(id) {
    this._active = id;
    this._sel = {};
    this._renderServers();
    this._renderHeader();
    this._renderActive();
    if (navigator.vibrate) navigator.vibrate(8);
  },

  _srv() { return this._servers.find(s => s.id === this._active); },

  _renderHeader() {
    const s = this._srv();
    const name = document.getElementById('wbHeadName');
    const st = document.getElementById('wbHeadStatus');
    const cnt = document.getElementById('wbHeadCount');
    if (!s) {
      name.textContent = 'Сервер не выбран';
      st.innerHTML = ''; cnt.innerHTML = '';
      return;
    }
    name.textContent = s.name;
    st.innerHTML = `<span class="wb-srv-dot ${s.status}"></span>${s.status === 'online' ? 'Online' : 'Offline'}`;
    cnt.innerHTML = `<b>${s.accounts.length}</b> аккаунтов`;
  },

  switchTab(tab) {
    this._tab = tab;
    document.querySelectorAll('#wbTabs .wb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('#wbWorkspace .wb-pane').forEach(p => p.classList.toggle('active', p.id === 'wbPane-' + tab));
    this._renderActive();
    if (navigator.vibrate) navigator.vibrate(6);
  },

  _renderActive() {
    const s = this._srv();
    const pane = document.getElementById('wbPane-' + this._tab);
    if (!pane) return;
    if (!s) { pane.innerHTML = this._emptyState('Выбери сервер', 'Слева выбери сервер или включи «Тестовый сервер» для просмотра интерфейса.'); return; }
    ({
      accounts: () => this._renderAccounts(pane, s),
      reg: () => this._renderReg(pane, s),
      warmup: () => this._renderWarmup(pane, s),
      purchases: () => this._renderPurchases(pane, s),
      pickup: () => this._renderPickup(pane, s),
      reviews: () => this._renderReviews(pane, s),
      stats: () => this._renderStats(pane, s),
    }[this._tab] || (() => {}))();
  },

  // ═══ 5.1 АККАУНТЫ ═══
  _renderAccounts(pane, s) {
    const selCount = Object.values(this._sel).filter(Boolean).length;
    const rows = s.accounts.map(a => `
      <div class="wb-row" style="min-width:880px">
        <span class="wb-chk ${this._sel[a.id] ? 'on' : ''}" onclick="WB._toggleSel('${a.id}')"></span>
        ${this._ava(a.gender)}
        <div class="wb-cell" style="width:180px">
          <div class="wb-acc-name">${this._esc(a.name)}</div>
          <div class="wb-acc-phone wb-mono">${this._esc(a.phone)}</div>
        </div>
        <div class="wb-cell wb-mono" style="width:60px;color:var(--muted);font-size:12px">${a.lastLogin}</div>
        <div class="wb-cell" style="width:120px">${this._badge(a.status)}</div>
        <div class="wb-cell wb-mono" style="width:150px;font-size:12px"><div>${a.article}</div><div style="color:var(--muted)">${this._esc(a.keyword)}</div></div>
        <div class="wb-cell" style="width:130px;color:var(--muted)" title="${this._esc(a.pvz)}">${this._esc(a.city)}</div>
        <span class="wb-spacer"></span>
        <button class="wb-btn sm" onclick="WB._toast()">Архив</button>
      </div>`).join('');
    pane.innerHTML = `
      <div class="wb-toolbar">
        <div class="wb-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input placeholder="Поиск по имени, телефону, артикулу…"></div>
        <span class="wb-chip">Статус <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span>
        <span class="wb-chip">Пол <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span>
      </div>
      ${selCount ? `<div class="wb-bulk">Выбрано: <b>${selCount}</b><span class="wb-spacer"></span><button class="wb-btn sm" onclick="WB._toast()">Архивировать</button><button class="wb-btn sm" onclick="WB._clearSel()">Снять выделение</button></div>` : ''}
      <div class="wb-card flush"><div class="wb-table-wrap">
        <div class="wb-thead" style="min-width:880px"><span class="wb-chk" style="border:none;background:none"></span><span style="width:30px"></span><span style="width:180px">Аккаунт</span><span style="width:60px">Вход</span><span style="width:120px">Статус</span><span style="width:150px">Артикул / ключ</span><span style="width:130px">Город</span><span class="wb-spacer"></span><span></span></div>
        ${rows}
      </div></div>`;
  },
  _toggleSel(id) { this._sel[id] = !this._sel[id]; this._renderActive(); },
  _clearSel() { this._sel = {}; this._renderActive(); },

  // ═══ 5.2 РЕГИСТРАТОР ═══
  _renderReg(pane, s) {
    const sub = this._regSub;
    let body = '';
    if (sub === 'pool') {
      const pool = s.accounts.slice(0, 6);
      body = `
        <div class="wb-hud">
          <div class="wb-cap"><span class="wb-cap-lbl">Автопланирование</span></div>
          <div class="wb-cap"><span class="wb-ava f" style="width:22px;height:22px;font-size:11px">Ж</span><input type="range" class="wb-slider" value="50"><span class="wb-ava m" style="width:22px;height:22px;font-size:11px">М</span></div>
          <div class="wb-cap"><span class="wb-cap-lbl">Кол-во</span><div class="wb-step"><button onclick="WB._toast()">−</button><span class="v wb-mono">10</span><button onclick="WB._toast()">+</button></div></div>
          <div class="wb-cap"><span class="wb-cap-lbl">В пуле</span><b class="wb-mono">${pool.length}</b></div>
          <span class="wb-spacer"></span>
          <button class="wb-btn primary" onclick="WB._toast()">Запланировать</button>
        </div>
        <div class="wb-card flush"><div class="wb-table-wrap">
          <div class="wb-thead" style="min-width:380px"><span style="width:16px"></span><span style="width:30px"></span><span style="width:150px">Телефон</span><span class="wb-spacer"></span><span>Статус</span></div>
          ${pool.map(a => `<div class="wb-row" style="min-width:380px"><span class="wb-chk"></span>${this._ava(a.gender)}<div class="wb-cell wb-mono" style="width:150px">${this._esc(a.phone)}</div><span class="wb-spacer"></span>${this._badge('готов к регистрации')}</div>`).join('')}
        </div></div>
        <div><button class="wb-btn" onclick="WB._toast()">Запланировать выбранные</button></div>`;
    } else if (sub === 'active') {
      const act = s.accounts.slice(0, 5);
      body = `
        <div class="wb-toolbar"><span class="wb-subtabs"><button class="wb-subtab active">Сегодня</button><button class="wb-subtab">Завтра</button></span></div>
        <div class="wb-card flush"><div class="wb-table-wrap">
          <div class="wb-thead" style="min-width:690px"><span style="width:30px"></span><span style="width:160px">Телефон</span><span style="width:120px">Статус</span><span style="width:70px">Время</span><span class="wb-spacer"></span><span></span></div>
          ${act.map((a, i) => {
            const err = i === 1;
            return `<div class="wb-row" style="min-width:690px">${this._ava(a.gender)}<div class="wb-cell wb-mono" style="width:160px">${this._esc(a.phone)}</div><div class="wb-cell" style="width:120px">${this._badge(err ? 'ошибка' : 'запланирован')}</div><div class="wb-cell wb-mono" style="width:70px">${['09:20','11:40','13:05','15:30','18:10'][i]}</div><span class="wb-spacer"></span>${err ? '<button class="wb-btn sm danger" onclick="WB._toast()">Повторить</button>' : ''}<button class="wb-btn sm" onclick="WB._toast()">Время</button></div>`;
          }).join('')}
        </div></div>`;
    } else {
      const arc = s.accounts.slice(0, 6);
      body = `<div class="wb-card flush"><div class="wb-table-wrap">
        <div class="wb-thead" style="min-width:600px"><span style="width:30px"></span><span style="width:160px">Телефон</span><span style="width:140px">Результат</span><span class="wb-spacer"></span><span>Дата</span></div>
        ${arc.map((a, i) => `<div class="wb-row" style="min-width:600px">${this._ava(a.gender)}<div class="wb-cell wb-mono" style="width:160px">${this._esc(a.phone)}</div><div class="wb-cell" style="width:140px">${this._badge(i % 3 === 2 ? 'не прошел' : 'прошел')}</div><span class="wb-spacer"></span><span class="wb-mono" style="color:var(--muted)">0${(i % 3) + 1}.09</span></div>`).join('')}
      </div></div>`;
    }
    pane.innerHTML = `
      <div class="wb-sec-h"><span class="wb-subtabs">
        <button class="wb-subtab ${sub === 'pool' ? 'active' : ''}" onclick="WB._regTab('pool')">Доступны</button>
        <button class="wb-subtab ${sub === 'active' ? 'active' : ''}" onclick="WB._regTab('active')">Активные</button>
        <button class="wb-subtab ${sub === 'archive' ? 'active' : ''}" onclick="WB._regTab('archive')">Архив</button>
      </span></div>${body}`;
  },
  _regTab(t) { this._regSub = t; this._renderActive(); },

  // ═══ 5.3 ПРОГРЕВ ═══
  _renderWarmup(pane, s) {
    const rows = s.accounts.slice(0, 8).map((a, i) => {
      const notStarted = i % 3 === 0;
      const prog = notStarted ? `<span class="wb-cell" style="width:200px;color:var(--muted);font-size:12px;display:flex;align-items:center;gap:6px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>по расписанию в <b class="wb-mono">14:30</b></span>`
        : `<div class="wb-cell" style="width:200px;display:flex;align-items:center;gap:8px"><div class="wb-prog" style="flex:1"><div style="width:${30 + i * 8}%"></div></div><span class="wb-mono" style="font-size:12px">${30 + i * 8}%</span></div>`;
      return `<div class="wb-row" style="min-width:780px">${this._ava(a.gender)}<div class="wb-cell" style="width:190px"><div class="wb-acc-name">${this._esc(a.name)}</div><div class="wb-acc-phone wb-mono">${this._esc(a.phone)}</div></div>${prog}<div class="wb-cell" style="width:110px">${this._badge(notStarted ? 'ожидает' : (i === 4 ? 'ошибка' : 'в работе'))}</div><span class="wb-spacer"></span><button class="wb-btn sm" onclick="WB._toast()">Снять на сегодня</button></div>`;
    }).join('');
    pane.innerHTML = `
      <div class="wb-card" style="display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>Прогрев планируется вне интерфейса и выполняется автоматически в течение дня. Здесь — только просмотр.</div>
      <div class="wb-card flush"><div class="wb-table-wrap">
        <div class="wb-thead" style="min-width:780px"><span style="width:30px"></span><span style="width:190px">Аккаунт</span><span style="width:200px">Прогресс</span><span style="width:110px">Статус</span><span class="wb-spacer"></span><span></span></div>
        ${rows}
      </div></div>`;
  },

  // ═══ 5.4 ПОКУПКИ ═══
  _renderPurchases(pane, s) {
    const days = [
      { d: '28', dow: 'чт', past: true }, { d: '30', dow: 'сб', past: true },
      { d: '02', dow: 'пн', active: true, month: 'сентябрь' }, { d: '03', dow: 'вт' }, { d: '05', dow: 'чт' }, { d: '08', dow: 'вс' }
    ];
    let strip = '';
    days.forEach(d => {
      if (d.month) strip += `<div class="wb-month-sep">${d.month}</div>`;
      strip += `<div class="wb-day ${d.past ? 'past' : ''} ${d.active ? 'active' : ''}" onclick="WB._toast()"><span class="wb-day-num">${d.d}</span><span class="wb-day-dow">${d.dow}</span></div>`;
    });
    const stageNames = ['Проверка аккаунта','Смотрю товары','Смотрю конкурентов','Добавляю товар','Выбираю ПВЗ','Ожидаю подтверждение оплаты','Проверяю оплату'];
    const cards = s.accounts.slice(0, 5).map((a, i) => {
      const planned = i >= 3;
      const noAcc = i === 2;
      const stage = 1 + (i % 6);
      const dots = stageNames.map((_, si) => `<span class="wb-stage-dot ${si < stage ? 'done' : ''} ${si === stage ? 'cur' : ''}"></span>`).join('');
      const tclass = i === 0 ? 'red' : (i === 1 ? 'yellow' : 'green');
      const payBar = (stage === 5 && !planned) ? `<div style="display:flex;gap:8px;margin-top:8px;align-items:center"><select class="wb-input" style="width:150px;padding:6px 10px"><option>Сбербанк</option><option>Т-Банк</option><option>Альфа-Банк</option><option>ВТБ</option></select><button class="wb-btn primary sm" onclick="WB._toast()">Оплатить</button></div>` : '';
      const errBar = i === 0 ? `<div style="display:flex;gap:8px;margin-top:8px;align-items:center"><span class="wb-badge red">Ошибка выполнения</span><button class="wb-btn sm danger" onclick="WB._toast()">Перезапуск</button></div>` : '';
      return `<div class="wb-card"><div class="wb-row" style="padding:0;border:none;min-width:860px">
        ${this._ava(a.gender)}
        <div class="wb-cell" style="width:150px">${noAcc ? '<span style="color:var(--red);font-weight:700">Нет аккаунта</span>' : `<div class="wb-acc-name">${this._esc(a.name)}</div><div class="wb-acc-phone wb-mono">${this._esc(a.phone)}</div>`}</div>
        <div class="wb-cell" style="width:210px">${this._prodChips(s.products, 1)}</div>
        <div class="wb-cell" style="flex:1;min-width:220px">${planned ? '<span style="color:var(--muted);font-size:12px">запуск <b class="wb-mono">10:00–14:00</b></span>' : `<div class="wb-stages">${dots}<span class="wb-stage-lbl">${stageNames[Math.min(stage, 6)]}</span></div>`}</div>
        <span class="wb-spacer"></span>
        ${planned ? '' : `<span class="wb-timer ${tclass}">${['08:12','24:40','41:05','—','—'][i] || '—'}</span>`}
      </div>${payBar}${errBar}</div>`;
    }).join('');
    pane.innerHTML = `
      <div class="wb-toolbar">
        <div class="wb-daystrip" style="flex:1">${strip}</div>
        <button class="wb-ico-btn" onclick="WB._toast()" title="Календарь"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
        <button class="wb-btn" onclick="WB._massBuyout()">Массовый залив</button>
        <button class="wb-btn wb" onclick="WB._singleBuyout()">Одиночный выкуп</button>
      </div>
      ${cards}`;
  },

  // ═══ 5.5 ПОЛУЧЕНИЕ ═══
  _renderPickup(pane, s) {
    const rows = s.accounts.slice(0, 7).map((a, i) => `
      <div class="wb-row" style="min-width:1050px">
        ${this._ava(a.gender)}
        <div class="wb-cell" style="width:170px"><div class="wb-acc-name">${this._esc(a.name)}</div><div class="wb-acc-phone wb-mono">${this._esc(a.phone)}</div></div>
        <div class="wb-cell" style="width:220px">${this._prodChips(s.products, 1)}</div>
        <div class="wb-cell" style="width:230px;color:var(--muted);font-size:12px" title="${this._esc(a.pvz)}">${this._esc(a.pvz)}</div>
        <div class="wb-cell" style="width:180px">${i % 2 ? '<span class="wb-badge blue">будет в ПВЗ 26 авг</span>' : '<span class="wb-badge yellow">ожидает до 30 авг</span>'}</div>
        <span class="wb-spacer"></span>
        <button class="wb-btn sm wb" onclick="WB._pickupCode()">Получить</button>
        <button class="wb-btn sm" onclick="WB._toast()">Найти ПВЗ</button>
      </div>`).join('');
    pane.innerHTML = `
      <div class="wb-toolbar">
        <span class="wb-chip">Город <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span>
        <span class="wb-spacer"></span>
        <button class="wb-btn" onclick="WB._toast()">Выгрузить получение</button>
      </div>
      <div class="wb-card flush"><div class="wb-table-wrap">
        <div class="wb-thead" style="min-width:1050px"><span style="width:30px"></span><span style="width:170px">Аккаунт</span><span style="width:220px">Товары</span><span style="width:230px">Адрес ПВЗ</span><span style="width:180px">Статус</span><span class="wb-spacer"></span><span></span></div>
        ${rows}
      </div></div>`;
  },

  // ═══ 5.6 ОТЗЫВЫ ═══
  _renderReviews(pane, s) {
    const sub = this._revSub;
    let body = '';
    if (sub === 'products') {
      if (this._revView === 'grid') {
        body = `<div class="wb-rev-grid">${s.products.concat(s.products).map((p, i) => `
          <div class="wb-rev-card" onclick="WB._composer()">
            <div class="wb-rev-top"><div class="wb-rev-art">${p.article}</div><div class="wb-rev-kw">${this._esc(p.keyword)}</div></div>
            <div class="wb-rev-bot"><div class="wb-rev-avail">Доступно: ${p.available}</div><div class="wb-rev-meta">план ${2 + i} · архив ${5 + i}</div></div>
          </div>`).join('')}</div>`;
      } else {
        body = `<div class="wb-card flush"><div class="wb-table-wrap">${s.products.map(p => `<div class="wb-row" style="min-width:500px"><div class="wb-prod-ph" style="width:36px;height:36px"></div><div class="wb-cell" style="width:140px"><div class="wb-mono" style="font-weight:700">${p.article}</div><div style="color:var(--muted);font-size:12px">${this._esc(p.keyword)}</div></div><span class="wb-spacer"></span><span class="wb-badge green">Доступно: ${p.available}</span><button class="wb-btn sm" onclick="WB._composer()">Отзыв</button></div>`).join('')}</div></div>`;
      }
    } else {
      const isPlan = sub === 'plan';
      const list = s.accounts.slice(0, 6);
      body = `<div class="wb-card flush"><div class="wb-table-wrap">
        <div class="wb-thead" style="min-width:850px"><span style="width:30px"></span><span style="width:170px">Аккаунт</span><span style="width:50px">Фото</span><span style="width:150px">Товар</span><span style="width:90px">Оценка</span><span style="width:110px">${isPlan ? 'План' : 'Дата'}</span><span class="wb-spacer"></span><span></span></div>
        ${list.map((a, i) => `<div class="wb-row" style="min-width:850px">${this._ava(a.gender)}<div class="wb-cell" style="width:170px"><div class="wb-acc-name">${this._esc(a.name)}</div><div class="wb-acc-phone wb-mono">${this._esc(a.phone)}</div></div><div class="wb-cell wb-prod-ph" style="width:34px;height:34px"></div><div class="wb-cell wb-mono" style="width:150px;font-size:12px">${s.products[i % s.products.length].article}</div><div class="wb-cell wb-stars" style="width:90px">${'★'.repeat(4 + (i % 2))}${'☆'.repeat(1 - (i % 2))}</div><div class="wb-cell wb-mono" style="width:110px;font-size:12px">0${(i % 5) + 1}.09 1${i}:00</div><span class="wb-spacer"></span>${isPlan ? '<button class="wb-btn sm danger" onclick="WB._toast()">Отменить</button>' : this._badge(i % 2 ? 'опубликован' : 'написан')}</div>`).join('')}
      </div></div>`;
    }
    pane.innerHTML = `
      <div class="wb-sec-h">
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
    const days = 14, W = 560, H = 120;
    const mk = (seed) => Array.from({ length: days }, (_, i) => 20 + Math.round(30 * Math.abs(Math.sin(i * 0.7 + seed)) + i));
    const series = [{ c: '#16a34a', d: mk(1) }, { c: '#2563eb', d: mk(2.4) }, { c: '#c98a04', d: mk(4) }];
    const max = Math.max(...series.flatMap(s2 => s2.d));
    const path = (arr) => arr.map((v, i) => `${(i / (days - 1) * W).toFixed(1)},${(H - v / max * H).toFixed(1)}`).join(' ');
    const chart = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:140px" preserveAspectRatio="none">${series.map(s2 => `<polyline points="${path(s2.d)}" fill="none" stroke="${s2.c}" stroke-width="2" stroke-linejoin="round"/>`).join('')}</svg>`;
    const srvBars = this._servers.length ? this._servers : [s];
    const barMax = Math.max(...srvBars.map(x => x.accounts.length), 1);
    pane.innerHTML = `
      <div class="wb-kpi-row">${kpis.map(k => `<div class="wb-kpi"><div class="wb-kpi-lbl">${k.l}</div><div class="wb-kpi-val">${k.v}</div><div class="wb-kpi-delta ${k.up ? 'up' : 'down'}">${k.d} за неделю</div></div>`).join('')}</div>
      <div class="wb-card">
        <div class="wb-sec-h"><h3>Активность за 14 дней</h3><span class="wb-spacer"></span>
          <span style="font-size:11px;color:var(--muted)"><span style="color:#16a34a">●</span> Покупки&nbsp; <span style="color:#2563eb">●</span> Отзывы&nbsp; <span style="color:#c98a04">●</span> Регистрации</span>
        </div>${chart}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="wb-card"><div class="wb-sec-h"><h3>По серверам</h3></div>${srvBars.map(x => `<div class="wb-bar-row"><span class="wb-bar-lbl">${this._esc(x.name)}</span><div class="wb-bar-track"><div style="width:${x.accounts.length / barMax * 100}%"></div></div><span class="wb-bar-val">${x.accounts.length}</span></div>`).join('')}</div>
        <div class="wb-card"><div class="wb-sec-h"><h3>По артикулам</h3></div>${s.products.map((p, i) => `<div class="wb-bar-row"><span class="wb-bar-lbl">${this._esc(p.keyword)}</span><div class="wb-bar-track"><div style="width:${90 - i * 18}%"></div></div><span class="wb-bar-val">${40 - i * 7}</span></div>`).join('')}</div>
      </div>`;
  },

  // ─── модалки-заглушки ────────────────────────────────────
  _singleBuyout() {
    this.openModal(`<div class="wb-modal-h"><h3>Одиночный выкуп</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      <div style="display:flex;gap:10px;margin-bottom:12px"><div class="wb-cap" style="flex:1"><span class="wb-ava f" style="width:22px;height:22px;font-size:11px">Ж</span><span class="wb-cap-lbl">Доступно</span><b>18</b></div><div class="wb-cap" style="flex:1"><span class="wb-ava m" style="width:22px;height:22px;font-size:11px">М</span><span class="wb-cap-lbl">Доступно</span><b>11</b></div></div>
      <div class="wb-field"><label>Товары (артикул + ключевое слово)</label><input class="wb-input" placeholder="843071833 · платье летнее"><div style="margin-top:6px"><button class="wb-btn sm" onclick="WB._toast()">+ Добавить товар</button></div></div>
      <div class="wb-field"><label>Пол</label><select class="wb-input"><option>Любой</option><option>Женский</option><option>Мужской</option></select></div>
      <div class="wb-field"><label>Адрес ПВЗ</label><input class="wb-input" placeholder="Город, улица…"></div>
      <div style="display:flex;gap:10px"><div class="wb-field" style="flex:1"><label>Дата</label><input class="wb-input" type="date"></div><div class="wb-field" style="flex:1"><label>С</label><input class="wb-input" type="time"></div><div class="wb-field" style="flex:1"><label>До</label><input class="wb-input" type="time"></div></div>
      <button class="wb-btn wb" style="width:100%" onclick="WB.closeModal()">Запустить выкуп</button>`);
  },
  _massBuyout() {
    this.openModal(`<div class="wb-modal-h"><h3>Массовый залив</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      <div style="border:2px dashed var(--line2);border-radius:11px;padding:30px;text-align:center;color:var(--muted);margin-bottom:12px">Перетащи Excel-файл сюда<br><span style="font-size:12px;color:var(--dim)">или нажми для выбора</span></div>
      <div style="display:flex;gap:10px"><div class="wb-field" style="flex:1"><label>Дата</label><input class="wb-input" type="date"></div><div class="wb-field" style="flex:1"><label>С</label><input class="wb-input" type="time"></div><div class="wb-field" style="flex:1"><label>До</label><input class="wb-input" type="time"></div></div>
      <p style="color:var(--dim);font-size:12px">После загрузки здесь появится таблица разобранных строк с полами, адресами и товарами.</p>`, 1080);
  },
  _pickupCode() {
    this.openModal(`<div class="wb-modal-h"><h3>Код получения</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      <div style="text-align:center;padding:10px"><div style="width:180px;height:180px;margin:0 auto 14px;background:repeating-linear-gradient(45deg,#1a1f2b,#1a1f2b 6px,#fff 6px,#fff 12px);border-radius:10px"></div><div class="wb-mono" style="font-size:28px;font-weight:800;letter-spacing:4px">4821</div><div style="color:var(--muted);font-size:12px;margin-top:6px">Назовите код на ПВЗ</div></div>`);
  },
  _composer() {
    this.openModal(`<div class="wb-modal-h"><h3>Новый отзыв</h3><button class="wb-modal-close" onclick="WB.closeModal()">×</button></div>
      <div class="wb-field"><label>Оценка</label><div class="wb-stars" style="font-size:24px">★★★★★</div></div>
      <div class="wb-field"><label>Пол аккаунта</label><select class="wb-input"><option>Любой</option><option>Женский</option><option>Мужской</option></select></div>
      <div style="display:flex;gap:10px"><div class="wb-field" style="flex:1"><label>Дата</label><input class="wb-input" type="date"></div><div class="wb-field" style="flex:1"><label>Время</label><input class="wb-input" type="time"></div></div>
      <div class="wb-field"><label>Плюсы</label><input class="wb-input"></div>
      <div class="wb-field"><label>Минусы</label><input class="wb-input"></div>
      <div class="wb-field"><label>Комментарий</label><textarea class="wb-input" rows="3"></textarea></div>
      <div class="wb-field"><label>Фото / видео</label><div style="display:flex;gap:8px"><div class="wb-prod-ph" style="width:48px;height:48px"></div><button class="wb-btn" style="width:48px;height:48px;padding:0;font-size:20px" onclick="WB._toast()">+</button></div></div>
      <button class="wb-btn primary" style="width:100%" onclick="WB.closeModal()">Сохранить в план</button>`);
  },

  openModal(html, width) {
    const box = document.getElementById('wbModalBox');
    box.style.width = (width || 560) + 'px';
    box.innerHTML = html;
    document.getElementById('wbModal').classList.add('open');
  },
  closeModal() { document.getElementById('wbModal').classList.remove('open'); },

  // ─── helpers ─────────────────────────────────────────────
  _ava(g) { return `<div class="wb-ava ${g}">${g === 'f' ? 'Ж' : 'М'}</div>`; },
  _badge(status) {
    const map = {
      'активен': 'green', 'прошел': 'green', 'получен': 'blue', 'опубликован': 'green',
      'не прошел': 'red', 'ошибка': 'red', 'новый': 'gray', 'написан': 'gray',
      'ожидает в пвз': 'yellow', 'ожидает': 'yellow', 'в работе': 'blue',
      'готов к регистрации': 'gray', 'запланирован': 'blue'
    };
    return `<span class="wb-badge ${map[status] || 'gray'}">${this._esc(status)}</span>`;
  },
  _prodChips(products, showN) {
    if (!products || !products.length) return '';
    const first = products.slice(0, showN);
    const more = products.length - first.length;
    let h = first.map(p => `<span class="wb-prod"><span class="wb-prod-ph"></span><span class="wb-mono">${p.article}</span></span>`).join(' ');
    if (more > 0) h += ` <span class="wb-prod-more" title="${products.slice(showN).map(p => p.article + ' · ' + p.keyword).join('\n')}">+${more}</span>`;
    return h;
  },
  _emptyState(title, sub) {
    return `<div class="wb-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg><div class="wb-empty-title">${title}</div><div>${sub}</div></div>`;
  },
  _toast() { if (window.Shell && Shell.toast) Shell.toast('Серверная логика будет реализована позже'); if (navigator.vibrate) navigator.vibrate(10); },

  _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  onWS(data) { /* серверная синхронизация — следующий этап */ },
};

window.WB = WB;
WB.init();
