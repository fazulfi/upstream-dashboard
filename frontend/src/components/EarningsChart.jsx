import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtTs } from '../lib/fmt';

/**
 * EarningsChart — hero area chart (riset: 1 chart utama untuk trend, tidak boros).
 * P0-2 fix: sumbu X = WAKTU nyata (bukan indeks). Terima startEpoch (ms) & spanS utk label.
 * Tooltip tampilkan label waktu candle.
 */
export default function EarningsChart({ data, startEpoch = null, spanS = 60 }) {
  const series = Array.isArray(data) ? data : [];
  if (series.length < 2) {
    return (
      <div className="chart-empty">
        <span>Belum ada data untuk rentang ini — data sedang terkumpul.</span>
      </div>
    );
  }
  const chartData = series.map((v, i) => ({
    i,
    usdc: v,
    ts: startEpoch ? new Date(startEpoch + i * spanS * 1000) : null,
  }));
  const fmt = (v) => '$' + (v == null ? '0' : Number(v).toFixed(2));
  // Label sumbu: kalau span <= 1h -> HH:mm; lebih -> dd MMM (padat).
  const tickFmt = (i) => {
    const d = chartData[i] && chartData[i].ts;
    if (!d) return '';
    const pad = n => String(n).padStart(2, '0');
    return spanS <= 3600 ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getDate()}/${d.getMonth() + 1}`;
  };
  const labelFmt = (i) => {
    const d = chartData[i] && chartData[i].ts;
    return d ? fmtTs(d.toISOString()) : '';
  };

  return (
    <div className="chart-wrap" role="img" aria-label="Publisher earnings trend">
      <div className="chart-inner">
        <ResponsiveContainer width="100%" height="100%" debounce={100}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="i" tickFormatter={tickFmt} tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis tickFormatter={fmt} tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
            <Tooltip
              formatter={(val) => fmt(val)}
              labelFormatter={labelFmt}
              contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }}
            />
            <Area type="monotone" dataKey="usdc" stroke="var(--accent)" strokeWidth={2} fill="url(#earnGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
