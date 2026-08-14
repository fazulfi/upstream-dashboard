import { useState, useMemo, useEffect } from 'react';
import { useApi, apiFetch } from '../hooks/useApi';
import { SkeletonBlock } from '../components/Skeleton';

const API = import.meta.env.VITE_API_URL || '';

// Default fallback kalau model belum punya config — uniform utk SEMUA provider
function defaultBand(upstream, mid) {
  return { trigger: 2 };  // seragam: all providers trigger 2%
}

export default function AutoPricing() {
  const { data, loading, reload } = useApi('/api/auto-pricing', 15000);
  const { data: cfgData, reload: reloadCfg } = useApi('/api/auto-pricing/config', 15000);
  const [arming, setArming] = useState(false);
  const [note, setNote] = useState('');
  const [prov, setProv] = useState('');           // upstream terpilih (tab)
  const [saving, setSaving] = useState(null);      // {upstream, model_id} yg sedang save
  const [form, setForm] = useState({});            // key `${upstream}|${model_id}` -> {trigger}

  const cycles = useMemo(() => {
    const c = data?.cycles || [];
    return Array.isArray(c) ? c : [];
  }, [data]);

  // group by upstream
  const byProv = useMemo(() => {
    const m = {};
    for (const c of cycles) {
      const u = c.slug || '?';
      if (!m[u]) m[u] = [];
      m[u].push(c);
    }
    return m;
  }, [cycles]);

  const provs = useMemo(() => Object.keys(byProv).sort(), [byProv]);

  // pilih upstream pertama saat data pertama kali ada
  useEffect(() => {
    if (!prov && provs.length) setProv(provs[0]);
  }, [provs, prov]);

  const cfgMap = useMemo(() => {
    const m = {};
    for (const c of cfgData?.configs || []) {
      m[`${c.upstream}|${c.model_id}`] = c;
    }
    return m;
  }, [cfgData]);

  const rows = useMemo(() => (prov ? (byProv[prov] || []) : []), [prov, byProv]);

  const nUnd = cycles.filter(x => (x.action || '').includes('undercut')).length;
  const nLead = cycles.filter(x => x.action === 'leader').length;
  const nHold = cycles.filter(x => x.action === 'hold' || x.action === 'stable').length;

  const toggle = async () => {
    setArming(true); setNote('');
    try {
      const r = await apiFetch(`/api/auto-pricing/arm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ armed: !data?.armed }) });
      const d = await r.json();
      setNote(d.armed ? '✓ ARMED — eksekusi PUT harga jual nyata' : '✓ DISARMED — mode dry-run (hitung saja, tanpa PUT)');
      setTimeout(reload, 500);
    } catch (e) { setNote('Error: ' + e.message); } finally { setArming(false); }
  };

  const saveConfig = async (upstream, model_id) => {
    const key = `${upstream}|${model_id}`;
    const f = form[key] || {};
    const trigger = parseFloat(f.trigger);
    if (!(trigger > 0)) {
      setNote(`Error: trigger (${trigger}) harus > 0`);
      return;
    }
    setSaving(key); setNote('');
    try {
      const r = await apiFetch('/api/auto-pricing/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upstream, model_id, trigger_pct: trigger }),
      });
      const d = await r.json();
      if (!d.ok) { setNote('Error: ' + (d.error || 'gagal')); }
      else {
        setNote(`✓ ${upstream}/${model_id} → trigger ${trigger}%`);
        // clear form state supaya display ikut nilai server (cfgMap ter-refresh)
        setForm(prev => { const n = { ...prev }; delete n[key]; return n; });
        setTimeout(reloadCfg, 300);
      }
    } catch (e) { setNote('Error: ' + e.message); } finally { setSaving(null); }
  };
  const resetConfig = async (id, upstream, model_id) => {
    if (!id) return;
    setSaving(`${upstream}|${model_id}`);
    try {
      const r = await apiFetch(`/api/auto-pricing/config/${id}`, { method: 'DELETE' });
      const d = await r.json();
      setNote(d.ok ? `✓ ${upstream}/${model_id} → kembali default` : 'Error: ' + (d.error || ''));
      setTimeout(reloadCfg, 300);
    } catch (e) { setNote('Error: ' + e.message); } finally { setSaving(null); }
  };

  return (
    <div className="page">
      <div className="kpis">
        <div className="kpi featured"><div className="k-label">Status algo</div>
          <div className="k-value">{data?.armed ? <span className="pos">ARMED</span> : <span className="faint">DRY-RUN</span>}</div>
          <div className="k-context">{data?.armed ? 'eksekusi PUT nyata' : 'hitung saja, aman'}</div>
        </div>
        <div className="kpi"><div className="k-label">Model diproses</div><div className="k-value tnum">{cycles.length}</div><div className="k-context">{provs.length} provider</div></div>
        <div className="kpi"><div className="k-label">Undercut</div><div className="k-value tnum">{nUnd}</div><div className="k-context">ikuti kompetitor</div></div>
        <div className="kpi"><div className="k-label">Leader/Hold</div><div className="k-value tnum">{nLead + nHold}</div><div className="k-context">sudah termurah</div></div>
        <div className="kpi"><div className="k-label">Update</div><div className="k-value tnum">{data?.ts ? new Date(data.ts).toLocaleTimeString('id-ID') : '—'}</div><div className="k-context">cycle terakhir</div></div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <div><h2>Auto-pricing · per provider</h2>
            <div className="sub">undercut kompetitor tic-by-tic · trigger% di-set per model per provider · default 2%</div>
          </div>
          <button className={data?.armed ? 'btn btn-ghost' : 'btn btn-primary'} onClick={toggle} disabled={arming}>
            {arming ? '…' : (data?.armed ? 'Disarm (dry-run)' : 'Arm (eksekusi harga)')}
          </button>
        </div>
        {note && <div className="batch-note">{note}</div>}
      </div>

      {/* Tab per provider */}
      <div className="ap-tabs">
        {provs.map(u => (
          <button key={u} className={'ap-tab' + (prov === u ? ' active' : '')} onClick={() => setProv(u)}>
            {u} <span className="faint">({byProv[u].length})</span>
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>Target harga per model · {prov || '—'}</h2>
          <div className="sub">klik set utk simpan trigger% model ini (daemon baca tiap cycle)</div>
        </div></div>
        <SkeletonBlock loading={loading} rows={6}>
          <table className="tbl">
            <thead><tr>
              <th>Model</th><th className="right">Ask skrg</th><th className="right">Kompetitor</th>
              <th className="right">Trigger %</th>
              <th className="right">Target</th><th>Status</th><th>Aksi</th>
            </tr></thead>
            <tbody>
              {rows.map((c, i) => {
                const key = `${c.slug}|${c.model_id}`;
                const cfg = cfgMap[key];
                const dflt = defaultBand(c.slug, c.model_id);
                const trigger = cfg ? cfg.trigger_pct : dflt.trigger;
                const f = form[key] || {};
                const flood = c.official * (trigger / 100);
                const synced = Math.abs(Number(c.ask_in) - Number(c.target)) < 0.00002;
                const action = (c.action || '');
                const status = action === 'leader' ? 'LEADER'
                  : action === 'undercut' ? 'UNDERCUT'
                  : action === 'stable' ? 'STABLE'
                  : (action === 'hold' ? 'HOLD' : (action || '—'));
                const statusCls = action === 'leader' ? 'tag tag-ok'
                  : action === 'undercut' ? 'tag tag-imp'
                  : 'tag';
                return (
                  <tr key={i} className={!synced && c.target ? 'row-dirty' : ''}>
                    <td><span className="prov-name">{c.model_id}</span>
                      {cfg && <span className="prov-sub"> custom</span>}
                    </td>
                    <td className="right tnum">${Number(c.ask_in).toFixed(4)}</td>
                    <td className="right tnum faint">${Number(c.comp).toFixed(4)}</td>
                    <td className="right">
                      <input className="ap-in" type="text" inputMode="decimal" placeholder="%" value={f.trigger ?? trigger}
                        onChange={e => setForm({ ...form, [key]: { ...f, trigger: e.target.value } })} />
                    </td>
                    <td className="right tnum"><span className="pos">${Number(c.target).toFixed(4)}</span></td>
                    <td>
                      <span className={statusCls}>{status}</span>
                      {!synced && c.target ? <span className="prov-sub" title="harga skrg belum sesuai target — menunggu cycle berikutnya"> ⏳</span> : null}
                    </td>
                    <td>
                      <button className="btn btn-sm" disabled={saving === key} onClick={() => saveConfig(c.slug, c.model_id)}>
                        {saving === key ? '…' : (cfg ? 'Update' : 'Set')}
                      </button>
                      {cfg && <button className="btn btn-sm btn-ghost" disabled={saving === key} onClick={() => resetConfig(cfg.id, c.slug, c.model_id)} title="kembali ke default">↺</button>}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && !loading && <tr><td colSpan={7} className="dt-empty">Belum ada data — jalankan cycle dulu.</td></tr>}
            </tbody>
          </table>
        </SkeletonBlock>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Log algo</h2><div className="sub">80 baris terakhir</div></div></div>
        <pre className="log-pre">{data?.log || '—'}</pre>
      </section>
    </div>
  );
}
