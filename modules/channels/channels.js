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

  init() {
    this.currentUserId = Shell.user ? Shell.user.id : null;
    this.isAdmin = Shell.user && ['arcana','immortal','legendary'].indexOf(Shell.user.role) !== -1;
    if (!this.isAdmin) {
      var csb = document.getElementById('chCreateSpaceBtn'); if (csb) csb.style.display = 'none';
      var mb = document.getElementById('chAddMemberBtn'); if (mb) mb.style.display = 'none';
    }
    this.loadSpaces();
    this._buildEmojiPicker();
    var self = this;
    this._memberRefresh = setInterval(function(){ if(self.currentSpace && self.membersVisible) self.loadMembers(); }, 10000);
  },

  async loadSpaces() {
    var d = await Shell.api('/api/mod/channels/spaces');
    this.spaces = Array.isArray(d) ? d : [];
    this.channelsBySpace = {};
    for (var i = 0; i < this.spaces.length; i++) {
      var ch = await Shell.api('/api/mod/channels/channels?space_id=' + this.spaces[i].id);
      this.channelsBySpace[this.spaces[i].id] = Array.isArray(ch) ? ch : [];
    }
    this.renderSidebar();
  },

  toggleCollapse(spaceId) {
    this._collapsed[spaceId] = !this._collapsed[spaceId];
    // Toggle channels visibility in DOM without full re-render
    var group = document.querySelector('.ch-space-group[data-sid="'+spaceId+'"]');
    if (!group) { this.renderSidebar(); return; }
    var channels = group.querySelectorAll('.ch-channel, .ch-space-empty');
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
      html += '<div class="ch-space-actions">';
      html += '<span class="ico ico-14 ico-'+arrowIco+' ch-collapse-arrow" style="color:var(--text-dim)"></span>';
      html += '</div>';
      html += '</div>';
      if (!collapsed) channels.forEach(function(ch) {
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
      if (g) g.querySelectorAll('.ch-channel, .ch-space-empty').forEach(function(e){e.style.display='none';});
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
    document.getElementById('chChatName').textContent = ch ? ch.name : '—';
    document.getElementById('chChatHead').style.display = 'flex';
    document.getElementById('chInputArea').style.display = 'flex';
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
  },

  _showSkeleton() {
    var el = document.getElementById('chMessages');
    if (el) el.innerHTML = '<div class="ch-skeleton">'
      + '<div class="ch-skel-row"><div class="ch-skel-ava"></div><div class="ch-skel-lines"><div class="ch-skel-line w40"></div><div class="ch-skel-line w80"></div></div></div>'
      + '<div class="ch-skel-row"><div class="ch-skel-ava"></div><div class="ch-skel-lines"><div class="ch-skel-line w60"></div><div class="ch-skel-line w40"></div></div></div>'
      + '<div class="ch-skel-row"><div class="ch-skel-ava"></div><div class="ch-skel-lines"><div class="ch-skel-line w80"></div><div class="ch-skel-line w60"></div></div></div>'
      + '</div>';
  },

  async loadMessages() {
    if (!this.currentChannel) return;
    this._msgOffset = 0; this._loadingMore = false; this._hasMore = true;
    this._showSkeleton();
    var d = await Shell.api('/api/mod/channels/messages?channel_id=' + this.currentChannel);
    if (d && d.messages) {
      this.messages = d.messages;
      this._lastRead = d.last_read || 0;
    } else {
      this.messages = Array.isArray(d) ? d : [];
      this._lastRead = 0;
    }
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
      el.innerHTML = '<div class="ch-empty-chat"><span class="ico ico-32 ico-channels" style="opacity:0.12"></span><p>Начните общение</p><p style="font-size:11px;color:#ccc">Напишите первое сообщение в этом канале</p></div>';
      return;
    }
    var self = this;
    var sepInserted = false;
    el.innerHTML = this.messages.map(function(m) {
      var sep = '';
      if (!sepInserted && self._lastRead > 0 && m.time > self._lastRead && m.from !== self.currentUserId) {
        sep = '<div class="ch-new-sep" id="chNewSep"><span>новые сообщения</span></div>';
        sepInserted = true;
      }
      var ava = m.avatar ? '<img src="data:image/jpeg;base64,'+m.avatar+'"/>' : (m.from_name||'?').charAt(0).toUpperCase();
      var role = m.role || 'common';
      var t = self._fmtTime(m.time);
      var isMe = m.from === self.currentUserId;
      return sep + '<div class="ch-msg" data-msgid="'+m.id+'">'
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
        + '<button class="ch-msg-qbtn" onclick="event.stopPropagation();Channels.setReply(Channels.messages.find(function(x){return x.id===\x27'+m.id+'\x27}))" title="Ответить"><span class="ico ico-14 ico-reply"></span></button>'
        + '<button class="ch-msg-qbtn" onclick="event.stopPropagation();Channels.forwardToMessenger(Channels.messages.find(function(x){return x.id===\x27'+m.id+'\x27}))" title="Переслать"><span class="ico ico-14 ico-forward"></span></button>'
        + (self.isAdmin?'<button class="ch-msg-qbtn" onclick="event.stopPropagation();Channels.pinMessage(Channels.messages.find(function(x){return x.id===\x27'+m.id+'\x27}))" title="Закрепить"><span class="ico ico-14 ico-pin"></span></button>':'')
        + (isMe?'<button class="ch-msg-qbtn" onclick="event.stopPropagation();Channels.startEdit(Channels.messages.find(function(x){return x.id===\x27'+m.id+'\x27}))" title="Изменить"><span class="ico ico-14 ico-pencil"></span></button>':'')
        + ((isMe||self.isAdmin)?'<button class="ch-msg-qbtn" onclick="event.stopPropagation();Channels.deleteMessage(Channels.messages.find(function(x){return x.id===\x27'+m.id+'\x27}))" title="Удалить"><span class="ico ico-14 ico-trash"></span></button>':'')
        + '</div></div>';
    }).join('');
    el.scrollTop = el.scrollHeight;

    // Scroll-to-top for older messages
    var self3 = this;
    el.onscroll = function() {
      if (el.scrollTop < 60 && !self3._loadingMore && self3._hasMore && self3.currentChannel) {
        self3._loadingMore = true;
        self3._msgOffset += 50;
        Shell.api('/api/mod/channels/messages?channel_id='+self3.currentChannel+'&offset='+self3._msgOffset).then(function(d) {
          self3._loadingMore = false;
          var msgs = d && d.messages ? d.messages : (Array.isArray(d) ? d : []);
          if (!msgs.length) { self3._hasMore = false; return; }
          var prevH = el.scrollHeight;
          self3.messages = msgs.concat(self3.messages);
          self3.renderMessages();
          el.scrollTop = el.scrollHeight - prevH;
        });
      }
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
    if (data.type === 'ch_reacted' && data.channel_id === this.currentChannel) {
      for (var i = 0; i < this.messages.length; i++) {
        if (this.messages[i].id === data.msg_id) { this.messages[i].reactions = data.reactions; break; }
      }
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
        this.renderMessages();
      }
      return;
    }
    if (data.type === 'ch_deleted') {
      if (data.channel_id === this.currentChannel) {
        this.messages = this.messages.filter(function(m){return m.id !== data.msg_id});
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
        this.messages.push(data.msg);
        this.renderMessages();
        Shell.api('/api/mod/channels/read?channel_id=' + this.currentChannel);
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
    var prev = document.getElementById('chSpacePhotoPreview');
    if (prev) { prev.innerHTML = '<span class="ico ico-18 ico-attach" style="opacity:0.4"></span>'; }
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
    var prev = document.getElementById('chSpacePhotoPreview');
    if (prev) {
      prev.innerHTML = sp.photo ? '<img src="data:image/jpeg;base64,'+sp.photo+'"/>' : '<span class="ico ico-18 ico-attach" style="opacity:0.4"></span>';
    }
    document.getElementById('chCreateSpaceModal').classList.add('active');
    document.getElementById('chSpaceNameInput').focus();
  },

  async saveSpace() {
    var name = document.getElementById('chSpaceNameInput').value.trim();
    var editId = document.getElementById('chSpaceEditId').value;
    if (!name) return;
    var payload = editId ? {edit_id:editId, name:name} : {name:name};
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
    document.getElementById('chCreateChanSpace').value = spaceId;
    document.getElementById('chChanEditId').value = '';
    document.getElementById('chChanNameInput').value = '';
    document.getElementById('chChanModalTitle').textContent = 'Создать канал';
    document.getElementById('chChanSaveBtn').textContent = 'Создать';
    this._selectedIcon = 'channels';
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
    if (editId) {
      var d = await Shell.api('/api/mod/channels/channels', {method:'POST', body:JSON.stringify({space_id:spaceId, edit_id:editId, name:name, icon:this._selectedIcon})});
    } else {
      var d = await Shell.api('/api/mod/channels/channels', {method:'POST', body:JSON.stringify({space_id:spaceId, name:name, icon:this._selectedIcon})});
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
    var on = this.members.filter(function(m){return m.online}).sort(function(a,b){return ro.indexOf(a.role)-ro.indexOf(b.role)});
    var off = this.members.filter(function(m){return !m.online});
    var html = '';
    if (on.length) { html += '<div class="ch-member-group"><div class="ch-member-group-title">Онлайн — '+on.length+'</div>' + on.map(function(m){return Channels._mHtml(m,false)}).join('') + '</div>'; }
    if (off.length) { html += '<div class="ch-member-group"><div class="ch-member-group-title">Оффлайн — '+off.length+'</div>' + off.map(function(m){return Channels._mHtml(m,true)}).join('') + '</div>'; }
    el.innerHTML = html;
    // Apply collapsed state
    var self2 = this;
    Object.keys(this._collapsed).forEach(function(sid) {
      if (!self2._collapsed[sid]) return;
      var g = el.querySelector('.ch-space-group[data-sid="'+sid+'"]');
      if (g) g.querySelectorAll('.ch-channel, .ch-space-empty').forEach(function(e){e.style.display='none';});
    });
    if (!this._spaceCtxAttached) { this._attachSpaceCtx(); this._spaceCtxAttached = true; }
  },

  _mHtml(m, off, isMod) {
    var ava = m.avatar ? '<img src="data:image/jpeg;base64,'+m.avatar+'"/>' : (m.display_name||m.username).charAt(0).toUpperCase();
    return '<div class="ch-member'+(off?' offline':'')+(isMod?' moderator':'')+'" oncontextmenu="event.preventDefault();Channels._memberCtx(event,\x27'+m.user_id+'\x27)">'
      + '<div class="ch-member-ava">'+ava+'</div>'
      + '<span class="ch-member-name">'+this._esc(m.display_name||m.username)+'</span>'
      + (isMod?'<span class="ch-mod-badge">МОД</span>':'')
      + '<span class="role-badge '+m.role+'" style="font-size:8px;padding:1px 4px">'+m.role.toUpperCase()+'</span>'
      + (off?'':'<span class="ch-member-online-dot"></span>')+'</div>';
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
    if (window.innerWidth > 768) document.getElementById('chInput').focus();
  },

  cancelReply() {
    this._replyTo = null;
    document.getElementById('chReplyBar').style.display = 'none';
    this.updateSendBtn();
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
      bar.innerHTML = '<span class="ch-edit-label">Редактирование</span><button class="ch-edit-close" onclick="Channels.cancelEdit()"><span class="ico ico-14 ico-close"></span></button>';
      area.parentNode.insertBefore(bar, area);
    }
    bar.style.display = 'flex';
  },

  cancelEdit() {
    this._editMsg = null;
    document.getElementById('chInput').value = '';
    var bar = document.getElementById('chEditBar');
    if (bar) bar.style.display = 'none';
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
    btn.innerHTML = hasContent
      ? '<span class="ico ico-18 ico-send" style="background-color:var(--accent)"></span>'
      : '<span class="ico ico-18 ico-mic" style="background-color:#999"></span>';
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
    el.innerHTML = this._pendingFiles.map(function(f, i) {
      if (f.isImage && f.preview) {
        return '<div class="ch-upload-thumb"><img src="'+f.preview+'"/><button class="ch-upload-x" onclick="event.stopPropagation();Channels.removePending('+i+')">&times;</button></div>';
      }
      return '<div class="ch-upload-file"><span class="ico ico-14 ico-file"></span><span class="ch-upload-fname">'+Channels._esc(f.file.name)+'</span><button class="ch-upload-x" onclick="event.stopPropagation();Channels.removePending('+i+')">&times;</button></div>';
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
        var isVoice = a.name && a.name.startsWith('voice_');
        html += '<div class="ch-audio-player'+(isVoice?' voice':'')+'" data-aid="'+a.id+'" data-dur="'+dur+'">'
          + '<button class="ch-audio-btn" onclick="event.stopPropagation();Channels.playAudio(\x27'+a.id+'\x27)"><span class="ch-audio-icon" data-aid="'+a.id+'">▶</span></button>'
          + '<div class="ch-audio-info">'
          + (isVoice?'':'<div class="ch-audio-name">'+this._esc(a.name)+'</div>')
          + '<div class="ch-audio-bar" onclick="event.stopPropagation();Channels.seekAudio(event,\x27'+a.id+'\x27)"><div class="ch-audio-progress" data-aid="'+a.id+'"></div></div>'
          + '<span class="ch-audio-time" data-aid="'+a.id+'">'+mm+':'+ss+'</span></div></div>';
      } else if (a.type === 'video') {
        html += '<div class="ch-att-video" onclick="Channels.openViewer(\x27video\x27,\x27/api/msg/file/'+a.id+'\x27)"><video preload="none" src="/api/msg/file/'+a.id+'" style="max-width:320px;max-height:240px;border-radius:8px"></video><div class="ch-video-play">▶</div></div>';
      } else {
        var sz = a.size > 1048576 ? (a.size/1048576).toFixed(1)+' МБ' : Math.round(a.size/1024)+' КБ';
        html += '<a class="ch-att-file" href="/api/msg/file/'+a.id+'" download="'+this._esc(a.name)+'" onclick="event.stopPropagation()"><span class="ico ico-14 ico-file"></span><div class="ch-att-file-info"><div class="ch-att-file-name">'+this._esc(a.name)+'</div><div class="ch-att-size">'+sz+'</div></div></a>';
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
  playAudio(aid) {
    var url = '/api/msg/file/' + aid;
    if (this._activeAudioId === aid && this._activeAudio && !this._activeAudio.paused) {
      this._activeAudio.pause();
      var ic = document.querySelector('.ch-audio-icon[data-aid="'+aid+'"]');
      if (ic) ic.textContent = '▶';
      return;
    }
    if (this._activeAudio) {
      this._activeAudio.pause();
      var old = document.querySelector('.ch-audio-icon[data-aid="'+this._activeAudioId+'"]');
      if (old) old.textContent = '▶';
    }
    this._activeAudioId = aid;
    this._activeAudio = new Audio(url);
    var ic = document.querySelector('.ch-audio-icon[data-aid="'+aid+'"]');
    if (ic) ic.textContent = '❚❚';
    var self = this;
    this._activeAudio.ontimeupdate = function() {
      var prog = document.querySelector('.ch-audio-progress[data-aid="'+aid+'"]');
      var timeEl = document.querySelector('.ch-audio-time[data-aid="'+aid+'"]');
      if (prog && self._activeAudio.duration) { prog.style.width = (self._activeAudio.currentTime/self._activeAudio.duration*100)+'%'; }
      if (timeEl) {
        var t = Math.floor(self._activeAudio.currentTime);
        timeEl.textContent = Math.floor(t/60)+':'+('0'+(t%60)).slice(-2);
      }
    };
    this._activeAudio.onended = function() {
      if (ic) ic.textContent = '▶';
      var prog = document.querySelector('.ch-audio-progress[data-aid="'+aid+'"]');
      if (prog) prog.style.width = '0%';
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
    if (this._activeAudio.duration) this._activeAudio.currentTime = pct * this._activeAudio.duration;
  },

  autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; },
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
  _fmt(text) { return this._esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/@(\w+)/g, '<span class="ch-mention">@$1</span>'); }
};

window.Channels = Channels;
Channels.init();
