import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getContacts, getStickers, getReceived, getProfile, markRead, deleteValentine } from './api.js';
import { useMotionMode } from './motion.js';
import { HEART, T } from './icons.jsx';
import People from './People.jsx';
import Album from './Album.jsx';
import Compose from './Compose.jsx';
import Reveal from './Reveal.jsx';
import Hearts from './Hearts.jsx';
import SentFlight from './SentFlight.jsx';
import './app.css';

export default function App({ registerWSHandler }) {
  const motion = useMotionMode();
  const reduced = motion.reduced;
  const [view, setView] = useState('list');       // list | compose | viewer
  const [tab, setTab] = useState('create');
  const [contacts, setContacts] = useState(null); // null = ещё грузим
  const [stickers, setStickers] = useState([]);
  const [received, setReceived] = useState(null);
  const [target, setTarget] = useState(null);     // кому пишем
  const [opened, setOpened] = useState(null);     // {valentine, rect}
  const [toastMsg, setToastMsg] = useState(null);
  const [profile, setProfile] = useState(null);   // нужен для анимации отправки
  const [sentTo, setSentTo] = useState(null);     // кому только что отправили

  const tabsRef = useRef(null);
  const pillRef = useRef(null);
  const toastTimer = useRef(null);
  const pillPlaced = useRef(false);   // капсула ещё ни разу не позиционировалась
  const goTimer = useRef(null);

  /* Фаза перехода между экранами: 'out' — старый уходит, 'in' — новый
     появляется. Экраны не накладываются: новый монтируется только после
     того, как старый полностью ушёл. Исключение — просмотр признания:
     там карточка летит из своего места в списке, поэтому слои живут
     одновременно, а альбом гасится отдельно (класс vl-dim). */
  const [phase, setPhase] = useState('idle');
  /* Список остаётся смонтированным, пока карточка летит в просмотр: иначе
     шапка и вкладки исчезали бы мгновенно, рывком. */
  const [listLeaving, setListLeaving] = useState(false);
  /* Вкладки переключаются так же по очереди, как и экраны: панель сначала
     полностью уходит и только потом появляется вторая. */
  const [tabPhase, setTabPhase] = useState('idle');
  const tabTimer = useRef(null);

  function go(next, opts = {}) {
    if (opts.instant) { setView(next); setPhase('idle'); return; }
    clearTimeout(goTimer.current);
    setPhase('out');
    goTimer.current = setTimeout(() => {
      setView(next);
      setPhase('in');
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase('idle')));
    }, T.s);
  }

  function switchTab(next) {
    if (next === tab || tabPhase !== 'idle') return;
    clearTimeout(tabTimer.current);
    setTabPhase('out');
    tabTimer.current = setTimeout(() => {
      setTab(next);
      setTabPhase('in');
      requestAnimationFrame(() => requestAnimationFrame(() => setTabPhase('idle')));
    }, T.s);
  }

  const layerCls = 'vl-layer ' + (phase === 'out' ? 'vl-out' : phase === 'in' ? 'vl-in' : 'vl-settle');

  useEffect(() => () => {
    clearTimeout(goTimer.current); clearTimeout(toastTimer.current); clearTimeout(tabTimer.current);
  }, []);

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
      const [c, s, r, pr] = await Promise.all([getContacts(), getStickers(), getReceived(), getProfile()]);
      setContacts((c && c.contacts) || []);
      setStickers((s && s.stickers) || []);
      setReceived(Array.isArray(r) ? r : []);
      setProfile(pr || null);
    })();
    registerWSHandler((data) => { if (data.type === 'valentine') reloadReceived(); });
  }, [registerWSHandler, reloadReceived]);

  /* Индикатор вкладок перетекает между кнопками. Первую установку делаем
     без анимации: при возврате с другого экрана вкладку никто не переключал,
     и капсула не должна приезжать с левого края. */
  useLayoutEffect(() => {
    if (view !== 'list') return;
    const wrap = tabsRef.current;
    const pill = pillRef.current;
    if (!wrap || !pill) return;
    const active = wrap.querySelector('.vl-tab.vl-on');
    if (!active) return;

    const place = () => {
      pill.style.width = active.offsetWidth + 'px';
      pill.style.transform = `translateX(${active.offsetLeft}px)`;
    };

    if (!pillPlaced.current) {
      pill.classList.add('vl-instant');
      place();
      // Снимаем блокировку через кадр, иначе следующее переключение тоже не анимируется
      requestAnimationFrame(() => requestAnimationFrame(() => pill.classList.remove('vl-instant')));
      pillPlaced.current = true;
    } else {
      place();
    }
  }, [tab, view, received]);

  // Уходя со списка, забываем позицию — при возврате её снова ставим без анимации
  useEffect(() => { if (view !== 'list') pillPlaced.current = false; }, [view]);

  const unread = (received || []).filter((v) => !v.read).length;

  function openValentine(v, e) {
    const face = e && e.currentTarget ? e.currentTarget : null;
    const rect = !reduced && face ? face.getBoundingClientRect() : null;
    if (!v.read) {
      setReceived((prev) => (prev || []).map((x) => (x.id === v.id ? { ...x, read: true } : x)));
      markRead(v.id);
    }
    setOpened({ valentine: { ...v, read: true }, rect });
    /* Просмотр — единственный переход без очереди: карточка должна вылететь
       из своего места в списке. Поэтому список остаётся смонтированным и
       плавно гаснет целиком — шапка, вкладки и остальные карточки, — пока
       выбранная летит в центр. */
    setPhase('idle');
    setListLeaving(true);
    setView('viewer');
    setTimeout(() => setListLeaving(false), T.l);
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
    if (fromViewer) { setOpened(null); setTab('received'); go('list'); }

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
      <Hearts paused={reduced} />

      {(view === 'list' || listLeaving) && (
        <div className={view === 'list' ? layerCls : 'vl-layer vl-out vl-slowout'}>
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
              onClick={() => switchTab('create')}
            >Создать</button>
            <button
              role="tab" aria-selected={tab === 'received'}
              className={'vl-tab' + (tab === 'received' ? ' vl-on' : '')}
              onClick={() => switchTab('received')}
            >
              Признания{unread > 0 && <span className="vl-cnt">{unread}</span>}
            </button>
          </div>

          {/* Видна ровно одна панель: вторая монтируется только после того,
              как первая полностью ушла. */}
          <div className="vl-panes">
            <div className={'vl-pane vl-single ' + (tabPhase === 'out' ? 'vl-out' : tabPhase === 'in' ? 'vl-in' : 'vl-settle')}>
              {tab === 'create' ? (
                <People contacts={contacts} onPick={(c) => { setTarget(c); go('compose'); }} />
              ) : (
                <Album
                  received={received}
                  dimFor={opened ? opened.valentine.id : null}
                  onOpen={openValentine}
                  onDelete={(id) => removeValentine(id, false)}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'compose' && target && (
        <div className={layerCls}>
          <Compose
            contact={target}
            stickers={stickers}
            toast={toast}
            onCancel={() => { go('list'); setTimeout(() => setTarget(null), T.s); }}
            onDone={(who) => {
              setSentTo(who);            // покажем полёт сердца вместо строки в тосте
              setTab('create');
              go('list');
              setTimeout(() => setTarget(null), T.s);
            }}
          />
        </div>
      )}

      {view === 'viewer' && opened && (
        <div className={layerCls}>
          <Reveal
            valentine={opened.valentine}
            originRect={opened.rect}
            reduced={reduced}
            onClose={() => { setTab('received'); go('list'); setTimeout(() => setOpened(null), T.s); }}
            onDelete={(id) => removeValentine(id, true)}
          />
        </div>
      )}

      {sentTo && (
        <SentFlight me={profile} to={sentTo} reduced={reduced} onDone={() => setSentTo(null)} />
      )}

      {motion.showHint && (
        <div className="vl-toast vl-show">
          <span>В системе отключены анимации, поэтому переходы показаны без движения.</span>
          <button onClick={motion.enable}>Включить</button>
          <button className="vl-quiet" onClick={motion.dismiss} aria-label="Больше не показывать">✕</button>
        </div>
      )}

      {!motion.showHint && toastMsg && (
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
