import { useEffect, useState } from 'react';
import Drawer from './Drawer.jsx';
import Select from './Select.jsx';

/* Оригинальный saveServer() имел мёртвую ветку "добавления" (POST /add
   с урезанным набором полей — без ssh_password/dns/proxy_user/proxy_pass),
   которая никогда не выполнялась: единственное место, открывающее эту
   панель — openEdit() — всегда ставило editMode=true до показа. Эта
   панель в реальном UI работает только как редактирование. Порт оставляет
   её чистым edit-путём (PUT /update/:ip), мёртвая ветка не перенесена. */

const EMPTY = { name: '', ip: '', ssh_port: '22', ssh_user: 'root', http_port: '10281', socks_port: '10842', role: '', vds: '' };

const ROLE_OPTS = [
  { value: '', label: 'Не выбрано' },
  { value: 'proxy', label: 'Proxy' },
  { value: 'host', label: 'HOST' },
  { value: 'client', label: 'Client' },
];
const VDS_OPTS = [
  { value: '', label: 'n/a' },
  { value: 'ruvds', label: 'ruvds' },
];

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
  const pick = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));

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
    <Drawer
      open={open}
      id="srvAddModal"
      title="Редактировать сервер"
      subtitle={server ? server.name + ' · ' + server.ip : undefined}
      onClose={onClose}
    >
      <label className="srv-field">
        <span>Название</span>
        <input className="srv-input" placeholder="Proxy-01" value={f.name} onChange={set('name')} />
      </label>
      <label className="srv-field">
        <span>IP-адрес</span>
        <input className="srv-input" placeholder="123.45.67.89" value={f.ip} onChange={set('ip')} />
      </label>
      <div className="srv-field-row">
        <label className="srv-field">
          <span>SSH порт</span>
          <input className="srv-input" type="number" value={f.ssh_port} onChange={set('ssh_port')} />
        </label>
        <label className="srv-field">
          <span>SSH пользователь</span>
          <input className="srv-input" value={f.ssh_user} onChange={set('ssh_user')} />
        </label>
      </div>
      {f.role !== 'client' && (
        <div className="srv-field-row">
          <label className="srv-field">
            <span>HTTP порт</span>
            <input className="srv-input" type="number" value={f.http_port} onChange={set('http_port')} />
          </label>
          <label className="srv-field">
            <span>SOCKS5 порт</span>
            <input className="srv-input" type="number" value={f.socks_port} onChange={set('socks_port')} />
          </label>
        </div>
      )}
      <div className="srv-field">
        <span>Роль</span>
        <Select name="role" value={f.role} onChange={pick('role')} options={ROLE_OPTS} placeholder="Не выбрано" />
      </div>
      <div className="srv-field">
        <span>Провайдер VDS</span>
        <Select name="vds_provider" value={f.vds} onChange={pick('vds')} options={VDS_OPTS} />
      </div>
      <div className="srv-drawer-actions">
        <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" onClick={submit}>Сохранить</button>
      </div>
    </Drawer>
  );
}
