import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/* Снимки каркаса поверх настоящего модуля «Серверы»: так видно, как ручка,
   кольцо и размытие ложатся на реальный контент, а не на заглушку. */

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOT_DIR || 'C:/Users/Administrator/.claude/jobs/8e913f93/tmp';
const BASE = 'http://localhost:8901/core/shell.html';

const MODULES = [
  { id: 'messenger', name: 'Сообщения', icon: 'messenger', entry: 'messenger.html' },
  { id: 'channels', name: 'Каналы', icon: 'channels', entry: 'channels.html' },
  { id: 'servers', name: 'Серверы', icon: 'servers', entry: 'servers.html' },
  { id: 'bots', name: 'Боты', icon: 'bots', entry: 'bots.html' },
  { id: 'wb', name: 'MP продвижение', icon: 'wb', entry: 'wb.html' },
  { id: 'valentine', name: 'Признания', icon: 'valentine', entry: 'valentine.html' },
  { id: 'admin', name: 'Пользователи', icon: 'users', entry: 'admin.html', min_role: 'arcana' },
];

const SERVERS = [
  { name: 'Horseoff', ip: '10.0.0.1', role: 'host', online: true, cpu: 22, ram_used: 3600, ram_total: 8000, speed_mbps: 820, disk_used: 20, disk_total: 80, uptime: '5д 3ч' },
  { name: 'Proxy-01', ip: '5.5.5.5', role: 'proxy', online: true, cpu: 64, ram_used: 900, ram_total: 2000, speed_mbps: 340, http_proxy: true, socks_proxy: true, proxy_running: true, vds_provider: 'ruvds', days_left: 12, uptime: '2д 1ч' },
  { name: 'Proxy-02', ip: '6.6.6.6', role: 'proxy', online: false, vds_provider: 'ruvds', days_left: 15 },
  { name: 'Client-01', ip: '7.7.7.7', role: 'client', online: true, cpu: 12, ram_used: 1000, ram_total: 2000, speed_mbps: 120, disk_used: 10, disk_total: 50, vds_provider: 'ruvds', days_left: 10, uptime: '10д' },
];

const server = spawn('node', ['static-server.mjs'], { cwd: HERE, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1000));
const browser = await chromium.launch();

async function mk(viewport) {
  const p = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await p.route('**/api/**', (route) => {
    const u = route.request().url();
    const j = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.includes('/api/auth/status')) return j({ username: 'k4nev', role: 'arcana' });
    if (u.includes('/api/profile')) return j({ username: 'k4nev', role: 'arcana', id: 'u1', display_name: 'Костя', avatar: null });
    if (u.includes('/api/modules')) return j(MODULES);
    if (u.includes('/api/version')) return j({ version: '2.240' });
    if (u.includes('/api/auth/sessions')) return j([
      { hint: 'a1', is_current: true, pin_enabled: false, last_seen: Date.now() / 1000 - 30, device_info: { user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } },
      { hint: 'b2', is_current: false, pin_enabled: true, last_seen: Date.now() / 1000 - 7200, device_info: { user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X)' } },
    ]);
    if (u.includes('/api/mod/servers/status')) return j(SERVERS);
    if (u.includes('/api/mod/servers')) return j({ status: 'ok' });
    return j({ status: 'ok' });
  });
  await p.addInitScript(() => localStorage.setItem('ho_token', 't'));
  await p.goto(BASE);
  await p.waitForSelector('#appShell.active');
  await p.waitForTimeout(600);
  await p.evaluate(() => Shell.switchModule('servers'));
  await p.waitForTimeout(4200);
  return p;
}

async function ring(p) {
  const h = await p.locator('.ho-fab').boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await p.mouse.down();
  await p.mouse.up();
  await p.waitForTimeout(1400);
}

// экран входа
const lg = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await lg.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ setup_required: false }) }));
await lg.goto(BASE);
await lg.waitForSelector('.login-screen');
await lg.waitForTimeout(600);
await lg.screenshot({ path: OUT + '/s-login.png', animations: 'disabled' });
await lg.close();

// PIN-экран
const pn = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await pn.route('**/api/**', (route) => {
  const u = route.request().url();
  const j = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (u.includes('/api/auth/status')) return j({ username: 'k4nev', role: 'arcana' });
  if (u.includes('/api/profile')) return j({ username: 'k4nev', role: 'arcana', id: 'u1', display_name: 'Костя' });
  return j({ status: 'ok' });
});
await pn.addInitScript(() => { localStorage.setItem('ho_token', 't'); localStorage.setItem('ho_pin', '1234'); });
await pn.goto(BASE);
await pn.waitForSelector('.ho-pin-screen');
await pn.waitForTimeout(500);
await pn.screenshot({ path: OUT + '/s-pin.png', animations: 'disabled' });
await pn.close();

// модалка профиля
const pf = await mk({ width: 1440, height: 900 });
await pf.evaluate(() => Shell.openProfile());
await pf.waitForTimeout(700);
await pf.screenshot({ path: OUT + '/s-profile.png', animations: 'disabled' });
await pf.evaluate(() => document.querySelectorAll('.prof-tab')[1].click());
await pf.waitForTimeout(400);
await pf.screenshot({ path: OUT + '/s-profile-sec.png', animations: 'disabled' });
await pf.close();

const d = await mk({ width: 1440, height: 900 });
await d.screenshot({ path: OUT + '/s-desk-idle.png', animations: 'disabled' });
const hb = await d.locator('.ho-fab').boundingBox();
await d.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await d.waitForTimeout(600);
await d.screenshot({ path: OUT + '/s-desk-near.png', animations: 'disabled' });
await ring(d);
await d.screenshot({ path: OUT + '/s-desk-open.png', animations: 'disabled' });
await d.close();

const cfg = await mk({ width: 1440, height: 900 });
await cfg.locator('.srv-settings-btn').click();
await cfg.waitForTimeout(700);
await cfg.screenshot({ path: OUT + '/s-settings.png', animations: 'disabled' });
await cfg.close();

const cfgm = await mk({ width: 390, height: 800 });
await cfgm.locator('.srv-settings-btn').click();
await cfgm.waitForTimeout(700);
await cfgm.screenshot({ path: OUT + '/s-settings-phone.png', animations: 'disabled' });
await cfgm.close();

const m = await mk({ width: 390, height: 800 });
await m.screenshot({ path: OUT + '/s-phone-idle.png', animations: 'disabled' });
await ring(m);
await m.screenshot({ path: OUT + '/s-phone-open.png', animations: 'disabled' });
await m.close();

await browser.close();
server.kill();
console.log('shots done');
