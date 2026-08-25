import { createRoot } from 'react-dom/client';
import App from './App.jsx';

/* ─── Контракт с оболочкой ────────────────────────────────────────────────
   core/shell.js забирает servers.html/.css/.js как текст, вставляет html+css
   в контейнер (создаётся ОДИН раз и дальше только скрывается через
   display), а js исполняет как инлайновый <script>. В отличие от admin,
   servers ЗНАЧИТСЯ в таблице WS-диспетчеризации shell.js (core/shell.js:36-41)
   — оболочка пересылает сюда 'servers_update' и 'settings' сообщения через
   window.Servers.onServersUpdate(data) / onSettingsUpdate(settings). Модуль
   также сам шлёт WS-сообщения наружу через window.Shell.wsSend().

   Скрипт выполняется ровно один раз, при первом открытии модуля, поэтому
   React-корень создаётся здесь и живёт всю сессию: переключение вкладок
   оболочки только прячет контейнер, размонтирования не происходит. */

let handlers = null;

window.Servers = {
  onServersUpdate(data) {
    if (handlers) handlers.onServersUpdate(data);
  },
  onSettingsUpdate(settings) {
    if (handlers) handlers.onSettingsUpdate(settings);
  },
};

const el = document.getElementById('srv-mount');
if (el) {
  createRoot(el).render(<App registerHandlers={(h) => { handlers = h; }} />);
}
