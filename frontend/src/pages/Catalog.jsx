import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { SkeletonBlock } from '../components/Skeleton';

const num2 = v => v == null ? '—' : Number(v).toFixed(2);
const askRange = arr => {
  if (!arr || !arr.length) return '—';
  const nums = arr.map(Number).filter(n => !isNaN(n));
  if (!nums.length) return '—';
  const mn = Math.min(...nums), mx = Math.max(...nums);
  return mn === mx ? '$' + mn.toFixed(3) : '$' + mn.toFixed(3) + ' – ' + mx.toFixed(3);
};

export default function Catalog() {
  const { data, loading } = useApi('/api/catalog', 30000);
  const [q, setQ] = useState('');

  const ups = data?.upstreams || [];
  const rows = useMemo(() => {
    const out = [];
    for (const u of ups) {
      const subs = (u.models || []).filter(m => !q || (m.upstreamModelId || '').toLowerCase().includes(q.toLowerCase()) || (u.label || '').toLowerCase().includes(q.toLowerCase()));
      for (const m of subs) {
        out.push({ up: u, m });
      }
    }
    return out;
  }, [ups, q]);

  const totalProv = ups.reduce((s, u) => s + (u.activeProviders || 0), 0);
  const totalModels = ups.reduce((s, u) => s + (u.models || []).length, 0);

  return (
    <div className="page">
      {/* Fleet capacity summary */}
      <div className="kpis">
        <div className="kpi featured"><div className="k-label">Total upstream</div><div className="k-value tnum">{ups.length}</div><div className="k-context">katalog aktif</div></div>
        <div className="kpi"><div className="k-label">Total providers aktif</div><div className="k-value tnum">{totalProv}</div><div className="k-context">kapasitas fleet</div></div>
        <div className="kpi"><div className="k-label">Total model opsi</div><div className="k-value tnum">{totalModels}</div><div className="k-context">semua upstream</div></div>
        <div className="kpi"><div className="k-label">Upstream ada demand</div><div className="k-value tnum">{ups.filter(u => (u.activeProviders || 0) > 0).length}</div><div className="k-context">activeProviders &gt; 0</div></div>
      </div>

      {/* Upstream cards */}
      <div className="upstream-cards">
        {ups.map(u => (
          <div className="ucard" key={u.id}>
            <div className="ucard-head">
              <span className="prov-name">{u.label}</span>
              <BadgeUF enabled={u.enabled && !u.upstreamDisabled} />
            </div>
            <div className="ucard-body">
              <div className="ucard-metric"><span className="ucard-label">Active</span><span className="ucard-value tnum">{u.activeProviders}</span></div>
              <div className="ucard-metric"><span className="ucard-label">Models</span><span className="ucard-value tnum">{(u.models || []).length}</span></div>
              <div className="ucard-metric"><span className="ucard-label">Disabled</span><span className="ucard-value tnum">{(u.models || []).filter(m => m.modelDisabled).length}</span></div>
            </div>
            <div className="prov-sub" style={{ padding: '0 14px 10px' }}>{u.prefix}<span style={{ opacity: .55 }}> / {u.status || ''}</span></div>
          </div>
        ))}
      </div>

      {/* Capacity table */}
      <section className="panel">
        <div className="panel-head">
          <div><h2>Capacity · per upstream × model</h2><div className="sub">activeProviders + ask range per model · read-only (toggle experimental)</div></div>
          <div className="dt-toolbar"><input className="dt-search" placeholder="cari model/upstream…" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        <SkeletonBlock loading={loading} rows={6}>
          <table className="tbl">
            <thead><tr><th>Upstream</th><th className="right">Active provs</th><th className="right">Models</th><th>Model id</th><th className="right">Asks $ in</th><th className="right">Official $ in</th><th>Cache</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><span className="prov-name">{r.up.label}</span><div className="prov-sub">{r.up.prefix}</div></td>
                  <td className="right tnum">{r.up.activeProviders}</td>
                  <td className="right tnum">{r.up.models.length}</td>
                  <td><span className="prov-name">{r.m.upstreamModelId}</span></td>
                  <td className="right tnum">{askRange(r.m.asksIn)}</td>
                  <td className="right tnum">{num2(r.m.officialIn)}</td>
                  <td>{r.m.supportsCache ? <BadgeUF enabled /> : <span className="badge badge-neutral">no</span>}</td>
                </tr>
              ))}
              {!rows.length && !loading && <tr><td colSpan={7} className="dt-empty">Belum ada data.</td></tr>}
            </tbody>
          </table>
        </SkeletonBlock>
      </section>
    </div>
  );
}

const BadgeUF = ({ enabled }) => enabled ? <span className="badge badge-ok">enabled</span> : <span className="badge badge-warn">off</span>;
