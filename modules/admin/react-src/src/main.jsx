import { createRoot } from 'react-dom/client';
import App from './App.jsx';

/* ─── Контракт с оболочкой ────────────────────────────────────────────────
   core/shell.js забирает admin.html/.css/.js как текст, вставляет html+css
   в контейнер (создаётся ОДИН раз и дальше только скрывается через
   display), а js исполняет как инлайновый <script>. Модуль admin, в
   отличие от messenger/channels/valentine/bots/wb, не значится в таблице
   WS-диспетчеризации shell.js — он целиком REST-based через Shell.api(),
   поэтому window.Admin.onWS не нужен.

   Скрипт выполняется ровно один раз, при первом открытии модуля, поэтому
   React-корень создаётся здесь и живёт всю сессию: переключение вкладок
   оболочки только прячет контейнер, размонтирования не происходит. */

const el = document.getElementById('adm-mount');
if (el) {
  createRoot(el).render(<App />);
}
