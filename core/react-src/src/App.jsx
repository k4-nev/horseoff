import { useEffect, useState } from 'react';
import SideNav from './SideNav.jsx';
import Login from './Login.jsx';
import PinScreen from './PinScreen.jsx';
import ProfileModal from './ProfileModal.jsx';
import { Toast, Clouds, MsgNote, PushBanner } from './Overlays.jsx';

/* Каркас целиком на React. Логика и сеть остались в ядре (core/shell.js):
   оно держит состояние в Shell._uiState, здесь мы на него подписаны.
   Порядок загрузки скриптов неважен — подписчик получает текущее состояние
   сразу при подписке. */

const EMPTY = {
  booting: true, authed: false, theme: 'light',
  modules: [], active: null, unread: 0, valentine: 0, avatar: null, user: null, immersive: false,
  setup: false, authError: '', authBusy: false,
  profile: null, sessions: null, pinEnabled: false,
  pin: null, toast: null, clouds: [], note: null, pushBanner: false, version: '',
};

function useShellState() {
  const [s, set] = useState(() => (window.Shell && window.Shell._uiState) || EMPTY);
  useEffect(() => {
    if (!window.Shell || !window.Shell.subscribeUI) return undefined;
    return window.Shell.subscribeUI(set);
  }, []);
  return s;
}

export default function App() {
  const st = useShellState();

  /* Всплывающее живёт над любым экраном: тост об ошибке должен быть виден
     и до авторизации. */
  const overlays = (
    <>
      <ProfileModal profile={st.profile} sessions={st.sessions} pinEnabled={st.pinEnabled} theme={st.theme} />
      <PinScreen pin={st.pin} />
      <Clouds clouds={st.clouds || []} />
      <MsgNote note={st.note} />
      <PushBanner show={st.pushBanner} />
      <Toast toast={st.toast} />
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
        />
      </div>
      {overlays}
    </>
  );
}
