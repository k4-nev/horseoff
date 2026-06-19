/* Valentine module — v1.0 */
const Valentine = {

  // ─── state ───
  contacts:     [],
  stickers:     [],
  pages:        [{sticker:null,text:''},{sticker:null,text:''},{sticker:null,text:''},{sticker:null,text:''},{sticker:null,text:''}],
  currentPage:  0,
  targetContact: null,
  received:     [],
  viewerVal:    null,
  viewerPage:   0,
  _tab:         'create',
  _heartsTimer: null,
  myProfile:    null,

  // ─── init ───
  async init() {
    this._startHearts('vlHeartsBg');
    await Promise.all([this.loadContacts(), this.loadStickers(), this.loadReceived(), this.loadMyProfile()]);
    this.renderContacts();
    this.renderConfessions();
    this.updateBadges();
  },

  async loadMyProfile() {
    var data = await this._api('GET', '/api/profile');
    this.myProfile = data || null;
  },

  // ─── API helpers ───
  async _api(method, path, body) {
    var opts = {method};
    if (body) opts.body = JSON.stringify(body);
    // Shell.api adds the Authorization: Bearer <token> header and handles 401
    if (window.Shell && Shell.api) return await Shell.api(path, opts);
    try {
      var headers = {'Content-Type':'application/json'};
      var tok = (window.Shell && Shell.token) || localStorage.getItem('ho_token');
      if (tok) headers['Authorization'] = 'Bearer ' + tok;
      var r = await fetch(path, {method, headers, body: opts.body});
      return await r.json();
    } catch(e) { return null; }
  },

  // ─── Contacts ───
  async loadContacts() {
    var data = await this._api('GET','/api/msg/contacts');
    this.contacts = (data && data.contacts) || [];
  },

  renderContacts() {
    var el = document.getElementById('vlContactsList');
    if (!el) return;
    if (!this.contacts.length) {
      el.innerHTML = '<div class="vl-empty"><div class="vl-empty-ico">💌</div><div class="vl-empty-title">Нет контактов</div><div class="vl-empty-sub">Добавь друзей, чтобы отправить валентинку</div></div>';
      return;
    }
    el.innerHTML = this.contacts.map(c => {
      var ava = c.avatar
        ? '<img src="data:image/jpeg;base64,'+c.avatar+'" alt="">'
        : this._initials(c.display_name || c.username);
      return '<div class="vl-contact-card" onclick="Valentine.openCreator(\''+c.id+'\')">'
        +'<div class="vl-contact-ava">'+ava+'</div>'
        +'<div class="vl-contact-info">'
          +'<div class="vl-contact-name">'+this._esc(c.display_name || c.username)+'</div>'
          +'<div class="vl-contact-sub">@'+this._esc(c.username)+'</div>'
        +'</div>'
        +'<div class="vl-contact-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></div>'
      +'</div>';
    }).join('');
  },

  // ─── Stickers ───
  async loadStickers() {
    var data = await this._api('GET','/api/valentine/stickers');
    this.stickers = (data && data.stickers) || [];
  },

  renderStickerGrid() {
    var el = document.getElementById('vlStickerGrid');
    if (!el) return;
    if (!this.stickers.length) {
      el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#c080a0;font-size:13px">Стикеры не найдены.<br>Добавь PNG-файлы в папку /stickers/</div>';
      return;
    }
    var sel = this.pages[this.currentPage].sticker;
    el.innerHTML = this.stickers.map(src =>
      '<div class="vl-sticker-item'+(src===sel?' vl-sticker-selected':'')+'" onclick="Valentine.selectSticker(\''+this._esc(src)+'\')" data-src="'+this._esc(src)+'">'
        +'<img src="'+src+'" loading="lazy" alt="">'
      +'</div>'
    ).join('');
  },

  selectSticker(src) {
    this.pages[this.currentPage].sticker = src;
    document.querySelectorAll('.vl-sticker-item').forEach(function(el) {
      el.classList.toggle('vl-sticker-selected', el.dataset.src === src);
    });
    var hint = document.getElementById('vlStickerHint');
    if (hint) { hint.textContent = '✓ Картинка выбрана'; hint.style.color = '#e8395e'; }
    this._checkNextBtn();
  },

  // ─── Received ───
  async loadReceived() {
    var data = await this._api('GET','/api/valentine/received');
    this.received = Array.isArray(data) ? data : [];
  },

  renderConfessions() {
    var el = document.getElementById('vlConfessionsList');
    if (!el) return;
    if (!this.received.length) {
      el.innerHTML = '<div class="vl-empty">'
        +'<div class="vl-empty-ico">💌</div>'
        +'<div class="vl-empty-title">Пока тихо...</div>'
        +'<div class="vl-empty-sub">Здесь появятся признания, которые тебе отправят</div>'
      +'</div>';
      return;
    }
    var sorted = this.received.slice().sort(function(a,b){ return b.time-a.time; });
    el.innerHTML = sorted.map(v => {
      var ava = v.from_avatar
        ? '<img src="data:image/jpeg;base64,'+v.from_avatar+'" alt="">'
        : this._initials(v.from_name);
      var thumb = (v.pages && v.pages[0] && v.pages[0].sticker)
        ? '<img class="vl-confession-thumb" src="'+v.pages[0].sticker+'" alt="">' : '';
      var preview = (v.pages && v.pages[0]) ? this._esc(v.pages[0].text) : '';
      var unread = !v.read;
      return '<div class="vl-confession-card'+(unread?' vl-unread':'')+'" id="vlConf_'+v.id+'">'
        +'<div class="vl-confession-head" onclick="Valentine.openViewer(\''+v.id+'\')">'
          +'<div class="vl-confession-ava">'+ava+'</div>'
          +'<div class="vl-confession-meta">'
            +'<div class="vl-confession-from">'+this._esc(v.from_name)+'</div>'
            +'<div class="vl-confession-time">'+this._fmtTime(v.time)+'</div>'
          +'</div>'
          +(unread ? '<div class="vl-confession-new"></div>' : '')
        +'</div>'
        +(thumb||preview ? '<div class="vl-confession-preview" onclick="Valentine.openViewer(\''+v.id+'\')">'
            +thumb
            +'<div class="vl-confession-text">'+preview+'</div>'
          +'</div>' : '')
        +'<div class="vl-confession-actions">'
          +'<button class="vl-confession-btn vl-confession-btn-read" onclick="Valentine.openViewer(\''+v.id+'\')">'
            +'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
            +(unread ? 'Открыть' : 'Читать снова')
          +'</button>'
          +'<button class="vl-confession-btn vl-confession-btn-reply" onclick="Valentine.replyTo(\''+v.from+'\')">'
            +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
            +'Ответить'
          +'</button>'
          +'<button class="vl-confession-btn vl-confession-btn-del" onclick="Valentine.deleteVal(\''+v.id+'\')">'
            +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>'
          +'</button>'
        +'</div>'
      +'</div>';
    }).join('');
  },

  // ─── Tabs ───
  switchTab(tab) {
    this._tab = tab;
    document.getElementById('vlPanelCreate').classList.toggle('vl-panel-hidden', tab !== 'create');
    document.getElementById('vlPanelReceived').classList.toggle('vl-panel-hidden', tab !== 'received');
    document.getElementById('vlTabCreate').classList.toggle('vl-tab-active', tab === 'create');
    document.getElementById('vlTabReceived').classList.toggle('vl-tab-active', tab === 'received');
    if (tab === 'received') this.renderConfessions();
  },

  // ─── Creator ───
  openCreator(contactId) {
    var c = this.contacts.find(function(x){ return x.id === contactId; });
    if (!c) return;
    this.targetContact = c;
    this.pages = [{sticker:null,text:''},{sticker:null,text:''},{sticker:null,text:''},{sticker:null,text:''},{sticker:null,text:''}];
    this.currentPage = 0;
    var modal = document.getElementById('vlCreatorModal');
    modal.style.display = 'flex';
    requestAnimationFrame(function(){ modal.style.display = 'flex'; });
    var toEl = document.getElementById('vlCreatorTo');
    if (toEl) toEl.textContent = 'для ' + (c.display_name || c.username);
    this._renderCreatorPage();
  },

  closeCreator() {
    var modal = document.getElementById('vlCreatorModal');
    if (modal) modal.style.display = 'none';
    this.targetContact = null;
  },

  _renderCreatorPage() {
    var pg = this.currentPage;
    // Label
    var lbl = document.getElementById('vlPageLbl');
    if (lbl) lbl.innerHTML = 'Страница <b>'+(pg+1)+'</b> из 5';

    // Progress hearts
    document.querySelectorAll('.vl-prog-item').forEach(function(el) {
      var i = parseInt(el.dataset.i);
      el.classList.toggle('vl-prog-done', i < pg);
      el.classList.toggle('vl-prog-active', i === pg);
    });

    // Sticker grid
    this.renderStickerGrid();

    // Hint
    var hint = document.getElementById('vlStickerHint');
    if (hint) {
      if (this.pages[pg].sticker) {
        hint.textContent = '✓ Картинка выбрана';
        hint.style.color = '#e8395e';
      } else {
        hint.textContent = 'Выбери картинку для этой страницы';
        hint.style.color = '';
      }
    }

    // Text input
    var inp = document.getElementById('vlTextInput');
    if (inp) inp.value = this.pages[pg].text;

    // Buttons
    var prev = document.getElementById('vlPrevBtn');
    var next = document.getElementById('vlNextBtn');
    if (prev) prev.style.visibility = pg === 0 ? 'hidden' : 'visible';
    if (next) {
      if (pg === 4) {
        next.innerHTML = 'Отправить 💌';
      } else {
        next.innerHTML = 'Далее <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';
      }
    }
    this._checkNextBtn();
  },

  onTextInput(val) {
    this.pages[this.currentPage].text = val;
    this._checkNextBtn();
  },

  _checkNextBtn() {
    var pg = this.pages[this.currentPage];
    var ok = !!(pg.sticker && pg.text && pg.text.trim());
    var btn = document.getElementById('vlNextBtn');
    if (btn) btn.disabled = !ok;
  },

  nextPage() {
    // Save text
    var inp = document.getElementById('vlTextInput');
    if (inp) this.pages[this.currentPage].text = inp.value;

    if (this.currentPage < 4) {
      this.currentPage++;
      this._renderCreatorPage();
    } else {
      this._showConfirm();
    }
  },

  prevPage() {
    var inp = document.getElementById('vlTextInput');
    if (inp) this.pages[this.currentPage].text = inp.value;

    if (this.currentPage > 0) {
      this.currentPage--;
      this._renderCreatorPage();
    }
  },

  // ─── Confirm & Send ───
  _showConfirm() {
    document.getElementById('vlCreatorModal').style.display = 'none';
    var modal = document.getElementById('vlConfirmModal');
    modal.style.display = 'flex';
    var nm = document.getElementById('vlConfirmName');
    if (nm && this.targetContact) nm.textContent = this.targetContact.display_name || this.targetContact.username;
  },

  closeConfirm() {
    document.getElementById('vlConfirmModal').style.display = 'none';
    document.getElementById('vlCreatorModal').style.display = 'flex';
  },

  async sendValentine() {
    if (!this.targetContact) return;
    var btn = document.getElementById('vlSendBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Отправляю...'; }

    var result = await this._api('POST', '/api/valentine/send', {
      to: this.targetContact.id,
      pages: this.pages.map(function(p){ return {sticker:p.sticker, text:p.text}; })
    });

    if (btn) { btn.disabled = false; btn.innerHTML = 'Отправить 💌'; }

    if (result && result.status === 'ok') {
      document.getElementById('vlConfirmModal').style.display = 'none';
      this._showSentAnimation();
    } else {
      var msg = (result && result.error) ? result.error : 'Ошибка отправки';
      alert(msg);
    }
  },

  _showSentAnimation() {
    // Launch hearts burst
    this._burstHearts('vlHeartsBg', 18);
    // Show success toast
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#ff6b8a,#e8395e);color:#fff;padding:14px 28px;border-radius:16px;font-size:15px;font-weight:600;z-index:99999;box-shadow:0 6px 24px rgba(232,57,94,0.45);animation:vl-slide-up 0.3s ease both;pointer-events:none;white-space:nowrap;';
    toast.textContent = '💌 Валентинка отправлена!';
    document.body.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 2800);
  },

  // ─── Viewer ───
  openViewer(valId) {
    var v = this.received.find(function(x){ return x.id === valId; });
    if (!v) return;
    this.viewerVal = v;
    this.viewerPage = 0;

    // Mark as read
    if (!v.read) {
      v.read = true;
      this._api('POST', '/api/valentine/read', {id: valId});
      this.updateBadges();
      var card = document.getElementById('vlConf_'+valId);
      if (card) {
        card.classList.remove('vl-unread');
        var dot = card.querySelector('.vl-confession-new');
        if (dot) dot.remove();
      }
    }

    var modal = document.getElementById('vlViewerModal');
    modal.style.display = 'flex';
    modal.classList.add('vl-viewer-open');
    this._startHearts('vlViewerHearts');
    this._renderViewerPage('in');
    this._renderViewerDots();
  },

  closeViewer() {
    var modal = document.getElementById('vlViewerModal');
    if (modal) { modal.style.display = 'none'; modal.classList.remove('vl-viewer-open'); }
    this.viewerVal = null;
  },

  _renderViewerPage(dir) {
    var stage = document.getElementById('vlViewerStage');
    if (!stage || !this.viewerVal) return;
    var pg = this.viewerPage;
    var pages = this.viewerVal.pages;
    var total = pages.length + 1; // +1 for final page

    // Remove old cards with flip-out animation
    var old = stage.querySelector('.vl-page-card');
    if (old) {
      old.classList.add('vl-flip-out');
      var _old = old;
      setTimeout(function(){ if (_old.parentNode) _old.remove(); }, 220);
    }

    var card = document.createElement('div');
    card.className = 'vl-page-card';

    if (pg < pages.length) {
      // Content page
      var p = pages[pg];
      card.innerHTML =
        '<div class="vl-page-love-label">Любовь это…</div>'
        +'<div class="vl-page-sticker"><img src="'+this._esc(p.sticker)+'" alt=""></div>'
        +'<div class="vl-page-text">'+this._esc(p.text)+'</div>';
    } else {
      // Final page
      card.classList.add('vl-final-card');
      var v = this.viewerVal;
      var myProf = this.myProfile || {};
      var myName = myProf.display_name || myProf.username || (Shell && Shell.user && Shell.user.username) || '';
      var myAva = myProf.avatar
        ? '<img src="data:image/jpeg;base64,'+myProf.avatar+'" alt="">'
        : this._initials(myName);

      card.innerHTML =
        '<div class="vl-final-to">'
          +'<div class="vl-final-ava">'+myAva+'</div>'
          +'<div class="vl-final-name-row">'+this._esc(myName)+'</div>'
        +'</div>'
        +'<div class="vl-final-love">Я тебя очень люблю<br>и дорожу тобой ❤️</div>'
        +'<div class="vl-final-divider"></div>'
        +'<div class="vl-final-from">'
          +'<span class="vl-final-from-label">Твой</span>'
          +'<div class="vl-final-from-ava">'
            +(v.from_avatar ? '<img src="data:image/jpeg;base64,'+v.from_avatar+'" alt="">' : this._initials(v.from_name))
          +'</div>'
          +'<span class="vl-final-from-name">'+this._esc(v.from_name)+'</span>'
        +'</div>';

      // Burst hearts on final page
      setTimeout(function(){ Valentine._burstHearts('vlViewerHearts', 16); }, 300);
    }

    var animClass = dir === 'in' ? 'vl-flip-in' : (dir === 'rev' ? 'vl-flip-in-rev' : 'vl-flip-in');
    card.classList.add(animClass);
    stage.appendChild(card);

    // Update arrows
    var prev = document.getElementById('vlViewerPrev');
    var next = document.getElementById('vlViewerNext');
    if (prev) prev.disabled = pg === 0;
    if (next) next.disabled = pg >= total - 1;

    // Update dots
    document.querySelectorAll('.vl-viewer-dot').forEach(function(dot, i) {
      dot.classList.toggle('vl-dot-active', i === pg);
    });
  },

  _renderViewerDots() {
    var el = document.getElementById('vlViewerDots');
    if (!el || !this.viewerVal) return;
    var total = this.viewerVal.pages.length + 1;
    el.innerHTML = Array.from({length:total}, function(_,i) {
      return '<div class="vl-viewer-dot'+(i===0?' vl-dot-active':'')+'" onclick="Valentine.viewerGoTo('+i+')"></div>';
    }).join('');
  },

  viewerNext() {
    if (!this.viewerVal) return;
    var total = this.viewerVal.pages.length + 1;
    if (this.viewerPage < total - 1) {
      this.viewerPage++;
      this._renderViewerPage('in');
    }
  },

  viewerPrev() {
    if (this.viewerPage > 0) {
      this.viewerPage--;
      this._renderViewerPage('rev');
    }
  },

  viewerGoTo(i) {
    var dir = i > this.viewerPage ? 'in' : 'rev';
    this.viewerPage = i;
    this._renderViewerPage(dir);
  },

  // ─── Delete / Reply ───
  async deleteVal(valId) {
    var r = await this._api('DELETE', '/api/valentine/'+valId);
    if (r && r.status === 'ok') {
      this.received = this.received.filter(function(v){ return v.id !== valId; });
      var card = document.getElementById('vlConf_'+valId);
      if (card) {
        card.style.transition = 'all 0.25s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.92)';
        setTimeout(function(){ card.remove(); }, 250);
      }
      this.updateBadges();
    }
  },

  replyTo(contactId) {
    this.switchTab('create');
    setTimeout(function(){ Valentine.openCreator(contactId); }, 100);
  },

  // ─── Badges ───
  updateBadges() {
    var unread = this.received.filter(function(v){ return !v.read; }).length;

    var hb = document.getElementById('vlHeaderBadge');
    if (hb) { hb.textContent = unread; hb.style.display = unread ? 'flex' : 'none'; }

    var tb = document.getElementById('vlTabBadge');
    if (tb) { tb.textContent = unread; tb.style.display = unread ? 'inline-flex' : 'none'; }

    // Sidebar badge
    var sb = document.getElementById('valBadge');
    if (sb) { sb.textContent = unread; sb.style.display = unread ? 'flex' : 'none'; }
  },

  // ─── WebSocket handler ───
  onWS(data) {
    if (data.type === 'valentine') {
      // New valentine received
      var reload = this.loadReceived.bind(this);
      reload().then(function(){
        Valentine.renderConfessions();
        Valentine.updateBadges();
      });
    }
  },

  // ─── Floating hearts ───
  _startHearts(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    var hearts = ['♥','❤','💕','💗','💖','💝'];
    var count = 8;
    for (var i = 0; i < count; i++) {
      (function(idx) {
        var h = document.createElement('div');
        h.className = 'vl-heart-particle';
        h.textContent = hearts[Math.floor(Math.random()*hearts.length)];
        h.style.left = (Math.random() * 90 + 5) + '%';
        h.style.fontSize = (10 + Math.random() * 12) + 'px';
        var dur = 6 + Math.random() * 8;
        var delay = idx * 1.1 + Math.random() * 3;
        h.style.animationDuration = dur + 's';
        h.style.animationDelay = delay + 's';
        el.appendChild(h);
      })(i);
    }
  },

  _burstHearts(containerId, count) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var hearts = ['♥','❤','💕','💗','💖'];
    for (var i = 0; i < count; i++) {
      (function() {
        var h = document.createElement('div');
        h.style.cssText = 'position:absolute;font-size:'+(14+Math.random()*14)+'px;'
          +'left:'+(10+Math.random()*80)+'%;bottom:'+(10+Math.random()*40)+'%;'
          +'pointer-events:none;animation:vl-float-up '+(1.5+Math.random()*1.5)+'s ease both;'
          +'animation-delay:'+(Math.random()*0.6)+'s;opacity:0;';
        h.textContent = hearts[Math.floor(Math.random()*hearts.length)];
        el.appendChild(h);
        setTimeout(function(){ if (h.parentNode) h.remove(); }, 3500);
      })();
    }
  },

  // ─── Utils ───
  _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  },

  _initials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  },

  _fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000);
    var now = new Date();
    var diff = (now - d) / 1000;
    if (diff < 60) return 'только что';
    if (diff < 3600) return Math.floor(diff/60) + ' мин назад';
    if (diff < 86400) return Math.floor(diff/3600) + ' ч назад';
    if (diff < 86400*2) return 'вчера';
    return d.toLocaleDateString('ru-RU', {day:'numeric',month:'long'});
  }
};

// Boot
(function() {
  // Forward WS from shell
  if (window.Shell) {
    var _orig = window.Shell.onWS || null;
  }
  Valentine.init();
})();
