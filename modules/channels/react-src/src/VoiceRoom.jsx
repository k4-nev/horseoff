import { useEffect, useRef, useState } from 'react';
import { plural } from './lib.js';
import * as voice from './voice.js';

/* Голосовая комната: экран перед входом и сама комната.

   Потоки к <video> цепляются через ref — srcObject нельзя выразить атрибутом,
   а держать MediaStream в состоянии React незачем: он живёт в движке
   (voice.js) и переживает перерисовки. */

function Video({ userId, version, muted, hidden }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const s = voice.streamOf(userId);
    if (el.srcObject !== s) {
      el.srcObject = s || null;
      if (s) el.play().catch(() => {});
    }
  }, [userId, version, hidden]);
  return <video className="ch-va-video" ref={ref} autoPlay playsInline muted={muted} style={{ display: hidden ? 'none' : 'block' }} />;
}

function Avatar({ p, cls }) {
  return p.avatar
    ? <img className={cls} src={'data:image/png;base64,' + p.avatar} alt="" />
    : <div className={cls + ' ' + cls + '-empty'}>{(p.username || '?')[0].toUpperCase()}</div>;
}

export function PreJoin({ name, room, onJoin, onSettings, joining }) {
  const speakers = room.speakers || [];
  const total = room.total || 0;
  return (
    <div className="ch-vpj-wrap" style={{ display: 'flex' }}>
      <div className="ch-vpj-icon">🔊</div>
      <div className="ch-vpj-room-name">{name}</div>
      <div className="ch-vpj-participants">
        {speakers.slice(0, 6).map((p) => (
          <div className="ch-vpj-participant" key={p.user_id}>
            <Avatar p={p} cls="ch-vpj-av" />
            <span className="ch-vpj-pname">{p.username}</span>
          </div>
        ))}
      </div>
      <div className="ch-vpj-status">
        {total === 0 ? 'В комнате никого нет' : total + ' ' + plural(total, 'участник', 'участника', 'участников') + ' сейчас'}
      </div>
      <div className="ch-vpj-preview">
        <div className="ch-vpj-device-row">
          <span className="ch-vpj-device-ico"><span className="ico ico-20 ico-mic-off" style={{ backgroundColor: '#6b7585' }} /></span>
          <span>Микрофон выключен при входе</span>
        </div>
        <div className="ch-vpj-device-row">
          <span className="ch-vpj-device-ico"><span className="ico ico-20 ico-video-off" style={{ backgroundColor: '#6b7585' }} /></span>
          <span>Камера выключена при входе</span>
        </div>
      </div>
      <div className="ch-vpj-actions">
        <button className="btn-icon-only srv-settings-btn" title="Настройки" onClick={onSettings}>
          <span className="ico ico-16 ico-settings" />
        </button>
        <button className="btn btn-primary ch-vpj-join-btn" disabled={joining} onClick={onJoin}>
          {joining ? 'Подключение...' : 'Войти в комнату'}
        </button>
      </div>
    </div>
  );
}

/** Развёрнутая плитка: один участник во весь экран. */
function Expanded({ p, isMe, st, onClose, onMic, onCam, onScreen, onLeave, hasDisplayMedia }) {
  return (
    <div className="ch-va-overlay">
      <Video userId={p.user_id} version={st.streamsVersion} muted={isMe} hidden={p.video_muted} />
      {p.video_muted && (
        <div className="ch-va-ov-av">
          <Avatar p={p} cls="ch-va-ov-avimg" />
          <div className="ch-va-ov-name">{p.username}</div>
        </div>
      )}
      <button className="ch-va-ov-close" onClick={onClose}>✕</button>
      <div className="ch-va-ov-bar">
        <div className="ch-va-ov-capsule">
          <div className="ch-va-ov-who"><Avatar p={p} cls="ch-va-ov-mini" /><span>{p.username}</span></div>
          <button className="ch-va-ov-btn" onClick={onMic}>
            <span className={'ico ico-20 ' + (st.muted ? 'ico-mic-off' : 'ico-mic')} />
          </button>
          <button className="ch-va-ov-btn" onClick={onCam}>
            <span className={'ico ico-20 ' + (st.videoMuted ? 'ico-video-off' : 'ico-video')} />
          </button>
          {hasDisplayMedia && (
            <button className="ch-va-ov-btn" style={st.screenSharing ? { color: 'var(--accent)' } : undefined} onClick={onScreen}>
              <span className="ico ico-20 ico-screen" />
            </button>
          )}
          <button className="ch-va-ov-btn ch-va-ov-leave" onClick={onLeave}>
            <span className="ico ico-20 ico-phone-off" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ActiveRoom({ st, admin, onSettings, onLeave, onCam, onScreen }) {
  const [expanded, setExpanded] = useState(null);
  const speakers = (st.room && st.room.speakers) || [];
  const listeners = (st.room && st.room.listeners) || [];
  const hasDisplayMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  const exp = expanded ? speakers.find((p) => p.user_id === expanded) : null;

  return (
    <div className="ch-va-wrap" style={{ display: 'flex' }}>
      <div className="ch-va-grid" data-count={speakers.length}>
        {speakers.map((p) => {
          const isMe = p.user_id === st.myId;
          return (
            <div
              className={'ch-va-tile' + (p.muted ? ' ch-va-muted' : '') + (st.speaking[p.user_id] ? ' ch-va-speaking' : '')}
              key={p.user_id}
              onClick={() => setExpanded(p.user_id)}
            >
              <Video userId={p.user_id} version={st.streamsVersion} muted={isMe} hidden={p.video_muted} />
              {p.video_muted && <div className="ch-va-av-wrap"><Avatar p={p} cls="ch-va-av" /></div>}
              <div className="ch-va-tile-name">
                {p.username}
                {p.muted && <span className="ch-va-tile-mico"><span className="ico ico-14 ico-mic-off" /></span>}
              </div>
            </div>
          );
        })}
      </div>

      {listeners.length > 0 && (
        <div className="ch-va-listeners" style={{ display: 'flex' }}>
          <span className="ch-va-lst-title">Слушатели ({listeners.length})</span>
          {listeners.map((p) => (
            <div className="ch-va-listener" key={p.user_id}>
              <Avatar p={p} cls="ch-va-lst-av" />
              <span>{p.username}{p.raised_hand ? ' ✋' : ''}</span>
              {admin && p.raised_hand && speakers.length < 6 && (
                <button className="ch-vp-promote-btn" onClick={() => voice.allowSpeak(p.user_id)}>Дать слово</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="ch-va-controls">
        <button
          className={'ch-va-ctrl ' + (st.muted ? 'ch-va-ctrl-off' : 'ch-va-ctrl-on')}
          title="Микрофон" onClick={() => voice.toggleMic()}
        >
          <span className={'ico ico-20 ' + (st.muted ? 'ico-mic-off' : 'ico-mic')} />
        </button>
        <button
          className={'ch-va-ctrl ' + (st.videoMuted ? 'ch-va-ctrl-off' : 'ch-va-ctrl-on')}
          title="Камера" onClick={onCam}
        >
          <span className={'ico ico-20 ' + (st.videoMuted ? 'ico-video-off' : 'ico-video')} />
        </button>
        {hasDisplayMedia && (
          <button
            className={'ch-va-ctrl ' + (st.screenSharing ? 'ch-va-ctrl-on' : 'ch-va-ctrl-off')}
            title="Показать экран" onClick={onScreen}
          >
            <span className="ico ico-20 ico-screen" />
          </button>
        )}
        {!st.isSpeaker && (
          <button
            className={'ch-va-ctrl' + (st.handRaised ? ' ch-va-ctrl-on' : '')}
            title="Поднять руку" onClick={() => voice.toggleHand()}
          >
            <span className="ico ico-20 ico-hand" />
          </button>
        )}
        <button className="ch-va-ctrl ch-va-ctrl-leave" title="Выйти" onClick={onLeave}>
          <span className="ico ico-20 ico-phone-off" />
        </button>
      </div>

      {exp && (
        <Expanded
          p={exp} isMe={exp.user_id === st.myId} st={st} hasDisplayMedia={hasDisplayMedia}
          onClose={() => setExpanded(null)}
          onMic={() => voice.toggleMic()}
          onCam={onCam}
          onScreen={onScreen}
          onLeave={() => { setExpanded(null); onLeave(); }}
        />
      )}
    </div>
  );
}
