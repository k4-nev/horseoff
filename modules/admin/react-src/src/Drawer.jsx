import SharedDrawer from '../../../../core/react-src/src/shared/Drawer.jsx';
import Icon from './Icon.jsx';

/* Панель модуля: оформление своё (adm-*), поведение общее — см.
   core/react-src/src/shared/Drawer.jsx. Используется и для добавления,
   и для редактирования, и для экрана «модули по умолчанию». */
export default function Drawer({ open, title, subtitle, onClose, children, reduced }) {
  return (
    <SharedDrawer
      cls="adm" open={open} title={title} subtitle={subtitle}
      onClose={onClose} reduced={reduced} closeIcon={<Icon name="x" />}
    >
      {children}
    </SharedDrawer>
  );
}
