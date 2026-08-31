import { useState } from 'react';
import { ROLE_ORDER, displayName } from './lib.js';
import Avatar from '../../../../core/react-src/src/shared/Avatar.jsx';

/* Правая колонка: участники группы. Онлайн выше оффлайна, внутри — по роли.
   В голосовом канале сверху отдельной группой те, кто сейчас в комнате: это
   ответ на вопрос «с кем я говорю», а не «кто вообще есть в группе». */

function Row({ m, offline, inRoom, muted, onCtx }) {
  return (
    <div
      className={'ch-member' + (offline ? ' offline' : '') + (m.space_role === 'moderator' ? ' moderator' : '') + (inRoom ? ' in-voice' : '')}
      onContextMenu={(e) => { e.preventDefault(); onCtx(e, m); }}
    >
      <Avatar cls="ch-member-ava" src={m.avatar} name={displayName(m)} />
      <span className="ch-member-name">{displayName(m)}</span>
      {inRoom && (
        <span className="ch-member-voice-ico">
          <span className={'ico ico-14 ' + (muted ? 'ico-mic-off' : 'ico-mic')} style={muted ? undefined : { backgroundColor: 'var(--accent)' }} />
        </span>
      )}
      {m.space_role === 'moderator' && <span className="ch-mod-badge">МОД</span>}
      <span className={'role-badge ' + m.role} style={{ fontSize: 8, padding: '1px 4px' }}>{(m.role || '').toUpperCase()}</span>
      {!offline && <span className={'ch-member-online-dot ' + (m.status || 'online')} />}
    </div>
  );
}

export default function Members({
  members, room, isVoiceChannel, admin, meId, inVoiceRoom, onClose, onAdd,
  onWrite, onInvite, onKickVoice, onSetModerator, onKick,
}) {
  const [ctx, setCtx] = useState(null);

  const byRole = (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
  const roomIds = new Set(
    isVoiceChannel && room
      ? (room.speakers || []).map((p) => p.user_id).concat((room.listeners || []).map((p) => p.user_id))
      : [],
  );
  const inRoom = members.filter((m) => roomIds.has(m.user_id));
  const online = members.filter((m) => m.online && !roomIds.has(m.user_id)).sort(byRole);
  const offline = members.filter((m) => !m.online && !roomIds.has(m.user_id));
  const mutedOf = (uid) => {
    const p = room ? (room.speakers || []).find((s) => s.user_id === uid) : null;
    return p ? p.muted : true;
  };

  const openCtx = (e, m) => setCtx({ m, x: e.clientX, y: e.clientY });
  const close = () => setCtx(null);

  const target = ctx ? ctx.m : null;
  const isMe = target && target.user_id === meId;
  const targetInRoom = target && roomIds.has(target.user_id);

  return (
    <div className="ch-members mobile-open" style={{ display: 'flex' }}>
      <div className="ch-members-head">
        <span>Участники</span>
        <button className="ch-action-btn" onClick={onClose}><span className="ico ico-16 ico-close" /></button>
      </div>

      <div className="ch-members-list">
        {inRoom.length > 0 && (
          <div className="ch-member-group">
            <div className="ch-member-group-title ch-mgr-voice"><span className="ico ico-14 ico-speaker" /> В комнате — {inRoom.length}</div>
            {inRoom.map((m) => <Row key={m.user_id} m={m} inRoom muted={mutedOf(m.user_id)} onCtx={openCtx} />)}
          </div>
        )}
        {online.length > 0 && (
          <div className="ch-member-group">
            <div className="ch-member-group-title">Онлайн — {online.length}</div>
            {online.map((m) => <Row key={m.user_id} m={m} onCtx={openCtx} />)}
          </div>
        )}
        {offline.length > 0 && (
          <div className="ch-member-group">
            <div className="ch-member-group-title">Оффлайн — {offline.length}</div>
            {offline.map((m) => <Row key={m.user_id} m={m} offline onCtx={openCtx} />)}
          </div>
        )}
      </div>

      {admin && (
        <button className="ch-add-member-btn" onClick={onAdd}>
          <span className="ico ico-14 ico-users" /> Добавить
        </button>
      )}

      {ctx && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
          <div className="ch-ctx" style={{ display: 'block', left: Math.min(ctx.x, window.innerWidth - 200), top: Math.min(ctx.y, window.innerHeight - 180), zIndex: 200 }}>
            {!isMe && (
              <div className="ch-ctx-item" onClick={() => { onWrite(target.user_id); close(); }}>
                <span className="ico ico-14 ico-messenger" /> Написать
              </div>
            )}
            {!isMe && inVoiceRoom && !targetInRoom && (
              <div className="ch-ctx-item" onClick={() => { onInvite(target.user_id); close(); }}>
                <span className="ico ico-14 ico-plus" /> Пригласить в комнату
              </div>
            )}
            {!isMe && inVoiceRoom && targetInRoom && admin && (
              <div className="ch-ctx-item ch-ctx-danger" onClick={() => { onKickVoice(target.user_id); close(); }}>
                <span className="ico ico-14 ico-phone-off" /> Отключить от комнаты
              </div>
            )}
            {admin && !isMe && target.role !== 'arcana' && (
              <>
                <div className="ch-ctx-item" onClick={() => { onSetModerator(target.user_id, target.space_role !== 'moderator'); close(); }}>
                  <span className="ico ico-14 ico-users" /> {target.space_role === 'moderator' ? 'Снять модератора' : 'Назначить модератором'}
                </div>
                <div className="ch-ctx-item ch-ctx-danger" onClick={() => { onKick(target.user_id); close(); }}>
                  <span className="ico ico-14 ico-trash" /> Кикнуть
                </div>
              </>
            )}
            {isMe && (
              <div className="ch-ctx-item ch-ctx-danger" onClick={() => { onKick(target.user_id); close(); }}>
                <span className="ico ico-14 ico-trash" /> Выйти из группы
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
