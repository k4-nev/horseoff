import { buzz } from './lib.js';

/* Переключатель модуля: настоящий <input type="checkbox">, спрятанный под
   дорожку с бегунком. Был написан дважды — в виджете манифеста и в панели
   логов, — отличались только класс обёртки и размеры в стилях. */
export default function Toggle({ on, onChange, label, cls = 'bt-toggle-wrap', textCls = 'bt-toggle-text' }) {
  return (
    <label className={cls}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => { buzz(15); onChange(e.target.checked); }}
      />
      <span className="bt-toggle-track"><span className="bt-toggle-thumb" /></span>
      {label && <span className={textCls}>{label}</span>}
    </label>
  );
}
