import { createRoot } from 'react-dom/client';
import App from './App.jsx';

/* ─── Контракт с оболочкой ────────────────────────────────────────────────
   core/shell.js забирает valentine.html/.css/.js как текст, вставляет
   html+css в контейнер (создаётся ОДИН раз и дальше только скрывается через
   display), а js исполняет как инлайновый <script>. Наружу модуль обязан
   выставить window.Valentine с методом onWS(data) — туда оболочка
   пересылает каждое сообщение WebSocket.

   Скрипт выполняется ровно один раз, при первом открытии модуля, поэтому
   React-корень создаётся здесь и живёт всю сессию: переключение вкладок
   оболочки только прячет контейнер, размонтирования не происходит. */

let wsHandler = null;

window.Valentine = {
  onWS(data) {
    if (wsHandler) wsHandler(data);
  },
};

/* Монтируемся в #vl-mount, а #vl-root рисует уже сам App — так корень
   модуля остаётся под управлением React (на нём переключается класс
   режима движения), а точка монтирования просто держит высоту. */
const el = document.getElementById('vl-mount');
if (el) {
  createRoot(el).render(<App registerWSHandler={(fn) => { wsHandler = fn; }} />);
}
