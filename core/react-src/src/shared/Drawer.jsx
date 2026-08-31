import { useEffect, useRef, useState } from 'react';
import useEscape from './useEscape.js';

/* Выезжающая справа панель.

   Появилась в «Админке», оттуда её скопировали в «Серверы» — там прямо
   сказано «по образцу adm-drawer». Копии разошлись в мелочах: у одной был
   Escape, у другой укороченное закрытие при reduced-motion.

   Смысл панели вместо окна: на узком экране центральная модалка занимает
   почти весь вьюпорт и всё равно скроллится, а форма на тринадцать полей
   становится неюзабельной.

   Единственная тонкость — таймер. Размонтирование ждёт конца CSS-перехода,
   поэтому длительность здесь и в стилях обязана совпадать. Отсюда и режим
   reduced: в «Админке» переход укорачивается, и таймер укорачивается с ним.
   Глухое transition-duration:.01ms в стилях рассинхронило бы их — на эти
   грабли уже наступали в «Признаниях». */

const CLOSE_MS = { full: 250, reduced: 60 };

export default function Drawer({
  open, title, subtitle, onClose, children,
  reduced,          // короткое закрытие при prefers-reduced-motion
  id,
  cls = 'adm',      // приставка классов модуля: adm-drawer, srv-drawer…
  closeIcon,
  bodyCls,          // содержимое в своей обёртке (нужно «Серверам» для прокрутки)
  escape = true,
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (open) {
      clearTimeout(timer.current);
      setMounted(true);
      // Два кадра: первый монтирует в закрытом виде, второй запускает переход
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else if (mounted) {
      setVisible(false);
      timer.current = setTimeout(() => setMounted(false), reduced ? CLOSE_MS.reduced : CLOSE_MS.full);
    }
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEscape(open && escape, onClose);

  if (!mounted) return null;

  return (
    <div className={cls + '-drawer-overlay' + (visible ? ' visible' : '')} id={id}>
      <div className={cls + '-scrim'} onClick={onClose} />
      <div className={cls + '-drawer'} role="dialog" aria-modal="true" aria-label={title}>
        <div className={cls + '-drawer-head'}>
          <span className={cls + '-drawer-title'}>{title}</span>
          <button className={cls + '-x'} type="button" onClick={onClose} aria-label="Закрыть">
            {closeIcon || <span className="ico ico-16 ico-close" />}
          </button>
        </div>
        {subtitle && <div className={cls + '-drawer-sub'}>{subtitle}</div>}
        {bodyCls ? <div className={bodyCls}>{children}</div> : children}
      </div>
    </div>
  );
}
