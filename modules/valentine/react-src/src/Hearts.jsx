import { useEffect, useRef } from 'react';

/* Фоновые сердца на canvas.
   Раньше это были эмодзи с одинаковой linear-анимацией — читалось дёшево и
   однообразно. Здесь у каждой частицы своя скорость, амплитуда и период
   покачивания, свой наклон и медленное вращение, а прозрачность плавно
   нарастает и гаснет по краям экрана. Canvas вместо DOM: полсотни
   анимированных узлов в потоке заставляли бы браузер пересчитывать
   раскладку, здесь же всё рисуется вне неё. */

function heartPath(ctx, x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0.35);
  ctx.bezierCurveTo(0, 0.05, -0.5, -0.15, -0.5, -0.5);
  ctx.bezierCurveTo(-0.5, -0.85, -0.1, -0.9, 0, -0.55);
  ctx.bezierCurveTo(0.1, -0.9, 0.5, -0.85, 0.5, -0.5);
  ctx.bezierCurveTo(0.5, -0.15, 0, 0.05, 0, 0.35);
  ctx.closePath();
  ctx.restore();
}

const TINTS = ['#F4A9B8', '#EFC0CA', '#E9909F', '#F7D2D9', '#DE8FA0'];
const rnd = (a, b) => a + Math.random() * (b - a);

export default function Hearts({ paused }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0;
    let h = 0;
    let parts = [];

    const spawn = (atBottom) => ({
      x: rnd(0.04, 0.96),
      y: atBottom ? rnd(1.02, 1.35) : rnd(0, 1.2),
      size: rnd(9, 26),
      rise: rnd(0.012, 0.032),          // доля высоты в секунду
      swayAmp: rnd(0.008, 0.05),
      swayPeriod: rnd(3.2, 8.5),
      phase: rnd(0, Math.PI * 2),
      tilt: rnd(-0.5, 0.5),
      spin: rnd(-0.22, 0.22),
      alpha: rnd(0.22, 0.5),
      tint: TINTS[Math.floor(Math.random() * TINTS.length)],
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Плотность по площади, чтобы на телефоне не было каши
      const target = Math.max(10, Math.min(26, Math.round((w * h) / 52000)));
      while (parts.length < target) parts.push(spawn(false));
      parts.length = target;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); // при возврате из фона не «телепортируем»
      last = now;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.y -= p.rise * dt;
        p.phase += (Math.PI * 2 / p.swayPeriod) * dt;
        p.tilt += p.spin * dt;
        if (p.y < -0.12) parts[i] = spawn(true);

        const px = (p.x + Math.sin(p.phase) * p.swayAmp) * w;
        const py = p.y * h;
        // Мягко гасим у краёв, чтобы сердца не «обрубались» появлением
        const edge = Math.min(1, Math.min(p.y * 6, (1.05 - p.y) * 3.2));
        ctx.globalAlpha = Math.max(0, p.alpha * edge);
        ctx.fillStyle = p.tint;
        heartPath(ctx, px, py, p.size, p.tilt);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };

    if (paused) {
      // Режим «меньше движения»: рисуем один статичный кадр
      resize();
      ctx.clearRect(0, 0, w, h);
      parts.forEach((p) => {
        ctx.globalAlpha = p.alpha * 0.7;
        ctx.fillStyle = p.tint;
        heartPath(ctx, p.x * w, p.y * h, p.size, p.tilt);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [paused]);

  return <canvas className="vl-hearts" ref={ref} aria-hidden="true" />;
}
