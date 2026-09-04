import { useEffect, useState } from 'react';
import * as api from './api.js';
import Switch from '../../../../core/react-src/src/shared/Switch.jsx';

export default function DefaultsForm({ allModules, onClose }) {
  const [selected, setSelected] = useState(null); // null = ещё грузится

  useEffect(() => {
    (async () => {
      const d = await api.getDefaultModules();
      setSelected(new Set(d ? d.modules : ['messenger']));
    })();
  }, []);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    const d = await api.setDefaultModules([...selected]);
    if (d && d.status === 'ok') {
      window.Shell.toast('Сохранено');
      onClose();
    } else {
      window.Shell.toast(d?.error || 'Ошибка', 'error');
    }
  }

  return (
    <div className="adm-defaults">
      <p className="adm-defaults-desc">Эти модули включаются автоматически при создании нового пользователя.</p>
      <div className="adm-defaults-list">
        {selected &&
          allModules.map((m) => (
            <div className="adm-tog-row" key={m.id}>
              <span>{m.name}</span>
              <Switch on={selected.has(m.id)} label={m.name} onChange={() => toggle(m.id)} />
            </div>
          ))}
      </div>
      <div className="adm-drawer-actions">
        <button className="adm-btn adm-btn-primary" onClick={save} disabled={!selected}>Сохранить</button>
      </div>
    </div>
  );
}
