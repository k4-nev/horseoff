import { useEffect, useState } from 'react';
import { toggleAudio } from '../../../../core/react-src/src/shared/chat/audio.js';
import { api, attUrl, chatKey, displayName, fmtDuration, fmtSize, groupByDate } from './lib.js';
import Avatar from '../../../../core/react-src/src/shared/Avatar.jsx';

/* Панель профиля собеседника — выезжает справа поверх чата, тем же приёмом,
   что «Создать сервер» в модуле «Серверы». */

const TABS = [
  { id: 'image', name: 'Медиа' },
  { id: 'audio', name: 'Аудио' },
  { id: 'file', name: 'Файлы' },
];

const EmptyIco = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ opacity: 0.4 }}>
    <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
);

export default function ProfilePanel({ open, contact, meId, reloadKey, onClose, onOpenMedia, onJumpTo, onClear }) {
  const [tab, setTab] = useState('image');
  const [items, setItems] = useState(null);

  useEffect(() => { setTab('image'); }, [contact && contact.id]);

  /* Вложения тянем и когда панель закрыта: их же показывает вкладка после
     нового сообщения с файлом, и открывать панель ради обновления не нужно. */
  useEffect(() => {
    let alive = true;
    if (!contact || !meId) { setItems(null); return undefined; }
    const ck = chatKey(meId, contact.id);
    setItems(null);
    (async () => {
      let d = (await api('/api/msg/attachments/' + ck + '?type=' + tab)) || [];
      if (tab === 'image') {
        const v = (await api('/api/msg/attachments/' + ck + '?type=video')) || [];
        d = d.concat(v).sort((a, b) => (b.time || 0) - (a.time || 0));
      }
      if (alive) setItems(Array.isArray(d) ? d : []);
    })();
    return () => { alive = false; };
  }, [contact && contact.id, meId, tab, reloadKey]);

  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { console.log('PANEL key', e.key); if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, onClose]);

  if (!contact) return null;
  const dn = displayName(contact);
  const groups = items && items.length ? groupByDate(items) : [];
  const listMode = tab === 'file' || tab === 'audio';

  return (
    <div className={'msg-profile' + (open ? ' open' : '')}>
      <div className="msg-profile-scrim" onClick={onClose} />
      <div className="msg-profile-panel" role="dialog" aria-modal="true" aria-label="Информация о собеседнике">
        <div className="msg-profile-inner">
          <button className="msg-profile-close-btn" onClick={onClose} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <div className="msg-profile-content">
            <div className="msg-profile-ava-frame">
              <Avatar cls="msg-profile-ava" src={contact.avatar} name={dn} />
            </div>
            <div className="msg-profile-name">{dn}</div>
            <div className="msg-profile-username">@{contact.username}</div>

            <div className="msg-profile-info">
              <div className="msg-profile-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5z" />
                  </svg>
                  <span style={{ fontWeight: 500 }}>Роль</span>
                </div>
                <span className={'role-badge ' + (contact.role || 'common')}>
                  {contact.role ? contact.role.toUpperCase() : '—'}
                </span>
              </div>
            </div>

            <div className="msg-profile-attach">
              <div className="msg-profile-attach-tabs">
                {TABS.map((t) => (
                  <button key={t.id} className={'msg-profile-tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>

              <div
                className={'msg-profile-attach-grid' + (listMode ? ' files-list' : '')}
                style={listMode ? { display: 'flex', flexDirection: 'column' } : undefined}
              >
                {items === null && <div className="msg-profile-attach-empty"><EmptyIco />Загрузка…</div>}
                {items && items.length === 0 && <div className="msg-profile-attach-empty"><EmptyIco />Пусто</div>}

                {groups.map(([date, list]) => (
                  <div key={date} style={{ display: 'contents' }}>
                    <div className="msg-profile-date-header">{date}</div>
                    {tab === 'image' ? (
                      <div className="msg-profile-date-grid">
                        {list.map((a) => (
                          <div
                            className="msg-profile-attach-item"
                            key={a.id}
                            onClick={() => onOpenMedia(items, items.indexOf(a))}
                            onContextMenu={(e) => { e.preventDefault(); onJumpTo(a.msg_id); }}
                          >
                            <img src={attUrl(a.id, '/thumb')} loading="lazy" alt="" />
                            {a.type === 'video' && <div className="msg-profile-video-badge">▶</div>}
                          </div>
                        ))}
                      </div>
                    ) : tab === 'audio' ? (
                      list.map((a) => {
                        const voice = !!(a.name && a.name.startsWith('voice_'));
                        let name = voice ? 'Голосовое' : (a.name || 'Аудио');
                        if (name.length > 22) name = name.slice(0, 20) + '...';
                        return (
                          <div
                            className="msg-profile-audio-item"
                            key={a.id}
                            onClick={() => toggleAudio(a.id)}
                            onContextMenu={(e) => { e.preventDefault(); onJumpTo(a.msg_id); }}
                          >
                            <div className="msg-profile-audio-icon" style={{ color: voice ? '#5ba8e8' : 'var(--accent)' }}>
                              {voice ? '🎤' : '🎵'}
                            </div>
                            <div className="msg-profile-audio-info">
                              <div className="msg-profile-audio-name" style={voice ? { color: '#5ba8e8' } : undefined}>{name}</div>
                              <div className="msg-profile-audio-dur">{a.duration ? fmtDuration(a.duration) : ''}</div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      list.map((a) => {
                        const name = a.name || 'Файл';
                        const ext = name.split('.').pop().toUpperCase();
                        const short = name.length > 20 ? name.slice(0, 18) + '...' : name;
                        return (
                          <a
                            className="msg-profile-attach-file"
                            key={a.id}
                            href={attUrl(a.id)}
                            download={a.name || ''}
                            onContextMenu={(e) => { e.preventDefault(); onJumpTo(a.msg_id); }}
                          >
                            <span className="ico ico-14 ico-file" />
                            <div className="msg-profile-file-info">
                              <div className="msg-profile-file-name">{short}</div>
                              <div className="msg-profile-file-meta">{ext}{a.size ? ' · ' + fmtSize(a.size) : ''}</div>
                            </div>
                          </a>
                        );
                      })
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="msg-profile-foot">
          <button className="msg-clear-chat-btn" onClick={onClear}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14H7L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
            </svg>
            Очистить чат
          </button>
        </div>
      </div>
    </div>
  );
}
