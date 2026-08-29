import { useState } from 'react';
import { buzz } from './lib.js';

/* Левая колонка: группы, внутри — текстовые каналы и голосовые комнаты.

   Модель дискордовская: канал принадлежит группе, участники и роли общие на
   группу. Поэтому список двухуровневый и сворачивается по группам, а не
   плоский, как список диалогов в «Сообщениях». */

function VoiceRoomRow({ ch, room, active, inRoom, admin, onOpen, onEdit, onDelete }) {
  const speakers = room.speakers || [];
  const count = room.speaker_count || 0;
  return (
    <div
      className={'ch-voice-room' + (active || inRoom ? ' ch-vr-active' : '') + (count >= 6 ? ' ch-vr-full' : '')}
      data-chid={ch.id}
      onClick={onOpen}
    >
      <span className={'ico ico-14 ico-' + (ch.icon && ch.icon !== 'channels' ? ch.icon : 'mic')} style={{ opacity: 0.6, flexShrink: 0 }} />
      <span className="ch-vr-name">{ch.name}</span>
      {(room.total || 0) > 0 && (
        <div className="ch-vr-meta">
          {speakers.slice(0, 3).map((p) => (p.avatar
            ? <img className="ch-vr-av" src={'data:image/png;base64,' + p.avatar} alt="" key={p.user_id} />
            : <div className="ch-vr-av ch-vr-av-empty" key={p.user_id}>{(p.username || '?')[0]}</div>))}
          <span className="ch-vr-count">{count}/6</span>
        </div>
      )}
      {admin && (
        <div className="ch-channel-actions">
          <button className="ch-space-action" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <span className="ico ico-14 ico-pencil" />
          </button>
          <button className="ch-space-action" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <span className="ico ico-14 ico-trash" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  spaces, channelsBySpace, rooms, currentChannel, voiceRoomId, admin,
  onOpenChannel, onCreateSpace, onEditSpace, onDeleteSpace, onCreateChannel, onEditChannel, onDeleteChannel,
}) {
  const [collapsed, setCollapsed] = useState({});
  const [ctx, setCtx] = useState(null);

  if (!spaces.length) {
    return (
      <div className="ch-sidebar">
        <div className="ch-sidebar-head">
          <div className="ch-sidebar-title">Каналы</div>
          {admin && <button className="ch-head-add" title="Создать группу" onClick={onCreateSpace}>+</button>}
        </div>
        <div className="ch-sidebar-empty" style={{ display: 'flex' }}>
          {admin
            ? <><button className="ch-empty-add" onClick={onCreateSpace}>+</button><p>Создайте первую группу</p></>
            : <p>У вас ещё нет групп</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="ch-sidebar">
      <div className="ch-sidebar-head">
        <div className="ch-sidebar-title">Каналы</div>
        {admin && <button className="ch-head-add" title="Создать группу" onClick={onCreateSpace}>+</button>}
      </div>

      <div className="ch-sidebar-list">
        {spaces.map((sp) => {
          const channels = channelsBySpace[sp.id] || [];
          const off = !!collapsed[sp.id];
          return (
            <div className="ch-space-group" data-sid={sp.id} key={sp.id}>
              <div
                className="ch-space-header"
                onClick={() => { buzz(6); setCollapsed((c) => ({ ...c, [sp.id]: !off })); }}
                onContextMenu={(e) => {
                  if (!admin) return;
                  e.preventDefault();
                  setCtx({ spaceId: sp.id, x: e.clientX, y: e.clientY });
                }}
              >
                {sp.photo && <img className="ch-space-photo" src={'data:image/jpeg;base64,' + sp.photo} alt="" />}
                <span className="ch-space-name">{sp.name}</span>
                {sp.type === 'voice_group' && <span className="ch-space-voice-badge">VOICE</span>}
                <div className="ch-space-actions">
                  <span className={'ico ico-14 ch-collapse-arrow ico-' + (off ? 'chevron-right' : 'chevron-down')} style={{ color: 'var(--text-dim)' }} />
                </div>
              </div>

              {!off && channels.map((ch) => (ch.type === 'voice' ? (
                <VoiceRoomRow
                  key={ch.id} ch={ch} room={rooms[ch.id] || {}}
                  active={currentChannel === ch.id} inRoom={voiceRoomId === ch.id} admin={admin}
                  onOpen={() => onOpenChannel(sp.id, ch.id)}
                  onEdit={() => onEditChannel(sp.id, ch)}
                  onDelete={() => onDeleteChannel(sp.id, ch)}
                />
              ) : (
                <div
                  className={'ch-channel' + (currentChannel === ch.id ? ' active' : '')}
                  data-chid={ch.id} key={ch.id}
                  onClick={() => onOpenChannel(sp.id, ch.id)}
                >
                  {ch.icon && ch.icon !== 'channels'
                    ? <span className={'ico ico-14 ico-' + ch.icon} style={{ opacity: 0.5, flexShrink: 0 }} />
                    : <span className="ch-channel-hash">#</span>}
                  <span className="ch-channel-name">{ch.name}</span>
                  <span className="ch-unread-badge" style={{ display: ch.unread > 0 ? '' : 'none' }}>{ch.unread || 0}</span>
                  {admin && (
                    <div className="ch-channel-actions">
                      <button className="ch-space-action" onClick={(e) => { e.stopPropagation(); onEditChannel(sp.id, ch); }}>
                        <span className="ico ico-14 ico-pencil" />
                      </button>
                      <button className="ch-space-action" onClick={(e) => { e.stopPropagation(); onDeleteChannel(sp.id, ch); }}>
                        <span className="ico ico-14 ico-trash" />
                      </button>
                    </div>
                  )}
                </div>
              )))}

              {!off && !channels.length && (
                <div className="ch-space-empty" style={{ padding: '4px 22px', fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  Пусто
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ctx && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCtx(null); }} />
          <div className="ch-ctx" style={{ display: 'block', left: Math.min(ctx.x, window.innerWidth - 200), top: Math.min(ctx.y, window.innerHeight - 160), zIndex: 200 }}>
            <div className="ch-ctx-item" onClick={() => { onCreateChannel(ctx.spaceId); setCtx(null); }}>
              <span className="ico ico-14 ico-plus" /> Создать канал
            </div>
            <div className="ch-ctx-item" onClick={() => { onEditSpace(ctx.spaceId); setCtx(null); }}>
              <span className="ico ico-14 ico-pencil" /> Изменить группу
            </div>
            <div className="ch-ctx-item ch-ctx-danger" onClick={() => { onDeleteSpace(ctx.spaceId); setCtx(null); }}>
              <span className="ico ico-14 ico-trash" /> Удалить группу
            </div>
          </div>
        </>
      )}
    </div>
  );
}
