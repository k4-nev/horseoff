import { useState } from 'react';

/* Поле с паролем и глазком.

   Раньше глазок дёргал Shell.toggleEye: тот лез через parentNode к соседнему
   input, менял ему type и переписывал innerHTML кнопки — то есть правил
   разметку под React мимо самого React. Здесь это обычное состояние. */
export default function Secret({ value, onChange, placeholder, disabled }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="srv-eye">
      <input
        className="srv-input"
        type={shown ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <button
        className="srv-eye-btn"
        type="button"
        title={shown ? 'Скрыть' : 'Показать'}
        aria-label={shown ? 'Скрыть' : 'Показать'}
        onClick={() => setShown((v) => !v)}
      >
        <span className={'ico ico-16 ' + (shown ? 'ico-eye-closed' : 'ico-eye-open')} />
      </button>
    </div>
  );
}
