import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';

const html = readFileSync('../valentine.html', 'utf-8');
const js = readFileSync('../valentine.js', 'utf-8');

const dom = new JSDOM(`<!doctype html><html><body><div id="moduleContent">${html}</div></body></html>`, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/',
});

const { window } = dom;
global.window = window;
global.document = window.document;
try { Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true }); } catch (e) {}

// Minimal Shell stub matching what core/shell.js actually provides
window.Shell = {
  token: 'test-token',
  user: { username: 'tester', id: 'u1' },
  api: async (path) => {
    if (path === '/api/msg/contacts') return { contacts: [{ id: 'u2', username: 'friend', display_name: 'Friend' }] };
    if (path === '/api/valentine/stickers') return { stickers: ['/stickers/sticker-01.png'] };
    if (path === '/api/valentine/received') return [];
    if (path === '/api/profile') return { username: 'tester', display_name: 'Tester' };
    return {};
  },
};

let caught = null;
window.addEventListener('error', (e) => { caught = e.error || e.message; });

try {
  window.eval(js);
} catch (e) {
  caught = e;
}

// Let microtasks (the useEffect data fetches + subsequent renders) flush.
await new Promise((r) => setTimeout(r, 300));

if (caught) {
  console.error('CAUGHT ERROR:', caught && caught.stack ? caught.stack : caught);
  process.exit(1);
}

const root = window.document.getElementById('vl-root');
console.log('vl-root innerHTML length:', root ? root.innerHTML.length : 'NO ROOT ELEMENT');
console.log('vl-root innerHTML (first 500 chars):', root ? root.innerHTML.slice(0, 500) : '');
