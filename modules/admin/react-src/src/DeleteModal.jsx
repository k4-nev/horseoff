import ConfirmModal from '../../../../core/react-src/src/shared/ConfirmModal.jsx';

export default function DeleteModal({ user, onClose, onConfirm }) {
  return (
    <ConfirmModal
      title="Удалить пользователя?"
      text="Пользователь будет удалён из системы."
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <div className="form-input" style={{ marginBottom: '12px' }}>
        {user.display_name || user.username}
      </div>
    </ConfirmModal>
  );
}
