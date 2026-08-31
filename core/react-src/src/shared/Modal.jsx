import useEscape from './useEscape.js';

/* Модальное окно.

   Обёртка — затемнение, шапка с заголовком и крестиком, закрытие по Escape
   и по клику мимо — была написана вручную в восьми местах: «Каналы», mp,
   «Серверы» (трижды), «Админка», ядро. Логика везде одна, отличаются только
   имена классов и мелочи вроде значка крестика, поэтому оформление здесь
   параметризовано, а не сведено к одному виду: у mp своя вёрстка окон, и
   ломать её ради единообразия незачем.

   Классы по умолчанию — те, что живут в core/shell.css и доступны всем. */

const SHELL = {
  ov: 'modal-overlay active',
  box: 'modal',
  head: 'modal-header',
  title: 'modal-title',
  close: 'modal-close',
};

const CLOSE_ICO = <span className="ico ico-18 ico-close" />;

export default function Modal({
  open = true,
  title,
  onClose,
  children,
  id,
  classes,             // {ov, box, head, title, close} — переопределяют оформление
  boxCls,              // добавка к классу окна (например, широкое)
  boxStyle,
  titleTag: T = 'div',
  closeIcon = CLOSE_ICO,
  closable = true,     // крестик; закрытие по Escape и клику мимо — отдельно
  escape = true,
  backdrop = true,     // закрывать по клику мимо
  keepMounted,         // окно остаётся в разметке скрытым (нужно анимациям)
}) {
  useEscape(open && escape, onClose);
  if (!open && !keepMounted) return null;

  const c = { ...SHELL, ...(classes || {}) };
  const ovCls = keepMounted && !open
    ? c.ov.replace(' active', '').replace(' open', '')
    : c.ov;

  return (
    <div
      className={ovCls}
      id={id}
      onClick={backdrop ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div className={boxCls ? c.box + ' ' + boxCls : c.box} style={boxStyle}>
        {(title || onClose) && (
          <div className={c.head}>
            <T className={c.title}>{title}</T>
            {onClose && closable && <button className={c.close} onClick={onClose}>{closeIcon}</button>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
