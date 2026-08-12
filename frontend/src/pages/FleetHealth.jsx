import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import Badge from '../components/Badge';
import { SkeletonBlock } from '../components/Skeleton';

const API = import.meta.env.VITE_API_URL || '';

export default function FleetHealth() {
  const { data, loading, reload } = useApi('/api/fleet-health', 30000);
  const [q, setQ] = useState('');
  const [st, setSt] = useState('all');
  const [busy, setBusy] = useState({});
  const [note, setNote] = useState('');

  const provs = useMemo(() => {
    let r = (data?.providers || []).filter(p =>
      (!q || (p.name || '').toLowerCase().includes(q.toLowerCase()) || (p.label || '').toLowerCase().includes(q.toLowerCase()) || (p.id || '').toLowerCase().includes(q.toLowerCase())) &&
      (st === 'all' || matches(p, st))
    );
    return r;
  }, [data, q, st]);

  const counts = useMemo(() => {
    const all = data?.providers || [];
    return {
      total: all.length,
      ok: all.filter(p => p.status === 'ok').length,
      invalid: all.filter(p => p.status === 'invalid').length,
      drained: all.filter(p => p.drained).length,
      other: all.filter(p => p.status !== 'ok' && p.status !== 'invalid' && !p.drained).length,
    };
  }, [data]);

  const recheck = async (id) => {
    setBusy(b => ({ ...b, [id]: true })); setNote('');
    try {
      const r = await fetch(`${API}/api/provider-recheck?id=${encodeURIComponent(id)}`, { method: 'POST' });
      const d = await r.json();
      setNote((d && d.ok) ? 'Recheck OK ✓ — status akan refresh 30s' : 'Recheck diproses (lihat flag apiKeyCheckStatus)');
      setTimeout(reload, 2000);
    } catch (e) { setNote('Error: ' + e.message); } finally { setBusy(b => ({ ...b, [id]: false })); }
  };

  const statusList = ['ok', 'invalid', 'drained'];

  return (
    <div className="page">
      <div className="kpis kpis-6">
        <div className="kpi featured"><div className="k-label">Total provider</div><div className="k-value tnum">{counts.total}</div><div className="k-context">fleet terdaftar</div></div>
        <div className="kpi"><div className="k-label">OK</div><div className="k-value tnum pos">{counts.ok}</div><div className="k-context">apiKey valid</div></div>
        <div className="kpi"><div className="k-label">Invalid</div><div className="k-value tnum neg">{counts.invalid}</div><div className="k-context">key rusak</div></div>
        <div className="kpi"><div className="k-label">Drained</div><div className="k-value tnum warn">{counts.drained}</div><div className="k-context">kuota habis</div></div>
        <div className="kpi"><div className="k-label">Lainnya</div><div className="k-value tnum">{counts.other}</div><div className="k-context">pending/unknown</div></div>
      </div>
      {note && <div className="batch-note">{note}</div>}

      <section className="panel">
        <div className="panel-head">
          <div><h2>Fleet health · per provider</h2><div className="sub">apiKeyCheckStatus + drained + used% · read-only monitor</div></div>
          <div className="dt-toolbar">
            <select className="inp" value={st} onChange={e => setSt(e.target.value)}>
              <option value="all">Semua status</option>
              {statusList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="dt-search" placeholder="cari provider…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <SkeletonBlock loading={loading} rows={6}>
          <table className="tbl">
            <thead><tr><th>Provider</th><th>Upstream</th><th>Status</th><th className="right">Used %</th><th className="right">Reset</th><th>Earning (lt)</th><th className="right">Model</th><th></th></tr></thead>
            <tbody>
              {provs.map((p, i) => (
                <tr key={i}>
                  <td><span className="prov-name">{p.name || p.id}</span></td>
                  <td><span className="prov-sub">{p.label}<div><span className="faint">{p.slug}</span></div></span></td>
                  <td>{statusBadge(p)}</td>
                  <td className="right tnum">{p.used_pct != null ? p.used_pct + '%' : '—'}</td>
                  <td className="right tnum">{p.reset || '—'}</td>
                  <td className="right tnum">${Number(p.earnings || 0).toFixed(3)}</td>
                  <td className="right tnum">{p.enabled ? 'on' : 'off'}</td>
                  <td className="right">
                    <button className="btn-ghost btn-sm" onClick={() => recheck(p.id)} disabled={busy[p.id]}>
                      {busy[p.id] ? '…' : 'Recheck'}
                    </button>
                  </td>
                </tr>
              ))}
              {!provs.length && !loading && <tr><td colSpan={8} className="dt-empty">Belum ada data.</td></tr>}
            </tbody>
            {loading && <tbody><tr><td colSpan={8} className="faint">Loading…</td></tr></tbody>}
          </table>
        </SkeletonBlock>
      </section>
    </div>
  );
}

function matches(p, s) {
  if (s === 'drained') return !!p.drained;
  return p.status === s;
}
function statusBadge(p) {
  if (p.status === 'ok' && !p.drained) return <Badge kind="ok">ok</Badge>;
  if (p.drained) return <Badge kind="drained">drained</Badge>;
  if (p.status === 'invalid') return <Badge kind="invalid">invalid</Badge>;
  return <Badge kind="neutral">{p.status || 'unknown'}</Badge>;
}
