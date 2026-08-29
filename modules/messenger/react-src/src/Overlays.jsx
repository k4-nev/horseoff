export { default as Gallery } from '../../../../core/react-src/src/shared/chat/Gallery.jsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EMOJIS, TOP_REACTIONS, TWO_DAYS } from './lib.js';

/* Всплывающее поверх чата: меню сообщения, палитра реакций, подтверждение,
   просмотрщик. Раньше каждое создавалось через createElement + innerHTML и
   вешало свой одноразовый слушатель на document. */

/* Слушатели на document вешаем один раз на открытие, а обработчик держим в
   ref. Иначе так: onClose приходит новой стрелкой на каждый рендер, попадает в
   зависимости эффекта, и когда соседний оверлей закрывается по тому же Escape,
   React успевает переподписать нас прямо посреди dispatch — снятый listener
   браузер уже пропускает, и второй оверлей Escape не видит. Ровно так
   просмотрщик не закрывался, пока открыта панель профиля. */
function useDocEvent(active, type, handler, opts) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return undefined;
    const fn = (e) => ref.current(e);
    document.addEventListener(type, fn, opts);
    return () => document.removeEventListener(type, fn, opts);
  }, [active, type]);
}

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
  /* Клик слушаем не сразу: тот, что открыл меню, ещё всплывает */
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!open) { setArmed(false); return undefined; }
    const t = setTimeout(() => setArmed(true), 0);
    return () => clearTimeout(t);
  }, [open]);
  useDocEvent(armed, 'click', () => onClose());
  useDocEvent(!!open, 'keydown', (e) => { if (e.key === 'Escape') onClose(); });

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
  /* Клик слушаем не сразу: тот, что открыл меню, ещё всплывает */
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!open) { setArmed(false); return undefined; }
    const t = setTimeout(() => setArmed(true), 0);
    return () => clearTimeout(t);
  }, [open]);
  useDocEvent(armed, 'click', () => onClose());
  useDocEvent(!!open, 'keydown', (e) => { if (e.key === 'Escape') onClose(); });

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
  useDocEvent(!!open, 'keydown', (e) => { if (e.key === 'Escape') onClose(); });
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
