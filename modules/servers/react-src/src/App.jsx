import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import ServerRow from './ServerRow.jsx';
import ContextMenu from './ContextMenu.jsx';
import CreateModal from './CreateModal.jsx';
import AddModal from './AddModal.jsx';
import EditModal from './EditModal.jsx';
import DeleteModal from './DeleteModal.jsx';
import ProgressModal from './ProgressModal.jsx';
import ResultModal from './ResultModal.jsx';
import SettingsModal from './SettingsModal.jsx';
import './servers.css';

const SORT_ORDER = { host: 0, proxy: 1, client: 2 };
const HIST_MAX = 20;
const ROLE_LABEL = { proxy: 'Прокси', client: 'Диск' };

function sortServers(list) {
  return [...list].sort((a, b) => {
    const ra = SORT_ORDER[a.role] !== undefined ? SORT_ORDER[a.role] : 3;
    const rb = SORT_ORDER[b.role] !== undefined ? SORT_ORDER[b.role] : 3;
    return ra - rb;
  });
}

export default function App({ registerHandlers }) {
  const [servers, setServers] = useState([]);
  const [firstLoad, setFirstLoad] = useState(true);
  const [hasData, setHasData] = useState(false); // true once any onServersUpdate/status fetch has landed (even empty)
  const [filters, setFilters] = useState({ host: true, proxy: true, client: true });
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [currentInterval, setCurrentInterval] = useState(30000);
  const [clock, setClock] = useState('--:--:--');
  const [spinning, setSpinning] = useState(false);
  const [flashTick, setFlashTick] = useState(0);
  const [modal, setModal] = useState(null); // {type:'create'|'add'|'edit'|'delete'|'progress'|'result'|'settings', ...}
  const [provision, setProvision] = useState({ steps: null, error: null });
  const [apiKeyStatus, setApiKeyStatus] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  const historyRef = useRef({}); // ip -> {cpu:[], ram:[]}
  const wsFallbackRef = useRef(null);
  const provPollTimerRef = useRef(null);
  const provAbortRef = useRef(0); // bump to invalidate in-flight poll chains
  const listRef = useRef(null);
  const liveDotRef = useRef(null);
  const metricRefs = useRef({});

  const Shell = window.Shell;
  const role = Shell?.user?.role;
  const canManage = role === 'immortal' || role === 'arcana';

  const addHistory = useCallback((ip, cpu, ram) => {
    const h = historyRef.current[ip] || (historyRef.current[ip] = { cpu: [], ram: [] });
    if (cpu != null) { h.cpu.push(cpu); if (h.cpu.length > HIST_MAX) h.cpu.shift(); }
    if (ram != null) { h.ram.push(ram); if (h.ram.length > HIST_MAX) h.ram.shift(); }
  }, []);

  const applyData = useCallback((data) => {
    data.forEach((s) => {
      if (s.cpu_hist || s.ram_hist) {
        historyRef.current[s.ip] = { cpu: (s.cpu_hist || []).slice(), ram: (s.ram_hist || []).slice() };
      } else {
        const rp = s.ram_used && s.ram_total ? Math.round((s.ram_used / s.ram_total) * 100) : null;
        addHistory(s.ip, s.cpu != null ? s.cpu : null, rp);
      }
    });
    setServers(data);
    setHasData(true);
    if (data.length > 0) setFirstLoad(false);
    setFlashTick((t) => t + 1);
  }, [addHistory]);

  // ── Mount: register WS handlers, clock, initial fetch ──────────────────
  useEffect(() => {
    registerHandlers({
      onServersUpdate: (data) => { clearTimeout(wsFallbackRef.current); applyData(data); },
      onSettingsUpdate: (settings) => { if (settings && settings.poll_interval) setCurrentInterval(settings.poll_interval * 1000); },
    });

    const tick = () => setClock(new Date().toLocaleTimeString('ru-RU'));
    tick();
    const clockTimer = setInterval(tick, 1000);

    const firstLoadSafety = setTimeout(() => setFirstLoad(false), 5000);

    let cancelled = false;
    function waitAndRequest() {
      if (cancelled) return;
      if (Shell?.wsReady) {
        Shell.wsSend({ type: 'servers_request' });
        wsFallbackRef.current = setTimeout(() => {
          api.getStatus().then((data) => { if (data) applyData(data); });
        }, 3000);
      } else {
        setTimeout(waitAndRequest, 300);
      }
    }
    waitAndRequest();

    return () => {
      cancelled = true;
      clearInterval(clockTimer);
      clearTimeout(firstLoadSafety);
      clearTimeout(wsFallbackRef.current);
      clearTimeout(provPollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flash metric cards + live indicator on every update (CSS animation restart)
  useEffect(() => {
    if (flashTick === 0) return;
    ['sTotal', 'sOnline', 'sOffline', 'sCpu'].forEach((id) => {
      const el = metricRefs.current[id];
      if (!el) return;
      el.classList.remove('srv-data-updated');
      void el.offsetWidth;
      el.classList.add('srv-data-updated');
    });
    const dot = liveDotRef.current;
    if (dot) {
      dot.classList.remove('srv-live-flash');
      void dot.offsetWidth;
      dot.classList.add('srv-live-flash');
    }
  }, [flashTick]);

  // Close context menu on any outside click
  useEffect(() => {
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // Long-press to open context menu on mobile (touch), matches original thresholds
  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    let timer = null, startX = 0, startY = 0, moved = false;
    const onStart = (e) => {
      const row = e.target.closest('.srv-row');
      if (!row) return;
      moved = false;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      timer = setTimeout(() => {
        if (moved) return;
        if (navigator.vibrate) navigator.vibrate(30);
        const ip = row.getAttribute('data-srvip');
        if (ip) openContextMenuAt(startX, startY, ip);
      }, 500);
    };
    const onMove = (e) => {
      if (!timer) return;
      const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { moved = true; clearTimeout(timer); timer = null; }
    };
    const onEnd = () => { clearTimeout(timer); timer = null; };
    list.addEventListener('touchstart', onStart, { passive: true });
    list.addEventListener('touchmove', onMove, { passive: true });
    list.addEventListener('touchend', onEnd, { passive: true });
    list.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      list.removeEventListener('touchstart', onStart);
      list.removeEventListener('touchmove', onMove);
      list.removeEventListener('touchend', onEnd);
      list.removeEventListener('touchcancel', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers]);

  function openContextMenuAt(clientX, clientY, ip) {
    let x = clientX, y = clientY;
    if (x + 200 > window.innerWidth) x = window.innerWidth - 208;
    if (y + 100 > window.innerHeight) y = y - 100;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    setContextMenu({ x, y, ip });
  }

  function handleContextMenu(e, ip) {
    e.preventDefault();
    e.stopPropagation();
    openContextMenuAt(e.clientX, e.clientY, ip);
  }

  function toggleExpand(eid) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid); else next.add(eid);
      return next;
    });
  }

  function togglePill(r) {
    setFilters((prev) => ({ ...prev, [r]: !prev[r] }));
  }

  function loadData() {
    setSpinning(true);
    Shell.wsSend({ type: 'servers_request' });
    setTimeout(() => setSpinning(false), 1000);
  }

  function setInterval_(v) {
    if (!canManage) { Shell.toast('Нет доступа', 'error'); return; }
    setCurrentInterval(v);
    if (Shell.wsReady) Shell.wsSend({ type: 'set_interval', interval: v / 1000 });
    else api.saveSettings(v / 1000);
    Shell.toast(v / 1000 + 's');
  }

  // ── Create / Add / Edit / Delete ────────────────────────────────────────
  function startProvisionPoll(ip) {
    provAbortRef.current += 1;
    const myGen = provAbortRef.current;
    setProvision({ steps: null, error: null });
    setModal({ type: 'progress' });
    const poll = () => {
      api.getProvisionStatus(ip).then((d) => {
        if (myGen !== provAbortRef.current) return; // superseded by a newer provision run
        if (!d) { provPollTimerRef.current = setTimeout(poll, 1000); return; }
        setProvision({ steps: d.steps || null, error: d.error || null });
        if (d.done) {
          if (d.error) {
            // error branch: stop polling, leave modal open with close button visible
            return;
          }
          setTimeout(() => {
            setModal(null);
            if (d.result && d.result.http_proxy) setModal({ type: 'result', result: d.result });
            loadData();
          }, 800);
        } else {
          provPollTimerRef.current = setTimeout(poll, 1000);
        }
      });
    };
    poll();
  }

  async function submitCreate(body, ip) {
    const d = await api.createServer(body);
    if (d && d.status === 'provisioning') {
      startProvisionPoll(ip);
    } else {
      Shell.toast(d?.error || 'Ошибка', 'error');
    }
  }

  async function submitAdd(body, name, ip) {
    const d = await api.addServer(body);
    if (d && d.status === 'provisioning') {
      startProvisionPoll(ip);
    } else if (d && d.status === 'ok') {
      Shell.toast(name + ' добавлен');
      setModal(null);
      loadData();
    } else {
      Shell.toast(d?.error || 'Ошибка', 'error');
    }
  }

  async function submitEdit(ip, body) {
    const d = await api.updateServer(ip, body);
    if (d && d.status === 'ok') {
      Shell.toast('Сервер обновлён');
      setModal(null);
      loadData();
    } else {
      Shell.toast(d?.error || 'Ошибка', 'error');
    }
  }

  function openEdit(ip) {
    const s = servers.find((x) => x.ip === ip);
    if (!s) return;
    if (s.role === 'host') { Shell.toast('Host сервер нельзя редактировать'); return; }
    setModal({ type: 'edit', server: s });
  }

  function openDelete(ip, name) {
    setModal({ type: 'delete', ip, name });
  }

  async function confirmDelete() {
    if (!modal || modal.type !== 'delete') return;
    const d = await api.deleteServer(modal.ip);
    if (d && d.status === 'ok') {
      Shell.toast('Сервер удалён');
      setModal(null);
      loadData();
    } else {
      Shell.toast(d?.error || 'Ошибка', 'error');
    }
  }

  function openSettings() {
    setModal({ type: 'settings' });
    api.getApiKeyStatus().then((d) => {
      if (!d) return;
      setApiKeyStatus({ has_key: !!(d.has_key && d.has_key.ruvds), value: (d.keys && d.keys.ruvds) || '' });
    });
  }

  async function saveApiKey(key) {
    const d = await api.saveApiKey('ruvds', key.trim());
    if (d && d.status === 'ok') {
      Shell.toast(key.trim() ? 'API-ключ сохранён' : 'API-ключ удалён');
      const fresh = await api.getApiKeyStatus();
      if (fresh) setApiKeyStatus({ has_key: !!(fresh.has_key && fresh.has_key.ruvds), value: (fresh.keys && fresh.keys.ruvds) || '' });
    } else {
      Shell.toast('Ошибка', 'error');
    }
  }

  // ── Context menu actions ────────────────────────────────────────────────
  function buildStatusText(s) {
    const on = s.online !== false;
    const status = on ? '🟢 Online' : '🔴 Offline';
    const cpu = s.cpu != null ? s.cpu + '%' : '—';
    const rp = s.ram_used && s.ram_total ? Math.round((s.ram_used / s.ram_total) * 100) + '%' : '—';
    const sp = s.speed_mbps != null ? s.speed_mbps + ' Mb/s' : '—';
    const roleLabel = s.role ? s.role.toUpperCase() : '—';
    let text = '📡 ' + s.name + ' [' + roleLabel + ']\n━━━━━━━━━━━━━━\n' + status + '  ·  ' + s.ip + '\n⚡ CPU: ' + cpu + '  ·  RAM: ' + rp + '\n🌐 Speed: ' + sp;
    if (s.role === 'proxy') {
      const http = s.http_proxy !== false && on ? '✅' : '❌';
      const socks = s.socks_proxy !== false && on ? '✅' : '❌';
      const proxy = s.proxy_running === true && on ? '✅ RUN' : '❌ STOP';
      text += '\nHTTP: ' + http + '  ·  SOCKS5: ' + socks + '\n3proxy: ' + proxy;
    }
    if (s.disk_used != null && s.disk_total != null) text += '\n💾 Диск: ' + s.disk_used + '/' + s.disk_total + ' GB';
    if (s.uptime && on) text += '\n⏱ Uptime: ' + s.uptime;
    if (s.days_left != null) text += '\n📅 Дней: ' + s.days_left;
    return text;
  }

  function copyText(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    else {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    Shell.toast('Скопировано');
  }

  function ctxCopy(ip) {
    const s = servers.find((x) => x.ip === ip);
    if (!s) return;
    copyText(buildStatusText(s));
    setContextMenu(null);
  }

  function ctxForward(ip) {
    const s = servers.find((x) => x.ip === ip);
    if (!s) { Shell.toast('Сервер не найден', 'error'); setContextMenu(null); return; }
    if (window.Messenger) window.Messenger.startForwardStatus(buildStatusText(s));
    setContextMenu(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const visible = sortServers(servers.filter((s) => filters[s.role] !== false));
  const on = servers.filter((s) => s.online !== false).length;
  const off = servers.length - on;
  const withCpu = servers.filter((s) => s.online !== false && s.cpu != null);
  const avgCpu = withCpu.length > 0 ? Math.round(withCpu.reduce((a, s) => a + s.cpu, 0) / withCpu.length) : '--';
  const roleCounts = { host: 0, proxy: 0, client: 0 };
  servers.forEach((s) => { if (roleCounts[s.role] !== undefined) roleCounts[s.role]++; });

  let lastRole = null;
  const rows = [];
  visible.forEach((s) => {
    const r = s.role || '';
    if (r !== lastRole) {
      rows.push(
        <div className="srv-table-head" key={'head-' + r}>
          <div>Role</div><div>Сервер</div><div>IP</div>
          <div>CPU</div><div>RAM</div><div>Скорость</div>
          <div>{ROLE_LABEL[r] || 'Прокси'}</div><div>Дней</div><div></div>
        </div>
      );
      lastRole = r;
    }
    const eid = s.ip.replace(/\./g, '-');
    rows.push(
      <ServerRow
        key={s.ip}
        s={s}
        hist={historyRef.current[s.ip] || { cpu: [], ram: [] }}
        expanded={expandedIds.has(eid)}
        canManage={canManage}
        onToggleExpand={toggleExpand}
        onEdit={openEdit}
        onDelete={openDelete}
        onContextMenu={handleContextMenu}
      />
    );
  });

  return (
    <div className="srv-wrap">
      <div className="srv-header">
        <div className="srv-header-row1">
          <h2>Серверы</h2>
          <div className="srv-actions">
            {canManage && (
              <>
                <button className="btn btn-primary srv-add-btn" title="Provisioning нового сервера" onClick={() => setModal({ type: 'create' })}>Создать</button>
                <button className="btn btn-secondary srv-add-btn" title="Добавить существующий сервер по SSH" onClick={() => setModal({ type: 'add' })}>Добавить</button>
              </>
            )}
            <button className="btn-icon-only" title="Обновить данные" onClick={loadData} disabled={spinning}>
              <span className={'ico ico-16 ico-refresh' + (spinning ? ' spinning' : '')} />
            </button>
            {canManage && (
              <button className="btn-icon-only srv-settings-btn" title="Настройки" onClick={openSettings}>
                <span className="ico ico-16 ico-settings" />
              </button>
            )}
            <div className="srv-clock-group">
              <span className="srv-clock">{clock}</span>
              <span className="srv-live-dot" ref={liveDotRef} title="Live" />
            </div>
          </div>
        </div>
        <div className="srv-summary">
          <div className="srv-metric-tray">
            <div className="srv-metric-tile">
              <span className="srv-metric-label">Серверов</span>
              <b className="srv-metric-value" ref={(el) => (metricRefs.current.sTotal = el)}>{hasData ? servers.length : '--'}</b>
            </div>
            <div className="srv-metric-tile">
              <span className="srv-metric-label">Онлайн</span>
              <b className="srv-metric-value green" ref={(el) => (metricRefs.current.sOnline = el)}>{hasData ? on : '--'}</b>
            </div>
            <div className="srv-metric-tile">
              <span className="srv-metric-label">Оффлайн</span>
              <b className="srv-metric-value red" ref={(el) => (metricRefs.current.sOffline = el)}>{hasData ? off : '--'}</b>
            </div>
            <div className="srv-metric-tile">
              <span className="srv-metric-label">Ср. CPU</span>
              <b className="srv-metric-value" ref={(el) => (metricRefs.current.sCpu = el)}>{avgCpu}{avgCpu !== '--' ? '%' : ''}</b>
            </div>
          </div>
          <div className="srv-badge-tray">
            {['host', 'proxy', 'client'].map((r) => (
              <button key={r} className={'srv-pill ' + r + (filters[r] ? ' active' : '')} data-role={r} onClick={() => togglePill(r)}>
                <span className="srv-pill-dot" />{r.toUpperCase()}<span className="srv-pill-count">{roleCounts[r]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div id="srvList" ref={listRef}>
        {!servers.length && firstLoad ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div className="srv-skel" key={i}>
              <div className="skel-dot" /><div className="skel-tag" />
              <div className="skel-name"><div className="skel-line w60" /><div className="skel-line w40 skel-sub" /></div>
              <div className="skel-line w80" /><div className="skel-line w50" /><div className="skel-line w50" />
              <div className="skel-line w60" /><div className="skel-line w70" />
              <div className="skel-line w30" /><div className="skel-line w20" />
            </div>
          ))
        ) : servers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📡</div>
            <h3 style={{ fontSize: 18, color: 'var(--text)', marginBottom: 6 }}>Нет серверов</h3>
            <p>Добавьте первый сервер</p>
          </div>
        ) : (
          rows
        )}
      </div>
      <div className="srv-footer"><span className="app-version" /> · Created by k4nev with the support of mysika</div>

      <CreateModal open={modal?.type === 'create'} onClose={() => setModal(null)} onSubmit={submitCreate} />
      <AddModal open={modal?.type === 'add'} onClose={() => setModal(null)} onSubmit={submitAdd} />
      <EditModal open={modal?.type === 'edit'} server={modal?.type === 'edit' ? modal.server : null} onClose={() => setModal(null)} onSubmit={submitEdit} />
      <DeleteModal open={modal?.type === 'delete'} target={modal?.type === 'delete' ? modal : null} onClose={() => setModal(null)} onConfirm={confirmDelete} />
      <ProgressModal open={modal?.type === 'progress'} steps={provision.steps} error={provision.error} onClose={() => setModal(null)} />
      <ResultModal open={modal?.type === 'result'} result={modal?.type === 'result' ? modal.result : null} onClose={() => setModal(null)} />
      <SettingsModal
        open={modal?.type === 'settings'}
        onClose={() => setModal(null)}
        currentInterval={currentInterval}
        onSetInterval={setInterval_}
        canManage={canManage}
        apiKeyStatus={apiKeyStatus}
        onSaveApiKey={saveApiKey}
      />
      <ContextMenu menu={contextMenu} onForward={ctxForward} onCopy={ctxCopy} />
    </div>
  );
}
