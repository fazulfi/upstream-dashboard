import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtTs } from '../lib/fmt';

/**
 * EarningsChart — hero area chart (riset: 1 chart utama untuk trend, tidak boros).
 * P0-2 fix: sumbu X = WAKTU nyata (bukan indeks). Terima startEpoch (ms) & spanS utk label.
 * Rev3 fix: label X = "dd MMM HH:mm" kalau total rentang > 1 hari, else "HH:mm".
 * Tooltip: fmtTs (zona lokal user).
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  const totalSpanS = series.length * spanS;
  const useDate = totalSpanS > 24 * 3600; // > 1 hari total -> sertakan tanggal
  const tickFmt = (i) => {
    const d = chartData[i] && chartData[i].ts;
    if (!d) return '';
    const pad = n => String(n).padStart(2, '0');
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    if (useDate) return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${hh}:${mm}`;
    return `${hh}:${mm}`;
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
