import { useEffect, useState } from 'react';

/* Оригинальный saveServer() имел мёртвую ветку "добавления" (POST /add
   с урезанным набором полей — без ssh_password/dns/proxy_user/proxy_pass),
   которая никогда не выполнялась: единственное место, открывающее эту
   модалку — openEdit() — всегда ставило editMode=true до показа. Эта
   модалка в реальном UI работает только как редактирование. Порт оставляет
   её чистым edit-путём (PUT /update/:ip), мёртвая ветка не перенесена. */

const EMPTY = { name: '', ip: '', ssh_port: '22', ssh_user: 'root', http_port: '10281', socks_port: '10842', role: '', vds: '' };

export default function EditModal({ open, server, onClose, onSubmit }) {
  const [f, setF] = useState(EMPTY);

  useEffect(() => {
    if (server) {
      setF({
        name: server.name || '',
        ip: server.ip || '',
        ssh_port: String(server.ssh_port || 22),
        ssh_user: server.ssh_user || 'root',
        http_port: String(server.http_port || 10281),
        socks_port: String(server.socks_port || 10842),
        role: server.role || 'proxy',
        vds: server.vds_provider || '',
      });
    }
  }, [server]);

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  function submit() {
    const name = f.name.trim();
    const ip = f.ip.trim();
    if (!name || !ip) {
      window.Shell.toast('Заполните название и IP', 'error');
      return;
    }
    onSubmit(server.ip, {
      name, ip,
      ssh_port: parseInt(f.ssh_port) || 22,
      ssh_user: f.ssh_user.trim() || 'root',
      http_port: parseInt(f.http_port) || 10281,
      socks_port: parseInt(f.socks_port) || 10842,
      role: f.role,
      vds_provider: f.vds,
    });
  }

  return (
    <div className={'modal-overlay' + (open ? ' active' : '')} id="srvAddModal">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Редактировать сервер</div>
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
          <label className="form-label">Роль</label>
          <select className="form-select" value={f.role} onChange={set('role')}>
            <option value="">Не выбрано</option>
            <option value="proxy">Proxy</option>
            <option value="host">HOST</option>
            <option value="client">Client</option>
          </select>
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
          <button className="btn btn-primary" onClick={submit}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
