/* Плашка роли. Оформление (.role-badge и цвет под каждую роль) живёт в
   core/shell.css и общее с самого начала — дублировалась только разметка. */
export default function RoleBadge({ role, className, style }) {
  if (!role) return null;
  return (
    <span className={'role-badge ' + role + (className ? ' ' + className : '')} style={style}>
      {role.toUpperCase()}
    </span>
  );
}
