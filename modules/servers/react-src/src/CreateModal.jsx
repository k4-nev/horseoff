import { useState } from 'react';
import Drawer from './Drawer.jsx';
import Secret from './Secret.jsx';
import Select from './Select.jsx';

const DEFAULTS = {
  name: '', ip: '', ssh_port: '22', ssh_user: 'root', ssh_pass: '',
  http_port: '10281', socks_port: '10842', proxy_user: '', proxy_pass: '',
  dns: 'google', role: 'proxy', vds: '',
};

const DNS_OPTS = [
  { value: 'google', label: 'Google (8.8.8.8)' },
  { value: 'yandex', label: 'Яндекс (77.88.8.8)' },
];
const ROLE_OPTS = [{ value: 'proxy', label: 'Proxy' }];
const VDS_OPTS = [
  { value: '', label: 'n/a' },
  { value: 'ruvds', label: 'ruvds' },
];

export default function CreateModal({ open, onClose, onSubmit }) {
  const [f, setF] = useState(DEFAULTS);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const pick = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));

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
    <Drawer
      open={open}
      id="srvCreateModal"
      title="Создать сервер"
      subtitle="Provisioning нового сервера по SSH"
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
      <label className="srv-field">
        <span>SSH пароль</span>
        <Secret placeholder="••••••" value={f.ssh_pass} onChange={set('ssh_pass')} />
      </label>
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
      <div className="srv-field-row">
        <label className="srv-field">
          <span>Proxy логин</span>
          <input className="srv-input" placeholder="proxyuser" value={f.proxy_user} onChange={set('proxy_user')} />
        </label>
        <label className="srv-field">
          <span>Proxy пароль</span>
          <Secret placeholder="••••••" value={f.proxy_pass} onChange={set('proxy_pass')} />
        </label>
      </div>
      <div className="srv-field-row">
        <div className="srv-field">
          <span>DNS</span>
          <Select name="dns" value={f.dns} onChange={pick('dns')} options={DNS_OPTS} />
        </div>
        <div className="srv-field">
          <span>Роль сервера</span>
          <Select name="role" value={f.role} onChange={pick('role')} options={ROLE_OPTS} />
        </div>
      </div>
      <div className="srv-field">
        <span>Провайдер VDS</span>
        <Select name="vds_provider" value={f.vds} onChange={pick('vds')} options={VDS_OPTS} />
      </div>
      <div className="srv-drawer-actions">
        <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" onClick={submit}>Создать</button>
      </div>
    </Drawer>
  );
}
