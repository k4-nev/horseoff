import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* Замена нативному <select>. Нативный список рисует ОС, а не страница:
   в форме он выглядел системным меню Windows поверх светлого интерфейса —
   ровно то, что пользователь назвал «как на windows xp». Здесь список —
   обычный DOM, поэтому он подчиняется палитре и анимациям модуля.

   Сохранено то, ради чего <select> вообще держали: клавиатура (стрелки,
   Home/End, Enter/Esc), роль listbox для скринридеров и закрытие по клику
   вне. Скрытый <input type="hidden"> оставляет значение видимым для
   тестов/автозаполнения по имени поля. */
export default function Select({ value, onChange, options, name, disabled, placeholder = '—' }) {
  const [open, setOpen] = useState(false);
  const [drop, setDrop] = useState('down');
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  const idx = options.findIndex((o) => o.value === value);
  const current = idx >= 0 ? options[idx] : null;

  useEffect(() => { if (open) setCursor(idx >= 0 ? idx : 0); }, [open, idx]);

  // Панель скроллится, поэтому список у нижнего края открывается вверх —
  // иначе он уезжает за границу drawer'а и его надо доскроливать.
  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !menuRef.current) return;
    const btn = wrapRef.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    setDrop(btn.bottom + 6 + h > window.innerHeight && btn.top - 6 - h > 0 ? 'up' : 'down');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    // Перехват (capture) + stopPropagation: Esc внутри списка закрывает
    // список, а не всю панель — её обработчик висит на фазе всплытия.
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  function pick(v) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setCursor(0); }
    else if (e.key === 'End') { e.preventDefault(); setCursor(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[cursor]) pick(options[cursor].value); }
    else if (e.key === 'Tab') setOpen(false);
  }

  return (
    <div className={'srv-sel' + (open ? ' open' : '') + (drop === 'up' ? ' up' : '')} ref={wrapRef}>
      <input type="hidden" name={name} value={value} readOnly />
      <button
        type="button"
        className="srv-sel-btn"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span className={'srv-sel-val' + (current ? '' : ' placeholder')}>{current ? current.label : placeholder}</span>
        <span className="ico ico-14 ico-chevron-down srv-sel-caret" />
      </button>
      <div className="srv-sel-menu" role="listbox" ref={menuRef} aria-label={name}>
        {options.map((o, i) => (
          <button
            type="button"
            key={o.value}
            role="option"
            aria-selected={o.value === value}
            data-value={o.value}
            className={'srv-sel-item' + (o.value === value ? ' on' : '') + (i === cursor ? ' cursor' : '')}
            onMouseEnter={() => setCursor(i)}
            onClick={() => pick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
