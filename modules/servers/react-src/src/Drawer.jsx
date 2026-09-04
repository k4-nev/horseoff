import SharedDrawer from '../../../../core/react-src/src/shared/Drawer.jsx';

/* Панель модуля: оформление своё (srv-*), поведение общее — см.
   core/react-src/src/shared/Drawer.jsx. Раньше это были центральные
   .modal-overlay: на узком экране они занимали почти весь вьюпорт и всё
   равно скроллились, а форма создания из тринадцати полей была на телефоне
   практически неюзабельна.

   Esc закрывает панель. Выпадающий список внутри гасит своё Esc на фазе
   перехвата, поэтому сначала закрывается он, а не вся панель. */
export default function Drawer({ open, id, title, subtitle, onClose, children }) {
  return (
    <SharedDrawer
      cls="srv" open={open} id={id} title={title} subtitle={subtitle}
      onClose={onClose} bodyCls="srv-drawer-body"
    >
      {children}
    </SharedDrawer>
  );
}
