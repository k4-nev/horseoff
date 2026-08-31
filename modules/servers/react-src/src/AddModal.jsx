import { useState } from 'react';
import Drawer from './Drawer.jsx';
import Secret from './Secret.jsx';
import Select from './Select.jsx';

const DEFAULTS = {
  name: '', ip: '', ssh_port: '22', ssh_user: 'root', ssh_pass: '',
  http_port: '10281', socks_port: '10842', role: 'proxy', vds: '',
};

const ROLE_OPTS = [
  { value: 'proxy', label: 'Proxy' },
  { value: 'client', label: 'Client' },
];
const VDS_OPTS = [
  { value: '', label: 'n/a' },
  { value: 'ruvds', label: 'ruvds' },
];

export default function AddModal({ open, onClose, onSubmit }) {
  const [f, setF] = useState(DEFAULTS);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const pick = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));

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
    <Drawer
      open={open}
      id="srvAddModal2"
      title="Добавить сервер"
      subtitle="Подключить уже существующий сервер по SSH"
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
        <span>SSH пароль (для копирования ключа)</span>
        <Secret placeholder="Необязательно" value={f.ssh_pass} onChange={set('ssh_pass')} />
        <div className="srv-hint">Если SSH-ключ уже настроен — оставьте пустым</div>
      </label>
      <div className="srv-field">
        <span>Роль</span>
        <Select name="role" value={f.role} onChange={pick('role')} options={ROLE_OPTS} />
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
        <span>Провайдер VDS</span>
        <Select name="vds_provider" value={f.vds} onChange={pick('vds')} options={VDS_OPTS} />
      </div>
      <div className="srv-drawer-actions">
        <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" onClick={submit}>Добавить</button>
      </div>
    </Drawer>
  );
}
