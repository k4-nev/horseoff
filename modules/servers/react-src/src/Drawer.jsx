import { useEffect, useRef, useState } from 'react';

/* Выезжающая справа панель — общая оболочка для «создать», «добавить» и
   «редактировать» (по образцу adm-drawer в модуле admin). Раньше это были
   центральные .modal-overlay: на узком экране они занимали почти весь вьюпорт
   и всё равно скроллились, а форма создания (13 полей) на телефоне была
   практически неюзабельна.

   JS-таймер размонтирования синхронизирован с CSS-длительностью закрытия
   (--srv-t-m). При prefers-reduced-motion в CSS убирается только сдвиг,
   длительность остаётся той же — глухое transition-duration:0 рассинхронило
   бы таймер с анимацией (грабли из valentine). */
const CLOSE_MS = 240;

export default function Drawer({ open, id, title, subtitle, onClose, children }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (open) {
      clearTimeout(timer.current);
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else if (mounted) {
      setVisible(false);
      timer.current = setTimeout(() => setMounted(false), CLOSE_MS);
    }
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc закрывает панель. Выпадающий список внутри гасит своё Esc на фазе
  // перехвата, поэтому сначала закрывается он, а не вся панель.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className={'srv-drawer-overlay' + (visible ? ' visible' : '')} id={id}>
      <div className="srv-scrim" onClick={onClose} />
      <div className="srv-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="srv-drawer-head">
          <span className="srv-drawer-title">{title}</span>
          <button className="srv-x" type="button" onClick={onClose} aria-label="Закрыть">
            <span className="ico ico-16 ico-close" />
          </button>
        </div>
        {subtitle && <div className="srv-drawer-sub">{subtitle}</div>}
        <div className="srv-drawer-body">{children}</div>
      </div>
    </div>
  );
}
