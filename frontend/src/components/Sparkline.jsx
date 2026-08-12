/**
 * Sparkline — mini area/line chart satu warna, tanpa axis. Untuk konteks tren di KPI.
 * Data: array angka. Render native SVG (ringan, cepat, tadinya honky — ganti pakai recharts utk besar).
 */

export default function Sparkline({ data, color = 'var(--accent)', height = 32, width = 120 }) {
  if (!data || data.length < 2) {
    return <div className="sparkline empty" style={{ height, width }} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = Math.max(1, Math.floor(data.length / 60));
  const pts = data.filter((_, i) => i % step === 0)
    .map((v, i, arr) => {
      const x = (i / (arr.length - 1)) * width;
      const y = height - 3 - ((v - min) / range) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
  const line = pts.join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  const gradId = 'sp-' + (color + '').replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
