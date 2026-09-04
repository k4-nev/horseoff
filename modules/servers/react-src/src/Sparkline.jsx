const W = 62;
const H = 16;

export default function Sparkline({ values, cls }) {
  const n = values.length;
  if (n < 2) return <div className="spark-empty" />;
  const pts = values.map((v, i) => {
    const x = (i / (n - 1)) * W;
    const y = H - 1 - Math.max(0, Math.min(1, v / 100)) * (H - 2);
    return [x, y];
  });
  const line = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = '0,' + H + ' ' + line + ' ' + W + ',' + H;
  return (
    <svg className={'spark ' + cls} width={W} height={H} viewBox={'0 0 ' + W + ' ' + H}>
      <polygon className="spark-area" points={area} />
      <polyline className="spark-line" points={line} />
    </svg>
  );
}
