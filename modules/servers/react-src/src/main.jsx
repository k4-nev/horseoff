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

/* Метрики приходят по подписке, а не всем подряд: раздел открыт — подписка
   есть, ушли в другой модуль — снята. Оболочка зовёт onActivate/onDeactivate
   при переключении, а модуль при этом остаётся смонтированным. */
const sub = (on) => {
  const S = window.Shell;
  if (S && S.wsSend) S.wsSend({ type: on ? 'servers_subscribe' : 'servers_unsubscribe' });
};

window.Servers = {
  onServersUpdate(data) {
    if (handlers) handlers.onServersUpdate(data);
  },
  onSettingsUpdate(settings) {
    if (handlers) handlers.onSettingsUpdate(settings);
  },
  onActivate() { sub(true); },
  onDeactivate() { sub(false); },
};

const el = document.getElementById('srv-mount');
if (el) {
  createRoot(el).render(<App registerHandlers={(h) => { handlers = h; }} />);
}
