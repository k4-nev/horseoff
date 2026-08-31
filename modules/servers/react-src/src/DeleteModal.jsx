import useEscape from '../../../../core/react-src/src/shared/useEscape.js';

export default function DeleteModal({ open, target, onClose, onConfirm }) {
  useEscape(open, onClose);
  return (
    <div
      className={'modal-overlay' + (open ? ' active' : '')}
      id="srvDelModal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Удалить сервер?</div>
          <button className="modal-close" onClick={onClose}>
            <span className="ico ico-18 ico-close" />
          </button>
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 8 }}>Сервер будет удалён из мониторинга.</div>
        <div className="form-input" style={{ marginBottom: 12 }}>
          {target ? target.name + ' — ' + target.ip : '--'}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-danger" onClick={onConfirm}>Удалить</button>
        </div>
      </div>
    </div>
  );
}
