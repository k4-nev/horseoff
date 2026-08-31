import { useEffect, useState } from 'react';
import SideNav from './SideNav.jsx';
import Login from './Login.jsx';
import PinScreen from './PinScreen.jsx';
import ProfileModal from './ProfileModal.jsx';
import Queue from './Queue.jsx';
import { PushBanner } from './Overlays.jsx';

/* Каркас целиком на React. Логика и сеть остались в ядре (core/shell.js):
   оно держит состояние в Shell._uiState, здесь мы на него подписаны.
   Порядок загрузки скриптов неважен — подписчик получает текущее состояние
   сразу при подписке. */

const EMPTY = {
  booting: true, authed: false, theme: 'light',
  modules: [], active: null, unread: 0, valentine: 0, avatar: null, user: null, immersive: false,
  setup: false, authError: '', authBusy: false,
  profile: null, sessions: null, pinEnabled: false,
  pin: null, notes: [], pushBanner: false, version: '',
};

const MOBILE = '(max-width: 768px)';

function useShellState() {
  const [s, set] = useState(() => (window.Shell && window.Shell._uiState) || EMPTY);
  useEffect(() => {
    if (!window.Shell || !window.Shell.subscribeUI) return undefined;
    return window.Shell.subscribeUI(set);
  }, []);
  return s;
}

function useMedia(query) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const h = () => setOn(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, [query]);
  return on;
}

export default function App() {
  const st = useShellState();
  const isMobile = useMedia(MOBILE);
  /* Раскрыто ли кольцо — забота каркаса, а не ядра: об этом должны знать
     навигация и очередь уведомлений, и больше никто. */
  const [ringOpen, setRingOpen] = useState(false);

  const notes = st.notes || [];

  const overlays = (
    <>
      <ProfileModal profile={st.profile} sessions={st.sessions} pinEnabled={st.pinEnabled} theme={st.theme} />
      <PinScreen pin={st.pin} />
      <PushBanner show={st.pushBanner} />
      <Queue notes={notes} ringOpen={ringOpen} immersive={st.immersive} isMobile={isMobile} />
    </>
  );

  /* Пока не знаем, обычный это вход или первый запуск, не показываем ни
     того ни другого: форма у них разная, и мигание между ними заметно. */
  if (st.booting) return overlays;

  if (!st.authed) {
    return (
      <>
        {/* Экран разблокировки по PIN идёт вместо формы входа */}
        {!st.pin && (
          <Login
            setup={st.setup}
            error={st.authError}
            busy={st.authBusy}
            version={st.version}
          />
        )}
        {overlays}
      </>
    );
  }

  return (
    <>
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
          immersive={st.immersive}
          notes={notes.length}
          pinEnabled={st.pinEnabled}
          onRing={setRingOpen}
        />
      </div>
      {overlays}
    </>
  );
}
