import { memo, useCallback, useEffect, useRef, useState } from 'react';

/* Цвет шара на модуль: мишень узнаётся раньше, чем прочитана подпись.
   Пастельные тона разведены по кругу, ни один не наезжает на соседний. */
const TINT = {
  messenger: '#f0c9b3',
  channels: '#bfdcdd',
  servers: '#c3d3ea',
  bots: '#dbc6ea',
  wb: '#c2c9f0',
  valentine: '#f2c5d1',
  admin: '#e6cdc4',
  tasks: '#eed9ae',
  finance: '#cfdec6',
  logs: '#d9d5cd',
  stock: '#e9e0bb',
};
const TINT_FALLBACK = '#ddd9d0';
const PROFILE_TINT = '#ddd9d0';

/* Иконки берём из общей системы масок shell.css (.ico ico-18 ico-<name>) —
   отдельного набора у навигации нет и быть не должно. */
const ICON = {
  servers: 'servers', users: 'users', messenger: 'messenger', channels: 'channels',
  valentine: 'valentine', bots: 'bots', wb: 'wb',
};

const MOBILE = '(max-width: 768px)';
const REDUCED = '(prefers-reduced-motion: reduce)';

/* Веер раскрывается из угла: ось — вверх-вправо под 45°, разлёт по 44°
   в каждую сторону. Шире нельзя — шары уйдут за края экрана. */
const AXIS = -45;
const HALF = 44;

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

/* Раскладка по концентрическим дугам с равным шагом по длине дуги.
   Число дуг и распределение по ним считаются от количества шаров и от
   свободного места вокруг кнопки. Каждая дуга симметрична относительно оси,
   а сама ось и кнопка неподвижны — поэтому шар одного и того же модуля
   всегда оказывается на одном и том же месте. */
function layout(n, box) {
  const lim = (HALF * Math.PI) / 180;
  const arcs = [];
  for (let i = 0; i < 4; i++) {
    const r = box.r0 + i * box.rStep;
    if (r > box.maxR) break;
    const dA = box.step / r;
    arcs.push({ r, dA, cap: Math.max(1, Math.floor((2 * lim) / dA) + 1) });
  }
  if (!arcs.length) arcs.push({ r: box.r0, dA: box.step / box.r0, cap: n });

  let k = 1;
  let total = arcs[0].cap;
  while (total < n && k < arcs.length) { total += arcs[k].cap; k++; }
  const use = arcs.slice(0, k);
  const capSum = use.reduce((s, a) => s + a.cap, 0);

  const counts = use.map((a) => Math.max(1, Math.round((n * a.cap) / capSum)));
  let diff = n - counts.reduce((s, c) => s + c, 0);
  for (let pass = 0; diff !== 0 && pass < 60; pass++) {
    for (let j = use.length - 1; j >= 0; j--) {
      if (diff > 0 && counts[j] < use[j].cap) { counts[j]++; diff--; }
      else if (diff < 0 && counts[j] > 1) { counts[j]--; diff++; }
      if (diff === 0) break;
    }
  }

  const axis = (AXIS * Math.PI) / 180;
  const pts = [];
  use.forEach((a, ri) => {
    const m = counts[ri];
    const span = (m - 1) * a.dA;
    const start = axis - span / 2;
    for (let j = 0; j < m; j++) {
      const ang = start + j * a.dA;
      pts.push({
        x: Math.cos(ang) * a.r,
        y: Math.sin(ang) * a.r,
        /* Задержка растёт от оси наружу — веер распускается симметрично */
        d: ri * 74 + Math.abs(j - (m - 1) / 2) * 26,
      });
    }
  });
  return pts;
}

/* Плашка голосовой комнаты живёт вне React: её содержимое пишет модуль
   «Каналы» через getElementById('sidebarVoiceBar').innerHTML. React создаёт
   узел один раз и больше в него не заглядывает. */
const VoiceSlot = memo(function VoiceSlot() {
  return <div id="sidebarVoiceBar" className="sb-voice-bar" style={{ display: 'none' }} />;
});

export default function SideNav({ modules, active, unread, valentine, avatar, user, immersive }) {
  const isMobile = useMedia(MOBILE);
  const reduced = useMedia(REDUCED);

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const veilRef = useRef(null);
  const fabRef = useRef(null);
  const bubRefs = useRef({});
  const closeTimer = useRef(null);
  const fadeTimer = useRef(null);
  const guard = useRef(0);

  /* Порядок строго тот, что пришёл с сервера, плюс профиль последним.
     Никакой сортировки по частоте: место шара не должно меняться под
     пользователем, иначе в кольце каждый раз приходится искать заново. */
  const items = modules.map((m) => ({
    id: m.id,
    name: m.name,
    icon: ICON[m.icon] || 'servers',
    tint: TINT[m.id] || TINT_FALLBACK,
  }));
  items.push({
    id: '__profile',
    name: (user && (user.display_name || user.username)) || 'Профиль',
    profile: true,
    tint: PROFILE_TINT,
  });

  const timing = reduced
    ? { out: 300, back: 200, step: 14, drift: false }
    : { out: 460, back: 260, step: 26, drift: true };

  /* Центр веера берём из реального положения кнопки — так он сам учитывает
     безопасную зону снизу на телефоне, и подгонять руками нечего. */
  const geometry = useCallback(() => {
    const fab = fabRef.current;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = fab ? fab.getBoundingClientRect() : { left: 20, top: h - 76, width: 56, height: 56 };
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const cfg = isMobile
      ? { r0: 112, rStep: 84, step: 100 }
      : { r0: 152, rStep: 104, step: 112 };
    return {
      cx, cy,
      maxR: Math.min(w - cx - 60, cy - 76),
      r0: cfg.r0, rStep: cfg.rStep, step: cfg.step,
    };
  }, [isMobile]);

  const doOpen = useCallback(() => {
    const veil = veilRef.current;
    if (!veil) return;
    const bubs = items.map((it) => bubRefs.current[it.id]).filter(Boolean);
    const g = geometry();
    const pts = layout(bubs.length, g);

    clearTimeout(closeTimer.current);
    clearTimeout(fadeTimer.current);
    setOpen(true);
    setClosing(false);
    guard.current = Date.now() + 260;

    veil.getAnimations().forEach((a) => a.cancel());
    veil.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: Math.round(timing.out * 0.62), easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });

    bubs.forEach((b, i) => {
      const p = pts[i] || { x: 0, y: 0, d: 0 };
      b.style.left = g.cx + 'px';
      b.style.top = g.cy + 'px';
      b._to = { x: Math.round(p.x), y: Math.round(p.y), d: p.d };
      b.getAnimations().forEach((a) => a.cancel());
      const drift = b.firstChild;
      if (drift) drift.getAnimations().forEach((a) => a.cancel());

      b.animate(
        [
          { transform: 'translate(0px,0px) scale(.32)', opacity: 0 },
          { transform: `translate(${b._to.x}px,${b._to.y}px) scale(1)`, opacity: 1 },
        ],
        { duration: timing.out, delay: b._to.d * (timing.step / 26), easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }
      );

      if (drift && timing.drift) {
        /* Своя орбита у каждого шара: свой период и своя фаза — вместе это
           читается как облако частиц, а не как замерший список. */
        const ax = i % 3 === 0 ? 5 : i % 3 === 1 ? -4 : 3;
        const ay = i % 2 === 0 ? -5 : 4;
        drift.animate(
          [
            { transform: 'translate(0,0) rotate(0deg)' },
            { transform: `translate(${ax}px,${ay}px) rotate(${ax > 0 ? 1.1 : -1.1}deg)` },
          ],
          {
            duration: 3400 + ((i * 317) % 2200),
            delay: timing.out + b._to.d,
            direction: 'alternate',
            iterations: Infinity,
            easing: 'cubic-bezier(.45,0,.55,1)',
          }
        );
      }
    });
  }, [items, geometry, timing]);

  const doClose = useCallback((pick) => {
    const veil = veilRef.current;
    setOpen(false);
    setClosing(true);
    const bubs = items.map((it) => bubRefs.current[it.id]).filter(Boolean);
    let maxD = 0;
    bubs.forEach((b) => { maxD = Math.max(maxD, (b._to || { d: 0 }).d); });
    const span = timing.back + maxD * 0.45 * (timing.step / 26);

    if (veil) {
      veil.getAnimations().forEach((a) => a.cancel());
      /* Размытие снимается ровно за то же время, что летят шары, и с
         крошечной задержкой — кольцо уходит первым, фон проясняется следом. */
      veil.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: span, delay: 60, easing: 'cubic-bezier(.42,0,.62,1)', fill: 'both' });
    }

    bubs.forEach((b) => {
      const t = b._to || { x: 0, y: 0, d: 0 };
      const drift = b.firstChild;
      if (drift) drift.getAnimations().forEach((a) => a.cancel());
      b.getAnimations().forEach((a) => a.cancel());
      b.animate(
        [
          { transform: `translate(${t.x}px,${t.y}px) scale(1)`, opacity: 1 },
          { transform: 'translate(0px,0px) scale(.32)', opacity: 0 },
        ],
        { duration: timing.back, delay: (maxD - t.d) * 0.45 * (timing.step / 26), easing: 'cubic-bezier(.4,0,.7,.2)', fill: 'both' }
      );
    });

    clearTimeout(fadeTimer.current);
    /* Класс closing держит шары и размытие видимыми, пока они летят домой:
       без него CSS гасит их мгновенно и возврата просто не видно. */
    fadeTimer.current = setTimeout(() => setClosing(false), span + 120);

    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (!pick) return;
      if (pick === '__profile') { if (window.Shell) window.Shell.openProfile(); return; }
      if (window.Shell) window.Shell.switchModule(pick);
    }, span * 0.55);
  }, [items, timing]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && open) doClose(null);
      else if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (open) doClose(null); else doOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, doOpen, doClose]);

  /* Кнопка уезжает, когда на телефоне открыт чат или канал: там низ занят
     полем ввода, и она бы просто мешала. Возвращается вместе со списком. */
  const hidden = isMobile && !!immersive;
  useEffect(() => {
    if (hidden && open) doClose(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  useEffect(() => () => { clearTimeout(closeTimer.current); clearTimeout(fadeTimer.current); }, []);

  function onTilt(e) {
    if (reduced) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--rx', ((e.clientX - r.left) / r.width * 2 - 1).toFixed(3));
    el.style.setProperty('--ry', ((e.clientY - r.top) / r.height * 2 - 1).toFixed(3));
  }
  function offTilt(e) {
    e.currentTarget.style.setProperty('--rx', 0);
    e.currentTarget.style.setProperty('--ry', 0);
  }

  const cls = 'ho-nav' + (open ? ' open' : '') + (closing ? ' closing' : '') + (hidden ? ' hidden' : '');

  return (
    <div className={cls}>
      {/* Тычок мимо шара — кольцо сворачивается обратно */}
      <div
        className="ho-veil"
        ref={veilRef}
        onPointerDown={() => { if (open && Date.now() > guard.current) doClose(null); }}
      />

      <div className="ho-field">
        {items.map((it) => {
          const badge = it.id === 'messenger' ? unread : it.id === 'valentine' ? valentine : 0;
          return (
            <div
              className={'ho-bub' + (it.id === active ? ' on' : '')}
              key={it.id}
              ref={(el) => { if (el) bubRefs.current[it.id] = el; else delete bubRefs.current[it.id]; }}
            >
              <div className="ho-drift">
                <button
                  type="button"
                  className={'ho-orb' + (it.id === active ? ' on' : '')}
                  style={{ '--ho-orb-tint': it.tint }}
                  title={it.name}
                  onPointerMove={onTilt}
                  onPointerLeave={offTilt}
                  onClick={(e) => { e.stopPropagation(); doClose(it.id); }}
                >
                  <span className="ho-gl" />
                  {it.profile
                    ? (avatar
                      ? <img className="ho-ava-img" alt="" src={'data:image/jpeg;base64,' + avatar} />
                      : <span className="ho-ava">{(it.name || '?').charAt(0).toUpperCase()}</span>)
                    : <span className={'ico ico-18 ico-' + it.icon} />}
                  {badge > 0 && <span className="ho-tag">{badge > 99 ? '99+' : badge}</span>}
                </button>
                <span className="ho-cap">{it.name}</span>
              </div>
            </div>
          );
        })}
      </div>

      <VoiceSlot />

      <button
        className={'ho-fab' + (open ? ' open' : '')}
        type="button"
        ref={fabRef}
        aria-label="Приложения"
        aria-expanded={open}
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); if (open) doClose(null); else doOpen(); }}
      >
        <span className="ho-fab-cap">Приложения</span>
        <span className="ho-fab-gl" />
        <span className="ho-fab-dots"><i /><i /><i /><i /></span>
      </button>
    </div>
  );
}
