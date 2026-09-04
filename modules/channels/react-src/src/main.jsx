import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './channels.css';

/* Контракт с оболочкой: core/shell.js пересылает сюда WS-сообщения каналов и
   голосовых комнат через window.Channels.onWS(data). Плашка голосовой комнаты
   живёт в узле каркаса (#sidebarVoiceBar) — App рисует её порталом, поэтому
   она видна и когда открыт другой модуль. */

let bridge = null;

window.Channels = {
  onWS(d) { if (bridge) bridge.onWS(d); },
  onDeactivate() { if (bridge) bridge.onDeactivate(); },
  openChannel(spaceId, channelId) { if (bridge) bridge.openChannel(spaceId, channelId); },
};

const el = document.getElementById('ch-mount');
if (el) createRoot(el).render(<App registerBridge={(b) => { bridge = b; }} />);
