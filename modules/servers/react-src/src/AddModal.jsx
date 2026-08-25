import { useState } from 'react';

const DEFAULTS = {
  name: '', ip: '', ssh_port: '22', ssh_user: 'root', ssh_pass: '',
  http_port: '10281', socks_port: '10842', role: 'proxy', vds: '',
};

export default function AddModal({ open, onClose, onSubmit }) {
  const [f, setF] = useState(DEFAULTS);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  function submit() {
    const name = f.name.trim();
    const ip = f.ip.trim();
    if (!name || !ip) {
      window.Shell.toast('Заполните название и IP', 'error');
      return;
    }
    onSubmit({
      name, ip,
      ssh_port: parseInt(f.ssh_port) || 22,
      ssh_user: f.ssh_user.trim() || 'root',
      ssh_password: f.ssh_pass || '',
      http_port: parseInt(f.http_port) || 10281,
      socks_port: parseInt(f.socks_port) || 10842,
      role: f.role,
      vds_provider: f.vds,
    }, name, ip);
    setF(DEFAULTS);
  }

  return (
    <div className={'modal-overlay' + (open ? ' active' : '')} id="srvAddModal2">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Добавить сервер</div>
          <button className="modal-close" onClick={onClose}>
            <span className="ico ico-18 ico-close" />
          </button>
        </div>
        <div className="form-group">
          <label className="form-label">Название</label>
          <input className="form-input" placeholder="Proxy-01" value={f.name} onChange={set('name')} />
        </div>
        <div className="form-group">
          <label className="form-label">IP-адрес</label>
          <input className="form-input" placeholder="123.45.67.89" value={f.ip} onChange={set('ip')} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">SSH порт</label>
            <input className="form-input" type="number" value={f.ssh_port} onChange={set('ssh_port')} />
          </div>
          <div className="form-group">
            <label className="form-label">SSH пользователь</label>
            <input className="form-input" value={f.ssh_user} onChange={set('ssh_user')} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">SSH пароль (для копирования ключа)</label>
          <div className="input-eye">
            <input className="form-input" type="password" placeholder="Необязательно" value={f.ssh_pass} onChange={set('ssh_pass')} />
            <button className="eye-btn" type="button" onClick={(e) => window.Shell.toggleEye(e.currentTarget)}>
              <span className="ico ico-16 ico-eye-open" />
            </button>
          </div>
          <div className="form-hint">Если SSH-ключ уже настроен — оставьте пустым</div>
        </div>
        <div className="form-group">
          <label className="form-label">Роль</label>
          <select className="form-select" value={f.role} onChange={set('role')}>
            <option value="proxy">Proxy</option>
            <option value="client">Client</option>
          </select>
        </div>
        {f.role !== 'client' && (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">HTTP порт</label>
              <input className="form-input" type="number" value={f.http_port} onChange={set('http_port')} />
            </div>
            <div className="form-group">
              <label className="form-label">SOCKS5 порт</label>
              <input className="form-input" type="number" value={f.socks_port} onChange={set('socks_port')} />
            </div>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Провайдер VDS</label>
          <select className="form-select" value={f.vds} onChange={set('vds')}>
            <option value="">n/a</option>
            <option value="ruvds">ruvds</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={submit}>Добавить</button>
        </div>
      </div>
    </div>
  );
}
