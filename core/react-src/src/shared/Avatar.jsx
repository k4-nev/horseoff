/* Аватар пользователя.

   Одна и та же строчка — «есть картинка, показываем её; нет, показываем
   первую букву имени» — была написана в приложении восемнадцать раз, в пяти
   модулях. Каждая копия по-своему добывала букву: где-то `.charAt(0)`,
   где-то `[0]`, где-то без проверки на пустое имя. Здесь это одно место.

   Классы остаются за модулем: у каждого свои размеры и рамки, и сводить их
   к одному виду не нужно — общая тут логика, а не оформление. */

/** Буква-заглушка: первый символ имени, «?» если имени нет. */
export const letterOf = (name) => (((name || '').trim())[0] || '?').toUpperCase();

export default function Avatar({
  src,            // base64 без префикса, как отдаёт сервер
  name,           // имя — из него берётся буква
  letter,         // если нужна не первая буква, а свои инициалы
  cls,            // класс обёртки (при bare — самой картинки)
  imgCls,         // класс картинки, когда он отличается от обёртки
  letterCls,      // буква в <span> с этим классом; пустая строка — span без класса
  emptyCls,       // при bare: класс заглушки, если он не <cls>-empty
  mime = 'jpeg',
  bare,           // класс висит на самой картинке, обёртки нет
  children,       // накладки поверх (например, «сменить фото»)
  ...rest
}) {
  const ch = letter !== undefined ? letter : letterOf(name);
  const url = src ? 'data:image/' + mime + ';base64,' + src : null;

  /* Часть разметки вешает класс прямо на <img>, а под заглушку держит
     отдельный класс. Ломать эту вёрстку ради единообразия смысла нет. */
  if (bare) {
    return url
      ? <img className={cls} src={url} alt="" {...rest} />
      : <div className={emptyCls || (cls + ' ' + cls + '-empty')} {...rest}>{ch}</div>;
  }

  return (
    <div className={cls} {...rest}>
      {url
        ? <img className={imgCls} src={url} alt="" />
        : (letterCls !== undefined ? <span className={letterCls || undefined}>{ch}</span> : ch)}
      {children}
    </div>
  );
}
