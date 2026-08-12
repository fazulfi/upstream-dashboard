import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useApi, usd, usdIdr } from '../hooks/useApi';
import KpiCard from '../components/KpiCard';
import EarningsChart from '../components/EarningsChart';
import { SkeletonBlock } from '../components/Skeleton';

const RANGES = [
  { id: '1m', label: '1m' }, { id: '5m', label: '5m' }, { id: '15m', label: '15m' },
  { id: '1h', label: '1h' }, { id: '3h', label: '3h' }, { id: '6h', label: '6h' },
  { id: '12h', label: '12h' }, { id: '24h', label: '24h' },
  { id: '1w', label: '1w' }, { id: '1mo', label: '1mo' }, { id: 'all', label: 'All time' },
];

export default function Dashboard() {
  const { data } = useOutletContext();
  const [range, setRange] = useState('1h');
  const { data: hist, loading: histLoading } = useApi(`/api/history?range=${range}`);
  const { data: histAll } = useApi('/api/history?range=all');
  const { data: earningAll } = useApi('/api/earnings-alltime', 15000);

  if (!data) return <div className="page-loading">Loading…</div>;
  const bal = data.balances || {};
  const fin = data.finance || {};
  const fleet = data.fleet_summary || {};
  const trend = data.trend?.earnings_usdc || [];

  const candles = hist?.deltas || [];
  const totalInterval = hist?.total_interval_earning ?? null;
  const candleSpan = hist?.candle_span_s ?? null;
  const candleCount = hist?.candles ?? candles.length;

  // Real earning PUBLISHER all-time = balance + withdrawals (total uang yang benar-benar masuk)
  // = $147.90. publisher_lifetime hanya snapshot provider aktif, bukan total seumur hidup.
  const earningAllTime = earningAll?.earning_alltime ?? null;
  const nWithdrawals = earningAll?.n_withdrawals ?? 0;
  const balanceUsdc = earningAll?.balance ?? bal.publisher_earnings;

  // fleet summary per upstream (cards only, no table)
  const summary = {};
  const rows = (fleet?.raw) || (data?.fleet_summary?.raw) || [];
  rows.forEach(r => {
    if (!r || !r.slug) return;
    summary[r.slug] = summary[r.slug] || { slug: r.slug, label: r.label || r.slug, t: 0, ok: 0, dr: 0, inv: 0 };
    const x = summary[r.slug]; x.t++;
    if (r.status === 'invalid') x.inv++;
    else if (r.drained && r.status === 'ok') x.dr++;
    else x.ok++;
  });
  const sumArr = Object.values(summary).sort((a, b) => a.slug.localeCompare(b.slug));

  return (
    <div className="page">
      <div className="kpis">
        <KpiCard featured label="Net income · all time" value={usd(fin.net_income)} sub={idr(fin.net_income, fin.kurs)} />
        <KpiCard label="Real earning · all time" value={usd(earningAllTime)} sub={idr(earningAllTime, fin.kurs)} />
        <KpiCard label="Fleet active" value={`${fleet.ok_total} / ${fleet.total}`} sub="providers aktif" />
        <KpiCard label="Modal · total" value={usd(fin.total_capital_usd)} sub={idr(fin.total_capital_usd, fin.kurs)} />
        <KpiCard label="Total payout" value={usd(fin.total_payout)} sub={idr(fin.total_payout, fin.kurs)} />
      </div>

      <section className="panel chart-panel">
        <div className="panel-head chart-head">
          <div>
            <h2>Real income trend</h2>
            <div className="sub">
              {candleCount} candles · {candleSpan ? `${fmtInterval(candleSpan)} per candle` : 'per interval'}
              {range !== 'all' && ` · ${range} range`}
            </div>
          </div>
          <div className="range-pills" role="tablist" aria-label="Time range">
            {RANGES.map(r => (
              <button key={r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>
            ))}
          </div>
        </div>
        <div className="chart-meta">
          <span className="cm-label faint">Real income in range</span>
          <span className="cm-value tnum">{usd(totalInterval)}</span>
          <span className="cm-range faint">{candleCount} candles · {range === 'all' ? 'all time' : range}</span>
        </div>
        <SkeletonBlock loading={histLoading} rows={3}>
          <div className="chart-body tall"><EarningsChart data={candles} /></div>
        </SkeletonBlock>
      </section>

      {/* Fleet summary — aggregate cards only; per-account details on Upstreams page */}
      <section className="panel fleet-panel">
        <div className="panel-head">
          <div>
            <h2>Upstream fleet</h2>
            <div className="sub">Aggregate health · per-account details on Upstreams</div>
          </div>
        </div>
        <SkeletonBlock loading={!rows.length} rows={4}>
          <div className="fleet-summary">
            {sumArr.map(s => (
              <div className="fsum" key={s.slug}>
                <div className="fsum-name">{s.slug}</div>
                <div className="fsum-counts">
                  <span className="fs-total tnum">{s.t}</span>
                  <span className="fs-ok">{s.ok} ok</span>
                  {s.dr > 0 && <span className="fs-warn">{s.dr} drained</span>}
                  {s.inv > 0 && <span className="fs-bad">{s.inv} invalid</span>}
                </div>
              </div>
            ))}
          </div>
        </SkeletonBlock>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Profit &amp; loss</h2><div className="sub">ringkasan · detail lengkap di Profit &amp; Loss</div></div></div>
        <div className="pnl">
          <div className="pl-row"><span className="lbl">Revenue · settlements</span><span className="amt tnum pos">{usdIdr(fin.total_payout, fin.kurs)}</span></div>
          <div className="pl-row"><span className="lbl">Total modal · aset</span><span className="amt tnum">{fin.total_capital_usd != null ? usdIdr(fin.total_capital_usd, fin.kurs) : '—'}</span></div>
          <div className="pl-row total"><span className="lbl">Net income</span><span className={`amt tnum ${fin.net_income >= 0 ? 'pos' : 'neg'}`}>{usdIdr(fin.net_income, fin.kurs)}</span></div>
          <div className="pl-row fx"><span className="lbl">FX rate</span><span className="amt tnum faint">{usd(1)} ≈ {Number(fin.kurs || 0).toLocaleString('id-ID')} IDR</span></div>
        </div>
      </section>
    </div>
  );
}

const idr1 = (v, kurs) => (v == null || !kurs ? '' : 'Rp ' + Math.round(Number(v) * Number(kurs)).toLocaleString('id-ID'));
const fmtInterval = s => s >= 3600 ? `${s / 3600}h` : s >= 60 ? `${s / 60}m` : `${s}s`;
const idr = (v, kurs) => (v == null || !kurs ? '—' : 'Rp ' + Math.round(Number(v) * Number(kurs)).toLocaleString('id-ID'));
