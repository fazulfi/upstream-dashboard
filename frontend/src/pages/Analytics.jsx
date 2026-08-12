import { useState } from 'react';
import { useApi, usd } from '../hooks/useApi';
import Badge from '../components/Badge';
import { SkeletonBlock } from '../components/Skeleton';

const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'all', label: 'All time' },
];

export default function Analytics() {
  const [range, setRange] = useState('all');
  const { data: pa, loading } = useApi(`/api/publisher-analytics?range=${range}`, 15000);
  const { data: mr } = useApi('/api/model-ranking', 30000);

  const byUp = pa?.by_upstream || [];
  const totalEarnRange = pa?.total_earning_range ?? pa?.total_earning ?? 0;
  const totalProv = pa?.total_providers || 0;
  const rows = mr?.rows || [];
  const totalReq = mr?.total_requests || 0;
  return (
    <div className="page">
      {/* Publisher earnings by upstream */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Earnings by upstream · publisher</h2>
            <div className="sub">
              {byUp.length} upstreams · <b>{usd(totalEarnRange)}</b> dalam range · {totalProv} providers · live
            </div>
          </div>
          <div className="range-pills" role="tablist" aria-label="Time range">
            {RANGES.map(r => (
              <button key={r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>
            ))}
          </div>
        </div>
        <SkeletonBlock loading={loading} rows={4}>
          <table className="tbl">
            <thead>
              <tr><th>Upstream</th><th className="right">Providers</th><th className="right">Active</th><th className="right">Drained</th><th className="right">Invalid</th><th className="right">Avg usage</th><th className="right">Earnings ({range === 'all' ? 'all-time' : range})</th><th className="right">Share</th></tr>
            </thead>
            <tbody>
              {byUp.map((u, i) => {
                // SELALU pakai earn_range + total_earning_range agar header & tabel sinkron
                const earn = u.earn_range ?? 0;
                const base = totalEarnRange;
                const share = base > 0 ? (earn / base) * 100 : 0;
                return (
                  <tr key={i}>
                    <td><span className="prov-name">{u.label}</span><div className="prov-sub">{u.slug}</div></td>
                    <td className="right tnum">{u.n}</td>
                    <td className="right tnum pos">{u.ok}</td>
                    <td className="right tnum warn">{u.drained}</td>
                    <td className="right tnum neg">{u.invalid}</td>
                    <td className="right tnum faint">{fmtPct(u.avg_used_pct)}</td>
                    <td className="right tnum strong">{usd(earn)}</td>
                    <td className="right tnum faint">{share.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {!byUp.length && !loading && <tr><td colSpan={8} className="dt-empty">Belum ada data.</td></tr>}
            </tbody>
          </table>
        </SkeletonBlock>
      </section>

      {/* Model ranking — requests & pricing */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Model ranking · popularitas</h2>
            <div className="sub">{rows.length} models · {fmtTok(totalReq)} total request · publisher demand data</div>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>#</th><th>Model</th><th className="right">Active Provs</th><th className="right">Total Requests</th><th className="right">Avg $ in</th><th className="right">Avg $ out</th><th className="right">Est Volume</th><th className="right">Status</th></tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={i}>
                <td className="tnum faint">{i + 1}</td>
                <td><span className="prov-name">{m.model}</span><div className="prov-sub">{m.status === 'available' ? 'available' : 'limited'}</div></td>
                <td className="right tnum">{m.active_providers}</td>
                <td className="right tnum strong">{fmtTok(m.requests)}</td>
                <td className="right tnum">{avg(m.avg_price_in)}</td>
                <td className="right tnum">{avg(m.avg_price_out)}</td>
                <td className="right tnum">{usd(m.est_earning)}</td>
                <td className="right"><Badge kind={m.status === 'available' ? 'ok' : 'drained'}>{m.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const num = n => (n == null ? '—' : Number(n).toFixed(3));
const avg = n => (n == null ? '—' : Number(n).toFixed(4));
const fmtTok = n => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const fmtPct = n => (n == null ? '—' : Number(n).toFixed(1) + '%');
