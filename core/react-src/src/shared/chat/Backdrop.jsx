import { useEffect, useRef } from 'react';
import './backdrop.css';

/* Живой фон ленты сообщений.

   Приём тот же, что у сердец в «Признаниях», но задача другая: фон должен
   давать ощущение глубины и не мешать читать. Отсюда ограничения —
   непрозрачность заметно ниже текста, оттенки от акцента приложения, тридцать
   кадров в секунду (каждый кадр стоит десятка радиальных градиентов).

   Общий слой у модулей один, различается рисунок поверх пятен:
     dust  — редкая пыль точками («Сообщения»);
     rings — редкие круги, медленно расходящиеся от случайных точек, как
             от капли на воде («Каналы»).
   Разный рисунок нужен, чтобы два чата не путались между собой боковым
   зрением: у них одна геометрия и почти одна палитра.

   Canvas, а не DOM: пятна такого размера в потоке заставляли бы браузер
   перерисовывать ленту на каждом кадре прокрутки. */

const rnd = (a, b) => a + Math.random() * (b - a);

/** Акцент из темы — чтобы фон менялся вместе с ним, а не жил своей жизнью. */
function accentRGB(el) {
  const raw = getComputedStyle(el).getPropertyValue('--chat-accent').trim()
    || getComputedStyle(el).getPropertyValue('--accent').trim();
  const probe = document.createElement('span');
  probe.style.color = raw || '#4c4fd8';
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/\d+/g);
  probe.remove();
  return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [76, 79, 216];
}

export default function Backdrop({ scrollRef, variant = 'dust' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0;
    let h = 0;
    let blobs = [];
    let dust = [];
    let rings = [];

    const [ar, ag, ab] = accentRGB(canvas);
    const tint = (a) => 'rgba(' + ar + ',' + ag + ',' + ab + ',' + a + ')';

    /* Курсор и прокрутка двигают слои с разной силой — из этого и получается
       ощущение объёма, а не просто ползающие пятна. */
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let scrollShift = 0;

    const spawnBlob = () => ({
      x: rnd(-0.1, 1.1),
      y: rnd(-0.1, 1.1),
      r: rnd(0.16, 0.4),
      dx: rnd(-0.016, 0.016),
      dy: rnd(-0.013, 0.013),
      depth: rnd(0.3, 1),
      alpha: rnd(0.07, 0.135),
      warm: Math.random() < 0.35,
    });

    const spawnDust = () => ({
      x: rnd(0, 1),
      y: rnd(0, 1),
      r: rnd(1.4, 3.4),
      dy: rnd(-0.026, -0.008),
      dx: rnd(-0.008, 0.008),
      depth: rnd(0.6, 1.8),
      alpha: rnd(0.1, 0.24),
      halo: Math.random() < 0.18,
    });

    /* Круг расходится от своей точки и гаснет к краю — как от капли. У
       каждого своя скорость и предельный радиус, стартуют они вразнобой,
       поэтому картинка не пульсирует в такт. */
    const spawnRing = (mid) => ({
      x: rnd(0.08, 0.92),
      y: rnd(0.08, 0.92),
      // mid=true — первый набор рождается уже подросшим, чтобы при открытии
      // канала фон не начинался с пустоты
      r: mid ? rnd(0.05, 0.75) : 0,
      max: rnd(0.42, 0.95),
      speed: rnd(0.022, 0.05),
      width: rnd(1.1, 2.6),
      depth: rnd(0.35, 1.1),
      alpha: rnd(0.1, 0.2),
      warm: Math.random() < 0.4,
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const nb = w < 620 ? 7 : 11;
      while (blobs.length < nb) blobs.push(spawnBlob());
      blobs.length = nb;

      if (variant === 'rings') {
        const nr = w < 620 ? 5 : 8;
        while (rings.length < nr) rings.push(spawnRing(true));
        rings.length = nr;
        dust.length = 0;
      } else {
        const nd = Math.max(20, Math.min(52, Math.round((w * h) / 16000)));
        while (dust.length < nd) dust.push(spawnDust());
        dust.length = nd;
        rings.length = 0;
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const drawBlobs = (dt) => {
      const side = Math.min(w, h);
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        b.x += b.dx * dt;
        b.y += b.dy * dt;
        if (b.x < -0.35) b.x = 1.35; else if (b.x > 1.35) b.x = -0.35;
        if (b.y < -0.35) b.y = 1.35; else if (b.y > 1.35) b.y = -0.35;

        const px = b.x * w + pointer.x * 54 * b.depth;
        const py = b.y * h + pointer.y * 42 * b.depth + scrollShift * 30 * b.depth;
        const rr = b.r * side;
        const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0, b.warm ? 'rgba(104,138,200,' + b.alpha + ')' : tint(b.alpha));
        g.addColorStop(0.55, b.warm ? 'rgba(104,138,200,' + (b.alpha * 0.42).toFixed(3) + ')' : tint(b.alpha * 0.42));
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawDust = (dt) => {
      for (let i = 0; i < dust.length; i++) {
        const d = dust[i];
        d.x += d.dx * dt;
        d.y += d.dy * dt;
        if (d.y < -0.05) { d.y = 1.05; d.x = rnd(0, 1); }
        if (d.x < -0.05) d.x = 1.05; else if (d.x > 1.05) d.x = -0.05;
        const px = d.x * w + pointer.x * 74 * d.depth;
        const py = d.y * h + pointer.y * 56 * d.depth + scrollShift * 48 * d.depth;
        if (d.halo) {
          const g = ctx.createRadialGradient(px, py, 0, px, py, d.r * 5);
          g.addColorStop(0, tint(d.alpha));
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, d.r * 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = tint(d.alpha);
        ctx.beginPath();
        ctx.arc(px, py, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawRings = (dt) => {
      const side = Math.min(w, h);
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        r.r += r.speed * dt;
        if (r.r > r.max) { rings[i] = spawnRing(false); continue; }
        const t = r.r / r.max;
        // Гаснет к краю и чуть подрастает в толщине — так круг «уходит»
        const a = r.alpha * (1 - t) * Math.min(1, t * 6);
        if (a <= 0.002) continue;
        const px = r.x * w + pointer.x * 46 * r.depth;
        const py = r.y * h + pointer.y * 36 * r.depth + scrollShift * 30 * r.depth;
        ctx.beginPath();
        ctx.arc(px, py, r.r * side, 0, Math.PI * 2);
        ctx.strokeStyle = r.warm ? 'rgba(104,138,200,' + a.toFixed(4) + ')' : tint(a.toFixed(4));
        ctx.lineWidth = r.width * (1 + t);
        ctx.stroke();
      }
    };

    const draw = (dt) => {
      ctx.clearRect(0, 0, w, h);
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2.2);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2.2);
      drawBlobs(dt);
      if (variant === 'rings') drawRings(dt); else drawDust(dt);
    };

    if (reduce) {
      // «Меньше движения»: один статичный кадр, глубина остаётся, движение уходит
      draw(0);
      return () => ro.disconnect();
    }

    const onPointer = (e) => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    // На телефоне курсора нет — там глубину даёт прокрутка ленты
    const list = scrollRef && scrollRef.current;
    let lastTop = list ? list.scrollTop : 0;
    const onScroll = () => {
      const top = list.scrollTop;
      scrollShift = Math.max(-1, Math.min(1, (top - lastTop) / 260));
      lastTop = top;
    };
    if (list) list.addEventListener('scroll', onScroll, { passive: true });

    /* Тридцати кадров фону хватает: движение медленное, а каждый кадр — это
       десяток радиальных градиентов, и на телефоне их лучше рисовать вдвое
       реже, чем отнимать кадры у прокрутки ленты. */
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      acc += dt;
      if (acc >= 0.031) {
        scrollShift *= 1 - Math.min(1, acc * 3);
        draw(acc);
        acc = 0;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      if (list) list.removeEventListener('scroll', onScroll);
    };
  }, [scrollRef, variant]);

  // Рисунок подписан в разметке: так видно, какой из модулей что показывает
  return <canvas className="ho-backdrop" data-variant={variant} ref={ref} aria-hidden="true" />;
}
