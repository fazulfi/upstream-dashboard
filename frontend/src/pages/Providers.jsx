import { useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import DataTable from '../components/DataTable';
import Badge from '../components/Badge';

const usd = v => '$' + (v == null ? '0.00' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function Providers() {
  const { data } = useApi('/api/data');
  const fleet = data?.fleet_summary || {};
  const rows = fleet.rows || [];
  const [slug, setSlug] = useState(null);

  const summary = useMemo(() => {
    const s = {};
    rows.forEach(r => {
      s[r.slug] = s[r.slug] || { slug: r.slug, label: r.label || r.slug, t: 0, ok: 0, dr: 0, inv: 0, earn: 0 };
      const x = s[r.slug]; x.t++;
      if (r.status === 'invalid') x.inv++;
      else if (r.drained && r.status === 'ok') x.dr++;
      else x.ok++;
      x.earn += Number(r.earnings || 0);
    });
    return Object.values(s).sort((a, b) => a.slug.localeCompare(b.slug));
  }, [rows]);

  const filtered = useMemo(() => slug ? rows.filter(r => r.slug === slug) : rows, [rows, slug]);

  const columns = useMemo(() => [
    { id: 'provider', header: 'Provider', accessorFn: r => r.name,
      cell: ({ row }) => (<div className="cell-provider"><div className="prov-name">{row.original.name}</div><div className="prov-sub">{row.original.slug} · {row.original.label}</div></div>) },
    { id: 'status', header: 'Status', accessorFn: r => (r.status === 'ok' ? (r.drained ? 'drained' : 'ok') : r.status),
      cell: ({ row }) => { const r = row.original; const st = r.status === 'ok' ? (r.drained ? 'drained' : 'ok') : r.status; return <Badge kind={st === 'ok' ? 'ok' : st === 'drained' ? 'drained' : 'invalid'}>{st}</Badge>; } },
    { id: 'usage', header: 'Usage', accessorFn: r => r.used_pct, cell: ({ row }) => <span className="tnum">{row.original.used_pct == null ? '—' : row.original.used_pct + '%'}</span> },
    { id: 'reset', header: 'Reset', accessorFn: r => r.reset, cell: ({ row }) => <span className="faint tnum">{row.original.reset || '—'}</span> },
    { id: 'earnings', header: 'Earnings', accessorFn: r => r.earnings, cell: ({ row }) => <span className="tnum strong">{usd(row.original.earnings)}</span> },
  ], []);

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head">
          <div><h2>Upstream fleet</h2><div className="sub">Click a provider to filter · {filtered.length} of {rows.length} providers</div></div>
        </div>
        <div className="upstream-cards">
          <button className={`ucard ${!slug ? 'on' : ''}`} onClick={() => setSlug(null)}>
            <div className="ucard-name">All providers</div>
            <div className="ucard-total tnum">{rows.length}</div>
          </button>
          {summary.map(s => (
            <button key={s.slug} className={`ucard ${slug === s.slug ? 'on' : ''}`} onClick={() => setSlug(s.slug)}>
              <div className="ucard-name">{s.slug}</div>
              <div className="ucard-total tnum">{s.t}</div>
              <div className="ucard-stats">
                <span className="fs-ok">{s.ok} ok</span>
                {s.dr > 0 && <span className="fs-warn">{s.dr} drained</span>}
                {s.inv > 0 && <span className="fs-bad">{s.inv} invalid</span>}
              </div>
              <div className="ucard-earn tnum">{usd(s.earn)} lifetime</div>
            </button>
          ))}
        </div>
        <DataTable columns={columns} data={filtered} />
      </section>
    </div>
  );
}
