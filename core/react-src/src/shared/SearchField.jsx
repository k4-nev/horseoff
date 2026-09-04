import './SearchField.css';

/* Поле поиска, общее для модулей.

   Раньше каждый модуль рисовал своё: у админки — вдавленная плашка с лупой
   внутри, у мессенджера — две разные (круглая с абсолютной иконкой в списке
   контактов и прямоугольная со счётчиком в шапке чата). Три вида одного
   элемента, и любая правка расходилась по трём местам.

   Внешний вид настраивается переменными, а не форком разметки: модуль со
   своей палитрой (админка живёт на --adm-*) переопределяет --search-* на
   своём контейнере, остальные получают цвета приложения по умолчанию.

   Правый край — слот: счётчик совпадений и стрелки «дальше/назад» нужны
   только поиску по переписке, но это не повод заводить второй компонент. */

export default function SearchField({
  value,
  onChange,
  placeholder = 'Поиск…',
  className,
  icon = true,
  clearable = false,
  autoFocus = false,
  inputRef,
  onKeyDown,
  ariaLabel,
  children,
}) {
  return (
    <div className={'ho-search' + (className ? ' ' + className : '')}>
      {icon && (
        <svg className="ho-search-ic" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M14.5 14.5 11 11" />
        </svg>
      )}
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={ariaLabel || placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {clearable && value ? (
        <button className="ho-search-clear" type="button" aria-label="Очистить" onClick={() => onChange('')}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      ) : null}
      {children}
    </div>
  );
}
