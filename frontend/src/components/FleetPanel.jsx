import { useMemo } from 'react';
import DataTable from './DataTable';
import Badge from './Badge.jsx';
import { SkeletonBlock } from './Skeleton';

const usd = v => '$' + (v == null ? '0.00' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function FleetPanel({ rows, open = true }) {
  const columns = useMemo(() => [
    {
      id: 'provider',
      header: 'Provider',
      accessorFn: r => r.name,
      cell: ({ row }) => (
        <div className="cell-provider">
          <div className="prov-name">{row.original.name}</div>
          <div className="prov-sub">{row.original.slug} · {row.original.label}</div>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: r => (r.status === 'ok' ? (r.drained ? 'drained' : 'ok') : r.status),
      cell: ({ row }) => {
        const r = row.original;
        const st = r.status === 'ok' ? (r.drained ? 'drained' : 'ok') : r.status;
        return <Badge kind={st === 'ok' ? 'ok' : st === 'drained' ? 'drained' : 'invalid'}>{st}</Badge>;
      },
      meta: { width: 90 },
    },
    {
      id: 'usage',
      header: 'Usage',
      accessorFn: r => r.used_pct,
      cell: ({ row }) => <span className="tnum">{row.original.used_pct == null ? '—' : row.original.used_pct + '%'}</span>,
      meta: { align: 'right' },
    },
    {
      id: 'reset',
      header: 'Reset',
      accessorFn: r => r.reset,
      cell: ({ row }) => <span className="faint tnum">{row.original.reset || '—'}</span>,
    },
    {
      id: 'earnings',
      header: 'Earnings',
      accessorFn: r => r.earnings,
      cell: ({ row }) => <span className="tnum strong">{usd(row.original.earnings)}</span>,
      meta: { align: 'right' },
    },
  ], []);

  // summary per upstream
  const summary = useMemo(() => {
    const s = {};
    (rows || []).forEach(r => {
      s[r.slug] = s[r.slug] || { t: 0, ok: 0, dr: 0, inv: 0 };
      const x = s[r.slug]; x.t++;
      if (r.status === 'invalid') x.inv++;
      else if (r.drained && r.status === 'ok') x.dr++;
      else x.ok++;
    });
    return Object.entries(s).map(([k, v]) => ({ slug: k, ...v }));
  }, [rows]);

  return (
    <section className="panel fleet-panel">
      <div className="panel-head">
        <div>
          <h2>Upstream fleet</h2>
          <div className="sub">Live health across {rows?.length || 0} providers</div>
        </div>
      </div>

      <SkeletonBlock loading={!rows} rows={5}>
        <>
          <div className="fleet-summary">
            {summary.map(s => (
              <div className="fsum" key={s.slug}>
                <div className="fsum-name">{s.slug}</div>
                <div className="fsum-counts">
                  <span className="fs-total">{s.t}</span>
                  <span className="fs-ok">{s.ok} ok</span>
                  {s.dr > 0 && <span className="fs-warn">{s.dr} drained</span>}
                  {s.inv > 0 && <span className="fs-bad">{s.inv} invalid</span>}
                </div>
              </div>
            ))}
          </div>
          {open && (
            <DataTable columns={columns} data={rows || []} />
          )}
        </>
      </SkeletonBlock>
    </section>
  );
}
