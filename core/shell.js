const Shell = {
  token: null,
  user: null,
  locale: {},
  modules: [],
  activeModule: null,
  appVersion: '?',

  ws: null,
  wsReady: false,
  wsPort: null,
  unreadTotal: 0,
  contactsCache: {},
  activeChat: null,

  connectWS() {
    if (!this.token) return;
    var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = proto + '//' + window.location.host + '/ws';
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({type:'auth',token:this.token,hidden:this._isWindowHidden()}));
      };
      this.ws.onmessage = (e) => {
        try {
          var data = JSON.parse(e.data);
          if (data.type === 'auth_ok') {
            this.wsReady = true;
            this._wsRetries = 0;
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
          // Forward everything to messenger
          if (window.Messenger && Messenger.onWS) Messenger.onWS(data);
          // Forward to channels
          if (window.Channels && Channels.onWS) Channels.onWS(data);
          // Forward to valentine
          if (window.Valentine && Valentine.onWS) Valentine.onWS(data);
          // Valentine badge (when module not active)
          if (data.type === 'valentine' && this.activeModule !== 'valentine') {
            var sb = document.getElementById('valBadge');
            if (sb) { var n = (parseInt(sb.textContent)||0)+1; sb.textContent=n; sb.style.display='flex'; }
          }
        } catch(ex) {}
      };
      this.ws.onclose = () => {
        this.wsReady = false;
        // Fast reconnect: 1s first, then 3s
        var delay = this._wsRetries > 0 ? 3000 : 1000;
        this._wsRetries = (this._wsRetries || 0) + 1;
        setTimeout(() => this.connectWS(), delay);
      };
      this.ws.onerror = () => {};
    } catch(ex) {}
  },

  cacheContact(userId, avatar) {
    this.contactsCache[userId] = avatar;
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
    var old = document.querySelector('.msg-notify');
    if (old) old.remove();
    var n = document.createElement('div');
    n.className = 'msg-notify';
    var avaHtml = '';
    var cachedAvatar = this.contactsCache[msg.from];
    if (cachedAvatar) {
      avaHtml = '<div class="msg-notify-ava"><img src="data:image/jpeg;base64,' + cachedAvatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/></div>';
    } else {
      avaHtml = '<div class="msg-notify-ava">' + msg.from_name.charAt(0).toUpperCase() + '</div>';
    }
    n.innerHTML = '<div class="msg-notify-body" onclick="Shell.goToChat(\'' + msg.from + '\')">'
      + avaHtml
      + '<div class="msg-notify-content">'
      + '<div class="msg-notify-name">' + msg.from_name + '</div>'
      + '<div class="msg-notify-text">' + (msg.text.length > 60 ? msg.text.substring(0,60) + '...' : msg.text) + '</div>'
      + '</div></div>'
      + '<button class="msg-notify-close" onclick="this.parentNode.remove()">×</button>';
    document.body.appendChild(n);
    setTimeout(() => { if (n.parentNode) { n.style.opacity = '0'; setTimeout(() => n.remove(), 300); } }, 5000);
  },

  goToChat(userId) {
    var old = document.querySelector('.msg-notify');
    if (old) old.remove();
    this.switchModule('messenger');
    setTimeout(() => { if (window.Messenger) Messenger.openChat(userId); }, 200);
  },

  updateMsgBadge() {
    var badge = document.getElementById('msgBadge');
    if (!badge) return;
    if (this.unreadTotal > 0) {
      badge.textContent = this.unreadTotal > 99 ? '99+' : this.unreadTotal;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
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
    document.body.classList.toggle('theme-light', theme === 'light');
    document.body.classList.toggle('theme-dark', theme !== 'light');
    localStorage.setItem('ho_theme', theme);
    var meta = document.getElementById('metaThemeColor');
    if (meta) meta.content = theme === 'light' ? '#f2f4f8' : '#0a0a0f';
    // Update toggle buttons if profile is open
    document.querySelectorAll('.theme-seg-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  },

  _loadTheme() {
    var theme = localStorage.getItem('ho_theme') || 'dark';
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
        if (pin) { this._showPinScreen(); return; }
        this.showApp(); return;
      }
      localStorage.removeItem('ho_token');
    }
    const r = await this.api('/api/auth/status');
    if (r && r.setup_required) {
      document.getElementById('loginSubtitle').textContent = this.t('setup_subtitle');
      document.getElementById('auth-confirm-group').style.display = 'block';
      document.getElementById('authBtn').textContent = this.t('create_account');
      document.getElementById('authBtn').setAttribute('onclick', 'Shell.handleSetup()');
    }
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

  async handleAuth() {
    const u = document.getElementById('auth-user').value.trim();
    const p = document.getElementById('auth-pass').value;
    const err = document.getElementById('authError');
    err.style.display = 'none';
    if (!u || !p) { err.textContent = this.t('fill_fields'); err.style.display = 'block'; return; }
    const d = await this.api('/api/auth/login', {method:'POST', body:JSON.stringify({username:u,password:p,device_id:this._getDeviceId(),user_agent:navigator.userAgent,platform:navigator.platform||''})});
    if (d && d.token) { this.token = d.token; localStorage.setItem('ho_token', this.token); await this.verifyToken(); this.showApp(); }
    else { err.textContent = d?.error || this.t('auth_error'); err.style.display = 'block'; }
  },

  async handleSetup() {
    const u = document.getElementById('auth-user').value.trim();
    const p = document.getElementById('auth-pass').value;
    const p2 = document.getElementById('auth-pass2').value;
    const err = document.getElementById('authError');
    err.style.display = 'none';
    if (!u || !p) { err.textContent = this.t('fill_fields'); err.style.display = 'block'; return; }
    if (p !== p2) { err.textContent = this.t('passwords_mismatch'); err.style.display = 'block'; return; }
    if (p.length < 6) { err.textContent = this.t('pass_min'); err.style.display = 'block'; return; }
    const d = await this.api('/api/auth/setup', {method:'POST', body:JSON.stringify({username:u,password:p,device_id:this._getDeviceId(),user_agent:navigator.userAgent,platform:navigator.platform||''})});
    if (d && d.token) { this.token = d.token; localStorage.setItem('ho_token', this.token); await this.verifyToken(); this.showApp(); }
    else { err.textContent = d?.error || this.t('auth_error'); err.style.display = 'block'; }
  },

  async showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').classList.add('active');
    await this.loadModules();
    // Load version
    var v = await this.api('/api/version');
    if (v && v.version) { this.appVersion = v.version; document.querySelectorAll('.app-version').forEach(el => el.textContent = 'v' + v.version); }
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
    if (!('serviceWorker' in navigator)) return;
    // Show update banner when a new SW takes control (don't force-reload)
    var self = this;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      self._showUpdateBanner();
    });
    // Force SW update check every 5 minutes
    var self = this;
    setInterval(function() {
      navigator.serviceWorker.getRegistration().then(function(reg) {
        if (reg) reg.update();
      });
    }, 5 * 60 * 1000);
    // Check server version every 10 min, reload if changed
    setInterval(async function() {
      try {
        var v = await self.api('/api/version');
        if (v && v.version && v.version !== self.appVersion) {
          self.appVersion = v.version;
          // Show update banner instead of hard reload
          self._showUpdateBanner();
        }
      } catch(e) {}
    }, 10 * 60 * 1000);
  },

  _showUpdateBanner() {
    if (document.getElementById('updateBanner')) return;
    var b = document.createElement('div');
    b.id = 'updateBanner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:var(--accent);color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-family:Inter,sans-serif;box-shadow:0 2px 12px rgba(0,212,170,0.3)';
    b.innerHTML = '<span>Доступно обновление приложения</span><button onclick="window.location.reload()" style="background:rgba(0,0,0,0.2);border:none;color:#fff;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:600">Обновить</button>';
    document.body.appendChild(b);
  },

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
        await this.api('/api/push/subscribe', {method:'POST', body:JSON.stringify({subscription: existing.toJSON()})});
        return;
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

  _showPushBanner() {
    if (document.getElementById('pushBanner')) return;
    var b = document.createElement('div');
    b.id = 'pushBanner';
    b.style.cssText = 'position:fixed;bottom:60px;left:12px;right:12px;background:var(--surface);border:1px solid var(--accent);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;z-index:2000;box-shadow:0 8px 30px rgba(0,0,0,0.4)';
    b.innerHTML = '<div style="flex:1;font-size:13px;color:var(--text)">Включите уведомления, чтобы не пропустить сообщения</div>'
      + '<button onclick="Shell.enablePush()" style="background:var(--accent);border:none;color:#000;padding:8px 16px;border-radius:8px;font-weight:700;font-size:12px;white-space:nowrap;cursor:pointer">Включить</button>'
      + '<button onclick="this.parentNode.remove()" style="background:none;border:none;color:var(--text-dim);font-size:18px;cursor:pointer;padding:0 4px">×</button>';
    document.body.appendChild(b);
  },

  async enablePush() {
    var banner = document.getElementById('pushBanner');
    if (banner) banner.remove();
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
    document.getElementById('appShell').classList.remove('active');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('auth-user').value = '';
    document.getElementById('auth-pass').value = '';
    document.getElementById('moduleContent').innerHTML = '';
    document.getElementById('sidebarModules').innerHTML = '';
    // Remove admin button if exists
    var ab = document.getElementById('adminBtn');
    if (ab) ab.remove();
  },

  async loadModules() {
    const mods = await this.api('/api/modules');
    if (!mods) return;
    this.modules = mods;
    const icons = {
      servers:'<span class="ico ico-18 ico-servers"></span>',
      users:'<span class="ico ico-18 ico-users"></span>',
      messenger:'<span class="ico ico-18 ico-messenger"></span>',
      channels:'<span class="ico ico-18 ico-channels"></span>',
      valentine:'<span class="ico ico-18 ico-valentine"></span>'
    };
    const el = document.getElementById('sidebarModules');
    var visibleMods = mods.filter(m => {
      if (m.min_role === 'arcana') return false;
      return true;
    });
    el.innerHTML = visibleMods.map(m => {
      var badge = m.id === 'messenger' ? '<span class="msg-badge" id="msgBadge" style="display:none"></span>' : '';
      if (m.id === 'valentine') badge = '<span class="val-badge" id="valBadge" style="display:none;position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#e8395e;color:#fff;font-size:9px;font-weight:700;align-items:center;justify-content:center;"></span>';
      return '<button class="sidebar-module" data-id="'+m.id+'" onclick="Shell.switchModule(\''+m.id+'\')" title="'+m.name+'" style="position:relative">'+(icons[m.icon]||icons.servers)+badge+'</button>';
    }).join('');
    // Add admin module as bottom button for god
    if (this.user && this.user.role === 'arcana') {
      var adminMod = mods.find(m => m.id === 'admin');
      if (adminMod) {
        var profBtn = document.getElementById('profileBtn');
        if (profBtn && !document.getElementById('adminBtn')) {
          var ab = document.createElement('button');
          ab.className = 'sidebar-btn';
          ab.id = 'adminBtn';
          ab.title = adminMod.name;
          ab.onclick = function(){ Shell.switchModule('admin'); };
          ab.innerHTML = '<span class="ico ico-18 ico-users"></span>';
          profBtn.parentNode.insertBefore(ab, profBtn);
        }
      }
    }

  },

  loadedModules: {},

  async switchModule(id) {
    this.activeModule = id;
    if (id === 'messenger') { this.unreadTotal = 0; this.updateMsgBadge(); }
    document.querySelectorAll('.sidebar-module').forEach(b => b.classList.toggle('active', b.dataset.id === id));
    const mod = this.modules.find(m => m.id === id);
    if (!mod) return;
    const content = document.getElementById('moduleContent');

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
    } catch(e) { content.innerHTML = '<div class="loading">Ошибка загрузки модуля</div>'; }
  },

  // Profile
  async openProfile() {
    var d = await this.api('/api/profile');
    if (!d) return;
    document.getElementById('profileUsername').textContent = d.username;
    var prEl=document.getElementById('profileRole');prEl.className='role-badge '+d.role;prEl.textContent=d.role.toUpperCase();
    document.getElementById('profOldPass').value = '';
    document.getElementById('profNewPass').value = '';
    // Avatar
    var img = document.getElementById('profileAvatarImg');
    var letter = document.getElementById('profileAvatarLetter');
    var removeBtn = document.getElementById('profileAvatarRemove');
    if (d.avatar) {
      img.src = 'data:image/jpeg;base64,' + d.avatar;
      img.style.display = 'block';
      letter.style.display = 'none';
      removeBtn.style.display = 'block';
    } else {
      img.style.display = 'none';
      letter.style.display = 'block';
      letter.textContent = (d.display_name || d.username).charAt(0).toUpperCase();
      removeBtn.style.display = 'none';
    }
    var dnInput = document.getElementById('profDisplayName');
    if (dnInput) dnInput.value = d.display_name || '';
    // Sync theme toggle
    var currentTheme = localStorage.getItem('ho_theme') || 'dark';
    document.querySelectorAll('.theme-seg-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.theme === currentTheme);
    });
    document.getElementById('profileModal').classList.add('active');
    this._loadSessionsTab();
  },

  // ── PIN CODE ──────────────────────────────────────────────
  _showPinScreen() {
    var self = this;
    var entered = '';
    var overlay = document.getElementById('pinScreen');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pinScreen';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:var(--bg,#0f0f17);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:24px';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML =
      '<div style="font-size:22px;font-weight:700;color:var(--text)">Введите PIN-код</div>' +
      '<div id="pinDots" style="display:flex;gap:16px">' +
        '<div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div>' +
      '</div>' +
      '<div id="pinError" style="color:#e74c3c;font-size:13px;min-height:18px"></div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,72px);gap:12px">' +
        [1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(function(n){
          return '<button onclick="Shell._pinKey(\''+n+'\')" style="width:72px;height:72px;border-radius:50%;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:22px;font-weight:600;cursor:pointer;transition:background 0.12s"'+(n===''?' disabled style="opacity:0;pointer-events:none;width:72px;height:72px;border:none;background:none"':'')+'>'+n+'</button>';
        }).join('') +
      '</div>' +
      '<button onclick="Shell.logout()" style="background:none;border:none;color:var(--text-dim);font-size:13px;cursor:pointer;margin-top:8px">Войти с паролем</button>';
    overlay.style.display = 'flex';
    this._pinAttempts = 0;
    this._pinEntered = '';
  },

  _pinKey(key) {
    if (key === '') return;
    var pin = localStorage.getItem('ho_pin');
    if (key === '⌫') {
      this._pinEntered = (this._pinEntered || '').slice(0, -1);
    } else {
      this._pinEntered = (this._pinEntered || '') + key;
    }
    var dots = document.querySelectorAll('.pin-dot');
    dots.forEach(function(d, i) { d.style.background = i < (Shell._pinEntered||'').length ? 'var(--accent)' : 'var(--border)'; });
    if ((this._pinEntered || '').length === 4) {
      if (this._pinEntered === pin) {
        document.getElementById('pinScreen').style.display = 'none';
        this.showApp();
      } else {
        this._pinAttempts = (this._pinAttempts || 0) + 1;
        document.getElementById('pinError').textContent = 'Неверный PIN (' + (3 - this._pinAttempts) + ' попытки осталось)';
        this._pinEntered = '';
        document.querySelectorAll('.pin-dot').forEach(function(d){ d.style.background = 'var(--border)'; });
        if (this._pinAttempts >= 3) {
          localStorage.removeItem('ho_pin');
          this.logout();
        }
      }
    }
  },

  async _setPinFlow() {
    var self = this;
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
    this._loadSessionsTab();
  },

  _pinDialog(title) {
    return new Promise(function(resolve) {
      var entered = '';
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px';
      function update() {
        dots.forEach(function(d, i){ d.style.background = i < entered.length ? 'var(--accent)' : 'var(--border)'; });
        if (entered.length === 4) { document.body.removeChild(overlay); resolve(entered); }
      }
      overlay.innerHTML =
        '<div style="background:var(--surface);border-radius:20px;padding:32px;display:flex;flex-direction:column;align-items:center;gap:20px;min-width:280px">' +
        '<div style="font-size:18px;font-weight:700;color:var(--text)">'+title+'</div>' +
        '<div id="pinDlgDots" style="display:flex;gap:16px">' +
          '<div class="pin-dot" style="width:14px;height:14px;border-radius:50%;background:var(--border)"></div>'.repeat(4) +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,64px);gap:10px">' +
          [1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(function(n){
            return '<button class="pin-dlg-btn" data-key="'+n+'" style="width:64px;height:64px;border-radius:50%;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:20px;font-weight:600;cursor:pointer"'+(n===''?' disabled style="opacity:0;pointer-events:none;border:none;background:none"':'')+'>'+n+'</button>';
          }).join('') +
        '</div>' +
        '<button id="pinDlgCancel" style="background:none;border:none;color:var(--text-dim);font-size:13px;cursor:pointer">Отмена</button>' +
        '</div>';
      document.body.appendChild(overlay);
      var dots = overlay.querySelectorAll('.pin-dot');
      overlay.querySelectorAll('.pin-dlg-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var k = btn.dataset.key;
          if (k === '⌫') { entered = entered.slice(0, -1); }
          else if (k) { entered += k; }
          update();
        });
      });
      overlay.querySelector('#pinDlgCancel').addEventListener('click', function(){ document.body.removeChild(overlay); resolve(null); });
    });
  },

  async _disablePin() {
    localStorage.removeItem('ho_pin');
    var hint = this.token ? this.token.slice(-6) : '';
    await this.api('/api/auth/set_pin_flag', {method:'POST', body:JSON.stringify({token_hint: hint, pin_enabled: false})});
    this.toast('PIN-код отключён');
    this._loadSessionsTab();
  },

  // ── SESSIONS ──────────────────────────────────────────────
  async _loadSessionsTab() {
    var el = document.getElementById('profileSessions');
    if (!el) return;
    var sessions = await this.api('/api/auth/sessions');
    if (!sessions) { el.innerHTML = '<div style="color:var(--text-dim);font-size:13px">Не удалось загрузить</div>'; return; }
    var pinEnabled = !!localStorage.getItem('ho_pin');
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
      '<span style="font-size:13px;font-weight:600;color:var(--text)">PIN-код на этом устройстве</span>' +
      (pinEnabled
        ? '<button onclick="Shell._disablePin()" style="background:rgba(231,76,60,0.15);border:none;color:#e74c3c;padding:5px 12px;border-radius:8px;cursor:pointer;font-size:12px">Отключить</button>'
        : '<button onclick="Shell._setPinFlow()" style="background:var(--accent-glow);border:none;color:var(--accent);padding:5px 12px;border-radius:8px;cursor:pointer;font-size:12px">Включить</button>') +
      '</div>';
    html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px">Активные сессии</div>';
    sessions.forEach(function(s) {
      var ua = s.device_info && s.device_info.user_agent || '';
      var device = Shell._deviceName(ua);
      var lastSeen = s.last_seen ? Shell._relTime(s.last_seen) : '—';
      html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;color:var(--text);display:flex;align-items:center;gap:6px">'+device+
            (s.is_current ? '<span style="font-size:10px;background:var(--accent-glow);color:var(--accent);padding:1px 6px;border-radius:6px;font-weight:600">текущая</span>' : '') +
            (s.pin_enabled ? '<span style="font-size:10px;background:rgba(251,191,36,0.15);color:#fbbf24;padding:1px 6px;border-radius:6px">PIN</span>' : '') +
          '</div>' +
          '<div style="font-size:11px;color:var(--text-dim);margin-top:2px">'+lastSeen+'</div>' +
        '</div>' +
        (!s.is_current ? '<button onclick="Shell._revokeSession(\''+s.hint+'\')" style="background:rgba(231,76,60,0.12);border:none;color:#e74c3c;padding:5px 10px;border-radius:8px;cursor:pointer;font-size:11px;white-space:nowrap">Завершить</button>' : '') +
      '</div>';
    });
    el.innerHTML = html;
  },

  _relTime(ts) {
    var diff = Math.floor(Date.now()/1000 - ts);
    if (diff < 60) return 'только что';
    if (diff < 3600) return Math.floor(diff/60) + ' мин. назад';
    if (diff < 86400) return Math.floor(diff/3600) + ' ч. назад';
    return Math.floor(diff/86400) + ' дн. назад';
  },

  _deviceName(ua) {
    if (!ua) return '💻 Устройство';
    // iOS devices
    if (/iPhone/.test(ua)) {
      var m = ua.match(/iPhone OS ([\d_]+)/); var v = m ? ' ' + m[1].replace(/_/g,'.') : '';
      return '📱 iPhone' + v;
    }
    if (/iPad/.test(ua)) return '📱 iPad';
    // Android
    if (/Android/.test(ua)) {
      var m2 = ua.match(/Android [^;]+;\s*([^)]+)/); var model = m2 ? m2[1].trim() : 'Android';
      if (model.length > 28) model = model.slice(0,28) + '…';
      return '📱 ' + model;
    }
    // Desktop OS
    if (/Windows NT 10/.test(ua)) return '💻 Windows 10/11';
    if (/Windows NT 6/.test(ua)) return '💻 Windows';
    if (/Macintosh/.test(ua)) { var mv = ua.match(/Mac OS X ([\d_]+)/); return '💻 macOS' + (mv ? ' ' + mv[1].replace(/_/g,'.') : ''); }
    if (/Linux/.test(ua)) return '💻 Linux';
    return '💻 Устройство';
  },

  async _revokeSession(hint) {
    await this.api('/api/auth/revoke_session', {method:'POST', body:JSON.stringify({token_hint: hint})});
    this._loadSessionsTab();
  },

  async saveDisplayName() {
    var dn = document.getElementById('profDisplayName').value.trim();
    var d = await this.api('/api/profile/name', {method:'POST', body:JSON.stringify({display_name: dn})});
    if (d && d.status === 'ok') { this.toast(dn ? 'Имя сохранено' : 'Имя удалено'); }
    else { this.toast(d?.error || 'Ошибка', 'error'); }
  },

  async changePassword() {
    const old = document.getElementById('profOldPass').value;
    const nw = document.getElementById('profNewPass').value;
    if (!old || !nw || nw.length < 6) { this.toast(this.t('pass_min'), 'error'); return; }
    const d = await this.api('/api/profile/password', {method:'POST', body:JSON.stringify({old:old,'new':nw})});
    if (d && d.status === 'ok') { this.toast(this.t('password_changed')); this.closeModal('profileModal'); }
    else { this.toast(d?.error || this.t('error'), 'error'); }
  },



  toggleEye(btn) {
    var input = btn.parentNode.querySelector('input');
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerHTML = '<span class="ico ico-16 ico-eye-closed"></span>';
    } else {
      input.type = 'password';
      btn.innerHTML = '<span class="ico ico-16 ico-eye-open"></span>';
    }
  },

  // Avatar
  pickAvatar() {
    document.getElementById('avatarFileInput').click();
  },

  async uploadAvatar(input) {
    var file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { this.toast('Максимум 2 МБ', 'error'); return; }
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { this.toast('Только JPG, PNG, WebP', 'error'); return; }
    var reader = new FileReader();
    reader.onload = async (e) => {
      var d = await this.api('/api/profile/avatar', {method:'POST', body:JSON.stringify({image: e.target.result})});
      if (d && d.status === 'ok') { this.toast('Фото загружено'); this.openProfile(); this.updateSidebarAvatar(); }
      else { this.toast(d?.error || 'Ошибка', 'error'); }
    };
    reader.readAsDataURL(file);
    input.value = '';
  },

  async removeAvatar() {
    var d = await this.api('/api/profile/avatar', {method:'DELETE'});
    if (d && d.status === 'ok') { this.toast('Фото удалено'); this.openProfile(); this.updateSidebarAvatar(); }
  },

  async updateSidebarAvatar() {
    var d = await this.api('/api/profile');
    if (!d) return;
    var btn = document.getElementById('profileBtn');
    if (d.avatar) {
      btn.innerHTML = '<img class="sidebar-avatar" src="data:image/jpeg;base64,' + d.avatar + '"/>';
    } else {
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    }
  },

  closeModal(id) { document.getElementById(id).classList.remove('active'); },

  onModulesUpdate(newModuleIds) {
    var el = document.getElementById('sidebarModules');
    if (!el) return;
    var currentBtns = el.querySelectorAll('.sidebar-module');
    var currentIds = [];
    currentBtns.forEach(function(b) { currentIds.push(b.dataset.id); });

    // Fade out removed modules
    var removed = [];
    currentBtns.forEach(function(b) {
      if (newModuleIds.indexOf(b.dataset.id) === -1) {
        removed.push(b.dataset.id);
        b.style.transition = 'opacity 0.3s, transform 0.3s';
        b.style.opacity = '0';
        b.style.transform = 'scale(0.5)';
        setTimeout(function() { b.remove(); }, 300);
      }
    });

    // Fade in new modules
    var self = this;
    newModuleIds.forEach(function(id) {
      if (currentIds.indexOf(id) === -1) {
        var mod = self.modules.find(function(m) { return m.id === id; });
        if (!mod) {
          // Module not loaded yet — fetch all modules
          self.api('/api/modules').then(function(mods) {
            if (mods) { self.modules = mods; self._addSidebarBtn(id, el); }
          });
        } else {
          self._addSidebarBtn(id, el);
        }
      }
    });

    // If active module was removed — switch to messenger or first available
    if (removed.indexOf(this.activeModule) !== -1) {
      var target = newModuleIds.indexOf('messenger') !== -1 ? 'messenger' : (newModuleIds[0] || 'messenger');
      setTimeout(function() { self.switchModule(target); }, 350);
    }
  },

  _addSidebarBtn(id, container) {
    var mod = this.modules.find(function(m) { return m.id === id; });
    if (!mod) return;
    var icons = {
      servers:'<span class="ico ico-18 ico-servers"></span>',
      users:'<span class="ico ico-18 ico-users"></span>',
      messenger:'<span class="ico ico-18 ico-messenger"></span>',
      channels:'<span class="ico ico-18 ico-channels"></span>',
      valentine:'<span class="ico ico-18 ico-valentine"></span>'
    };
    var badge = id === 'messenger' ? '<span class="msg-badge" id="msgBadge" style="display:none"></span>' : '';
    var btn = document.createElement('button');
    btn.className = 'sidebar-module';
    btn.dataset.id = id;
    btn.title = mod.name;
    btn.style.position = 'relative';
    btn.onclick = function() { Shell.switchModule(id); };
    btn.innerHTML = (icons[mod.icon] || icons.servers) + badge;
    btn.style.opacity = '0';
    btn.style.transform = 'scale(0.5)';
    container.appendChild(btn);
    requestAnimationFrame(function() {
      btn.style.transition = 'opacity 0.3s, transform 0.3s';
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1)';
    });
  },

  toast(msg, type='success') {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const t = document.createElement('div'); t.className = 'toast '+ type;
    t.innerHTML = (type==='success'?'✓':'✗')+' '+msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 3000);
  }
};

// Close modals
document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !document.getElementById('loginScreen').classList.contains('hidden')) Shell.handleAuth(); });

Shell.init();

// Unlock audio on first user interaction (iOS/Safari)
['click','touchstart'].forEach(function(evt) {
  document.addEventListener(evt, function() { Shell._initAudio(); }, {once:true});
});
