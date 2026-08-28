import { useRef, useState } from 'react';
import SearchField from '../../../../core/react-src/src/shared/SearchField.jsx';
import { displayName, fmtContactTime, lastPreview } from './lib.js';

/* Список контактов. Поиск фильтрует список, а не прячет строки классом —
   раньше filterContacts бегал по DOM и вешал .hidden, из-за чего счётчики и
   пустое состояние про фильтр не знали. */

function Ava({ c }) {
  const dn = displayName(c);
  return (
    <div className="msg-contact-ava">
      {c.avatar ? <img src={'data:image/jpeg;base64,' + c.avatar} alt="" /> : dn.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ContactList({
  contacts, activeId, search, setSearch, forward, hidden,
  onOpen, onCancelForward, onMenu,
}) {
  const touchTimer = useRef(null);
  const fired = useRef(false);

  const q = search.trim().toLowerCase();
  const list = q
    ? contacts.filter((c) => (c.username + ' ' + displayName(c)).toLowerCase().includes(q))
    : contacts;

  const startTouch = (e, c) => {
    fired.current = false;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    touchTimer.current = setTimeout(() => {
      fired.current = true;
      window.getSelection().removeAllRanges();
      if (navigator.vibrate) navigator.vibrate(30);
      onMenu({ clientX: x, clientY: y }, c);
    }, 500);
  };
  const endTouch = () => clearTimeout(touchTimer.current);

  return (
    <div className={'msg-contacts' + (hidden ? ' mobile-hidden' : '')}>
      <div className="msg-contacts-head">
        <div className="msg-contacts-title">Сообщения</div>
        <SearchField
          className="msg-search-field"
          placeholder="Поиск…"
          value={search}
          onChange={setSearch}
          clearable
        />
      </div>

      {forward && (
        <div className="msg-forward-banner">
          <div className="msg-forward-banner-line" />
          <div className="msg-forward-banner-content">
            <div className="msg-forward-banner-label">Переслать — выберите контакт</div>
            <div className="msg-forward-banner-text">{forward.preview}</div>
          </div>
          <button className="msg-forward-banner-close" onClick={onCancelForward}>×</button>
        </div>
      )}

      <div className="msg-contact-list">
        {contacts.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>Нет контактов</div>
        )}
        {contacts.length > 0 && list.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>Никого не нашли</div>
        )}
        {list.map((c) => {
          const dn = displayName(c);
          const last = lastPreview(c.last_msg);
          return (
            <div
              className={'msg-contact' + (activeId === c.id ? ' active' : '')}
              key={c.id}
              onClick={() => { if (!fired.current) onOpen(c.id); }}
              onContextMenu={(e) => { e.preventDefault(); onMenu(e, c); }}
              onTouchStart={(e) => startTouch(e, c)}
              onTouchEnd={endTouch}
              onTouchMove={endTouch}
            >
              <div className="msg-contact-ava-wrap">
                <Ava c={c} />
                {c.online && <span className={'msg-online-badge ' + (c.status || 'online')} />}
              </div>
              <div className="msg-contact-info">
                <div className="msg-contact-name">
                  {dn}
                  {c.pinned && <span className="ico ico-pin msg-contact-pin" style={{ width: 10, height: 10 }} />}
                  {c.muted && <span className="ico ico-mute msg-contact-mute" style={{ width: 10, height: 10 }} />}
                </div>
                <div className="msg-contact-last">
                  {last || <span style={{ opacity: 0.4 }}>нет сообщений</span>}
                </div>
              </div>
              <div className="msg-contact-meta">
                {c.last_msg && <div className="msg-contact-time">{fmtContactTime(c.last_msg.time)}</div>}
                {c.unread > 0 && <div className="msg-contact-unread">{c.unread}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
