import { useEffect, useState } from 'react';
import Select from '../../../../core/react-src/src/shared/Select.jsx';
import RoleBadge from '../../../../core/react-src/src/shared/RoleBadge.jsx';
import * as api from './api.js';
import Icon from './Icon.jsx';
import Faq from './Faq.jsx';

/* Редактор лестницы: с какой ступени открывается каждое действие.

   Меняется здесь — меняется везде: и запреты на сервере, и подсказки «нужна
   роль X» в модулях, и то, с какой ступени раздел вообще можно выдать.
   Единственная неподвижная строка — сам этот редактор: будь его порог
   изменяемым, тот, кому его однажды открыли, поднял бы себе права до
   владельца, включая создание учёток. */

const SECTIONS = {
  messenger: 'Сообщения',
  channels: 'Каналы',
  servers: 'Серверы',
  bots: 'Боты',
  mp: 'MP продвижение',
  admin: 'Администрирование',
};

export default function RolesForm({ onClose, onApplied }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [faq, setFaq] = useState(false);
  const [dropped, setDropped] = useState(null);

  useEffect(() => {
    (async () => {
      const d = await api.getRoles();
      if (!d) return;
      setData(d);
      setDraft(Object.fromEntries(d.actions.map((a) => [a.id, a.role])));
    })();
  }, []);

  if (!data) return <div className="adm-empty"><div className="spinner" /></div>;

  /* Ступень в списке — той же плашкой, что и везде в приложении: цвет
     ранга узнаётся быстрее, чем читается слово, а в фильтре ролей рядом
     плашки уже стоят — разнобой был бы заметен. */
  const options = data.roles.map((r) => ({ value: r, label: <RoleBadge role={r} /> }));
  const changed = data.actions.filter((a) => draft[a.id] !== a.role).length;
  const byDefault = data.actions.filter((a) => draft[a.id] !== a.default).length;

  const save = async () => {
    setBusy(true);
    const changes = {};
    data.actions.forEach((a) => { if (draft[a.id] !== a.role) changes[a.id] = draft[a.id]; });
    const res = await api.setRoles(changes);
    setBusy(false);
    if (!res || !res.roles) { window.Shell.toast('Не удалось сохранить', 'error'); return; }
    setData(res.roles);
    setDraft(Object.fromEntries(res.roles.actions.map((a) => [a.id, a.role])));
    /* Поднятый порог отбирает разделы у тех, кто их больше не тянет. Молча
       этого делать нельзя — говорим, у кого что снялось. */
    setDropped(res.dropped && res.dropped.length ? res.dropped : null);
    window.Shell.toast('Доступы обновлены');
    if (onApplied) onApplied();
  };

  const groups = [];
  data.actions.forEach((a) => {
    let g = groups.find((x) => x.id === a.section);
    if (!g) { g = { id: a.section, items: [] }; groups.push(g); }
    g.items.push(a);
  });

  return (
    <div className="adm-roles">
      <div className="adm-roles-head">
        <p className="adm-roles-lead">
          Ступени накопительные: старшая может всё, что может младшая. Раздел
          выдаётся с той ступени, с которой открывается право его видеть.
        </p>
        <button className="adm-faq-btn" type="button" title="Как это работает" onClick={() => setFaq(true)}>
          <Icon name="question" />
        </button>
      </div>

      {groups.map((g) => (
        <div className="adm-roles-group" key={g.id}>
          <div className="adm-roles-title">{SECTIONS[g.id] || g.id}</div>
          {g.items.map((a) => (
            <div className={'adm-roles-row' + (a.locked ? ' locked' : '')} key={a.id}>
              <span className="adm-roles-name">
                {a.title}
                {a.locked && <em className="adm-tog-why">закреплено за владельцем</em>}
                {!a.locked && draft[a.id] !== a.default && (
                  <em className="adm-roles-moved">по умолчанию {a.default.toUpperCase()}</em>
                )}
              </span>
              {a.locked ? (
                <RoleBadge role={a.role} />
              ) : (
                <Select
                  classes={ADM_SELECT}
                  value={draft[a.id]}
                  options={options}
                  onChange={(v) => setDraft((d) => ({ ...d, [a.id]: v }))}
                />
              )}
            </div>
          ))}
        </div>
      ))}

      {dropped && (
        <div className="adm-roles-dropped">
          Разделы сняты, потому что ступень перестала их тянуть:
          {dropped.map((d) => (
            <div key={d.user}><b>{d.user}</b> — {d.modules.join(', ')}</div>
          ))}
        </div>
      )}

      <div className="adm-drawer-actions">
        <button className="adm-btn" type="button" onClick={onClose}>Закрыть</button>
        <button
          className="adm-btn adm-btn-primary"
          type="button"
          disabled={busy || !changed}
          onClick={save}
        >
          {changed ? 'Применить (' + changed + ')' : 'Изменений нет'}
        </button>
      </div>
      {byDefault > 0 && (
        <div className="adm-roles-note">Отличается от умолчаний: {byDefault}</div>
      )}

      <Faq open={faq} onClose={() => setFaq(false)} data={data} />
    </div>
  );
}

/* Список на своих классах модуля — оформление у админки своё. */
const ADM_SELECT = {
  wrap: 'adm-sel', btn: 'adm-sel-btn', val: 'adm-sel-val',
  menu: 'adm-sel-menu', item: 'adm-sel-item', on: 'on',
};
