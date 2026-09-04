import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './shell.ui.css';

/* ─── Контракт с ядром ────────────────────────────────────────────────────
   core/shell.js остаётся ядром: авторизация, WebSocket, загрузка модулей,
   пуши, профиль, PIN — всё там и работает как раньше. React владеет только
   каркасом приложения и навигацией.

   Связь односторонняя и без гонок: ядро держит состояние интерфейса в
   Shell._uiState и зовёт Shell._uiEmit(patch) при каждом изменении. React
   подписывается через Shell.subscribeUI и получает текущее состояние сразу
   при подписке — поэтому неважно, кто из двух скриптов выполнился первым. */

const root = document.getElementById('shellRoot');
if (root) createRoot(root).render(<App />);
