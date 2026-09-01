import { useEffect, useRef, useState } from 'react';
import SearchField from '../../../../core/react-src/src/shared/SearchField.jsx';
import { api, b64, buzz, compressImage, denyMessage, meId, toast } from './lib.js';
import Avatar from '../../../../core/react-src/src/shared/Avatar.jsx';
import ConfirmModal from '../../../../core/react-src/src/shared/ConfirmModal.jsx';
import RoleBadge from '../../../../core/react-src/src/shared/RoleBadge.jsx';

/* Окна поверх модуля: подтверждение, добавление бота, выдача доступа и
   редактор таблицы заданий. */

/* Оформление подтверждений у «Ботов» своё — плотная карточка без крестика. */
const BT_CONFIRM = {
  ov: 'bt-confirm-overlay', box: 'bt-confirm-box',
  title: 'bt-confirm-title', sub: 'bt-confirm-sub', actions: 'bt-confirm-actions',
};

export function Confirm({ open, onClose }) {
  // Короткая вибрация на появление — у «Ботов» так во всех подтверждениях
  useEffect(() => { if (open) buzz([8, 40, 8]); }, [open]);
  if (!open) return null;
  return (
    <ConfirmModal
      bare classes={BT_CONFIRM}
      title={open.title} text={open.sub}
      okLabel={open.okLabel || 'OK'} cancelLabel={open.cancelLabel || 'Отмена'}
      danger={open.danger !== false}
      onClose={() => onClose(false)} onConfirm={() => onClose(true)}
    />
  );
}

/* ── Добавление бота ──────────────────────────────────────────────────── */
function snippets(key, name) {
  const host = location.origin;
  const ws = host.replace('http', 'ws');
  return {
    cs: `// Horseoff Bot Connector — C#
// Добавьте в отдельный поток ZennoPoster

using System.Net.WebSockets;
using System.Text;
using Newtonsoft.Json;

string API_KEY = "${key}";
string WS_URL  = "${ws}/ws/bots";

var ws = new ClientWebSocket();
await ws.ConnectAsync(new Uri(WS_URL), CancellationToken.None);

// 1. Авторизация
var auth = JsonConvert.SerializeObject(new { type = "auth", api_key = API_KEY });
await ws.SendAsync(Encoding.UTF8.GetBytes(auth), WebSocketMessageType.Text, true, default);

// 2. Отправить манифест (описание элементов управления)
var manifest = JsonConvert.SerializeObject(new {
    type    = "manifest",
    name    = "${name}",
    version = "1.0",
    controls = new[] {
        new { type = "input",  id = "target", label = "Целевой аккаунт" },
        new { type = "button", id = "start",  label = "Запустить", style = "primary" },
        new { type = "button", id = "stop",   label = "Стоп",      style = "danger"  }
    }
});
await ws.SendAsync(Encoding.UTF8.GetBytes(manifest), WebSocketMessageType.Text, true, default);

// 3. Основной цикл — получать команды / слать данные
while (ws.State == WebSocketState.Open) {
    var buf = new byte[8192];
    var result = await ws.ReceiveAsync(buf, default);
    var msg = JsonConvert.DeserializeObject<dynamic>(
        Encoding.UTF8.GetString(buf, 0, result.Count));

    if (msg.type == "command") {
        // msg.ctrl_id, msg.action, msg.value
        HandleCommand(msg);
    }

    // Отправить данные (лог, прогресс, статистику)
    await SendData(ws, new { type = "log", level = "INFO", msg = "Шаг выполнен" });
}`,
    zp: `' Horseoff Bot Connector — ZennoPoster (VB-style pseudo-code)
' Создайте отдельный поток и вставьте C#-действие

Dim apiKey As String = "${key}"
Dim wsUrl  As String = "${ws}/ws/bots"

' Используйте C#-действие внутри ZennoPoster:
' Вставьте код из вкладки C# в блок "Запустить C# код"
' Поток должен быть помечен как фоновый (Background thread)

' Пример отправки данных из основного потока:
project.Variables["hoz_cmd"].Value = "start"

' Пример получения команды:
If project.Variables["hoz_cmd"].Value = "stop" Then
    ' остановить задачи
End If`,
  };
}

export function AddBotModal({ open, groups, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [avatar, setAvatar] = useState('');
  const [created, setCreated] = useState(null);   // {api_key, name}
  const [snip, setSnip] = useState('cs');
  const nameRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setName(''); setGroup(''); setAvatar(''); setCreated(null); setSnip('cs');
    buzz(15);
    const t = setTimeout(() => nameRef.current && nameRef.current.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const create = async () => {
    const nm = name.trim();
    if (!nm) { nameRef.current.focus(); return; }
    buzz(20);
    const d = await api('/api/mod/bots/create', {
      method: 'POST',
      body: JSON.stringify({ name: nm, group: group.trim() || 'Без группы', avatar }),
    });
    if (!d || !d.bot) { toast(denyMessage(d, 'Ошибка создания бота'), 'error'); return; }
    onCreated(d.bot);
    setCreated({ key: d.api_key, name: nm });
  };

  const pickAvatar = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => setAvatar(await compressImage(ev.target.result));
    reader.readAsDataURL(file);
  };

  const code = created ? snippets(created.key, created.name) : null;

  return (
    <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal bt-modal">
        <div className="modal-header">
          <span className="modal-title">Добавить бота</span>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {!created ? (
          <div>
            <div className="bt-modal-avatar-row">
              <div className="bt-modal-ava-wrap" title="Добавить фото" onClick={() => fileRef.current.click()}>
                <div className="bt-modal-ava">
                  {avatar
                    ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.35"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}
                </div>
                <div className="bt-modal-ava-hint">Фото</div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="bt-modal-field" style={{ margin: '0 0 10px' }}>
                  <label className="bt-field-label">Название бота</label>
                  <input
                    className="bt-input" placeholder="Например: IG Parser v2" autoComplete="off" ref={nameRef}
                    value={name} onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
                  />
                </div>
                <div className="bt-modal-field" style={{ margin: 0 }}>
                  <label className="bt-field-label">Группа</label>
                  <input className="bt-input" placeholder="Например: Instagram" autoComplete="off" value={group} onChange={(e) => setGroup(e.target.value)} />
                </div>
              </div>
            </div>
            <input type="file" accept="image/*" style={{ display: 'none' }} ref={fileRef} onChange={pickAvatar} />
            {groups.length > 0 && (
              <div className="bt-group-chips" style={{ display: 'flex' }}>
                {groups.map((g) => (
                  <div className={'bt-group-chip' + (group === g ? ' active' : '')} key={g} onClick={() => { buzz(8); setGroup(g); }}>{g}</div>
                ))}
              </div>
            )}
            <div className="bt-modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
              <button className="btn btn-primary" onClick={create}>Создать</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="bt-created-msg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3bc96b" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
              Бот создан успешно
            </div>
            <div className="bt-modal-field">
              <label className="bt-field-label">API-ключ — сохраните, он больше не отобразится</label>
              <div className="bt-apikey-field">
                <input className="bt-input bt-mono" readOnly value={created.key} />
                <button
                  className="bt-icon-btn" title="Скопировать"
                  onClick={() => navigator.clipboard && navigator.clipboard.writeText(created.key).then(() => { toast('API-ключ скопирован'); buzz(20); })}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                </button>
              </div>
            </div>
            <div className="bt-snippet-tabs">
              <button className={'bt-snip-tab' + (snip === 'cs' ? ' active' : '')} onClick={() => { buzz(10); setSnip('cs'); }}>C#</button>
              <button className={'bt-snip-tab' + (snip === 'zp' ? ' active' : '')} onClick={() => { buzz(10); setSnip('zp'); }}>ZennoPoster</button>
            </div>
            <pre className="bt-code">{snip === 'cs' ? code.cs : code.zp}</pre>
            <div className="bt-modal-actions">
              <button className="btn btn-primary" onClick={onClose}>Готово</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Выдача доступа ───────────────────────────────────────────────────── */
export function AccessModal({ open, bot, onClose, onGrant }) {
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setQ('');
    buzz(15);
    api('/api/users').then((d) => {
      if (!Array.isArray(d)) { setUsers([]); return; }
      // Владельцы (arcana/immortal) и так видят всех ботов, себя тоже не показываем
      const me = meId();
      setUsers(d.filter((u) => !['arcana', 'immortal'].includes(u.role) && u.id !== me));
    });
  }, [open]);

  if (!open) return null;
  const existing = (bot && bot.access ? bot.access : []).map((u) => u.id);
  const list = (users || []).filter((u) => {
    const s = q.trim().toLowerCase();
    return !s || (u.display_name || '').toLowerCase().includes(s) || (u.username || '').toLowerCase().includes(s);
  });

  return (
    <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal bt-modal">
        <div className="modal-header">
          <span className="modal-title">Добавить доступ</span>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: '0 0 10px' }}>
          <SearchField className="bt-access-search" placeholder="Поиск пользователя" value={q} onChange={setQ} clearable />
        </div>
        <div className="bt-access-user-list">
          {users === null && <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>Загрузка…</div>}
          {users !== null && !list.length && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0', textAlign: 'center' }}>
              {users.length ? 'Пользователей не найдено' : 'Нет доступа к списку пользователей'}
            </div>
          )}
          {list.map((u) => {
            const has = existing.includes(u.id);
            return (
              <div className={'bt-access-user-item' + (has ? ' already' : '')} key={u.id} onClick={() => onGrant(u.id)}>
                <Avatar cls="bt-access-ava" src={u.avatar} name={u.display_name || u.username} />
                <div>
                  <div className="bt-access-name">{u.display_name || u.username}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.username}</div>
                </div>
                <RoleBadge role={u.role || 'common'} style={{ marginLeft: 'auto' }} />
                {has && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </div>
            );
          })}
        </div>
        <div className="bt-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

/* ── Редактор таблицы заданий ─────────────────────────────────────────── */
export function TableEditor({ open, onClose, onSave }) {
  const [rows, setRows] = useState([]);
  const cellRefs = useRef([]);
  const cols = open ? open.cols : [];

  useEffect(() => {
    if (!open) return;
    // Одна пустая строка снизу всегда: чтобы дописать задание, не нажимая «+»
    const start = (open.rows || []).map((r) => cols.map((c) => (r[c.key] !== undefined ? String(r[c.key]) : '')));
    setRows(start.length ? start.concat([cols.map(() => '')]) : [cols.map(() => '')]);
    cellRefs.current = [];
    buzz(12);
  }, [open]);

  if (!open) return null;

  const setCell = (r, c, v) => {
    setRows((prev) => {
      const next = prev.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row));
      return withTrailing(next, cols.length);
    });
  };

  const focusCell = (r, c) => {
    const el = cellRefs.current[r] && cellRefs.current[r][c];
    if (el) el.focus();
  };

  const onKey = (e, r, c) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const nc = e.shiftKey ? c - 1 : c + 1;
      if (nc >= 0 && nc < cols.length) focusCell(r, nc);
      else if (!e.shiftKey && r + 1 < rows.length) focusCell(r + 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (r + 1 < rows.length) focusCell(r + 1, c);
    } else if (e.key === 'ArrowUp' && r > 0) {
      e.preventDefault(); focusCell(r - 1, c);
    } else if (e.key === 'ArrowDown' && r + 1 < rows.length) {
      e.preventDefault(); focusCell(r + 1, c);
    }
  };

  /* Вставка из Excel: строки разделены переводом строки, ячейки табом. */
  const onPaste = (e, r, c) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const grid = text.split(/\r?\n/).map((l) => l.split('\t'));
    while (grid.length > 1 && grid[grid.length - 1].every((x) => x === '')) grid.pop();
    setRows((prev) => {
      const next = prev.map((row) => row.slice());
      grid.forEach((pr, dr) => {
        const ri = r + dr;
        while (next.length <= ri) next.push(cols.map(() => ''));
        pr.forEach((val, dc) => {
          const ci = c + dc;
          if (ci < cols.length) next[ri][ci] = val.trim();
        });
      });
      return withTrailing(next, cols.length);
    });
  };

  const save = () => {
    const lines = rows
      .map((row) => row.map((v) => (v || '').replace(/\t/g, ' ')))
      .filter((row) => row.some((v) => v.trim() !== ''))
      .map((row) => row.join('\t'));
    onSave(b64(lines.join('\n')), lines.length);
  };

  return (
    <div className="bt-confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bt-edit-box">
        <div className="bt-edit-head">
          <div className="bt-confirm-title">Редактирование таблицы</div>
          <button className="bt-edit-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="bt-confirm-sub">Вставляйте данные прямо из Excel. Tab — следующая ячейка, Enter — следующая строка.</div>
        <div className="bt-xls-wrap">
          <div className="bt-xls" style={{ gridTemplateColumns: `36px repeat(${cols.length}, 1fr)` }}>
            <div className="bt-xls-th bt-xls-corner">#</div>
            {cols.map((c) => <div className="bt-xls-th" key={c.key}>{c.label}</div>)}
            {rows.map((row, r) => (
              <div style={{ display: 'contents' }} key={r}>
                <div className="bt-xls-num">{r + 1}</div>
                {row.map((v, c) => (
                  <input
                    className="bt-xls-cell" type="text" spellCheck={false} key={c}
                    data-r={r} data-c={c} value={v}
                    ref={(el) => {
                      if (!cellRefs.current[r]) cellRefs.current[r] = [];
                      cellRefs.current[r][c] = el;
                    }}
                    onChange={(e) => setCell(r, c, e.target.value)}
                    onKeyDown={(e) => onKey(e, r, c)}
                    onPaste={(e) => onPaste(e, r, c)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="bt-confirm-actions">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={save}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

/** Держим ровно одну пустую строку под последней заполненной. */
function withTrailing(rows, nc) {
  let last = -1;
  rows.forEach((row, i) => { if (row.some((v) => v.trim() !== '')) last = i; });
  const next = rows.slice(0, Math.max(last + 1, 1));
  next.push(new Array(nc).fill(''));
  return next;
}
