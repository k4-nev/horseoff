const Shell = {
  /* ─── Мост к React-каркасу ───────────────────────────────────────────
     Состояние интерфейса живёт здесь, в ядре, а React на него подписан.
     Порядок загрузки скриптов неважен: подписчик получает текущее
     состояние сразу при подписке, а до его появления вызовы просто
     копятся в _uiState. */
  _uiState: {
    /* Каркас */
    booting: true, authed: false, theme: 'light',
    modules: [], active: null, unread: 0, valentine: 0, avatar: null, user: null, immersive: false,
    /* Экран входа */
    setup: false, authError: '', authBusy: false,
    /* Модалка профиля: profile !== null — открыта */
    profile: null, sessions: null, pinEnabled: false,
    /* PIN: {mode:'unlock'|'set', title, len, error} */
    pin: null,
    /* Очередь уведомлений у кнопки «Приложения»: один список на всё —
       подтверждения, события с действием и новые сообщения. */
    notes: [], pushBanner: false, version: '', build: '',
  },
  _uiSubs: [],
  _uiEmit(patch) {
    this._uiState = Object.assign({}, this._uiState, patch);
    var s = this._uiState;
    this._uiSubs.forEach(function (fn) { try { fn(s); } catch (e) {} });
  },
  /* Модуль сообщает, что ушёл в «погружение» — открыл чат или канал, где
     низ экрана занят полем ввода. На телефоне кнопка «Приложения» на это
     время убирается, чтобы не лезть под палец. Раньше ровно эту роль играло
     прятание нижней панели через document.querySelector('.sidebar'). */
  /* Единственное место, где номер версии попадает в разметку модулей.
     Модуль объявляет пустой <span class="app-version">, а ядро его
     заполняет — и при загрузке версии, и при загрузке самого модуля.
     Без второго вызова модули, открытые позже входа, оставались с тем,
     что зашито у них в разметке. */
  _stampVersion() {
    if (!this.appVersion || this.appVersion === '?') return;
    var v = 'v' + this.appVersion;
    document.querySelectorAll('.app-version').forEach(function (el) { el.textContent = v; });
  },

  setImmersive(on) {
    if (this._uiState.immersive === !!on) return;
    this._uiEmit({ immersive: !!on });
  },
  subscribeUI(fn) {
    this._uiSubs.push(fn);
    fn(this._uiState);
    var subs = this._uiSubs;
    return function () { var i = subs.indexOf(fn); if (i !== -1) subs.splice(i, 1); };
  },
  /* React монтируется асинхронно, а switchModule может быть вызван сразу
     после showApp — ждём появления контейнера, а не падаем на null. */
  _waitContent() {
    return new Promise(function (resolve) {
      var tries = 0;
      (function step() {
        var el = document.getElementById('moduleContent');
        if (el || tries++ > 120) return resolve(el);
        requestAnimationFrame(step);
      })();
    });
  },

  token: null,
  user: null,
  locale: {},
  modules: [],
  activeModule: null,
  appVersion: '?',
  appBuild: '',

  ws: null,
  wsReady: false,
  wsPort: null,
  unreadTotal: 0,
  contactsCache: {},
  activeChat: null,

  connectWS() {
    if (!this.token) return;
    // Guard against overlapping connects: iOS can fire close/open in quick
    // succession while backgrounding/foregrounding, and stacking sockets
    // just adds to the reconnect storm instead of fixing it.
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = proto + '//' + window.location.host + '/ws';
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({type:'auth',token:this.token,hidden:this._isWindowHidden()}));
      };
      this.ws.onmessage = (e) => {
        try { this.onWSData(JSON.parse(e.data)); } catch (ex) {}
      };

      this.ws.onclose = () => {
        this.wsReady = false;
        if (!this.token) return; // logout() during this connection — nothing to retry
        // Exponential backoff capped at 30s: fast first retry (network blips,
        // iOS backgrounding), but a genuinely down server or a still-stuck
        // client no longer gets hammered every 1-3s forever.
        this._wsRetries = (this._wsRetries || 0) + 1;
        var delay = Math.min(1000 * Math.pow(2, this._wsRetries - 1), 30000);
        setTimeout(() => this.connectWS(), delay);
      };
      this.ws.onerror = () => {};
    } catch(ex) {}
  },

  cacheContact(userId, avatar) {
    this.contactsCache[userId] = avatar;
  },

  /* Разбор входящего вынесен из onmessage отдельным методом: так его
     можно позвать без сокета — и в проверках, и когда сообщение
     приходит не из сети. */
  onWSData(data) {
      if (data.type === 'auth_ok') {
        this.wsReady = true;
        this._wsRetries = 0;
      }
      else if (data.type === 'error') {
        if (data.msg === 'Unauthorized') {
          // The token is genuinely dead (expired/revoked/evicted storage),
          // not a transient network hiccup — retrying it forever is what
          // hammered the per-IP login limiter and took the whole IP down
          // for every other user behind it (2026-08-24 iOS incident).
          // Same recovery path as an HTTP 401: drop it, show login.
          this._wsRetries = 0;
          this.logout();
        }
        // Other WS-level errors (e.g. rate-limited) just let the normal
        // onclose backoff below retry — nothing else to do here.
        return;
      }
      else if (data.type === 'message') this.onWSMessage(data);
      else if (data.type === 'typing') this.onWSTyping(data);
      else if (data.type === 'read') this.onWSRead(data);
      else if (data.type === 'muted_list') { this._mutedContacts = data.muted || []; }
      else if (data.type === 'servers_update') {
        if (window.Servers && Servers.onServersUpdate) Servers.onServersUpdate(data.data);
      }
      else if (data.type === 'settings') {
        if (window.Servers && Servers.onSettingsUpdate) Servers.onSettingsUpdate(data.data);
      }
      else if (data.type === 'modules_update') {
        this.onModulesUpdate(data.modules || []);
      }
      else if (data.type === 'server_down' || data.type === 'server_up') {
        /* Падение сервера видно и из другого модуля: карточка приходит
           всем, у кого есть доступ к разделу, а не только тем, кто
           сейчас в нём сидит. */
        var down = data.type === 'server_down';
        this.notify({
          id: 'srv-' + data.ip,
          kind: down ? 'error' : 'ok',
          text: down ? 'Сервер не отвечает' : 'Сервер снова на связи',
          sub: data.name || data.ip,
          persistent: down,
          action: { label: 'Открыть', fn: function () { window.Shell.switchModule('servers'); } },
        });
        if (down) this.playNotifySound();
      }
      // Forward everything to messenger
      if (window.Messenger && Messenger.onWS) Messenger.onWS(data);
      // Forward to channels
      if (window.Channels && Channels.onWS) Channels.onWS(data);
      // Forward to valentine
      if (window.Valentine && Valentine.onWS) Valentine.onWS(data);
      // Forward to bots
      if (window.Bots && Bots.onWS) Bots.onWS(data);
      if (window.MP && MP.onWS) MP.onWS(data);
      // Valentine badge (when module not active)
      if (data.type === 'valentine' && this.activeModule !== 'valentine') {
        this._uiEmit({ valentine: (this._uiState.valentine || 0) + 1 });
      }
  },

  onWSMessage(data) {
    if (this.activeModule !== 'messenger' || this.activeChat !== data.chat) {
      // Check if contact is muted
      var fromId = data.msg ? data.msg.from : '';
      var muted = this._mutedContacts || [];
      if (muted.indexOf(fromId) !== -1) return;
      this.unreadTotal++;
      this.updateMsgBadge();
      this.showNotification(data.msg);
      this.playNotifySound();
    }
  },

  playNotifySound() {
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
  },

  // Unlock AudioContext on first user interaction (iOS/Safari requirement)
  _initAudio() {
    if (this._audioReady) return;
    this._audioReady = true;
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Play silent buffer to unlock
      var buf = this._audioCtx.createBuffer(1, 1, 22050);
      var src = this._audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(this._audioCtx.destination);
      src.start(0);
    } catch(e) {}
  },

  onWSTyping(data) {},
  onWSRead(data) {},

  showNotification(msg) {
    var self = this;
    this._push({
      kind: 'msg',
      title: String(msg.from_name == null ? '' : msg.from_name),
      text: String(msg.text == null ? '' : msg.text).slice(0, 90),
      avatar: this.contactsCache[msg.from] || null,
      ttl: 6000,
      fn: function () { self.goToChat(msg.from); },
    });
  },


  goToChat(userId) {
    var self = this;
    this._uiState.notes.forEach(function (n) { if (n.kind === 'msg') self.dismissNote(n.id); });
    this.switchModule('messenger');
    setTimeout(() => { if (window.Messenger) Messenger.openChat(userId); }, 200);
  },

  updateMsgBadge() {
    this._uiEmit({ unread: this.unreadTotal });
  },

  _isWindowHidden() {
    // "away" when the tab is hidden (mobile minimized) OR the window lost focus (another window on top)
    try { return document.hidden === true || document.hasFocus() === false; }
    catch(e) { return false; }
  },

  initPresence() {
    if (this._presenceInit) return;
    this._presenceInit = true;
    this._presenceHidden = this._isWindowHidden();
    var self = this;
    var update = function() {
      var hidden = self._isWindowHidden();
      if (hidden === self._presenceHidden) return;
      self._presenceHidden = hidden;
      self.wsSend({type:'presence', hidden: hidden});
    };
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    window.addEventListener('pageshow', update);
  },

  wsSend(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsReady) {
      this.ws.send(JSON.stringify(data));
    }
  },

  setTheme(theme) {
    /* Тёмная тема не доделана и лежит под общим правилом: незаконченное
       доступно только владельцу. Проверка здесь, а не только в кнопке, —
       иначе тема включалась бы из консоли и из старого localStorage. */
    if (theme !== 'light' && !this.canPreview()) theme = 'light';
    document.body.classList.toggle('theme-light', theme === 'light');
    document.body.classList.toggle('theme-dark', theme !== 'light');
    localStorage.setItem('ho_theme', theme);
    var meta = document.getElementById('metaThemeColor');
    if (meta) meta.content = theme === 'light' ? '#f2f0ec' : '#0a0a0f';
    this._uiEmit({ theme: theme });
  },

  /* Доступно ли недоделанное. Роль берём живую — из состояния входа. */
  canPreview() {
    var caps = (this._uiState && this._uiState.caps) || null;
    if (caps) return caps.indexOf('dev.preview') !== -1;
    return (this.user && this.user.role) === 'arcana';
  },

  _loadTheme() {
    var theme = localStorage.getItem('ho_theme') || 'light';
    this.setTheme(theme);
  },

  _getDeviceId() {
    let did = localStorage.getItem('ho_device_id');
    if (!did) {
      did = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2)+Date.now().toString(36);
      localStorage.setItem('ho_device_id', did);
    }
    return did;
  },

  async init() {
    this._loadTheme();
    await this.loadLocale();
    const token = localStorage.getItem('ho_token');
    if (token) {
      this.token = token;
      const ok = await this.verifyToken();
      if (ok) {
        const pin = localStorage.getItem('ho_pin');
        if (pin) { this._uiEmit({ booting: false }); this._showPinScreen(); return; }
        this._uiEmit({ booting: false });
        this.showApp(); return;
      }
      localStorage.removeItem('ho_token');
      this.token = null;
    }
    const r = await this.api('/api/auth/status');
    /* booting снимаем только здесь: пока не знаем, первый это запуск или
       обычный вход, экран входа показывать нечем — форма разная. */
    this._uiEmit({ booting: false, setup: !!(r && r.setup_required) });
    var v0 = await this.api('/api/version');
    if (v0 && v0.build) this.appBuild = v0.build;
    if (v0 && v0.version) { this.appVersion = v0.version; this._uiEmit({ version: v0.version }); }
  },

  async loadLocale() {
    try {
      const r = await fetch('/locale/ru.json');
      this.locale = await r.json();
    } catch(e) { console.error('Locale load failed', e); }
  },

  t(key) { return this.locale[key] || key; },

  headers() { return this.token ? {'Authorization':'Bearer '+this.token,'Content-Type':'application/json'} : {'Content-Type':'application/json'}; },

  async api(url, opts) {
    try {
      const r = await fetch(url, {headers: this.headers(), ...opts});
      if (r.status === 401 && this.token) { this.logout(); return null; }
      return await r.json();
    } catch(e) { return null; }
  },

  async verifyToken() {
    var d = await this.api('/api/auth/status');
    if (d && d.username) {
      this.user = {username: d.username, role: d.role};
      // Also get full profile with id
      var p = await this.api('/api/profile');
      if (p) this.user = {username: p.username, role: p.role, id: p.id};
      return true;
    }
    return false;
  },

  /* Логин и пароль приходят из формы на React — ядро их больше не читает
     из DOM. Ошибку и «занятость» кнопки отдаём в состояние. */
  async handleAuth(u, p) {
    u = (u || '').trim();
    if (!u || !p) { this._uiEmit({ authError: this.t('fill_fields') }); return; }
    this._uiEmit({ authError: '', authBusy: true });
    const d = await this.api('/api/auth/login', {method:'POST', body:JSON.stringify({username:u,password:p,device_id:this._getDeviceId(),user_agent:navigator.userAgent,platform:navigator.platform||''})});
    this._uiEmit({ authBusy: false });
    if (d && d.token) { this.token = d.token; localStorage.setItem('ho_token', this.token); await this.verifyToken(); this.showApp(); }
    else { this._uiEmit({ authError: (d && d.error) || this.t('auth_error') }); }
  },

  async handleSetup(u, p, p2) {
    u = (u || '').trim();
    if (!u || !p) { this._uiEmit({ authError: this.t('fill_fields') }); return; }
    if (p !== p2) { this._uiEmit({ authError: this.t('passwords_mismatch') }); return; }
    if (p.length < 6) { this._uiEmit({ authError: this.t('pass_min') }); return; }
    this._uiEmit({ authError: '', authBusy: true });
    const d = await this.api('/api/auth/setup', {method:'POST', body:JSON.stringify({username:u,password:p,device_id:this._getDeviceId(),user_agent:navigator.userAgent,platform:navigator.platform||''})});
    this._uiEmit({ authBusy: false });
    if (d && d.token) { this.token = d.token; localStorage.setItem('ho_token', this.token); await this.verifyToken(); this.showApp(); }
    else { this._uiEmit({ authError: (d && d.error) || this.t('auth_error') }); }
  },

  async showApp() {
    this._uiEmit({
      booting: false, authed: true, pin: null, authError: '', user: this.user,
      // Замок в кольце показываем только тем, у кого PIN вообще задан
      pinEnabled: !!localStorage.getItem('ho_pin'),
    });
    await this.loadModules();
    // Load version
    var v = await this.api('/api/version');
    if (v && v.build) this.appBuild = v.build;
    if (v && v.version) {
      this.appVersion = v.version;
      this._uiEmit({ version: v.version });
      this._stampVersion();
    }
    // Only switch to messenger if modules loaded
    if (this.modules.length > 0) {
      var defaultMod = this.modules.find(m => m.id === 'messenger') ? 'messenger' : this.modules[0].id;
      await this.switchModule(defaultMod);
    }
    this.updateSidebarAvatar();
    // Connect WebSocket
    this.connectWS();
    // Presence (away when window minimized / unfocused)
    this.initPresence();
    // Push notifications
    this.initPush();
    this.lockOrientation();
    // Auto-reload when SW updates (fixes stale cache access issues)
    this._initSwUpdateCheck();
  },

  _initSwUpdateCheck() {
    var self = this;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', function() {
        self._showUpdateBanner();
      });
    }
    // Lightweight server-version check — the primary trigger.
    self._checkVersion = async function() {
      if (self._checkingVersion) return;
      self._checkingVersion = true;
      try {
        var v = await self.api('/api/version');
        /* Сравниваем сборку, а не номер версии: version.json правится
           руками и на деплое его забывают, а build сервер считает сам по
           файлам — он меняется от любой выкладки. */
        if (v && v.build && self.appBuild && v.build !== self.appBuild) {
          self.appBuild = v.build;
          if (v.version) { self.appVersion = v.version; self._uiEmit({ version: v.version }); }
          self._showUpdateBanner();
        }
      } catch (e) {}
      self._checkingVersion = false;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(function(reg) { if (reg) reg.update(); });
      }
    };
    // Мгновенно при возврате в приложение (открыл вкладку/свернул-развернул PWA)
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') self._checkVersion();
    });
    window.addEventListener('focus', function() { self._checkVersion(); });
    // Фоновая подстраховка каждую минуту, пока приложение открыто
    setInterval(self._checkVersion, 60 * 1000);
    self._checkVersion();
  },

  _showUpdateBanner() {
    /* Карточка висит до нажатия: закрыть обновление нельзя. Версию пишем
       прямо в ней — иначе непонятно, на что именно обновляешься. */
    this.notify({
      id: 'app-update',
      kind: 'update',
      persistent: true,
      text: 'Доступно обновление',
      sub: 'Версия ' + this.appVersion,
      action: { label: 'Обновить', fn: function () { window.location.reload(); } },
    });
  },

  /* Событие, на которое можно нажать. Имя оставлено прежним — его зовут
     модули (mp.js), и оно же несёт обновление приложения. */
  notify(opts) {
    opts = opts || {};
    return this._push({
      id: opts.id,
      kind: opts.kind || 'info',
      title: String(opts.text == null ? '' : opts.text),
      text: opts.sub ? String(opts.sub) : '',
      label: opts.action ? String(opts.action.label || '') : '',
      fn: opts.action && opts.action.fn,
      persistent: !!opts.persistent,
      ttl: opts.duration || 5000,
    });
  },
  /* Старые имена: на них ещё могут ссылаться модули. */
  dismissCloud(id) { this.dismissNote(id); },

  lockOrientation() {
    // Only lock on phones (< 768px), not tablets
    if (window.innerWidth >= 768) return;
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('portrait').catch(function(){});
    }
  },

  async initPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (!isStandalone) return;
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    try {
      var reg = await navigator.serviceWorker.ready;
      var existing = await reg.pushManager.getSubscription();
      if (existing) {
        // Подписка привязана к ключу сервера. Если ключ сменился (переезд,
        // перегенерация), старая подписка остаётся живой на вид, но сервер
        // ею отправить уже не может — и уведомления тихо пропадают, потому
        // что подписка «есть» и мы её не обновляем. Сверяем и пересоздаём.
        var srvKey = await this.api('/api/push/key');
        if (srvKey && srvKey.key && !this._subKeyMatches(existing, srvKey.key)) {
          try { await existing.unsubscribe(); } catch(e) {}
        } else {
          await this.api('/api/push/subscribe', {method:'POST', body:JSON.stringify({subscription: existing.toJSON()})});
          return;
        }
      }
      if (isIOS) {
        // iOS requires user gesture — show button
        this._showPushBanner();
        return;
      }
      // Android/desktop — auto request
      var result = await Notification.requestPermission();
      if (result !== 'granted') return;
      await this._subscribePush(reg);
    } catch(e) { console.log('Push init:', e); }
  },

  /** Тот ли ключ сервера, на который выписана подписка. */
  _subKeyMatches(sub, key) {
    try {
      var raw = sub.options && sub.options.applicationServerKey;
      if (!raw) return true;   // сравнить нечем — не трогаем рабочую подписку
      var bytes = new Uint8Array(raw), str = '';
      for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
      var mine = btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return mine === String(key).replace(/=+$/, '');
    } catch (e) { return true; }
  },

  _showPushBanner() { this._uiEmit({ pushBanner: true }); },
  dismissPushBanner() { this._uiEmit({ pushBanner: false }); },

  async enablePush() {
    this._uiEmit({ pushBanner: false });
    try {
      var result = await Notification.requestPermission();
      if (result !== 'granted') { this.toast('Уведомления отклонены', 'error'); return; }
      var reg = await navigator.serviceWorker.ready;
      await this._subscribePush(reg);
      this.toast('Уведомления включены');
    } catch(e) { this.toast('Ошибка: ' + e.message, 'error'); }
  },

  async _subscribePush(reg) {
    var keyData = await this.api('/api/push/key');
    if (!keyData || !keyData.available || !keyData.key) return;
    var key = keyData.key;
    var raw = Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')), function(c){return c.charCodeAt(0)});
    var sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: raw});
    await this.api('/api/push/subscribe', {method:'POST', body:JSON.stringify({subscription: sub.toJSON()})});
  },

  logout() {
    if (this.token) this.api('/api/auth/logout', {method:'POST'}).catch(function(){});
    localStorage.removeItem('ho_token');
    this.token = null; this.user = null;
    this.activeModule = null;
    this.modules = [];
    // Clear cached modules completely
    this.loadedModules = {};
    // Close WebSocket
    if (this.ws) { try { this.ws.close(); } catch(e){} this.ws = null; }
    this.wsReady = false;
    if (this._contactsInterval) { clearInterval(this._contactsInterval); this._contactsInterval = null; }
    // Reset UI
    document.querySelectorAll('.modal-overlay.active').forEach(function(m){ m.classList.remove('active'); });
    var mc = document.getElementById('moduleContent');
    if (mc) mc.innerHTML = '';
    this._uiEmit({
      authed: false, modules: [], active: null, unread: 0, valentine: 0,
      avatar: null, user: null, immersive: false,
      profile: null, sessions: null, pin: null, notes: [],
      authError: '', authBusy: false,
    });
  },

  async loadModules() {
    const mods = await this.api('/api/modules');
    if (!mods) return;
    this.modules = mods;
    /* Раньше модуль «Пользователи» (min_role: arcana) выкидывался из списка
       и вставлялся отдельной кнопкой над профилем. В кольце отдельного места
       нет — он такой же шар, как остальные, и виден только тому, кому выдан
       сервером. Никакой клиентской фильтрации по роли больше не нужно. */
    this._uiEmit({ modules: mods.map(function (m) { return { id: m.id, name: m.name, icon: m.icon }; }) });
  },

  loadedModules: {},

  /** Объект модуля, который тот кладёт в window (Messenger, Bots, Channels…). */
  _moduleApi(id) {
    var name = id.charAt(0).toUpperCase() + id.slice(1);
    return window[name] || null;
  },

  async switchModule(id) {
    /* Модуль может попросить слово перед уходом — «Боты» так спрашивают,
       сохранять ли раскладку. Метод существовал и раньше, но его никто не
       звал: правки молча терялись при переключении. */
    if (this.activeModule && this.activeModule !== id) {
      var prev = this._moduleApi(this.activeModule);
      if (prev && typeof prev.onDeactivate === 'function') {
        try { prev.onDeactivate(); } catch (e) {}
      }
    }
    this.activeModule = id;
    /* Симметрично onDeactivate: модуль узнаёт, что его открыли. «Серверы»
       по этому сигналу подписываются на метрики — без подписки сервер их
       никому не шлёт. */
    var cur = this._moduleApi(id);
    if (cur && typeof cur.onActivate === 'function') {
      try { cur.onActivate(); } catch (e) {}
    }
    if (id === 'messenger') { this.unreadTotal = 0; this.updateMsgBadge(); }
    if (id === 'valentine') this._uiEmit({ valentine: 0 });
    this._uiEmit({ active: id, immersive: false });
    const mod = this.modules.find(m => m.id === id);
    if (!mod) return;
    const content = await this._waitContent();
    if (!content) return;

    // If already loaded, just show the cached container
    if (this.loadedModules[id]) {
      // Hide all module containers
      content.querySelectorAll('.module-container').forEach(c => c.style.display = 'none');
      this.loadedModules[id].style.display = 'block';
      return;
    }

    // First time — load and create container
    try {
      const [html, css, js] = await Promise.all([
        fetch('/modules/'+id+'/'+mod.entry).then(r=>r.text()),
        fetch('/modules/'+id+'/'+id+'.css').then(r=>r.text()).catch(()=>''),
        fetch('/modules/'+id+'/'+id+'.js').then(r=>r.text()).catch(()=>'')
      ]);
      // Hide other module containers
      content.querySelectorAll('.module-container').forEach(c => c.style.display = 'none');
      // Remove initial loading if present
      var loader = content.querySelector('.loading');
      if (loader) loader.remove();
      // Create container for this module
      var container = document.createElement('div');
      container.className = 'module-container';
      container.dataset.moduleId = id;
      container.innerHTML = '<style>'+css+'</style>' + html;
      content.appendChild(container);
      if (js) { var s = document.createElement('script'); s.textContent = js; container.appendChild(s); }
      this.loadedModules[id] = container;
      /* Модуль подгружается позже входа, поэтому его .app-version надо
         заполнить здесь — иначе останется то, что зашито в разметке. */
      this._stampVersion();
    } catch(e) { content.innerHTML = '<div class="loading">Ошибка загрузки модуля</div>'; }
  },

  // ── Профиль ───────────────────────────────────────────────
  /* Модалку рисует React: ядро отдаёт ей данные профиля и список сессий.
     Вкладки — состояние компонента, ядру о них знать незачем. */
  async openProfile() {
    var d = await this.api('/api/profile');
    if (!d) return;
    this._uiEmit({ profile: d, sessions: null, pinEnabled: !!localStorage.getItem('ho_pin') });
    this._loadSessionsTab();
  },

  closeProfile() { this._uiEmit({ profile: null }); },

  // ── PIN CODE ──────────────────────────────────────────────
  /* Клавиатуру и точки рисует React. Ядро держит введённое, считает
     попытки и решает, что делать дальше. Два режима:
       unlock — вход по PIN при старте,
       set    — ввод нового PIN (два прохода) из настроек. */
  _showPinScreen() {
    this._pinEntered = '';
    this._pinAttempts = 0;
    this._uiEmit({ pin: { mode: 'unlock', title: 'Введите PIN-код', len: 0, error: '' } });
  },

  /* Запереть уже запущенное приложение. Экран PIN накрывает его целиком
     (position:fixed поверх всего, непрозрачный фон), а само приложение под
     ним продолжает жить: сокет не рвётся, модули не перезагружаются. Поэтому
     разблокировка здесь только снимает экран — гонять showApp заново значило
     бы открыть второй сокет и заново собрать все модули. */
  lock() {
    if (!localStorage.getItem('ho_pin')) {
      this.toast('Сначала задайте PIN-код в профиле', 'error');
      return;
    }
    this._pinLocked = true;
    this._showPinScreen();
  },

  _pinKey(key) {
    var st = this._uiState.pin;
    if (!st || key === '') return;
    try { navigator.vibrate && navigator.vibrate(key === '\u232b' ? 30 : 20); } catch (e) {}
    if (key === '\u232b') this._pinEntered = (this._pinEntered || '').slice(0, -1);
    else this._pinEntered = (this._pinEntered || '') + key;

    var len = this._pinEntered.length;
    if (len < 4) { this._uiEmit({ pin: Object.assign({}, st, { len: len }) }); return; }

    if (st.mode === 'set') {
      var val = this._pinEntered;
      this._pinEntered = '';
      var resolve = this._pinResolve;
      this._pinResolve = null;
      this._uiEmit({ pin: null });
      if (resolve) resolve(val);
      return;
    }

    if (this._pinEntered === localStorage.getItem('ho_pin')) {
      this._pinEntered = '';
      var wasLocked = this._pinLocked;
      this._pinLocked = false;
      this._uiEmit({ pin: null });
      // Приложение всё это время работало под экраном — поднимать его заново незачем
      if (!wasLocked) this.showApp();
      return;
    }
    this._pinAttempts = (this._pinAttempts || 0) + 1;
    this._pinEntered = '';
    if (this._pinAttempts >= 3) {
      localStorage.removeItem('ho_pin');
      this._uiEmit({ pin: null });
      this.logout();
      return;
    }
    var left = 3 - this._pinAttempts;
    this._uiEmit({ pin: Object.assign({}, st, {
      len: 0,
      error: 'Неверный PIN (' + left + (left === 1 ? ' попытка' : ' попытки') + ' осталось)',
    }) });
  },

  _pinCancel() {
    var resolve = this._pinResolve;
    this._pinResolve = null;
    this._pinEntered = '';
    this._uiEmit({ pin: null });
    if (resolve) resolve(null);
  },

  async _setPinFlow() {
    var first = await this._pinDialog('Введите новый PIN');
    if (!first) return;
    var second = await this._pinDialog('Повторите PIN');
    if (!second) return;
    if (first !== second) { this.toast('PIN-коды не совпадают', 'error'); return; }
    localStorage.setItem('ho_pin', first);
    // Mark session as pin-enabled on server
    var hint = this.token ? this.token.slice(-6) : '';
    await this.api('/api/auth/set_pin_flag', {method:'POST', body:JSON.stringify({token_hint: hint, pin_enabled: true})});
    this.toast('PIN-код установлен');
    this._uiEmit({ pinEnabled: true });
    this._loadSessionsTab();
  },

  _pinDialog(title) {
    var self = this;
    return new Promise(function (resolve) {
      self._pinEntered = '';
      self._pinResolve = resolve;
      self._uiEmit({ pin: { mode: 'set', title: title, len: 0, error: '' } });
    });
  },

  async _disablePin() {
    localStorage.removeItem('ho_pin');
    var hint = this.token ? this.token.slice(-6) : '';
    await this.api('/api/auth/set_pin_flag', {method:'POST', body:JSON.stringify({token_hint: hint, pin_enabled: false})});
    this.toast('PIN-код отключён');
    this._uiEmit({ pinEnabled: false });
    this._loadSessionsTab();
  },

  // ── SESSIONS ──────────────────────────────────────────────
  /* Список отдаём как есть — разметку строит React. Раньше здесь была
     склейка HTML, куда hint сессии подставлялся прямо в onclick. */
  async _loadSessionsTab() {
    if (!this._uiState.profile) return;
    var sessions = await this.api('/api/auth/sessions');
    /* Сервер на ошибке отвечает объектом, а не списком — в разметку такое
       уходить не должно. */
    this._uiEmit({
      sessions: Array.isArray(sessions) ? sessions : [],
      pinEnabled: !!localStorage.getItem('ho_pin'),
    });
  },

  async _revokeSession(hint) {
    await this.api('/api/auth/revoke_session', {method:'POST', body:JSON.stringify({token_hint: hint})});
    this._loadSessionsTab();
  },

  async saveDisplayName(dn) {
    dn = (dn || '').trim();
    var d = await this.api('/api/profile/name', {method:'POST', body:JSON.stringify({display_name: dn})});
    if (d && d.status === 'ok') {
      this.toast(dn ? 'Имя сохранено' : 'Имя удалено');
      var p = this._uiState.profile;
      if (p) this._uiEmit({ profile: Object.assign({}, p, { display_name: dn }) });
      this.updateSidebarAvatar();
    }
    else { this.toast((d && d.error) || 'Ошибка', 'error'); }
  },

  async changePassword(old, nw) {
    if (!old || !nw || nw.length < 6) { this.toast(this.t('pass_min'), 'error'); return false; }
    const d = await this.api('/api/profile/password', {method:'POST', body:JSON.stringify({old:old,'new':nw})});
    if (d && d.status === 'ok') { this.toast(this.t('password_changed')); this.closeProfile(); return true; }
    this.toast((d && d.error) || this.t('error'), 'error');
    return false;
  },



  // Avatar
  /* Файл приходит из <input> внутри React-модалки. */
  async uploadAvatar(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { this.toast('Максимум 2 МБ', 'error'); return; }
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { this.toast('Только JPG, PNG, WebP', 'error'); return; }
    var reader = new FileReader();
    reader.onload = async (e) => {
      var d = await this.api('/api/profile/avatar', {method:'POST', body:JSON.stringify({image: e.target.result})});
      if (d && d.status === 'ok') { this.toast('Фото загружено'); this.openProfile(); this.updateSidebarAvatar(); }
      else { this.toast((d && d.error) || 'Ошибка', 'error'); }
    };
    reader.readAsDataURL(file);
  },

  async removeAvatar() {
    var d = await this.api('/api/profile/avatar', {method:'DELETE'});
    if (d && d.status === 'ok') { this.toast('Фото удалено'); this.openProfile(); this.updateSidebarAvatar(); }
  },

  async updateSidebarAvatar() {
    var d = await this.api('/api/profile');
    if (!d) return;
    this._uiEmit({ avatar: d.avatar || null, user: { username: d.username, display_name: d.display_name, role: d.role, id: d.id } });
  },

  onModulesUpdate(newModuleIds) {
    var self = this;
    var known = this.modules.map(function (m) { return m.id; });
    var missing = newModuleIds.some(function (id) { return known.indexOf(id) === -1; });

    var apply = function () {
      var next = self.modules.filter(function (m) { return newModuleIds.indexOf(m.id) !== -1; });
      self._uiEmit({ modules: next.map(function (m) { return { id: m.id, name: m.name, icon: m.icon }; }) });
      /* Сняли открытый модуль — уводим пользователя туда, что осталось */
      if (self.activeModule && newModuleIds.indexOf(self.activeModule) === -1) {
        var target = newModuleIds.indexOf('messenger') !== -1 ? 'messenger' : (newModuleIds[0] || 'messenger');
        setTimeout(function () { self.switchModule(target); }, 200);
      }
    };

    if (missing) {
      /* Выдали модуль, которого клиент ещё не видел — забираем манифесты */
      this.api('/api/modules').then(function (mods) {
        if (mods) self.modules = mods;
        apply();
      });
    } else {
      apply();
    }
  },

  /* ── Очередь уведомлений ───────────────────────────────────────────
     Одна стопка карточек над кнопкой «Приложения». Раньше на это было три
     независимых механизма, которые не знали друг о друге и делили два
     нижних угла с кнопкой и плашкой голосовой.

     Текст везде идёт как текст, а не как HTML: и сообщение собеседника, и
     ответ сервера в тосте — чужой ввод. */
  _push(note) {
    var id = note.id || ('n' + (this._noteSeq = (this._noteSeq || 0) + 1));
    note.id = id;
    if (note.fn) { this._noteFns = this._noteFns || {}; this._noteFns[id] = note.fn; delete note.fn; }

    var next = this._uiState.notes.filter(function (n) { return n.id !== id; });
    next.push(note);
    /* В состоянии держим не больше десяти: показываем три, остальные
       считаем, а совсем старое незачем возить в памяти. */
    if (next.length > 10) next = next.slice(next.length - 10);
    this._uiEmit({ notes: next });

    this._noteTimers = this._noteTimers || {};
    clearTimeout(this._noteTimers[id]);
    if (!note.persistent) this._armNote(id, note.ttl || 5000);
    return id;
  },

  _armNote(id, ttl) {
    var self = this;
    this._noteTimers = this._noteTimers || {};
    clearTimeout(this._noteTimers[id]);
    this._noteTimers[id] = setTimeout(function () { self.dismissNote(id); }, ttl);
  },

  /* Курсор на карточке останавливает таймер: прочитать длинное сообщение
     за отведённые секунды иначе не успеть. */
  _noteHold(id, hold) {
    var n = this._uiState.notes.find(function (x) { return x.id === id; });
    if (!n || n.persistent) return;
    if (hold) { clearTimeout((this._noteTimers || {})[id]); }
    else this._armNote(id, n.ttl || 5000);
  },

  dismissNote(id) {
    if (id == null) {
      var self0 = this;
      this._uiState.notes.slice().forEach(function (n) { self0.dismissNote(n.id); });
      return;
    }
    if (this._noteTimers) clearTimeout(this._noteTimers[id]);
    var next = this._uiState.notes.filter(function (n) { return n.id !== id; });
    if (next.length !== this._uiState.notes.length) this._uiEmit({ notes: next });
    if (this._noteFns) delete this._noteFns[id];
  },

  _noteAction(id) {
    var fn = this._noteFns && this._noteFns[id];
    if (fn) fn();
  },

  /* Подтверждение действия. Сигнатура прежняя: модули зовут его как есть. */
  toast(msg, type = 'success') {
    return this._push({
      kind: type === 'success' ? 'ok' : 'error',
      title: String(msg == null ? '' : msg),
      ttl: 3200,
    });
  }
};

/* Закрытие окон по фону и Escape живёт в самих компонентах (общий хук
   core/react-src/src/shared/useEscape.js). Раньше здесь висели два
   глобальных слушателя: они снимали класс active со всех .modal-overlay —
   то есть гасили React-овскую разметку мимо состояния. Окно исчезало, а
   модуль считал его открытым, и следующая перерисовка возвращала его. */

window.Shell = Shell;
Shell.init();

// Unlock audio on first user interaction (iOS/Safari)
['click','touchstart'].forEach(function(evt) {
  document.addEventListener(evt, function() { Shell._initAudio(); }, {once:true});
});
