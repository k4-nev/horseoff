import { toast, wsSend } from './lib.js';

/* Голосовые комнаты: WebRTC-меш и всё, что к нему прилагается.

   Это не компонент и намеренно им не стало. RTCPeerConnection, MediaStream и
   аудиоконтекст — не состояние экрана: они переживают перерисовку, их нельзя
   пересоздавать на каждый рендер, и React про них знать не должен. Здесь
   живёт движок, наружу он отдаёт простое состояние комнаты и список потоков,
   а тайлы рисует React и цепляет поток к <video> через ref.

   Логика соединений перенесена как есть — она выстрадана: явный offer вместо
   onnegotiationneeded (разные браузеры ведут себя по-разному), очередь ICE до
   remoteDescription, переиспользование живого peer при переговорах. */

const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: ['turn:horseoff-workspace.ru:3478', 'turn:horseoff-workspace.ru:3478?transport=tcp'], username: 'horseoffturnvoice', credential: 'VLjNdf[8h%QYBGy' },
  { urls: ['turns:horseoff-workspace.ru:5349', 'turns:horseoff-workspace.ru:5349?transport=tcp'], username: 'horseoffturnvoice', credential: 'VLjNdf[8h%QYBGy' },
];

const subs = new Set();

let state = {
  roomId: null,
  spaceId: null,
  myId: null,
  room: null,          // {speakers:[], listeners:[]}
  rooms: {},           // сводка по всем комнатам для сайдбара
  isSpeaker: false,
  muted: true,
  videoMuted: true,
  screenSharing: false,
  handRaised: false,
  speaking: {},        // user_id → bool
  streamsVersion: 0,   // растёт, когда меняется набор потоков
  joining: false,
};

const peers = {};
const remote = {};
const iceQueue = {};
let localStream = null;
let vadCtx = null;

/* ── Выбранные устройства ───────────────────────────────────────────────
   Выбор из настроек надо и запомнить между сеансами, и применить сразу —
   раньше select ничего никуда не отдавал: закрыл окно, и выбора как не
   бывало. Пустая строка — «системное по умолчанию». */
const DEV_KEY = 'ho_voice_devices';
let devices = { mic: '', cam: '', spk: '' };
try {
  const saved = JSON.parse(localStorage.getItem(DEV_KEY) || '{}');
  devices = { mic: saved.mic || '', cam: saved.cam || '', spk: saved.spk || '' };
} catch (e) { /* испорченная запись — берём системные */ }

export function getDevices() { return { ...devices }; }

const micConstraint = () => (devices.mic ? { deviceId: { exact: devices.mic } } : true);
const camConstraint = (res) => (devices.cam ? { ...res, deviceId: { exact: devices.cam } } : res);

/* Динамик выбирается не ограничением, а на самом элементе: setSinkId есть
   не везде, поэтому неудача здесь ничего не ломает. */
export function attachSink(el) {
  if (!el || !devices.spk || !el.setSinkId) return;
  el.setSinkId(devices.spk).catch(() => {});
}

/** Смена устройства из настроек: запоминаем и подменяем живую дорожку. */
export async function setDevice(kind, id) {
  devices = { ...devices, [kind]: id || '' };
  try { localStorage.setItem(DEV_KEY, JSON.stringify(devices)); } catch (e) { /* приватный режим */ }

  if (kind === 'spk') { emit({ streamsVersion: state.streamsVersion + 1 }); return; }
  if (!state.roomId || !localStream) return;

  const wantVideo = kind === 'cam';
  if (wantVideo && (state.videoMuted || state.screenSharing)) return;  // нечего подменять
  const old = wantVideo ? localStream.getVideoTracks()[0] : localStream.getAudioTracks()[0];
  if (!old) return;

  try {
    const fresh = await navigator.mediaDevices.getUserMedia(
      wantVideo ? { video: camConstraint({ width: { ideal: 1280 }, height: { ideal: 720 } }) } : { audio: micConstraint() },
    );
    const track = wantVideo ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
    if (!track) return;
    track.enabled = old.enabled;
    Object.keys(peers).forEach((uid) => {
      const sender = peers[uid].getSenders().find((x) => x.track && x.track.kind === track.kind);
      if (sender) sender.replaceTrack(track).catch(() => {});
    });
    localStream.removeTrack(old);
    old.stop();
    localStream.addTrack(track);
    if (!wantVideo) { stopVAD(); initVAD(); }
    emit({ streamsVersion: state.streamsVersion + 1 });
    toast(wantVideo ? 'Камера переключена' : 'Микрофон переключён');
  } catch (e) {
    toast('Не удалось переключить устройство', 'error');
  }
}

function emit(patch) {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn(state));
}

export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function getVoiceState() { return state; }
export function setRooms(rooms) { emit({ rooms: rooms || {} }); }
export function setMyId(id) { state.myId = id; }

/** Поток участника: свой — локальный, чужой — принятый по сети. */
export function streamOf(userId) {
  if (userId === state.myId) return localStream;
  return remote[userId] || null;
}
export const hasMic = () => !!localStream;

/* ── Соединения ─────────────────────────────────────────────────────── */
function initPeer(userId, isInitiator) {
  const queued = iceQueue[userId] || [];
  if (peers[userId]) { try { peers[userId].close(); } catch (e) { /* уже закрыт */ } }
  const pc = new RTCPeerConnection({ iceServers: ICE });
  peers[userId] = pc;
  iceQueue[userId] = queued;

  pc.ontrack = (e) => {
    const stream = e.streams && e.streams[0];
    if (stream) remote[userId] = stream;
    else {
      if (!remote[userId]) remote[userId] = new MediaStream();
      remote[userId].addTrack(e.track);
    }
    emit({ streamsVersion: state.streamsVersion + 1 });
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) wsSend({ type: 'voice_ice', room_id: state.roomId, to_user_id: userId, candidate: e.candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') { try { pc.restartIce(); } catch (e) { /* нечего перезапускать */ } }
  };

  if (localStream) {
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    // Видео своего нет — всё равно готовы принимать чужое
    if (!localStream.getVideoTracks().length) {
      try { pc.addTransceiver('video', { direction: 'recvonly' }); } catch (e) { /* старый браузер */ }
    }
  } else {
    try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch (e) { /* старый браузер */ }
    try { pc.addTransceiver('video', { direction: 'recvonly' }); } catch (e) { /* старый браузер */ }
  }

  if (isInitiator) {
    // Явный offer надёжнее onnegotiationneeded: браузеры расходятся в моменте
    setTimeout(async () => {
      if (peers[userId] !== pc) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsSend({ type: 'voice_offer', room_id: state.roomId, to_user_id: userId, sdp: pc.localDescription.toJSON() });
      } catch (e) { /* соединение уже не нужно */ }
    }, 100);
  }
  return pc;
}

async function renegotiate(userId) {
  const pc = peers[userId];
  if (!pc) return;
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsSend({ type: 'voice_offer', room_id: state.roomId, to_user_id: userId, sdp: pc.localDescription.toJSON() });
  } catch (e) { /* пир уже закрыт */ }
}

/* ── Вход и выход ───────────────────────────────────────────────────── */
export async function joinRoom(spaceId, roomId, myId) {
  emit({ joining: true });
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraint(), video: false });
    localStream.getAudioTracks().forEach((t) => { t.enabled = false; });
    emit({ isSpeaker: true });
  } catch (e) {
    localStream = null;
    emit({ isSpeaker: false });
    toast('У вас нет микрофона, вы подключены как слушатель', 'info');
  }
  emit({
    roomId, spaceId, myId: myId || state.myId,
    muted: true, videoMuted: true, handRaised: false, joining: false,
  });
  wsSend({ type: 'voice_join', room_id: roomId, space_id: spaceId });
  initVAD();
}

/* Кто говорит — по громкости своего же потока: сервер такого не знает, а
   подсветка плитки нужна сразу, без круга через сеть. */
function stopVAD() {
  if (!vadCtx) return;
  try { vadCtx.close(); } catch (e) { /* уже закрыт */ }
  vadCtx = null;
}

function initVAD() {
  if (!localStream) return;
  stopVAD();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(localStream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    an.smoothingTimeConstant = 0.3;
    src.connect(an);
    vadCtx = ctx;
    const data = new Uint8Array(an.frequencyBinCount);
    let speaking = false;
    const tick = () => {
      if (!state.roomId) return;
      an.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const isSpeaking = sum / data.length > 10 && !state.muted;
      if (ctx !== vadCtx) return;   // дорожку сменили — этот анализатор больше не нужен
      if (isSpeaking !== speaking) {
        speaking = isSpeaking;
        wsSend({ type: 'voice_speaking', room_id: state.roomId, speaking });
        emit({ speaking: { ...state.speaking, [state.myId]: speaking } });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) { /* без анализатора обойдёмся */ }
}

export function leaveRoom() {
  if (!state.roomId) return;
  wsSend({ type: 'voice_leave', room_id: state.roomId });
  cleanup();
}

export function cleanup() {
  Object.keys(peers).forEach((uid) => { try { peers[uid].close(); } catch (e) { /* уже закрыт */ } delete peers[uid]; });
  Object.keys(remote).forEach((uid) => delete remote[uid]);
  Object.keys(iceQueue).forEach((uid) => delete iceQueue[uid]);
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  stopVAD();
  emit({
    roomId: null, spaceId: null, room: null, isSpeaker: false,
    muted: true, videoMuted: true, screenSharing: false, handRaised: false,
    speaking: {}, streamsVersion: state.streamsVersion + 1,
  });
}

/* ── Управление ─────────────────────────────────────────────────────── */
export function toggleMic() {
  const muted = !state.muted;
  if (localStream) localStream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  wsSend({ type: 'voice_mute', room_id: state.roomId, muted, video_muted: state.videoMuted });
  const speaking = { ...state.speaking };
  if (muted) speaking[state.myId] = false;
  emit({ muted, speaking });
}

export async function enableCamera() {
  const n = state.room ? (state.room.speakers || []).length : 1;
  const res = n <= 2 ? { width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 640 }, height: { ideal: 360 } };
  try {
    // Живую дорожку возвращаем включением, а не новым запросом устройства
    const existing = localStream ? localStream.getVideoTracks().find((t) => t.readyState !== 'ended') : null;
    if (existing) {
      existing.enabled = true;
    } else {
      const vs = await navigator.mediaDevices.getUserMedia({ video: camConstraint(res) });
      const track = vs.getVideoTracks()[0];
      if (!track) return;
      if (localStream) localStream.addTrack(track);
      else localStream = new MediaStream([track]);
      Object.keys(peers).forEach((uid) => {
        const pc = peers[uid];
        const trs = pc.getTransceivers ? pc.getTransceivers() : [];
        const vt = trs.find((tr) => (tr.sender.track && tr.sender.track.kind === 'video')
          || (!tr.sender.track && tr.receiver && tr.receiver.track && tr.receiver.track.kind === 'video'));
        if (vt) {
          if (vt.direction === 'recvonly' || vt.direction === 'inactive') vt.direction = 'sendrecv';
          vt.sender.replaceTrack(track).catch(() => {});
        } else {
          try { pc.addTrack(track, localStream); } catch (e) { /* уже добавлен */ }
        }
        renegotiate(uid);
      });
    }
    wsSend({ type: 'voice_mute', room_id: state.roomId, muted: state.muted, video_muted: false });
    emit({ videoMuted: false, streamsVersion: state.streamsVersion + 1 });
  } catch (e) {
    toast('Нет доступа к камере', 'error');
  }
}

export function disableCamera() {
  // enabled=false, а не stop: дорожку можно вернуть без переговоров
  if (localStream) localStream.getVideoTracks().forEach((t) => { t.enabled = false; });
  wsSend({ type: 'voice_mute', room_id: state.roomId, muted: state.muted, video_muted: true });
  emit({ videoMuted: true, screenSharing: false, streamsVersion: state.streamsVersion + 1 });
}

export async function startScreenShare() {
  try {
    const ds = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = ds.getVideoTracks()[0];
    if (!track) return;
    if (localStream) localStream.getVideoTracks().forEach((t) => { if (t !== track) t.stop(); });
    if (localStream) localStream.addTrack(track);
    else localStream = new MediaStream([track]);
    Object.keys(peers).forEach((uid) => {
      const pc = peers[uid];
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(track).catch(() => {});
      else { try { pc.addTrack(track, localStream); } catch (e) { /* уже добавлен */ } }
      renegotiate(uid);
    });
    // Остановка из системной панели браузера — тоже выход из показа
    track.onended = () => stopScreenShare();
    wsSend({ type: 'voice_mute', room_id: state.roomId, muted: state.muted, video_muted: false });
    emit({ screenSharing: true, videoMuted: false, streamsVersion: state.streamsVersion + 1 });
  } catch (e) { /* человек передумал в системном окне */ }
}

export function stopScreenShare() {
  if (localStream) localStream.getVideoTracks().forEach((t) => t.stop());
  emit({ screenSharing: false });
  disableCamera();
}

export function toggleHand() {
  const raised = !state.handRaised;
  wsSend({ type: 'voice_raise_hand', room_id: state.roomId, raised });
  emit({ handRaised: raised });
}

export const allowSpeak = (userId) => wsSend({ type: 'voice_allow_speak', room_id: state.roomId, user_id: userId });
export const inviteUser = (userId) => { wsSend({ type: 'voice_invite', room_id: state.roomId, to_user_id: userId }); toast('Приглашение отправлено'); };
export const kickUser = (userId) => wsSend({ type: 'voice_kick', room_id: state.roomId, target_user_id: userId });

/* ── События сервера ────────────────────────────────────────────────── */
export function onVoiceWS(d, hooks = {}) {
  const t = d.type;

  if (t === 'voice_rooms_update') { emit({ rooms: d.rooms || {} }); return; }
  if (t === 'voice_invite_notify') { if (hooks.onInvite) hooks.onInvite(d); return; }
  if (t === 'voice_kicked') { toast('Вас отключили от голосовой комнаты', 'error'); cleanup(); return; }

  if (t === 'voice_state') {
    const room = d.room || { speakers: [], listeners: [] };
    (room.speakers || []).forEach((p) => { if (p.user_id !== state.myId) initPeer(p.user_id, true); });
    emit({ room, isSpeaker: d.you_are === 'speaker' });
    return;
  }

  if (t === 'voice_joined') {
    const room = state.room || { speakers: [], listeners: [] };
    const arr = d.as_speaker ? (room.speakers || []) : (room.listeners || []);
    if (!arr.find((p) => p.user_id === d.user_id)) {
      arr.push({ user_id: d.user_id, username: d.username, avatar: d.avatar, muted: true, video_muted: true, raised_hand: false });
    }
    if (d.as_speaker && state.isSpeaker && d.user_id !== state.myId) initPeer(d.user_id, false);
    emit({ room: { speakers: room.speakers || [], listeners: room.listeners || [] } });
    return;
  }

  if (t === 'voice_left') {
    const room = state.room;
    if (peers[d.user_id]) { try { peers[d.user_id].close(); } catch (e) { /* уже закрыт */ } delete peers[d.user_id]; }
    delete remote[d.user_id];
    emit({
      room: room ? {
        speakers: (room.speakers || []).filter((p) => p.user_id !== d.user_id),
        listeners: (room.listeners || []).filter((p) => p.user_id !== d.user_id),
      } : room,
      streamsVersion: state.streamsVersion + 1,
    });
    return;
  }

  if (t === 'voice_offer') {
    const uid = d.from_user_id;
    const existing = peers[uid];
    // Переговоры на живом соединении: рвать его и собирать заново — потеря звука
    const pc = (existing && (existing.connectionState === 'connected' || existing.connectionState === 'connecting'))
      ? existing : initPeer(uid, false);
    pc.setRemoteDescription(new RTCSessionDescription(d.sdp))
      .then(() => {
        const q = iceQueue[uid] || [];
        iceQueue[uid] = [];
        return Promise.all(q.map((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})))
          .then(() => pc.createAnswer());
      })
      .then((ans) => pc.setLocalDescription(ans).then(() => {
        wsSend({ type: 'voice_answer', room_id: state.roomId, to_user_id: uid, sdp: pc.localDescription.toJSON() });
      }))
      .catch(() => {});
    return;
  }

  if (t === 'voice_answer') {
    const uid = d.from_user_id;
    const pc = peers[uid];
    if (!pc) return;
    pc.setRemoteDescription(new RTCSessionDescription(d.sdp)).then(() => {
      const q = iceQueue[uid] || [];
      iceQueue[uid] = [];
      q.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
    }).catch(() => {});
    return;
  }

  if (t === 'voice_ice') {
    const uid = d.from_user_id;
    if (!d.candidate) return;
    const pc = peers[uid];
    // Кандидат может прийти раньше описания — тогда придерживаем его
    if (!pc || !pc.remoteDescription) {
      if (!iceQueue[uid]) iceQueue[uid] = [];
      iceQueue[uid].push(d.candidate);
      return;
    }
    pc.addIceCandidate(new RTCIceCandidate(d.candidate)).catch(() => {});
    return;
  }

  if (t === 'voice_mute_update') {
    const room = state.room;
    if (!room) return;
    emit({
      room: {
        ...room,
        speakers: (room.speakers || []).map((p) => (p.user_id === d.user_id
          ? { ...p, muted: d.muted, video_muted: d.video_muted } : p)),
      },
    });
    return;
  }

  if (t === 'voice_speaking') {
    emit({ speaking: { ...state.speaking, [d.user_id]: d.speaking } });
    return;
  }

  if (t === 'voice_hand_raised') {
    const room = state.room;
    if (room) {
      emit({ room: { ...room, listeners: (room.listeners || []).map((p) => (p.user_id === d.user_id ? { ...p, raised_hand: d.raised } : p)) } });
    }
    if (hooks.onHand && d.raised) hooks.onHand(d);
    return;
  }

  if (t === 'voice_promoted') {
    const room = state.room;
    if (room) {
      const found = (room.listeners || []).find((p) => p.user_id === d.user_id);
      if (found) {
        emit({
          room: {
            speakers: (room.speakers || []).concat([{ ...found, muted: true, video_muted: true, raised_hand: false }]),
            listeners: (room.listeners || []).filter((p) => p.user_id !== d.user_id),
          },
        });
      }
    }
    if (d.user_id === state.myId) { emit({ isSpeaker: true }); toast('Вам дали слово 🎤'); }
  }
}
