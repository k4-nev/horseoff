import useEscape from '../../../../core/react-src/src/shared/useEscape.js';

export default function DeleteModal({ user, onClose, onConfirm }) {
  useEscape(true, onClose);
  return (
    <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Удалить пользователя?</div>
          <button className="modal-close" onClick={onClose}>
            <span className="ico ico-18 ico-close"></span>
          </button>
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: '14px', marginBottom: '12px' }}>
          Пользователь будет удалён из системы.
        </div>
        <div className="form-input" style={{ marginBottom: '12px' }}>
          {user.display_name || user.username}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
