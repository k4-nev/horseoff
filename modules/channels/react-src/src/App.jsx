import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Backdrop from '../../../../core/react-src/src/shared/chat/Backdrop.jsx';
import Gallery from '../../../../core/react-src/src/shared/chat/Gallery.jsx';
import SearchField from '../../../../core/react-src/src/shared/SearchField.jsx';
import { setAudioErrorHandler, stopAudio } from '../../../../core/react-src/src/shared/chat/audio.js';
import Composer from './Composer.jsx';
import Members from './Members.jsx';
import MessageList from './MessageList.jsx';
import Sidebar from './Sidebar.jsx';
import { ActiveRoom, PreJoin } from './VoiceRoom.jsx';
import {
  AddMembersModal, ChannelModal, ConfirmModal, MediaConfirmModal, SpaceModal, VoiceSettingsModal,
} from './Modals.jsx';
import { api, buzz, isAdminRole, me, toast, wsSend } from './lib.js';
import * as voice from './voice.js';
import useMenuFit from '../../../../core/react-src/src/shared/useMenuFit.js';
import Empty from '../../../../core/react-src/src/shared/Empty.jsx';
import { useAccess } from '../../../../core/react-src/src/shared/access.jsx';

/* Модуль «Каналы».

   Устройство дискордовское: группа → каналы → сообщения, участники и роли на
   группу, голосовые комнаты рядом с текстовыми. От «Сообщений» здесь взяты
   детали сообщения — вложения, звук, просмотрщик, живой фон, — но не лента:
   там диалог из облаков, тут общий поток из строк.

   Голосовой движок живёт отдельно (voice.js): соединения и медиапотоки
   переживают перерисовку, React их только показывает. */

const PAGE = 50;

const CH_EMPTY = { wrap: 'ch-empty-chat', title: '' };

export default function App({ registerBridge }) {
  const user = me();
  const meId = user.id || null;
  /* Права спрашиваем у сервера, а не выводим из названия роли: пороги
     правятся в админке, и «кто тут модератор» больше не константа.
     mythical модерирует свои группы, legendary — все; кнопки, которых
     ступень не тянет, просто не рисуются, поэтому подписи тут не нужны. */
  const access = useAccess();
  /* Модерирование даёт статус в самой группе, а не ступень: создал группу —
     в ней хозяин, делаешь всё. В чужих — обычный участник. Глобальная
     модерация (channels.moderate) работает поверх этого. */
  const canManageSpace = useCallback((sp) => {
    if (!sp) return false;
    if (access.may('channels.moderate')) return true;
    return sp.owner_id === meId || sp.my_space_role === 'owner' || sp.my_space_role === 'moderator';
  }, [access, meId]);

  const [spaces, setSpaces] = useState([]);
  const [channelsBySpace, setChannelsBySpace] = useState({});
  const [space, setSpace] = useState(null);
  const [channel, setChannel] = useState(null);
  /* Права всегда про текущую группу: раньше здесь стоял общий флаг, и в
     чужом канале показывались модераторские действия, которые сервер потом
     отклонял. */
  const admin = canManageSpace(spaces.find((s) => s.id === space));

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRead, setLastRead] = useState(0);
  const [members, setMembers] = useState([]);
  const [membersOpen, setMembersOpen] = useState(window.innerWidth > 1100);
  const [pins, setPins] = useState([]);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [typing, setTyping] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [reply, setReply] = useState(null);
  const [edit, setEdit] = useState(null);
  const [files, setFiles] = useState([]);
  const [gallery, setGallery] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [ctxRef, ctxPos] = useMenuFit(ctx);
  const [vs, setVs] = useState(voice.getVoiceState());
  const [modal, setModal] = useState(null);      // {kind, ...}
  const [mediaConfirm, setMediaConfirm] = useState(null);
  const [invite, setInvite] = useState(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const offset = useRef(0);
  const hasMore = useRef(true);
  const loadingMore = useRef(false);
  const chanRef = useRef(null);
  chanRef.current = channel;
  const spaceRef = useRef(null);
  spaceRef.current = space;
  const typingTimers = useRef({});

  useEffect(() => voice.subscribe(setVs), []);
  useEffect(() => { voice.setMyId(meId); }, [meId]);
  useEffect(() => { setAudioErrorHandler(() => toast('Ошибка воспроизведения', 'error')); }, []);

  const channels = channelsBySpace[space] || [];
  const chan = channels.find((c) => c.id === channel) || null;
  const isVoiceChannel = !!(chan && chan.type === 'voice');

  /* ── Загрузка ───────────────────────────────────────────────────────── */
  const loadSpaces = useCallback(async () => {
    const d = await api('/api/mod/channels/init');
    if (d && Array.isArray(d.spaces)) {
      setSpaces(d.spaces);
      setChannelsBySpace(d.channels || {});
      if (d.voice_rooms) voice.setRooms({ ...voice.getVoiceState().rooms, ...d.voice_rooms });
      return;
    }
    const sp = await api('/api/mod/channels/spaces');
    const list = Array.isArray(sp) ? sp : [];
    setSpaces(list);
    const map = {};
    await Promise.all(list.map(async (s) => {
      const ch = await api('/api/mod/channels/channels?space_id=' + s.id);
      map[s.id] = Array.isArray(ch) ? ch : [];
    }));
    setChannelsBySpace(map);
  }, []);

  useEffect(() => { loadSpaces(); }, [loadSpaces]);

  const loadMembers = useCallback(async (spaceId) => {
    if (!spaceId) return;
    const d = await api('/api/mod/channels/members?space_id=' + spaceId);
    setMembers(Array.isArray(d) ? d : []);
  }, []);

  const loadPins = useCallback(async (channelId) => {
    const d = await api('/api/mod/channels/pins?channel_id=' + channelId);
    setPins(Array.isArray(d) ? d : []);
  }, []);

  const loadMessages = useCallback(async (channelId) => {
    offset.current = 0;
    hasMore.current = true;
    loadingMore.current = false;
    setLoading(true);
    const d = await api('/api/mod/channels/messages?channel_id=' + channelId);
    if (chanRef.current !== channelId) return;
    const list = d && d.messages ? d.messages : (Array.isArray(d) ? d : []);
    setMessages(list);
    setLastRead(d && d.last_read ? d.last_read : 0);
    setLoading(false);
    api('/api/mod/channels/read?channel_id=' + channelId);
    setChannelsBySpace((m) => {
      const sid = spaceRef.current;
      if (!m[sid]) return m;
      return { ...m, [sid]: m[sid].map((c) => (c.id === channelId ? { ...c, unread: 0 } : c)) };
    });
  }, []);

  const openChannel = useCallback((spaceId, channelId) => {
    const list = channelsBySpace[spaceId] || [];
    const ch = list.find((c) => c.id === channelId);
    setSpace(spaceId);
    setChannel(channelId);
    setSearchOpen(false);
    setSearch('');
    setReply(null);
    setEdit(null);
    setPinsOpen(false);
    const sh = window.Shell;
    if (sh && sh.setImmersive) sh.setImmersive(true);
    loadMembers(spaceId);
    if (ch && ch.type === 'voice') { setMessages([]); return; }
    setMessages([]);
    loadMessages(channelId);
    loadPins(channelId);
    if (window.innerWidth > 768) requestAnimationFrame(() => inputRef.current && inputRef.current.focus());
  }, [channelsBySpace, loadMembers, loadMessages, loadPins]);

  const closeChat = useCallback(() => {
    setChannel(null);
    setSearchOpen(false);
    setSearch('');
    const sh = window.Shell;
    if (sh && sh.setImmersive) sh.setImmersive(false);
  }, []);

  const loadMore = useCallback(() => {
    const id = chanRef.current;
    if (!id || loadingMore.current || !hasMore.current) return;
    loadingMore.current = true;
    offset.current += PAGE;
    api('/api/mod/channels/messages?channel_id=' + id + '&offset=' + offset.current).then((d) => {
      loadingMore.current = false;
      const list = d && d.messages ? d.messages : (Array.isArray(d) ? d : []);
      if (!list.length) { hasMore.current = false; return; }
      setMessages((m) => list.concat(m));
    });
  }, []);

  /* ── Отправка ───────────────────────────────────────────────────────── */
  const send = useCallback((text) => {
    const id = chanRef.current;
    if (!id) return;
    if (edit) {
      wsSend({ type: 'ch_edit', channel_id: id, space_id: spaceRef.current, msg_id: edit.id, text });
      setEdit(null);
      return;
    }
    const payload = { type: 'ch_send', channel_id: id, space_id: spaceRef.current, text };
    if (reply) {
      payload.reply_to = reply.id;
      payload.reply_name = reply.from_name || reply.from;
      payload.reply_text = (reply.text || '').slice(0, 100);
    }
    wsSend(payload);
    setReply(null);
  }, [edit, reply]);

  const upload = useCallback(async (list, text) => {
    const id = chanRef.current;
    if (!id || !list.length) return;
    const fd = new FormData();
    fd.append('channel_id', id);
    fd.append('space_id', spaceRef.current);
    fd.append('text', text || '');
    if (reply) {
      fd.append('reply_to', reply.id);
      fd.append('reply_name', reply.from_name || '');
      fd.append('reply_text', (reply.text || '').slice(0, 100));
    }
    list.slice(0, 7).forEach((f) => fd.append('file', f));
    setReply(null);
    try {
      const sh = window.Shell;
      const r = await fetch('/api/ch/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + (sh ? sh.token : '') }, body: fd });
      const d = await r.json();
      if (!d || d.error) toast((d && d.error) || 'Ошибка', 'error');
    } catch (e) { toast('Ошибка загрузки', 'error'); }
  }, [reply]);

  const onTyping = useCallback(() => {
    const id = chanRef.current;
    if (id) wsSend({ type: 'ch_typing', channel_id: id, space_id: spaceRef.current });
  }, []);

  const react = useCallback((msgId, emoji) => {
    wsSend({ type: 'ch_react', channel_id: chanRef.current, space_id: spaceRef.current, msg_id: msgId, emoji });
  }, []);

  const pin = useCallback((m) => wsSend({ type: 'ch_pin', channel_id: chanRef.current, space_id: spaceRef.current, msg_id: m.id }), []);
  const unpin = useCallback((id) => wsSend({ type: 'ch_unpin', channel_id: chanRef.current, space_id: spaceRef.current, msg_id: id }), []);
  const del = useCallback((m) => wsSend({ type: 'ch_delete', channel_id: chanRef.current, space_id: spaceRef.current, msg_id: m.id }), []);

  const forwardToMessenger = useCallback((m) => {
    const sp = spaces.find((s) => s.id === spaceRef.current) || {};
    const list = channelsBySpace[spaceRef.current] || [];
    const ch = list.find((c) => c.id === chanRef.current) || {};
    const source = '#' + (ch.name || 'канал') + ' (' + (sp.name || 'группа') + ')';
    const text = m.text || '';
    const preview = text.length > 60 ? text.slice(0, 60) + '...' : (text || 'Вложение');
    const sh = window.Shell;
    if (sh) sh.switchModule('messenger');
    setTimeout(() => {
      if (window.Messenger && window.Messenger.startForward) {
        window.Messenger.startForward({
          type: 'channel_forward',
          text: '📨 Переслано из ' + source + '\n' + (m.from_name || '') + ': ' + text,
          fromName: m.from_name || '',
          fromId: m.from || '',
          preview: '📨 ' + source + ': ' + preview,
        });
      }
    }, 250);
  }, [spaces, channelsBySpace]);

  /* ── Поиск по каналу ────────────────────────────────────────────────── */
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return messages.filter((m) => (m.text || '').toLowerCase().includes(q)).map((m) => m.id);
  }, [search, messages]);
  const activeMatch = matches.length ? matches[Math.min(matchIdx, matches.length - 1)] : null;

  /* ── Голос ──────────────────────────────────────────────────────────── */
  const joinVoice = useCallback(() => {
    if (vs.roomId && vs.roomId !== chanRef.current) {
      if (!window.confirm('Вы уже подключены к голосовой комнате. Выйти и подключиться к новой?')) return;
      voice.leaveRoom();
    }
    voice.joinRoom(spaceRef.current, chanRef.current, meId);
  }, [vs.roomId, meId]);

  const onCam = useCallback(() => {
    if (vs.videoMuted) setMediaConfirm('cam');
    else voice.disableCamera();
  }, [vs.videoMuted]);

  const onScreen = useCallback(() => {
    if (vs.screenSharing) voice.stopScreenShare();
    else setMediaConfirm('screen');
  }, [vs.screenSharing]);

  const returnToRoom = useCallback(() => {
    if (!vs.roomId || !vs.spaceId) return;
    const sh = window.Shell;
    if (sh) sh.switchModule('channels');
    openChannel(vs.spaceId, vs.roomId);
  }, [vs.roomId, vs.spaceId, openChannel]);

  /* ── События сервера ────────────────────────────────────────────────── */
  const onWS = useCallback((d) => {
    if (d.type && d.type.startsWith('voice_')) {
      const passThru = ['voice_rooms_update', 'voice_invite_notify', 'voice_kicked'];
      /* Комнату спрашиваем у движка, а не у состояния экрана: voice_state
         приходит сразу за voice_join — раньше, чем React перерисуется, — и по
         замкнутому старому значению событие отбрасывалось вместе со всем
         составом комнаты. */
      if (voice.getVoiceState().roomId || passThru.indexOf(d.type) !== -1) {
        voice.onVoiceWS(d, {
          onInvite: (x) => setInvite(x),
          onHand: (x) => { if (admin) toast('✋ ' + x.username + ' хочет говорить'); },
        });
      }
      return;
    }

    if (d.type === 'ch_presence') {
      setMembers((list) => list.map((m) => (m.user_id === d.user_id
        ? { ...m, online: d.status ? d.status !== 'offline' : d.online, status: d.status || (d.online ? 'online' : 'offline') }
        : m)));
      return;
    }

    if (d.type === 'ch_update') { loadSpaces(); if (spaceRef.current) loadMembers(spaceRef.current); return; }

    if (d.type === 'ch_reacted' && d.channel_id === chanRef.current) {
      setMessages((m) => m.map((x) => (x.id === d.msg_id ? { ...x, reactions: d.reactions } : x)));
      return;
    }

    if (d.type === 'ch_pinned' && d.channel_id === chanRef.current) { setPins(d.pins || []); return; }

    if (d.type === 'ch_edited' && d.channel_id === chanRef.current) {
      setMessages((m) => m.map((x) => (x.id === d.msg_id ? { ...x, text: d.text, edited: true } : x)));
      return;
    }

    if (d.type === 'ch_deleted' && d.channel_id === chanRef.current) {
      setMessages((m) => m.filter((x) => x.id !== d.msg_id));
      return;
    }

    if (d.type === 'ch_message') {
      const myName = user.username || '';
      const text = (d.msg && d.msg.text) || '';
      // Упоминание — единственное, ради чего канал будит уведомление
      if (d.msg && d.msg.from !== meId && (text.includes('@' + myName) || text.includes('@all'))) {
        const sh = window.Shell;
        if (sh && sh.notify) {
          sh.notify({
            title: d.msg.from_name || 'Канал',
            text: text.slice(0, 120),
            onClick: () => { sh.switchModule('channels'); openChannel(d.space_id, d.channel_id); },
          });
        }
      }
      if (d.channel_id === chanRef.current) {
        setMessages((m) => (m.some((x) => x.id === d.msg.id) ? m : m.concat({ ...d.msg, _fresh: document.visibilityState === 'visible' })));
        api('/api/mod/channels/read?channel_id=' + d.channel_id);
      } else {
        setChannelsBySpace((map) => {
          const out = {};
          Object.keys(map).forEach((sid) => {
            out[sid] = map[sid].map((c) => (c.id === d.channel_id ? { ...c, unread: (c.unread || 0) + 1 } : c));
          });
          return out;
        });
      }
      return;
    }

    if (d.type === 'ch_typing' && d.channel_id === chanRef.current && d.user_id !== meId) {
      typingTimers.current[d.username] = Date.now();
      const refresh = () => {
        const now = Date.now();
        const names = Object.keys(typingTimers.current).filter((n) => {
          if (now - typingTimers.current[n] < 4000) return true;
          delete typingTimers.current[n];
          return false;
        });
        setTyping(names);
      };
      refresh();
      setTimeout(refresh, 4200);
    }
  }, [admin, loadSpaces, loadMembers, meId, user.username, openChannel]);

  useEffect(() => {
    registerBridge({
      onWS,
      onDeactivate: () => {},
      openChannel: (spaceId, channelId) => openChannel(spaceId, channelId),
    });
  }, [registerBridge, onWS, openChannel]);

  useEffect(() => () => { stopAudio(); voice.cleanup(); }, []);

  /* ── Модальные действия ─────────────────────────────────────────────── */
  const saveSpace = async (data) => {
    /* Сервер ждёт edit_id — на space_id он смотрит как на «в какой группе»,
       и правка молча создавала вторую группу вместо переименования. */
    const body = data.id
      ? { edit_id: data.id, name: data.name, photo: data.photo }
      : { name: data.name, type: data.type, photo: data.photo };
    await api('/api/mod/channels/spaces', { method: 'POST', body: JSON.stringify(body) });
    setModal(null);
    await loadSpaces();
    wsSend({ type: 'ch_update' });
  };

  const saveChannel = async (data) => {
    const sid = modal.spaceId;
    // То же и с каналом: без edit_id сервер считал правку созданием
    const body = data.id
      ? { edit_id: data.id, space_id: sid, name: data.name, icon: data.icon }
      : { space_id: sid, name: data.name, icon: data.icon, type: modal.voice ? 'voice' : 'text' };
    await api('/api/mod/channels/channels', { method: 'POST', body: JSON.stringify(body) });
    setModal(null);
    await loadSpaces();
    wsSend({ type: 'ch_update' });
  };

  const confirmDelete = async () => {
    const t = modal;
    setModal(null);
    if (t.kind === 'delete-space') {
      await api('/api/mod/channels/spaces?space_id=' + t.id, { method: 'DELETE' });
      if (space === t.id) { setSpace(null); setChannel(null); }
    } else {
      await api('/api/mod/channels/channels?channel_id=' + t.id + '&space_id=' + (t.spaceId || space || ''), { method: 'DELETE' });
      if (channel === t.id) setChannel(null);
    }
    await loadSpaces();
    wsSend({ type: 'ch_update' });
  };

  /* ── Отрисовка ──────────────────────────────────────────────────────── */
  const voiceBarNode = typeof document !== 'undefined' ? document.getElementById('sidebarVoiceBar') : null;
  const voiceChan = vs.roomId ? ((channelsBySpace[vs.spaceId] || []).find((c) => c.id === vs.roomId) || {}) : null;
  const voiceSpace = vs.roomId ? (spaces.find((s) => s.id === vs.spaceId) || {}) : null;

  return (
    <div className="ch-wrap">
      <div className="ch-mob-overlay" onClick={closeChat} />

      <Sidebar
        spaces={spaces} channelsBySpace={channelsBySpace} rooms={vs.rooms}
        currentChannel={channel} voiceRoomId={vs.roomId} admin={admin}
        canManageSpace={canManageSpace}
        onOpenChannel={openChannel}
        onCreateSpace={() => setModal({ kind: 'space' })}
        onEditSpace={(id) => setModal({ kind: 'space', space: spaces.find((s) => s.id === id) })}
        onDeleteSpace={(id) => {
          const sp = spaces.find((s) => s.id === id) || {};
          setModal({ kind: 'delete-space', id, title: 'Удалить группу?', text: `Группа «${sp.name}» и все её каналы будут удалены.` });
        }}
        onCreateChannel={(sid) => {
          const sp = spaces.find((s) => s.id === sid) || {};
          setModal({ kind: 'channel', spaceId: sid, voice: sp.type === 'voice_group' });
        }}
        onEditChannel={(sid, ch) => setModal({ kind: 'channel', spaceId: sid, channel: ch })}
        onDeleteChannel={(sid, ch) => setModal({ kind: 'delete-channel', id: ch.id, spaceId: sid, title: 'Удалить канал?', text: `Канал «${ch.name}» и его сообщения будут удалены.` })}
      />

      <div className={'ch-chat' + (channel ? ' mobile-open' : '')}>
        <Backdrop scrollRef={scrollRef} variant="rings" />

        {chan && (
          <div className="ch-chat-head" style={{ display: 'flex' }}>
            <button className="ch-back-btn" onClick={closeChat}><span className="ico ico-18 ico-back" /></button>
            <span className="ch-chat-channel">
              {isVoiceChannel
                ? <span className={'ico ico-16 ico-' + (chan.icon || 'mic')} style={{ backgroundColor: 'var(--accent)', marginRight: 6 }} />
                : '# '}
              <span>{chan.name}</span>
            </span>

            {!isVoiceChannel && (
              <div className={'ch-search-wrap' + (searchOpen ? ' open' : '')}>
                <SearchField
                  className="ch-search-field" placeholder="Поиск по каналу…"
                  value={search} onChange={(v) => { setSearch(v); setMatchIdx(0); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setSearchOpen(false); setSearch(''); }
                    if (e.key === 'Enter' && matches.length) {
                      setMatchIdx((i) => (e.shiftKey ? (i - 1 + matches.length) % matches.length : (i + 1) % matches.length));
                    }
                  }}
                >
                  <span className={'ch-search-count' + (matches.length ? ' has-results' : '')}>
                    {search.trim() ? (matches.length ? (Math.min(matchIdx, matches.length - 1) + 1) + '/' + matches.length : '0') : ''}
                  </span>
                  <button className="ch-search-nav-btn" onClick={() => matches.length && setMatchIdx((i) => (i - 1 + matches.length) % matches.length)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
                  </button>
                  <button className="ch-search-nav-btn" onClick={() => matches.length && setMatchIdx((i) => (i + 1) % matches.length)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                </SearchField>
              </div>
            )}

            <div className="ch-chat-actions">
              {!isVoiceChannel && (
                <button className="ch-action-btn" title="Поиск" onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setSearch(''); }}>
                  <span className="ico ico-16 ico-search" />
                </button>
              )}
              {isVoiceChannel && (
                <button className="ch-action-btn" title="Настройки" onClick={() => setModal({ kind: 'voice-settings' })}>
                  <span className="ico ico-16 ico-settings" />
                </button>
              )}
              <button className="ch-action-btn" title="Участники" onClick={() => setMembersOpen((v) => !v)}>
                <span className="ico ico-16 ico-users" />
              </button>
            </div>
          </div>
        )}

        {!chan && (
          <div className="ch-messages">
            <Empty
              classes={CH_EMPTY}
              icon={<span className="ico ico-24 ico-channels" style={{ opacity: 0.15 }} />}
              title="Выберите канал для общения"
            />
          </div>
        )}

        {chan && !isVoiceChannel && (
          <>
            {pins.length > 0 && (
              <div className="ch-pin-bar" style={{ display: 'flex' }} onClick={() => setPinsOpen((v) => !v)}>
                <span className="ico ico-14 ico-pin" style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div className="ch-pin-text">{(pins[pins.length - 1].text || '').slice(0, 60)}</div>
                <span className="ch-pin-count">{pins.length}</span>
              </div>
            )}
            {pinsOpen && (
              <div className="ch-pins-panel" style={{ display: 'block' }}>
                {pins.length ? pins.map((p) => (
                  <div className="ch-pin-item" key={p.id}>
                    <div className="ch-pin-item-body" onClick={() => { setPinsOpen(false); setMatchIdx(0); setSearch(''); }}>
                      <div className="ch-pin-item-author">{p.from_name || ''}</div>
                      <div className="ch-pin-item-text">{(p.text || '').slice(0, 120)}</div>
                    </div>
                    {admin && (
                      <button className="ch-pin-unpin" onClick={(e) => { e.stopPropagation(); unpin(p.id); }}>
                        <span className="ico ico-14 ico-pin" />
                      </button>
                    )}
                  </div>
                )) : <div className="ch-pins-empty">Нет закреплённых сообщений</div>}
              </div>
            )}

            <MessageList
              messages={messages} loading={loading} meId={meId} admin={admin} lastRead={lastRead}
              channelId={channel}
              search={searchOpen ? search : ''} activeMatch={searchOpen ? activeMatch : null} scrollRef={scrollRef}
              onLoadMore={loadMore}
              onCtx={(e, m) => setCtx({ m, x: e.clientX, y: e.clientY })}
              onReply={(m) => { setEdit(null); setReply(m); inputRef.current && inputRef.current.focus(); }}
              onForward={forwardToMessenger}
              onPin={pin}
              onEdit={(m) => { setReply(null); setEdit(m); inputRef.current && inputRef.current.focus(); }}
              onDelete={del}
              onReact={react}
              onOpenMedia={(list, i) => setGallery({ items: list, index: i })}
              onJump={(id) => {
                const el = scrollRef.current && scrollRef.current.querySelector('.ch-msg[data-msgid="' + CSS.escape(id) + '"]');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />

            {typing.length > 0 && (
              <div className="ch-typing" style={{ display: 'block' }}>
                {typing.length === 1 ? typing[0] + ' печатает...'
                  : typing.length <= 3 ? typing.join(', ') + ' печатают...'
                    : typing.slice(0, 2).join(', ') + ' и ещё ' + (typing.length - 2) + ' печатают...'}
              </div>
            )}

            <Composer
              members={members} reply={reply} edit={edit} files={files} setFiles={setFiles}
              onSend={send} onUpload={upload} onTyping={onTyping}
              onCancelReply={() => setReply(null)} onCancelEdit={() => setEdit(null)}
              inputRef={inputRef}
            />
          </>
        )}

        {chan && isVoiceChannel && (
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 1 }}>
            {vs.roomId === channel
              ? (
                <ActiveRoom
                  st={vs} admin={admin}
                  onSettings={() => setModal({ kind: 'voice-settings' })}
                  onLeave={() => voice.leaveRoom()}
                  onCam={onCam} onScreen={onScreen}
                />
              )
              : (
                <PreJoin
                  name={chan.name} room={vs.rooms[channel] || {}} joining={vs.joining}
                  onJoin={joinVoice} onSettings={() => setModal({ kind: 'voice-settings' })}
                />
              )}
          </div>
        )}
      </div>

      {membersOpen && chan && (
        <Members
          members={members} room={vs.room} isVoiceChannel={isVoiceChannel} admin={admin} meId={meId}
          inVoiceRoom={!!vs.roomId}
          onClose={() => setMembersOpen(false)}
          onAdd={() => setModal({ kind: 'add-members' })}
          onWrite={(uid) => {
            const sh = window.Shell;
            if (sh) sh.switchModule('messenger');
            setTimeout(() => { if (window.Messenger) window.Messenger.openChat(uid); }, 200);
          }}
          onInvite={(uid) => voice.inviteUser(uid)}
          onKickVoice={(uid) => voice.kickUser(uid)}
          onSetModerator={async (uid, value) => {
            await api('/api/mod/channels/members', { method: 'POST', body: JSON.stringify({ space_id: space, set_moderator: { user_id: uid, value } }) });
            toast(value ? 'Модератор назначен' : 'Модератор снят');
            loadMembers(space);
            wsSend({ type: 'ch_update' });
          }}
          onKick={(uid) => { wsSend({ type: 'ch_kick', space_id: space, user_id: uid }); toast('Участник удалён'); }}
        />
      )}

      {ctx && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCtx(null); }} />
          <div className="ch-ctx" ref={ctxRef} style={{ display: 'block', zIndex: 200, ...ctxPos }}>
            <div className="ch-ctx-item" onClick={() => { setReply(ctx.m); setCtx(null); }}><span className="ico ico-14 ico-reply" /> Ответить</div>
            <div className="ch-ctx-item" onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(ctx.m.text || '').then(() => toast('Скопировано')); setCtx(null); }}>
              <span className="ico ico-14 ico-copy" /> Копировать
            </div>
            <div className="ch-ctx-item" onClick={() => { forwardToMessenger(ctx.m); setCtx(null); }}><span className="ico ico-14 ico-forward" /> Переслать</div>
            {admin && <div className="ch-ctx-item" onClick={() => { pin(ctx.m); setCtx(null); }}><span className="ico ico-14 ico-pin" /> Закрепить</div>}
            {ctx.m.from === meId && (
              <div className="ch-ctx-item" onClick={() => { setEdit(ctx.m); setCtx(null); }}><span className="ico ico-14 ico-pencil" /> Редактировать</div>
            )}
            {(ctx.m.from === meId || admin) && (
              <div className="ch-ctx-item ch-ctx-danger" onClick={() => { del(ctx.m); setCtx(null); }}><span className="ico ico-14 ico-trash" /> Удалить</div>
            )}
          </div>
        </>
      )}

      <Gallery open={gallery} onClose={() => setGallery(null)} />

      <SpaceModal open={modal && modal.kind === 'space' ? modal : null} onClose={() => setModal(null)} onSave={saveSpace} />
      <ChannelModal open={modal && modal.kind === 'channel' ? modal : null} onClose={() => setModal(null)} onSave={saveChannel} />
      <ConfirmModal
        open={modal && (modal.kind === 'delete-space' || modal.kind === 'delete-channel') ? modal : null}
        onClose={() => setModal(null)} onConfirm={confirmDelete}
      />
      <AddMembersModal
        open={modal && modal.kind === 'add-members' ? modal : null} members={members}
        onClose={() => setModal(null)}
        onAdd={async (ids) => {
          await api('/api/mod/channels/members', { method: 'POST', body: JSON.stringify({ space_id: space, user_ids: ids }) });
          setModal(null);
          toast('Добавлены');
          loadMembers(space);
          wsSend({ type: 'ch_update' });
        }}
      />
      <VoiceSettingsModal open={modal && modal.kind === 'voice-settings'} onClose={() => setModal(null)} />
      <MediaConfirmModal
        open={mediaConfirm}
        onClose={() => setMediaConfirm(null)}
        onConfirm={() => {
          const kind = mediaConfirm;
          setMediaConfirm(null);
          if (kind === 'screen') voice.startScreenShare(); else voice.enableCamera();
        }}
      />

      {invite && (
        <div className="ch-notify ch-voice-invite">
          <div className="ch-notify-icon"><span className="ico ico-16 ico-mic" style={{ backgroundColor: 'var(--accent)' }} /></div>
          <div className="ch-notify-body">
            <div className="ch-notify-source">{invite.from_username || ''}</div>
            <div className="ch-notify-text">приглашает в голосовую комнату</div>
          </div>
          <button
            className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
            onClick={() => { openChannel(invite.space_id, invite.room_id); setInvite(null); }}
          >
            Войти
          </button>
          <button className="ch-notify-close" onClick={() => setInvite(null)}>×</button>
        </div>
      )}

      {/* Плашка голосовой живёт в каркасе — рисуем её порталом в его узел,
          чтобы она оставалась видимой и в других модулях. */}
      {vs.roomId && voiceBarNode && createPortal(
        <>
          <div className="sb-voice-bar-ico" title={voiceChan ? voiceChan.name : 'Голосовая'} onClick={returnToRoom}>
            {voiceSpace && voiceSpace.photo
              ? <img className="sb-vb-img" src={'data:image/jpeg;base64,' + voiceSpace.photo} alt="" />
              : (
                <div className="sb-vb-icon-circle">
                  <span className={'ico ico-16 ico-' + ((voiceChan && voiceChan.icon) || 'mic')} style={{ backgroundColor: 'var(--accent)' }} />
                </div>
              )}
          </div>
          {window.innerWidth > 768 && (
            <div className="sb-voice-bar-controls">
              <button className="sb-vb-btn" title="Микрофон" onClick={(e) => { e.stopPropagation(); voice.toggleMic(); }}>
                <span className={'ico ico-14 ' + (vs.muted ? 'ico-mic-off' : 'ico-mic')} style={vs.muted ? undefined : { backgroundColor: 'var(--accent)' }} />
              </button>
              <button className="sb-vb-btn sb-vb-leave" title="Выйти" onClick={(e) => { e.stopPropagation(); voice.leaveRoom(); }}>
                <span className="ico ico-14 ico-phone-off" />
              </button>
            </div>
          )}
        </>,
        voiceBarNode,
      )}
    </div>
  );
}
