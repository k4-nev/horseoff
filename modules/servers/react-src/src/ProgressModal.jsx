import Modal from '../../../../core/react-src/src/shared/Modal.jsx';

function StepIcon({ status }) {
  if (status === 'pending') return <span style={{ color: 'var(--text-dim)' }}>○</span>;
  if (status === 'running') return <div className="srv-prov-spinner" />;
  if (status === 'done') return <span style={{ color: 'var(--accent)' }}>✓</span>;
  if (status === 'error') return <span style={{ color: 'var(--danger)' }}>✗</span>;
  return null;
}

export default function ProgressModal({ open, steps, error, onClose }) {
  return (
    <Modal
      open={open} keepMounted id="srvProgressModal"
      title="Настройка сервера" onClose={onClose}
      /* Пока идёт установка, закрывать нечего: ни крестика, ни Escape, ни
         клика мимо — иначе окно исчезнет посреди работы над сервером. */
      closable={!!error} escape={!!error} backdrop={!!error}
    >
      <div id="srvProgressSteps">
        {!steps ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>
            <div className="spinner" />
          </div>
        ) : (
          steps.map((s, i) => (
            <div key={i} className={'srv-prov-step ' + s.status}>
              <div className="srv-prov-icon">
                <StepIcon status={s.status} />
              </div>
              <div className="srv-prov-name">{s.name}</div>
            </div>
          ))
        )}
      </div>
      <div id="srvProgressError" style={{ display: error ? 'block' : 'none', color: 'var(--danger)', fontSize: 13, marginTop: 10, padding: '8px 12px', background: 'var(--danger-glow)', borderRadius: 6 }}>
        {error}
      </div>
    </Modal>
  );
}
