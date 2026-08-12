import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * EarningsChart — hero area chart (riset: 1 chart utama untuk trend, tidak boros).
 * Pakai ResponsiveContainer dengan parent height tetap (240px) + chart-inner absolute.
 */
export default function EarningsChart({ data }) {
  const series = Array.isArray(data) ? data : [];
  if (series.length < 2) {
    return (
      <div className="chart-empty">
        <span>Belum ada data untuk rentang ini — data sedang terkumpul.</span>
      </div>
    );
  }
  const chartData = series.map((v, i) => ({ i, usdc: v }));
  const fmt = (v) => '$' + (v == null ? '0' : Number(v).toFixed(2));

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
            <XAxis dataKey="i" tick={false} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmt} tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
            <Tooltip
              formatter={fmt}
              labelFormatter={() => ''}
              contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }}
            />
            <Area type="monotone" dataKey="usdc" stroke="var(--accent)" strokeWidth={2} fill="url(#earnGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
