import { useMemo, useState } from 'react';
import { warmupRows } from './mock.js';
import { Check, Client, EmptyRow, ExecStatus, Notch, TrashIcon, execNotch, plural } from './atoms.jsx';

/* Прогрев только читается: снять на сегодня можно, добавить нельзя.
   Снятое возвращается завтра само, поэтому храним это отдельным списком,
   а не правим исходные строки. */
export default function TabWarmup({ server, removed, setRemoved, onConfirm }) {
  const [sel, setSel] = useState({});

  const rows = useMemo(() => {
    const list = warmupRows(server).filter((r) => !removed[r.accountId]);
    // Без времени — в конец: это не «рано утром», а «не запланировано»
    return list.sort((a, b) => {
      if (!a.scheduledAt && !b.scheduledAt) return 0;
      if (!a.scheduledAt) return 1;
      if (!b.scheduledAt) return -1;
      return a.scheduledAt.localeCompare(b.scheduledAt);
    });
  }, [server, removed]);

  const selCount = rows.filter((r) => sel[r.accountId]).length;
  const allSel = rows.length > 0 && rows.every((r) => sel[r.accountId]);

  const drop = () => {
    setRemoved((p) => {
      const next = { ...p };
      rows.forEach((r) => { if (sel[r.accountId]) next[r.accountId] = true; });
      return next;
    });
    setSel({});
  };

  const askDrop = () => {
    if (!selCount) return;
    onConfirm({
      title: 'Снять прогрев на сегодня?',
      body: <>Вы точно хотите снять прогрев на сегодня для <b>{selCount}</b> {plural(selCount, 'аккаунта', 'аккаунтов', 'аккаунтов')}? Расписание вернётся завтра автоматически.</>,
      confirm: 'Снять',
      onOk: drop,
    });
  };

  return (
    <div className="mp-wu">
      <div className="mp-wu-card">
        <div className="mp-wu-grid mp-wu-head">
          <span />
          <Check on={allSel} onClick={() => {
            const next = {};
            rows.forEach((r) => { next[r.accountId] = !allSel; });
            setSel(next);
          }} label="Выбрать все" />
          <span>Время</span><span>Аккаунт</span><span>Стадия</span><span>Прогрев</span>
          <button className="mp-wu-bulk" disabled={!selCount} onClick={askDrop}>
            <TrashIcon />{selCount ? 'Выбрано: ' + selCount : 'Снять на сегодня'}
          </button>
        </div>

        {rows.length === 0 && <EmptyRow>На сегодня прогрев снят со всех</EmptyRow>}
        {rows.map((r) => (
          <div className={'mp-wu-grid mp-wu-row' + (sel[r.accountId] ? ' sel' : '')} key={r.accountId}>
            <Notch color={execNotch(r.exec)} />
            <Check on={!!sel[r.accountId]} onClick={() => setSel((p) => ({ ...p, [r.accountId]: !p[r.accountId] }))} label={r.name} />
            <span className="mp-wu-time">{r.scheduledAt || <span style={{ color: '#b4b4bb' }}>—</span>}</span>
            <Client name={r.name} phone={r.phone} gender={r.gender} />
            <span className="mp-wu-stage">{r.stage}</span>
            <ExecStatus exec={r.exec} />
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}
