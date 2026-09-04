import ConfirmModal from '../../../../core/react-src/src/shared/ConfirmModal.jsx';

export default function DeleteModal({ open, target, onClose, onConfirm }) {
  return (
    <ConfirmModal
      open={open}
      id="srvDelModal"
      title="Удалить сервер?"
      text="Сервер будет удалён из мониторинга."
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <div className="form-input" style={{ marginBottom: 12 }}>
        {target ? target.name + ' — ' + target.ip : '--'}
      </div>
    </ConfirmModal>
  );
}
