import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Controls from './Controls.jsx';
import LogTab from './LogTab.jsx';
import Stats from './Stats.jsx';
import SettingsTab from './SettingsTab.jsx';
import Sidebar from './Sidebar.jsx';
import { AccessModal, AddBotModal, Confirm, TableEditor } from './Modals.jsx';
import { DEFAULT_CONTROLS, DEMO_LOG, TEST_BOT, TEST_BOT_ID } from './testBot.js';
import {
  api, applyLayout, buzz, defH, defW, flattenControls, gridCols, groupControls,
  plural, relTime, toast,
} from './lib.js';
import Empty from '../../../../core/react-src/src/shared/Empty.jsx';

/* Модуль «Боты»: список ботов слева, рабочая область справа.

   Интерфейс бота не зашит в модуль — он приходит манифестом по WS
   (см. ZennoPoster.md) и может измениться на ходу. Поэтому состояние здесь
   про три вещи: какие боты есть, что каждый из них прислал, и как человек
   расставил его карточки.

   Кеши по боту (controls/logs) намеренно живут в модуле, а не во вкладке:
   переключение ботов и модулей не должно терять то, что уже пришло. */

const LOG_MAX = 500;
const OPTIONAL_TABS = ['stats', 'log', 'params'];
const TABS = [
  { id: 'controls', label: 'Управление' },
  { id: 'stats', label: 'Статистика' },
  { id: 'log', label: 'Лог' },
  { id: 'params', label: 'Параметры' },
  { id: 'settings', label: 'Настройки' },
];

const BT_EMPTY = {
  wrap: 'bt-empty', icon: 'bt-empty-ico', title: 'bt-empty-text', sub: 'bt-empty-sub',
};

export default function App({ registerBridge }) {
  const [bots, setBots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('controls');
  const [editMode, setEditMode] = useState(false);
  const [ordered, setOrdered] = useState([]);        // раскладка открытого бота
  const [controlsByBot, setControlsByBot] = useState({});
  const [logsByBot, setLogsByBot] = useState({});
  const [logHidden, setLogHidden] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [testOn, setTestOn] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [tableEdit, setTableEdit] = useState(null);

  const selRef = useRef(null);
  selRef.current = selected;
  const editRef = useRef(false);
  editRef.current = editMode;
  const orderedRef = useRef([]);
  orderedRef.current = ordered;

  const bot = bots.find((b) => b.id === selected) || null;
  const isTest = selected === TEST_BOT_ID;
  const offline = bot ? bot.status === 'offline' : false;
  const locked = bot ? bot.status !== 'offline' && !!bot.status_lock : false;
  const groups = useMemo(
    () => [...new Set(bots.map((b) => b.group).filter((g) => g && g !== 'Без группы'))],
    [bots],
  );

  /* ── Загрузка ───────────────────────────────────────────────────────── */
  const loadBots = useCallback(async () => {
    const d = await api('/api/mod/bots/list');
    if (!d) return;
    setBots((prev) => {
      const test = prev.find((b) => b.id === TEST_BOT_ID);
      const next = d.bots || [];
      return test ? [test].concat(next) : next;
    });
  }, []);

  useEffect(() => { loadBots(); }, [loadBots]);

  /* Раскладка зависит от манифеста и от сохранённого layout бота. */
  const rebuildLayout = useCallback((botObj, controls) => {
    const flat = flattenControls(controls || []);
    setOrdered(applyLayout(flat, botObj && botObj.layout, gridCols()));
  }, []);

  const loadDetails = useCallback(async (id) => {
    if (id === TEST_BOT_ID) {
      setControlsByBot((m) => ({ ...m, [id]: TEST_BOT.controls }));
      rebuildLayout(TEST_BOT, TEST_BOT.controls);
      return;
    }
    const d = await api(`/api/mod/bots/${id}`);
    if (!d || !d.bot) return;
    // Счётчик мы только что сбросили и отметили прочитанным; ответ мог уйти
    // раньше отметки, и его badge вернул бы бейдж обратно на строку.
    const full = { ...d.bot, badge: selRef.current === id ? 0 : d.bot.badge };
    setBots((prev) => prev.map((b) => (b.id === id ? { ...b, ...full } : b)));
    if (selRef.current !== id) return;
    const controls = full.controls && full.controls.length ? full.controls : DEFAULT_CONTROLS;
    setControlsByBot((m) => ({ ...m, [id]: controls }));
    rebuildLayout(full, controls);
    if (Array.isArray(full.logs)) {
      setLogsByBot((m) => ({ ...m, [id]: full.logs.slice(-LOG_MAX) }));
    }
  }, [rebuildLayout]);

  const openBot = useCallback((id) => {
    setSelected(id);
    setEditMode(false);
    setTab('controls');
    setSidebarOpen(false);
    buzz(15);
    const b = bots.find((x) => x.id === id);
    if (b && b.badge) {
      setBots((prev) => prev.map((x) => (x.id === id ? { ...x, badge: 0 } : x)));
      if (id !== TEST_BOT_ID) api(`/api/mod/bots/${id}/read`, { method: 'POST' });
    }
    const cached = controlsByBot[id];
    if (cached) rebuildLayout(b, cached); else setOrdered([]);
    loadDetails(id);
  }, [bots, controlsByBot, loadDetails, rebuildLayout]);

  /* ── Команды боту ───────────────────────────────────────────────────── */
  const send = useCallback((ctrlId, action, value) => {
    const id = selRef.current;
    if (!id) return;
    buzz(18);
    if (id === TEST_BOT_ID) { toast('Тест-бот: команда «' + action + '» никуда не уходит'); return; }
    api(`/api/mod/bots/${id}/command`, {
      method: 'POST',
      body: JSON.stringify({ ctrl_id: ctrlId, action, value }),
    });
  }, []);

  /* ── Раскладка ──────────────────────────────────────────────────────── */
  const saveLayout = useCallback(async () => {
    const id = selRef.current;
    const list = orderedRef.current;
    if (!id || id === TEST_BOT_ID || !list.length) return;
    const layout = list.map((c) => ({
      id: c.id,
      w: c._w || defW(c.type),
      h: c._h || defH(c.type),
      ...(c._manualH !== undefined ? { manualH: c._manualH } : {}),
    }));
    setBots((prev) => prev.map((b) => (b.id === id ? { ...b, layout } : b)));
    const d = await api(`/api/mod/bots/${id}/layout`, { method: 'POST', body: JSON.stringify({ layout }) });
    if (d && d.ok) toast('Расположение сохранено');
  }, []);

  const reorder = useCallback((dragId, targetId, before) => {
    setOrdered((prev) => {
      const drag = prev.find((c) => c.id === dragId);
      const target = prev.find((c) => c.id === targetId);
      if (!drag || !target) return prev;

      if (drag.type === 'section') {
        // Секция едет со своими детьми — иначе они осядут в соседней
        const groups = groupControls(prev);
        const from = groups.find((g) => g.section && g.section.id === dragId);
        const to = groups.find((g) => g.section && g.section.id === targetId);
        if (!from || !to) return prev;
        const items = [from.section].concat(from.children);
        const rest = prev.filter((c) => !items.includes(c));
        let ti = rest.indexOf(to.section);
        if (!before) {
          let end = ti + 1;
          while (end < rest.length && rest[end].type !== 'section') end++;
          ti = end;
        }
        const next = rest.slice();
        next.splice(Math.max(0, ti), 0, ...items);
        return next;
      }

      const rest = prev.filter((c) => c.id !== dragId);
      let ti = rest.findIndex((c) => c.id === targetId);
      // Бросили на заголовок секции — становимся её первым ребёнком
      if (target.type === 'section') ti += 1;
      else if (!before) ti += 1;
      const next = rest.slice();
      next.splice(Math.max(0, ti), 0, drag);
      return next;
    });
  }, []);

  const resize = useCallback((id, patch) => {
    setOrdered((prev) => prev.map((c) => (c.id === id
      ? { ...c, _w: patch.w, _h: patch.h, ...(patch.manualH !== undefined ? { _manualH: patch.manualH } : {}) }
      : c)));
  }, []);

  const autoSort = useCallback(() => {
    setOrdered((prev) => {
      const sections = prev.filter((c) => c.type === 'section');
      const rest = prev.filter((c) => c.type !== 'section').sort((a, b) => {
        const area = (x) => (x._h || defH(x.type)) * (x._w || defW(x.type));
        return area(b) - area(a) || (b._h || defH(b.type)) - (a._h || defH(a.type));
      });
      if (!sections.length) return rest;
      const per = Math.ceil(rest.length / sections.length);
      const out = [];
      sections.forEach((sec) => {
        out.push(sec);
        rest.splice(0, per).forEach((c) => out.push(c));
      });
      return out;
    });
    toast('Элементы перестроены по оптимальной схеме');
  }, []);

  const toggleEdit = useCallback(() => {
    if (!ordered.length) return;
    if (editMode) { saveLayout(); setEditMode(false); return; }
    setEditMode(true);
    toast('Режим редактирования: перетаскивайте и тяните за угол');
    buzz([8, 40, 8]);
  }, [editMode, ordered.length, saveLayout]);

  /* Уход с вкладки при правке — спрашиваем про сохранение, как раньше. */
  const leaveEdit = useCallback((then) => {
    setConfirm({
      title: 'Сохранить изменения?',
      sub: 'Вы редактировали расположение элементов управления',
      okLabel: 'Сохранить', cancelLabel: 'Не сохранять', danger: false,
      onDone: (save) => { if (save) saveLayout(); setEditMode(false); then(); },
    });
  }, [saveLayout]);

  const switchTab = useCallback((next) => {
    if (editMode && next !== 'controls') { leaveEdit(() => setTab(next)); return; }
    if (offline && next !== 'settings') return;
    buzz(8);
    setTab(next);
  }, [editMode, leaveEdit, offline]);

  /* ── Настройки бота ─────────────────────────────────────────────────── */
  const patchBot = useCallback(async (patch, okMsg) => {
    const id = selRef.current;
    if (!id) return;
    if (id === TEST_BOT_ID) {
      setBots((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
      return;
    }
    buzz(20);
    const d = await api(`/api/mod/bots/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
    if (!d || !d.ok) { toast('Ошибка сохранения', 'error'); return; }
    setBots((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    if (okMsg) toast(okMsg);
  }, []);

  const deleteBot = useCallback(() => {
    if (!bot) return;
    setConfirm({
      title: 'Удалить бота?',
      sub: `«${bot.name}» и его API-ключ будут удалены без возможности восстановления.`,
      okLabel: 'Удалить',
      onDone: async (ok) => {
        if (!ok) return;
        buzz(40);
        if (bot.id === TEST_BOT_ID) { setTestOn(false); setBots((p) => p.filter((b) => b.id !== TEST_BOT_ID)); setSelected(null); return; }
        await api(`/api/mod/bots/${bot.id}`, { method: 'DELETE' });
        setSelected(null);
        loadBots();
        toast('Бот удалён');
      },
    });
  }, [bot, loadBots]);

  const renameGroup = useCallback((oldName) => {
    const next = window.prompt('Новое название группы:', oldName);
    if (next === null) return;
    const newName = next.trim();
    if (!newName || newName === oldName) return;
    buzz(20);
    api('/api/mod/bots/group/rename', { method: 'POST', body: JSON.stringify({ old: oldName, new: newName }) })
      .then((d) => { if (d && d.ok) { loadBots(); toast(`Группа переименована (${d.count})`); } });
  }, [loadBots]);

  const grantAccess = useCallback(async (userId) => {
    const id = selRef.current;
    if (!id || id === TEST_BOT_ID) return;
    buzz(20);
    await api(`/api/mod/bots/${id}/access`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
    await loadDetails(id);
    toast('Доступ выдан');
  }, [loadDetails]);

  const removeAccess = useCallback(async (userId) => {
    const id = selRef.current;
    if (!id || id === TEST_BOT_ID) return;
    buzz(20);
    await api(`/api/mod/bots/${id}/access`, { method: 'DELETE', body: JSON.stringify({ user_id: userId }) });
    await loadDetails(id);
  }, [loadDetails]);

  /* ── Лог ────────────────────────────────────────────────────────────── */
  const clearLog = useCallback(() => {
    const id = selRef.current;
    if (!id) return;
    buzz(20);
    setLogsByBot((m) => ({ ...m, [id]: [] }));
    if (id !== TEST_BOT_ID) api(`/api/mod/bots/${id}/clear_log`, { method: 'POST', body: '{}' });
  }, []);

  const pushLog = useCallback((botId, line) => {
    setLogsByBot((m) => {
      const arr = (m[botId] || []).concat(line);
      return { ...m, [botId]: arr.length > LOG_MAX ? arr.slice(-LOG_MAX) : arr };
    });
  }, []);

  /* ── Тест-бот ───────────────────────────────────────────────────────── */
  const toggleTest = useCallback(() => {
    buzz(20);
    if (testOn) {
      setTestOn(false);
      setBots((p) => p.filter((b) => b.id !== TEST_BOT_ID));
      if (selRef.current === TEST_BOT_ID) setSelected(null);
      return;
    }
    setTestOn(true);
    setBots((p) => [TEST_BOT].concat(p.filter((b) => b.id !== TEST_BOT_ID)));
    setSelected(TEST_BOT_ID);
    setTab('controls');
    setSidebarOpen(false);
    setControlsByBot((m) => ({ ...m, [TEST_BOT_ID]: TEST_BOT.controls }));
    rebuildLayout(TEST_BOT, TEST_BOT.controls);
    const now = new Date().toTimeString().slice(0, 8);
    setLogsByBot((m) => ({ ...m, [TEST_BOT_ID]: DEMO_LOG.map(([level, msg]) => ({ ts: now, level, msg })) }));
  }, [testOn, rebuildLayout]);

  /* ── События от оболочки ────────────────────────────────────────────── */
  const onWS = useCallback((d) => {
    if (d.type === 'bot_update') {
      const patch = {};
      ['status', 'version', 'sub', 'tabs', 'status_text', 'status_dot', 'status_lock'].forEach((k) => {
        if (d[k] !== undefined) patch[k] = d[k];
      });
      setBots((prev) => prev.map((b) => (b.id === d.bot_id ? { ...b, ...patch } : b)));
      if (d.controls) {
        setControlsByBot((m) => ({ ...m, [d.bot_id]: d.controls }));
        if (selRef.current === d.bot_id && d.status === 'online' && !editRef.current) {
          setBots((prev) => {
            const b = prev.find((x) => x.id === d.bot_id);
            rebuildLayout(b, d.controls);
            return prev;
          });
        }
      }
      return;
    }

    if (d.type === 'bot_log') {
      pushLog(d.bot_id, { ts: d.ts || '', level: d.level || 'INFO', msg: d.msg || '' });
      return;
    }

    if (d.type === 'bot_log_clear') {
      setLogsByBot((m) => ({ ...m, [d.bot_id]: [] }));
      return;
    }

    if (d.type === 'ctrl_update') {
      const raw = d.data || {};
      /* Бот шлёт значение либо в value, либо в text (см. ZennoPoster.md).
         При слиянии победило бы то, что осталось от манифеста, поэтому
         пришедшее поле гасит второе — иначе карточка застревает на старом. */
      const data = raw.text !== undefined && raw.value === undefined
        ? { ...raw, value: undefined }
        : raw;
      // Обновляем и кеш манифеста, и текущую раскладку: вкладка может быть
      // закрыта, но при возврате значение должно быть свежим.
      setControlsByBot((m) => {
        const list = m[d.bot_id];
        if (!list) return m;
        return { ...m, [d.bot_id]: list.map((c) => (c.id === d.ctrl_id ? { ...c, ...data } : c)) };
      });
      if (selRef.current === d.bot_id) {
        setOrdered((prev) => prev.map((c) => (c.id === d.ctrl_id ? { ...c, ...data } : c)));
      }
      return;
    }

    if (d.type === 'bot_stats') {
      setBots((prev) => prev.map((b) => (b.id === d.bot_id ? { ...b, stats: d.stats } : b)));
      return;
    }

    if (d.type === 'bot_access_update') loadBots();
  }, [loadBots, pushLog, rebuildLayout]);

  const onDeactivate = useCallback(() => {
    if (editRef.current) leaveEdit(() => {});
  }, [leaveEdit]);

  useEffect(() => { registerBridge({ onWS, onDeactivate }); }, [registerBridge, onWS, onDeactivate]);

  /* Ширина сетки меняется на повороте — раскладку пересчитываем под колонки */
  useEffect(() => {
    const onResize = () => setOrdered((prev) => prev.map((c) => ({ ...c, _w: Math.min(c._w || defW(c.type), gridCols()) })));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* ── Отрисовка ──────────────────────────────────────────────────────── */
  const declaredTabs = Array.isArray(bot && bot.tabs) ? bot.tabs : ['stats', 'log'];
  const tabVisible = (id) => !OPTIONAL_TABS.includes(id) || declaredTabs.includes(id);
  const logs = logsByBot[selected] || [];
  const dot = bot ? (bot.status === 'offline' ? 'offline' : (bot.status_dot || bot.status)) : 'offline';
  const pillText = bot
    ? (bot.status !== 'offline' && bot.status_text ? bot.status_text : ({ online: 'Online', idle: 'Idle', offline: 'Offline' }[bot.status] || bot.status))
    : '';

  return (
    <div className={'bt-wrap' + (sidebarOpen ? '' : ' mob-bot-open')}>
      <div className="bt-mob-overlay" onClick={() => setSidebarOpen(false)} />

      <Sidebar
        bots={bots} selected={selected} testOn={testOn}
        onOpen={openBot} onAdd={() => setAddOpen(true)}
        onToggleTest={toggleTest} onRenameGroup={renameGroup}
      />

      <div className="bt-main">
        {!bot && (
          <Empty
            classes={BT_EMPTY}
            icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.25"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" fill="currentColor" /></svg>}
            title="Выберите бота"
            sub="или добавьте нового через кнопку «+»"
          />
        )}

        {bot && (
          <div className="bt-workspace" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="bt-topbar">
              <div className="bt-topbar-left">
                <button className="bt-mob-menu-btn" title="Список ботов" onClick={() => { buzz(8); setSidebarOpen(true); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                </button>
                <div className={'bt-bot-dot ' + dot} />
                <span className="bt-bot-name">{bot.name}</span>
                {bot.version ? <span className="bt-bot-version">v{bot.version}</span> : null}
                <div className={'bt-status-pill ' + dot}>{pillText}</div>
              </div>
              <div className="bt-topbar-right">
                <span className="bt-last-seen">{offline && bot.last_seen ? 'был ' + relTime(bot.last_seen) : ''}</span>
                <button
                  className={'btn-icon-only' + (editMode ? ' btn-icon-only--active' : '')}
                  title={offline ? 'Недоступно офлайн' : 'Редактировать расположение'}
                  disabled={offline} onClick={toggleEdit}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
                {editMode && (
                  <button className="btn-icon-only bt-sort-btn" title="Авто-сортировка" onClick={autoSort}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="21" y2="12" /><line x1="9" y1="18" x2="21" y2="18" /><polyline points="3 15 1 18 3 21" /></svg>
                  </button>
                )}
                <button className="btn-icon-only" title="Настройки" onClick={() => switchTab('settings')}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                </button>
              </div>
            </div>

            <div className="bt-tabs">
              {TABS.filter((t) => tabVisible(t.id)).map((t) => (
                <button
                  key={t.id}
                  className={'bt-tab' + (tab === t.id ? ' active' : '') + (offline && t.id !== 'settings' ? ' bt-tab-disabled' : '')}
                  id={'btTab-' + t.id}
                  onClick={() => switchTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {offline && tab !== 'settings' ? (
              <div className="bt-offline-state" style={{ display: 'flex' }}>
                <div className="bt-offline-ico">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><line x1="12" y1="16" x2="12" y2="16" strokeWidth="2" strokeLinecap="round" /></svg>
                </div>
                <div className="bt-offline-name">{bot.name}</div>
                <div className="bt-offline-seen">
                  {bot.last_seen ? 'Последний раз онлайн: ' + relTime(bot.last_seen) : 'Статус неизвестен'}
                </div>
                {bot.queue_count ? (
                  <div className="bt-offline-queue" style={{ display: 'flex' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    <span>{bot.queue_count} {plural(bot.queue_count, 'команда', 'команды', 'команд')} в очереди</span>
                  </div>
                ) : null}
                <div className="bt-offline-controls-preview">
                  <div className="bt-offline-overlay-label">Управление недоступно — бот офлайн</div>
                  <div className="bt-offline-controls-blur">
                    <div className="bt-ctrl-row">
                      <div className="bt-ctrl-ghost bt-ctrl-ghost--input" />
                      <div className="bt-ctrl-ghost bt-ctrl-ghost--btn" />
                    </div>
                    <div className="bt-ctrl-ghost bt-ctrl-ghost--toggle" />
                    <div className="bt-ctrl-ghost bt-ctrl-ghost--slider" />
                    <div className="bt-ctrl-row">
                      <div className="bt-ctrl-ghost bt-ctrl-ghost--btn-green" />
                      <div className="bt-ctrl-ghost bt-ctrl-ghost--btn-red" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bt-panes" style={{ display: 'block', position: 'relative', flex: 1, overflow: 'hidden' }}>
                <div className={'bt-pane' + (tab === 'controls' ? ' active' : '')}>
                  <Controls
                    controls={ordered} editMode={editMode} locked={locked} send={send}
                    onReorder={reorder} onResize={resize}
                    onTableClear={(ctrl) => {
                      if (locked) { toast('Сначала остановите проект'); return; }
                      setConfirm({
                        title: 'Стереть таблицу?',
                        sub: 'Все данные задания будут удалены из проекта без возможности восстановления.',
                        okLabel: 'Стереть',
                        onDone: (ok) => { if (ok) { send(ctrl.id, 'clear_table', null); toast('Команда на очистку отправлена'); } },
                      });
                    }}
                    onTableEdit={(ctrl) => {
                      if (locked) { toast('Сначала остановите проект'); return; }
                      const cols = (ctrl.edit_cols || []).map((key) => {
                        const col = (ctrl.columns || []).find((c) => (c.key || c) === key) || { key, label: key };
                        return { key, label: col.label || key };
                      });
                      setTableEdit({ ctrlId: ctrl.id, cols, rows: ctrl.rows || [] });
                    }}
                  />
                </div>

                <div className={'bt-pane' + (tab === 'stats' ? ' active' : '')}>
                  <div className="bt-stats-wrap">{tab === 'stats' && <Stats stats={bot.stats} />}</div>
                </div>

                <div className={'bt-pane' + (tab === 'params' ? ' active' : '')}>
                  <div className="bt-params-wrap">
                    <div className="bt-params-empty">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                      <div className="bt-params-empty-title">Параметры проекта</div>
                      <div className="bt-params-empty-sub">Входящие настройки, применяемые при запуске проекта. Скоро здесь можно будет управлять ими прямо из horseoff.</div>
                    </div>
                  </div>
                </div>

                <div className={'bt-pane' + (tab === 'log' ? ' active' : '')}>
                  <LogTab
                    lines={logs} hidden={logHidden} setHidden={setLogHidden}
                    autoScroll={autoScroll} setAutoScroll={setAutoScroll} onClear={clearLog}
                  />
                </div>

                <div className={'bt-pane' + (tab === 'settings' ? ' active' : '')}>
                  <SettingsTab
                    bot={bot} groups={groups} isTest={isTest}
                    onPatch={patchBot} onDelete={deleteBot}
                    onAccessOpen={() => setAccessOpen(true)} onAccessRemove={removeAccess}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <AddBotModal
        open={addOpen} groups={groups}
        onClose={() => setAddOpen(false)}
        onCreated={(b) => setBots((prev) => prev.concat(b))}
      />
      <AccessModal open={accessOpen} bot={bot} onClose={() => setAccessOpen(false)} onGrant={grantAccess} />
      <Confirm
        open={confirm}
        onClose={(ok) => { const c = confirm; setConfirm(null); if (c && c.onDone) c.onDone(ok); }}
      />
      <TableEditor
        open={tableEdit}
        onClose={() => setTableEdit(null)}
        onSave={(payload, count) => {
          send(tableEdit.ctrlId, 'load_table', payload);
          setTableEdit(null);
          toast(count + ' строк отправлено в проект');
        }}
      />
    </div>
  );
}
