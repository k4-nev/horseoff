import { useEffect, useRef } from 'react';

/* Фон ленты сообщений: несколько крупных размытых пятен и мелкая «пыль»,
   которые медленно плывут и слегка смещаются вслед за курсором. Приём тот же,
   что у сердец в «Признаниях», но задача обратная: там фон — украшение и его
   видно, здесь он должен только давать ощущение глубины и не мешать читать.
   Отсюда и ограничения: непрозрачность в пределах пары процентов, скорости
   в разы ниже, оттенки — от акцента приложения, а не собственная палитра.

   Canvas, а не DOM: пятна такого размера в потоке заставляли бы браузер
   перерисовывать ленту на каждом кадре прокрутки. */

const rnd = (a, b) => a + Math.random() * (b - a);

/** Акцент из темы — чтобы фон менялся вместе с ним, а не жил своей жизнью. */
function accentRGB(el) {
  const raw = getComputedStyle(el).getPropertyValue('--accent').trim();
  const probe = document.createElement('span');
  probe.style.color = raw || '#4c4fd8';
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/\d+/g);
  probe.remove();
  return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [76, 79, 216];
}

export default function Backdrop({ scrollRef }) {
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

    const [ar, ag, ab] = accentRGB(canvas);
    const tint = (a) => 'rgba(' + ar + ',' + ag + ',' + ab + ',' + a + ')';

    /* Курсор и прокрутка ленты двигают слои с разной силой — из этого и
       получается ощущение объёма, а не просто ползающие пятна. */
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let scrollShift = 0;

    const spawnBlob = () => ({
      x: rnd(-0.1, 1.1),
      y: rnd(-0.1, 1.1),
      r: rnd(0.22, 0.5),          // доля меньшей стороны
      dx: rnd(-0.009, 0.009),     // доля ширины в секунду
      dy: rnd(-0.007, 0.007),
      depth: rnd(0.3, 1),
      alpha: rnd(0.03, 0.075),
      warm: Math.random() < 0.35, // часть пятен уводим в холодный синий
    });

    const spawnDust = () => ({
      x: rnd(0, 1),
      y: rnd(0, 1),
      r: rnd(1, 2.4),
      dy: rnd(-0.012, -0.004),
      dx: rnd(-0.004, 0.004),
      depth: rnd(0.6, 1.8),
      alpha: rnd(0.05, 0.13),
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // фон, детали не нужны
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const nb = w < 620 ? 4 : 6;
      const nd = Math.max(8, Math.min(22, Math.round((w * h) / 46000)));
      while (blobs.length < nb) blobs.push(spawnBlob());
      blobs.length = nb;
      while (dust.length < nd) dust.push(spawnDust());
      dust.length = nd;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (dt) => {
      ctx.clearRect(0, 0, w, h);
      const side = Math.min(w, h);

      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2.2);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2.2);

      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        b.x += b.dx * dt;
        b.y += b.dy * dt;
        if (b.x < -0.35) b.x = 1.35; else if (b.x > 1.35) b.x = -0.35;
        if (b.y < -0.35) b.y = 1.35; else if (b.y > 1.35) b.y = -0.35;

        const px = b.x * w + pointer.x * 26 * b.depth;
        const py = b.y * h + pointer.y * 20 * b.depth + scrollShift * 14 * b.depth;
        const rr = b.r * side;
        const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0, b.warm ? 'rgba(120,150,205,' + b.alpha + ')' : tint(b.alpha));
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < dust.length; i++) {
        const d = dust[i];
        d.x += d.dx * dt;
        d.y += d.dy * dt;
        if (d.y < -0.05) { d.y = 1.05; d.x = rnd(0, 1); }
        if (d.x < -0.05) d.x = 1.05; else if (d.x > 1.05) d.x = -0.05;
        const px = d.x * w + pointer.x * 40 * d.depth;
        const py = d.y * h + pointer.y * 30 * d.depth + scrollShift * 26 * d.depth;
        ctx.fillStyle = tint(d.alpha);
        ctx.beginPath();
        ctx.arc(px, py, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
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

    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      scrollShift *= 1 - Math.min(1, dt * 3); // сдвиг от прокрутки затухает сам
      draw(dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      if (list) list.removeEventListener('scroll', onScroll);
    };
  }, [scrollRef]);

  return <canvas className="msg-backdrop" ref={ref} aria-hidden="true" />;
}
