import { useCallback, useEffect, useRef, useState } from 'react';
import ContactList from './ContactList.jsx';
import MessageList from './MessageList.jsx';
import Composer from './Composer.jsx';
import ProfilePanel from './ProfilePanel.jsx';
import { Confirm, ContactMenu, Gallery, MsgMenu, ReactionPicker } from './Overlays.jsx';
import { stopAudio } from './audio.js';
import { S, chatKey, displayName, toast, wsSend, buzz } from './lib.js';

/* Корень модуля: всё состояние переписки живёт здесь, а не в DOM.

   Раньше входящие события правили разметку точечно — находили строку по
   data-msgid и меняли текст, класс, реакции, атрибуты. Любая перерисовка
   ленты эти правки теряла, а догруженное и пришедшее по сети собирались
   разным кодом с разными правилами группировки. Здесь событие меняет список
   сообщений, а разметка следует за ним. */

export default function App({ registerBridge }) {
  const [me, setMe] = useState({ id: null, name: '', avatar: null });
  const [contacts, setContacts] = useState([]);
  const [chat, setChat] = useState(null);          // id собеседника
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pinned, setPinned] = useState(null);
  const [typing, setTyping] = useState(false);

  const [contactSearch, setContactSearch] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIdx, setSearchIdx] = useState(0);

  const [files, setFiles] = useState([]);
  const [reply, setReply] = useState(null);
  const [edit, setEdit] = useState(null);
  const [forward, setForward] = useState(null);
  const [upload, setUpload] = useState(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [attachKey, setAttachKey] = useState(0);
  const [msgMenu, setMsgMenu] = useState(null);
  const [reactPicker, setReactPicker] = useState(null);
  const [contactMenu, setContactMenu] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [gallery, setGallery] = useState(null);
  const [jumpTo, setJumpTo] = useState(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const offset = useRef(0);
  const loadingMore = useRef(false);
  const lastTyping = useRef(0);
  const typingTimer = useRef(null);
  const chatRef = useRef(null);
  chatRef.current = chat;
  const meRef = useRef(me);
  meRef.current = me;

  const contact = contacts.find((c) => c.id === chat) || null;
  const ck = chat && me.id ? chatKey(me.id, chat) : null;

  /* ── Профиль пользователя и первичная загрузка ─────────────────────── */
  useEffect(() => {
    const sh = S();
    if (sh && sh.user) setMe((m) => ({ ...m, id: sh.user.id || null, name: sh.user.username || '' }));
    sh.api('/api/profile').then((p) => {
      if (p) setMe({ id: p.id, name: p.display_name || p.username || '', avatar: p.avatar || null });
    });
    // Контакты приходят по WS на auth_ok; если молчит — забираем по HTTP
    const t = setTimeout(() => {
      setContacts((cur) => {
        if (cur.length) return cur;
        sh.api('/api/msg/contacts').then((d) => { if (d && d.contacts) setContacts(d.contacts); });
        return cur;
      });
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  /* Возврат во вкладку: переспрашиваем контакты и историю */
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      const sh = S();
      if (sh.ws && sh.ws.readyState !== WebSocket.OPEN) sh.connectWS();
      if (sh.wsReady) {
        wsSend({ type: 'contacts' });
        if (chatRef.current) wsSend({ type: 'history', to: chatRef.current, offset: 0 });
      } else {
        sh.api('/api/msg/contacts').then((d) => { if (d && d.contacts) setContacts(d.contacts); });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* Аватарки контактов кладём в общий кэш оболочки — их берут уведомления */
  useEffect(() => {
    const sh = S();
    contacts.forEach((c) => { if (c.avatar && sh.cacheContact) sh.cacheContact(c.id, c.avatar); });
  }, [contacts]);

  /* ── Экранная клавиатура на телефоне ──────────────────────────────── */
  useEffect(() => {
    if (!window.visualViewport) return undefined;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let wasOpen = false;
    const apply = () => {
      if (window.innerWidth > 768) return;
      const vv = window.visualViewport;
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const open = kb > 80;
      const el = document.querySelector('.msg-chat');
      if (open !== wasOpen) {
        wasOpen = open;
        if (open) setProfileOpen(false);
      }
      // iOS не сжимает вёрстку под клавиатуру — поднимаем чат сами
      if (el && ios) el.style.bottom = open ? kb + 'px' : '';
      if (open && scrollRef.current) {
        window.scrollTo(0, 0);
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    window.visualViewport.addEventListener('resize', apply);
    window.visualViewport.addEventListener('scroll', apply);
    return () => {
      window.visualViewport.removeEventListener('resize', apply);
      window.visualViewport.removeEventListener('scroll', apply);
    };
  }, []);

  /* ── Открытие и закрытие чата ─────────────────────────────────────── */
  const openChat = useCallback((userId) => {
    const c = contacts.find((x) => x.id === userId);
    setChat(userId);
    setMessages([]);
    setLoading(true);
    setHasMore(true);
    setPinned(null);
    setTyping(false);
    setChatSearch('');
    setSearchOpen(false);
    offset.current = 0;
    loadingMore.current = false;

    const sh = S();
    sh.activeChat = chatKey(meRef.current.id, userId);
    sh.setImmersive(true);
    if (window.innerWidth <= 768) {
      const el = document.querySelector('.msg-chat');
      if (el) el.style.bottom = '0';
    }
    wsSend({ type: 'history', to: userId, offset: 0 });
    wsSend({ type: 'read', chat: chatKey(meRef.current.id, userId), to: userId });

    // Непрочитанное гасим сразу, не дожидаясь ответа сервера
    if (c && c.unread) {
      setContacts((cur) => cur.map((x) => (x.id === userId ? { ...x, unread: 0 } : x)));
      sh.unreadTotal = Math.max(0, sh.unreadTotal - c.unread);
      sh.updateMsgBadge();
    }
    setTimeout(() => inputRef.current && inputRef.current.focus(), 100);
  }, [contacts]);

  const leaveChat = useCallback(() => {
    setChat(null);
    setMessages([]);
    setReply(null); setEdit(null); setFiles([]);
    setProfileOpen(false);
    setSearchOpen(false);
    setChatSearch('');
    stopAudio();
    const sh = S();
    sh.activeChat = null;
    sh.setImmersive(false);
    if (window.innerWidth <= 768) {
      const el = document.querySelector('.msg-chat');
      if (el) el.style.bottom = '';
    }
  }, []);

  /* ── Входящие события ─────────────────────────────────────────────── */
  const onWS = useCallback((d) => {
    const meId = meRef.current.id;
    const cur = chatRef.current;
    const mine = cur ? chatKey(meId, cur) : null;

    if (d.type === 'contacts') { setContacts(d.contacts || []); return; }

    if (d.type === 'history') {
      const older = d.offset > 0;
      if (older) {
        loadingMore.current = false;
        if (!d.messages || !d.messages.length) setHasMore(false);
        else setMessages((m) => (d.messages || []).concat(m));
      } else {
        setMessages(d.messages || []);
        setLoading(false);
        offset.current = (d.messages || []).length;
      }
      setPinned(d.pinned ? { id: d.pinned.msg_id, text: d.pinned.text } : null);
      return;
    }

    if (d.type === 'message') {
      if (mine && d.chat === mine) {
        setMessages((m) => (m.some((x) => x.id === d.msg.id) ? m : m.concat(d.msg)));
        wsSend({ type: 'read', chat: d.chat, to: cur });
        if (d.msg.attachments && d.msg.attachments.length) setAttachKey((k) => k + 1);
      }
      wsSend({ type: 'contacts' });
      return;
    }

    if (d.type === 'sent') {
      if (d.msg && d.msg.id) {
        setMessages((m) => {
          // Подменяем временное сообщение настоящим
          if (d.temp_id && m.some((x) => x.id === d.temp_id)) {
            return m.map((x) => (x.id === d.temp_id ? d.msg : x));
          }
          if (m.some((x) => x.id === d.msg.id)) return m;
          if (mine && d.chat === mine) return m.concat(d.msg);
          return m;
        });
      }
      wsSend({ type: 'contacts' });
      return;
    }

    if (d.type === 'typing') {
      if (mine && d.chat === mine) {
        setTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 3000);
      }
      return;
    }

    if (d.type === 'read' || d.type === 'read_confirm') {
      setMessages((m) => m.map((x) => (x.from === meId ? { ...x, read: true } : x)));
      wsSend({ type: 'contacts' });
      return;
    }

    if (d.type === 'reaction') {
      if (mine && d.chat === mine && d.msg_id) {
        setMessages((m) => m.map((x) => (x.id === d.msg_id ? { ...x, reactions: d.reactions || {} } : x)));
      }
      return;
    }

    if (d.type === 'edited') {
      if (mine && d.chat === mine) {
        setMessages((m) => m.map((x) => (x.id === d.msg_id ? { ...x, text: d.text, edited: true } : x)));
      }
      return;
    }

    if (d.type === 'deleted') {
      if (mine && d.chat === mine) {
        setMessages((m) => m.filter((x) => x.id !== d.msg_id));
        setAttachKey((k) => k + 1);
      }
      wsSend({ type: 'contacts' });
      return;
    }

    if (d.type === 'chat_cleared') {
      if (mine && d.chat === mine) { setMessages([]); setAttachKey((k) => k + 1); }
      wsSend({ type: 'contacts' });
      return;
    }

    if (d.type === 'pinned') { setPinned({ id: d.msg_id, text: d.text }); return; }
    if (d.type === 'unpinned') { setPinned(null); }
  }, []);

  /* Оболочка шлёт сюда все WS-сообщения и умеет открывать чат */
  useEffect(() => {
    registerBridge({
      onWS,
      openChat: (id) => openChat(id),
      /* Пересылка снаружи: «Серверы» шлют статус, «Каналы» — сообщение из
         канала. И то и другое уходит как обычный текст с подписью источника,
         поэтому здесь одна точка входа, а не два разных механизма. */
      startForward: (f) => {
        setEdit(null); setReply(null);
        setForward(f);
        leaveChat();
      },
      startForwardStatus: (text) => {
        setEdit(null); setReply(null);
        setForward({ type: 'server_status', text, fromName: 'Серверы', preview: text.slice(0, 60) + '...' });
        leaveChat();
      },
    });
  }, [registerBridge, onWS, openChat, leaveChat]);

  /* ── Отправка ─────────────────────────────────────────────────────── */
  const uploadAndSend = (toId, text, list) => {
    const names = list.map((f) => f.file.name).join(', ');
    setUpload({ name: names.length > 35 ? names.slice(0, 33) + '...' : names, pct: 0 });

    const fd = new FormData();
    fd.append('to', toId);
    fd.append('text', text || '');
    list.forEach((f) => fd.append('files', f.file, f.file.name));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/msg/upload');
    xhr.setRequestHeader('Authorization', 'Bearer ' + S().token);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUpload((u) => (u ? { ...u, pct: Math.round((e.loaded / e.total) * 100) } : u));
    };
    xhr.onload = () => {
      setUpload(null);
      if (xhr.status === 200) {
        try {
          const resp = JSON.parse(xhr.responseText);
          if (resp.msg) setMessages((m) => (m.some((x) => x.id === resp.msg.id) ? m : m.concat(resp.msg)));
        } catch (e) { /* ответ без тела — сообщение придёт по WS */ }
        wsSend({ type: 'contacts' });
        setAttachKey((k) => k + 1);
      } else {
        let msg = 'Ошибка: ' + xhr.status;
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) { /* не json */ }
        toast(msg, 'error');
      }
    };
    xhr.onerror = () => { setUpload(null); toast('Ошибка соединения', 'error'); };
    xhr.send(fd);
  };

  const doSend = (text, list) => {
    const t = (text || '').trim();
    if (!chat) return;

    if (edit) {
      wsSend({ type: 'edit', chat: ck, msg_id: edit.id, text: t });
      setEdit(null);
      return;
    }

    if (forward) {
      if (forward.type === 'message' && forward.msgId) {
        wsSend({ type: 'forward', to: chat, from_chat: forward.chatKey, msg_id: forward.msgId, extra_text: t });
      } else {
        buzz(10);
        wsSend({
          type: 'send', to: chat,
          text: forward.text + (t ? '\n\n' + t : ''),
          forwarded_from: { name: forward.fromName, id: forward.fromId || '' },
        });
      }
      setForward(null);
      return;
    }

    if (!t && !(list && list.length)) return;

    const extra = {};
    if (reply) { extra.reply_to = reply; setReply(null); }

    if (list && list.length) {
      uploadAndSend(chat, t, list);
      setFiles([]);
      return;
    }

    const tempId = 'temp_' + Date.now();
    const msg = {
      id: tempId, from: me.id, from_name: me.name, text: t,
      time: Math.floor(Date.now() / 1000), read: false, ...extra,
    };
    setMessages((m) => m.concat(msg));
    buzz(10);
    wsSend({ type: 'send', to: chat, text: t, temp_id: tempId, ...extra });
  };

  const onTyping = () => {
    if (!chat) return;
    const now = Date.now();
    if (now - lastTyping.current > 1000) {
      lastTyping.current = now;
      wsSend({ type: 'typing', to: chat });
    }
  };

  /* ── Действия над сообщением ──────────────────────────────────────── */
  const avaOf = useCallback((uid, fallbackName) => {
    if (uid === me.id) return { src: me.avatar, letter: (me.name || '?').charAt(0).toUpperCase() };
    const c = contacts.find((x) => x.id === uid);
    if (c) return { src: c.avatar, letter: displayName(c).charAt(0).toUpperCase() };
    return { src: null, letter: (fallbackName || '?').charAt(0).toUpperCase() };
  }, [me, contacts]);

  const nameOf = (uid) => (uid === me.id ? me.name : (() => {
    const c = contacts.find((x) => x.id === uid);
    return c ? displayName(c) : uid;
  })());

  const msgAction = (act, m, arg) => {
    const preview = m.text ? (m.text.length > 60 ? m.text.slice(0, 60) + '...' : m.text) : 'Вложение';
    if (act === 'react') { wsSend({ type: 'react', chat: ck, msg_id: m.id, emoji: arg }); return; }
    if (act === 'reply') { setEdit(null); setForward(null); setReply({ msg_id: m.id, text: preview, from_name: nameOf(m.from), from_id: m.from }); inputRef.current && inputRef.current.focus(); return; }
    if (act === 'edit') { setReply(null); setForward(null); setEdit({ id: m.id, text: m.text || '' }); inputRef.current && inputRef.current.focus(); return; }
    if (act === 'delete') { wsSend({ type: 'delete', chat: ck, msg_id: m.id }); return; }
    if (act === 'pin') { wsSend({ type: 'pin', chat: ck, msg_id: m.id, text: m.text || '' }); return; }
    if (act === 'copy') {
      const text = m.text || '';
      if (navigator.clipboard) navigator.clipboard.writeText(text);
      toast('Скопировано');
      return;
    }
    if (act === 'forward') {
      setEdit(null); setReply(null);
      setForward({ type: 'message', msgId: m.id, chatKey: ck, text: m.text || '', fromName: nameOf(m.from), fromId: m.from, preview });
      leaveChat();
    }
  };

  const contactAction = (act, c) => {
    if (act === 'clear') { setConfirm({ id: c.id, name: displayName(c) }); return; }
    const map = { pin: 'pin_contact', unpin: 'unpin_contact', mute: 'mute_contact', unmute: 'unmute_contact' };
    wsSend({ type: map[act], contact_id: c.id });
  };

  const clearChat = (targetId) => {
    const key = chatKey(me.id, targetId);
    wsSend({ type: 'clear_chat', chat: key });
    if (targetId === chat) setMessages([]);
    toast('Чат очищен');
  };

  /* Долгое нажатие по сообщению — на iOS contextmenu не приходит */
  const touch = useRef({ timer: null, x: 0, y: 0, moved: false });
  const onRowTouchStart = (e) => {
    const row = e.target.closest('.msg-row[data-msgid]');
    if (!row) return;
    const id = row.getAttribute('data-msgid');
    const m = messages.find((x) => x.id === id);
    if (!m) return;
    touch.current.moved = false;
    touch.current.x = e.touches[0].clientX;
    touch.current.y = e.touches[0].clientY;
    touch.current.timer = setTimeout(() => {
      if (touch.current.moved) return;
      window.getSelection().removeAllRanges();
      buzz(30);
      setMsgMenu({ x: touch.current.x, y: touch.current.y, msg: m });
    }, 500);
  };
  const onRowTouchMove = (e) => {
    if (!touch.current.timer) return;
    if (Math.abs(e.touches[0].clientX - touch.current.x) > 10 || Math.abs(e.touches[0].clientY - touch.current.y) > 10) {
      touch.current.moved = true;
      clearTimeout(touch.current.timer);
      touch.current.timer = null;
    }
  };
  const onRowTouchEnd = () => { clearTimeout(touch.current.timer); touch.current.timer = null; };

  /* Поиск по переписке */
  const matches = chatSearch.trim()
    ? messages.filter((m) => (m.text || '').toLowerCase().includes(chatSearch.trim().toLowerCase()))
    : [];
  const curMatch = matches.length ? matches[Math.min(searchIdx, matches.length - 1)] : null;

  const loadMore = () => {
    if (loadingMore.current || !hasMore || !chat) return;
    loadingMore.current = true;
    offset.current += 50;
    wsSend({ type: 'history', to: chat, offset: offset.current });
  };

  return (
    <div className="msg-wrap">
      <ContactList
        hidden={!!chat}
        contacts={contacts}
        activeId={chat}
        search={contactSearch}
        setSearch={setContactSearch}
        forward={forward}
        onOpen={openChat}
        onCancelForward={() => setForward(null)}
        onMenu={(e, c) => setContactMenu({ x: e.clientX, y: e.clientY, contact: c })}
      />

      <div className={'msg-chat' + (chat ? ' mobile-open' : '')}>
        {!chat && (
          <div className="msg-chat-empty" style={{ display: 'flex' }}>
            <svg width="56" height="56" viewBox="0 0 32 32" fill="none" stroke="#ccc" strokeWidth="1">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p style={{ color: '#aaa', fontSize: 14, margin: 0 }}>Выберите контакт</p>
          </div>
        )}

        <div className="msg-chat-header-wrap">
          {chat && contact && (
            <div className="msg-chat-header" style={{ display: 'flex' }}>
              <button className="msg-back-btn" onClick={leaveChat}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button className="msg-chat-peer" onClick={() => setProfileOpen(true)} title="Информация о собеседнике">
                <div className="msg-chat-header-ava">
                  {contact.avatar ? <img src={'data:image/jpeg;base64,' + contact.avatar} alt="" /> : displayName(contact).charAt(0).toUpperCase()}
                </div>
                <div className="msg-chat-header-info">
                  <div className="msg-chat-name">
                    {displayName(contact)}
                    {contact.online && <span className={'msg-online-dot-header ' + (contact.status || 'online')} />}
                  </div>
                  <div className="msg-chat-typing">
                    {typing && <span className="msg-typing-dots"><span /><span /><span /></span>}
                  </div>
                </div>
              </button>

              <div className="msg-search-group">
                <div className={'msg-chat-search-wrap' + (searchOpen ? ' open' : '')}>
                  <div className="msg-search-inner">
                    <input
                      className="msg-search-input" placeholder="Поиск..." autoComplete="off"
                      value={chatSearch}
                      onChange={(e) => { setChatSearch(e.target.value); setSearchIdx(0); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { setSearchOpen(false); setChatSearch(''); }
                        if (e.key === 'Enter' && matches.length) {
                          setSearchIdx((i) => (e.shiftKey
                            ? (i - 1 + matches.length) % matches.length
                            : (i + 1) % matches.length));
                        }
                      }}
                    />
                    <span className={'msg-search-count' + (matches.length ? ' has-results' : '')}>
                      {chatSearch.trim() ? (matches.length ? (Math.min(searchIdx, matches.length - 1) + 1) + '/' + matches.length : '0') : ''}
                    </span>
                    <button className="msg-search-nav-btn" onClick={() => matches.length && setSearchIdx((i) => (i - 1 + matches.length) % matches.length)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
                    </button>
                    <button className="msg-search-nav-btn" onClick={() => matches.length && setSearchIdx((i) => (i + 1) % matches.length)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                  </div>
                </div>
                <button className="msg-header-btn" onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setChatSearch(''); }}>
                  <span className="ico ico-16 ico-search" />
                </button>
              </div>

              <button className="msg-mob-dots" onClick={() => setProfileOpen(true)}>
                <span className="ico ico-18 ico-dots" />
              </button>
            </div>
          )}

          {chat && pinned && (
            <div className="msg-pin-bar" style={{ display: 'flex' }} onClick={() => setJumpTo(pinned.id)}>
              <div className="msg-pin-line" />
              <div className="msg-pin-content">
                <span className="msg-pin-label">Закреплённое сообщение</span>
                <span className="msg-pin-text">{pinned.text && pinned.text.length > 50 ? pinned.text.slice(0, 50) + '...' : pinned.text}</span>
              </div>
              <button className="msg-pin-close" onClick={(e) => { e.stopPropagation(); wsSend({ type: 'unpin', chat: ck }); }}>×</button>
            </div>
          )}
        </div>

        {chat && (
          <div
            className="msg-chat-active" style={{ display: 'block' }}
            onTouchStart={onRowTouchStart}
            onTouchMove={onRowTouchMove}
            onTouchEnd={onRowTouchEnd}
            onTouchCancel={onRowTouchEnd}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) {
                const list = Array.from(e.dataTransfer.files).map((f) => ({
                  file: f, mediaType: 'file', preview: null, unsupported: false, key: f.name + f.size,
                }));
                setFiles((cur) => cur.concat(list));
              }
            }}
          >
            <MessageList
              messages={messages}
              loading={loading}
              meId={me.id}
              avaOf={avaOf}
              search={searchOpen ? chatSearch : ''}
              highlightId={curMatch ? curMatch.id : jumpTo}
              scrollRef={scrollRef}
              upload={upload}
              onLoadMore={loadMore}
              onCtx={(e, m) => setMsgMenu({ x: e.clientX, y: e.clientY, msg: m })}
              onToggleReaction={(id, em) => wsSend({ type: 'react', chat: ck, msg_id: id, emoji: em })}
              onOpenImage={(url) => setGallery({ url })}
              onPlayVideo={(id) => setGallery({ video: id })}
              onJumpTo={(id) => setJumpTo(id)}
            />

            <Composer
              files={files} setFiles={setFiles}
              reply={reply} edit={edit} forward={forward}
              onCancelReply={() => setReply(null)}
              onCancelEdit={() => setEdit(null)}
              onCancelForward={() => setForward(null)}
              onSend={doSend}
              onTyping={onTyping}
              inputRef={inputRef}
            />
          </div>
        )}
      </div>

      <ProfilePanel
        open={profileOpen}
        contact={contact}
        meId={me.id}
        reloadKey={attachKey}
        onClose={() => setProfileOpen(false)}
        onOpenImage={(url) => setGallery({ url })}
        onPlayVideo={(id) => setGallery({ video: id })}
        onJumpTo={(id) => { setProfileOpen(false); setTimeout(() => setJumpTo(id), 200); }}
        onClear={() => contact && setConfirm({ id: contact.id, name: displayName(contact) })}
      />

      <MsgMenu
        open={msgMenu} meId={me.id}
        onClose={() => setMsgMenu(null)}
        onAction={msgAction}
        onMore={(m) => setReactPicker(m)}
      />
      <ReactionPicker
        msg={reactPicker}
        onPick={(id, em) => wsSend({ type: 'react', chat: ck, msg_id: id, emoji: em })}
        onClose={() => setReactPicker(null)}
      />
      <ContactMenu open={contactMenu} onClose={() => setContactMenu(null)} onAction={contactAction} />
      <Confirm open={confirm} onClose={() => setConfirm(null)} onOk={() => clearChat(confirm.id)} />
      <Gallery open={gallery} onClose={() => setGallery(null)} />
    </div>
  );
}
