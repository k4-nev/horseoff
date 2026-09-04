/* Статистика на мок-данных: график — детерминированная синусоида, чтобы
   форма не прыгала между перерисовками. Реальные цифры придут с бэкендом. */

const DAYS = 14;
const W = 560;
const H = 120;

const series = (seed) => Array.from({ length: DAYS }, (_, i) => 20 + Math.round(30 * Math.abs(Math.sin(i * 0.7 + seed)) + i));

const LINES = [
  { c: '#16a34a', d: series(1), name: 'Покупки' },
  { c: '#2563eb', d: series(2.4), name: 'Отзывы' },
  { c: '#c98a04', d: series(4), name: 'Регистрации' },
];

export default function TabStats({ server, servers }) {
  const kpis = [
    { l: 'Всего аккаунтов', v: server.accounts.length, d: '+3', up: true },
    { l: 'Активных', v: server.accounts.filter((a) => a.status === 'активен').length, d: '+1', up: true },
    { l: 'В работе', v: 4, d: '−1', up: false },
    { l: 'Ошибок', v: 2, d: '+2', up: false },
  ];

  const max = Math.max(...LINES.flatMap((x) => x.d));
  const path = (arr) => arr.map((v, i) => `${((i / (DAYS - 1)) * W).toFixed(1)},${(H - (v / max) * H).toFixed(1)}`).join(' ');

  const bars = servers.length ? servers : [server];
  const barMax = Math.max(...bars.map((x) => x.accounts.length), 1);

  return (
    <>
      <div className="mp-kpi-row">
        {kpis.map((k) => (
          <div className="mp-kpi" key={k.l}>
            <div className="mp-kpi-lbl">{k.l}</div>
            <div className="mp-kpi-val">{k.v}</div>
            <div className={'mp-kpi-delta ' + (k.up ? 'up' : 'down')}>{k.d} за неделю</div>
          </div>
        ))}
      </div>

      <div className="mp-card">
        <div className="mp-sec-h">
          <h3>Активность за 14 дней</h3>
          <span className="mp-spacer" />
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {LINES.map((l, i) => (
              <span key={l.name}>
                <span style={{ color: l.c }}>●</span> {l.name}{i < LINES.length - 1 ? '  ' : ''}
              </span>
            ))}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 140 }} preserveAspectRatio="none">
          {LINES.map((x) => (
            <polyline key={x.name} points={path(x.d)} fill="none" stroke={x.c} strokeWidth="2" strokeLinejoin="round" />
          ))}
        </svg>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="mp-card">
          <div className="mp-sec-h" style={{ marginBottom: 12 }}><h3>По серверам</h3></div>
          {bars.map((x) => (
            <div className="mp-bar-row" key={x.id}>
              <span className="mp-bar-lbl">{x.name}</span>
              <div className="mp-bar-track"><div style={{ width: (x.accounts.length / barMax) * 100 + '%' }} /></div>
              <span className="mp-bar-val">{x.accounts.length}</span>
            </div>
          ))}
        </div>
        <div className="mp-card">
          <div className="mp-sec-h" style={{ marginBottom: 12 }}><h3>По артикулам</h3></div>
          {server.products.map((p, i) => (
            <div className="mp-bar-row" key={p.id}>
              <span className="mp-bar-lbl">{p.keyword}</span>
              <div className="mp-bar-track"><div style={{ width: (90 - i * 18) + '%' }} /></div>
              <span className="mp-bar-val">{40 - i * 7}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
