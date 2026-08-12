import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import Badge from '../components/Badge';
import { SkeletonBlock } from '../components/Skeleton';

const num = n => (n == null ? '—' : Number(n).toFixed(3));

export default function Budgets() {
  const { data, loading, refetch } = useApi('/api/budgets');
  const { data: aliases } = useApi('/api/budgets/aliases');
  const { data: pc } = useApi('/api/pricing-config');
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(null); // budget row
  const [maxIn, setMaxIn] = useState('');
  const [discount, setDiscount] = useState('');

  const budgets = Array.isArray(data) ? data : [];
  const aliasList = Array.isArray(aliases) ? aliases : [];

  async function saveBudget() {
    if (!editing) return;
    setMsg('');
    try {
      const r = await fetch(`/api/budgets/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ max_input_per_mtok: maxIn || null, max_output_per_mtok: null, min_discount_pct: discount || null, enabled: true }) });
      const j = await r.json();
      setMsg(j.ok ? `Budget ${editing.model} disimpan ✓` : 'gagal simpan (cek maxAsk cap)');
      setEditing(null); setMaxIn(''); setDiscount('');
      setTimeout(refetch, 800);
    } catch (e) { setMsg(String(e)); }
  }

  async function clearBudget(id, model) {
    if (!confirm(`Clear budget ${model} ke default pasar?`)) return;
    setMsg('');
    try {
      const r = await fetch(`/api/budgets/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ max_input_per_mtok: null, max_output_per_mtok: null, min_discount_pct: null, enabled: false }) });
      const j = await r.json();
      setMsg(j.ok ? `${model} cleared ✓` : 'gagal clear');
      setTimeout(refetch, 800);
    } catch (e) { setMsg(String(e)); }
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Budgets · margin per model</h2>
            <div className="sub">
              {budgets.length} model · rule pasar: max ask <b>{(pc?.max_ask_pct || 0.5) * 100}%</b> official · fee platform <b>{(pc?.platform_fee_pct || 0.2) * 100}%</b> · share publisher <b>{pc?.publisher_share_pct || 80}%</b>
            </div>
          </div>
        </div>
        <SkeletonBlock loading={loading} rows={5}>
          <table className="tbl">
            <thead><tr><th>Model</th><th>Upstream</th><th className="right">Official $</th><th className="right">Market min $</th><th className="right">Max in $</th><th className="right">Discount</th><th>Status</th><th className="right">Aksi</th></tr></thead>
            <tbody>
              {budgets.map(b => (
                <tr key={b.id}>
                  <td><span className="prov-name">{b.model}</span><div className="prov-sub">{b.prefix}</div></td>
                  <td>{b.upstream}</td>
                  <td className="right tnum">{num(b.official_in)}</td>
                  <td className="right tnum faint">{num(b.market_min_ask_in)}</td>
                  <td className="right tnum strong">{num(b.max_input_per_mtok)}</td>
                  <td className="right tnum">{b.min_discount_pct}%</td>
                  <td>{b.enabled ? <Badge kind="ok">active</Badge> : <Badge kind="drained">off</Badge>}</td>
                  <td className="right">
                    <button className="btn btn-sm" onClick={() => { setEditing(b); setMaxIn(b.max_input_per_mtok ?? ''); setDiscount((b.min_discount_pct || '').replace('%', '')); }}>Edit</button>{' '}
                    <button className="btn btn-sm btn-danger" onClick={() => clearBudget(b.id, b.model)}>Clear</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SkeletonBlock>
        {msg && <div className="form-msg">{msg}</div>}
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Aliases · margin seragam lintas upstream</h2><div className="sub">{aliasList.length} grup alias · model sama dari beberapa upstream</div></div></div>
        <table className="tbl">
          <thead><tr><th>Alias</th><th>Label</th><th className="right">Members</th><th>Upstreams</th><th className="right">Discount</th></tr></thead>
          <tbody>
            {aliasList.map((a, i) => (
              <tr key={i}>
                <td><span className="prov-name">{a.alias}</span></td>
                <td className="faint">{a.label || '—'}</td>
                <td className="right tnum">{a.member_count}</td>
                <td className="tnum faint">{a.upstream_labels || '—'}</td>
                <td className="right tnum">{a.min_discount_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>Edit budget · {editing.model}</h3><button className="btn btn-sm" onClick={() => setEditing(null)}>×</button></div>
            <div className="modal-body">
              <label>Max input ($/Mtok) — kosongkan = default</label>
              <input className="inp" value={maxIn} onChange={e => setMaxIn(e.target.value)} placeholder={String(editing.market_min_ask_in ?? '')} />
              <label>Min discount (%) — kosongkan = default</label>
              <input className="inp" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="50" />
              <div className="form-msg">Official in: {num(editing.official_in)} · Market min: {num(editing.market_min_ask_in)} · Max asal API di cap 50% official.</div>
            </div>
            <div className="modal-foot"><button className="btn" onClick={saveBudget}>Simpan</button></div>
          </div>
        </div>
      )}
    </div>
  );
}