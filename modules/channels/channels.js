const Channels = {
  spaces: [],
  channelsBySpace: {},
  members: [],
  messages: [],
  _msgOffset: 0,
  _loadingMore: false,
  _hasMore: true,
  currentSpace: null,
  currentChannel: null,
  currentUserId: null,
  isAdmin: false,
  membersVisible: true,
  _typingTimers: {},
  _selectedMembers: [],
  _selectedIcon: 'channels',
  _deleteTarget: null,
  _ctxMsg: null,
  _replyTo: null,
  _editMsg: null,
  _longTimer: null,
  _recording: false,
  _recorder: null,
  _recChunks: [],
  _recStart: 0,
  _emojiOpen: false,
  _pendingFiles: [],
  _recTimer: null,
  _recSec: 0,
  _activeAudio: null,
  _activeAudioId: null,
  _pins: [],
  _pinsVisible: false,
  _collapsed: {},
  _memberRefresh: null,
  _searchMatches: [],
  _searchIdx: -1,
  _skelTimer: null,
  _unreadBelow: 0,

  init() {
    this.currentUserId = Shell.user ? Shell.user.id : null;
    this.isAdmin = Shell.user && ['arcana','immortal','legendary'].indexOf(Shell.user.role) !== -1;
    if (!this.isAdmin) {
      var csb = document.getElementById('chCreateSpaceBtn'); if (csb) csb.style.display = 'none';
      var mb = document.getElementById('chAddMemberBtn'); if (mb) mb.style.display = 'none';
    }
    this.loadSpaces();
    this._buildEmojiPicker();
    this._initKeyboard();
    var self = this;
    this._memberRefresh = setInterval(function(){ if(self.currentSpace && self.membersVisible) self.loadMembers(); }, 10000);
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
    var self = this;
    var apply = function() {
      if (window.innerWidth > 768) return;
      var vv = window.visualViewport;
      var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      var open = kb > 80;
      var c = document.getElementById('chChat');
      if (open && !wasKB) {
        wasKB = true;
        if (sidebar) { sidebar.style.transition='transform 0.2s,opacity 0.2s'; sidebar.style.transform='translateY(100%)'; sidebar.style.opacity='0'; sidebar.style.pointerEvents='none'; }
      } else if (!open && wasKB) {
        wasKB = false;
        if (sidebar) { sidebar.style.transition='transform 0.2s,opacity 0.2s'; sidebar.style.transform=''; sidebar.style.opacity=''; sidebar.style.pointerEvents=''; }
      }
      // iOS: lift the fixed chat above the on-screen keyboard (no layout shrink).
      if (c && ios) c.style.bottom = open ? kb + 'px' : '';
      if (open) { window.scrollTo(0, 0); self.scrollToBottom(); }
    };
    window.visualViewport.addEventListener('resize', apply);
    window.visualViewport.addEventListener('scroll', apply);
  },

  async loadSpaces() {
    var d = await Shell.api('/api/mod/channels/spaces');
    this.spaces = Array.isArray(d) ? d : [];
    this.channelsBySpace = {};
    for (var i = 0; i < this.spaces.length; i++) {
      var ch = await Shell.api('/api/mod/channels/channels?space_id=' + this.spaces[i].id);
      this.channelsBySpace[this.spaces[i].id] = Array.isArray(ch) ? ch : [];
      if (this.spaces[i].type === 'voice_group') {
        var vr = await Shell.api('/api/mod/channels/voice_rooms?space_id=' + this.spaces[i].id);
        if (vr) Object.assign(this._voiceRooms, vr);
      }
    }
    this.renderSidebar();
  },

  toggleCollapse(spaceId) {
    this._collapsed[spaceId] = !this._collapsed[spaceId];
    // Toggle channels visibility in DOM without full re-render
    var group = document.querySelector('.ch-space-group[data-sid="'+spaceId+'"]');
    if (!group) { this.renderSidebar(); return; }
    var channels = group.querySelectorAll('.ch-channel, .ch-voice-room, .ch-space-empty');
    var arrow = group.querySelector('.ch-collapse-arrow');
    var collapsed = this._collapsed[spaceId];
    channels.forEach(function(el) { el.style.display = collapsed ? 'none' : ''; });
    if (arrow) {
      arrow.classList.remove('ico-chevron-down','ico-chevron-right');
      arrow.classList.add(collapsed ? 'ico-chevron-right' : 'ico-chevron-down');
    }
  },

  renderSidebar() {
    var el = document.getElementById('chSidebarList');
    var empty = document.getElementById('chSidebarEmpty');
    if (!el || !empty) return;

    if (!this.spaces.length) {
      el.innerHTML = '';
      empty.style.display = 'flex';
      empty.innerHTML = this.isAdmin
        ? '<button class="ch-empty-add" onclick="Channels.openCreateSpace()">+</button><p>Создайте первую группу</p>'
        : '<p>У вас ещё нет групп</p>';
      return;
    }
    empty.style.display = 'none';
    empty.innerHTML = '';

    var self = this;
    var html = '';
    this.spaces.forEach(function(sp) {
      var channels = self.channelsBySpace[sp.id] || [];
      html += '<div class="ch-space-group" data-sid="'+sp.id+'">';
      var collapsed = self._collapsed[sp.id] ? true : false;
      var arrowIco = collapsed ? 'chevron-right' : 'chevron-down';
      var photo = sp.photo ? '<img class="ch-space-photo" src="data:image/jpeg;base64,'+sp.photo+'"/>' : '';
      html += '<div class="ch-space-header" onclick="Channels.toggleCollapse(\x27'+sp.id+'\x27)">';
      html += photo;
      html += '<span class="ch-space-name">' + self._esc(sp.name) + '</span>';
      if (sp.type === 'voice_group') html += '<span class="ch-space-voice-badge">VOICE</span>';
      html += '<div class="ch-space-actions">';
      html += '<span class="ico ico-14 ico-'+arrowIco+' ch-collapse-arrow" style="color:var(--text-dim)"></span>';
      html += '</div>';
      html += '</div>';
      if (!collapsed) channels.forEach(function(ch) {
        if (ch.type === 'voice') {
          // Voice room entry
          var vr = self._voiceRooms[ch.id] || {};
          var total = vr.total || 0;
          var spkCount = vr.speaker_count || 0;
          var spkAvatars = (vr.speakers || []).slice(0,3).map(function(p) {
            return p.avatar ? '<img class="ch-vr-av" src="data:image/png;base64,'+p.avatar+'">' : '<div class="ch-vr-av ch-vr-av-empty">'+self._esc((p.username||'?')[0])+'</div>';
          }).join('');
          var amInRoom = self._voiceRoomId === ch.id;
          var activeCls = (amInRoom || self.currentChannel === ch.id) ? ' ch-vr-active' : '';
          var fullCls = spkCount >= 6 ? ' ch-vr-full' : '';
          html += '<div class="ch-voice-room'+activeCls+fullCls+'" data-chid="'+ch.id+'" onclick="Channels.openChannel(\x27'+sp.id+'\x27,\x27'+ch.id+'\x27)">';
          var vrIco = ch.icon && ch.icon !== 'channels' ? '<span class="ico ico-14 ico-'+ch.icon+'" style="opacity:0.6;flex-shrink:0"></span>' : '<span class="ico ico-14 ico-microphone" style="opacity:0.6;flex-shrink:0"></span>';
          html += vrIco;
          html += '<span class="ch-vr-name">'+self._esc(ch.name)+'</span>';
          if (total > 0) {
            html += '<div class="ch-vr-meta">'+spkAvatars+'<span class="ch-vr-count">'+spkCount+'/6</span></div>';
          }
          if (self.isAdmin) {
            html += '<div class="ch-channel-actions">';
            html += '<button class="ch-space-action" onclick="event.stopPropagation();Channels.openEditChannel(\x27'+sp.id+'\x27,\x27'+ch.id+'\x27)"><span class="ico ico-14 ico-pencil"></span></button>';
            html += '<button class="ch-space-action" onclick="event.stopPropagation();Channels.openDeleteChannel(\x27'+sp.id+'\x27,\x27'+ch.id+'\x27)"><span class="ico ico-14 ico-trash"></span></button>';
            html += '</div>';
          }
          html += '</div>';
        } else {
          var active = self.currentChannel === ch.id ? ' active' : '';
          var unread = ch.unread || 0;
          var badge = unread > 0 ? '<span class="ch-unread-badge">'+unread+'</span>' : '<span class="ch-unread-badge" style="display:none"></span>';
          html += '<div class="ch-channel' + active + '" data-chid="'+ch.id+'" onclick="Channels.openChannel(\x27'+sp.id+'\x27,\x27'+ch.id+'\x27)">';
          var ico = ch.icon && ch.icon !== 'channels' ? '<span class="ico ico-14 ico-'+ch.icon+'" style="opacity:0.5;flex-shrink:0"></span>' : '<span class="ch-channel-hash">#</span>';
          html += ico;
          html += '<span class="ch-channel-name">' + self._esc(ch.name) + '</span>' + badge;
          if (self.isAdmin) {
            html += '<div class="ch-channel-actions">';
            html += '<button class="ch-space-action" onclick="event.stopPropagation();Channels.openEditChannel(\x27'+sp.id+'\x27,\x27'+ch.id+'\x27)"><span class="ico ico-14 ico-pencil"></span></button>';
            html += '<button class="ch-space-action" onclick="event.stopPropagation();Channels.openDeleteChannel(\x27'+sp.id+'\x27,\x27'+ch.id+'\x27)"><span class="ico ico-14 ico-trash"></span></button>';
            html += '</div>';
          }
          html += '</div>';
        }
      });
      if (!collapsed && !channels.length) {
        html += '<div class="ch-space-empty" style="padding:4px 22px;font-size:11px;color:var(--text-dim);font-style:italic">Пусто</div>';
      }
      html += '</div>';
    });
    el.innerHTML = html;
    // Apply collapsed state
    var self2 = this;
    Object.keys(this._collapsed).forEach(function(sid) {
      if (!self2._collapsed[sid]) return;
      var g = el.querySelector('.ch-space-group[data-sid="'+sid+'"]');
      if (g) g.querySelectorAll('.ch-channel, .ch-voice-room, .ch-space-empty').forEach(function(e){e.style.display='none';});
    });
    if (!this._spaceCtxAttached) { this._attachSpaceCtx(); this._spaceCtxAttached = true; }
  },

  // ─── Chat ───
  async openChannel(spaceId, channelId) {
    this.currentSpace = spaceId;
    this.currentChannel = channelId;
    this.renderSidebar();
    var channels = this.channelsBySpace[spaceId] || [];
    var ch = channels.find(function(c){return c.id===channelId});

    // Route voice rooms to voice UI
    if (ch && ch.type === 'voice') {
      return this.openVoiceChannel(spaceId, channelId);
    }

    // Text channel — restore text UI
    document.getElementById('chMessages').style.display = '';
    document.getElementById('chInputArea').style.display = 'flex';
    document.getElementById('chSearchBtn').style.display = '';
    document.getElementById('chVoiceSettingsBtn').style.display = 'none';
    var vm = document.getElementById('chVoiceMain');
    if (vm) vm.style.display = 'none';

    // If in voice room elsewhere — show minimized bar
    if (this._voiceRoomId) this._showVoiceBar();

    var lbl = document.getElementById('chChatChannelLabel');
    if (lbl) lbl.innerHTML = '# <span id="chChatName">' + this._esc(ch ? ch.name : '—') + '</span>';
    document.getElementById('chChatHead').style.display = 'flex';
    document.getElementById('chChat').classList.add('mobile-open');
    if (window.innerWidth <= 768) { var sb = document.querySelector('.sidebar'); if (sb) sb.style.display = 'none'; document.getElementById('chChat').style.bottom = '0'; }
    await this.loadMessages();
    await this.loadMembers();
    await this.loadPins();
    if (!this._ctxAttached) { this._attachMsgEvents(); this._ctxAttached = true; }
    if (window.innerWidth > 768) document.getElementById('chInput').focus();
  },

  closeChat() {
    document.getElementById('chChat').classList.remove('mobile-open');
    if (window.innerWidth <= 768) { var sb = document.querySelector('.sidebar'); if (sb) sb.style.display = ''; document.getElementById('chChat').style.bottom = ''; }
    this.currentChannel = null;
    this.renderSidebar();
    this.closeSearch();
  },

  // ─── Search ───
  toggleSearch() {
    var wrap = document.getElementById('chSearchWrap');
    if (!wrap) return;
    if (wrap.classList.contains('open')) { this.closeSearch(); }
    else { wrap.classList.add('open'); var inp = document.getElementById('chSearchInput'); if (inp) { inp.focus(); inp.select(); } }
  },

  closeSearch() {
    var wrap = document.getElementById('chSearchWrap');
    if (wrap) wrap.classList.remove('open');
    var inp = document.getElementById('chSearchInput');
    if (inp) inp.value = '';
    var cnt = document.getElementById('chSearchCount');
    if (cnt) { cnt.textContent = ''; cnt.className = 'ch-search-count'; }
    document.querySelectorAll('.ch-msg-search-match,.ch-msg-search-active').forEach(function(el) {
      el.outerHTML = el.textContent;
    });
    this._searchMatches = []; this._searchIdx = -1;
  },

  onSearch(q) {
    q = q.trim();
    var cnt = document.getElementById('chSearchCount');
    if (!q) { this.closeSearch(); return; }
    // Highlight matches in rendered message texts
    var msgs = document.querySelectorAll('.ch-msg-text');
    var matches = [];
    msgs.forEach(function(el) {
      var orig = el.getAttribute('data-orig') || el.textContent;
      el.setAttribute('data-orig', orig);
      var re = new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
      el.innerHTML = orig.replace(re, '<mark class="ch-msg-search-match">$1</mark>');
      el.querySelectorAll('.ch-msg-search-match').forEach(function(m){ matches.push(m); });
    });
    this._searchMatches = matches;
    this._searchIdx = matches.length ? 0 : -1;
    if (cnt) { cnt.textContent = matches.length ? (1+'/'+matches.length) : '0'; cnt.className = 'ch-search-count' + (matches.length ? ' has-results' : ''); }
    this._highlightSearchMatch();
  },

  _highlightSearchMatch() {
    this._searchMatches.forEach(function(m,i){ m.className = 'ch-msg-search-match'; });
    var cur = this._searchMatches[this._searchIdx];
    if (cur) { cur.className = 'ch-msg-search-active'; cur.scrollIntoView({behavior:'smooth',block:'center'}); }
    var cnt = document.getElementById('chSearchCount');
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

  // ─── Scroll-down button ───
  scrollToBottom() {
    var el = document.getElementById('chMessages');
    if (el) { el.scrollTop = el.scrollHeight; this._unreadBelow = 0; this._updateScrollBtn(); }
  },

  _updateScrollBtn() {
    var el = document.getElementById('chMessages');
    var btn = document.getElementById('chScrollBtn');
    if (!el || !btn) return;
    var distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    var visible = distFromBottom > 120;
    btn.classList.toggle('visible', visible);
    var badge = document.getElementById('chScrollBadge');
    if (badge) {
      if (visible && this._unreadBelow > 0) {
        badge.textContent = this._unreadBelow > 99 ? '99+' : this._unreadBelow;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  },

  _showSkeleton() {
    var self = this;
    clearTimeout(this._skelTimer);
    this._skelTimer = setTimeout(function() {
      var el = document.getElementById('chMessages');
      if (el && !el.querySelector('.ch-msg')) el.innerHTML = '<div class="ch-skeleton">'
        + '<div class="ch-skel-row"><div class="ch-skel-ava"></div><div class="ch-skel-lines"><div class="ch-skel-line w40"></div><div class="ch-skel-line w80"></div></div></div>'
        + '<div class="ch-skel-row"><div class="ch-skel-ava"></div><div class="ch-skel-lines"><div class="ch-skel-line w60"></div><div class="ch-skel-line w40"></div></div></div>'
        + '<div class="ch-skel-row"><div class="ch-skel-ava"></div><div class="ch-skel-lines"><div class="ch-skel-line w80"></div><div class="ch-skel-line w60"></div></div></div>'
        + '</div>';
    }, 300);
  },

  async loadMessages() {
    if (!this.currentChannel) return;
    this._msgOffset = 0; this._loadingMore = false; this._hasMore = true;
    this._showSkeleton();
    var d = await Shell.api('/api/mod/channels/messages?channel_id=' + this.currentChannel);
    clearTimeout(this._skelTimer);
    if (d && d.messages) {
      this.messages = d.messages;
      this._lastRead = d.last_read || 0;
    } else {
      this.messages = Array.isArray(d) ? d : [];
      this._lastRead = 0;
    }
    this._animMode = 'all';
    this.renderMessages();
    // Mark as read — update local data + DOM + server
    Shell.api('/api/mod/channels/read?channel_id=' + this.currentChannel);
    var channels = this.channelsBySpace[this.currentSpace] || [];
    for (var i = 0; i < channels.length; i++) {
      if (channels[i].id === this.currentChannel) { channels[i].unread = 0; break; }
    }
    // Force hide badge in DOM
    var badge = document.querySelector('.ch-channel[data-chid="'+this.currentChannel+'"] .ch-unread-badge');
    if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
  },

  renderMessages() {
    var el = document.getElementById('chMessages');
    if (!el) return;
    if (!this.messages.length) {
      el.innerHTML = '<div class="ch-empty-chat"><span class="ico ico-32 ico-channels" style="opacity:0.12"></span><p>Начните общение</p><p style="font-size:11px;color:var(--text-dim);opacity:0.7">Напишите первое сообщение в этом канале</p></div>';
      return;
    }
    var self = this;
    var sepInserted = false;
    var animMode = this._animMode || 'all'; this._animMode = 'none';
    var popId = this._animReactMsgId; this._animReactMsgId = null;
    var lastIdx = this.messages.length - 1;
    el.innerHTML = this.messages.map(function(m, idx) {
      var prev = idx > 0 ? self.messages[idx-1] : null;
      var sep = '', sepHere = false;
      if (!sepInserted && self._lastRead > 0 && m.time > self._lastRead && m.from !== self.currentUserId) {
        sep = '<div class="ch-new-sep" id="chNewSep"><span>новые сообщения</span></div>';
        sepInserted = true; sepHere = true;
      }
      // Discord-style grouping: same author within 2 min, no reply, no separator
      var grouped = prev && prev.from === m.from && (m.time - prev.time) < 120 && !m.reply_to && !sepHere;
      var ava = m.avatar ? '<img src="data:image/jpeg;base64,'+m.avatar+'"/>' : (m.from_name||'?').charAt(0).toUpperCase();
      var role = m.role || 'common';
      var t = self._fmtTime(m.time);
      var isMe = m.from === self.currentUserId;
      var animCls = (animMode === 'all' || (animMode === 'last' && idx === lastIdx)) ? ' ch-msg-in' : '';
      var popCls = (popId && m.id === popId) ? ' ch-react-pop' : '';
      var gtime = grouped ? '<span class="ch-msg-gtime">'+t+'</span>' : '';
      return sep + '<div class="ch-msg'+(grouped?' grouped':'')+animCls+popCls+'" data-msgid="'+m.id+'">'
        + gtime
        + '<div class="ch-msg-ava">'+ava+'</div>'
        + '<div class="ch-msg-body">'
        + '<div class="ch-msg-header"><span class="ch-msg-author'+(isMe?' me':'')+'">'+self._esc(m.from_name||m.from)+'</span>'
        + '<span class="role-badge '+role+'" style="font-size:8px;padding:1px 5px">'+role.toUpperCase()+'</span>'
        + '<span class="ch-msg-time">'+t+'</span></div>'
        + (m.reply_to ? '<div class="ch-msg-reply" onclick="Channels.scrollToMsg(\x27'+m.reply_to+'\x27)"><div class="ch-msg-reply-name">'+self._esc(m.reply_name||'')+'</div><div class="ch-msg-reply-text">'+self._esc(m.reply_text||'')+'</div></div>' : '')
        + '<div class="ch-msg-text">'+self._fmt(m.text||'')+(m.edited?' <span class="ch-msg-edited">изменено</span>':'')+'</div>'
        + self._renderAttachments(m.attachments)
        + self._renderReactions(m.reactions, m.id)
        + '</div>'
        + '<div class="ch-msg-quick">'
        + '<div class="ch-msg-quick-emojis">'
        + ['👍','❤️','😂','😮','😢'].map(function(e){return '<button class="ch-msg-qemoji" onclick="event.stopPropagation();Channels.addReaction(\x27'+m.id+'\x27,\x27'+e+'\x27)">'+e+'</button>';}).join('')
        + '</div>'
        + '<button class="ch-msg-qbtn" onclick="event.stopPropagation();Channels.setReply(Channels.messages.find(function(x){return x.id===\x27'+m.id+'\x27}))" title="Ответить"><span class="ico ico-14 ico-reply"></span></button>'
        + '<button class="ch-msg-qbtn" onclick="event.stopPropagation();Channels.forwardToMessenger(Channels.messages.find(function(x){return x.id===\x27'+m.id+'\x27}))" title="Переслать"><span class="ico ico-14 ico-forward"></span></button>'
        + (self.isAdmin?'<button class="ch-msg-qbtn" onclick="event.stopPropagation();Channels.pinMessage(Channels.messages.find(function(x){return x.id===\x27'+m.id+'\x27}))" title="Закрепить"><span class="ico ico-14 ico-pin"></span></button>':'')
        + (isMe?'<button class="ch-msg-qbtn" onclick="event.stopPropagation();Channels.startEdit(Channels.messages.find(function(x){return x.id===\x27'+m.id+'\x27}))" title="Изменить"><span class="ico ico-14 ico-pencil"></span></button>':'')
        + ((isMe||self.isAdmin)?'<button class="ch-msg-qbtn" onclick="event.stopPropagation();Channels.deleteMessage(Channels.messages.find(function(x){return x.id===\x27'+m.id+'\x27}))" title="Удалить"><span class="ico ico-14 ico-trash"></span></button>':'')
        + '</div></div>';
    }).join('');
    el.scrollTop = el.scrollHeight;

    // Scroll-to-top for older messages + scroll-down button
    var self3 = this;
    el.onscroll = function() {
      // Older messages load
      if (el.scrollTop < 60 && !self3._loadingMore && self3._hasMore && self3.currentChannel) {
        self3._loadingMore = true;
        self3._msgOffset += 50;
        Shell.api('/api/mod/channels/messages?channel_id='+self3.currentChannel+'&offset='+self3._msgOffset).then(function(d) {
          self3._loadingMore = false;
          var msgs = d && d.messages ? d.messages : (Array.isArray(d) ? d : []);
          if (!msgs.length) { self3._hasMore = false; return; }
          var prevH = el.scrollHeight;
          self3.messages = msgs.concat(self3.messages);
          self3._animMode = 'none';
          self3.renderMessages();
          el.scrollTop = el.scrollHeight - prevH;
        });
      }
      // Scroll-down button visibility
      self3._updateScrollBtn();
    };
    // Remove "new" separator on scroll
    var msgEl = document.getElementById('chMessages');
    if (msgEl) {
      var scrollHandler = function() {
        var sep = document.getElementById('chNewSep');
        if (sep) { sep.style.transition = 'opacity 0.3s'; sep.style.opacity = '0'; setTimeout(function(){sep.remove()},300); }
        msgEl.removeEventListener('scroll', scrollHandler);
      };
      msgEl.addEventListener('scroll', scrollHandler);
    }
  },

  async send() {
    var input = document.getElementById('chInput');
    var text = input.value.trim();
    if (!text || !this.currentChannel) return;
    input.value = ''; this.autoResize(input);
    if (this._editMsg) {
      Shell.wsSend({type:'ch_edit', channel_id:this.currentChannel, space_id:this.currentSpace, msg_id:this._editMsg.id, text:text});
      this.cancelEdit();
    } else {
      var payload = {type:'ch_send', channel_id:this.currentChannel, space_id:this.currentSpace, text:text};
      if (this._replyTo) { payload.reply_to = this._replyTo.id; payload.reply_name = this._replyTo.from_name||this._replyTo.from; payload.reply_text = (this._replyTo.text||'').substring(0,100); }
      Shell.wsSend(payload);
      this.cancelReply();
    }
  },

  // ─── @Mentions ───
  _checkMention(e) {
    var input = document.getElementById('chInput');
    var val = input.value;
    var pos = input.selectionStart;
    // Find @ before cursor
    var before = val.substring(0, pos);
    var match = before.match(/@(\w*)$/);
    if (!match) { this._hideMentionPopup(); return; }
    var query = match[1].toLowerCase();
    var filtered = this.members.filter(function(m) {
      var name = (m.display_name || m.username).toLowerCase();
      return !query || name.indexOf(query) !== -1 || m.username.toLowerCase().indexOf(query) !== -1;
    }).slice(0, 5);
    if (query === '' || query === 'al') {
      filtered.unshift({user_id:'all', username:'all', display_name:'Все участники', role:'common', avatar:null});
    }
    if (!filtered.length) { this._hideMentionPopup(); return; }
    this._showMentionPopup(filtered, match[0].length);
  },

  _showMentionPopup(members, matchLen) {
    var popup = document.getElementById('chMentionPopup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'chMentionPopup';
      popup.className = 'ch-mention-popup';
      var chatEl = document.getElementById('chChat');
      if (chatEl) chatEl.appendChild(popup);
    }
    popup.style.display = 'block';
    // Position above input
    var inputEl = document.getElementById('chInputArea');
    if (inputEl) {
      var rect = inputEl.getBoundingClientRect();
      popup.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
      popup.style.left = rect.left + 'px';
      popup.style.width = Math.min(rect.width, 300) + 'px';
    }
    popup.innerHTML = members.map(function(m) {
      var ava = m.avatar ? '<img src="data:image/jpeg;base64,'+m.avatar+'"/>' : (m.display_name||m.username).charAt(0).toUpperCase();
      var dn = m.display_name || m.username;
      return '<div class="ch-mention-item" onclick="Channels._insertMention(\x27'+m.username+'\x27,'+matchLen+')">'
        + '<div class="ch-mention-ava">'+ava+'</div>'
        + '<span class="ch-mention-name">'+Channels._esc(dn)+'</span>'
        + '<span class="role-badge '+m.role+'" style="font-size:8px;padding:1px 4px">'+m.role.toUpperCase()+'</span></div>';
    }).join('');
  },

  _hideMentionPopup() {
    var popup = document.getElementById('chMentionPopup');
    if (popup) popup.style.display = 'none';
  },

  _insertMention(username, matchLen) {
    var input = document.getElementById('chInput');
    var pos = input.selectionStart;
    var val = input.value;
    var before = val.substring(0, pos - matchLen);
    var after = val.substring(pos);
    input.value = before + '@' + username + ' ' + after;
    input.focus();
    var newPos = before.length + username.length + 2;
    input.setSelectionRange(newPos, newPos);
    this._hideMentionPopup();
  },

  onTyping() {
    if (!this.currentChannel) return;
    Shell.wsSend({type:'ch_typing', channel_id:this.currentChannel, space_id:this.currentSpace});
  },

  onWS(data) {
    if (data.type && data.type.startsWith('voice_')) {
      var passThru = ['voice_rooms_update','voice_invite_notify','voice_kicked'];
      if (this._voiceRoomId || passThru.indexOf(data.type) !== -1) this._onVoiceWS(data);
      return;
    }
    if (data.type === 'ch_presence') {
      var changed = false;
      for (var pi = 0; pi < this.members.length; pi++) {
        if (this.members[pi].user_id === data.user_id) {
          this.members[pi].online = (data.status ? data.status !== 'offline' : data.online);
          this.members[pi].status = data.status || (data.online ? 'online' : 'offline');
          changed = true;
          break;
        }
      }
      if (changed && this.membersVisible) this.renderMembers();
      return;
    }
    if (data.type === 'ch_reacted' && data.channel_id === this.currentChannel) {
      for (var i = 0; i < this.messages.length; i++) {
        if (this.messages[i].id === data.msg_id) { this.messages[i].reactions = data.reactions; break; }
      }
      this._animMode = 'none';
      this._animReactMsgId = data.msg_id;
      this.renderMessages();
      return;
    }
    if (data.type === 'ch_pinned' && data.channel_id === this.currentChannel) {
      this._pins = data.pins || [];
      this._renderPinBar();
      if (this._pinsVisible) this._renderPinsPanel();
      return;
    }
    if (data.type === 'ch_update') {
      this.loadSpaces();
    this._buildEmojiPicker();
    var self = this;
    this._memberRefresh = setInterval(function(){ if(self.currentSpace && self.membersVisible) self.loadMembers(); }, 10000);
      if (this.currentSpace) this.loadMembers();
      return;
    }
    if (data.type === 'ch_edited') {
      if (data.channel_id === this.currentChannel) {
        for (var i = 0; i < this.messages.length; i++) {
          if (this.messages[i].id === data.msg_id) { this.messages[i].text = data.text; break; }
        }
        this._animMode = 'none';
        this.renderMessages();
      }
      return;
    }
    if (data.type === 'ch_deleted') {
      if (data.channel_id === this.currentChannel) {
        this.messages = this.messages.filter(function(m){return m.id !== data.msg_id});
        this._animMode = 'none';
        this.renderMessages();
      }
      return;
    }
    if (data.type === 'ch_message') {
      // Check for @mention notification
      var myUsername = Shell.user ? Shell.user.username : '';
      var msgText = data.msg.text || '';
      var isMentioned = msgText.indexOf('@'+myUsername) !== -1 || msgText.indexOf('@all') !== -1;
      if (isMentioned && data.msg.from !== this.currentUserId) {
        this._showChannelNotify(data.msg, data.channel_id, data.space_id);
      }
      if (data.channel_id === this.currentChannel) {
        // Track unread below when user has scrolled up
        var msgEl = document.getElementById('chMessages');
        var atBottom = msgEl && (msgEl.scrollHeight - msgEl.scrollTop - msgEl.clientHeight < 80);
        if (!atBottom && data.msg.from !== this.currentUserId) { this._unreadBelow++; }
        this.messages.push(data.msg);
        this._animMode = 'last';
        this.renderMessages();
        if (atBottom) { this._unreadBelow = 0; Shell.api('/api/mod/channels/read?channel_id=' + this.currentChannel); }
      } else {
        // Increment unread badge
        var badge = document.querySelector('.ch-channel[data-chid="'+data.channel_id+'"] .ch-unread-badge');
        if (badge) { var n = parseInt(badge.textContent||'0')+1; badge.textContent = n; badge.style.display = ''; }
      }
      return;
    }
    if (data.type === 'ch_typing' && data.channel_id === this.currentChannel && data.user_id !== this.currentUserId) {
      this._showTyping(data.username);
    }
  },

  _showTyping(username) {
    var el = document.getElementById('chTyping');
    if (!el) return;
    this._typingTimers[username] = Date.now();
    var self = this;
    var render = function() {
      var now = Date.now(), names = [];
      for (var n in self._typingTimers) { if (now - self._typingTimers[n] < 4000) names.push(n); else delete self._typingTimers[n]; }
      if (!names.length) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.textContent = names.length === 1 ? names[0]+' печатает...' : names.length <= 3 ? names.join(', ')+' печатают...' : names.slice(0,2).join(', ')+' и ещё '+(names.length-2)+' печатают...';
    };
    render(); setTimeout(render, 4000);
  },

  // ─── Groups CRUD ───
  openCreateSpace() {
    document.getElementById('chSpaceEditId').value = '';
    document.getElementById('chSpaceNameInput').value = '';
    document.getElementById('chSpaceModalTitle').textContent = 'Создать группу';
    document.getElementById('chSpaceSaveBtn').textContent = 'Создать';
    this._spacePhoto = null;
    this._spaceType = 'text';
    var prev = document.getElementById('chSpacePhotoPreview');
    if (prev) { prev.innerHTML = '<span class="ico ico-18 ico-attach" style="opacity:0.4"></span>'; }
    var typeRow = document.getElementById('chSpaceTypeRow');
    if (typeRow) { typeRow.style.display = ''; document.querySelector('input[name="chSpaceType"][value="text"]').checked = true; }
    document.getElementById('chCreateSpaceModal').classList.add('active');
    document.getElementById('chSpaceNameInput').focus();
  },

  openEditSpace(spaceId) {
    var sp = this.spaces.find(function(s){return s.id===spaceId});
    if (!sp) return;
    document.getElementById('chSpaceEditId').value = spaceId;
    document.getElementById('chSpaceNameInput').value = sp.name;
    document.getElementById('chSpaceModalTitle').textContent = 'Изменить группу';
    document.getElementById('chSpaceSaveBtn').textContent = 'Сохранить';
    this._spacePhoto = null;
    this._spaceType = sp.type || 'text';
    var prev = document.getElementById('chSpacePhotoPreview');
    if (prev) {
      prev.innerHTML = sp.photo ? '<img src="data:image/jpeg;base64,'+sp.photo+'"/>' : '<span class="ico ico-18 ico-attach" style="opacity:0.4"></span>';
    }
    var typeRow = document.getElementById('chSpaceTypeRow');
    if (typeRow) { typeRow.style.display = 'none'; } // hide type selector on edit
    document.getElementById('chCreateSpaceModal').classList.add('active');
    document.getElementById('chSpaceNameInput').focus();
  },

  async saveSpace() {
    var name = document.getElementById('chSpaceNameInput').value.trim();
    var editId = document.getElementById('chSpaceEditId').value;
    if (!name) return;
    var typeEl = document.querySelector('input[name="chSpaceType"]:checked');
    var spaceType = typeEl ? typeEl.value : (this._spaceType || 'text');
    var payload = editId ? {edit_id:editId, name:name} : {name:name, type:spaceType};
    if (this._spacePhoto) payload.photo = this._spacePhoto;
    if (this._removePhoto && editId) payload.remove_photo = true;
    this._removePhoto = false;
    var d = await Shell.api('/api/mod/channels/spaces', {method:'POST', body:JSON.stringify(payload)});
    if (d && d.status === 'ok') { Shell.closeModal('chCreateSpaceModal'); Shell.toast(editId?'Обновлено':'Группа создана'); this.loadSpaces(); Shell.wsSend({type:'ch_update'}); }
    else { Shell.toast(d?.error||'Ошибка','error'); }
  },

  openDeleteSpace(spaceId) {
    var sp = this.spaces.find(function(s){return s.id===spaceId});
    this._deleteTarget = {type:'space', id:spaceId};
    document.getElementById('chDeleteTitle').textContent = 'Удалить группу?';
    document.getElementById('chDeleteText').textContent = 'Группа "' + (sp?sp.name:'') + '" и все каналы будут удалены.';
    document.getElementById('chDeleteModal').classList.add('active');
  },

  // ─── Channels CRUD ───
  openCreateChannel(spaceId) {
    var sp = this.spaces.find(function(s){return s.id===spaceId});
    var isVoiceGroup = sp && sp.type === 'voice_group';
    document.getElementById('chCreateChanSpace').value = spaceId;
    document.getElementById('chChanEditId').value = '';
    document.getElementById('chChanNameInput').value = '';
    document.getElementById('chChanModalTitle').textContent = isVoiceGroup ? 'Создать голосовую комнату' : 'Создать канал';
    document.getElementById('chChanSaveBtn').textContent = 'Создать';
    this._selectedIcon = isVoiceGroup ? 'microphone' : 'channels';
    this._chanIsVoice = isVoiceGroup;
    var iconRow = document.getElementById('chIconPickerRow');
    if (iconRow) iconRow.style.display = '';
    this._renderIconPicker();
    document.getElementById('chCreateChanModal').classList.add('active');
    document.getElementById('chChanNameInput').focus();
  },

  openEditChannel(spaceId, channelId) {
    var channels = this.channelsBySpace[spaceId] || [];
    var ch = channels.find(function(c){return c.id===channelId});
    if (!ch) return;
    document.getElementById('chCreateChanSpace').value = spaceId;
    document.getElementById('chChanEditId').value = channelId;
    document.getElementById('chChanNameInput').value = ch.name;
    document.getElementById('chChanModalTitle').textContent = 'Изменить канал';
    document.getElementById('chChanSaveBtn').textContent = 'Сохранить';
    this._selectedIcon = ch.icon || 'channels';
    this._renderIconPicker();
    document.getElementById('chCreateChanModal').classList.add('active');
    document.getElementById('chChanNameInput').focus();
  },

  async saveChannel() {
    var name = document.getElementById('chChanNameInput').value.trim();
    var spaceId = document.getElementById('chCreateChanSpace').value;
    var editId = document.getElementById('chChanEditId').value;
    if (!name || !spaceId) return;
    var chType = this._chanIsVoice ? 'voice' : 'text';
    if (editId) {
      var d = await Shell.api('/api/mod/channels/channels', {method:'POST', body:JSON.stringify({space_id:spaceId, edit_id:editId, name:name, icon:this._selectedIcon})});
    } else {
      var d = await Shell.api('/api/mod/channels/channels', {method:'POST', body:JSON.stringify({space_id:spaceId, name:name, icon:this._selectedIcon, type:chType})});
    }
    if (d && d.status === 'ok') { Shell.closeModal('chCreateChanModal'); Shell.toast(editId?'Обновлено':'Канал создан'); this.loadSpaces(); Shell.wsSend({type:'ch_update'}); }
    else { Shell.toast(d?.error||'Ошибка','error'); }
  },

  openDeleteChannel(spaceId, channelId) {
    var channels = this.channelsBySpace[spaceId] || [];
    var ch = channels.find(function(c){return c.id===channelId});
    this._deleteTarget = {type:'channel', spaceId:spaceId, id:channelId};
    document.getElementById('chDeleteTitle').textContent = 'Удалить канал?';
    document.getElementById('chDeleteText').textContent = 'Канал #' + (ch?ch.name:'') + ' и все сообщения будут удалены.';
    document.getElementById('chDeleteModal').classList.add('active');
  },

  async confirmDelete() {
    var t = this._deleteTarget;
    if (!t) return;
    if (t.type === 'space') {
      await Shell.api('/api/mod/channels/spaces', {method:'DELETE', body:JSON.stringify({space_id:t.id})});
    } else {
      await Shell.api('/api/mod/channels/channels', {method:'DELETE', body:JSON.stringify({space_id:t.spaceId, channel_id:t.id})});
    }
    Shell.closeModal('chDeleteModal');
    Shell.toast('Удалено');
    Shell.wsSend({type:'ch_update'});
    if (t.type === 'channel' && this.currentChannel === t.id) this.currentChannel = null;
    if (t.type === 'space' && this.currentSpace === t.id) { this.currentSpace = null; this.currentChannel = null; }
    this.loadSpaces();
    this._buildEmojiPicker();
    var self = this;
    this._memberRefresh = setInterval(function(){ if(self.currentSpace && self.membersVisible) self.loadMembers(); }, 10000);
  },

  // ─── Icon picker ───
  _renderIconPicker() {
    var icons = ['channels','servers','messenger','users','settings','search','file','play'];
    var el = document.getElementById('chIconPicker');
    if (!el) return;
    var self = this;
    el.innerHTML = icons.map(function(ic) {
      var sel = ic === self._selectedIcon ? ' selected' : '';
      return '<div class="ch-icon-opt'+sel+'" onclick="Channels._pickIcon(\x27'+ic+'\x27)"><span class="ico ico-18 ico-'+ic+'"></span></div>';
    }).join('');
  },

  _pickIcon(icon) { this._selectedIcon = icon; this._renderIconPicker(); },

  _spacePhoto: null,
  pickSpacePhoto() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { Shell.toast('Макс 2 МБ', 'error'); return; }
      var reader = new FileReader();
      reader.onload = function(ev) {
        var b64 = ev.target.result.split(',')[1];
        Channels._spacePhoto = b64;
        var prev = document.getElementById('chSpacePhotoPreview');
        if (prev) prev.innerHTML = '<img src="'+ev.target.result+'"/>';
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  removeSpacePhoto() {
    this._spacePhoto = null;
    this._removePhoto = true;
    var prev = document.getElementById('chSpacePhotoPreview');
    if (prev) prev.innerHTML = '<span class="ico ico-18 ico-attach" style="opacity:0.4"></span>';
  },

  // ─── Members ───
  async loadMembers() {
    if (!this.currentSpace) return;
    var d = await Shell.api('/api/mod/channels/members?space_id=' + this.currentSpace);
    this.members = Array.isArray(d) ? d : [];
    if (this.membersVisible) this.renderMembers();
  },

  toggleMembers() {
    this.membersVisible = !this.membersVisible;
    var el = document.getElementById('chMembers');
    if (this.membersVisible) { el.style.display = 'flex'; el.classList.add('mobile-open'); if(window.innerWidth<=768) el.style.bottom='0'; this.renderMembers(); }
    else { el.style.display = 'none'; el.classList.remove('mobile-open'); el.style.bottom=''; }
  },

  renderMembers() {
    var el = document.getElementById('chMembersList');
    if (!el) return;
    var ro = ['arcana','immortal','legendary','mythical','rare','uncommon','common'];
    var html = '';

    // Check if current channel is a voice room
    var curChs = this.channelsBySpace[this.currentSpace] || [];
    var curCh = curChs.find(function(c){return c.id===Channels.currentChannel;});
    var isVoiceCh = curCh && curCh.type === 'voice';

    if (isVoiceCh && this._voiceRoomData) {
      var roomIds = new Set(
        (this._voiceRoomData.speakers||[]).map(function(p){return p.user_id;})
        .concat((this._voiceRoomData.listeners||[]).map(function(p){return p.user_id;}))
      );
      var inRoom = this.members.filter(function(m){return roomIds.has(m.user_id);});
      var onl = this.members.filter(function(m){return m.online && !roomIds.has(m.user_id);}).sort(function(a,b){return ro.indexOf(a.role)-ro.indexOf(b.role);});
      var off = this.members.filter(function(m){return !m.online && !roomIds.has(m.user_id);});
      if (inRoom.length) html += '<div class="ch-member-group"><div class="ch-member-group-title ch-mgr-voice"><span class="ico ico-14 ico-speaker"></span> В комнате — '+inRoom.length+'</div>'+inRoom.map(function(m){return Channels._mHtml(m,false,false,true);}).join('')+'</div>';
      if (onl.length) html += '<div class="ch-member-group"><div class="ch-member-group-title">Онлайн — '+onl.length+'</div>'+onl.map(function(m){return Channels._mHtml(m,false);}).join('')+'</div>';
      if (off.length) html += '<div class="ch-member-group"><div class="ch-member-group-title">Оффлайн — '+off.length+'</div>'+off.map(function(m){return Channels._mHtml(m,true);}).join('')+'</div>';
    } else {
      var on = this.members.filter(function(m){return m.online;}).sort(function(a,b){return ro.indexOf(a.role)-ro.indexOf(b.role);});
      var off2 = this.members.filter(function(m){return !m.online;});
      if (on.length) html += '<div class="ch-member-group"><div class="ch-member-group-title">Онлайн — '+on.length+'</div>'+on.map(function(m){return Channels._mHtml(m,false);}).join('')+'</div>';
      if (off2.length) html += '<div class="ch-member-group"><div class="ch-member-group-title">Оффлайн — '+off2.length+'</div>'+off2.map(function(m){return Channels._mHtml(m,true);}).join('')+'</div>';
    }
    el.innerHTML = html;
    // Apply collapsed state
    var self2 = this;
    Object.keys(this._collapsed).forEach(function(sid) {
      if (!self2._collapsed[sid]) return;
      var g = el.querySelector('.ch-space-group[data-sid="'+sid+'"]');
      if (g) g.querySelectorAll('.ch-channel, .ch-voice-room, .ch-space-empty').forEach(function(e){e.style.display='none';});
    });
    if (!this._spaceCtxAttached) { this._attachSpaceCtx(); this._spaceCtxAttached = true; }
  },

  _mHtml(m, off, isMod, inRoom) {
    var ava = m.avatar ? '<img src="data:image/jpeg;base64,'+m.avatar+'"/>' : (m.display_name||m.username).charAt(0).toUpperCase();
    var micIco = '';
    if (inRoom) {
      var spk = this._voiceRoomData ? (this._voiceRoomData.speakers||[]).find(function(p){return p.user_id===m.user_id;}) : null;
      var isMuted = spk ? spk.muted : true;
      micIco = isMuted ? '<span class="ico ico-14 ico-mic-off"></span>' : '<span class="ico ico-14 ico-mic" style="background-color:var(--accent)"></span>';
    }
    var inRoomIco = inRoom ? '<span class="ch-member-voice-ico">' + micIco + '</span>' : '';
    return '<div class="ch-member'+(off?' offline':'')+(isMod?' moderator':'')+(inRoom?' in-voice':'')+'" oncontextmenu="event.preventDefault();Channels._memberCtx(event,\x27'+m.user_id+'\x27)">'
      + '<div class="ch-member-ava">'+ava+'</div>'
      + '<span class="ch-member-name">'+this._esc(m.display_name||m.username)+'</span>'
      + inRoomIco
      + (isMod?'<span class="ch-mod-badge">МОД</span>':'')
      + '<span class="role-badge '+m.role+'" style="font-size:8px;padding:1px 4px">'+m.role.toUpperCase()+'</span>'
      + (off?'':'<span class="ch-member-online-dot '+(m.status||'online')+'"></span>')+'</div>';
  },

  _memberCtx(e, userId) {
    var ctx = document.getElementById('chCtx');
    this._ctxMsg = null;
    this._ctxSpaceId = null;
    var member = this.members.find(function(m){return m.user_id===userId});
    var isMe = userId === this.currentUserId;
    var isArcana = member && member.role === 'arcana';
    var items = '';
    if (!isMe) {
      items += '<div class="ch-ctx-item" onclick="Shell.switchModule(\x27messenger\x27);setTimeout(function(){if(Messenger)Messenger.openChat(\x27'+userId+'\x27)},200);Channels._hideCtx()"><span class="ico ico-14 ico-messenger"></span> Написать</div>';
    }
    if (!isMe && this._voiceRoomId) {
      var inRoom = this._voiceRoomData && ((this._voiceRoomData.speakers||[]).concat(this._voiceRoomData.listeners||[])).some(function(p){return p.user_id===userId;});
      if (!inRoom) {
        items += '<div class="ch-ctx-item" onclick="Channels.inviteToVoice(\x27'+userId+'\x27);Channels._hideCtx()"><span class="ico ico-14 ico-plus"></span> Пригласить в комнату</div>';
      }
      if (inRoom && this.isAdmin) {
        items += '<div class="ch-ctx-item ch-ctx-danger" onclick="Channels.kickFromVoice(\x27'+userId+'\x27);Channels._hideCtx()"><span class="ico ico-14 ico-phone-off"></span> Отключить от комнаты</div>';
      }
    }
    if (this.isAdmin && !isArcana && !isMe) {
      var isMod = member && member.space_role === 'moderator';
      if (isMod) {
        items += '<div class="ch-ctx-item" onclick="Channels.setModerator(\x27'+userId+'\x27,false);Channels._hideCtx()"><span class="ico ico-14 ico-users"></span> Снять модератора</div>';
      } else {
        items += '<div class="ch-ctx-item" onclick="Channels.setModerator(\x27'+userId+'\x27,true);Channels._hideCtx()"><span class="ico ico-14 ico-users"></span> Назначить модератором</div>';
      }
      items += '<div class="ch-ctx-item ch-ctx-danger" onclick="Channels.kickMember(\x27'+userId+'\x27);Channels._hideCtx()"><span class="ico ico-14 ico-trash"></span> Кикнуть</div>';
    }
    if (isMe) {
      items += '<div class="ch-ctx-item ch-ctx-danger" onclick="Channels.kickMember(\x27'+userId+'\x27);Channels._hideCtx()"><span class="ico ico-14 ico-trash"></span> Выйти из группы</div>';
    }
    if (!items) return;
    ctx.innerHTML = items;
    ctx.style.display = 'block';
    ctx.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
    ctx.style.top = Math.min(e.clientY, window.innerHeight - 100) + 'px';
  },

  async setModerator(userId, value) {
    await Shell.api('/api/mod/channels/members', {method:'POST', body:JSON.stringify({space_id:this.currentSpace, set_moderator:{user_id:userId, value:value}})});
    Shell.toast(value ? 'Модератор назначен' : 'Модератор снят');
    this.loadMembers();
    Shell.wsSend({type:'ch_update'});
  },

  async openAddMembers() {
    this._selectedMembers = [];
    var d = await Shell.api('/api/mod/channels/users');
    if (!d) return;
    var existing = this.members.map(function(m){return m.user_id});
    var available = d.filter(function(u){return existing.indexOf(u.id)===-1});
    document.getElementById('chMemberPicker').innerHTML = available.map(function(u) {
      var ava = u.avatar ? '<img src="data:image/jpeg;base64,'+u.avatar+'"/>' : (u.display_name||u.username).charAt(0).toUpperCase();
      return '<div class="ch-member-pick" data-uid="'+u.id+'" onclick="Channels.toggleMemberPick(this)">'
        + '<div class="ch-member-pick-ava">'+ava+'</div>'
        + '<span class="ch-member-name">'+(u.display_name||u.username)+'</span>'
        + '<span class="role-badge '+u.role+'" style="font-size:8px;padding:1px 4px">'+u.role.toUpperCase()+'</span></div>';
    }).join('') || '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:12px">Все уже добавлены</div>';
    document.getElementById('chAddMembersModal').classList.add('active');
  },

  toggleMemberPick(el) {
    el.classList.toggle('selected');
    var uid = el.dataset.uid, idx = this._selectedMembers.indexOf(uid);
    if (idx === -1) this._selectedMembers.push(uid); else this._selectedMembers.splice(idx, 1);
  },

  filterMemberPicker(q) {
    q = q.toLowerCase();
    document.querySelectorAll('.ch-member-pick').forEach(function(el) {
      el.style.display = q && !(el.querySelector('.ch-member-name')?.textContent||'').toLowerCase().includes(q) ? 'none' : '';
    });
  },

  async addSelectedMembers() {
    if (!this._selectedMembers.length) return;
    await Shell.api('/api/mod/channels/members', {method:'POST', body:JSON.stringify({space_id:this.currentSpace, user_ids:this._selectedMembers})});
    Shell.closeModal('chAddMembersModal'); Shell.toast('Добавлены'); this.loadMembers(); Shell.wsSend({type:'ch_update'});
  },

  // ─── Helpers ───
  _updateUnread(channelId, count) {
    // Update badge in sidebar
    var el = document.querySelector('.ch-channel[data-chid="'+channelId+'"] .ch-unread-badge');
    if (el) { el.textContent = count; el.style.display = count > 0 ? '' : 'none'; }
  },

  // ─── Context Menu ───
  _attachSpaceCtx() {
    var sidebar = document.getElementById('chSidebarList');
    if (!sidebar || !this.isAdmin) return;
    var self = this;
    sidebar.addEventListener('contextmenu', function(e) {
      var header = e.target.closest('.ch-space-header');
      if (!header) return;
      e.preventDefault();
      var sid = header.closest('.ch-space-group')?.dataset.sid;
      if (!sid) return;
      self._showSpaceCtx(sid, e.clientX, e.clientY);
    });
    var timer = null;
    sidebar.addEventListener('touchstart', function(e) {
      var header = e.target.closest('.ch-space-header');
      if (!header) return;
      timer = setTimeout(function() {
        var sid = header.closest('.ch-space-group')?.dataset.sid;
        if (!sid) return;
        window.getSelection().removeAllRanges();
        if (navigator.vibrate) navigator.vibrate(30);
        var t = e.touches[0];
        self._showSpaceCtx(sid, t.clientX, t.clientY);
      }, 500);
    });
    sidebar.addEventListener('touchend', function(){clearTimeout(timer)});
    sidebar.addEventListener('touchmove', function(){clearTimeout(timer)});
  },

  _showSpaceCtx(spaceId, x, y) {
    var ctx = document.getElementById('chCtx');
    this._ctxMsg = null;
    this._ctxSpaceId = spaceId;
    var sp = this.spaces.find(function(s){return s.id===spaceId});
    ctx.innerHTML = '<div class="ch-ctx-item" onclick="Channels._spaceCtxAction(\x27add_channel\x27)"><span class="ico ico-14 ico-channels"></span> Создать канал</div>'
      + '<div class="ch-ctx-item" onclick="Channels._spaceCtxAction(\x27edit\x27)"><span class="ico ico-14 ico-pencil"></span> Изменить группу</div>'
      + '<div class="ch-ctx-item ch-ctx-danger" onclick="Channels._spaceCtxAction(\x27delete\x27)"><span class="ico ico-14 ico-trash"></span> Удалить группу</div>';
    ctx.style.display = 'block';
    var cw = ctx.offsetWidth, ch = ctx.offsetHeight;
    ctx.style.left = Math.min(x, window.innerWidth - cw - 8) + 'px';
    ctx.style.top = Math.min(y, window.innerHeight - ch - 8) + 'px';
  },

  _spaceCtxAction(action) {
    var sid = this._ctxSpaceId;
    this._hideCtx();
    if (action === 'add_channel') this.openCreateChannel(sid);
    else if (action === 'edit') this.openEditSpace(sid);
    else if (action === 'delete') this.openDeleteSpace(sid);
  },

  _attachMsgEvents() {
    var el = document.getElementById('chMessages');
    if (!el) return;
    var self = this;
    // Right click
    el.addEventListener('contextmenu', function(e) {
      var row = e.target.closest('.ch-msg');
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      self._showCtx(row, e.clientX, e.clientY);
    });
    // Long press (mobile)
    var _startX = 0, _startY = 0, _moved = false;
    el.addEventListener('touchstart', function(e) {
      var row = e.target.closest('.ch-msg');
      if (!row) return;
      _startY = e.touches[0].clientY;
      _startX = e.touches[0].clientX;
      _moved = false;
      self._longTimer = setTimeout(function() {
        if (_moved) return;
        window.getSelection().removeAllRanges();
        if (navigator.vibrate) navigator.vibrate(30);
        self._showCtx(row, _startX, _startY);
      }, 400);
    }, {passive:true});
    el.addEventListener('touchend', function() { clearTimeout(self._longTimer); }, {passive:true});
    el.addEventListener('touchmove', function(e) {
      if (Math.abs(e.touches[0].clientY - _startY) > 8 || Math.abs(e.touches[0].clientX - _startX) > 8) {
        _moved = true;
        clearTimeout(self._longTimer);
      }
    }, {passive:true});
    // Close on click outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#chCtx') && !e.target.closest('.ch-react-picker')) self._hideCtx();
      if (self._pinsVisible && !e.target.closest('#chPinsPanel') && !e.target.closest('#chPinBar')) {
        self._pinsVisible = false;
        var pp = document.getElementById('chPinsPanel');
        if (pp) pp.style.display = 'none';
      }
      if (self._emojiOpen && !e.target.closest('#chEmojiPicker') && !e.target.closest('.ch-emoji-btn')) {
        self._emojiOpen = false;
        var ep = document.getElementById('chEmojiPicker');
        if (ep) ep.style.display = 'none';
      }
    });
    document.addEventListener('touchstart', function(e) {
      if (!e.target.closest('#chCtx')) self._hideCtx();
    }, {passive:true});
  },

  _showCtx(row, x, y) {
    var msgId = row.dataset.msgid;
    var msg = this.messages.find(function(m){return m.id===msgId});
    if (!msg) return;
    this._ctxMsg = msg;
    this._ctxSpaceId = null;
    var self = this;
    var isOwn = msg.from === this.currentUserId;
    var ctx = document.getElementById('chCtx');
    // Build menu dynamically
    ctx.innerHTML = '<div class="ch-ctx-item" data-action="react"><span class="ico ico-14 ico-emoji"></span> Реакция</div>'
      + '<div class="ch-ctx-item" data-action="reply"><span class="ico ico-14 ico-reply"></span> Ответить</div>'
      + '<div class="ch-ctx-item" data-action="copy"><span class="ico ico-14 ico-copy"></span> Копировать</div>'
      + '<div class="ch-ctx-item" data-action="forward"><span class="ico ico-14 ico-forward"></span> Переслать</div>'
      + (self.isAdmin ? '<div class="ch-ctx-item" data-action="pin"><span class="ico ico-14 ico-pin"></span> Закрепить</div>' : '')
      + (isOwn ? '<div class="ch-ctx-item" data-action="edit"><span class="ico ico-14 ico-pencil"></span> Редактировать</div>' : '')
      + ((isOwn || self.isAdmin) ? '<div class="ch-ctx-item ch-ctx-danger" data-action="delete"><span class="ico ico-14 ico-trash"></span> Удалить</div>' : '');
    ctx.style.display = 'block';
    // Position
    var cw = ctx.offsetWidth, ch2 = ctx.offsetHeight;
    ctx.style.left = Math.min(x, window.innerWidth - cw - 8) + 'px';
    ctx.style.top = Math.min(y, window.innerHeight - ch2 - 8) + 'px';
    // Action handlers
    ctx.querySelectorAll('.ch-ctx-item').forEach(function(item) {
      item.onclick = function() { self._ctxAction(item.dataset.action); };
    });
  },

  _hideCtx() {
    document.getElementById('chCtx').style.display = 'none';
    this._ctxMsg = null;
  },

  _ctxAction(action) {
    var msg = this._ctxMsg;
    this._hideCtx();
    if (!msg) return;
    if (action === 'copy') {
      navigator.clipboard.writeText(msg.text || '').then(function(){Shell.toast('Скопировано')});
    } else if (action === 'react') {
      this._showReactPicker(msg);
    } else if (action === 'pin') {
      this.pinMessage(msg);
    } else if (action === 'forward') {
      this.forwardToMessenger(msg);
    } else if (action === 'reply') {
      this.setReply(msg);
    } else if (action === 'edit') {
      this.startEdit(msg);
    } else if (action === 'delete') {
      this.deleteMessage(msg);
    }
  },

  // ─── Emoji Picker ───
  _emojiList: ['😀','😂','😍','🥺','😢','😡','🤔','👍','👎','❤️','🔥','🎉','✅','❌','👀','🙏','💪','😎','🤝','💯','⭐','🚀','💬','📌','🎯','🏆','💡','🎵','☕','🍕','🐱','🐶','🌈','⚡','🌙','🍀'],

  toggleEmoji() {
    this._emojiOpen = !this._emojiOpen;
    var picker = document.getElementById('chEmojiPicker');
    if (!picker) return;
    picker.style.display = this._emojiOpen ? 'grid' : 'none';
  },

  insertEmoji(emoji) {
    var input = document.getElementById('chInput');
    var pos = input.selectionStart || input.value.length;
    input.value = input.value.substring(0, pos) + emoji + input.value.substring(pos);
    input.focus();
    this.updateSendBtn();
  },

  _buildEmojiPicker() {
    var picker = document.getElementById('chEmojiPicker');
    if (!picker) return;
    picker.innerHTML = this._emojiList.map(function(e) {
      return '<span class="ch-emoji-item" onclick="event.stopPropagation();Channels.insertEmoji(\x27'+e+'\x27)">'+e+'</span>';
    }).join('');
  },

  // ─── Reactions ───
  _reactEmojis: ['👍','❤️','😂','😮','😢','🔥','👎','🎉'],

  _showReactPicker(msg) {
    var existing = document.getElementById('chReactPicker');
    if (existing) existing.remove();
    var picker = document.createElement('div');
    picker.id = 'chReactPicker';
    picker.className = 'ch-react-picker';
    var self = this;
    picker.innerHTML = this._reactEmojis.map(function(e) {
      return '<span class="ch-react-emoji" onclick="event.stopPropagation();Channels.addReaction(\x27'+msg.id+'\x27,\x27'+e+'\x27)">' + e + '</span>';
    }).join('');
    // Position near message
    var row = document.querySelector('.ch-msg[data-msgid="'+msg.id+'"]');
    if (row) {
      var rect = row.getBoundingClientRect();
      picker.style.position = 'fixed';
      picker.style.top = Math.min(rect.bottom, window.innerHeight - 50) + 'px';
      picker.style.left = Math.max(rect.left, 16) + 'px';
    }
    document.body.appendChild(picker);
    setTimeout(function() {
      document.addEventListener('click', function rem() { picker.remove(); document.removeEventListener('click', rem); });
    }, 50);
  },

  addReaction(msgId, emoji) {
    var p = document.getElementById('chReactPicker');
    if (p) p.remove();
    Shell.wsSend({type:'ch_react', channel_id:this.currentChannel, space_id:this.currentSpace, msg_id:msgId, emoji:emoji});
  },

  _renderReactions(reactions, msgId) {
    if (!reactions || !Object.keys(reactions).length) return '';
    var self = this;
    var html = '<div class="ch-reactions">';
    Object.keys(reactions).forEach(function(emoji) {
      var r = reactions[emoji];
      var count = r.length;
      var myReact = r.indexOf(self.currentUserId) !== -1;
      html += '<span class="ch-reaction'+(myReact?' mine':'')+'" onclick="event.stopPropagation();Channels.addReaction(\x27'+msgId+'\x27,\x27'+emoji+'\x27)">'+emoji+' '+count+'</span>';
    });
    html += '</div>';
    return html;
  },

  // ─── Pins ───
  pinMessage(msg) {
    Shell.wsSend({type:'ch_pin', channel_id:this.currentChannel, space_id:this.currentSpace, msg_id:msg.id});
  },

  unpinMessage(msgId) {
    Shell.wsSend({type:'ch_unpin', channel_id:this.currentChannel, space_id:this.currentSpace, msg_id:msgId});
  },

  async loadPins() {
    if (!this.currentChannel) return;
    var d = await Shell.api('/api/mod/channels/pins?channel_id=' + this.currentChannel);
    this._pins = Array.isArray(d) ? d : [];
    this._renderPinBar();
    if (this._pinsVisible) this._renderPinsPanel();
  },

  _renderPinBar() {
    var bar = document.getElementById('chPinBar');
    if (!bar) return;
    if (!this._pins.length) { bar.style.display = 'none'; return; }
    var last = this._pins[this._pins.length - 1];
    bar.style.display = 'flex';
    bar.onclick = function() { Channels.togglePinsPanel(); };
    bar.innerHTML = '<span class="ico ico-14 ico-pin" style="color:var(--accent);flex-shrink:0"></span>'
      + '<div class="ch-pin-text">' + this._esc(last.text || '').substring(0, 60) + '</div>'
      + '<span class="ch-pin-count">' + this._pins.length + '</span>';
  },

  togglePinsPanel() {
    this._pinsVisible = !this._pinsVisible;
    if (this._pinsVisible) { this._renderPinsPanel(); }
    else { var p = document.getElementById('chPinsPanel'); if (p) p.style.display = 'none'; }
  },

  _renderPinsPanel() {
    var panel = document.getElementById('chPinsPanel');
    if (!panel) return;
    panel.style.display = 'block';
    var self = this;
    var items = this._pins.map(function(p) {
      return '<div class="ch-pin-item" data-pinid="' + p.id + '">'
        + '<div class="ch-pin-item-body" onclick="Channels.scrollToMsg(\x27'+p.id+'\x27);Channels.togglePinsPanel()">'
        + '<div class="ch-pin-item-author">' + self._esc(p.from_name || '') + '</div>'
        + '<div class="ch-pin-item-text">' + self._esc(p.text || '').substring(0, 120) + '</div>'
        + '</div>'
        + (self.isAdmin ? '<button class="ch-pin-unpin" data-id="' + p.id + '"><span class="ico ico-14 ico-pin" style="color:currentColor"></span></button>' : '')
        + '</div>';
    }).join('');
    panel.innerHTML = items || '<div class="ch-pins-empty">Нет закреплённых сообщений</div>';
    // Event delegation for unpin buttons
    panel.querySelectorAll('.ch-pin-unpin').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        Channels.unpinMessage(id);
      };
    });
  },

  // ─── Kick ───
  kickMember(userId) {
    Shell.wsSend({type:'ch_kick', space_id:this.currentSpace, user_id:userId});
    Shell.toast('Участник удалён');
  },

  // ─── Forward to Messenger ───
  forwardToMessenger(msg) {
    var sp = this.spaces.find(function(s){return s.id===msg.space_id}) || {};
    var channels = this.channelsBySpace[msg.space_id || this.currentSpace] || [];
    var ch = channels.find(function(c){return c.id===(msg.channel_id||Channels.currentChannel)}) || {};
    var source = '#' + (ch.name||'канал') + ' (' + (sp.name||'группа') + ')';
    var text = msg.text || '';
    var preview = text.length > 60 ? text.substring(0,60)+'...' : (text || 'Вложение');

    Shell.switchModule('messenger');
    setTimeout(function() {
      if (window.Messenger) {
        Messenger.cancelEdit(); Messenger.cancelReply();
        Messenger.forwardPending = {
          type:'channel_forward',
          text: '📨 Переслано из ' + source + '\n' + (msg.from_name||'') + ': ' + text,
          fromName: msg.from_name || '',
          fromId: msg.from || '',
          preview: '📨 ' + source + ': ' + preview
        };
        Messenger._closeForForward();
        Messenger._showForwardBanner('📨 ' + source + ': ' + preview);
      }
    }, 250);
  },

  // ─── Reply ───
  setReply(msg) {
    this._replyTo = msg;
    this._editMsg = null;
    document.getElementById('chReplyBar').style.display = 'flex';
    document.getElementById('chReplyName').textContent = msg.from_name || msg.from;
    document.getElementById('chReplyText').textContent = msg.text || '';
    // Hide edit bar if shown
    var eb = document.getElementById('chEditBar');
    if (eb) eb.style.display = 'none';
    this._toggleComposerBar();
    if (window.innerWidth > 768) document.getElementById('chInput').focus();
  },

  cancelReply() {
    this._replyTo = null;
    document.getElementById('chReplyBar').style.display = 'none';
    this._toggleComposerBar();
    this.updateSendBtn();
  },

  _toggleComposerBar() {
    var area = document.getElementById('chInputArea');
    if (area) area.classList.toggle('has-bar', !!(this._replyTo || this._editMsg));
  },

  // ─── Edit ───
  startEdit(msg) {
    this._editMsg = msg;
    this._replyTo = null;
    document.getElementById('chReplyBar').style.display = 'none';
    var input = document.getElementById('chInput');
    input.value = msg.text || '';
    this.autoResize(input);
    input.focus();
    // Show edit bar
    var area = document.getElementById('chInputArea');
    var bar = document.getElementById('chEditBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'chEditBar';
      bar.className = 'ch-edit-bar';
      bar.innerHTML = '<span class="ch-bar-icon ico ico-16 ico-pencil"></span><span class="ch-edit-label">Редактирование сообщения</span><button class="ch-edit-close" onclick="Channels.cancelEdit()"><span class="ico ico-14 ico-close"></span></button>';
      area.parentNode.insertBefore(bar, area);
    }
    bar.style.display = 'flex';
    this._toggleComposerBar();
  },

  cancelEdit() {
    this._editMsg = null;
    document.getElementById('chInput').value = '';
    var bar = document.getElementById('chEditBar');
    if (bar) bar.style.display = 'none';
    this._toggleComposerBar();
    this.updateSendBtn();
  },

  // ─── Delete ───
  deleteMessage(msg) {
    Shell.wsSend({type:'ch_delete', channel_id:this.currentChannel, space_id:this.currentSpace, msg_id:msg.id});
  },

  // ─── Attachments ───
  updateSendBtn() {
    var input = document.getElementById('chInput');
    var btn = document.getElementById('chSendBtn');
    if (!btn) return;
    var hasContent = (input && input.value.trim().length > 0) || this._pendingFiles.length > 0 || this._replyTo || this._editMsg;
    var mode = hasContent ? 'send' : 'mic';
    if (mode === this._sendMode) return; // no change — avoid re-render/jank on each keystroke
    this._sendMode = mode;
    btn.innerHTML = mode === 'send'
      ? '<span class="ico ico-18 ico-send ico-swap-anim" style="background-color:var(--accent)"></span>'
      : '<span class="ico ico-18 ico-mic ico-swap-anim" style="background-color:var(--text-dim)"></span>';
  },

  onSendClick() {
    var input = document.getElementById('chInput');
    if (this._pendingFiles.length > 0) {
      this.confirmUpload();
    } else if (input && input.value.trim()) {
      this.send();
    } else {
      this.toggleVoice();
    }
  },

  pickFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar';
    var self = this;
    input.onchange = function(e) {
      var files = Array.from(e.target.files);
      if (!files.length) return;
      self._pendingFiles = [];
      files.forEach(function(f, i) {
        var entry = {file:f, preview:null, isImage:/^image\//.test(f.type)};
        if (entry.isImage) {
          var r = new FileReader();
          r.onload = function(ev) { entry.preview = ev.target.result; self._renderUploadPreview(); };
          r.readAsDataURL(f);
        }
        self._pendingFiles.push(entry);
      });
      self._renderUploadPreview();
      document.getElementById('chUploadPreview').style.display = 'block';
      self.updateSendBtn();
    };
    input.click();
  },

  _renderUploadPreview() {
    var el = document.getElementById('chUploadItems');
    if (!el) return;
    var xBtn = '<button class="ch-upload-x" onclick="event.stopPropagation();Channels.removePending(IDX)"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    var fileIconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    el.innerHTML = this._pendingFiles.map(function(f, i) {
      var x = xBtn.replace('IDX', i);
      if (f.isImage && f.preview) {
        return '<div class="ch-upload-thumb">'
          + '<div class="ch-upload-thumb-inner"><img src="'+f.preview+'"/></div>'
          + x + '</div>';
      }
      var size = f.file.size > 0 ? Channels._fmtSize(f.file.size) : '';
      return '<div class="ch-upload-file">'
        + '<div class="ch-upload-file-icon">'+fileIconSvg+'</div>'
        + '<div class="ch-upload-file-meta"><div class="ch-upload-fname">'+Channels._esc(f.file.name)+'</div><div class="ch-upload-fsize">'+Channels._esc(size)+'</div></div>'
        + x + '</div>';
    }).join('');
  },

  removePending(i) {
    this._pendingFiles.splice(i, 1);
    if (!this._pendingFiles.length) { this.cancelUpload(); return; }
    this._renderUploadPreview();
  },

  cancelUpload() {
    this._pendingFiles = [];
    document.getElementById('chUploadPreview').style.display = 'none';
    this.updateSendBtn();
  },

  confirmUpload() {
    var files = this._pendingFiles.map(function(f){return f.file});
    document.getElementById('chUploadPreview').style.display = 'none';
    this._pendingFiles = [];
    this.updateSendBtn();
    this.uploadFiles(files);
  },

  async uploadFiles(files) {
    if (!files || !files.length || !this.currentChannel) return;
    var fd = new FormData();
    fd.append('channel_id', this.currentChannel);
    fd.append('space_id', this.currentSpace);
    fd.append('text', document.getElementById('chInput').value.trim());
    if (this._replyTo) { fd.append('reply_to', this._replyTo.id); fd.append('reply_name', this._replyTo.from_name||''); fd.append('reply_text', (this._replyTo.text||'').substring(0,100)); }
    for (var i = 0; i < files.length && i < 7; i++) fd.append('file', files[i]);
    document.getElementById('chInput').value = '';
    this.cancelReply();
    try {
      var r = await fetch('/api/ch/upload', {method:'POST', headers:{'Authorization':'Bearer '+Shell.token}, body:fd});
      var d = await r.json();
      if (!d || d.error) Shell.toast(d?.error||'Ошибка','error');
    } catch(e) { Shell.toast('Ошибка загрузки','error'); }
  },

  toggleVoice() {
    if (this._recording) return;
    var self = this;
    navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream) {
      self._recording = true;
      self._recChunks = [];
      self._recStart = Date.now();
      self._recSec = 0;
      var opts = {mimeType:'audio/webm;codecs=opus'};
      if (!MediaRecorder.isTypeSupported(opts.mimeType)) opts = {};
      self._recorder = new MediaRecorder(stream, opts);
      self._recorder.ondataavailable = function(e) { if(e.data.size>0) self._recChunks.push(e.data); };
      self._recorder.onstop = function() {
        stream.getTracks().forEach(function(t){t.stop()});
        clearInterval(self._recTimer);
        var dur = Math.round((Date.now()-self._recStart)/1000);
        if (dur < 1) { self._hideRecBar(); return; }
        var blob = new Blob(self._recChunks, {type:'audio/webm'});
        var file = new File([blob], 'voice_'+Date.now()+'_'+dur+'s.webm', {type:'audio/webm'});
        self._hideRecBar();
        self.uploadFiles([file]);
      };
      self._recorder.start();
      // Show recording bar
      document.getElementById('chInputArea').style.display = 'none';
      document.getElementById('chRecordBar').style.display = 'flex';
      self._recTimer = setInterval(function() {
        self._recSec++;
        var m = Math.floor(self._recSec/60), s = ('0'+(self._recSec%60)).slice(-2);
        document.getElementById('chRecTime').textContent = m+':'+s;
      }, 1000);
    }).catch(function(){ Shell.toast('Нет доступа к микрофону','error'); });
  },

  stopVoice() {
    if (this._recorder && this._recorder.state === 'recording') this._recorder.stop();
  },

  cancelVoice() {
    if (this._recorder) {
      this._recorder.ondataavailable = null;
      this._recorder.onstop = function() {};
      if (this._recorder.state === 'recording') this._recorder.stop();
    }
    clearInterval(this._recTimer);
    this._recording = false;
    this._hideRecBar();
  },

  _hideRecBar() {
    this._recording = false;
    document.getElementById('chRecordBar').style.display = 'none';
    document.getElementById('chInputArea').style.display = 'flex';
    this.updateSendBtn();
  },

  // ─── Attachment rendering ───
  _renderAttachments(atts) {
    if (!atts || !atts.length) return '';
    var html = '';
    for (var i = 0; i < atts.length; i++) {
      var a = atts[i];
      if (a.type === 'image') {
        html += '<div class="ch-att-img" onclick="Channels.openViewer(\x27image\x27,\x27/api/msg/file/'+a.id+'\x27)"><img src="/api/msg/file/'+a.id+'/thumb" loading="lazy"/></div>';
      } else if (a.type === 'audio') {
        var dur = a.duration || 0;
        var mm = Math.floor(dur/60), ss = ('0'+(dur%60)).slice(-2);
        var durTxt = mm+':'+ss;
        var isVoice = a.name && a.name.startsWith('voice_');
        var btn = '<button class="ch-audio-btn" onclick="event.stopPropagation();Channels.playAudio(\x27'+a.id+'\x27)"><span class="ch-audio-icon" data-aid="'+a.id+'">'+Channels._playIco+'</span></button>';
        if (isVoice) {
          html += '<div class="ch-audio-player voice" data-aid="'+a.id+'" data-dur="'+dur+'">'
            + btn
            + '<div class="ch-audio-wave" data-aid="'+a.id+'" onclick="event.stopPropagation();Channels.seekAudio(event,\x27'+a.id+'\x27)">'
            + this._buildWaveBars(36, 0, 'var(--accent)', '#d2dae3') + '</div>'
            + '<span class="ch-audio-time" data-aid="'+a.id+'">'+durTxt+'</span></div>';
        } else {
          var nm = a.name ? a.name.replace(/\.[^.]+$/, '') : '';
          if (nm.length > 30) nm = nm.substring(0, 28) + '...';
          html += '<div class="ch-audio-player" data-aid="'+a.id+'" data-dur="'+dur+'">'
            + btn
            + '<div class="ch-audio-info">'
            + '<div class="ch-audio-name-row"><span class="ch-audio-name">'+this._esc(nm)+'</span>'
            + '<span class="ch-audio-time" data-aid="'+a.id+'">'+durTxt+'</span></div>'
            + '<div class="ch-audio-wave" data-aid="'+a.id+'" onclick="event.stopPropagation();Channels.seekAudio(event,\x27'+a.id+'\x27)">'
            + this._buildWaveBars(44, 0, 'var(--accent)', 'var(--border)') + '</div>'
            + '</div></div>';
        }
      } else if (a.type === 'video') {
        html += '<div class="ch-att-video" onclick="Channels.openViewer(\x27video\x27,\x27/api/msg/file/'+a.id+'\x27)"><video preload="none" src="/api/msg/file/'+a.id+'" style="max-width:320px;max-height:240px;border-radius:8px"></video><div class="ch-video-play">▶</div></div>';
      } else {
        var sz = a.size > 1048576 ? (a.size/1048576).toFixed(1)+' МБ' : Math.round(a.size/1024)+' КБ';
        html += '<a class="ch-att-file" href="/api/msg/file/'+a.id+'" download="'+this._esc(a.name)+'" onclick="event.stopPropagation()"><span class="ch-att-file-icon"><span class="ico ico-18 ico-file"></span></span><div class="ch-att-file-info"><div class="ch-att-file-name">'+this._esc(a.name)+'</div><div class="ch-att-size">'+sz+'</div></div></a>';
      }
    }
    return '<div class="ch-att-wrap">'+html+'</div>';
  },

  // ─── Media Viewer ───
  openViewer(type, url) {
    var el = document.getElementById('chViewerContent');
    if (type === 'image') {
      el.innerHTML = '<img src="'+url+'" style="max-width:90vw;max-height:90vh;border-radius:8px"/>';
    } else {
      el.innerHTML = '<video controls autoplay src="'+url+'" style="max-width:90vw;max-height:90vh;border-radius:8px"></video>';
    }
    document.getElementById('chMediaViewer').style.display = 'flex';
  },

  closeViewer() {
    document.getElementById('chMediaViewer').style.display = 'none';
    document.getElementById('chViewerContent').innerHTML = '';
  },

  // ─── Audio Player ───
  _playIco: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
  _pauseIco: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2"/></svg>',

  _buildWaveBars(count, played, cPlayed, cRest) {
    var H = [8,15,22,12,18,9,14,20,7,13,17,10,16,19,11,21,8,14];
    var html = '';
    for (var i = 0; i < count; i++) {
      var h = H[i % H.length];
      var col = i < played ? cPlayed : cRest;
      html += '<span class="ch-audio-wave-bar" data-idx="'+i+'" style="height:'+h+'px;background:'+col+'"></span>';
    }
    return html;
  },

  _updateWaveBars(aid, pct) {
    var wave = document.querySelector('.ch-audio-wave[data-aid="'+aid+'"]');
    if (!wave) return;
    var bars = wave.querySelectorAll('.ch-audio-wave-bar');
    var count = bars.length;
    var played = Math.round(pct / 100 * count);
    var player = wave.closest('.ch-audio-player');
    var isVoice = player && player.classList.contains('voice');
    var cPlayed = 'var(--accent)';
    var cRest = isVoice ? '#d2dae3' : 'var(--border)';
    bars.forEach(function(b, i) { b.style.background = i < played ? cPlayed : cRest; });
  },

  playAudio(aid) {
    var url = '/api/msg/file/' + aid;
    if (this._activeAudioId === aid && this._activeAudio && !this._activeAudio.paused) {
      this._activeAudio.pause();
      var ic = document.querySelector('.ch-audio-icon[data-aid="'+aid+'"]');
      if (ic) ic.innerHTML = this._playIco;
      var pp = document.querySelector('.ch-audio-player[data-aid="'+aid+'"]');
      if (pp) pp.classList.remove('playing');
      return;
    }
    if (this._activeAudioId === aid && this._activeAudio && this._activeAudio.paused) {
      this._activeAudio.play();
      var ic = document.querySelector('.ch-audio-icon[data-aid="'+aid+'"]');
      if (ic) ic.innerHTML = this._pauseIco;
      var pp2 = document.querySelector('.ch-audio-player[data-aid="'+aid+'"]');
      if (pp2) { pp2.classList.remove('playing'); void pp2.offsetWidth; pp2.classList.add('playing'); }
      return;
    }
    if (this._activeAudio) {
      this._activeAudio.pause();
      var oldPlayer = document.querySelector('.ch-audio-player[data-aid="'+this._activeAudioId+'"]');
      if (oldPlayer) { oldPlayer.classList.remove('playing'); var oic = oldPlayer.querySelector('.ch-audio-icon'); if (oic) oic.innerHTML = this._playIco; }
      this._updateWaveBars(this._activeAudioId, 0);
    }
    this._activeAudioId = aid;
    this._activeAudio = new Audio(url);
    var ic = document.querySelector('.ch-audio-icon[data-aid="'+aid+'"]');
    if (ic) ic.innerHTML = this._pauseIco;
    var player = document.querySelector('.ch-audio-player[data-aid="'+aid+'"]');
    if (player) { player.classList.remove('playing'); void player.offsetWidth; player.classList.add('playing'); }
    var self = this;
    this._activeAudio.ontimeupdate = function() {
      var timeEl = document.querySelector('.ch-audio-time[data-aid="'+aid+'"]');
      if (self._activeAudio.duration) self._updateWaveBars(aid, self._activeAudio.currentTime/self._activeAudio.duration*100);
      if (timeEl) {
        var t = Math.floor(self._activeAudio.currentTime);
        timeEl.textContent = Math.floor(t/60)+':'+('0'+(t%60)).slice(-2);
      }
    };
    this._activeAudio.onended = function() {
      if (ic) ic.innerHTML = self._playIco;
      var pl = document.querySelector('.ch-audio-player[data-aid="'+aid+'"]');
      if (pl) pl.classList.remove('playing');
      self._updateWaveBars(aid, 0);
      var dur = parseInt(document.querySelector('.ch-audio-player[data-aid="'+aid+'"]')?.dataset.dur||'0');
      var timeEl = document.querySelector('.ch-audio-time[data-aid="'+aid+'"]');
      if (timeEl) timeEl.textContent = Math.floor(dur/60)+':'+('0'+(dur%60)).slice(-2);
    };
    this._activeAudio.play();
  },

  seekAudio(e, aid) {
    if (!this._activeAudio || this._activeAudioId !== aid) return;
    var bar = e.currentTarget;
    var rect = bar.getBoundingClientRect();
    var pct = (e.clientX - rect.left) / rect.width;
    if (this._activeAudio.duration) {
      this._activeAudio.currentTime = pct * this._activeAudio.duration;
      this._updateWaveBars(aid, pct * 100);
    }
  },

  autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; },
  _fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' КБ';
    return (bytes / 1048576).toFixed(1) + ' МБ';
  },
  _fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000), now = new Date();
    var hm = d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    return d.toDateString() === now.toDateString() ? hm : d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+' '+hm;
  },
  _showChannelNotify(msg, channelId, spaceId) {
    var channels = this.channelsBySpace[spaceId] || [];
    var ch = channels.find(function(c){return c.id===channelId});
    var sp = this.spaces.find(function(s){return s.id===spaceId});
    var chName = ch ? ch.name : 'канал';
    var spName = sp ? sp.name : '';

    var existing = document.querySelector('.ch-notify');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.className = 'ch-notify';
    el.innerHTML = '<div class="ch-notify-icon"><span class="ico ico-16 ico-channels"></span></div>'
      + '<div class="ch-notify-body">'
      + '<div class="ch-notify-source">#' + Channels._esc(chName) + (spName ? ' · ' + Channels._esc(spName) : '') + '</div>'
      + '<div class="ch-notify-author">' + Channels._esc(msg.from_name || '') + '</div>'
      + '<div class="ch-notify-text">' + Channels._esc((msg.text||'').substring(0,80)) + '</div>'
      + '</div>'
      + '<button class="ch-notify-close" onclick="event.stopPropagation();this.parentNode.remove()">&times;</button>';
    el.onclick = function() {
      el.remove();
      Shell.switchModule('channels');
      setTimeout(function() { Channels.openChannel(spaceId, channelId); }, 200);
    };
    document.body.appendChild(el);
    setTimeout(function() { if (el.parentNode) { el.style.opacity = '0'; setTimeout(function(){el.remove()},300); } }, 6000);
  },

  scrollToMsg(id) {
    var el = document.querySelector('.ch-msg[data-msgid="'+id+'"]');
    if (el) { el.scrollIntoView({behavior:'smooth',block:'center'}); el.style.background='rgba(0,212,170,0.1)'; setTimeout(function(){el.style.background=''},1500); }
  },

  _esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; },
  _fmt(text) { return this._esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/@(\w+)/g, '<span class="ch-mention">@$1</span>'); },

  // ─── Voice Rooms ───
  _voiceRooms: {},
  _voiceRoomId: null,
  _voiceSpaceId: null,
  _voiceIsSpk: false,
  _voiceStream: null,
  _voicePeers: {},
  _voiceRemoteStreams: {},
  _voiceMuted: true,
  _voiceVideoMuted: true,
  _voiceHandRaised: false,
  _voiceRoomData: null,
  _voiceMyId: null,
  _voiceSpeaking: false,
  _vadCtx: null,
  _vsTestActive: false,
  _vsTestStream: null,
  _vsTestCtx: null,
  _chanIsVoice: false,
  _iceCandidateQueues: {},

  _iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
    {urls: ['turn:horseoff-workspace.ru:3478', 'turn:horseoff-workspace.ru:3478?transport=tcp'], username: 'horseoffturnvoice', credential: 'VLjNdf[8h%QYBGy'}
  ],

  async loadVoiceRooms(spaceId) {
    var d = await Shell.api('/api/mod/channels/voice_rooms?space_id=' + spaceId);
    if (d) Object.assign(this._voiceRooms, d);
    this.renderSidebar();
  },

  // Open voice channel — show pre-join or active room in main area
  async openVoiceChannel(spaceId, roomId) {
    // If already in a different voice room, ask to leave
    if (this._voiceRoomId && this._voiceRoomId !== roomId) {
      var ok = confirm('Вы уже подключены к голосовой комнате. Выйти и подключиться к новой?');
      if (!ok) return;
      this.leaveVoiceRoom();
    }
    this.currentSpace = spaceId;
    this.currentChannel = roomId;
    this.renderSidebar();
    var channels = this.channelsBySpace[spaceId] || [];
    var ch = channels.find(function(c){return c.id===roomId});

    // Header
    var lbl = document.getElementById('chChatChannelLabel');
    var chIconCls = 'ico-' + ((ch && ch.icon) ? ch.icon : 'microphone');
    if (lbl) lbl.innerHTML = '<span class="ico ico-16 ' + chIconCls + '" style="background-color:var(--accent);margin-right:6px"></span><span id="chChatName">' + this._esc(ch ? ch.name : '—') + '</span>';
    document.getElementById('chChatHead').style.display = 'flex';
    document.getElementById('chChat').classList.add('mobile-open');
    if (window.innerWidth <= 768) { var sb = document.querySelector('.sidebar'); if (sb) sb.style.display = 'none'; }

    // Show voice area, hide text area
    document.getElementById('chMessages').style.display = 'none';
    document.getElementById('chInputArea').style.display = 'none';
    document.getElementById('chPinBar').style.display = 'none';
    document.getElementById('chPinsPanel').style.display = 'none';
    document.getElementById('chSearchBtn').style.display = 'none';
    document.getElementById('chVoiceSettingsBtn').style.display = '';
    var vm = document.getElementById('chVoiceMain');
    if (vm) { vm.style.display = 'flex'; vm.style.flexDirection = 'column'; }

    // Hide minimized bar while on this room
    var bar = document.getElementById('sidebarVoiceBar');
    if (bar) bar.style.display = 'none';

    await this.loadMembers();

    if (this._voiceRoomId === roomId) {
      this._showVoiceActive();
    } else {
      this._showVoicePreJoin(spaceId, roomId);
    }
  },

  _showVoicePreJoin(spaceId, roomId) {
    var pj = document.getElementById('chVoicePreJoin');
    var ac = document.getElementById('chVoiceActive');
    if (pj) pj.style.display = 'flex';
    if (ac) ac.style.display = 'none';
    // Reset join button state
    var btn = document.querySelector('.ch-vpj-join-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Войти в комнату'; }

    var channels = this.channelsBySpace[spaceId] || [];
    var ch = channels.find(function(c){return c.id===roomId});
    var nameEl = document.getElementById('chVpjName');
    if (nameEl) nameEl.textContent = ch ? ch.name : 'Комната';

    var vr = this._voiceRooms[roomId] || {};
    var spk = vr.speakers || [];
    var total = vr.total || 0;
    var self = this;

    var participantsEl = document.getElementById('chVpjParticipants');
    if (participantsEl) {
      participantsEl.innerHTML = spk.slice(0,6).map(function(p) {
        var av = p.avatar ? '<img src="data:image/png;base64,'+p.avatar+'" class="ch-vpj-av">' : '<div class="ch-vpj-av ch-vpj-av-empty">'+(p.username||'?')[0].toUpperCase()+'</div>';
        return '<div class="ch-vpj-participant">'+av+'<span class="ch-vpj-pname">'+self._esc(p.username)+'</span></div>';
      }).join('');
    }
    var statusEl = document.getElementById('chVpjStatus');
    if (statusEl) {
      if (total === 0) statusEl.textContent = 'В комнате никого нет';
      else { var w = total===1?'участник':total<5?'участника':'участников'; statusEl.textContent = total+' '+w+' сейчас'; }
    }
  },

  _showVoiceActive() {
    var pj = document.getElementById('chVoicePreJoin');
    var ac = document.getElementById('chVoiceActive');
    if (pj) pj.style.display = 'none';
    if (ac) ac.style.display = 'flex';
    this._renderVoiceGrid();
    this._updateVoiceControls();
  },

  async _doJoinVoiceRoom() {
    var spaceId = this.currentSpace;
    var roomId = this.currentChannel;
    if (!spaceId || !roomId) return;
    var btn = document.querySelector('.ch-vpj-join-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Подключение...'; }
    try {
      this._voiceStream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});
      this._voiceStream.getAudioTracks().forEach(function(t){t.enabled = false;});
      this._voiceIsSpk = true;
    } catch(e) {
      // No mic — join as listener only
      this._voiceStream = null;
      this._voiceIsSpk = false;
      Shell.toast('У вас нет микрофона, вы подключены как слушатель', 'info');
    }
    this._voiceRoomId = roomId;
    this._voiceSpaceId = spaceId;
    this._voiceMuted = true;
    this._voiceVideoMuted = true;
    this._voiceMyId = Shell.user && Shell.user.id ? Shell.user.id : null;
    if (!this._voiceMyId) {
      try {
        var pd = await Shell.api('/api/profile');
        if (pd && pd.id) { Shell.user = Object.assign(Shell.user || {}, {id: pd.id}); this._voiceMyId = pd.id; }
      } catch(e) {}
    }
    Shell.wsSend({type:'voice_join', room_id: roomId, space_id: spaceId});
    this._showVoiceActive();
    this.renderSidebar();
    this._initVAD();
  },

  _initVAD() {
    if (!this._voiceStream) return;
    var self = this;
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var src = ctx.createMediaStreamSource(this._voiceStream);
      var an = ctx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.3;
      src.connect(an);
      this._vadCtx = ctx;
      var data = new Uint8Array(an.frequencyBinCount);
      var speaking = false;
      var tick = function() {
        if (!self._voiceRoomId) return;
        an.getByteFrequencyData(data);
        var sum = 0; for (var i=0;i<data.length;i++) sum += data[i];
        var avg = sum / data.length;
        var isSpeaking = avg > 10 && !self._voiceMuted;
        if (isSpeaking !== speaking) {
          speaking = isSpeaking;
          self._voiceSpeaking = speaking;
          Shell.wsSend({type:'voice_speaking', room_id: self._voiceRoomId, speaking: speaking});
          self._updateSpeakingUI(self._voiceMyId, speaking);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch(e) {}
  },

  _updateSpeakingUI(userId, speaking) {
    var tile = document.getElementById('chVaTile-' + userId);
    if (tile) tile.classList.toggle('ch-va-speaking', speaking);
  },

  _updateVoiceControls() {
    var micBtn = document.getElementById('chVaMicBtn');
    var micIco = document.getElementById('chVaMicIco');
    var camBtn = document.getElementById('chVaCamBtn');
    var camIco = document.getElementById('chVaCamIco');
    var handBtn = document.getElementById('chVaHandBtn');
    if (micBtn) {
      micBtn.classList.toggle('ch-va-ctrl-off', this._voiceMuted);
      micBtn.classList.toggle('ch-va-ctrl-on', !this._voiceMuted);
    }
    if (micIco) micIco.innerHTML = this._voiceMuted ? '<span class="ico ico-20 ico-mic-off"></span>' : '<span class="ico ico-20 ico-mic"></span>';
    if (camBtn) {
      camBtn.classList.toggle('ch-va-ctrl-off', this._voiceVideoMuted);
      camBtn.classList.toggle('ch-va-ctrl-on', !this._voiceVideoMuted);
      camBtn.onclick = this._voiceVideoMuted ? function(){Channels._requestCamera();} : function(){Channels._disableCamera();};
    }
    if (camIco) camIco.innerHTML = this._voiceVideoMuted ? '<span class="ico ico-20 ico-video-off"></span>' : '<span class="ico ico-20 ico-video"></span>';
    if (handBtn) handBtn.style.display = this._voiceIsSpk ? 'none' : 'flex';
    if (handBtn) handBtn.classList.toggle('ch-va-ctrl-on', this._voiceHandRaised);
    var vbMicIco = document.getElementById('chVbMicIco');
    if (vbMicIco) vbMicIco.innerHTML = this._voiceMuted ? '<span class="ico ico-14 ico-mic-off"></span>' : '<span class="ico ico-14 ico-mic"></span>';
  },

  _renderVoiceGrid() {
    var grid = document.getElementById('chVaGrid');
    if (!grid) return;
    var self = this;
    var spk = (this._voiceRoomData && this._voiceRoomData.speakers) || [];
    var myId = this._voiceMyId;

    grid.innerHTML = spk.map(function(p) {
      var isMe = p.user_id === myId;
      var av = p.avatar ? '<img src="data:image/png;base64,'+p.avatar+'" class="ch-va-av">' : '<div class="ch-va-av ch-va-av-empty">'+(p.username||'?')[0].toUpperCase()+'</div>';
      var muteClass = p.muted ? ' ch-va-muted' : '';
      var micIco = p.muted ? '<span class="ico ico-14 ico-mic-off"></span>' : '';
      return '<div class="ch-va-tile'+muteClass+'" id="chVaTile-'+p.user_id+'">' +
        '<video class="ch-va-video" id="chVaVid-'+p.user_id+'" autoplay playsinline '+(isMe?'muted':'')+' style="display:'+(p.video_muted?'none':'block')+'"></video>' +
        '<div class="ch-va-av-wrap" id="chVaAvWrap-'+p.user_id+'" style="display:'+(p.video_muted?'flex':'none')+'">'+av+'</div>' +
        '<div class="ch-va-tile-name">'+self._esc(p.username)+(micIco?'<span class="ch-va-tile-mico">'+micIco+'</span>':'')+'</div>' +
        '</div>';
    }).join('');
    grid.dataset.count = spk.length;

    setTimeout(function() {
      if (self._voiceStream && !self._voiceVideoMuted) {
        var myVid = document.getElementById('chVaVid-' + myId);
        if (myVid) myVid.srcObject = self._voiceStream;
      }
      for (var uid in self._voiceRemoteStreams) {
        var v = document.getElementById('chVaVid-' + uid);
        if (v) v.srcObject = self._voiceRemoteStreams[uid];
      }
    }, 30);

    // Listeners
    var lst = (this._voiceRoomData && this._voiceRoomData.listeners) || [];
    var lstEl = document.getElementById('chVaListeners');
    if (lstEl) {
      if (lst.length) {
        lstEl.style.display = 'flex';
        lstEl.innerHTML = '<span class="ch-va-lst-title">Слушатели ('+lst.length+')</span>' +
          lst.map(function(p) {
            var av = p.avatar ? '<img src="data:image/png;base64,'+p.avatar+'" class="ch-va-lst-av">' : '<div class="ch-va-lst-av ch-va-lst-av-empty">'+(p.username||'?')[0]+'</div>';
            var hand = p.raised_hand ? ' ✋' : '';
            var pb = (self.isAdmin && p.raised_hand && spk.length<6) ? '<button class="ch-vp-promote-btn" onclick="Channels.allowSpeak(\''+p.user_id+'\')">Дать слово</button>' : '';
            return '<div class="ch-va-listener">'+av+'<span>'+self._esc(p.username)+hand+'</span>'+pb+'</div>';
          }).join('');
      } else {
        lstEl.style.display = 'none';
      }
    }
  },

  _requestCamera() {
    document.getElementById('chCamConfirmModal').classList.add('active');
  },

  async _enableCamera() {
    var spkCount = this._voiceRoomData ? (this._voiceRoomData.speakers||[]).length : 1;
    var res = spkCount <= 2 ? {width:{ideal:1280},height:{ideal:720}} : {width:{ideal:640},height:{ideal:360}};
    try {
      var vStream = await navigator.mediaDevices.getUserMedia({video: res});
      var vTrack = vStream.getVideoTracks()[0];
      if (!vTrack) return;
      if (this._voiceStream) { this._voiceStream.addTrack(vTrack); }
      else { this._voiceStream = new MediaStream([vTrack]); }
      this._voiceVideoMuted = false;
      var self = this;
      for (var uid in this._voicePeers) {
        try { this._voicePeers[uid].addTrack(vTrack, self._voiceStream); } catch(e){}
      }
      Shell.wsSend({type:'voice_mute', room_id: this._voiceRoomId, muted: this._voiceMuted, video_muted: false});
      this._updateVoiceControls();
      var myVid = document.getElementById('chVaVid-' + this._voiceMyId);
      var myWrap = document.getElementById('chVaAvWrap-' + this._voiceMyId);
      if (myVid) { myVid.srcObject = this._voiceStream; myVid.style.display = 'block'; }
      if (myWrap) myWrap.style.display = 'none';
    } catch(e) { Shell.toast('Нет доступа к камере', 'error'); }
  },

  _disableCamera() {
    if (this._voiceStream) {
      this._voiceStream.getVideoTracks().forEach(function(t){t.enabled=false;t.stop();});
    }
    this._voiceVideoMuted = true;
    Shell.wsSend({type:'voice_mute', room_id: this._voiceRoomId, muted: this._voiceMuted, video_muted: true});
    this._updateVoiceControls();
    var myVid = document.getElementById('chVaVid-' + this._voiceMyId);
    var myWrap = document.getElementById('chVaAvWrap-' + this._voiceMyId);
    if (myVid) { myVid.style.display = 'none'; }
    if (myWrap) myWrap.style.display = 'flex';
  },

  toggleVoiceMic() {
    this._voiceMuted = !this._voiceMuted;
    if (this._voiceStream) {
      var m = this._voiceMuted;
      this._voiceStream.getAudioTracks().forEach(function(t){t.enabled = !m;});
    }
    Shell.wsSend({type:'voice_mute', room_id: this._voiceRoomId, muted: this._voiceMuted, video_muted: this._voiceVideoMuted});
    this._updateVoiceControls();
    if (this._voiceSpeaking && this._voiceMuted) { this._voiceSpeaking = false; this._updateSpeakingUI(this._voiceMyId, false); }
  },

  toggleVoiceVideo() { this._voiceVideoMuted ? this._requestCamera() : this._disableCamera(); },

  toggleVoiceHand() {
    this._voiceHandRaised = !this._voiceHandRaised;
    Shell.wsSend({type:'voice_raise_hand', room_id: this._voiceRoomId, raised: this._voiceHandRaised});
    this._updateVoiceControls();
  },

  allowSpeak(userId) {
    Shell.wsSend({type:'voice_allow_speak', room_id: this._voiceRoomId, user_id: userId});
  },

  inviteToVoice(userId) {
    if (!this._voiceRoomId) return;
    Shell.wsSend({type:'voice_invite', room_id: this._voiceRoomId, to_user_id: userId});
    Shell.toast('Приглашение отправлено');
  },

  kickFromVoice(userId) {
    if (!this._voiceRoomId) return;
    Shell.wsSend({type:'voice_kick', room_id: this._voiceRoomId, target_user_id: userId});
  },

  async leaveVoiceRoom() {
    if (!this._voiceRoomId) return;
    Shell.wsSend({type:'voice_leave', room_id: this._voiceRoomId});
    this._voiceCleanup();
  },

  _voiceCleanup() {
    for (var uid in this._voicePeers) { try{this._voicePeers[uid].close();}catch(e){} }
    this._voicePeers = {};
    this._voiceRemoteStreams = {};
    this._iceCandidateQueues = {};
    if (this._voiceStream) { this._voiceStream.getTracks().forEach(function(t){t.stop();}); this._voiceStream = null; }
    if (this._vadCtx) { try{this._vadCtx.close();}catch(e){} this._vadCtx = null; }
    this._stopMicTest();
    this._voiceRoomId = null;
    this._voiceSpaceId = null;
    this._voiceRoomData = null;
    this._voiceMuted = true;
    this._voiceVideoMuted = true;
    this._voiceHandRaised = false;
    this._voiceIsSpk = false;
    this._voiceSpeaking = false;

    var bar = document.getElementById('sidebarVoiceBar');
    if (bar && bar.style.display !== 'none') {
      bar.classList.add('sb-vb-exit');
      setTimeout(function(){ bar.style.display = 'none'; bar.innerHTML = ''; bar.classList.remove('sb-vb-exit'); }, 200);
    }

    // If currently on voice channel view - show pre-join empty
    var vm = document.getElementById('chVoiceMain');
    if (vm && vm.style.display !== 'none') {
      this._showVoicePreJoin(this.currentSpace, this.currentChannel);
    }
    this.renderSidebar();
  },

  _showVoiceBar() {
    var bar = document.getElementById('sidebarVoiceBar');
    if (!bar || !this._voiceRoomId) return;
    var channels = this.channelsBySpace[this._voiceSpaceId] || [];
    var ch = channels.find(function(c){return c.id===Channels._voiceRoomId});
    var chIconClass = (ch && ch.icon) ? 'ico-' + ch.icon : 'ico-microphone';
    var micIcoHtml = Channels._voiceMuted ? '<span class="ico ico-14 ico-mic-off"></span>' : '<span class="ico ico-14 ico-mic" style="background-color:var(--accent)"></span>';
    var sp = this.spaces ? this.spaces.find(function(s){return s.id===Channels._voiceSpaceId;}) : null;
    var icoHtml = sp && sp.photo
      ? '<img class="sb-vb-img" src="data:image/jpeg;base64,' + sp.photo + '" alt="">'
      : '<div class="sb-vb-icon-circle"><span class="ico ico-16 ' + chIconClass + '" style="background-color:var(--accent)"></span></div>';
    bar.style.display = 'flex';
    bar.classList.remove('sb-vb-exit');
    bar.classList.add('sb-vb-enter');
    bar.innerHTML =
      '<div class="sb-voice-bar-ico" onclick="Channels._returnToVoiceRoom()" title="' + (ch ? ch.name : 'Голосовая') + '">' + icoHtml + '</div>' +
      '<div class="sb-voice-bar-controls">' +
        '<button class="sb-vb-btn" id="chVbMicBtn" onclick="event.stopPropagation();Channels.toggleVoiceMic()" title="Микрофон"><span id="chVbMicIco">' + micIcoHtml + '</span></button>' +
        '<button class="sb-vb-btn sb-vb-leave" onclick="event.stopPropagation();Channels.leaveVoiceRoom()" title="Выйти"><span class="ico ico-14 ico-phone-off"></span></button>' +
      '</div>';
  },

  _returnToVoiceRoom() {
    if (!this._voiceRoomId || !this._voiceSpaceId) return;
    this.openChannel(this._voiceSpaceId, this._voiceRoomId);
  },

  _initPeer(userId, isInitiator) {
    var self = this;
    var existingQueue = this._iceCandidateQueues[userId] || [];
    if (this._voicePeers[userId]) { try{this._voicePeers[userId].close();}catch(e){} }
    var pc = new RTCPeerConnection({iceServers: this._iceServers});
    this._voicePeers[userId] = pc;
    this._iceCandidateQueues[userId] = existingQueue;

    pc.ontrack = function(e) {
      if (!self._voiceRemoteStreams[userId]) self._voiceRemoteStreams[userId] = new MediaStream();
      var stream = e.streams && e.streams[0];
      if (stream) {
        self._voiceRemoteStreams[userId] = stream;
      } else {
        self._voiceRemoteStreams[userId].addTrack(e.track);
      }
      var v = document.getElementById('chVaVid-'+userId);
      if (v && v.srcObject !== self._voiceRemoteStreams[userId]) {
        v.srcObject = self._voiceRemoteStreams[userId];
        v.play().catch(function(){});
      }
    };
    pc.onicecandidate = function(e) {
      if (e.candidate) Shell.wsSend({type:'voice_ice', room_id:self._voiceRoomId, to_user_id:userId, candidate:e.candidate.toJSON()});
    };
    pc.oniceconnectionstatechange = function() {
      console.log('[WebRTC] ICE', userId, pc.iceConnectionState);
    };
    pc.onconnectionstatechange = function() {
      console.log('[WebRTC] conn', userId, pc.connectionState);
      if (pc.connectionState === 'failed') {
        try { pc.restartIce(); } catch(e) {}
      }
    };

    // Add local tracks or transceivers for receiving
    if (this._voiceStream) {
      this._voiceStream.getTracks().forEach(function(t){ pc.addTrack(t, self._voiceStream); });
    } else {
      // Listener: no local stream — request recv-only so remote can send
      try { pc.addTransceiver('audio', {direction: 'recvonly'}); } catch(e){}
    }

    if (isInitiator) {
      // Explicit offer — more reliable than onnegotiationneeded across browsers
      setTimeout(async function() {
        if (self._voicePeers[userId] !== pc) return; // peer was replaced, abort
        try {
          var offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          console.log('[WebRTC] offer sent to', userId);
          Shell.wsSend({type:'voice_offer', room_id:self._voiceRoomId, to_user_id:userId, sdp:pc.localDescription.toJSON()});
        } catch(e){ console.warn('[WebRTC] offer error', e); }
      }, 100);
    }
    return pc;
  },

  async _adaptVideoQuality() {
    if (!this._voiceStream || !this._voiceRoomData || this._voiceVideoMuted) return;
    var n = (this._voiceRoomData.speakers||[]).length;
    var res = n <= 2 ? {width:{ideal:1280},height:{ideal:720}} : {width:{ideal:640},height:{ideal:360}};
    var vt = this._voiceStream.getVideoTracks()[0];
    if (vt) { try { await vt.applyConstraints(res); } catch(e){} }
  },

  // ─── Voice Settings ───
  async openVoiceSettings() {
    var modal = document.getElementById('chVoiceSettingsModal');
    if (!modal) return;
    modal.classList.add('active');
    try {
      // Need permission first to get labels
      var devices = await navigator.mediaDevices.enumerateDevices();
      var mics = devices.filter(function(d){return d.kind==='audioinput'});
      var cams = devices.filter(function(d){return d.kind==='videoinput'});
      var spks = devices.filter(function(d){return d.kind==='audiooutput'});
      var mk = function(d,i,prefix){ return '<option value="'+d.deviceId+'">'+(d.label||prefix+' '+(i+1))+'</option>'; };
      var ms = document.getElementById('chVsMicSelect');
      var cs = document.getElementById('chVsCamSelect');
      var ss = document.getElementById('chVsSpkSelect');
      if (ms) ms.innerHTML = mics.map(function(d,i){return mk(d,i,'Микрофон');}).join('');
      if (cs) cs.innerHTML = '<option value="">Нет</option>'+cams.map(function(d,i){return mk(d,i,'Камера');}).join('');
      if (ss) ss.innerHTML = (spks.length?spks:['Системный динамик']).map(function(d,i){return typeof d==='string'?'<option>'+d+'</option>':mk(d,i,'Динамик');}).join('');
    } catch(e) {}
  },

  _requestPermissions() {
    navigator.mediaDevices.getUserMedia({audio:true,video:true})
      .then(function(s){s.getTracks().forEach(function(t){t.stop();}); Shell.toast('Разрешения получены ✓'); Channels.openVoiceSettings();})
      .catch(function(){Shell.toast('Не удалось получить разрешения','error');});
  },

  async _toggleMicTest() {
    if (this._vsTestActive) { this._stopMicTest(); return; }
    var btn = document.getElementById('chVsTestBtn');
    try {
      var stream = await navigator.mediaDevices.getUserMedia({audio:true});
      this._vsTestStream = stream;
      this._vsTestActive = true;
      if (btn) btn.textContent = '⏹ Остановить тест';
      var ctx = new (window.AudioContext||window.webkitAudioContext)();
      this._vsTestCtx = ctx;
      var src = ctx.createMediaStreamSource(stream);
      var an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      var data = new Uint8Array(an.frequencyBinCount);
      var tick = function() {
        if (!Channels._vsTestActive) return;
        an.getByteFrequencyData(data);
        var sum=0; for(var i=0;i<data.length;i++) sum+=data[i];
        var pct = Math.min(100, (sum/data.length)*3.5);
        var fill = document.getElementById('chVsMeterFill');
        if (fill) fill.style.width = pct+'%';
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch(e) { Shell.toast('Нет доступа к микрофону','error'); }
  },

  _stopMicTest() {
    if (this._vsTestStream) { this._vsTestStream.getTracks().forEach(function(t){t.stop();}); this._vsTestStream = null; }
    if (this._vsTestCtx) { try{this._vsTestCtx.close();}catch(e){} this._vsTestCtx = null; }
    this._vsTestActive = false;
    var btn = document.getElementById('chVsTestBtn');
    if (btn) btn.textContent = '▶ Начать тест';
    var fill = document.getElementById('chVsMeterFill');
    if (fill) fill.style.width = '0%';
  },

  // ─── Voice WS events ───
  _onVoiceWS(data) {
    var self = this;
    var t = data.type;

    if (t === 'voice_state') {
      this._voiceRoomData = data.room;
      this._voiceIsSpk = data.you_are === 'speaker';
      var spk = (data.room && data.room.speakers) || [];
      spk.forEach(function(p) {
        if (p.user_id !== self._voiceMyId) self._initPeer(p.user_id, true);
      });
      this._adaptVideoQuality();
      if (document.getElementById('chVoiceActive') && document.getElementById('chVoiceActive').style.display !== 'none') {
        this._renderVoiceGrid();
        this._updateVoiceControls();
      }
      this._showVoiceBar();
      this.renderMembers();
      return;
    }

    if (t === 'voice_joined') {
      if (!this._voiceRoomData) this._voiceRoomData = {speakers:[], listeners:[]};
      var arr = data.as_speaker ? this._voiceRoomData.speakers : this._voiceRoomData.listeners;
      if (!arr.find(function(p){return p.user_id===data.user_id;})) {
        arr.push({user_id:data.user_id,username:data.username,avatar:data.avatar,muted:true,video_muted:true,raised_hand:false});
      }
      if (data.as_speaker && this._voiceIsSpk && data.user_id !== this._voiceMyId) {
        this._initPeer(data.user_id, false);
      }
      this._adaptVideoQuality();
      this._renderVoiceGrid();
      this._showVoiceBar();
      this.renderMembers();
      return;
    }

    if (t === 'voice_left') {
      if (this._voiceRoomData) {
        this._voiceRoomData.speakers = this._voiceRoomData.speakers.filter(function(p){return p.user_id!==data.user_id;});
        this._voiceRoomData.listeners = this._voiceRoomData.listeners.filter(function(p){return p.user_id!==data.user_id;});
      }
      if (this._voicePeers[data.user_id]) { try{this._voicePeers[data.user_id].close();}catch(e){} delete this._voicePeers[data.user_id]; delete this._voiceRemoteStreams[data.user_id]; }
      this._adaptVideoQuality();
      this._renderVoiceGrid();
      this._showVoiceBar();
      this.renderMembers();
      return;
    }

    if (t === 'voice_offer') {
      var uid = data.from_user_id;
      console.log('[WebRTC] got offer from', uid);
      var pc = this._initPeer(uid, false);
      pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(function() {
        var q = self._iceCandidateQueues[uid] || [];
        self._iceCandidateQueues[uid] = [];
        return Promise.all(q.map(function(c){ return pc.addIceCandidate(new RTCIceCandidate(c)).catch(function(){}); }))
          .then(function(){ return pc.createAnswer(); });
      }).then(function(ans) {
        return pc.setLocalDescription(ans).then(function() {
          console.log('[WebRTC] answer sent to', uid);
          Shell.wsSend({type:'voice_answer',room_id:self._voiceRoomId,to_user_id:uid,sdp:pc.localDescription.toJSON()});
        });
      }).catch(function(e){ console.warn('[WebRTC] answer error', e); });
      return;
    }

    if (t === 'voice_answer') {
      var uid2 = data.from_user_id;
      console.log('[WebRTC] got answer from', uid2);
      var pc2 = this._voicePeers[uid2];
      if (pc2) pc2.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(function() {
        var q = self._iceCandidateQueues[uid2] || [];
        self._iceCandidateQueues[uid2] = [];
        q.forEach(function(c){ pc2.addIceCandidate(new RTCIceCandidate(c)).catch(function(){}); });
      }).catch(function(e){ console.warn('[WebRTC] setRemote answer error', e); });
      return;
    }

    if (t === 'voice_ice') {
      var uid3 = data.from_user_id;
      var pc3 = this._voicePeers[uid3];
      if (!pc3 || !data.candidate) return;
      if (pc3.remoteDescription) {
        pc3.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(function(){});
      } else {
        if (!self._iceCandidateQueues[uid3]) self._iceCandidateQueues[uid3] = [];
        self._iceCandidateQueues[uid3].push(data.candidate);
      }
      return;
    }

    if (t === 'voice_invite_notify') {
      var channels2 = self.channelsBySpace[data.space_id] || [];
      var invCh = channels2.find(function(c){return c.id===data.room_id;});
      var chName = invCh ? invCh.name : 'голосовую комнату';
      var existing = document.querySelector('.ch-voice-invite');
      if (existing) existing.remove();
      var el = document.createElement('div');
      el.className = 'ch-notify ch-voice-invite';
      el.innerHTML = '<div class="ch-notify-icon"><span class="ico ico-16 ico-microphone" style="background-color:var(--accent)"></span></div>'
        + '<div class="ch-notify-body"><div class="ch-notify-source">' + self._esc(data.from_username || '') + '</div>'
        + '<div class="ch-notify-text">приглашает в ' + self._esc(chName) + '</div></div>'
        + '<button class="btn btn-primary" style="font-size:11px;padding:4px 10px;flex-shrink:0" onclick="Channels.openChannel(\'' + data.space_id + '\',\'' + data.room_id + '\');this.closest(\'.ch-notify\').remove()">Войти</button>'
        + '<button class="ch-notify-close" onclick="this.parentNode.remove()">&times;</button>';
      document.body.appendChild(el);
      setTimeout(function(){ if (el.parentNode){ el.style.opacity='0'; setTimeout(function(){el.remove();},300); } }, 12000);
      return;
    }

    if (t === 'voice_kicked') {
      Shell.toast('Вас отключили от голосовой комнаты', 'error');
      self.leaveVoiceRoom();
      return;
    }

    if (t === 'voice_mute_update') {
      if (this._voiceRoomData) {
        this._voiceRoomData.speakers.forEach(function(p){
          if (p.user_id===data.user_id){p.muted=data.muted;p.video_muted=data.video_muted;}
        });
      }
      var tile = document.getElementById('chVaTile-'+data.user_id);
      var vid = document.getElementById('chVaVid-'+data.user_id);
      var wrap = document.getElementById('chVaAvWrap-'+data.user_id);
      if (tile) tile.classList.toggle('ch-va-muted', data.muted);
      if (vid) vid.style.display = data.video_muted?'none':'block';
      if (wrap) wrap.style.display = data.video_muted?'flex':'none';
      return;
    }

    if (t === 'voice_speaking') {
      this._updateSpeakingUI(data.user_id, data.speaking);
      return;
    }

    if (t === 'voice_hand_raised') {
      if (this._voiceRoomData) {
        this._voiceRoomData.listeners.forEach(function(p){if(p.user_id===data.user_id)p.raised_hand=data.raised;});
      }
      if (this.isAdmin && data.raised) Shell.toast('✋ '+data.username+' хочет говорить');
      this._renderVoiceGrid();
      return;
    }

    if (t === 'voice_promoted') {
      if (this._voiceRoomData) {
        var found = this._voiceRoomData.listeners.find(function(p){return p.user_id===data.user_id;});
        if (found) {
          this._voiceRoomData.listeners = this._voiceRoomData.listeners.filter(function(p){return p.user_id!==data.user_id;});
          found.muted=true; found.video_muted=true; found.raised_hand=false;
          this._voiceRoomData.speakers.push(found);
        }
      }
      if (data.user_id === this._voiceMyId) { this._voiceIsSpk = true; Shell.toast('Вам дали слово 🎤'); }
      this._renderVoiceGrid();
      this._updateVoiceControls();
      this.renderMembers();
      return;
    }

    if (t === 'voice_rooms_update') {
      this._voiceRooms = data.rooms || {};
      this.renderSidebar();
      // If currently on pre-join of this space
      if (this.currentChannel && !this._voiceRoomId) {
        var ch = (this.channelsBySpace[this.currentSpace]||[]).find(function(c){return c.id===Channels.currentChannel;});
        if (ch && ch.type==='voice') this._showVoicePreJoin(this.currentSpace, this.currentChannel);
      }
      return;
    }
  }
};

window.Channels = Channels;
Channels.init();
