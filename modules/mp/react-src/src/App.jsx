import { useEffect, useMemo, useState } from 'react';
import { buildRegState, buildServer, buildTestServer } from './mock.js';
import { Empty, buzz, plural } from './atoms.jsx';
import {
  ComposerForm, ConfirmBody, MassBuyoutForm, Modal, NewServerForm, QrBody, SingleBuyoutForm,
} from './Modals.jsx';
import TabAccounts from './TabAccounts.jsx';
import TabReg from './TabReg.jsx';
import TabWarmup from './TabWarmup.jsx';
import TabPurchases from './TabPurchases.jsx';
import TabPickup from './TabPickup.jsx';
import TabReviews from './TabReviews.jsx';
import TabStats from './TabStats.jsx';

const TABS = [
  { id: 'accounts', name: 'Аккаунты' },
  { id: 'reg', name: 'Регистратор' },
  { id: 'warmup', name: 'Прогрев' },
  { id: 'purchases', name: 'Покупки' },
  { id: 'pickup', name: 'Получение' },
  { id: 'reviews', name: 'Отзывы' },
  { id: 'stats', name: 'Статистика' },
];

const toast = (t) => { if (window.Shell && window.Shell.toast) window.Shell.toast(t); };

export default function App() {
  const [servers, setServers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState('accounts');
  const [sideOpen, setSideOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [day, setDay] = useState('2026-08-11');

  /* Состояние вкладок, которое должно пережить переключение: регистратор
     держит свой пул и активные, прогрев — снятое на сегодня. У каждого
     сервера своё. */
  const [regStore, setRegStore] = useState({});
  const [wuRemoved, setWuRemoved] = useState({});

  const server = useMemo(() => servers.find((s) => s.id === activeId), [servers, activeId]);
  const testOn = servers.some((s) => s.id === '__test__');

  /* Смена модуля в оболочке закрывает выдвижной список серверов: иначе
     возвращаешься в MP и он всё ещё открыт поверх содержимого. */
  useEffect(() => {
    if (!window.Shell || !window.Shell.switchModule || window.Shell._mpHooked) return;
    const orig = window.Shell.switchModule.bind(window.Shell);
    window.Shell.switchModule = function (id) { setSideOpen(false); return orig(id); };
    window.Shell._mpHooked = true;
  }, []);

  /* Пока сайдбар открыт, кнопка «Приложения» уходит под него: она лежит
     поверх интерфейса, но не поверх выдвижных панелей модулей. */
  useEffect(() => {
    if (window.Shell && window.Shell.setOverlay) window.Shell.setOverlay(sideOpen);
  }, [sideOpen]);

  const select = (id) => {
    setActiveId(id);
    setSideOpen(false);
    buzz(8);
  };

  const toggleTest = () => {
    buzz(15);
    if (testOn) {
      const rest = servers.filter((s) => s.id !== '__test__');
      setServers(rest);
      if (activeId === '__test__') setActiveId(rest[0] ? rest[0].id : null);
      return;
    }
    const t = buildTestServer();
    setServers((p) => [t, ...p]);
    select(t.id);
    toast('Тестовый сервер добавлен');
  };

  const createServer = (name, platform) => {
    if (!name) { toast('Введите название сервера'); return; }
    const srv = buildServer(name, platform);
    setServers((p) => p.concat(srv));
    select(srv.id);
    setModal(null);
    toast('Сервер создан');
  };

  const reg = server ? (regStore[server.id] || buildRegState(server)) : null;
  const setReg = (next) => setRegStore((p) => ({ ...p, [server.id]: next }));

  const groups = useMemo(() => {
    const g = {};
    servers.forEach((s) => { const p = s.platform || 'Без платформы'; (g[p] = g[p] || []).push(s); });
    return g;
  }, [servers]);

  const online = servers.filter((s) => s.status === 'online').length;
  const accCount = server ? server.accounts.length : 0;

  const body = !server ? (
    <Empty
      title="Сервер не выбран"
      sub="Открой список серверов и выбери сервер, либо включи «Тестовый сервер» для просмотра интерфейса."
      action={<button className="btn btn-primary" onClick={() => setSideOpen(true)}>Показать серверы</button>}
    />
  ) : ({
    accounts: <TabAccounts server={server} />,
    reg: <TabReg reg={reg} setReg={setReg} />,
    warmup: (
      <TabWarmup
        server={server}
        removed={wuRemoved}
        setRemoved={setWuRemoved}
        onConfirm={(c) => setModal({ kind: 'confirm', ...c })}
      />
    ),
    purchases: <TabPurchases server={server} day={day} setDay={setDay} onModal={setModal} />,
    pickup: <TabPickup server={server} onModal={setModal} />,
    reviews: <TabReviews server={server} onModal={setModal} />,
    stats: <TabStats server={server} servers={servers} />,
  }[tab] || null);

  return (
    <div className={'mp-wrap' + (sideOpen ? ' side-open' : '')}>
      <aside className="mp-side">
        <div className="mp-side-head">
          <span className="mp-side-title">MP продвижение</span>
          <div className="mp-side-actions">
            <button
              className={'mp-ico-btn' + (testOn ? ' demo-on' : '')}
              onClick={toggleTest}
              title="Тестовый сервер"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            </button>
            <button className="mp-ico-btn" onClick={() => setModal({ kind: 'newServer' })} title="Добавить сервер">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mp-side-list">
          {servers.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.6 }}>
              Нет серверов.<br />Нажми «Тестовый сервер» для дебага интерфейса.
            </div>
          ) : Object.keys(groups).map((p) => (
            <div key={p}>
              <div className="mp-srv-group">{p}<span>{groups[p].length}</span></div>
              {groups[p].map((s) => (
                <div
                  className={'mp-srv' + (s.id === activeId ? ' active' : '') + (s.test ? ' test' : '')}
                  key={s.id}
                  onClick={() => select(s.id)}
                >
                  <span className={'mp-srv-dot ' + s.status} />
                  <div className="mp-srv-body">
                    <div className="mp-srv-name">{s.name}</div>
                    <div className="mp-srv-sub">{s.accounts.length} аккаунтов</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="mp-side-foot"><b>{online}</b> / {servers.length} онлайн</div>
      </aside>

      <div className="mp-backdrop" onClick={() => setSideOpen(false)} />

      <div className="mp-main">
        <div className="mp-head">
          <div className="mp-head-card">
            <div className="mp-hd-left">
              <button className="mp-hd-srv" onClick={() => { setSideOpen((v) => !v); buzz(8); }} title="Серверы">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
                  <line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
              </button>
              <span className={'mp-hd-dot' + (server ? (server.status === 'online' ? ' online' : ' offline') : '')} />
              <span className="mp-hd-name">{server ? server.name : 'Сервер не выбран'}</span>
            </div>

            <div className="mp-hd-seg" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={'mp-hd-tab' + (tab === t.id ? ' active' : '')}
                  onClick={() => { setTab(t.id); buzz(6); }}
                  role="tab"
                  aria-selected={tab === t.id}
                >
                  {t.name}
                </button>
              ))}
            </div>

            <div className="mp-hd-count">
              {server && (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <b>{accCount}</b> {plural(accCount, 'аккаунт', 'аккаунта', 'аккаунтов')}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mp-ws">
          <div className="mp-pane active">{body}</div>
        </div>
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        width={modal && modal.kind === 'mass' ? 1080 : (modal && (modal.kind === 'newServer' || modal.kind === 'confirm') ? (modal.kind === 'confirm' ? 420 : 460) : 560)}
        title={modal && {
          newServer: 'Новый сервер',
          qr: 'Код получения',
          single: 'Одиночный выкуп',
          mass: 'Массовый залив',
          composer: 'Новый отзыв',
          confirm: modal.title,
        }[modal.kind]}
      >
        {modal && modal.kind === 'newServer' && <NewServerForm onCreate={createServer} onClose={() => setModal(null)} />}
        {modal && modal.kind === 'qr' && <QrBody code={modal.code} />}
        {modal && modal.kind === 'single' && <SingleBuyoutForm onClose={() => setModal(null)} />}
        {modal && modal.kind === 'mass' && <MassBuyoutForm />}
        {modal && modal.kind === 'composer' && <ComposerForm onClose={() => setModal(null)} />}
        {modal && modal.kind === 'confirm' && (
          <ConfirmBody body={modal.body} confirm={modal.confirm} onOk={modal.onOk} onClose={() => setModal(null)} />
        )}
      </Modal>
    </div>
  );
}
