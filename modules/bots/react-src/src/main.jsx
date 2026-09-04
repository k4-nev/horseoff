import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './bots.css';

/* Контракт с оболочкой: core/shell.js пересылает сюда WS-сообщения про ботов
   (window.Bots.onWS) и предупреждает об уходе из модуля (onDeactivate) —
   на нём висит вопрос «сохранить раскладку?». Мост объявляем до монтирования:
   события могут прийти раньше первого кадра. */

let bridge = null;

window.Bots = {
  onWS(d) { if (bridge) bridge.onWS(d); },
  onDeactivate() { if (bridge) bridge.onDeactivate(); },
};

const el = document.getElementById('bt-mount');
if (el) createRoot(el).render(<App registerBridge={(b) => { bridge = b; }} />);
