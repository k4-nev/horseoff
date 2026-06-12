const Servers = {
  refreshInterval: null,
  currentInterval: 30000,
  deleteTarget: null,
  editMode: false,
  firstLoad: true,

  init() {
    this.startClock();
    this.loadApiKeyStatus();
    if (Shell.user && Shell.user.role === 'common') {
      document.querySelectorAll('.srv-add-btn').forEach(function(b){ b.style.display = 'none'; });
      var sb = document.querySelector('.srv-settings-btn');
      if (sb) sb.style.display = 'none';
    }
    setTimeout(() => { this.firstLoad = false; }, 5000);
    this.buildIntervalGroup();
    // Request server data via WS
    this._waitAndRequest();
  },

  _waitAndRequest() {
    if (Shell.wsReady) {
      Shell.wsSend({type:'servers_request'});
      // Fallback: if WS doesn't deliver in 3s, use HTTP
      var self = this;
      this._wsFallback = setTimeout(function() {
        if (self.firstLoad) {
          Shell.api('/api/mod/servers/status').then(function(data) {
            if (data) self._applyData(data);
          });
        }
      }, 3000);
    } else {
      setTimeout(() => this._waitAndRequest(), 300);
    }
  },

  onServersUpdate(data) {
    clearTimeout(this._wsFallback);
    this._applyData(data);
  },

  onSettingsUpdate(settings) {
    if (settings && settings.poll_interval) {
      this.currentInterval = settings.poll_interval * 1000;
      this._highlightInterval();
    }
  },

  // Settings arrive via WS on connect (onSettingsUpdate)

  // Sort: host > proxy > client
  _sortOrder: {host:0, proxy:1, client:2},

  sortServers(data) {
    var order = this._sortOrder;
    return data.sort(function(a, b) {
      var ra = order[a.role] !== undefined ? order[a.role] : 3;
      var rb = order[b.role] !== undefined ? order[b.role] : 3;
      return ra - rb;
    });
  },

  togglePill(btn) {
    btn.classList.toggle('active');
    var role = btn.getAttribute('data-role');
    var isActive = btn.classList.contains('active');
    // Sync both desktop and mobile pill sets
    document.querySelectorAll('.srv-pill[data-role="' + role + '"]').forEach(function(p) {
      p.classList.toggle('active', isActive);
    });
    this.applyFilters();
  },

  applyFilters() {
    var show = {};
    document.querySelectorAll('.srv-pill').forEach(function(p) {
      show[p.getAttribute('data-role')] = p.classList.contains('active');
    });
    document.querySelectorAll('.srv-row').forEach(function(row) {
      var role = row.getAttribute('data-role') || '';
      row.classList.toggle('srv-hidden', show[role] === false);
    });
    document.querySelectorAll('.srv-table-head').forEach(function(head) {
      var next = head.nextElementSibling;
      var hasVisible = false;
      while (next && !next.classList.contains('srv-table-head')) {
        if (next.classList.contains('srv-row') && !next.classList.contains('srv-hidden')) hasVisible = true;
        next = next.nextElementSibling;
      }
      head.style.display = hasVisible ? '' : 'none';
    });
    document.querySelectorAll('.srv-expand').forEach(function(el) {
      var prev = el.previousElementSibling;
      if (prev && prev.classList.contains('srv-hidden')) el.style.display = 'none';
      else el.style.display = '';
    });
  },

  onAddRoleChange() {
    var role = document.getElementById('sa-role').value;
    document.getElementById('sa-ports-group').style.display = role === 'client' ? 'none' : 'block';
  },

  onEditRoleChange() {
    var role = document.getElementById('sf-role').value;
    document.getElementById('sf-ports-group').style.display = role === 'client' ? 'none' : 'block';
  },

  _categoryHeader(role) {
    if (role === 'proxy') {
      return '<div class="srv-table-head"><div></div><div>Role</div><div>Сервер</div><div>IP</div>'
        + '<div style="text-align:center">CPU</div><div style="text-align:center">RAM</div>'
        + '<div style="text-align:center">Скорость</div><div style="text-align:center">HTTP</div>'
        + '<div style="text-align:center">SOCKS5</div><div style="text-align:center">3proxy</div>'
        + '<div style="text-align:center">Дней</div><div></div></div>';
    } else {
      // host, client
      return '<div class="srv-table-head"><div></div><div>Role</div><div>Сервер</div><div>IP</div>'
        + '<div style="text-align:center">CPU</div><div style="text-align:center">RAM</div>'
        + '<div style="text-align:center">Скорость</div><div style="text-align:center;grid-column:span 3">Память</div>'
        + '<div style="text-align:center">Дней</div><div></div></div>';
    }
  },

  startClock() {
    var el = document.getElementById('srvClock');
    if (!el) return;
    var tick = () => { if (document.getElementById('srvClock')) el.textContent = new Date().toLocaleTimeString('ru-RU'); };
    tick(); setInterval(tick, 1000);
  },

  // Auto-refresh removed — server pushes updates via WS

  buildIntervalGroup() {
    var el = document.getElementById('srvIntervalGroup');
    if (!el) return;
    el.innerHTML = '';
    var self = this;
    [15000,30000,45000,60000].forEach(v => {
      var d = document.createElement('div');
      d.className = 'btn btn-secondary srv-interval-btn';
      d.dataset.interval = v;
      d.style.cssText = 'padding:6px 12px;font-size:12px;font-family:JetBrains Mono,monospace;cursor:pointer';
      d.textContent = (v/1000) + 's';
      d.onclick = () => {
        if (Shell.user && Shell.user.role === 'common') { Shell.toast('Нет доступа', 'error'); return; }
        self.currentInterval = v;
        self._highlightInterval();
        if (Shell.wsReady) {
          Shell.wsSend({type:'set_interval', interval: v / 1000});
        } else {
          Shell.api('/api/settings', {method:'POST', body:JSON.stringify({poll_interval: v / 1000})});
        }
        Shell.toast((v/1000) + 's');
      };
      el.appendChild(d);
    });
    this._highlightInterval();
  },

  _highlightInterval() {
    document.querySelectorAll('.srv-interval-btn').forEach(d => {
      var v = parseInt(d.dataset.interval);
      if (v === this.currentInterval) {
        d.style.cssText = 'padding:6px 12px;font-size:12px;font-family:JetBrains Mono,monospace;cursor:pointer;background:var(--accent-glow);border-color:var(--accent);color:var(--accent);font-weight:700';
      } else {
        d.style.cssText = 'padding:6px 12px;font-size:12px;font-family:JetBrains Mono,monospace;cursor:pointer';
      }
    });
  },

  // DATA — all via WS
  async loadData() {
    var btn = document.getElementById('srvRefreshBtn');
    if (btn) btn.disabled = true;
    Shell.wsSend({type:'servers_request'});
    setTimeout(function(){ if (btn) btn.disabled = false; }, 1000);
  },

  _applyData(data) {
    var expanded = [];
    document.querySelectorAll('.srv-expand.open').forEach(el => expanded.push(el.id));
    var on = data.filter(s => s.online !== false).length;
    var off = data.length - on;
    var ca = data.filter(s => s.online !== false && s.cpu != null);
    var avg = ca.length > 0 ? Math.round(ca.reduce((a,s) => a + s.cpu, 0) / ca.length) : '--';
    document.getElementById('sTotal').textContent = data.length;
    document.getElementById('sOnline').textContent = on;
    document.getElementById('sOffline').textContent = off;
    document.getElementById('sCpu').textContent = avg + (avg !== '--' ? '%' : '');
    var list = document.getElementById('srvList');
    if (data.length === 0 && this.firstLoad) {
      list.innerHTML = '<div class="loading"><div class="spinner"></div>Запускаю программу...</div>';
    } else if (data.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:60px 0;color:var(--text-dim)"><div style="font-size:40px;margin-bottom:12px;opacity:0.5">📡</div><h3 style="font-size:18px;color:var(--text);margin-bottom:6px">Нет серверов</h3><p>Добавьте первый сервер</p></div>';
    } else {
      this.firstLoad = false;
      data = this.sortServers(data);
      var html = '';
      var lastRole = null;
      data.forEach(function(s) {
        var r = s.role || '';
        if (r !== lastRole) { html += Servers._categoryHeader(r); lastRole = r; }
        html += Servers.renderRow(s);
      });
      list.innerHTML = html;
      this.applyFilters();
      expanded.forEach(id => { var el = document.getElementById(id); if (el) el.classList.add('open'); });
    }
  },

  // RENDER
  barLevel(p) { if (p < 60) return 'low'; if (p < 85) return 'mid'; return 'high'; },

  _findRowIp(rowEl) {
    // Find IP from row's data attribute
    return rowEl.getAttribute('data-srvip') || null;
  },

  roleTag(r) {
    if (r === 'host') return '<span class="role-tag host">HOST</span>';
    if (r === 'proxy') return '<span class="role-tag proxy">Proxy</span>';
    if (r === 'client') return '<span class="role-tag client">Client</span>';
    return '<span class="role-tag none">N/S</span>';
  },

  renderRow(s) {
    var on = s.online !== false, sc = on ? 'online' : 'offline';
    var cpu = s.cpu == null ? '--' : s.cpu;
    var rp = (s.ram_used && s.ram_total) ? Math.round(s.ram_used / s.ram_total * 100) : null;
    var up = s.uptime || '--';
    var hu = s.http_proxy !== false && on, su = s.socks_proxy !== false && on;
    var pr = s.proxy_running === true && on;
    var sp = s.speed_mbps != null ? s.speed_mbps : '--';
    var sn = s.name.replace(/'/g, "&#39;");
    var isClient = (s.role === 'client' || s.role === 'proxy') && s.vds_provider;
    var isProxy = s.role === 'proxy';
    var dl = s.days_left;
    var eid = s.ip.replace(/\./g, '-');
    var isUser = Shell.user && Shell.user.role === 'common';

    var daysCol = '<div></div>';
    if (isClient && dl != null) {
      var dc = 'green'; if (dl < 10) dc = 'yellow'; if (dl < 4) dc = 'red';
      daysCol = '<div style="text-align:center"><span class="days-tag ' + dc + '">' + dl + 'д</span></div>';
    }

    var expandHtml = '';
    if (isClient) {
      var vi = s.vds_info;
      if (vi) {
        expandHtml = '<div class="srv-expand" id="expand-' + eid + '"><div class="srv-expand-grid">'
          + '<div class="srv-expand-item"><span class="srv-expand-label">ID сервера</span><span class="srv-expand-value">' + (vi.virtual_server_id || '--') + '</span></div>'
          + '<div class="srv-expand-item"><span class="srv-expand-label">Ядра</span><span class="srv-expand-value">' + (vi.cpu || '--') + ' vCPU</span></div>'
          + '<div class="srv-expand-item"><span class="srv-expand-label">ОЗУ</span><span class="srv-expand-value">' + (vi.ram || '--') + ' GB</span></div>'
          + '<div class="srv-expand-item"><span class="srv-expand-label">Диск</span><span class="srv-expand-value">' + (vi.drive || '--') + ' GB</span></div>'
          + '<div class="srv-expand-item"><span class="srv-expand-label">Оплачен до</span><span class="srv-expand-value">' + (vi.paid_till || '--') + '</span></div>'
          + '<div class="srv-expand-item"><span class="srv-expand-label">Дней осталось</span><span class="srv-expand-value">' + (vi.days_left != null ? vi.days_left + 'd' : '--') + '</span></div>'
          + '<div class="srv-expand-item"><span class="srv-expand-label">Стоимость</span><span class="srv-expand-value" style="color:var(--accent);font-weight:700;font-size:15px">' + (vi.cost_rub != null ? vi.cost_rub + ' \u20BD' : '--') + '</span></div>'
          + '</div></div>';
      } else {
        expandHtml = '<div class="srv-expand" id="expand-' + eid + '"><div class="no-api-hint">API-ключ не установлен. Настройки → API VDS.</div></div>';
      }
    }

    // Cache for context menu
    this.cacheServerData(s);

    var isHost = s.role === 'host';

    // Desktop row
    var h = '<div class="srv-row ' + sc + (isClient ? ' expandable' : '') + '" data-srvip="' + s.ip + '" data-role="' + (s.role||'') + '" oncontextmenu="Servers.showServerCtx(event,\'' + s.ip + '\')"' + (isClient ? ' onclick="Servers.toggleExpand(\'' + eid + '\')"' : '') + '>';
    h += '<span class="status-dot ' + sc + '"></span>';
    h += '<div>' + this.roleTag(s.role || '') + '</div>';
    h += '<div class="row-name">' + s.name + '<span class="row-name-sub">' + up + '</span></div>';
    h += '<div class="row-ip">' + s.ip + '</div>';
    h += '<div class="row-metric">' + cpu + (cpu !== '--' ? '<span class="unit">%</span>' : '') + (on && cpu !== '--' ? '<div class="inline-bar"><div class="inline-bar-fill ' + this.barLevel(cpu) + '" style="width:' + cpu + '%"></div></div>' : '') + '</div>';
    h += '<div class="row-metric">' + (rp != null ? rp : '--') + (rp != null ? '<span class="unit">%</span>' : '') + (rp != null ? '<div class="inline-bar"><div class="inline-bar-fill ' + this.barLevel(rp) + '" style="width:' + rp + '%"></div></div>' : '') + '</div>';
    h += '<div class="row-metric">' + sp + (sp !== '--' ? '<span class="unit">Mb</span>' : '') + '</div>';
    if (isProxy) {
      h += '<div style="text-align:center"><span class="proxy-tag ' + (hu ? 'up' : 'down') + '"><span class="tag-dot"></span>' + (hu ? 'UP' : 'DOWN') + '</span></div>';
      h += '<div style="text-align:center"><span class="proxy-tag ' + (su ? 'up' : 'down') + '"><span class="tag-dot"></span>' + (su ? 'UP' : 'DOWN') + '</span></div>';
      h += '<div style="text-align:center"><span class="service-tag ' + (pr ? 'running' : 'stopped') + '">' + (pr ? 'RUN' : 'STOP') + '</span></div>';
    } else {
      // Host / Client — show disk with progress bar
      var du = s.disk_used != null ? s.disk_used : null;
      var dt = s.disk_total != null ? s.disk_total : null;
      var dp = (du != null && dt != null && dt > 0) ? Math.round(du / dt * 100) : null;
      var diskLabel = du != null && dt != null ? du + ' <span class="unit">из</span> ' + dt + '<span class="unit"> GB</span>' : '--';
      h += '<div class="row-metric" style="grid-column:span 3">' + diskLabel + (dp != null ? '<div class="inline-bar"><div class="inline-bar-fill ' + this.barLevel(dp) + '" style="width:' + dp + '%"></div></div>' : '') + '</div>';
    }
    h += daysCol;

    if (!isUser && !isHost) {
      h += '<div class="row-actions" onclick="event.stopPropagation()">';
      h += '<button class="btn-icon" title="Edit" data-edit="' + s.ip + '" onclick="Servers.openEdit(this.dataset.edit)"><span class="ico" style="width:13px;height:13px;-webkit-mask-image:url(/svg/pencil.svg);mask-image:url(/svg/pencil.svg)"></span></button>';
      h += '<button class="btn-icon del" title="Delete" data-delip="' + s.ip + '" data-delname="' + sn + '" onclick="Servers.openDelete(this.dataset.delip,this.dataset.delname)"><span class="ico" style="width:13px;height:13px;-webkit-mask-image:url(/svg/trash.svg);mask-image:url(/svg/trash.svg)"></span></button>';
      h += '</div>';
    } else {
      h += '<div></div>';
    }

    // Mobile info
    var mobBtns = '';
    if (!isUser && !isHost) {
      mobBtns = '<div class="mob-actions" onclick="event.stopPropagation()">'
        + '<button class="mob-btn" data-edit="' + s.ip + '" onclick="Servers.openEdit(this.dataset.edit)"><span class="ico ico-16 ico-pencil"></span></button>'
        + '<button class="mob-btn del" data-delip="' + s.ip + '" data-delname="' + sn + '" onclick="Servers.openDelete(this.dataset.delip,this.dataset.delname)"><span class="ico ico-16 ico-trash"></span></button>'
        + '</div>';
    }

    h += '<div class="mob-top" style="display:none"><div class="mob-top-left"><span class="status-dot ' + sc + '"></span>' + this.roleTag(s.role || '') + '<span style="font-family:JetBrains Mono,monospace;font-size:11px;color:#6a6a80;margin-left:8px">' + s.ip + '</span></div>' + mobBtns + '</div>';
    h += '<div class="mob-ip" style="display:none"></div>';
    h += '<div class="mob-info" style="display:none">';
    h += '<div class="mi"><span class="mi-l">CPU</span><span class="mi-v">' + cpu + (cpu !== '--' ? '%' : '') + '</span></div>';
    h += '<div class="mi"><span class="mi-l">RAM</span><span class="mi-v">' + (rp != null ? rp + '%' : '--') + '</span></div>';
    h += '<div class="mi"><span class="mi-l">Speed</span><span class="mi-v">' + sp + (sp !== '--' ? ' Mb' : '') + '</span></div>';
    if (isProxy) {
      h += '<div class="mi"><span class="mi-l">HTTP</span><span class="mi-v"><span class="proxy-tag ' + (hu ? 'up' : 'down') + '"><span class="tag-dot"></span>' + (hu ? 'UP' : 'DOWN') + '</span></span></div>';
      h += '<div class="mi"><span class="mi-l">SOCKS5</span><span class="mi-v"><span class="proxy-tag ' + (su ? 'up' : 'down') + '"><span class="tag-dot"></span>' + (su ? 'UP' : 'DOWN') + '</span></span></div>';
      h += '<div class="mi"><span class="mi-l">3proxy</span><span class="mi-v"><span class="service-tag ' + (pr ? 'running' : 'stopped') + '">' + (pr ? 'RUN' : 'STOP') + '</span></span></div>';
    } else {
      var du2 = s.disk_used != null ? s.disk_used : null;
      var dt2 = s.disk_total != null ? s.disk_total : null;
      var dp2 = (du2 != null && dt2 != null && dt2 > 0) ? Math.round(du2 / dt2 * 100) : null;
      h += '<div class="mi"><span class="mi-l">Диск</span><span class="mi-v">' + (du2 != null ? du2+'/'+dt2+' GB' : '--') + '</span></div>';
    }
    if (isClient && dl != null) {
      var dc2 = 'green'; if (dl < 10) dc2 = 'yellow'; if (dl < 4) dc2 = 'red';
      h += '<div class="mi"><span class="mi-l">Дней</span><span class="mi-v"><span class="days-tag ' + dc2 + '">' + dl + 'д</span></span></div>';
    }
    h += '</div>';
    h += '</div>' + expandHtml;
    return h;
  },

  toggleExpand(eid) {
    var el = document.getElementById('expand-' + eid);
    if (el) el.classList.toggle('open');
  },

  // ===== CREATE SERVER (full provision) =====
  openCreate() {
    ['sc-name','sc-ip','sc-ssh-pass','sc-proxy-user','sc-proxy-pass'].forEach(function(id){ document.getElementById(id).value=''; });
    document.getElementById('sc-ssh-port').value = '22';
    document.getElementById('sc-ssh-user').value = 'root';
    document.getElementById('sc-http-port').value = '10281';
    document.getElementById('sc-socks-port').value = '10842';
    document.getElementById('sc-dns').value = 'google';
    document.getElementById('sc-role').value = 'proxy';
    document.getElementById('sc-vds').value = '';
    document.getElementById('srvCreateModal').classList.add('active');
    document.getElementById('sc-name').focus();
  },

  async createServer() {
    var name = document.getElementById('sc-name').value.trim();
    var ip = document.getElementById('sc-ip').value.trim();
    var sshPass = document.getElementById('sc-ssh-pass').value;
    var proxyUser = document.getElementById('sc-proxy-user').value.trim();
    var proxyPass = document.getElementById('sc-proxy-pass').value;
    if (!name || !ip || !sshPass || !proxyUser || !proxyPass) { Shell.toast('Заполните все поля','error'); return; }

    var body = {
      name: name, ip: ip,
      ssh_port: parseInt(document.getElementById('sc-ssh-port').value) || 22,
      ssh_user: document.getElementById('sc-ssh-user').value.trim() || 'root',
      ssh_password: sshPass,
      http_port: parseInt(document.getElementById('sc-http-port').value) || 10281,
      socks_port: parseInt(document.getElementById('sc-socks-port').value) || 10842,
      proxy_user: proxyUser, proxy_pass: proxyPass,
      dns: document.getElementById('sc-dns').value,
      role: document.getElementById('sc-role').value,
      vds_provider: document.getElementById('sc-vds').value
    };

    var d = await Shell.api('/api/mod/servers/create', {method:'POST', body:JSON.stringify(body)});
    if (d && d.status === 'provisioning') {
      Shell.closeModal('srvCreateModal');
      this.showProgress(ip);
    } else {
      Shell.toast(d?.error || 'Ошибка','error');
    }
  },

  // ===== ADD SERVER (SSH key copy) =====
  openAdd() {
    ['sa-name','sa-ip','sa-ssh-pass'].forEach(function(id){ document.getElementById(id).value=''; });
    document.getElementById('sa-ssh-port').value = '22';
    document.getElementById('sa-ssh-user').value = 'root';
    document.getElementById('sa-http-port').value = '10281';
    document.getElementById('sa-socks-port').value = '10842';
    document.getElementById('sa-role').value = 'proxy';
    this.onAddRoleChange();
    document.getElementById('srvAddModal2').classList.add('active');
    document.getElementById('sa-name').focus();
  },

  async addServer() {
    var name = document.getElementById('sa-name').value.trim();
    var ip = document.getElementById('sa-ip').value.trim();
    if (!name || !ip) { Shell.toast('Заполните название и IP','error'); return; }

    var body = {
      name: name, ip: ip,
      ssh_port: parseInt(document.getElementById('sa-ssh-port').value) || 22,
      ssh_user: document.getElementById('sa-ssh-user').value.trim() || 'root',
      ssh_password: document.getElementById('sa-ssh-pass').value || '',
      http_port: parseInt(document.getElementById('sa-http-port').value) || 10281,
      socks_port: parseInt(document.getElementById('sa-socks-port').value) || 10842,
      role: document.getElementById('sa-role').value,
      vds_provider: (document.getElementById('sa-vds') || {}).value || ''
    };

    var d = await Shell.api('/api/mod/servers/add', {method:'POST', body:JSON.stringify(body)});
    if (d && d.status === 'provisioning') {
      Shell.closeModal('srvAddModal2');
      this.showProgress(ip);
    } else if (d && d.status === 'ok') {
      Shell.toast(name + ' добавлен');
      Shell.closeModal('srvAddModal2');
      this.loadData();
    } else {
      Shell.toast(d?.error || 'Ошибка','error');
    }
  },

  // ===== PROGRESS POLLING =====
  _provPollTimer: null,

  showProgress(ip) {
    document.getElementById('srvProgressError').style.display = 'none';
    document.getElementById('srvProgressSteps').innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim)"><div class="spinner"></div></div>';
    document.getElementById('srvProgressModal').classList.add('active');
    this._pollProvision(ip);
  },

  _pollProvision(ip) {
    var self = this;
    clearTimeout(this._provPollTimer);
    Shell.api('/api/mod/servers/provision/' + ip).then(function(d) {
      if (!d) { self._provPollTimer = setTimeout(function(){ self._pollProvision(ip); }, 1000); return; }
      self._renderProvSteps(d);
      if (d.done) {
        if (d.error) {
          document.getElementById('srvProgressError').textContent = d.error;
          document.getElementById('srvProgressError').style.display = 'block';
          var closeBtn = document.getElementById('srvProgressClose');
          if (closeBtn) closeBtn.style.display = 'block';
        } else {
          setTimeout(function(){
            Shell.closeModal('srvProgressModal');
            if (d.result && d.result.http_proxy) {
              self.showResult(d.result);
            }
            self.loadData();
          }, 800);
        }
      } else {
        self._provPollTimer = setTimeout(function(){ self._pollProvision(ip); }, 1000);
      }
    });
  },

  _renderProvSteps(data) {
    var el = document.getElementById('srvProgressSteps');
    if (!el || !data.steps) return;
    el.innerHTML = data.steps.map(function(s) {
      var icon = '';
      var cls = s.status;
      if (s.status === 'pending') icon = '<span style="color:var(--text-dim)">○</span>';
      else if (s.status === 'running') icon = '<div class="srv-prov-spinner"></div>';
      else if (s.status === 'done') icon = '<span style="color:var(--accent)">✓</span>';
      else if (s.status === 'error') icon = '<span style="color:var(--danger)">✗</span>';
      return '<div class="srv-prov-step ' + cls + '"><div class="srv-prov-icon">' + icon + '</div><div class="srv-prov-name">' + s.name + '</div></div>';
    }).join('');
  },

  showResult(result) {
    document.getElementById('srvResHttpVal').textContent = result.http_proxy || '—';
    document.getElementById('srvResSocksVal').textContent = result.socks_proxy || '—';
    document.getElementById('srvResultModal').classList.add('active');
  },

  copyResult(el) {
    var val = el.querySelector('.srv-result-value');
    if (!val) return;
    var text = val.textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    Shell.toast('Скопировано');
    el.style.borderColor = 'var(--accent)';
    setTimeout(function(){ el.style.borderColor = ''; }, 1000);
  },

  // EDIT (keep old modal for editing existing servers)
  async openEdit(ip) {
    var servers = await Shell.api('/api/mod/servers/list');
    if (!servers) return;
    var s = servers.find(x => x.ip === ip);
    if (!s) return;
    // Host cannot be edited
    if (s.role === 'host') { Shell.toast('Host сервер нельзя редактировать'); return; }
    this.editMode = true;
    document.getElementById('srvEditIp').value = s.ip;
    document.getElementById('srvAddTitle').textContent = 'Редактировать сервер';
    document.getElementById('srvSaveBtn').textContent = 'Сохранить';
    document.getElementById('sf-name').value = s.name;
    document.getElementById('sf-ip').value = s.ip;
    document.getElementById('sf-ssh-port').value = s.ssh_port || 22;
    document.getElementById('sf-ssh-user').value = s.ssh_user || 'root';
    document.getElementById('sf-http-port').value = s.http_port || 10281;
    document.getElementById('sf-socks-port').value = s.socks_port || 10842;
    document.getElementById('sf-role').value = s.role || 'proxy';
    document.getElementById('sf-vds').value = s.vds_provider || '';
    this.onEditRoleChange();
    document.getElementById('srvAddModal').classList.add('active');
  },

  async saveServer() {
    var name = document.getElementById('sf-name').value.trim();
    var ip = document.getElementById('sf-ip').value.trim();
    if (!name || !ip) { Shell.toast('Заполните название и IP', 'error'); return; }
    var body = {
      name: name, ip: ip,
      ssh_port: parseInt(document.getElementById('sf-ssh-port').value) || 22,
      ssh_user: document.getElementById('sf-ssh-user').value.trim() || 'root',
      http_port: parseInt(document.getElementById('sf-http-port').value) || 10281,
      socks_port: parseInt(document.getElementById('sf-socks-port').value) || 10842,
      role: document.getElementById('sf-role').value,
      vds_provider: document.getElementById('sf-vds').value
    };
    var url, method;
    if (this.editMode) {
      var oip = document.getElementById('srvEditIp').value;
      url = '/api/mod/servers/update/' + oip;
      method = 'PUT';
    } else {
      url = '/api/mod/servers/add';
      method = 'POST';
    }
    var d = await Shell.api(url, {method: method, body: JSON.stringify(body)});
    if (d && d.status === 'ok') {
      Shell.toast(this.editMode ? 'Сервер обновлён' : name + ' добавлен');
      Shell.closeModal('srvAddModal');
      this.loadData();
    } else {
      Shell.toast(d?.error || 'Ошибка', 'error');
    }
  },

  // DELETE
  openDelete(ip, name) {
    this.deleteTarget = ip;
    document.getElementById('srvDelInfo').textContent = name + ' — ' + ip;
    document.getElementById('srvDelModal').classList.add('active');
  },

  async confirmDelete() {
    if (!this.deleteTarget) return;
    var d = await Shell.api('/api/mod/servers/delete/' + this.deleteTarget, {method: 'DELETE'});
    if (d && d.status === 'ok') {
      Shell.toast('Сервер удалён');
      Shell.closeModal('srvDelModal');
      this.deleteTarget = null;
      this.loadData();
    } else {
      Shell.toast(d?.error || 'Ошибка', 'error');
    }
  },

  // SETTINGS
  openSettings() {
    this.loadApiKeyStatus();
    document.getElementById('srvSettingsModal').classList.add('active');
  },

  async loadApiKeyStatus() {
    var d = await Shell.api('/api/mod/servers/apikeys');
    if (!d) return;
    var st = document.getElementById('srvApiStatus');
    var inp = document.getElementById('srvApiKey');
    if (!st || !inp) return;
    if (d.has_key && d.has_key.ruvds) {
      st.textContent = '✓';
      st.style.color = 'var(--accent)';
      inp.value = d.keys.ruvds || '';
    } else {
      st.textContent = '✗';
      st.style.color = 'var(--danger)';
      inp.value = '';
    }
  },

  async saveApiKey() {
    var key = document.getElementById('srvApiKey').value.trim();
    var d = await Shell.api('/api/mod/servers/apikeys', {method: 'POST', body: JSON.stringify({provider: 'ruvds', key: key})});
    if (d && d.status === 'ok') {
      Shell.toast(key ? 'API-ключ сохранён' : 'API-ключ удалён');
      this.loadApiKeyStatus();
    } else {
      Shell.toast('Ошибка', 'error');
    }
  },

  // ===== SERVER STATUS TEXT =====
  _cachedServers: {},

  cacheServerData(s) {
    this._cachedServers[s.ip] = s;
  },

  buildStatusText(s) {
    var on = s.online !== false;
    var status = on ? '🟢 Online' : '🔴 Offline';
    var cpu = s.cpu != null ? s.cpu + '%' : '—';
    var rp = (s.ram_used && s.ram_total) ? Math.round(s.ram_used / s.ram_total * 100) + '%' : '—';
    var sp = s.speed_mbps != null ? s.speed_mbps + ' Mb/s' : '—';
    var role = s.role ? s.role.toUpperCase() : '—';

    var text = '📡 ' + s.name + ' [' + role + ']\n'
      + '━━━━━━━━━━━━━━\n'
      + status + '  ·  ' + s.ip + '\n'
      + '⚡ CPU: ' + cpu + '  ·  RAM: ' + rp + '\n'
      + '🌐 Speed: ' + sp;

    if (s.role === 'proxy') {
      var http = (s.http_proxy !== false && on) ? '✅' : '❌';
      var socks = (s.socks_proxy !== false && on) ? '✅' : '❌';
      var proxy = (s.proxy_running === true && on) ? '✅ RUN' : '❌ STOP';
      text += '\nHTTP: ' + http + '  ·  SOCKS5: ' + socks;
      text += '\n3proxy: ' + proxy;
    }

    if (s.disk_used != null && s.disk_total != null) {
      text += '\n💾 Диск: ' + s.disk_used + '/' + s.disk_total + ' GB';
    }

    if (s.uptime && on) text += '\n⏱ Uptime: ' + s.uptime;
    if (s.days_left != null) text += '\n📅 Дней: ' + s.days_left;

    return text;
  },

  // ===== CONTEXT MENU =====
  _srvCtx: null,

  showServerCtx(e, ip) {
    e.preventDefault(); e.stopPropagation();
    this.closeServerCtx();
    var s = this._cachedServers[ip];
    if (!s) return;

    var menu = document.createElement('div');
    menu.className = 'srv-ctx-menu';
    menu.innerHTML = '<div class="srv-ctx-action" onclick="Servers.forwardToMessenger(\'' + ip + '\');Servers.closeServerCtx()">'
      + '<span class="ico ico-14 ico-forward"></span> Переслать'
      + '</div>'
      + '<div class="srv-ctx-action" onclick="Servers.copyServerStatus(\'' + ip + '\');Servers.closeServerCtx()">'
      + '<span class="ico ico-14 ico-copy"></span> Копировать'
      + '</div>';

    document.body.appendChild(menu);
    var x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 200);
    var y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 200);
    if (x + 200 > window.innerWidth) x = window.innerWidth - 208;
    if (y + 100 > window.innerHeight) y = y - 100;
    if (x < 8) x = 8; if (y < 8) y = 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    this._srvCtx = menu;
  },

  closeServerCtx() {
    if (this._srvCtx) { this._srvCtx.remove(); this._srvCtx = null; }
  },

  copyServerStatus(ip) {
    var s = this._cachedServers[ip];
    if (!s) return;
    var text = this.buildStatusText(s);
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    Shell.toast('Скопировано');
  },

  _forwardIp: null,

  forwardToMessenger(ip) {
    var s = this._cachedServers[ip];
    if (!s) { Shell.toast('Сервер не найден', 'error'); return; }
    var text = this.buildStatusText(s);
    if (window.Messenger) {
      Messenger.startForwardStatus(text);
    }
  }
};

// Close server ctx on click anywhere
document.addEventListener('click', function() { Servers.closeServerCtx(); });

// Init when loaded
window.Servers = Servers;
Servers.init();

// Long-press for mobile (iOS + Android)
(function() {
  var timer = null, startX = 0, startY = 0, moved = false;
  var list = document.getElementById('srvList');
  if (!list) return;

  list.addEventListener('touchstart', function(e) {
    var row = e.target.closest('.srv-row');
    if (!row) return;
    moved = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    timer = setTimeout(function() {
      if (moved) return;
      if (navigator.vibrate) navigator.vibrate(30);
      var ip = Servers._findRowIp(row);
      if (ip) {
        var fakeE = { preventDefault:function(){}, stopPropagation:function(){}, clientX:startX, clientY:startY };
        Servers.showServerCtx(fakeE, ip);
      }
    }, 500);
  }, {passive:true});

  list.addEventListener('touchmove', function(e) {
    if (!timer) return;
    var dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { moved = true; clearTimeout(timer); timer = null; }
  }, {passive:true});

  list.addEventListener('touchend', function() { clearTimeout(timer); timer = null; }, {passive:true});
  list.addEventListener('touchcancel', function() { clearTimeout(timer); timer = null; }, {passive:true});
})();
