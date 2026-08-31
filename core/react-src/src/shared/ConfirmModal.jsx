import Modal from './Modal.jsx';
import useEscape from './useEscape.js';

/* Подтверждение действия: «точно удалить?».

   Шесть штук на приложение — «Каналы», «Серверы», «Админка», «Боты»
   (дважды) — и все об одном: заголовок, пояснение, кнопка отмены и красная
   кнопка действия. Различались подписи, наличие шапки с крестиком и имена
   классов.

   Две формы, обе живые:
     с шапкой   — на общих классах каркаса, как в «Каналах» и «Серверах»;
     без шапки  — плотная карточка «Ботов»: только заголовок, пояснение и
                  кнопки, крестика нет. */

export default function ConfirmModal({
  open = true,
  title,
  text,
  children,                 // то, что показывают между текстом и кнопками
  okLabel = 'Удалить',
  cancelLabel = 'Отмена',
  danger = true,
  onClose,
  onConfirm,
  bare,                     // без шапки с крестиком
  classes,                  // для bare: {ov, box, title, sub, actions}
  id,
}) {
  // В форме с шапкой Escape вешает сам Modal, здесь — только для плотной
  useEscape(open && !!bare, onClose);

  const okCls = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
  const actions = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>{cancelLabel}</button>
      <button className={okCls} onClick={onConfirm}>{okLabel}</button>
    </>
  );

  if (!bare) {
    return (
      <Modal open={open} title={title} onClose={onClose} id={id}>
        {text && <div className="modal-sub">{text}</div>}
        {children}
        <div className="modal-actions">{actions}</div>
      </Modal>
    );
  }

  if (!open) return null;
  const c = classes || {};
  return (
    <div className={c.ov} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={c.box}>
        <div className={c.title}>{title}</div>
        {text && <div className={c.sub}>{text}</div>}
        {children}
        <div className={c.actions}>{actions}</div>
      </div>
    </div>
  );
}
