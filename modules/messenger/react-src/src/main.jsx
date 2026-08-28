import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './messenger.css';

/* ─── Контракт с оболочкой ────────────────────────────────────────────────
   core/shell.js забирает messenger.html/.css/.js как текст, вставляет html+css
   в контейнер (создаётся ОДИН раз и дальше только скрывается через display),
   а js исполняет как инлайновый <script>. Скрипт выполняется ровно один раз,
   поэтому React-корень создаётся здесь и живёт всю сессию.

   Мессенджер значится в таблице WS-диспетчеризации: оболочка пересылает сюда
   каждое сообщение через window.Messenger.onWS(data), открывает чат по клику
   на уведомление через openChat(id) и присылает пересылку статуса сервера
   из модуля «Серверы» через startForwardStatus(text).

   Мост объявляем сразу, до монтирования: switchModule и уведомления могут
   позвать его раньше, чем React успеет отрисоваться. */

let bridge = null;

window.Messenger = {
  onWS(d) { if (bridge) bridge.onWS(d); },
  openChat(id) { if (bridge) bridge.openChat(id); },
  startForwardStatus(text) { if (bridge) bridge.startForwardStatus(text); },
  startForward(payload) { if (bridge) bridge.startForward(payload); },
};

const el = document.getElementById('msg-mount');
if (el) createRoot(el).render(<App registerBridge={(b) => { bridge = b; }} />);
