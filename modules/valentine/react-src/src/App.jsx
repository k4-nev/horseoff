import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getContacts, getStickers, getReceived, markRead, deleteValentine } from './api.js';
import { useReducedMotion } from './motion.js';
import { HEART, T } from './icons.jsx';
import People from './People.jsx';
import Album from './Album.jsx';
import Compose from './Compose.jsx';
import Reveal from './Reveal.jsx';
import './app.css';

export default function App({ registerWSHandler }) {
  const [reduced, enableMotion] = useReducedMotion();
  const [view, setView] = useState('list');       // list | compose | viewer
  const [tab, setTab] = useState('create');
  const [contacts, setContacts] = useState(null); // null = ещё грузим
  const [stickers, setStickers] = useState([]);
  const [received, setReceived] = useState(null);
  const [target, setTarget] = useState(null);     // кому пишем
  const [opened, setOpened] = useState(null);     // {valentine, rect}
  const [toastMsg, setToastMsg] = useState(null);

  const tabsRef = useRef(null);
  const pillRef = useRef(null);
  const toastTimer = useRef(null);

  const toast = useCallback((msg, action) => {
    setToastMsg({ msg, action });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4800);
  }, []);

  const reloadReceived = useCallback(async () => {
    const data = await getReceived();
    setReceived(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    (async () => {
      const [c, s, r] = await Promise.all([getContacts(), getStickers(), getReceived()]);
      setContacts((c && c.contacts) || []);
      setStickers((s && s.stickers) || []);
      setReceived(Array.isArray(r) ? r : []);
    })();
    registerWSHandler((data) => { if (data.type === 'valentine') reloadReceived(); });
  }, [registerWSHandler, reloadReceived]);

  // Индикатор вкладок перетекает между кнопками
  useLayoutEffect(() => {
    if (view !== 'list') return;
    const wrap = tabsRef.current;
    const pill = pillRef.current;
    if (!wrap || !pill) return;
    const active = wrap.querySelector('.vl-tab.vl-on');
    if (!active) return;
    pill.style.width = active.offsetWidth + 'px';
    pill.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  }, [tab, view, received]);

  const unread = (received || []).filter((v) => !v.read).length;

  function openValentine(v, e) {
    const face = e && e.currentTarget ? e.currentTarget : null;
    const rect = !reduced && face ? face.getBoundingClientRect() : null;
    if (!v.read) {
      setReceived((prev) => (prev || []).map((x) => (x.id === v.id ? { ...x, read: true } : x)));
      markRead(v.id);
    }
    setOpened({ valentine: { ...v, read: true }, rect });
    // Даём альбому кадр на затухание, пока карточка уже летит
    setTimeout(() => setView('viewer'), 0);
  }

  /* Удаление отложенное: карточка уходит из списка сразу, но на сервер
     запрос летит только когда истечёт окно отмены. Иначе «Вернуть» было бы
     обманом — на сервере запись уже удалена и восстановить её нечем. */
  function removeValentine(id, fromViewer) {
    const list = received || [];
    const idx = list.findIndex((v) => v.id === id);
    if (idx < 0) return;
    const backup = list[idx];
    setReceived(list.filter((v) => v.id !== id));
    if (fromViewer) { setOpened(null); setView('list'); setTab('received'); }

    let undone = false;
    const commit = setTimeout(async () => {
      if (undone) return;
      const r = await deleteValentine(id);
      if (!r || r.status !== 'ok') {
        setReceived((prev) => { const next = [...(prev || [])]; next.splice(idx, 0, backup); return next; });
        toast('Не удалось удалить — признание вернулось на место');
      }
    }, 4600);

    toast('Признание удалено', {
      label: 'Вернуть',
      run: () => {
        undone = true;
        clearTimeout(commit);
        setReceived((prev) => { const next = [...(prev || [])]; next.splice(idx, 0, backup); return next; });
      },
    });
  }

  return (
    <div id="vl-root" className={reduced ? 'vl-reduce' : ''}>
      {view === 'list' && (
        <div className="vl-layer vl-settle">
          <div className="vl-head">
            <div>
              <h1>Валентинки</h1>
              <div className="vl-sub">
                {tab === 'create' ? 'Кому сегодня признаемся?' : 'Всё, что тебе присылали — как альбом наклеек'}
              </div>
            </div>
            <div className="vl-mark">{HEART}</div>
          </div>

          <div className="vl-tabs" ref={tabsRef} role="tablist">
            <span className="vl-tabpill" ref={pillRef} />
            <button
              role="tab" aria-selected={tab === 'create'}
              className={'vl-tab' + (tab === 'create' ? ' vl-on' : '')}
              onClick={() => setTab('create')}
            >Создать</button>
            <button
              role="tab" aria-selected={tab === 'received'}
              className={'vl-tab' + (tab === 'received' ? ' vl-on' : '')}
              onClick={() => setTab('received')}
            >
              Признания{unread > 0 && <span className="vl-cnt">{unread}</span>}
            </button>
          </div>

          {/* Обе панели живут одновременно — поэтому они перетекают друг в друга */}
          <div className="vl-panes">
            <div className={'vl-pane' + (tab === 'create' ? '' : ' vl-hidden')}>
              <People contacts={contacts} onPick={(c) => { setTarget(c); setView('compose'); }} />
            </div>
            <div className={'vl-pane' + (tab === 'received' ? '' : ' vl-hidden')}>
              <Album
                received={received}
                dimFor={opened ? opened.valentine.id : null}
                onOpen={openValentine}
                onDelete={(id) => removeValentine(id, false)}
              />
            </div>
          </div>
        </div>
      )}

      {view === 'compose' && target && (
        <div className="vl-layer vl-settle">
          <Compose
            contact={target}
            stickers={stickers}
            toast={toast}
            onCancel={() => { setView('list'); setTarget(null); }}
            onDone={() => { setView('list'); setTarget(null); setTab('create'); }}
          />
        </div>
      )}

      {view === 'viewer' && opened && (
        <div className="vl-layer vl-settle">
          <Reveal
            valentine={opened.valentine}
            originRect={opened.rect}
            reduced={reduced}
            onClose={() => { setOpened(null); setView('list'); setTab('received'); }}
            onDelete={(id) => removeValentine(id, true)}
          />
        </div>
      )}

      {reduced && (
        <div className="vl-toast vl-show" style={{ bottom: 26 }}>
          <span>В системе отключены анимации, поэтому переходы показаны мгновенными.</span>
          <button onClick={enableMotion}>Показать движение</button>
        </div>
      )}

      {!reduced && toastMsg && (
        <div className="vl-toast vl-show">
          <span>{toastMsg.msg}</span>
          {toastMsg.action && (
            <button onClick={() => { setToastMsg(null); toastMsg.action.run(); }}>{toastMsg.action.label}</button>
          )}
        </div>
      )}
    </div>
  );
}
