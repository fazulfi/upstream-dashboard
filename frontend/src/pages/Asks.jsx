import { useState, useMemo } from 'react';
import { useApi, usd, apiFetch } from '../hooks/useApi';
import { SkeletonBlock } from '../components/Skeleton';

const API = import.meta.env.VITE_API_URL || '';
const num2 = v => v == null ? '—' : (Number(v) < 1 ? Number(v).toFixed(4) : Number(v).toFixed(2));

export default function Asks() {
  const { data, loading, reload } = useApi('/api/orderbook', 30000);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);       // model terpilih utk modal
  const [upSel, setUpSel] = useState('');     // upstream terpilih utk modal
  const [upFilter, setUpFilter] = useState('all');
  const [ain, setAin] = useState(''); const [aout, setAout] = useState('');
  const [saving, setSaving] = useState(false); const [msg, setMsg] = useState('');

  const models = useMemo(() => {
    let r = (data?.models || []).filter(x =>
      !q || (x.label || '').toLowerCase().includes(q.toLowerCase()) || `${x.official_in}`.includes(q)
    );
    if (upFilter !== 'all') r = r.filter(x => x.upstreams?.some(u => u.slug === upFilter));
    return r;
  }, [data, q, upFilter]);

  const upstreams = useMemo(() => [...new Set((data?.models || []).flatMap(m => (m.upstreams||[]).map(u => u.slug)))], [data]);

  const openModel = (m) => {
    setSel(m); setUpSel(m.upstreams?.[0]?.slug || ''); setAin(''); setAout(''); setMsg('');
  };
  const save = async () => {
    if (!sel) return;
    const target = sel;
    const ainN = Number(ain), aoutN = Number(aout);
    if (isNaN(ainN) || ainN <= 0) return setMsg('masukkan harga input valid');
    if (target.max_ask != null && ainN > target.max_ask) return setMsg(`melebihi cap max $${target.max_ask}`);
    const u = target.upstreams?.find(x => x.slug === upSel);
    const upstream_catalog_model_id = u?.upstream_catalog_model_id || u?.cid;
    if (!upstream_catalog_model_id) return setMsg('upstream ini tidak punya upstream_catalog_model_id');
    setSaving(true);
    try {
      const r = await apiFetch('/api/ask', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upstream_catalog_model_id,
          upstream_slug: upSel,
          ask_input_per_mtok: ainN,
          ask_output_per_mtok: (isNaN(aoutN) || aoutN <= 0) ? ainN : aoutN,
        }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setMsg('Harga ask tersimpan ✓');
      reload();
    } catch (e) { setMsg('Error: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <div className="page">
      <div className="kpis kpis-4">
        <div className="kpi featured"><div className="k-label">Model</div><div className="k-value tnum">{data?.models?.length ?? 0}</div><div className="k-context">orderbook terjaga</div></div>
        <div className="kpi"><div className="k-label">Termurah (in)</div><div className="k-value tnum">{models.length ? '$' + num2(models[0]?.min_ask) : '—'}</div><div className="k-context">harga ask terendah</div></div>
        <div className="kpi"><div className="k-label">Upstream</div><div className="k-value tnum">{upstreams.length}</div><div className="k-context">sumber kapasitas</div></div>
        <div className="kpi"><div className="k-label">Spread terbesar</div><div className="k-value tnum">{models.length ? '$' + num2(models.reduce((a,b)=>(b.spread||0)>(a.spread||0)?b:a,models[0]).spread) : '—'}</div><div className="k-context">selisih min-max</div></div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div><h2>Ask price · orderbook per model</h2><div className="sub">semua level harga (termurah→tertinggi) + depth per upstream · klik model utk set harga manual</div></div>
          <div className="dt-toolbar">
            <select className="inp" value={upFilter} onChange={e => setUpFilter(e.target.value)}>
              <option value="all">Semua upstream</option>
              {upstreams.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <input className="dt-search" placeholder="cari model…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <SkeletonBlock loading={loading} rows={8}>
          <div className="ob-grid">
            {models.map((m, i) => {
              const allLevels = m.upstreams?.flatMap(u => (u.levels||[]).map(lv => ({...lv, slug:u.slug, label:u.label}))) || [];
              const hasOurs = (m.upstreams||[]).some(u => u.is_ours);
              const compLevels = hasOurs
                ? (m.upstreams||[]).filter(u => !u.is_ours).flatMap(u => (u.levels||[]).map(lv => ({...lv, slug:u.slug, label:u.label})))
                : allLevels;
              const sorted = compLevels.filter(l => l.price>0).sort((a,b)=>a.price-b.price).slice(0,4);
              const maxLv = Math.max(...allLevels.map(l=>l.qty||0), 1);
              return (
                <button key={i} className="ob-card" onClick={() => openModel(m)}>
                  <div className="ob-head">
                    <div className="prov-name">{m.label}</div>
                    <div className="ob-meta">{m.upstreams?.length} upstream · official {num2(m.official_in)}</div>
                  </div>
                  <div className="ob-range">
                    <span className="pos">from ${num2(m.min_ask)}</span>
                    <span className="faint">to ${num2(m.max_ask)}</span>
                  </div>
                  <div className="ob-ladder">
                    {sorted.map((lv,j)=>(
                      <div key={j} className="ob-row" style={{ '--w': `${(lv.qty||0)/maxLv*100}%` }}>
                        <span className="tnum">${num2(lv.price)}</span>
                        <span className="ob-bar"><i style={{ width: lv.qty/maxLv*100 + '%' }} /></span>
                        <span className="tnum faint">{lv.qty}</span>
                        <span className="faint">{lv.slug}</span>
                      </div>
                    ))}
                    {!sorted.length && <div className="faint">tidak ada ask aktif</div>}
                  </div>
                </button>
              );
            })}
            {!models.length && !loading && <div className="dt-empty" style={{gridColumn:'1/-1'}}>Belum ada data.</div>}
          </div>
        </SkeletonBlock>
      </section>

      {sel && (
        <div className="modal-back" onClick={() => !saving && setSel(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>Orderbook — {sel.label}</h3><button className="modal-x" onClick={() => setSel(null)}>×</button></div>
            <div className="modal-body">
              <div className="ob-summ">
                <span>Official <b>${num2(sel.official_in)}</b></span>
                <span>Min <b className="pos">${num2(sel.min_ask)}</b></span>
                <span>Max <b>${num2(sel.max_ask)}</b></span>
              </div>
              <label className="f-label" style={{marginTop:10}}>Provider / upstream</label>
              <select className="inp" value={upSel} onChange={e=>setUpSel(e.target.value)}>
                {sel.upstreams?.map(u => <option key={u.slug} value={u.slug}>{u.label} ({u.slug}){u.is_ours ? ' · milik kita' : ''} · {u.levels?.filter(l=>l.price>0).length || 0} level</option>)}
              </select>
              {(() => { const u = sel.upstreams?.find(x=>x.slug===upSel); if (!u) return null;
                const levels = u.levels?.filter(l=>l.price>0).sort((a,b)=>a.price-b.price) || [];
                const maxQ = Math.max(...levels.map(l=>l.qty||0), 1);
                return (
                  <div className="ob-up block" style={{marginTop:12}}>
                    <div className="block-title">{u.label} <span className="faint">({u.slug}) · orderbook model ini di provider ini saja</span></div>
                    <div className="ob-ladder">
                      {levels.map((lv, j) => {
                        const pct = sel.official_in ? (lv.price / sel.official_in) * 100 : null;
                        return (
                          <div key={j} className="ob-row" style={{'--w': `${(lv.qty||0)/maxQ*100}%`}}>
                            <span className="tnum">${num2(lv.price)}</span>
                            <span className="ob-pct">{pct != null ? pct.toFixed(1) + '%' : '—'}</span>
                            <span className="ob-bar"><i style={{width: (lv.qty||0)/maxQ*100 + '%'}} /></span>
                            <span className="tnum">{lv.qty} prov</span>
                          </div>
                        );
                      })}
                      {!levels.length && <span className="faint">tidak ada ask aktif</span>}
                    </div>
                  </div>
                );
              })()}
              <hr className="sep" />
              <label className="f-label">Set harga input ($/Mtok)</label>
              <input className="f-input" type="number" step="0.001" value={ain} onChange={e=>setAin(e.target.value)} placeholder={`min ${num2(sel.min_ask)} · max ${num2(sel.max_ask)}`} />
              <label className="f-label" style={{marginTop:10}}>Set harga output</label>
              <input className="f-input" type="number" step="0.001" value={aout} onChange={e=>setAout(e.target.value)} placeholder="optional" />
              {msg && <div className="modal-msg">{msg}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={()=>setSel(null)} disabled={saving}>Tutup</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Menyimpan…':'Set harga manual'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
