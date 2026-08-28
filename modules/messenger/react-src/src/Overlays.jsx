import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EMOJIS, TOP_REACTIONS, TWO_DAYS, attUrl } from './lib.js';

/* Всплывающее поверх чата: меню сообщения, палитра реакций, подтверждение,
   просмотрщик. Раньше каждое создавалось через createElement + innerHTML и
   вешало свой одноразовый слушатель на document. */

/** Меню держим в границах экрана: у длинного списка иначе уезжает низ. */
function useFit(open) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    let x = open.x;
    let y = open.y + 30;
    if (x + el.offsetWidth > window.innerWidth) x = window.innerWidth - el.offsetWidth - 8;
    if (y + el.offsetHeight > window.innerHeight) y = y - el.offsetHeight - 60;
    setPos({ left: Math.max(8, x), top: Math.max(8, y) });
  }, [open]);
  return [ref, pos];
}

export function MsgMenu({ open, meId, onClose, onAction, onMore }) {
  const [ref, pos] = useFit(open);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => onClose();
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    // Слушателя вешаем на следующий тик: клик, открывший меню, ещё всплывает
    const t = setTimeout(() => document.addEventListener('click', close), 0);
    document.addEventListener('keydown', key);
    return () => { clearTimeout(t); document.removeEventListener('click', close); document.removeEventListener('keydown', key); };
  }, [open, onClose]);

  if (!open) return null;
  const m = open.msg;
  const mine = m.from === meId;
  const canModify = mine && Math.floor(Date.now() / 1000) - m.time < TWO_DAYS;

  const item = (icon, label, act, danger) => (
    <div className={'msg-ctx-action' + (danger ? ' danger' : '')} onClick={() => { onAction(act, m); onClose(); }}>
      <span className={'ico ico-14 ico-' + icon} /> {label}
    </div>
  );

  return (
    <div className="msg-ctx-menu" ref={ref} style={pos ? { left: pos.left, top: pos.top } : { opacity: 0 }} onClick={(e) => e.stopPropagation()}>
      <div className="msg-ctx-reactions">
        {TOP_REACTIONS.map((em) => (
          <span className="msg-ctx-react-btn" key={em} onClick={() => { onAction('react', m, em); onClose(); }}>{em}</span>
        ))}
        <span className="msg-ctx-react-more" onClick={() => { onMore(m); onClose(); }}>+</span>
      </div>
      <div className="msg-ctx-actions">
        {item('reply', 'Ответить', 'reply')}
        {item('forward', 'Переслать', 'forward')}
        {canModify && item('pencil', 'Изменить', 'edit')}
        {canModify && item('trash', 'Удалить', 'delete', true)}
        {item('copy', 'Копировать', 'copy')}
        {item('pin', 'Закрепить', 'pin')}
      </div>
    </div>
  );
}

export function ReactionPicker({ msg, onPick, onClose }) {
  if (!msg) return null;
  return (
    <div className="msg-reaction-picker-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="msg-reaction-picker">
        {EMOJIS.map((em) => (
          <span className="msg-reaction-picker-item" key={em} onClick={() => { onPick(msg.id, em); onClose(); }}>{em}</span>
        ))}
      </div>
    </div>
  );
}

export function ContactMenu({ open, onClose, onAction }) {
  const [ref, pos] = useFit(open);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => onClose();
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('click', close), 0);
    document.addEventListener('keydown', key);
    return () => { clearTimeout(t); document.removeEventListener('click', close); document.removeEventListener('keydown', key); };
  }, [open, onClose]);

  if (!open) return null;
  const c = open.contact;
  return (
    <div className="msg-ctx-menu" ref={ref} style={pos ? { left: pos.left, top: pos.top } : { opacity: 0 }} onClick={(e) => e.stopPropagation()}>
      <div className="msg-ctx-actions">
        <div className="msg-ctx-action" onClick={() => { onAction(c.pinned ? 'unpin' : 'pin', c); onClose(); }}>
          <span className={'ico ico-14 ico-' + (c.pinned ? 'close' : 'pin')} /> {c.pinned ? 'Открепить' : 'Закрепить'}
        </div>
        <div className="msg-ctx-action" onClick={() => { onAction(c.muted ? 'unmute' : 'mute', c); onClose(); }}>
          <span className={'ico ico-14 ico-' + (c.muted ? 'unmute' : 'mute')} /> {c.muted ? 'Включить уведомления' : 'Выключить уведомления'}
        </div>
        <div className="msg-ctx-action danger" onClick={() => { onAction('clear', c); onClose(); }}>
          <span className="ico ico-14 ico-trash" /> Очистить чат
        </div>
      </div>
    </div>
  );
}

export function Confirm({ open, onClose, onOk }) {
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="msg-confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="msg-confirm-box">
        <div className="msg-confirm-title">Очистить чат?</div>
        <div className="msg-confirm-text">
          Вся история сообщений с <b>{open.name}</b> будет удалена.
        </div>
        <div className="msg-confirm-actions">
          <button className="msg-confirm-btn cancel" onClick={onClose}>Отмена</button>
          <button className="msg-confirm-btn danger" onClick={() => { onOk(); onClose(); }}>Очистить</button>
        </div>
      </div>
    </div>
  );
}

/** Просмотрщик: одно и то же окно для картинки и видео. */
export function Gallery({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="msg-gallery-overlay active" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="msg-gallery-close" onClick={onClose}>×</button>
      {open.video
        ? <video src={attUrl(open.video)} controls autoPlay style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
        : <img className="msg-gallery-img" src={open.url} alt="" />}
    </div>
  );
}
