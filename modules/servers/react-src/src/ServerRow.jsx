import Sparkline from './Sparkline.jsx';

function RoleTag({ role }) {
  if (role === 'host') return <span className="role-tag host">HOST</span>;
  if (role === 'proxy') return <span className="role-tag proxy">Proxy</span>;
  if (role === 'client') return <span className="role-tag client">Client</span>;
  return <span className="role-tag none">N/S</span>;
}

function barLevel(p) {
  if (p < 60) return 'low';
  if (p < 85) return 'mid';
  return 'high';
}

export default function ServerRow({ s, hist, expanded, canManage, onToggleExpand, onEdit, onDelete, onContextMenu }) {
  const on = s.online !== false;
  const sc = on ? 'online' : 'offline';
  const cpu = s.cpu == null ? '--' : s.cpu;
  const rp = s.ram_used && s.ram_total ? Math.round((s.ram_used / s.ram_total) * 100) : null;
  const up = s.uptime || '--';
  const hu = s.http_proxy !== false && on;
  const su = s.socks_proxy !== false && on;
  const pr = s.proxy_running === true && on;
  const sp = s.speed_mbps != null ? s.speed_mbps : '--';
  const isClient = (s.role === 'client' || s.role === 'proxy') && s.vds_provider;
  const isProxy = s.role === 'proxy';
  const isHost = s.role === 'host';
  const dl = s.days_left;
  const eid = s.ip.replace(/\./g, '-');
  const rowCls =
    'srv-row ' + sc + (isClient ? ' expandable' : '') + (isHost ? ' host-row' : '') + (on ? '' : ' row-offline');

  const cpuLvl = cpu !== '--' && cpu >= 85 ? 'high' : cpu !== '--' && cpu >= 60 ? 'mid' : 'low';
  const du = s.disk_used != null ? s.disk_used : null;
  const dt = s.disk_total != null ? s.disk_total : null;
  const dp = du != null && dt != null && dt > 0 ? Math.round((du / dt) * 100) : null;

  const daysCls = dl != null && dl < 4 ? 'red' : dl != null && dl < 10 ? 'yellow' : 'green';
  const showActions = canManage && !isHost;

  return (
    <>
      <div
        className={rowCls}
        data-srvip={s.ip}
        data-role={s.role || ''}
        onContextMenu={(e) => onContextMenu(e, s.ip)}
        onClick={isClient ? () => onToggleExpand(eid) : undefined}
      >
        <div className="srv-role-cell">
          <span className={'status-dot ' + sc} />
          <RoleTag role={s.role || ''} />
        </div>
        <div className="row-name">
          {s.name}
          <span className="row-name-sub">{up}</span>
        </div>
        <div className="row-ip">{s.ip}</div>
        <div className={'row-metric cpu-cell ' + (cpuLvl === 'high' ? 'metric-high' : cpuLvl === 'mid' ? 'metric-mid' : '')}>
          {on && cpu !== '--' ? <Sparkline values={hist.cpu} cls={'spark-' + cpuLvl} /> : <div className="spark-empty" />}
        </div>
        <div className={'row-metric ' + (rp != null && rp >= 85 ? 'metric-high' : rp != null && rp >= 60 ? 'metric-mid' : '')}>
          {rp != null ? rp : '--'}
          {rp != null && <span className="unit">%</span>}
          {rp != null && (
            <div className="inline-bar">
              <div className={'inline-bar-fill ' + barLevel(rp)} style={{ width: rp + '%' }} />
            </div>
          )}
        </div>
        <div className="row-metric">
          {sp}
          {sp !== '--' && <span className="unit">Mb</span>}
        </div>
        {isProxy ? (
          <div className="prx-row">
            <span className={'prx-chip ' + (hu ? 'up' : 'down')}>HTTP</span>
            <span className={'prx-chip ' + (su ? 'up' : 'down')}>SOCKS</span>
            <span className={'prx-chip ' + (pr ? 'up' : 'down')}>3PX</span>
          </div>
        ) : (
          <div className="row-metric">
            {du != null && dt != null ? (
              <>
                {du}
                <span className="unit">/</span>
                {dt}
                <span className="unit">GB</span>
              </>
            ) : (
              '--'
            )}
            {dp != null && (
              <div className="inline-bar">
                <div className={'inline-bar-fill ' + barLevel(dp)} style={{ width: dp + '%' }} />
              </div>
            )}
          </div>
        )}
        {isClient && dl != null ? (
          <div style={{ textAlign: 'center' }}>
            <span className={'days-tag ' + daysCls + (dl < 4 ? ' days-blink' : '')}>{dl}д</span>
          </div>
        ) : (
          <div />
        )}
        {showActions ? (
          <div className="row-actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn-icon" title="Edit" onClick={() => onEdit(s.ip)}>
              <span className="ico" style={{ width: 13, height: 13, WebkitMaskImage: 'url(/svg/pencil.svg)', maskImage: 'url(/svg/pencil.svg)' }} />
            </button>
            <button className="btn-icon del" title="Delete" onClick={() => onDelete(s.ip, s.name)}>
              <span className="ico" style={{ width: 13, height: 13, WebkitMaskImage: 'url(/svg/trash.svg)', maskImage: 'url(/svg/trash.svg)' }} />
            </button>
          </div>
        ) : (
          <div />
        )}

        {/* Мобильная карточка. Живёт в том же .srv-row: на десктопе скрыта,
            на узком экране прячутся ячейки таблицы и остаётся только она.
            Раньше здесь было три отдельных блока (mob-top / пустой mob-ip /
            mob-info на 4 колонки), из-за чего на телефоне восемь подписей
            вида «HTTP UP» лезли в сетку 4×N и читались как каша. */}
        <div className="mob-card">
          <div className="mob-head">
            <span className={'status-dot ' + sc} />
            <div className="mob-id">
              <span className="mob-name">{s.name}</span>
              <span className="mob-ip">
                {s.ip}
                {on && up !== '--' && <span className="mob-up"> · {up}</span>}
              </span>
            </div>
            <RoleTag role={s.role || ''} />
            {showActions && (
              <div className="mob-actions" onClick={(e) => e.stopPropagation()}>
                <button className="mob-btn" title="Edit" onClick={() => onEdit(s.ip)}>
                  <span className="ico ico-16 ico-pencil" />
                </button>
                <button className="mob-btn del" title="Delete" onClick={() => onDelete(s.ip, s.name)}>
                  <span className="ico ico-16 ico-trash" />
                </button>
              </div>
            )}
          </div>

          <div className="mob-stats">
            <div className="mob-stat">
              <span className="mob-stat-l">CPU</span>
              <span className={'mob-stat-v ' + (cpu !== '--' && cpu >= 85 ? 'metric-high' : cpu !== '--' && cpu >= 60 ? 'metric-mid' : '')}>
                {cpu}
                {cpu !== '--' && <i className="unit">%</i>}
              </span>
              <span className="mob-bar">
                <i className={'mob-bar-fill ' + (cpu === '--' ? 'none' : barLevel(cpu))} style={{ width: (cpu === '--' ? 0 : cpu) + '%' }} />
              </span>
            </div>
            <div className="mob-stat">
              <span className="mob-stat-l">RAM</span>
              <span className={'mob-stat-v ' + (rp != null && rp >= 85 ? 'metric-high' : rp != null && rp >= 60 ? 'metric-mid' : '')}>
                {rp != null ? rp : '--'}
                {rp != null && <i className="unit">%</i>}
              </span>
              <span className="mob-bar">
                <i className={'mob-bar-fill ' + (rp == null ? 'none' : barLevel(rp))} style={{ width: (rp == null ? 0 : rp) + '%' }} />
              </span>
            </div>
            <div className="mob-stat">
              <span className="mob-stat-l">{isProxy ? 'Скорость' : 'Диск'}</span>
              {isProxy ? (
                <span className="mob-stat-v">
                  {sp}
                  {sp !== '--' && <i className="unit">Mb</i>}
                </span>
              ) : (
                <span className="mob-stat-v">
                  {du != null && dt != null ? du : '--'}
                  {du != null && dt != null && <i className="unit">/{dt} GB</i>}
                </span>
              )}
              <span className="mob-bar">
                <i className={'mob-bar-fill ' + (isProxy || dp == null ? 'none' : barLevel(dp))} style={{ width: (isProxy || dp == null ? 0 : dp) + '%' }} />
              </span>
            </div>
          </div>

          <div className="mob-foot">
            {isProxy && (
              <span className="prx-row">
                <span className={'prx-chip ' + (hu ? 'up' : 'down')}>HTTP</span>
                <span className={'prx-chip ' + (su ? 'up' : 'down')}>SOCKS</span>
                <span className={'prx-chip ' + (pr ? 'up' : 'down')}>3PX</span>
              </span>
            )}
            {!isProxy && sp !== '--' && <span className="mob-meta">{sp} Mb/s</span>}
            {isClient && dl != null && (
              <span className={'days-tag ' + daysCls + (dl < 4 ? ' days-blink' : '')} title="Дней оплачено">{dl}д</span>
            )}
            {isClient && <span className={'mob-chevron ico ico-14 ico-chevron-down' + (expanded ? ' open' : '')} />}
          </div>
        </div>
      </div>
      {isClient && (
        <div className={'srv-expand' + (expanded ? ' open' : '')} id={'expand-' + eid}>
          {s.vds_info ? (
            <div className="srv-expand-grid">
              <div className="srv-expand-item">
                <span className="srv-expand-label">ID сервера</span>
                <span className="srv-expand-value">{s.vds_info.virtual_server_id || '--'}</span>
              </div>
              <div className="srv-expand-item">
                <span className="srv-expand-label">Ядра</span>
                <span className="srv-expand-value">{s.vds_info.cpu || '--'} vCPU</span>
              </div>
              <div className="srv-expand-item">
                <span className="srv-expand-label">ОЗУ</span>
                <span className="srv-expand-value">{s.vds_info.ram || '--'} GB</span>
              </div>
              <div className="srv-expand-item">
                <span className="srv-expand-label">Диск</span>
                <span className="srv-expand-value">{s.vds_info.drive || '--'} GB</span>
              </div>
              <div className="srv-expand-item">
                <span className="srv-expand-label">Оплачен до</span>
                <span className="srv-expand-value">{s.vds_info.paid_till || '--'}</span>
              </div>
              <div className="srv-expand-item">
                <span className="srv-expand-label">Дней осталось</span>
                <span className="srv-expand-value">{s.vds_info.days_left != null ? s.vds_info.days_left + 'd' : '--'}</span>
              </div>
              <div className="srv-expand-item">
                <span className="srv-expand-label">Стоимость</span>
                <span className="srv-expand-value" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 15 }}>
                  {s.vds_info.cost_rub != null ? s.vds_info.cost_rub + ' ₽' : '--'}
                </span>
              </div>
            </div>
          ) : (
            <div className="no-api-hint">API-ключ не установлен. Настройки → API VDS.</div>
          )}
        </div>
      )}
    </>
  );
}
