import { useEffect, useState } from 'react';
import SideNav from './SideNav.jsx';

function useShellState() {
  const [s, set] = useState(() => (window.Shell && window.Shell._uiState) || { authed: false, modules: [], active: null, unread: 0, valentine: 0, avatar: null });
  useEffect(() => {
    if (!window.Shell || !window.Shell.subscribeUI) return undefined;
    return window.Shell.subscribeUI(set);
  }, []);
  return s;
}

export default function App() {
  const st = useShellState();
  if (!st.authed) return null;
  return (
    <div className="app-shell active" id="appShell">
      {/* Контейнеры модулей сюда кладёт ядро. React детей не рисует и
          поэтому их не трогает — кэш открытых модулей переживает
          перерисовки каркаса. */}
      <main className="content" id="moduleContent" />
      <SideNav
        modules={st.modules}
        active={st.active}
        unread={st.unread}
        valentine={st.valentine}
        avatar={st.avatar}
        user={st.user}
      />
    </div>
  );
}
