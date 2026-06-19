const Messenger = {
  contacts: [],
  currentChat: null,
  currentUserId: null,
  currentUserAvatar: null,
  currentUserName: '',
  typingTimeout: null,
  emojiOpen: false,
  _msgOffset: 0,
  _loadingMore: false,
  _hasMore: true,

  emojis: ['😊','😂','❤️','👍','👋','🔥','😎','🤔','👌','🙏','😅','🎉','💪','😍','🤝','👀','✅','❌','⚡','💯','🚀','😢','😡','🤣','😘','🥰','😏','😁','😉','🙂','😐','😑','🤷','💬','📡','🖥️','⚙️','🔧','✨','💀'],
  topReactions: ['❤️','👍','😂','🔥','😢'],
  GROUP_GAP: 120,
  TWO_DAYS: 172800,
  editingMsgId: null,
  _lastMsgId: null,
  _ctxMenu: null,
  pendingFiles: [],
  _attachTab: 'image',
  forwardPending: null,
  replyTo: null,
  _micMode: false,
  _recording: false,
  _mediaRecorder: null,
  _recordChunks: [],
  _recordTimer: null,
  _recordSeconds: 0,

  async init() {
    this.currentUserId = Shell.user ? Shell.user.id || null : null;
    this.currentUserName = Shell.user ? Shell.user.username || '' : '';
    // Load avatar in background (non-blocking)
    Shell.api('/api/profile').then(function(p) {
      if (p) {
        Messenger.currentUserId = p.id;
        Messenger.currentUserAvatar = p.avatar || null;
        Messenger.currentUserName = p.display_name || p.username || '';
      }
    });
    this.buildEmojiPicker();
    // Contacts arrive via WS on auth_ok
    // Fallback: if no contacts in 3s, load via HTTP
    this._contactsFallback = setTimeout(function() {
      if (!Messenger.contacts || Messenger.contacts.length === 0) {
        Shell.api('/api/msg/contacts').then(function(d) {
          if (d && d.contacts) { Messenger.contacts = d.contacts; Messenger.renderContacts(); }
        });
      }
    }, 3000);

    var input = document.getElementById('msgInput');
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Messenger.send(); }
        if (e.key === 'Escape' && Messenger.editingMsgId) { Messenger.cancelEdit(); }
        if (e.key === 'Escape') { Messenger.closeGallery(); Messenger.cancelReply(); Messenger.cancelForward(); }
      });
    }

    document.addEventListener('click', function(e) {
      if (Messenger.emojiOpen && !e.target.closest('.msg-emoji-picker') && !e.target.closest('.msg-emoji-btn')) {
        Messenger.emojiOpen = false;
        var el = document.getElementById('msgEmojiPicker');
        if (el) el.style.display = 'none';
      }
      Messenger.closeCtxMenu();
    });

    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        if (Shell.ws && Shell.ws.readyState !== WebSocket.OPEN) Shell.connectWS();
        if (Shell.wsReady) {
          Shell.wsSend({type:'contacts'});
          if (Messenger.currentChat) Shell.wsSend({type:'history', to: Messenger.currentChat, offset: 0});
        } else {
          // WS dead — use HTTP
          Shell.api('/api/msg/contacts').then(function(d) {
            if (d && d.contacts) { Messenger.contacts = d.contacts; Messenger.renderContacts(); }
          });
        }
      }
    });

    // Drag & drop files onto chat
    setTimeout(function() {
      var chatArea = document.getElementById('msgMessages');
      if (chatArea) {
        chatArea.addEventListener('dragover', function(e) { e.preventDefault(); chatArea.style.opacity = '0.7'; });
        chatArea.addEventListener('dragleave', function() { chatArea.style.opacity = '1'; });
        chatArea.addEventListener('drop', function(e) {
          e.preventDefault(); chatArea.style.opacity = '1';
          if (e.dataTransfer.files.length > 0) Messenger.addFiles(e.dataTransfer.files);
        });
      }
    }, 500);

    // Ctrl+V paste images
    document.addEventListener('paste', function(e) {
      if (!Messenger.currentChat) return;
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      var files = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') files.push(items[i].getAsFile());
      }
      if (files.length > 0) { e.preventDefault(); Messenger.addFiles(files); }
    });

    // Mobile keyboard
    this._initKeyboard();


    // iOS Safari: long-press via touch events (contextmenu doesn't fire)
    this._initLongPress();
  },

  _initLongPress() {
    var container = document.getElementById('msgMessages');
    if (!container) return;
    var timer = null, startX = 0, startY = 0, moved = false;

    container.addEventListener('touchstart', function(e) {
      var row = e.target.closest('.msg-row');
      if (!row) return;
      moved = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      timer = setTimeout(function() {
        if (moved) return;
        e.preventDefault();
        // Prevent text selection
        window.getSelection().removeAllRanges();
        if (navigator.vibrate) navigator.vibrate(30);
        var msgId = row.getAttribute('data-msgid');
        var msgFrom = row.getAttribute('data-from');
        var msgTime = parseInt(row.getAttribute('data-time') || '0');
        var msgText = row.getAttribute('data-text') || '';
        var fakeEvent = { preventDefault:function(){}, stopPropagation:function(){}, clientX: startX, clientY: startY };
        Messenger.showCtxMenu(fakeEvent, msgId, msgFrom, msgTime, msgText);
      }, 500);
    }, {passive: false});

    container.addEventListener('touchmove', function(e) {
      if (!timer) return;
      var dx = e.touches[0].clientX - startX;
      var dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { moved = true; clearTimeout(timer); timer = null; }
    }, {passive: true});

    container.addEventListener('touchend', function() {
      clearTimeout(timer); timer = null;
    }, {passive: true});

    container.addEventListener('touchcancel', function() {
      clearTimeout(timer); timer = null;
    }, {passive: true});
  },

  _isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  _initKeyboard() {
    if (!window.visualViewport) return;
    var sidebar = document.getElementById('sidebar');
    var ios = this._isIOS();
    var wasKB = false;
    var apply = function() {
      if (window.innerWidth > 768) return;
      var vv = window.visualViewport;
      // Keyboard height = layout viewport minus visible viewport (and any offset)
      var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      var open = kb > 80;
      var c = document.getElementById('msgChat');
      if (open && !wasKB) {
        wasKB = true;
        if (sidebar) { sidebar.style.transition='transform 0.2s,opacity 0.2s'; sidebar.style.transform='translateY(100%)'; sidebar.style.opacity='0'; sidebar.style.pointerEvents='none'; }
        var pr=document.getElementById('msgProfile'); if(pr)pr.classList.remove('mobile-open');
      } else if (!open && wasKB) {
        wasKB = false;
        if (sidebar) { sidebar.style.transition='transform 0.2s,opacity 0.2s'; sidebar.style.transform=''; sidebar.style.opacity=''; sidebar.style.pointerEvents=''; }
      }
      // iOS: layout viewport does NOT shrink for the keyboard, so we lift the
      // fixed chat above the keyboard ourselves (eliminates the empty gap).
      // Android uses interactive-widget=resizes-content and needs no offset.
      if (c && ios) c.style.bottom = open ? kb + 'px' : '';
      if (open) { window.scrollTo(0, 0); Messenger.scrollToBottom(true); }
    };
    window.visualViewport.addEventListener('resize', apply);
    window.visualViewport.addEventListener('scroll', apply);
  },



  onWS(data) {
    if (data.type === 'message') {
      if (this.currentChat && data.chat === this.getChatKey(this.currentUserId, this.currentChat)) {
        var mel = document.getElementById('msgMessages');
        var wasAtBottom = !mel || (mel.scrollHeight - mel.scrollTop - mel.clientHeight < 150);
        var isMine = data.msg && data.msg.from === this.currentUserId;
        this.addMessageToView(data.msg);
        if (wasAtBottom || isMine) {
          this.scrollToBottom(true);
        } else {
          this._unreadBelow++;
        }
        this._updateScrollBtn();
        Shell.wsSend({type:'read', chat: data.chat, to: this.currentChat});
        if (data.msg.attachments && data.msg.attachments.length) this.loadProfileAttachments();
      }
      this.loadContacts();
    } else if (data.type === 'sent') {
      // Clean any upload loading indicator
      if (this._uploadTempId) {
        var ul = document.querySelector('.msg-row[data-msgid="'+this._uploadTempId+'"]');
        if (ul) ul.remove();
        this._uploadTempId = null;
      }
      // Update temp message with real ID
      if (data.msg && data.msg.id) {
        var selector = data.temp_id ? '.msg-row[data-msgid="'+data.temp_id+'"]' : '.msg-row[data-msgid^="temp_"]:last-child';
        var tempRow = document.querySelector(selector);
        if (!tempRow) {
          var tempRows = document.querySelectorAll('.msg-row[data-msgid^="temp_"]');
          if (tempRows.length > 0) tempRow = tempRows[tempRows.length - 1];
        }
        if (tempRow) {
          tempRow.setAttribute('data-msgid', data.msg.id);
          tempRow.setAttribute('data-from', data.msg.from);
          tempRow.setAttribute('data-time', data.msg.time);
          tempRow.setAttribute('data-text', this.escapeHtml(data.msg.text).replace(/"/g,'&quot;'));
          var ctxData = "'" + data.msg.id + "','" + data.msg.from + "'," + data.msg.time + ",'" + this.escapeAttr(data.msg.text) + "'";
          tempRow.setAttribute('oncontextmenu', 'Messenger.showCtxMenu(event,' + ctxData + ')');
        } else if (data.chat && this.currentChat) {
          // No temp row (forward/upload) — add if this chat and not already shown
          var expectedChat = this.getChatKey(this.currentUserId, this.currentChat);
          if (data.chat === expectedChat) {
            var existing = document.querySelector('.msg-row[data-msgid="'+data.msg.id+'"]');
            if (!existing) { this.addMessageToView(data.msg); this.scrollToBottom(true); }
          }
        }
      }
      this.loadContacts();
    }
    else if (data.type === 'typing') {
      if (this.currentChat && data.chat === this.getChatKey(this.currentUserId, this.currentChat)) {
        var el = document.getElementById('msgChatTyping');
        if (el) { el.innerHTML='<span class="msg-typing-dots"><span></span><span></span><span></span></span>'; clearTimeout(this._typingClear); this._typingClear=setTimeout(function(){el.textContent=''},3000); }
      }
    }
    else if (data.type === 'read' || data.type === 'read_confirm') {
      document.querySelectorAll('.msg-row.mine .msg-check').forEach(function(el){el.textContent='✓✓'});
      this.loadContacts();
    }
    else if (data.type === 'history') {
      if (data.offset > 0) { this._loadingMore = false; if (!data.messages || !data.messages.length) { this._hasMore = false; } }
      this.renderHistory(data.messages, data.offset > 0);
      // Check for pinned message
      if (data.pinned) this.showPinBar(data.pinned.msg_id, data.pinned.text);
      else this.showPinBar(null);
    }
    else if (data.type === 'pinned') { this.showPinBar(data.msg_id, data.text); }
    else if (data.type === 'unpinned') { this.showPinBar(null); }
    else if (data.type === 'contacts') { this.contacts = data.contacts; this.renderContacts(); }
    else if (data.type === 'reaction') {
      if (this.currentChat) {
        var expectedChat = this.getChatKey(this.currentUserId, this.currentChat);
        if (data.chat === expectedChat && data.msg_id && data.reactions !== undefined) {
          this._updateReactionInPlace(data.msg_id, data.reactions, data.chat);
        }
      }
    }
    else if (data.type === 'edited') {
      // Update message text in place
      if (this.currentChat && data.chat === this.getChatKey(this.currentUserId, this.currentChat)) {
        var row = document.querySelector('.msg-row[data-msgid="'+data.msg_id+'"]');
        if (row) {
          var textEl = row.querySelector('.msg-text');
          if (textEl) textEl.textContent = data.text;
          row.setAttribute('data-text', this.escapeHtml(data.text).replace(/"/g,'&quot;'));
        }
      }
    }
    else if (data.type === 'deleted') {
      if (this.currentChat && data.chat === this.getChatKey(this.currentUserId, this.currentChat)) {
        var row = document.querySelector('.msg-row[data-msgid="'+data.msg_id+'"]');
        if (row) row.remove();
        this.loadProfileAttachments();
      }
      this.loadContacts();
    }
    else if (data.type === 'chat_cleared') {
      if (this.currentChat && data.chat === this.getChatKey(this.currentUserId, this.currentChat)) {
        document.getElementById('msgMessages').innerHTML = '<div style="text-align:center;padding:40px;color:#bbb;font-size:13px">Начните диалог</div>';
        this.loadProfileAttachments();
      }
      this.loadContacts();
    }
  },

  getChatKey(a,b){return [a,b].sort().join('_')},
  loadContacts(){ Shell.wsSend({type:'contacts'}); },
  loadHistory(userId){
    this._msgOffset = 0;
    this._loadingMore = false;
    this._hasMore = true;
    var mel = document.getElementById('msgMessages');
    if (mel) mel.innerHTML = '';
    clearTimeout(this._skelTimer);
    this._skelTimer = setTimeout(function() {
      var el = document.getElementById('msgMessages');
      if (el && !el.querySelector('.msg-row')) el.innerHTML = '<div class="msg-skeleton">'
        + '<div class="msg-skel-row"><div class="msg-skel-bubble w40"></div></div>'
        + '<div class="msg-skel-row right"><div class="msg-skel-bubble w60"></div></div>'
        + '<div class="msg-skel-row"><div class="msg-skel-bubble w50"></div></div>'
        + '<div class="msg-skel-row right"><div class="msg-skel-bubble w40"></div></div>'
        + '</div>';
    }, 300);
    Shell.wsSend({type:'history', to: userId, offset: 0});
    Shell.wsSend({type:'read', chat: this.getChatKey(this.currentUserId, userId), to: userId});
  },
  getDisplayName(c){return c.display_name||c.username},
  filterContacts(q){var s=q.toLowerCase().trim();document.querySelectorAll('.msg-contact').forEach(function(el){el.classList.toggle('hidden',s&&!(el.getAttribute('data-search')||'').toLowerCase().includes(s))})},

  renderContacts() {
    var el=document.getElementById('msgContactList'),self=this;
    if(!el)return;
    this.contacts.forEach(function(c){if(c.avatar)Shell.cacheContact(c.id,c.avatar)});
    if(!this.contacts.length){el.innerHTML='<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:12px">Нет контактов</div>';return}
    el.innerHTML=this.contacts.map(function(c){
      var dn=self.getDisplayName(c);
      var ava=c.avatar?'<div class="msg-contact-ava"><img src="data:image/jpeg;base64,'+c.avatar+'"/></div>':'<div class="msg-contact-ava">'+dn.charAt(0).toUpperCase()+'</div>';
      var last='';
      if(c.last_msg){
        last=c.last_msg.text||'';
        if(!last && c.last_msg.attachments && c.last_msg.attachments.length>0){
          var atype=c.last_msg.attachments[0].type;
          if(atype==='image')last='📷 Фото';
          else if(atype==='video')last='🎬 Видео';
          else if(atype==='audio'){
            var aname = c.last_msg.attachments[0].name||'';
            last = aname.startsWith('voice_') ? '🎤 Голосовое' : '🎵 Аудио';
          }
          else last='📎 Файл';
        }
        
      }
      var ts='';if(c.last_msg){var d=new Date(c.last_msg.time*1000),now=new Date();ts=d.toDateString()===now.toDateString()?d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}
      var unread=c.unread>0?'<div class="msg-contact-unread">'+c.unread+'</div>':'';
      var active=self.currentChat===c.id?' active':'';
      var onlineClass = c.online ? ' online' : '';
      var pinIcon = c.pinned ? '<span class="ico ico-pin msg-contact-pin" style="width:10px;height:10px"></span>' : '';
      var muteIcon = c.muted ? '<span class="ico ico-mute msg-contact-mute" style="width:10px;height:10px"></span>' : '';
      return '<div class="msg-contact'+active+'" data-uid="'+c.id+'" data-search="'+(c.username+' '+dn).toLowerCase()+'" onclick="Messenger.openChat(\''+c.id+'\')" oncontextmenu="event.preventDefault();Messenger.showContactMenu(event,\''+c.id+'\')" ontouchstart="Messenger._cTouchStart(event,\''+c.id+'\')" ontouchend="Messenger._cTouchEnd()" ontouchmove="Messenger._cTouchEnd()">'
        +'<div class="msg-contact-ava-wrap">'+ava+(c.online?'<span class="msg-online-badge '+(c.status||'online')+'"></span>':'')+'</div>'
        +'<div class="msg-contact-info"><div class="msg-contact-name">'+dn+pinIcon+muteIcon+'</div><div class="msg-contact-last">'+(last||'<span style="opacity:0.4">нет сообщений</span>')+'</div></div>'
        +'<div class="msg-contact-meta">'+(ts?'<div class="msg-contact-time">'+ts+'</div>':'')+unread+'</div></div>';
    }).join('');
    // Update chat header online status if chat is open
    if (this.currentChat) {
      var cc = this.contacts.find(function(x){ return x.id === Messenger.currentChat; });
      if (cc) {
        var hDot = cc.online ? ' <span class="msg-online-dot-header '+(cc.status||'online')+'"></span>' : '';
        document.getElementById('msgChatName').innerHTML = this.escapeHtml(this.getDisplayName(cc)) + hDot;
        var hAva2 = document.getElementById('msgChatAva');
        if (hAva2) { var dn3=this.getDisplayName(cc); hAva2.innerHTML=cc.avatar?'<img src="data:image/jpeg;base64,'+cc.avatar+'"/>':dn3.charAt(0).toUpperCase(); }
      }
    }
  },

  openChat(userId) {
    // Handle forward: open chat, show bar, wait for send
    if (this.forwardPending) {
      var fwd = this.forwardPending;
      // Don't send yet — show forward bar in this chat, user confirms with send button
      var self = this;
      setTimeout(function() {
        var bar = document.getElementById('msgActionBar');
        if (bar) {
          bar.innerHTML = '<div class="msg-action-bar forward">'
            + '<div class="msg-action-bar-line forward"></div>'
            + '<div class="msg-action-bar-content"><div class="msg-action-bar-label">Переслать сообщение</div>'
            + '<div class="msg-action-bar-text">' + self.escapeHtml(fwd.preview || '') + '</div></div>'
            + '<button class="msg-action-bar-close" onclick="Messenger.cancelForward()">&times;</button></div>';
          bar.style.display = 'block';
        }
      }, 100);
      var banner = document.getElementById('msgForwardBanner');
      if (banner) banner.remove();
    }
    this.currentChat=userId; 
    Shell.activeChat=this.getChatKey(this.currentUserId,userId);
    var c=this.contacts.find(function(x){return x.id===userId});if(!c)return;
    var headerOnline = c.online ? ' <span class="msg-online-dot-header"></span>' : '';
    document.getElementById('msgChatName').innerHTML = this.escapeHtml(this.getDisplayName(c)) + headerOnline;
    var hAva = document.getElementById('msgChatAva');
    if (hAva) { var dn2=this.getDisplayName(c); hAva.innerHTML=c.avatar?'<img src="data:image/jpeg;base64,'+c.avatar+'"/>':dn2.charAt(0).toUpperCase(); }
    document.getElementById('msgChatTyping').textContent='';
    this.updateProfilePanel(c);
    document.getElementById('msgChatEmpty').style.display='none';
    document.getElementById('msgChatHeader').style.display='flex';
    document.getElementById('msgChatActive').style.display='block';
    document.getElementById('msgMessages').innerHTML = '';
    this.closeSearch();
    // Show skeleton only if history takes >300ms
    clearTimeout(this._skelTimer);
    this._skelTimer = setTimeout(function() {
      var el = document.getElementById('msgMessages');
      if (el && el.innerHTML === '') el.innerHTML = Messenger._skeleton();
    }, 500);
    document.getElementById('msgContacts').classList.add('mobile-hidden');
    document.getElementById('msgChat').classList.add('mobile-open');
    if (window.innerWidth <= 768) { var _sb = document.querySelector('.sidebar'); if (_sb) _sb.style.display = 'none'; document.getElementById('msgChat').style.bottom = '0'; }
    this.loadHistory(userId);
    if(Shell.wsReady)Shell.wsSend({type:'read',chat:this.getChatKey(this.currentUserId,userId)});
    // Clear unread locally immediately
    var cc = this.contacts.find(function(x){ return x.id === userId; });
    if (cc) cc.unread = 0;
    this.renderContacts();
    setTimeout(function(){var i=document.getElementById('msgInput');if(i)i.focus();Messenger._updateSendBtnColor();},100);
    Shell.unreadTotal=Math.max(0,Shell.unreadTotal-(c.unread||0));Shell.updateMsgBadge();
  },

  updateProfilePanel(c){
    var dn=this.getDisplayName(c);
    document.getElementById('msgProfileEmptyState').style.display='none';
    document.getElementById('msgProfileContent').style.display='flex';
    var a=document.getElementById('msgProfileAva');a.innerHTML=c.avatar?'<img src="data:image/jpeg;base64,'+c.avatar+'"/>':dn.charAt(0).toUpperCase();
    document.getElementById('msgProfileName').textContent=dn;
    document.getElementById('msgProfileUsername').textContent='@'+c.username;
    var rEl=document.getElementById('msgProfileRole');rEl.className='role-badge '+(c.role||'common');rEl.textContent=c.role?c.role.toUpperCase():'—';
    this._attachTab = 'image';
    document.querySelectorAll('.msg-profile-tab').forEach(function(t){ t.classList.toggle('active', t.dataset.tab === 'image'); });
    var grid = document.getElementById('msgProfileAttachGrid');
    if (grid) {
      grid.innerHTML = '';
      grid.style.display = 'grid';
      grid.style.flexDirection = '';
      grid.style.gridTemplateColumns = 'repeat(3,1fr)';
    }
    this.loadProfileAttachments();
  },
  toggleProfileMobile(){var p=document.getElementById('msgProfile');if(p)p.classList.toggle('mobile-open')},

  closeChat(){
    this.currentChat=null;Shell.activeChat=null;this.cancelEdit();this.clearPreview();this.cancelReply();this.closeSearch();
    document.getElementById('msgChatEmpty').style.display='flex';
    document.getElementById('msgChatHeader').style.display='none';
    document.getElementById('msgChatActive').style.display='none';
    document.getElementById('msgContacts').classList.remove('mobile-hidden');
    document.getElementById('msgChat').classList.remove('mobile-open');
    if (window.innerWidth <= 768) { var _sb = document.querySelector('.sidebar'); if (_sb) _sb.style.display = ''; document.getElementById('msgChat').style.bottom = ''; }
    document.getElementById('msgProfile').classList.remove('mobile-open');
    document.getElementById('msgProfileEmptyState').style.display='flex';
    document.getElementById('msgProfileContent').style.display='none';
    this.renderContacts();
  },

  async clearChat(){
    if(!this.currentChat)return;if(!confirm('Очистить всю переписку?'))return;
    var ck=this.getChatKey(this.currentUserId,this.currentChat);
    Shell.wsSend({type:'clear_chat', chat:ck});
    document.getElementById('msgMessages').innerHTML='<div style="text-align:center;padding:40px;color:#bbb;font-size:13px">Начните диалог</div>';
    Shell.toast('Чат очищен');
    this.loadContacts();
  },

  _getAvaHTML(msg){
    if(msg.from===this.currentUserId){if(this.currentUserAvatar)return '<img src="data:image/jpeg;base64,'+this.currentUserAvatar+'"/>';return (this.currentUserName||'?').charAt(0).toUpperCase()}
    var c=this.contacts.find(function(x){return x.id===msg.from});if(c&&c.avatar)return '<img src="data:image/jpeg;base64,'+c.avatar+'"/>';return (msg.from_name||'?').charAt(0).toUpperCase();
  },

  // ===== REACTIONS =====
  _getMiniAva(uid) {
    if (uid === this.currentUserId) {
      if (this.currentUserAvatar) return '<img src="data:image/jpeg;base64,' + this.currentUserAvatar + '"/>';
      return '<span>' + (this.currentUserName || '?').charAt(0).toUpperCase() + '</span>';
    }
    var c = this.contacts.find(function(x){ return x.id === uid; });
    if (c && c.avatar) return '<img src="data:image/jpeg;base64,' + c.avatar + '"/>';
    var name = c ? (c.display_name || c.username) : '?';
    return '<span>' + name.charAt(0).toUpperCase() + '</span>';
  },

  _renderReactions(m, side) {
    if (!m.reactions || !Object.keys(m.reactions).length) return '';
    var html = '<div class="msg-reactions">';
    for (var uid in m.reactions) {
      var emoji = m.reactions[uid];
      var isMine = uid === this.currentUserId;
      var capsuleClass = side === 'mine' ? 'on-mine' : 'on-theirs';
      var clickAttr = isMine ? ' onclick="event.stopPropagation();Messenger.toggleReaction(\'' + m.id + '\',\'' + emoji + '\')"' : '';
      html += '<div class="msg-reaction-capsule ' + capsuleClass + '"' + clickAttr + '>'
        + '<span class="msg-reaction-emoji">' + emoji + '</span>'
        + '<div class="msg-reaction-ava">' + this._getMiniAva(uid) + '</div>'
        + '</div>';
    }
    html += '</div>';
    return html;
  },

  async toggleReaction(msgId, emoji) {
    if (!this.currentChat) return;
    var ck = this.getChatKey(this.currentUserId, this.currentChat);
    Shell.wsSend({type:'react', chat:ck, msg_id:msgId, emoji:emoji});
  },

  _updateReactionInPlace(msgId, reactions, chatKey) {
    var row = document.querySelector('.msg-row[data-msgid="' + msgId + '"]');
    if (!row) return;
    var bubble = row.querySelector('.msg-bubble');
    if (!bubble) return;
    var side = row.classList.contains('mine') ? 'mine' : 'theirs';
    // Remove old reactions
    var oldReactions = bubble.querySelector('.msg-reactions');
    if (oldReactions) oldReactions.remove();
    // Build new reactions HTML (without animation class)
    if (reactions && Object.keys(reactions).length > 0) {
      var html = '<div class="msg-reactions">';
      for (var uid in reactions) {
        var emoji = reactions[uid];
        var isMine = uid === this.currentUserId;
        var capsuleClass = side === 'mine' ? 'on-mine' : 'on-theirs';
        var clickAttr = isMine ? ' onclick="event.stopPropagation();Messenger.toggleReaction(\'' + msgId + '\',\'' + emoji + '\')"' : '';
        html += '<div class="msg-reaction-capsule ' + capsuleClass + '"' + clickAttr + '>'
          + '<span class="msg-reaction-emoji">' + emoji + '</span>'
          + '<div class="msg-reaction-ava">' + this._getMiniAva(uid) + '</div>'
          + '</div>';
      }
      html += '</div>';
      bubble.insertAdjacentHTML('beforeend', html);
    }
  },

  // ===== CONTEXT MENU =====
  showCtxMenu(e, msgId, msgFrom, msgTime, msgText) {
    e.preventDefault(); e.stopPropagation();
    this.closeCtxMenu();
    var isMine = msgFrom === this.currentUserId;
    var age = Math.floor(Date.now()/1000) - msgTime;
    var canModify = isMine && age < this.TWO_DAYS;

    var menu = document.createElement('div');
    menu.className = 'msg-ctx-menu';

    // Top reactions bar
    var reactBar = '<div class="msg-ctx-reactions">';
    this.topReactions.forEach(function(em) {
      reactBar += '<span class="msg-ctx-react-btn" onclick="Messenger.toggleReaction(\'' + msgId + '\',\'' + em + '\');Messenger.closeCtxMenu()">' + em + '</span>';
    });
    reactBar += '<span class="msg-ctx-react-more" onclick="Messenger.showReactionPicker(\'' + msgId + '\')">+</span>';
    reactBar += '</div>';
    menu.innerHTML = reactBar;

    // Actions
    var actions = '<div class="msg-ctx-actions">';
    // Reply
    actions += '<div class="msg-ctx-action" onclick="Messenger.startReply(\'' + msgId + '\',\'' + this.escapeAttr(msgText) + '\',\'' + this.escapeAttr(msgFrom) + '\');Messenger.closeCtxMenu()"><span class="ico ico-14 ico-reply"></span> Ответить</div>';
    // Forward
    actions += '<div class="msg-ctx-action" onclick="Messenger.startForwardMsg(\'' + msgId + '\',\'' + this.escapeAttr(msgText) + '\',\'' + this.escapeAttr(msgFrom) + '\');Messenger.closeCtxMenu()"><span class="ico ico-14 ico-forward"></span> Переслать</div>';
    if (canModify) {
      actions += '<div class="msg-ctx-action" onclick="Messenger.startEdit(\'' + msgId + '\',\'' + this.escapeAttr(msgText) + '\');Messenger.closeCtxMenu()"><span class="ico ico-14 ico-pencil"></span> Изменить</div>';
      actions += '<div class="msg-ctx-action danger" onclick="Messenger.deleteMsg(\'' + msgId + '\');Messenger.closeCtxMenu()"><span class="ico ico-14 ico-trash"></span> Удалить</div>';
    }
    actions += '<div class="msg-ctx-action" onclick="Messenger.copyMsg(\'' + this.escapeAttr(msgText) + '\');Messenger.closeCtxMenu()"><span class="ico ico-14 ico-copy"></span> Копировать</div>';
    // Pin
    actions += '<div class="msg-ctx-action" onclick="Messenger.pinMsg(\'' + msgId + '\',\'' + this.escapeAttr(msgText) + '\');Messenger.closeCtxMenu()"><span class="ico ico-14 ico-pin"></span> Закрепить</div>';
    actions += '</div>';
    menu.innerHTML += actions;

    // Position near click/tap
    document.body.appendChild(menu);
    var x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 200);
    var y = (e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 200)) + 30;
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    if (x + mw > window.innerWidth) x = window.innerWidth - mw - 8;
    if (y + mh > window.innerHeight) y = y - mh - 60;
    if (x < 8) x = 8; if (y < 8) y = 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    this._ctxMenu = menu;

    // Full-screen reaction picker (hidden)
    var rpEl = document.getElementById('msgReactionPicker');
    if (rpEl) rpEl.remove();
  },

  showReactionPicker(msgId) {
    this.closeCtxMenu();
    var picker = document.createElement('div');
    picker.className = 'msg-reaction-picker-overlay';
    picker.id = 'msgReactionPicker';
    picker.onclick = function(e) { if (e.target === picker) picker.remove(); };
    var grid = '<div class="msg-reaction-picker">';
    this.emojis.forEach(function(em) {
      grid += '<span class="msg-reaction-picker-item" onclick="Messenger.toggleReaction(\'' + msgId + '\',\'' + em + '\');document.getElementById(\'msgReactionPicker\').remove()">' + em + '</span>';
    });
    grid += '</div>';
    picker.innerHTML = grid;
    document.body.appendChild(picker);
  },

  closeCtxMenu() {
    if (this._ctxMenu) { this._ctxMenu.remove(); this._ctxMenu = null; }
  },

  escapeAttr(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n'); },

  // ===== EDIT / DELETE / COPY =====
  startEdit(msgId, text) {
    this.editingMsgId = msgId;
    var input = document.getElementById('msgInput');
    input.value = text.replace(/\\n/g, '\n');
    input.focus();
    // Show edit bar
    var bar = document.getElementById('msgEditBar');
    if (bar) bar.style.display = 'flex';
  },

  cancelEdit() {
    this.editingMsgId = null;
    var input = document.getElementById('msgInput');
    if (input) input.value = '';
    var bar = document.getElementById('msgEditBar');
    if (bar) bar.style.display = 'none';
  },

  // ===== REPLY =====
  startReply(msgId, text, fromId) {
    this.cancelEdit(); this.cancelForward();
    var fromName = this._resolveUserName(fromId);
    var preview = text ? (text.length > 60 ? text.substring(0, 60) + '...' : text) : 'Вложение';
    this.replyTo = { msg_id: msgId, text: preview, from_name: fromName, from_id: fromId };
    var bar = document.getElementById('msgActionBar');
    if (bar) {
      bar.innerHTML = '<div class="msg-action-bar reply">'
        + '<div class="msg-action-bar-line reply"></div>'
        + '<div class="msg-action-bar-content"><div class="msg-action-bar-label">В ответ <b>' + this.escapeHtml(fromName) + '</b></div><div class="msg-action-bar-text">' + this.escapeHtml(preview) + '</div></div>'
        + '<button class="msg-action-bar-close" onclick="Messenger.cancelReply()">&times;</button></div>';
      bar.style.display = 'block';
    }
    var input = document.getElementById('msgInput');
    if (input) input.focus();
  },

  cancelReply() {
    this.replyTo = null;
    var bar = document.getElementById('msgActionBar');
    if (bar) { bar.innerHTML = ''; bar.style.display = 'none'; }
  },

  // ===== FORWARD =====
  startForwardMsg(msgId, text, fromId) {
    this.cancelEdit(); this.cancelReply();
    var fromName = this._resolveUserName(fromId);
    var preview = text ? (text.length > 60 ? text.substring(0, 60) + '...' : text) : 'Вложение';
    var chatKey = this.currentChat ? this.getChatKey(this.currentUserId, this.currentChat) : '';
    this.forwardPending = { type:'message', msgId:msgId, chatKey:chatKey, text:text, fromName:fromName, fromId:fromId, preview:preview };
    this._closeForForward();
    this._showForwardBanner(preview);
  },

  startForwardStatus(statusText) {
    this.cancelEdit(); this.cancelReply();
    this.forwardPending = { type: 'server_status', text: statusText, fromName: 'Серверы', preview: statusText.substring(0, 60) + '...' };
    Shell.switchModule('messenger');
    var self = this;
    setTimeout(function() {
      self._closeForForward();
      self._showForwardBanner(self.forwardPending.preview);
    }, 200);
  },

  _closeForForward() {
    // Close chat but keep forwardPending
    this.currentChat = null;
    Shell.activeChat = null;
    document.getElementById('msgChatEmpty').style.display='flex';
    document.getElementById('msgChatHeader').style.display='none';
    document.getElementById('msgChatActive').style.display='none';
    document.getElementById('msgContacts').classList.remove('mobile-hidden');
    document.getElementById('msgChat').classList.remove('mobile-open');
    if (window.innerWidth <= 768) { var _sb = document.querySelector('.sidebar'); if (_sb) _sb.style.display = ''; document.getElementById('msgChat').style.bottom = ''; }
    try { document.getElementById('msgProfile').classList.remove('mobile-open'); } catch(e){}
    this.renderContacts();
  },

  _showForwardBanner(preview) {
    var old = document.getElementById('msgForwardBanner');
    if (old) old.remove();
    var banner = document.createElement('div');
    banner.id = 'msgForwardBanner';
    banner.className = 'msg-forward-banner';
    banner.innerHTML = '<div class="msg-forward-banner-line"></div>'
      + '<div class="msg-forward-banner-content"><div class="msg-forward-banner-label">Переслать — выберите контакт</div>'
      + '<div class="msg-forward-banner-text">' + this.escapeHtml(preview) + '</div></div>'
      + '<button class="msg-forward-banner-close" onclick="Messenger.cancelForward()">&times;</button>';
    var contactsHead = document.querySelector('.msg-contacts-head');
    if (contactsHead) contactsHead.after(banner);
  },

  cancelForward() {
    this.forwardPending = null;
    var bar = document.getElementById('msgActionBar');
    if (bar) { bar.innerHTML = ''; bar.style.display = 'none'; }
    var banner = document.getElementById('msgForwardBanner');
    if (banner) banner.remove();
  },

  _resolveUserName(userId) {
    if (userId === this.currentUserId) return this.currentUserName || (Shell.user ? Shell.user.username : '');
    var c = this.contacts.find(function(x) { return x.id === userId; });
    return c ? (c.display_name || c.username) : userId;
  },

  async deleteMsg(msgId) {
    if (!this.currentChat) return;
    var ck = this.getChatKey(this.currentUserId, this.currentChat);
    Shell.wsSend({type:'delete', chat:ck, msg_id:msgId});
  },

  copyMsg(text) {
    text = text.replace(/\\n/g, '\n');
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    Shell.toast('Скопировано');
  },

  // ===== RENDER =====
  renderHistory(msgs, append) {
    var el = document.getElementById('msgMessages');
    if (!el) return;
    clearTimeout(this._skelTimer);
    if (!append) {
      if (!msgs || !msgs.length) {
        el.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb;font-size:13px">Начните диалог</div>';
        return;
      }
      // Hide → render → scroll → show (prevents flash at top)
      el.style.visibility = 'hidden';
      el.innerHTML = this._buildHTML(msgs);
      el.scrollTop = el.scrollHeight;
      el.style.visibility = '';
      el.classList.add('msg-fade-in');
      setTimeout(function(){el.classList.remove('msg-fade-in')},200);
      // Scroll-to-top for loading older messages
      this._msgOffset = msgs.length;
      var self = this;
      el.onscroll = function() {
        if (el.scrollTop < 80 && !self._loadingMore && self._hasMore && self.currentChat) {
          self._loadingMore = true;
          self._msgOffset += 50;
          Shell.wsSend({type:'history', to: self.currentChat, offset: self._msgOffset});
        }
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) self._unreadBelow = 0;
        self._updateScrollBtn();
      };
      this._unreadBelow = 0;
      this._updateScrollBtn();
    } else {
      if (!msgs || !msgs.length) return;
      el.insertAdjacentHTML('afterbegin', this._buildHTML(msgs));
    }
  },

  _buildHTML(msgs) {
    var html = '', lastDate = '', lastFrom = null, lastTime = 0;
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i], d = new Date(m.time * 1000);
      var dateStr = d.toLocaleDateString('ru-RU', {day:'numeric', month:'long'});
      if (dateStr !== lastDate) { html += '<div class="msg-date-sep">' + dateStr + '</div>'; lastDate = dateStr; lastFrom = null; lastTime = 0; }
      var mine = m.from === this.currentUserId, side = mine ? 'mine' : 'theirs';
      var gap = m.time - lastTime, isNew = (m.from !== lastFrom || gap > this.GROUP_GAP);
      var isEnd = true;
      if (i+1 < msgs.length) { var nx = msgs[i+1]; var nxD = new Date(nx.time*1000).toLocaleDateString('ru-RU',{day:'numeric',month:'long'}); if(nx.from===m.from && nxD===dateStr && (nx.time-m.time)<=this.GROUP_GAP) isEnd=false; }

      var avaHtml = '<div class="msg-row-ava' + (isNew ? '' : ' hidden') + '">' + this._getAvaHTML(m) + '</div>';
      var sender = (!mine && isNew) ? '<div class="msg-bubble-sender">' + this.escapeHtml(m.from_name || '') + '</div>' : '';
      var editedMark = m.edited ? ' <span class="msg-edited">ред.</span>' : '';
      var reactions = this._renderReactions(m, side);
      var timeHtml = '';
      if (isEnd) { var ts = d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}); var chk = mine ? ' <span class="msg-check">'+(m.read?'✓✓':'✓')+'</span>' : ''; timeHtml = '<div class="msg-group-time">'+ts+editedMark+chk+'</div>'; }

      // Context menu: right-click or long-press
      var ctxData = "'" + m.id + "','" + m.from + "'," + m.time + ",'" + this.escapeAttr(m.text) + "'";
      var ctxAttr = ' oncontextmenu="Messenger.showCtxMenu(event,' + ctxData + ')"';

      html += '<div class="msg-row ' + side + (isEnd ? ' group-end' : '') + '"' + ctxAttr + ' data-msgid="' + m.id + '" data-from="' + m.from + '" data-time="' + m.time + '" data-text="' + this.escapeHtml(m.text).replace(/"/g,'&quot;') + '">'
        + avaHtml
        + '<div class="msg-content">' + sender + this._renderForwardHeader(m) + this._renderReplyBlock(m) + this._renderAttachments(m)
        + (m.text ? '<div class="msg-bubble ' + side + '"><div class="msg-text">' + this.formatText(m.text) + '</div>' + reactions + '</div>' : (reactions ? '<div class="msg-reactions-standalone">' + reactions + '</div>' : ''))
        + '</div>'
        + timeHtml + '</div>';
      lastFrom = m.from; lastTime = m.time;
    }
    return html;
  },

  addMessageToView(m) {
    var el = document.getElementById('msgMessages'); if (!el) return;
    var empty = el.querySelector('div[style*="text-align:center"]');
    if (empty && empty.textContent.includes('Начните')) empty.remove();
    var mine = m.from === this.currentUserId, side = mine ? 'mine' : 'theirs';
    var lastRow = el.querySelector('.msg-row:last-child'), isNew = true;
    if (lastRow && lastRow.classList.contains(side)) {
      isNew = false;
      var pt = lastRow.querySelector('.msg-group-time'); if (pt) pt.remove();
      lastRow.classList.remove('group-end');
    }
    var avaHtml = '<div class="msg-row-ava' + (isNew ? '' : ' hidden') + '">' + this._getAvaHTML(m) + '</div>';
    var sender = (!mine && isNew) ? '<div class="msg-bubble-sender">' + this.escapeHtml(m.from_name || '') + '</div>' : '';
    var ts = new Date(m.time*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    var chk = mine ? ' <span class="msg-check">✓</span>' : '';
    var ctxData = "'" + m.id + "','" + m.from + "'," + m.time + ",'" + this.escapeAttr(m.text) + "'";
    var escText = this.escapeHtml(m.text).replace(/"/g,'&quot;');
    el.insertAdjacentHTML('beforeend', '<div class="msg-row '+side+' group-end" oncontextmenu="Messenger.showCtxMenu(event,'+ctxData+')" data-msgid="'+m.id+'" data-from="'+m.from+'" data-time="'+m.time+'" data-text="'+escText+'">'
      +avaHtml+'<div class="msg-content">'+sender+this._renderForwardHeader(m)+this._renderReplyBlock(m)+this._renderAttachments(m)
      +(m.text?'<div class="msg-bubble '+side+'"><div class="msg-text">'+this.escapeHtml(m.text)+'</div></div>':'')
      +'</div>'
      +'<div class="msg-group-time">'+ts+chk+'</div></div>');
  },

  scrollToBottom(force) {
    var el = document.getElementById('msgMessages'); if (!el) return;
    if (force || el.scrollHeight - el.scrollTop - el.clientHeight < 150)
      setTimeout(function(){ el.scrollTop = el.scrollHeight; }, 30);
  },

  _unreadBelow: 0,
  scrollToLatest() {
    var el = document.getElementById('msgMessages'); if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    this._unreadBelow = 0;
    this._updateScrollBtn();
  },

  _updateScrollBtn() {
    var el = document.getElementById('msgMessages');
    var btn = document.getElementById('msgScrollBtn');
    if (!el || !btn) return;
    var visible = (el.scrollHeight - el.scrollTop - el.clientHeight) > 120;
    btn.classList.toggle('visible', visible);
    var badge = document.getElementById('msgScrollBadge');
    if (badge) {
      if (visible && this._unreadBelow > 0) {
        badge.textContent = this._unreadBelow > 99 ? '99+' : this._unreadBelow;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  },

  send() {
    var input = document.getElementById('msgInput');
    var text = input.value.trim();
    var hasFiles = this.pendingFiles.length > 0;
    if (!text && !hasFiles && !this.forwardPending) return;
    if (!this.currentChat) return;

    // Edit mode
    if (this.editingMsgId) {
      var ck = this.getChatKey(this.currentUserId, this.currentChat);
      Shell.wsSend({type:'edit', chat:ck, msg_id:this.editingMsgId, text:text});
      this.cancelEdit();
      return;
    }

    // Forward mode
    if (this.forwardPending) {
      var fwd = this.forwardPending;
      if (fwd.type === 'message' && fwd.msgId) {
        // Forward via server (copies attachments)
        Shell.wsSend({type:'forward', to:this.currentChat, from_chat:fwd.chatKey, msg_id:fwd.msgId, extra_text:text});
      } else {
        // Server status or text-only forward
        if (navigator.vibrate) navigator.vibrate(10);
    Shell.wsSend({type:'send', to:this.currentChat, text:fwd.text + (text ? '\n\n' + text : ''),
          forwarded_from: {name: fwd.fromName, id: fwd.fromId || ''}});
      }
      this.cancelForward();
      input.value = ''; input.style.height = 'auto'; this._updateSendBtnColor();
      return;
    }

    input.value = ''; input.style.height = 'auto'; this._updateSendBtnColor();

    // Build extra data
    var extra = {};
    if (this.replyTo) {
      extra.reply_to = this.replyTo;
      this.cancelReply();
    }
    if (this.forwardPending) {
      extra.forwarded_from = {name: this.forwardPending.fromName, id: this.forwardPending.fromId || ''};
      // Prepend forwarded text
      text = this.forwardPending.text + (text ? '\n\n' + text : '');
      this.cancelForward();
    }

    if (hasFiles) {
      this._uploadAndSend(this.currentChat, text, this.pendingFiles.slice(), extra);
      this.clearPreview();
    } else {
      var tempId = 'temp_'+Date.now();
      var msg = { id:tempId, from:this.currentUserId, from_name:this.currentUserName||(Shell.user?Shell.user.username:''), text:text, time:Math.floor(Date.now()/1000), read:false };
      if (extra.reply_to) msg.reply_to = extra.reply_to;
      if (extra.forwarded_from) msg.forwarded_from = extra.forwarded_from;
      this.addMessageToView(msg);
      this.scrollToBottom(true);
      var wsMsg = {type:'send', to:this.currentChat, text:text, temp_id:tempId};
      if (extra.reply_to) wsMsg.reply_to = extra.reply_to;
      if (extra.forwarded_from) wsMsg.forwarded_from = extra.forwarded_from;
      if (navigator.vibrate) navigator.vibrate(10);
      Shell.wsSend(wsMsg);
    }
  },

  _uploadAndSend(toId, text, files, extra) {
    var tempId = 'temp_'+Date.now();
    this._uploadTempId = tempId;
    // Show what's being uploaded
    var fnames = files.map(function(f){return f.file.name}).join(', ');
    if (fnames.length > 35) fnames = fnames.substring(0,33) + '...';
    var el = document.getElementById('msgMessages');
    if (el) {
      var fileIconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path></svg>';
      el.insertAdjacentHTML('beforeend',
        '<div class="msg-row mine group-end msg-anim" data-msgid="'+tempId+'">'
        + '<div class="msg-content"><div class="msg-upload-card">'
        + '<div class="msg-upload-icon">'+fileIconSvg+'</div>'
        + '<div class="msg-upload-body">'
        + '<div class="msg-upload-name-row"><span class="msg-upload-name">'+Messenger.escapeHtml(fnames)+'</span><span class="msg-upload-pct" id="'+tempId+'_pct">0%</span></div>'
        + '<div class="msg-upload-track"><div class="msg-upload-fill" id="'+tempId+'_fill" style="width:0%"></div></div>'
        + '<div class="msg-upload-meta">загрузка…</div>'
        + '</div>'
        + '<button class="msg-upload-action"><svg class="msg-loading-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></button>'
        + '</div></div></div>');
      this.scrollToBottom(true);
    }
    var fd = new FormData();
    fd.append('to', toId);
    fd.append('text', text || '');
    files.forEach(function(f) { fd.append('files', f.file, f.file.name); });

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/msg/upload');
    xhr.setRequestHeader('Authorization', 'Bearer ' + Shell.token);
    var self = this;
    xhr.onload = function() {
      self._uploadTempId = null;
      var tempRow = document.querySelector('.msg-row[data-msgid="'+tempId+'"]');
      if (tempRow) tempRow.remove();
      if (xhr.status === 200) {
        try {
          var resp = JSON.parse(xhr.responseText);
          if (resp.msg) {
            var dup = document.querySelector('.msg-row[data-msgid="'+resp.msg.id+'"]');
            if (!dup) { self.addMessageToView(resp.msg); self.scrollToBottom(true); }
          }
        } catch(e) {}
        self.loadContacts();
      } else {
        try { var r=JSON.parse(xhr.responseText); Shell.toast(r.error||'Ошибка','error'); }
        catch(e) { Shell.toast('Ошибка: '+xhr.status,'error'); }
      }
    };
    xhr.upload.onprogress = function(e) {
      if (!e.lengthComputable) return;
      var pct = Math.round(e.loaded / e.total * 100);
      var pctEl = document.getElementById(tempId+'_pct');
      var fillEl = document.getElementById(tempId+'_fill');
      if (pctEl) pctEl.textContent = pct + '%';
      if (fillEl) fillEl.style.width = pct + '%';
    };
    xhr.onerror = function() {
      var tempRow = document.querySelector('.msg-row[data-msgid="'+tempId+'"]');
      if (tempRow) tempRow.remove();
      Shell.toast('Ошибка соединения','error');
    };
    xhr.send(fd);
  },

  onTyping(){
    if(!this.currentChat)return;
    var now=Date.now();
    // Send immediately if >1s since last typing event, otherwise skip
    if(!this._lastTypingSent || now-this._lastTypingSent>1000){
      this._lastTypingSent=now;
      Shell.wsSend({type:'typing',to:this.currentChat});
    }
  },
  autoResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px'},
  buildEmojiPicker(){var el=document.getElementById('msgEmojiPicker');if(!el)return;el.innerHTML=this.emojis.map(function(e){return'<div class="msg-emoji-item" onclick="Messenger.insertEmoji(\''+e+'\')">'+e+'</div>'}).join('')},
  toggleEmoji(){
    var el=document.getElementById('msgEmojiPicker');if(!el)return;
    this.emojiOpen=!this.emojiOpen;
    el.style.display=this.emojiOpen?'grid':'none';
  },
  insertEmoji(emoji){var i=document.getElementById('msgInput');if(!i)return;i.value+=emoji;i.focus();this.autoResize(i);this._updateSendBtnColor()},



  escapeHtml(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML},

  formatText(text) {
    var s = this.escapeHtml(text);
    // URLs → clickable links
    s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="msg-link">$1</a>');
    return s;
  },

  // ===== ATTACHMENTS =====
  pickFiles() {
    var inp = document.getElementById('msgFileInput');
    if (inp) { inp.value = ''; inp.click(); }
  },

  onFilesSelected(input) {
    if (input.files.length > 0) this.addFiles(input.files);
    input.value = '';
  },

  addFiles(fileList) {
    var IMG = /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)$/i;
    var AUD = /\.(mp3|ogg|wav|m4a|aac|wma|flac)$/i;
    var VID = /\.(mp4|mov|avi|mkv|webm|3gp)$/i;
    var FIL = /\.(pdf|doc|docx|xls|xlsx|zip|rar|txt|csv|pptx|json|xml)$/i;
    var newFiles = Array.from(fileList);
    var self = this;
    // Count existing
    var curImg = this.pendingFiles.filter(function(f){return f.mediaType==='image'}).length;
    var curVid = this.pendingFiles.filter(function(f){return f.mediaType==='video'}).length;
    var curAud = this.pendingFiles.filter(function(f){return f.mediaType==='audio'}).length;
    var curFil = this.pendingFiles.filter(function(f){return f.mediaType==='file'}).length;

    newFiles.forEach(function(file) {
      var isImg=IMG.test(file.name), isAud=AUD.test(file.name), isVid=VID.test(file.name), isFil=FIL.test(file.name);
      var unsupported = !isImg && !isAud && !isVid && !isFil;
      var mediaType = isImg?'image':isVid?'video':isAud?'audio':isFil?'file':'unknown';

      // Validation
      if (isAud && (curImg>0||curVid>0||curFil>0||curAud>=1)) { Shell.toast('Аудио отправляется отдельно (макс 1)','error'); return; }
      if (isVid && (curAud>0||curFil>0||curVid>=1)) { Shell.toast('Макс 1 видео','error'); return; }
      if (isVid && file.size > 50*1024*1024) { Shell.toast('Видео макс 50 МБ','error'); return; }
      if (isImg && (curAud>0||curFil>0)) { Shell.toast('Фото нельзя с файлами или аудио','error'); return; }
      if (isImg && curImg>=6) { Shell.toast('Макс 6 фото','error'); return; }
      if (isFil && (curImg>0||curVid>0||curAud>0)) { Shell.toast('Файлы отправляются отдельно','error'); return; }
      if (!isVid && file.size > 10*1024*1024) { Shell.toast('Макс 10 МБ: '+file.name,'error'); return; }

      var entry = { file:file, isImage:isImg, mediaType:mediaType, preview:null, unsupported:unsupported };
      if (isImg) {
        var reader = new FileReader();
        reader.onload = function(e) { entry.preview = e.target.result; self._renderPreview(); };
        reader.readAsDataURL(file);
      }
      if (isVid) {
        entry.preview = '🎬';
      }
      self.pendingFiles.push(entry);
      if(isImg)curImg++; if(isVid)curVid++; if(isAud)curAud++; if(isFil)curFil++;
    });
    this._renderPreview();
    this._updateSendBtn();
  },

  _renderPreview() {
    var el = document.getElementById('msgAttachPreview');
    if (!el) return;
    if (this.pendingFiles.length === 0) { el.style.display = 'none'; this._updateSendBtn(); return; }
    el.style.display = 'flex';
    var X = '<button class="msg-attach-remove" title="Убрать" onclick="Messenger.removeFile(IDX)"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    var fileIcon = '<div class="msg-attach-file-icon-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>';
    var html = '';
    this.pendingFiles.forEach(function(f, i) {
      var x = X.replace('IDX', i);
      var unsupportedClass = f.unsupported ? ' unsupported' : '';
      if (f.isImage && f.preview) {
        html += '<div class="msg-attach-item'+unsupportedClass+'"><div class="msg-attach-item-inner"><img src="'+f.preview+'"/></div>'+x+'</div>';
      } else {
        // File chip — horizontal layout with icon + name + size
        var name, meta;
        if (f.unsupported) {
          name = f.file.name; meta = 'не поддерж.';
        } else if (f.mediaType === 'video') {
          name = f.file.name; meta = 'Видео · ' + Messenger._fmtSize(f.file.size);
        } else if (f.mediaType === 'audio') {
          name = f.file.name; meta = 'Аудио · ' + Messenger._fmtSize(f.file.size);
        } else {
          name = f.file.name; meta = Messenger._fmtSize(f.file.size);
        }
        html += '<div class="msg-attach-item msg-attach-is-file'+unsupportedClass+'">'+fileIcon
          + '<div class="msg-attach-file-meta"><div class="msg-attach-fname">'+Messenger.escapeHtml(name)+'</div>'
          + '<div class="msg-attach-fsize">'+Messenger.escapeHtml(meta)+'</div></div>'+x+'</div>';
      }
    });
    el.innerHTML = html;
  },

  removeFile(idx) {
    this.pendingFiles.splice(idx, 1);
    this._renderPreview();
    this._updateSendBtn();
  },

  _updateSendBtn() {
    var btn = document.querySelector('.msg-send-btn');
    if (!btn) return;
    var hasUnsupported = this.pendingFiles.some(function(f){ return f.unsupported; });
    btn.disabled = hasUnsupported;
    btn.style.opacity = hasUnsupported ? '0.3' : '1';
    btn.style.pointerEvents = hasUnsupported ? 'none' : 'auto';
    this._updateSendBtnColor();
  },

  clearPreview() {
    this.pendingFiles = [];
    var el = document.getElementById('msgAttachPreview');
    if (el) { el.innerHTML = ''; el.style.display = 'none'; }
  },

  _renderReplyBlock(m) {
    if (!m.reply_to) return '';
    var name = m.reply_to.from_name || '';
    var text = m.reply_to.text || 'Сообщение удалено';
    var msgId = m.reply_to.msg_id || '';
    return '<div class="msg-reply-block" onclick="Messenger.scrollToMsg(\'' + msgId + '\')">'
      + '<div class="msg-reply-line"></div>'
      + '<div class="msg-reply-content"><div class="msg-reply-name">' + this.escapeHtml(name) + '</div>'
      + '<div class="msg-reply-text">' + this.escapeHtml(text) + '</div></div></div>';
  },

  _renderForwardHeader(m) {
    if (!m.forwarded_from) return '';
    var name = m.forwarded_from.name || '';
    return '<div class="msg-forward-header">'
      + '<span class="ico" style="width:12px;height:12px;-webkit-mask-image:url(/svg/forward.svg);mask-image:url(/svg/forward.svg)"></span>'
      + ' Переслано от <span class="msg-forward-name">' + this.escapeHtml(name) + '</span></div>';
  },

  scrollToMsg(msgId) {
    var el = document.querySelector('.msg-row[data-msgid="' + msgId + '"]');
    if (el) {
      el.scrollIntoView({behavior:'smooth', block:'center'});
      el.classList.add('msg-highlight');
      setTimeout(function(){ el.classList.remove('msg-highlight'); }, 1500);
    }
  },

  goToAttachMsg(msgId) {
    var p = document.getElementById('msgProfile');
    if (p) p.classList.remove('mobile-open');
    setTimeout(function() { Messenger.scrollToMsg(msgId); }, 200);
  },

  playAudioFromProfile(attId) {
    if (this._activeAudioId === attId && this._activeAudio) {
      if (this._activeAudio.paused) this._activeAudio.play();
      else this._activeAudio.pause();
      return;
    }
    this._stopAudio();
    var audio = new Audio('/api/msg/file/' + attId);
    this._activeAudio = audio;
    this._activeAudioId = attId;
    audio.play();
    audio.onended = function() { Messenger._activeAudio = null; Messenger._activeAudioId = null; };
  },

  // ===== SEARCH =====
  _searchMatches: [],
  _searchIdx: -1,

  toggleSearch() {
    var wrap = document.getElementById('msgSearchWrap');
    if (!wrap) return;
    if (wrap.classList.contains('open')) { this.closeSearch(); }
    else {
      wrap.classList.add('open');
      var inp = document.getElementById('msgSearchInput');
      if (inp) { inp.focus(); inp.select(); }
    }
  },

  closeSearch() {
    var wrap = document.getElementById('msgSearchWrap');
    if (wrap) wrap.classList.remove('open');
    var input = document.getElementById('msgSearchInput');
    if (input) input.value = '';
    var cnt = document.getElementById('msgSearchCount');
    if (cnt) { cnt.textContent = ''; cnt.className = 'msg-search-count'; }
    document.querySelectorAll('.msg-row.search-hidden').forEach(function(r) { r.classList.remove('search-hidden'); });
    document.querySelectorAll('.msg-date-sep').forEach(function(s) { s.style.display = ''; });
    this._searchMatches = []; this._searchIdx = -1;
  },

  onSearch(query) {
    var q = query.trim().toLowerCase();
    var cnt = document.getElementById('msgSearchCount');
    if (!q) {
      document.querySelectorAll('.msg-row.search-hidden').forEach(function(r){ r.classList.remove('search-hidden'); });
      document.querySelectorAll('.msg-date-sep').forEach(function(s){ s.style.display=''; });
      if (cnt) { cnt.textContent = ''; cnt.className = 'msg-search-count'; }
      this._searchMatches = []; this._searchIdx = -1;
      return;
    }
    var rows = document.querySelectorAll('.msg-row[data-msgid]');
    var matches = [];
    rows.forEach(function(r) {
      var text = (r.getAttribute('data-text') || '').toLowerCase();
      if (text.includes(q)) { r.classList.remove('search-hidden'); matches.push(r); }
      else { r.classList.add('search-hidden'); }
    });
    document.querySelectorAll('.msg-date-sep').forEach(function(sep) {
      var next = sep.nextElementSibling, vis = false;
      while (next && !next.classList.contains('msg-date-sep')) {
        if (next.classList.contains('msg-row') && !next.classList.contains('search-hidden')) vis = true;
        next = next.nextElementSibling;
      }
      sep.style.display = vis ? '' : 'none';
    });
    this._searchMatches = matches;
    this._searchIdx = matches.length ? 0 : -1;
    if (cnt) { cnt.textContent = matches.length ? '1/'+matches.length : '0'; cnt.className = 'msg-search-count'+(matches.length?' has-results':''); }
    this._highlightSearchMatch();
  },

  _highlightSearchMatch() {
    var cur = this._searchMatches[this._searchIdx];
    if (cur) { cur.scrollIntoView({behavior:'smooth', block:'center'}); }
    var cnt = document.getElementById('msgSearchCount');
    if (cnt && this._searchMatches.length) cnt.textContent = (this._searchIdx+1)+'/'+this._searchMatches.length;
  },

  searchNext() {
    if (!this._searchMatches.length) return;
    this._searchIdx = (this._searchIdx + 1) % this._searchMatches.length;
    this._highlightSearchMatch();
  },

  searchPrev() {
    if (!this._searchMatches.length) return;
    this._searchIdx = (this._searchIdx - 1 + this._searchMatches.length) % this._searchMatches.length;
    this._highlightSearchMatch();
  },

  // ===== PIN =====
  pinMsg(msgId, text) {
    if (!this.currentChat) return;
    var ck = this.getChatKey(this.currentUserId, this.currentChat);
    Shell.wsSend({type:'pin', chat:ck, msg_id:msgId, text:text});
  },

  unpinMsg() {
    if (!this.currentChat) return;
    var ck = this.getChatKey(this.currentUserId, this.currentChat);
    Shell.wsSend({type:'unpin', chat:ck});
  },

  showPinBar(msgId, text) {
    var bar = document.getElementById('msgPinBar');
    if (!bar) return;
    if (!msgId) { bar.style.display = 'none'; return; }
    this._pinnedMsgId = msgId;
    var preview = text && text.length > 50 ? text.substring(0, 50) + '...' : (text || '');
    document.getElementById('msgPinText').textContent = preview;
    bar.style.display = 'flex';
  },

  scrollToPinned() {
    if (this._pinnedMsgId) this.scrollToMsg(this._pinnedMsgId);
  },

  // ===== CONTACT CONTEXT MENU =====
  showContactMenu(e, contactId) {
    e.preventDefault(); e.stopPropagation();
    this.closeCtxMenu();
    var c = this.contacts.find(function(x) { return x.id === contactId; });
    if (!c) return;
    var menu = document.createElement('div');
    menu.className = 'msg-ctx-menu';
    menu.id = 'msgContactCtx';
    var dn = this.getDisplayName(c);
    var html = '<div class="msg-ctx-actions">';
    // Pin/Unpin
    if (c.pinned) {
      html += '<div class="msg-ctx-action" onclick="Messenger.unpinContact(\'' + contactId + '\')"><span class="ico ico-14 ico-close"></span> Открепить</div>';
    } else {
      html += '<div class="msg-ctx-action" onclick="Messenger.pinContact(\'' + contactId + '\')"><span class="ico ico-14 ico-pin"></span> Закрепить</div>';
    }
    // Mute/Unmute
    if (c.muted) {
      html += '<div class="msg-ctx-action" onclick="Messenger.unmuteContact(\'' + contactId + '\')"><span class="ico ico-14 ico-unmute"></span> Включить уведомления</div>';
    } else {
      html += '<div class="msg-ctx-action" onclick="Messenger.muteContact(\'' + contactId + '\')"><span class="ico ico-14 ico-mute"></span> Выключить уведомления</div>';
    }
    // Clear chat
    html += '<div class="msg-ctx-action danger" onclick="Messenger.confirmClearChat(\'' + contactId + '\',\'' + this.escapeAttr(dn) + '\')"><span class="ico ico-14 ico-trash"></span> Очистить чат</div>';
    html += '</div>';
    menu.innerHTML = html;
    document.body.appendChild(menu);
    // Position
    var x = e.clientX || (e.touches && e.touches[0].clientX) || 100;
    var y = (e.clientY || (e.touches && e.touches[0].clientY) || 100) + 30;
    menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 180) + 'px';
    this._ctxMenu = menu;
    var self = this;
    setTimeout(function() {
      document.addEventListener('click', function once() { self.closeCtxMenu(); document.removeEventListener('click', once); });
    }, 10);
  },

  pinContact(id) { Shell.wsSend({type:'pin_contact', contact_id:id}); this.closeCtxMenu(); },
  unpinContact(id) { Shell.wsSend({type:'unpin_contact', contact_id:id}); this.closeCtxMenu(); },
  muteContact(id) { Shell.wsSend({type:'mute_contact', contact_id:id}); this.closeCtxMenu(); },
  unmuteContact(id) { Shell.wsSend({type:'unmute_contact', contact_id:id}); this.closeCtxMenu(); },

  _cTouchStart(e, contactId) {
    var self = this;
    this._cTouchTimer = setTimeout(function() {
      self._cTouchFired = true;
      window.getSelection().removeAllRanges();
      if (navigator.vibrate) navigator.vibrate(30);
      self.showContactMenu(e, contactId);
    }, 500);
    this._cTouchFired = false;
  },
  _cTouchEnd() {
    clearTimeout(this._cTouchTimer);
    if (this._cTouchFired) { this._cTouchFired = false; }
  },

  confirmClearChat(contactId, name) {
    this.closeCtxMenu();
    var ck = this.getChatKey(this.currentUserId, contactId);
    this._clearTarget = {contactId: contactId, chatKey: ck};
    // Show confirmation overlay
    var old = document.getElementById('msgClearConfirm');
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.id = 'msgClearConfirm';
    overlay.className = 'msg-confirm-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = '<div class="msg-confirm-box">'
      + '<div class="msg-confirm-title">Очистить чат?</div>'
      + '<div class="msg-confirm-text">Вся история сообщений с <b>' + this.escapeHtml(name) + '</b> будет удалена.</div>'
      + '<div class="msg-confirm-actions">'
      + '<button class="msg-confirm-btn cancel" onclick="this.closest(\'.msg-confirm-overlay\').remove()">Отмена</button>'
      + '<button class="msg-confirm-btn danger" onclick="Messenger.doClearChat()">Очистить</button>'
      + '</div></div>';
    document.body.appendChild(overlay);
  },

  doClearChat() {
    var t = this._clearTarget;
    if (!t) return;
    Shell.wsSend({type:'clear_chat', chat:t.chatKey});
    this._clearTarget = null;
    var overlay = document.getElementById('msgClearConfirm');
    if (overlay) overlay.remove();
    if (this.currentChat === t.contactId) {
      document.getElementById('msgMessages').innerHTML = '<div style="text-align:center;padding:40px;color:#bbb;font-size:13px">Начните диалог</div>';
    }
    Shell.toast('Чат очищен');
  },

  _renderAttachments(m) {
    if (!m.attachments || m.attachments.length === 0) return '';
    var html = '';
    var images = m.attachments.filter(function(a){ return a.type === 'image'; });
    var videos = m.attachments.filter(function(a){ return a.type === 'video'; });
    var audios = m.attachments.filter(function(a){ return a.type === 'audio'; });
    var files = m.attachments.filter(function(a){ return a.type === 'file'; });
    // Images + videos grid
    if (images.length > 0 || videos.length > 0) {
      html += '<div class="msg-att-grid">';
      images.forEach(function(a) {
        var src = a._localUrl || '/api/msg/file/' + a.id + '/thumb';
        var full = '/api/msg/file/' + a.id;
        html += '<div class="msg-att-thumb" onclick="Messenger.openGallery(\''+full+'\')"><img src="'+src+'" loading="lazy"/></div>';
      });
      videos.forEach(function(a) {
        var thumb = '/api/msg/file/' + a.id + '/thumb';
        var dur = a.duration ? Messenger._fmtDuration(a.duration) : '';
        html += '<div class="msg-att-thumb msg-att-video" onclick="Messenger.playVideo(\''+a.id+'\')" data-vid="'+a.id+'">'
          + '<img src="'+thumb+'" loading="lazy"/>'
          + '<div class="msg-video-overlay"><div class="msg-video-play">▶</div>'+(dur?'<span class="msg-video-dur">'+dur+'</span>':'')+'</div></div>';
      });
      html += '</div>';
    }
    // Audio
    audios.forEach(function(a) {
      var dur = a.duration ? Messenger._fmtDuration(a.duration) : '0:00';
      var isVoice = a.name && a.name.startsWith('voice_');
      var name = isVoice ? 'Голосовое сообщение' : (a.name ? a.name.replace(/\.[^.]+$/, '') : '');
      if (name.length > 30) name = name.substring(0, 28) + '...';
      var btn = '<button class="msg-audio-btn" onclick="event.stopPropagation();Messenger.playAudio(this,\''+a.id+'\')"><span class="msg-audio-icon">'+Messenger._playIco+'</span></button>';
      if (isVoice) {
        html += '<div class="msg-audio-player msg-voice" data-aid="'+a.id+'" data-dur="'+(a.duration||0)+'">'
          + btn
          + '<div class="msg-audio-wave" data-aid="'+a.id+'" onclick="event.stopPropagation();Messenger.seekAudio(event,\''+a.id+'\')">'
          + Messenger._buildWaveBars(36, 0, 'var(--accent)', 'var(--border)') + '</div>'
          + '<span class="msg-audio-time" data-aid="'+a.id+'">'+dur+'</span>'
          + '</div>';
      } else {
        html += '<div class="msg-audio-player" data-aid="'+a.id+'" data-dur="'+(a.duration||0)+'">'
          + btn
          + '<div class="msg-audio-info">'
          + '<div class="msg-audio-name-row"><span class="msg-audio-name">'+Messenger.escapeHtml(name)+'</span>'
          + '<span class="msg-audio-time" data-aid="'+a.id+'">'+dur+'</span></div>'
          + '<div class="msg-audio-wave" data-aid="'+a.id+'" style="height:24px" onclick="event.stopPropagation();Messenger.seekAudio(event,\''+a.id+'\')">'
          + Messenger._buildWaveBars(44, 0, 'var(--accent)', 'var(--border)') + '</div>'
          + '</div></div>';
      }
    });
    // Files
    files.forEach(function(a) {
      var url = '/api/msg/file/' + a.id;
      html += '<a class="msg-att-file" href="'+url+'" download="'+Messenger.escapeHtml(a.name)+'" onclick="event.stopPropagation()">'
        + '<span class="msg-att-file-icon"><span class="ico ico-18 ico-file"></span></span>'
        + '<div class="msg-att-file-info"><div class="msg-att-file-name">'+Messenger.escapeHtml(a.name)+'</div><div class="msg-att-file-size">'+Messenger._fmtSize(a.size)+'</div></div></a>';
    });
    return html;
  },

  openGallery(url) {
    var el = document.getElementById('msgGallery');
    var img = document.getElementById('msgGalleryImg');
    if (el && img) { img.src = url; el.classList.add('active'); }
  },

  // Profile panel attachments
  switchAttachTab(type) {
    this._attachTab = type;
    document.querySelectorAll('.msg-profile-tab').forEach(function(t){ t.classList.toggle('active', t.dataset.tab === type); });
    var grid = document.getElementById('msgProfileAttachGrid');
    if (grid) {
      grid.innerHTML = '';
      if (type === 'file' || type === 'audio') {
        grid.style.display = 'flex';
        grid.style.flexDirection = 'column';
        grid.style.gridTemplateColumns = '';
      } else {
        grid.style.display = 'grid';
        grid.style.flexDirection = '';
        grid.style.gridTemplateColumns = 'repeat(3,1fr)';
      }
    }
    this.loadProfileAttachments();
  },

  _groupByDate(items) {
    var groups = {};
    items.forEach(function(a) {
      var d = a.time ? new Date(a.time * 1000).toLocaleDateString('ru-RU', {day:'numeric',month:'long',year:'numeric'}) : 'Без даты';
      if (!groups[d]) groups[d] = [];
      groups[d].push(a);
    });
    return groups;
  },

  async loadProfileAttachments() {
    if (!this.currentChat) return;
    var ck = this.getChatKey(this.currentUserId, this.currentChat);
    var type = this._attachTab;
    var d = await Shell.api('/api/msg/attachments/' + ck + '?type=' + type);
    var grid = document.getElementById('msgProfileAttachGrid');
    if (!grid) return;
    if (!d || d.length === 0) { grid.innerHTML = '<div class="msg-profile-attach-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="opacity:0.4"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Пусто</div>'; return; }
    if (type === 'image') {
      var vids = await Shell.api('/api/msg/attachments/' + ck + '?type=video');
      var all = (d||[]).concat(vids||[]);
      all.sort(function(a,b){ return (b.time||0)-(a.time||0); });
      if (!all.length) { grid.innerHTML = '<div class="msg-profile-attach-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="opacity:0.4"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Пусто</div>'; return; }
      var groups = this._groupByDate(all);
      var html = '';
      for (var date in groups) {
        html += '<div class="msg-profile-date-header">'+date+'</div>';
        html += '<div class="msg-profile-date-grid">';
        groups[date].forEach(function(a) {
          if (a.type === 'video') {
            html += '<div class="msg-profile-attach-item" onclick="Messenger.playVideo(\''+a.id+'\')" oncontextmenu="event.preventDefault();Messenger.goToAttachMsg(\''+a.msg_id+'\')" data-msgid="'+a.msg_id+'">'
              + '<img src="/api/msg/file/'+a.id+'/thumb" loading="lazy"/><div class="msg-profile-video-badge">▶</div></div>';
          } else {
            html += '<div class="msg-profile-attach-item" onclick="Messenger.openGallery(\'/api/msg/file/'+a.id+'\')" oncontextmenu="event.preventDefault();Messenger.goToAttachMsg(\''+a.msg_id+'\')" data-msgid="'+a.msg_id+'"><img src="/api/msg/file/'+a.id+'/thumb" loading="lazy"/></div>';
          }
        });
        html += '</div>';
      }
      grid.innerHTML = html;
    } else if (type === 'audio') {
      grid.style.display = 'flex'; grid.style.flexDirection = 'column'; grid.style.gridTemplateColumns = '';
      if (!d.length) { grid.innerHTML = '<div class="msg-profile-attach-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="opacity:0.4"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Пусто</div>'; return; }
      var groups = this._groupByDate(d);
      var html = '';
      for (var date in groups) {
        html += '<div class="msg-profile-date-header">'+date+'</div>';
        groups[date].forEach(function(a) {
          var dur = a.duration ? Messenger._fmtDuration(a.duration) : '';
          var isVoice = a.name && a.name.startsWith('voice_');
          var name = isVoice ? 'Голосовое' : (a.name ? (a.name.length > 22 ? a.name.substring(0,20)+'...' : a.name) : 'Аудио');
          var iconColor = isVoice ? 'color:#5ba8e8' : 'color:var(--accent)';
          var nameColor = isVoice ? 'color:#5ba8e8' : '';
          html += '<div class="msg-profile-audio-item" oncontextmenu="event.preventDefault();Messenger.goToAttachMsg(\''+a.msg_id+'\')" data-msgid="'+a.msg_id+'" onclick="Messenger.playAudioFromProfile(\''+a.id+'\')">'
            + '<div class="msg-profile-audio-icon" style="'+iconColor+'">'+(isVoice?'🎤':'🎵')+'</div>'
            + '<div class="msg-profile-audio-info"><div class="msg-profile-audio-name" style="'+nameColor+'">'+Messenger.escapeHtml(name)+'</div><div class="msg-profile-audio-dur">'+dur+'</div></div></div>';
        });
      }
      grid.innerHTML = html;
    } else {
      if (!d.length) { grid.innerHTML = '<div class="msg-profile-attach-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="opacity:0.4"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Пусто</div>'; return; }
      var groups = this._groupByDate(d);
      var html = '';
      for (var date in groups) {
        html += '<div class="msg-profile-date-header">'+date+'</div>';
        groups[date].forEach(function(a) {
          var name = a.name || 'Файл';
          var ext = name.split('.').pop().toUpperCase();
          var size = a.size ? Messenger._fmtSize(a.size) : '';
          var displayName = name.length > 20 ? name.substring(0, 18) + '...' : name;
          html += '<a class="msg-profile-attach-file" href="/api/msg/file/'+a.id+'" download="'+(a.name||'')+'" data-msgid="'+a.msg_id+'" oncontextmenu="event.preventDefault();Messenger.goToAttachMsg(\''+a.msg_id+'\')">'
            + '<span class="ico ico-14 ico-file"></span>'
            + '<div class="msg-profile-file-info"><div class="msg-profile-file-name">'+Messenger.escapeHtml(displayName)+'</div><div class="msg-profile-file-meta">'+ext+(size?' · '+size:'')+'</div></div></a>';
        });
      }
      grid.innerHTML = html;
    }
  },

  _fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' КБ';
    return (bytes / 1048576).toFixed(1) + ' МБ';
  },

  _fmtDuration(s) {
    var m = Math.floor(s / 60), sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  },

  // ===== VOICE RECORDING =====
  onSendClick() {
    if (this._recording) {
      this.stopAndSendRecord();
    } else {
      var input = document.getElementById('msgInput');
      var hasText = input && input.value.trim();
      var hasFiles = this.pendingFiles.length > 0;
      if (!hasText && !hasFiles) {
        this._startVoice();
      } else {
        this.send();
      }
    }
  },

  _startVoice() {
    // Switch to mic mode and start recording
    var btn = document.getElementById('msgSendBtn');
    btn.classList.add('recording');
    document.getElementById('msgInput').style.display = 'none';
    document.getElementById('msgRecordInline').style.display = 'flex';
    this.startRecord();
  },


  _switchToMic() {
    this._micMode = true;
    var btn = document.getElementById('msgSendBtn');
    btn.className = 'msg-send-btn mic-idle ico ico-mic';
  },

  _switchToSend() {
    this._micMode = false;
    this._recording = false;
    document.getElementById('msgInput').style.display = '';
    document.getElementById('msgRecordInline').style.display = 'none';
    this._updateSendBtnColor();
  },

  _updateSendBtnColor() {
    var btn = document.getElementById('msgSendBtn');
    if (!btn || this._recording) return;
    var input = document.getElementById('msgInput');
    var hasContent = (input && input.value.trim()) || this.pendingFiles.length > 0 || this._replyTo || this._editingMsg || this.forwardPending;
    if (hasContent) {
      btn.className = 'msg-send-btn has-content ico ico-send';
      this._micMode = false;
    } else {
      btn.className = 'msg-send-btn mic-idle ico ico-mic';
      this._micMode = true;
    }
  },



  async startRecord() {
    if (this.pendingFiles.length > 0) { Shell.toast('Уберите вложения','error'); return; }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({audio:true});
      this._recordChunks = [];
      this._recordSeconds = 0;
      var options = {mimeType:'audio/webm;codecs=opus'};
      if (!MediaRecorder.isTypeSupported(options.mimeType)) options = {mimeType:'audio/ogg;codecs=opus'};
      if (!MediaRecorder.isTypeSupported(options.mimeType)) options = {};
      var mr = new MediaRecorder(stream, options);
      this._mediaRecorder = mr;
      this._recording = true;
      this._recordStream = stream;
      mr.ondataavailable = function(e) { if (e.data.size > 0) Messenger._recordChunks.push(e.data); };
      mr.start(100);
      // Activate red dot
      document.getElementById('msgRecordDot').classList.add('active');
      document.getElementById('msgRecordTime').textContent = '0:00';
      // Timer
      var self = this;
      this._recordTimer = setInterval(function() {
        self._recordSeconds++;
        document.getElementById('msgRecordTime').textContent = self._fmtDuration(self._recordSeconds);
        if (self._recordSeconds >= 180) self.stopAndSendRecord();
      }, 1000);
    } catch(e) {
      Shell.toast('Нет доступа к микрофону','error');
      this._switchToSend();
    }
  },


  stopAndSendRecord() {
    if (!this._mediaRecorder || !this._recording) return;
    var duration = this._recordSeconds;
    var self = this;
    this._mediaRecorder.onstop = function() {
      var blob = new Blob(self._recordChunks, {type: self._mediaRecorder.mimeType || 'audio/webm'});
      self._cleanupRecord();
      if (blob.size < 500 || duration < 1) return;
      var ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
      var file = new File([blob], 'voice_' + Date.now() + '_' + duration + 's.' + ext, {type: blob.type});
      var files = [{file: file, isImage: false, mediaType: 'audio', preview: null, unsupported: false}];
      self._uploadAndSend(self.currentChat, '', files);
    };
    this._mediaRecorder.stop();
    if (this._recordStream) this._recordStream.getTracks().forEach(function(t){t.stop()});
  },

  cancelRecord() {
    if (this._mediaRecorder) {
      try { this._mediaRecorder.stop(); } catch(e) {}
    }
    if (this._recordStream) this._recordStream.getTracks().forEach(function(t){t.stop()});
    this._cleanupRecord();
  },

  _cleanupRecord() {
    clearInterval(this._recordTimer);
    this._recording = false;
    this._mediaRecorder = null;
    this._recordChunks = [];
    this._recordSeconds = 0;
    this._recordStream = null;
    
    // Reset UI
    var btn = document.getElementById('msgSendBtn');
    if (btn) btn.classList.remove('recording');
    document.getElementById('msgInput').style.display = '';
    document.getElementById('msgRecordInline').style.display = 'none';
    this._updateSendBtnColor();
  },

  // Waveform helpers
  _buildWaveBars(count, played, cPlayed, cRest) {
    var H = [8,15,22,12,18,9,14,20,7,13,17,10,16,19,11,21,8,14];
    var html = '';
    for (var i = 0; i < count; i++) {
      var h = H[i % H.length];
      var col = i < played ? cPlayed : cRest;
      html += '<span class="msg-audio-wave-bar" data-idx="'+i+'" style="height:'+h+'px;background:'+col+'"></span>';
    }
    return html;
  },

  _updateWaveBars(aid, pct) {
    var wave = document.querySelector('.msg-audio-wave[data-aid="'+aid+'"]');
    if (!wave) return;
    var bars = wave.querySelectorAll('.msg-audio-wave-bar');
    var count = bars.length;
    var played = Math.round(pct / 100 * count);
    var player = wave.closest('.msg-audio-player');
    var isVoice = player && player.classList.contains('msg-voice');
    var isMine = wave.closest('.msg-row.mine') != null;
    var cPlayed = isMine && isVoice ? '#fff' : 'var(--accent)';
    var cRest = isMine && isVoice ? 'rgba(255,255,255,0.4)' : (isVoice ? '#d2dae3' : 'var(--border)');
    bars.forEach(function(b, i) { b.style.background = i < played ? cPlayed : cRest; });
  },

  _playIco: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
  _pauseIco: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2"/></svg>',
  _loadIco: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" class="msg-loading-spin"><path d="M12 3a9 9 0 1 0 9 9" opacity="0.85"/></svg>',

  // Audio player
  playAudio(btn, attId) {
    var icon = btn.querySelector('.msg-audio-icon');
    // Toggle current
    if (this._activeAudioId === attId && this._activeAudio) {
      var tp = document.querySelector('.msg-audio-player[data-aid="'+attId+'"]');
      if (this._activeAudio.paused) {
        this._activeAudio.play(); icon.innerHTML = this._pauseIco;
        if (tp) { tp.classList.remove('playing'); void tp.offsetWidth; tp.classList.add('playing'); }
      } else {
        this._activeAudio.pause(); icon.innerHTML = this._playIco;
        if (tp) tp.classList.remove('playing');
      }
      return;
    }
    // Stop previous
    this._stopAudio();
    // Loading state
    icon.innerHTML = this._loadIco;
    var audio = new Audio('/api/msg/file/' + attId);
    audio.preload = 'auto';
    this._activeAudio = audio;
    this._activeAudioId = attId;
    var self = this;
    audio.oncanplay = function() {
      icon.innerHTML = self._pauseIco;
      var player = document.querySelector('.msg-audio-player[data-aid="'+attId+'"]');
      if (player) { player.classList.remove('playing'); void player.offsetWidth; player.classList.add('playing'); }
      audio.play();
    };
    audio.ontimeupdate = function() {
      if (!audio.duration) return;
      var time = document.querySelector('.msg-audio-time[data-aid="'+attId+'"]');
      self._updateWaveBars(attId, audio.currentTime / audio.duration * 100);
      if (time) time.textContent = self._fmtDuration(Math.round(audio.currentTime)) + ' / ' + self._fmtDuration(Math.round(audio.duration));
    };
    audio.onended = function() { self._stopAudio(); };
    audio.onerror = function() { icon.innerHTML = self._playIco; Shell.toast('Ошибка воспроизведения','error'); };
  },

  _stopAudio() {
    if (this._activeAudio) {
      this._activeAudio.pause();
      this._activeAudio = null;
    }
    if (this._activeAudioId) {
      var oldPlayer = document.querySelector('.msg-audio-player[data-aid="'+this._activeAudioId+'"]');
      if (oldPlayer) { oldPlayer.classList.remove('playing'); var oi = oldPlayer.querySelector('.msg-audio-icon'); if (oi) oi.innerHTML = this._playIco; }
      this._updateWaveBars(this._activeAudioId, 0);
      this._activeAudioId = null;
    }
  },

  seekAudio(e, attId) {
    if (!this._activeAudio || this._activeAudioId !== attId) return;
    var bar = e.currentTarget;
    var rect = bar.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (this._activeAudio.duration) {
      this._activeAudio.currentTime = pct * this._activeAudio.duration;
    }
  },

  // Video player - opens in modal
  playVideo(attId) {
    var el = document.getElementById('msgGallery');
    var img = document.getElementById('msgGalleryImg');
    if (!el) return;
    // Replace img with video
    img.style.display = 'none';
    var oldVid = el.querySelector('video');
    if (oldVid) oldVid.remove();
    var video = document.createElement('video');
    video.src = '/api/msg/file/' + attId;
    video.controls = true;
    video.autoplay = true;
    video.style.cssText = 'max-width:90vw;max-height:90vh;border-radius:8px';
    el.insertBefore(video, el.querySelector('.msg-gallery-close'));
    el.classList.add('active');
  },

  closeGallery() {
    var el = document.getElementById('msgGallery');
    if (el) {
      el.classList.remove('active');
      var img = document.getElementById('msgGalleryImg');
      if (img) { img.src = ''; img.style.display = ''; }
      var vid = el.querySelector('video');
      if (vid) { vid.pause(); vid.remove(); }
    }
  },

  _skeleton() {
    var rows = [
      {s:'theirs',w:[200]},
      {s:'theirs',w:[140]},
      {s:'mine',w:[170]},
      {s:'mine',w:[220]},
      {s:'theirs',w:[100,160]},
      {s:'mine',w:[130]},
    ];
    var html = '<div class="msg-skeleton">';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var showAva = r.s === 'theirs' && (i === 0 || rows[i-1].s !== 'theirs');
      html += '<div class="msg-skel-row ' + r.s + '">';
      if (r.s === 'theirs') {
        html += '<div class="msg-skel-ava"' + (showAva ? '' : ' style="visibility:hidden"') + '></div>';
      }
      html += '<div class="msg-skel-group">';
      for (var j = 0; j < r.w.length; j++) {
        html += '<div class="msg-skel-bubble" style="width:'+r.w[j]+'px"></div>';
      }
      html += '</div>';
      if (r.s === 'mine') {
        html += '<div class="msg-skel-ava"' + (i === rows.length-1 || rows[i+1].s !== 'mine' ? '' : ' style="visibility:hidden"') + '></div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }
};

window.Messenger = Messenger;
Messenger.init();
