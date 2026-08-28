import { useEffect, useRef } from 'react';

/* Вкладка «Статистика». Состав блоков объявляет сам бот; пока он ничего не
   присылал — вкладка честно говорит, что данных нет, а не рисует пустые оси.

   График на canvas: точек бывает много, и полсотни DOM-узлов на линию —
   лишняя работа для браузера каждые пять секунд. */

function LineChart({ data, accent }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 600;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!data.length) {
      ctx.fillStyle = 'rgba(120,130,150,0.06)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#9aa3b0';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Нет данных', W / 2, H / 2 + 4);
      return;
    }

    const max = Math.max(...data.map((d) => d.v || 0), 1);
    const pad = { l: 30, r: 10, t: 10, b: 24 };
    const iW = W - pad.l - pad.r;
    const iH = H - pad.t - pad.b;
    const light = document.body.classList.contains('theme-light');

    ctx.strokeStyle = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
      const y = pad.t + iH * f;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    });

    const pts = data.map((d, i) => ({
      x: pad.l + (i / (data.length - 1 || 1)) * iW,
      y: pad.t + iH * (1 - (d.v || 0) / max),
    }));

    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + iH);
    grad.addColorStop(0, accent.fill);
    grad.addColorStop(1, accent.fade);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.lineTo(pts[pts.length - 1].x, pad.t + iH);
    ctx.lineTo(pts[0].x, pad.t + iH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = accent.line;
    ctx.lineWidth = 2;
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    ctx.fillStyle = light ? '#9aa3b0' : '#4a5568';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    const step = data.length <= 10 ? 1 : Math.ceil(data.length / 6);
    data.forEach((d, i) => {
      if (i % step === 0) ctx.fillText(d.label || '', pad.l + (i / (data.length - 1 || 1)) * iW, H - 4);
    });
  }, [data, accent]);

  return <canvas className="bt-chart" height="140" ref={ref} />;
}

function Delta({ s }) {
  if (s.delta === undefined || s.delta === null || s.delta === '') return null;
  const trend = s.trend || 'up';
  return (
    <div className={'bt-stat-delta ' + trend}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <polyline points={trend === 'down' ? '6 9 12 15 18 9' : '18 15 12 9 6 15'} />
      </svg>
      {String(s.delta)}
    </div>
  );
}

/** Совместимость: старый формат kpi/hourly/daily превращаем в блоки. */
export function statsBlocks(stats) {
  if (stats && Array.isArray(stats.blocks)) return stats.blocks;
  if (stats && (stats.kpi || stats.hourly || stats.daily)) {
    const blocks = [];
    if (stats.kpi) blocks.push({ type: 'kpi', items: stats.kpi });
    if (stats.hourly) blocks.push({ type: 'linechart', title: 'По дням', data: stats.hourly });
    if (stats.daily) blocks.push({ type: 'ranklist', title: 'Топ', items: stats.daily.map((d) => ({ title: d.label, value: d.v })) });
    return blocks;
  }
  return [];
}

export default function Stats({ stats }) {
  const blocks = statsBlocks(stats);
  if (!blocks.length) return <div className="bt-stats-empty">Бот ещё не передавал статистику</div>;

  /* Цвет графика берём от акцента приложения, а не своей константой —
     иначе при смене палитры линия остаётся от прошлой темы. */
  const css = getComputedStyle(document.body);
  const a = css.getPropertyValue('--accent').trim() || '#4c4fd8';
  const accent = { line: a, fill: mix(a, 0.3), fade: mix(a, 0) };

  return (
    <>
      {blocks.map((bl, i) => {
        if (bl.type === 'kpi') {
          return (
            <div className="bt-kpi-row" key={i}>
              {(bl.items || []).map((s, j) => (
                <div className="bt-stat-card" style={{ animationDelay: j * 0.06 + 's' }} key={j}>
                  <div className="bt-stat-val">{String(s.value)}</div>
                  <div className="bt-stat-label">{s.label}</div>
                  <div className="bt-stat-delta-slot"><Delta s={s} /></div>
                </div>
              ))}
            </div>
          );
        }
        if (bl.type === 'linechart') {
          return (
            <div className="bt-chart-card" key={i}>
              <div className="bt-chart-title">{bl.title || ''}</div>
              <LineChart data={bl.data || []} accent={accent} />
            </div>
          );
        }
        if (bl.type === 'ranklist') {
          const items = bl.items || [];
          return (
            <div className="bt-chart-card" key={i}>
              <div className="bt-chart-title">{bl.title || ''}</div>
              <ol className="bt-rank-list">
                {items.length ? items.map((it, k) => (
                  <li className="bt-rank-item" key={k}>
                    <span className="bt-rank-num">{k + 1}</span>
                    <span className="bt-rank-name">
                      {it.title || it.label || ''}
                      {it.sub ? <em>{it.sub}</em> : null}
                    </span>
                    <span className="bt-rank-val">{String(it.value !== undefined ? it.value : (it.v !== undefined ? it.v : ''))}</span>
                  </li>
                )) : <li className="bt-rank-empty">Нет данных</li>}
              </ol>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

/** #rrggbb → rgba с заданной прозрачностью. */
function mix(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(76,79,216,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}
