import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

/* Общая оболочка выезжающей справа панели — используется и для
   добавления, и для редактирования (тот же компонент, разное содержимое),
   и для экрана «модули по умолчанию». JS-таймер закрытия синхронизирован
   с CSS-длительностью transition (--adm-t-m), и укорачивается вместе с ней
   при reduced-motion — рассинхрон JS/CSS был бы ровно той проблемой, из-за
   которой в valentine отказались от глухого transition-duration:.01ms. */
const CLOSE_MS = { full: 250, reduced: 60 };

export default function Drawer({ open, title, subtitle, onClose, children, reduced }) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (open) {
      clearTimeout(timer.current);
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else if (mounted) {
      setVisible(false);
      timer.current = setTimeout(() => setMounted(false), reduced ? CLOSE_MS.reduced : CLOSE_MS.full);
    }
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted) return null;

  return (
    <div className={'adm-drawer-overlay' + (visible ? ' visible' : '')}>
      <div className="adm-scrim" onClick={onClose} />
      <div className="adm-drawer">
        <div className="adm-drawer-head">
          <span>{title}</span>
          <button className="adm-x" onClick={onClose} aria-label="Закрыть">
            <Icon name="x" />
          </button>
        </div>
        {subtitle && <div className="adm-drawer-sub">{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}
