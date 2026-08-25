export default function ContextMenu({ menu, onForward, onCopy }) {
  if (!menu) return null;
  return (
    <div className="srv-ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
      <div className="srv-ctx-action" onClick={() => onForward(menu.ip)}>
        <span className="ico ico-14 ico-forward" /> Переслать
      </div>
      <div className="srv-ctx-action" onClick={() => onCopy(menu.ip)}>
        <span className="ico ico-14 ico-copy" /> Копировать
      </div>
    </div>
  );
}
