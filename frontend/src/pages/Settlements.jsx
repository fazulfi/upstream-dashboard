import { useApi, usd } from '../hooks/useApi';
import { SkeletonBlock } from '../components/Skeleton';

export default function Settlements() {
  const { data, loading } = useApi('/api/payouts');
  const payouts = data?.payouts || [];

  return (
    <div className="page">
      <div className="kpis compact">
        <div className="kpi featured">
          <div className="k-label">Total settled</div>
          <div className="k-value tnum">{usd(data?.total ?? 0)}</div>
          <div className="k-context"><span className="delta up">↑ {data?.count || 0} settlements</span></div>
        </div>
        <div className="kpi">
          <div className="k-label">Settlement count</div>
          <div className="k-value tnum">{data?.count ?? 0}</div>
          <div className="k-context">paid out</div>
        </div>
        <div className="kpi">
          <div className="k-label">Status</div>
          <div className="delta up" style={{ fontSize: 26, fontWeight: 600, marginTop: 2 }}>Paid</div>
          <div className="k-context"><span className="delta up">↑ confirmed — all USDC on-chain</span></div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>Payout history</h2><div className="sub">{payouts.length} settlements · USDC</div></div><span className="live-pill"><i></i>recorded</span></div>
        <SkeletonBlock loading={loading} rows={6}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Reference</th><th className="right">Amount (USDC)</th></tr></thead>
            <tbody>
              {payouts.map((p, i) => (
                <tr key={i}>
                  <td><span className="mono tnum">{p.date || '—'}</span></td>
                  <td><span className="prov-name">{p.note || p.ref || 'settlement'}</span></td>
                  <td className="right mono tnum strong">+{usd(p.usd)}</td>
                </tr>
              ))}
              {payouts.length === 0 && <tr><td colSpan={3} className="dt-empty">No settlements recorded yet.</td></tr>}
            </tbody>
          </table>
        </SkeletonBlock>
      </section>
    </div>
  );
}
