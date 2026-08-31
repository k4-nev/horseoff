import useMenuFit from '../../../../core/react-src/src/shared/useMenuFit.js';
export default function ContextMenu({ menu, onForward, onCopy }) {
  const [ref, pos] = useMenuFit(menu);
  if (!menu) return null;
  return (
    <div className="srv-ctx-menu" ref={ref} style={pos} onClick={(e) => e.stopPropagation()}>
      <div className="srv-ctx-action" onClick={() => onForward(menu.ip)}>
        <span className="ico ico-14 ico-forward" /> Переслать
      </div>
      <div className="srv-ctx-action" onClick={() => onCopy(menu.ip)}>
        <span className="ico ico-14 ico-copy" /> Копировать
      </div>
    </div>
  );
}
