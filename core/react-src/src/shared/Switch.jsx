/* Переключатель «включено/выключено».

   Форма из «Админки»: кнопка с role="switch" и aria-checked. Именно кнопка,
   а не картинка с обработчиком — иначе состояние не читается ни с
   клавиатуры, ни экранным диктором.

   Оформление за модулем: класс задаётся приставкой (adm-switch и т.д.), у
   бегунка — та же приставка плюс -knob. В «Ботах» переключатель устроен
   иначе, на настоящем <input type="checkbox">, — это не хуже, просто другая
   разметка, и сводить их к одной ради единообразия смысла нет. */
export default function Switch({ on, onChange, disabled, cls = 'adm-switch', title, label }) {
  return (
    <button
      type="button"
      className={cls + (on ? ' on' : '') + (disabled ? ' disabled' : '')}
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className={cls + '-knob'} />
    </button>
  );
}
