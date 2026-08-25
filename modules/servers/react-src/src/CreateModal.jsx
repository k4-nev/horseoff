import { useState } from 'react';

const DEFAULTS = {
  name: '', ip: '', ssh_port: '22', ssh_user: 'root', ssh_pass: '',
  http_port: '10281', socks_port: '10842', proxy_user: '', proxy_pass: '',
  dns: 'google', role: 'proxy', vds: '',
};

export default function CreateModal({ open, onClose, onSubmit }) {
  const [f, setF] = useState(DEFAULTS);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  function submit() {
    const name = f.name.trim();
    const ip = f.ip.trim();
    const proxyUser = f.proxy_user.trim();
    if (!name || !ip || !f.ssh_pass || !proxyUser || !f.proxy_pass) {
      window.Shell.toast('Заполните все поля', 'error');
      return;
    }
    onSubmit({
      name, ip,
      ssh_port: parseInt(f.ssh_port) || 22,
      ssh_user: f.ssh_user.trim() || 'root',
      ssh_password: f.ssh_pass,
      http_port: parseInt(f.http_port) || 10281,
      socks_port: parseInt(f.socks_port) || 10842,
      proxy_user: proxyUser,
      proxy_pass: f.proxy_pass,
      dns: f.dns,
      role: f.role,
      vds_provider: f.vds,
    }, ip);
    setF(DEFAULTS);
  }

  return (
    <div className={'modal-overlay' + (open ? ' active' : '')} id="srvCreateModal">
      <div className="modal modal-wide">
        <div className="modal-header">
          <div className="modal-title">Создать сервер</div>
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
          <label className="form-label">SSH пароль</label>
          <div className="input-eye">
            <input className="form-input" type="password" placeholder="••••••" value={f.ssh_pass} onChange={set('ssh_pass')} />
            <button className="eye-btn" type="button" onClick={(e) => window.Shell.toggleEye(e.currentTarget)}>
              <span className="ico ico-16 ico-eye-open" />
            </button>
          </div>
        </div>
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
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Proxy логин</label>
            <input className="form-input" placeholder="proxyuser" value={f.proxy_user} onChange={set('proxy_user')} />
          </div>
          <div className="form-group">
            <label className="form-label">Proxy пароль</label>
            <div className="input-eye">
              <input className="form-input" type="password" placeholder="••••••" value={f.proxy_pass} onChange={set('proxy_pass')} />
              <button className="eye-btn" type="button" onClick={(e) => window.Shell.toggleEye(e.currentTarget)}>
                <span className="ico ico-16 ico-eye-open" />
              </button>
            </div>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">DNS</label>
            <select className="form-select" value={f.dns} onChange={set('dns')}>
              <option value="google">Google (8.8.8.8)</option>
              <option value="yandex">Яндекс (77.88.8.8)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Роль сервера</label>
            <select className="form-select" value={f.role} onChange={set('role')}>
              <option value="proxy">Proxy</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Провайдер VDS</label>
          <select className="form-select" value={f.vds} onChange={set('vds')}>
            <option value="">n/a</option>
            <option value="ruvds">ruvds</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={submit}>Создать</button>
        </div>
      </div>
    </div>
  );
}
