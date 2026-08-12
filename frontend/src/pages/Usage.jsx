import { useState, useMemo } from 'react';
import { useApi, usd } from '../hooks/useApi';
import Badge from '../components/Badge';
import { SkeletonBlock } from '../components/Skeleton';

const RANGES = [
  { id: '24h', label: '24h' }, { id: '7d', label: '7d' }, { id: '30d', label: '30d' }, { id: 'all', label: 'All time' },
];
const fmtTok = n => n == null ? '—' : Number(n).toLocaleString('en-US');
const emd = n => (n == null || n === '') ? '—' : Number(n).toFixed(4);

// Usage page = CONSUMER data. Honest labels: Usage / Cost / Spend — NOT earnings.

export default function Usage() {
  const [range, setRange] = useState('30d');
  const { data: bd, loading } = useApi(`/api/breakdown?range=${range}`, 20000);
  const { data: cs } = useApi(`/api/usage/cache-stats?range=${range}`, 30000);
  const { data: logs } = useApi(`/api/usage/logs?range=${range}&pageSize=50`, 30000);
  const { data: models } = useApi(`/api/usage/logs-models?range=${range}`, 60000);

  const byProv = bd?.byProvider || [];
  // dedupe by (key,label)
  const byProvModel = useMemo(() => {
    const seen = new Map();
    for (const p of (bd?.byProviderModel || [])) {
      const k = (p.model || p.key || '') + '|' + (p.providerLabel || p.label || '');
      if (!seen.has(k)) seen.set(k, p);
    }
    return [...seen.values()];
  }, [bd]);

  const totalCost = byProv.reduce((s, p) => s + Number(p.costUsdc || 0), 0);
  const totalReqs = byProv.reduce((s, p) => s + (p.reqs || 0), 0);
  const cacheRows = cs?.rows || [];
  const hitRate = cs?.totals?.hitRate;
  const logRows = logs?.rows || [];

  return (
    <div className="page">
      <div className="kpis">
        <div className="kpi featured"><div className="k-label">Consumer cost (range)</div><div className="k-value tnum">${totalCost.toFixed(2)}</div><div className="k-context">{range} · usage spend</div></div>
        <div className="kpi"><div className="k-label">Total requests</div><div className="k-value tnum">{fmtTok(totalReqs)}</div><div className="k-context">di range ini</div></div>
        <div className="kpi"><div className="k-label">Cache hit rate</div><div className="k-value tnum">{hitRate != null ? (hitRate * 100).toFixed(1) + '%' : '—'}</div><div className="k-context">prompt cache</div></div>
        <div className="kpi"><div className="k-label">Cache saved</div><div className="k-value tnum">{logs?.totalSavedUsdc != null ? usd(logs.totalSavedUsdc) : '—'}</div><div className="k-context">hemat via cache</div></div>
      </div>

      <div className="range-pills" role="tablist" aria-label="Time range" style={{ marginBottom: 16 }}>
        {RANGES.map(r => (
          <button key={r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>
        ))}
      </div>

      <div className="pnl-grid">
        {/* Spend by provider */}
        <section className="panel">
          <div className="panel-head"><div><h2>Spend by provider</h2><div className="sub">consumer usage cost · bukan earning</div></div></div>
          <SkeletonBlock loading={loading} rows={5}>
            <table className="tbl">
              <thead><tr><th>Provider</th><th className="right">Reqs</th><th className="right">In tok</th><th className="right">Out tok</th><th className="right">Cost $</th></tr></thead>
              <tbody>
                {byProv.map((p, i) => (
                  <tr key={i}>
                    <td><span className="prov-name">{p.providerLabel}</span><div className="prov-sub">{p.prefix}</div></td>
                    <td className="right tnum">{fmtTok(p.reqs)}</td>
                    <td className="right tnum">{fmtTok(p.inputTokens)}</td>
                    <td className="right tnum">{fmtTok(p.outputTokens)}</td>
                    <td className="right tnum strong">${Number(p.costUsdc).toFixed(3)}</td>
                  </tr>
                ))}
                {!byProv.length && !loading && <tr><td colSpan={5} className="dt-empty">Belum ada data.</td></tr>}
              </tbody>
            </table>
          </SkeletonBlock>
        </section>

        {/* Cache stats */}
        <section className="panel">
          <div className="panel-head"><div><h2>Cache stats</h2><div className="sub">prompt-cache hit per model</div></div></div>
          <table className="tbl">
            <thead><tr><th>Model</th><th className="right">Reqs</th><th className="right">Cached tok</th><th className="right">Hit %</th></tr></thead>
            <tbody>
              {cacheRows.map((c, i) => {
                const hit = c.promptTokens > 0 ? (c.cachedTokens / c.promptTokens) * 100 : 0;
                return (
                  <tr key={i}>
                    <td><span className="prov-name">{c.label}</span></td>
                    <td className="right tnum">{fmtTok(c.reqs)}</td>
                    <td className="right tnum">{fmtTok(c.cachedTokens)}</td>
                    <td className="right tnum pos">{hit.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {!cacheRows.length && <tr><td colSpan={4} className="dt-empty">Belum ada data.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      {/* Spend by provider-model */}
      <section className="panel">
        <div className="panel-head"><div><h2>Spend by model</h2><div className="sub">consumer usage breakdown · dedupe</div></div></div>
        <table className="tbl">
          <thead><tr><th>Model</th><th className="right">Reqs</th><th className="right">In tok</th><th className="right">Out tok</th><th className="right">Cost $</th></tr></thead>
          <tbody>
            {byProvModel.slice(0, 40).map((p, i) => (
              <tr key={i}>
                <td><span className="prov-name">{p.model || p.label || p.key}</span></td>
                <td className="right tnum">{fmtTok(p.reqs)}</td>
                <td className="right tnum">{fmtTok(p.inputTokens)}</td>
                <td className="right tnum">{fmtTok(p.outputTokens)}</td>
                <td className="right tnum strong">${Number(p.costUsdc || 0).toFixed(3)}</td>
              </tr>
            ))}
            {!byProvModel.length && <tr><td colSpan={5} className="dt-empty">Belum ada data.</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Usage logs */}
      <section className="panel">
        <div className="panel-head"><div><h2>Usage logs</h2><div className="sub">request terbaru · {logRows.length} baris · label cost</div></div></div>
        <table className="tbl">
          <thead><tr><th>Time</th><th>Status</th><th>Model</th><th className="right">In</th><th className="right">Out</th><th className="right">Cost $</th></tr></thead>
          <tbody>
            {logRows.map((r, i) => (
              <tr key={i}>
                <td className="tnum faint">{r.ts ? new Date(r.ts).toLocaleTimeString('id-ID') : '—'}</td>
                <td><Badge kind={r.status === 'ok' ? 'ok' : r.http_status === 429 ? 'drained' : 'warn'}>{r.status || r.http_status}</Badge></td>
                <td><span className="prov-name">{r.model}</span><div className="prov-sub">{r.upstream_label}</div></td>
                <td className="right tnum">{fmtTok(r.prompt_tokens)}</td>
                <td className="right tnum">{fmtTok(r.completion_tokens)}</td>
                <td className="right tnum strong">${Number(r.cost_consumer_usdc || 0).toFixed(4)}</td>
              </tr>
            ))}
            {!logRows.length && <tr><td colSpan={6} className="dt-empty">Belum ada data.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
