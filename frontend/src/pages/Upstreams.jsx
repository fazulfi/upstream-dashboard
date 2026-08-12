import { useMemo, useState } from 'react';
import { useApi, usd } from '../hooks/useApi';
import DataTable from '../components/DataTable';
import Badge from '../components/Badge';
import { SkeletonBlock } from '../components/Skeleton';

export default function Upstreams() {
  const { data, loading } = useApi('/api/upstreams');
  // /api/upstreams return array upstream langsung (bukan {upstreams:[...]})
  const upstreams = Array.isArray(data) ? data : (data?.upstreams || []);
  const [selected, setSelected] = useState(null); // slug or null=all

  const columns = useMemo(() => [
    { id: 'provider', header: 'Provider', accessorFn: r => r.name,
      cell: ({ row }) => (
        <div className="cell-provider">
          <div className="prov-name">{row.original.name}</div>
          <div className="prov-sub">{row.original.slug}</div>
        </div>
      ) },
    { id: 'status', header: 'Status', accessorFn: r => (r.status === 'ok' ? (r.drained ? 'drained' : 'ok') : r.status),
      cell: ({ row }) => { const st = row.original.status === 'ok' ? (row.original.drained ? 'drained' : 'ok') : row.original.status;
        return <Badge kind={st === 'ok' ? 'ok' : st === 'drained' ? 'drained' : 'invalid'}>{st}</Badge>; },
      meta: { width: 90 } },
    { id: 'usage', header: 'Usage', accessorFn: r => r.used_pct,
      cell: ({ row }) => <span className="tnum">{row.original.used_pct == null ? '—' : row.original.used_pct + '%'}</span>,
      meta: { align: 'right' } },
    { id: 'reset', header: 'Reset', accessorFn: r => r.reset,
      cell: ({ row }) => <span className="faint tnum">{row.original.reset || '—'}</span> },
    { id: 'earnings', header: 'Earnings', accessorFn: r => r.earnings,
      cell: ({ row }) => <span className="tnum strong">{usd(row.original.earnings)}</span>, meta: { align: 'right' } },
  ], []);

  const allRows = useMemo(() => upstreams.flatMap(u => u.rows || []), [upstreams]);
  const rows = selected ? (upstreams.find(u => u.slug === selected)?.rows || []) : allRows;

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head">
          <div><h2>Upstream fleet</h2><div className="sub">Click a provider to filter · {rows.length} providers shown</div></div>
        </div>
        <SkeletonBlock loading={loading} rows={4}>
          <div className="upstream-cards">
            <button className={`ucard ${selected === null ? 'on' : ''}`} onClick={() => setSelected(null)}>
              <div className="ucard-name">All providers</div>
              <div className="ucard-total tnum">{allRows.length}</div>
            </button>
            {upstreams.map(u => (
              <button key={u.slug} className={`ucard ${selected === u.slug ? 'on' : ''}`} onClick={() => setSelected(u.slug)}>
                <div className="ucard-name">{u.slug}</div>
                <div className="ucard-total tnum">{u.total}</div>
                <div className="ucard-stats">
                  <span className="fs-ok">{u.ok} ok</span>
                  {u.drained > 0 && <span className="fs-warn">{u.drained} drained</span>}
                  {u.invalid > 0 && <span className="fs-bad">{u.invalid} invalid</span>}
                </div>
                <div className="ucard-earn tnum">{usd(u.earnings)}</div>
              </button>
            ))}
          </div>
          <DataTable columns={columns} data={rows} />
        </SkeletonBlock>
      </section>
    </div>
  );
}
