/* Пустое состояние: значок, строка «здесь пока ничего» и подсказка.

   Четыре штуки на приложение, и все об одном. Разметку задаёт карта классов:
   у «Ботов» подпись зовётся -text, у mp -title, у «Каналов» это просто
   абзац — сводить их к одному имени значило бы править чужие стили ради
   единообразия. Общее здесь — состав и порядок частей. */
export default function Empty({ icon, title, sub, action, classes }) {
  const c = classes || {};
  return (
    <div className={c.wrap === undefined ? 'mp-empty' : c.wrap}>
      {icon && (c.icon ? <div className={c.icon}>{icon}</div> : icon)}
      {title && <div className={c.title === undefined ? 'mp-empty-title' : c.title || undefined}>{title}</div>}
      {sub && <div className={c.sub}>{sub}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
