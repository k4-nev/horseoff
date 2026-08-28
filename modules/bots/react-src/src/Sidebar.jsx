import { useState } from 'react';
import SearchField from '../../../../core/react-src/src/shared/SearchField.jsx';
import { buzz } from './lib.js';

/* Список ботов, сгруппированный по полю group. Группы сворачиваются, счётчик
   непрочитанного живёт на строке бота. */

function Row({ bot, active, onOpen, delay }) {
  const dot = bot.status === 'offline' ? 'offline' : (bot.status_dot || bot.status);
  const sub = bot.status !== 'offline' && bot.status_text ? bot.status_text : (bot.sub || '');
  return (
    <div
      className={'bt-bot-row' + (active ? ' active' : '') + (bot.status === 'offline' ? ' offline-bot' : '')}
      data-bot-id={bot.id}
      style={{ animationDelay: delay + 's' }}
      onClick={() => onOpen(bot.id)}
    >
      {bot.avatar
        ? <div className="bt-bot-ava"><img src={bot.avatar} alt="" /><div className={'bt-ava-dot ' + dot} /></div>
        : <div className={'bt-dot ' + dot} />}
      <div className="bt-bot-info">
        <div className="bt-bot-row-name">{bot.name}</div>
        <div className="bt-bot-row-sub">{sub}</div>
      </div>
      {bot.badge ? <div className="bt-badge">{bot.badge}</div> : null}
    </div>
  );
}

export default function Sidebar({ bots, selected, testOn, onOpen, onAdd, onToggleTest, onRenameGroup }) {
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState({});

  const s = q.trim().toLowerCase();
  const list = s
    ? bots.filter((b) => b.name.toLowerCase().includes(s) || (b.group || '').toLowerCase().includes(s))
    : bots;

  const groups = [];
  list.forEach((b) => {
    const g = b.group || 'Без группы';
    let grp = groups.find((x) => x.name === g);
    if (!grp) { grp = { name: g, bots: [] }; groups.push(grp); }
    grp.bots.push(b);
  });

  return (
    <div className="bt-sidebar">
      <div className="bt-sidebar-head">
        <span className="bt-sidebar-title">Боты</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={'bt-head-add bt-demo-btn' + (testOn ? ' demo-on' : '')}
            title="Тест-бот" onClick={onToggleTest}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" /></svg>
          </button>
          <button className="bt-head-add" title="Добавить бота" onClick={onAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
      </div>

      <div className="bt-search-wrap">
        <SearchField className="bt-search-field" placeholder="Поиск" value={q} onChange={setQ} clearable />
      </div>

      <div className="bt-list">
        {!list.length && (
          <div style={{ textAlign: 'center', padding: '30px 16px', fontSize: 12, color: 'var(--text-dim)' }}>
            Ничего не найдено
          </div>
        )}
        {groups.map((g) => {
          const off = !!collapsed[g.name];
          return (
            <div className={'bt-group' + (off ? ' collapsed' : '')} data-group={g.name} key={g.name}>
              <div
                className="bt-group-header"
                onClick={() => { buzz(8); setCollapsed((c) => ({ ...c, [g.name]: !off })); }}
              >
                <svg className="bt-group-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                <span className="bt-group-name">{g.name}</span>
                <span className="bt-group-count">{g.bots.length}</span>
                <button
                  className="bt-group-rename" title="Переименовать группу"
                  onClick={(e) => { e.stopPropagation(); onRenameGroup(g.name); }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
              </div>
              <div className="bt-group-bots" style={{ maxHeight: off ? 0 : g.bots.length * 55 + 8 }}>
                {g.bots.map((b, i) => (
                  <Row key={b.id} bot={b} active={b.id === selected} onOpen={onOpen} delay={i * 0.03} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
