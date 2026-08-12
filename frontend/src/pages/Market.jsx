import { useState, useMemo } from 'react';
import { useApi, usd } from '../hooks/useApi';
import { SkeletonBlock } from '../components/Skeleton';

const num2 = n => n == null ? '—' : '$' + Number(n).toFixed(4);

export default function Market() {
  const { data: market, loading } = useApi('/api/market', 20000);
  const { data: pricing } = useApi('/api/pricing-config', 20000);
  const [q, setQ] = useState('');
  const [fam, setFam] = useState('all');
  const [sort, setSort] = useState('spread'); // spread | minask | model

  const models = useMemo(() => {
    if (!market?.models) return [];
    return market.models;
  }, [market]);

  const fams = useMemo(() => [...new Set(models.map(m => m.family))], [models]);

  const rows = useMemo(() => {
    let r = models.filter(m =>
      (fam === 'all' || m.family === fam) &&
      (!q || m.slug.toLowerCase().includes(q.toLowerCase()))
    );
    const cmp = {
      spread: (a, b) => (b.maxAskIn - b.minAskIn) - (a.maxAskIn - a.minAskIn),
      minask: (a, b) => a.minAskIn - b.minAskIn,
      model: (a, b) => a.slug.localeCompare(b.slug),
    }[sort];
    return [...r].sort(cmp);
  }, [models, fam, q, sort]);

  // KPI
  const totalModels = models.length;
  const cheapest = models.reduce((a, b) => (b.minAskIn < a.minAskIn ? b : a), models[0] || { minAskIn: Infinity });
  const priciest = models.reduce((a, b) => (b.officialIn > a.officialIn ? b : a), models[0] || {});
  const avgSpread = models.length
    ? models.reduce((s, m) => s + (m.maxAskIn - m.minAskIn), 0) / models.length
    : 0;

  return (
    <div className="page">
      {/* Pricing rules — read-only, dasar math margin */}
      <section className="panel">
        <div className="panel-head"><div><h2>Pricing rules · platform</h2><div className="sub">aturan monetisasi — dasar margin</div></div></div>
        <div className="sum-grid">
          <div className="sum-cell"><div className="sum-label">Max ask cap</div><div className="sum-value tnum">{pricing && pricing.max_ask_pct != null ? (pricing.max_ask_pct * 100) + '%' : '—'}</div><div className="sum-sub">dari harga official</div></div>
          <div className="sum-cell"><div className="sum-label">Platform fee</div><div className="sum-value tnum">{pricing && pricing.platform_fee_pct != null ? (pricing.platform_fee_pct * 100) + '%' : '—'}</div><div className="sum-sub">dipotong dari gross</div></div>
          <div className="sum-cell"><div className="sum-label">Publisher share</div><div className="sum-value tnum">{pricing && pricing.publisher_share_pct != null ? pricing.publisher_share_pct + '%' : '—'}</div><div className="sum-sub">net ≈ ask × 0.8</div></div>
          <div className="sum-cell"><div className="sum-label">Net share per Mtoken</div><div className="sum-value tnum">{pricing && pricing.publisher_share_pct != null ? (pricing.publisher_share_pct / 100).toFixed(2) + '×' : '—'}</div><div className="sum-sub">take-home dari ask</div></div>
        </div>
      </section>

      {/* KPI bar */}
      <div className="kpis">
        <div className="kpi featured"><div className="k-label">Total models pasar</div><div className="k-value tnum">{totalModels}</div><div className="k-context">{fams.length} family</div></div>
        <div className="kpi"><div className="k-label">Termurah min ask</div><div className="k-value tnum">{cheapest.minAskIn != null ? '$' + Number(cheapest.minAskIn).toFixed(4) : '—'}</div><div className="k-context">{cheapest.slug || ''}</div></div>
        <div className="kpi"><div className="k-label">Spread avg (in)</div><div className="k-value tnum">${avgSpread.toFixed(3)}</div><div className="k-context">max − min per model</div></div>
        <div className="kpi"><div className="k-label">Snapshot age</div><div className="k-value tnum">{market?.ts ? Math.round((Date.now() - market.ts) / 1000) + 's' : '—'}</div><div className="k-context">live refresh 20s</div></div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div><h2>Market price</h2><div className="sub">min/max ask + last rate per model · $/Mtoken</div></div>
          <div className="dt-toolbar">
            <input className="dt-search" placeholder="cari model…" value={q} onChange={e => setQ(e.target.value)} />
            <select className="inp" value={fam} onChange={e => setFam(e.target.value)}>
              <option value="all">Semua family</option>
              {fams.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <SkeletonBlock loading={!market} rows={6}>
          <table className="tbl">
            <thead><tr>
              <th onClick={() => setSort('model')}>Model</th><th className="right">Min $ in</th><th className="right">Max $ in</th><th className="right">Last rate</th><th className="right">Spread</th>
            </tr></thead>
            <tbody>
              {rows.map((m, i) => (
                <tr key={i}>
                  <td><span className="prov-name">{m.slug}</span><div className="prov-sub">{m.family}</div></td>
                  <td className="right tnum">{num2(m.minAskIn)}</td>
                  <td className="right tnum">{num2(m.maxAskIn)}</td>
                  <td className="right tnum strong">{m.lastRate != null ? '$' + Number(m.lastRate).toFixed(4) : '—'}</td>
                  <td className="right tnum faint">${(m.maxAskIn - m.minAskIn).toFixed(3)}</td>
                </tr>
              ))}
              {!rows.length && !loading && <tr><td colSpan={5} className="dt-empty">Belum ada data.</td></tr>}
            </tbody>
          </table>
        </SkeletonBlock>
      </section>
    </div>
  );
}
