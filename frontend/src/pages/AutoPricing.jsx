import React, { useState, useMemo, useEffect } from 'react';
import { useApi, apiFetch } from '../hooks/useApi';
import { SkeletonBlock } from '../components/Skeleton';
import { fmtCompetitorPrice } from '../lib/fmt';

function defaultBand(upstream, mid) {
  return { trigger: 10 }; // uniform 10%
}

export default function AutoPricing() {
  const { data, loading, reload } = useApi('/api/auto-pricing', 15000);
  const { data: cfgData, reload: reloadCfg } = useApi('/api/auto-pricing/config', 15000);
  const { data: globalsData, reload: reloadGlobals } = useApi('/api/pricing', 15000);
  const [arming, setArming] = useState(false);
  const [note, setNote] = useState('');
  const [prov, setProv] = useState('');
  const [saving, setSaving] = useState(null);
  const [form, setForm] = useState({});
  const [globalForm, setGlobalForm] = useState({});
  const [savingGlobal, setSavingGlobal] = useState(null);

  const cycles = useMemo(() => {
    const c = data?.cycles || [];
    return Array.isArray(c) ? c : [];
  }, [data]);

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

  useEffect(() => {
    if (!prov && provs.length) setProv(provs[0]);
  }, [provs, prov]);

  const cfgMap = useMemo(() => {
    const m = {};
    for (const c of cfgData?.configs || []) {
      const mid = (c.model_id || '').split('/').pop();
      m[`${c.upstream}|${mid}`] = c;
    }
    return m;
  }, [cfgData]);

  const rows = useMemo(() => (prov ? byProv[prov] || [] : []), [prov, byProv]);

  const nUnd = cycles.filter((x) => (x.action || '').includes('undercut')).length;
  const nLead = cycles.filter((x) => x.action === 'leader').length;
  const nHold = cycles.filter((x) => x.action === 'hold' || x.action === 'stable').length;

  const toggle = async () => {
    setArming(true);
    setNote('');
    try {
      const r = await apiFetch(`/api/auto-pricing/arm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ armed: !data?.armed }),
      });
      const d = await r.json();
      setNote(
        d.armed
          ? '✓ ARMED — eksekusi PUT harga jual nyata'
          : '✓ DISARMED — mode dry-run (hitung saja, tanpa PUT)'
      );
      setTimeout(reload, 500);
    } catch (e) {
      setNote('Error: ' + e.message);
    } finally {
      setArming(false);
    }
  };

  const saveConfig = async (upstream, model_id) => {
    const bare = (model_id || '').split('/').pop();
    const key = `${upstream}|${bare}`;
    const f = form[key] || {};
    const shown = cfgMap[key] ? cfgMap[key].trigger_pct : defaultBand(upstream, bare).trigger;
    const trigger = f.trigger !== undefined && f.trigger !== '' ? parseFloat(f.trigger) : Number(shown);
    if (!(trigger > 0)) {
      setNote(`Error: trigger (${trigger}) harus > 0`);
      return;
    }
    setSaving(key);
    setNote('');
    try {
      const r = await apiFetch('/api/auto-pricing/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upstream, model_id: bare, trigger_pct: trigger }),
      });
      const d = await r.json();
      if (!d.ok) {
        setNote('Error: ' + (d.error || 'gagal'));
      } else {
        setNote(`✓ ${upstream}/${bare} → trigger ${trigger}%`);
        setForm((prev) => {
          const n = { ...prev };
          delete n[key];
          return n;
        });
        setTimeout(reloadCfg, 300);
      }
    } catch (e) {
      setNote('Error: ' + e.message);
    } finally {
      setSaving(null);
    }
  };

  const resetConfig = async (id, upstream, model_id) => {
    if (!id) return;
    setSaving(`${upstream}|${model_id}`);
    try {
      const r = await apiFetch(`/api/auto-pricing/config/${id}`, { method: 'DELETE' });
      const d = await r.json();
      setNote(d.ok ? `✓ ${upstream}/${model_id} → kembali default` : 'Error: ' + (d.error || ''));
      setTimeout(reloadCfg, 300);
    } catch (e) {
      setNote('Error: ' + e.message);
    } finally {
      setSaving(null);
    }
  };

  const saveGlobalTrigger = async (upstream) => {
    const globals = globalsData?.globals || {};
    const cfg = {
      ...(globals[upstream] || {}),
      ...(globalForm[upstream] ? { global_trigger_pct: globalForm[upstream] } : {}),
    };
    if (!(Number(cfg.max_ask_pct) > 0)) {
      setNote(`Error: ${upstream} max_ask_pct belum tersedia — simpan via halaman Pricing dulu`);
      return;
    }
    const trigger =
      cfg.global_trigger_pct !== undefined && cfg.global_trigger_pct !== ''
        ? Number(cfg.global_trigger_pct)
        : null;
    if (trigger !== null && !(trigger > 0)) {
      setNote(`Error: trigger global (${trigger}) harus > 0`);
      return;
    }
    setSavingGlobal(upstream);
    setNote('');
    try {
      const r = await apiFetch('/api/pricing/global', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upstream,
          max_ask_pct: Number(cfg.max_ask_pct),
          platform_fee_pct: cfg.platform_fee_pct ?? null,
          publisher_share_pct: cfg.publisher_share_pct ?? null,
          global_trigger_pct: trigger,
        }),
      });
      const d = await r.json();
      if (!d.ok) {
        setNote('Error: ' + (d.error || 'gagal'));
      } else {
        setNote(
          trigger === null
            ? `✓ ${upstream} trigger global dihapus (default per model dipakai)`
            : `✓ ${upstream} trigger global → ${trigger}%`
        );
        setGlobalForm((prev) => {
          const n = { ...prev };
          delete n[upstream];
          return n;
        });
        setTimeout(reloadGlobals, 300);
      }
    } catch (e) {
      setNote('Error: ' + e.message);
    } finally {
      setSavingGlobal(null);
    }
  };

  const toggleScope = async (upstream, enabled) => {
    setSavingGlobal(upstream);
    setNote('');
    try {
      const r = await apiFetch('/api/auto-pricing/scope', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upstream, enabled }),
      });
      const d = await r.json();
      if (!d.ok) {
        setNote('Error: ' + (d.error || 'gagal'));
      } else {
        setNote(
          enabled
            ? `✓ ${upstream} masuk scope auto-pricing (cycle berikutnya diproses)`
            : `✓ ${upstream} dikeluarkan dari scope — TIDAK diproses cycle berikutnya`
        );
        setTimeout(reloadGlobals, 300);
      }
    } catch (e) {
      setNote('Error: ' + e.message);
    } finally {
      setSavingGlobal(null);
    }
  };

  return (
    <div className="page space-y-6">
      {/* KPIs */}
      <div className="kpis grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="kpi featured p-3.5 rounded-xl border border-sky-500/30 bg-zinc-900 shadow-md">
          <div className="k-label text-[10px] font-mono uppercase text-zinc-400">Status algo</div>
          <div className="k-value text-lg font-bold font-mono mt-1">
            {data?.armed ? <span className="pos text-emerald-400">ARMED</span> : <span className="faint text-zinc-400">DRY-RUN</span>}
          </div>
          <div className="k-context text-[11px] text-zinc-500 mt-1">
            {data?.armed ? 'eksekusi PUT nyata' : 'hitung saja, aman'}
          </div>
        </div>
        <div className="kpi p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div className="k-label text-[10px] font-mono uppercase text-zinc-400">Model diproses</div>
          <div className="k-value tnum text-lg font-bold font-mono text-zinc-100 mt-1">{cycles.length}</div>
          <div className="k-context text-[11px] text-zinc-500 mt-1">{provs.length} provider</div>
        </div>
        <div className="kpi p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div className="k-label text-[10px] font-mono uppercase text-zinc-400">Undercut</div>
          <div className="k-value tnum text-lg font-bold font-mono text-emerald-400 mt-1">{nUnd}</div>
          <div className="k-context text-[11px] text-zinc-500 mt-1">ikuti kompetitor</div>
        </div>
        <div className="kpi p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div className="k-label text-[10px] font-mono uppercase text-zinc-400">Leader/Hold</div>
          <div className="k-value tnum text-lg font-bold font-mono text-sky-400 mt-1">{nLead + nHold}</div>
          <div className="k-context text-[11px] text-zinc-500 mt-1">sudah termurah</div>
        </div>
        <div className="kpi p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div className="k-label text-[10px] font-mono uppercase text-zinc-400">Update</div>
          <div className="k-value tnum text-xs font-mono text-zinc-300 mt-2">
            {data?.ts ? new Date(data.ts).toLocaleTimeString('id-ID') : '—'}
          </div>
          <div className="k-context text-[11px] text-zinc-500 mt-1">cycle terakhir</div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="panel p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
        <div className="panel-head flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-zinc-100">Auto-pricing · per provider</h2>
            <div className="sub text-xs text-zinc-400">
              undercut kompetitor tic-by-tic · trigger% di-set per model per provider · default 10%
            </div>
          </div>
          <button
            className={
              data?.armed
                ? 'btn btn-ghost px-4 py-2 rounded-lg border border-zinc-700 text-zinc-200 text-xs font-semibold'
                : 'btn btn-primary px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 text-xs font-semibold shadow-md'
            }
            onClick={toggle}
            disabled={arming}
          >
            {arming ? '…' : data?.armed ? 'Disarm (dry-run)' : 'Arm (eksekusi harga)'}
          </button>
        </div>
        {note && (
          <div
            className={`batch-note p-3 rounded-lg border text-xs font-medium ${
              note.startsWith('Error')
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {note}
          </div>
        )}
      </div>

      {/* Global & Scope */}
      <section className="panel p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
        <div className="panel-head">
          <div>
            <h2 className="text-base font-bold text-zinc-100">Trigger global & scope · per provider</h2>
            <div className="sub text-xs text-zinc-400">
              default trigger% utk semua model provider ini — per-model override tetap menang. Kosongkan utk pakai default 10% · matikan utk keluarkan provider dari auto-pricing.
            </div>
          </div>
        </div>
        <div className="pricing-global-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(globalsData?.globals ? Object.keys(globalsData.globals).sort() : []).map((upstream) => {
            const cfg = {
              ...(globalsData.globals[upstream] || {}),
              ...(globalForm[upstream] !== undefined ? { global_trigger_pct: globalForm[upstream] } : {}),
            };
            return (
              <div className="pricing-global p-4 rounded-lg border border-zinc-800 bg-zinc-950/60 space-y-3" key={upstream}>
                <div className="pricing-row-head flex items-center justify-between">
                  <strong className="text-xs text-zinc-200">{upstream}</strong>
                  <div className="flex items-center gap-2">
                    <label
                      className="ap-scope-toggle flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer"
                      title={
                        cfg.auto_pricing_enabled === false
                          ? 'nonaktif — tidak diproses'
                          : 'aktif — diproses tiap cycle'
                      }
                    >
                      <input
                        type="checkbox"
                        checked={cfg.auto_pricing_enabled !== false}
                        disabled={savingGlobal === upstream}
                        onChange={(e) => toggleScope(upstream, e.target.checked)}
                      />
                      <span>{cfg.auto_pricing_enabled === false ? 'off' : 'on'}</span>
                    </label>
                    <button
                      className="btn btn-sm btn-primary px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px]"
                      onClick={() => saveGlobalTrigger(upstream)}
                      disabled={savingGlobal === upstream}
                    >
                      {savingGlobal === upstream ? '…' : 'Simpan'}
                    </button>
                  </div>
                </div>
                <label className="pricing-field space-y-1 block text-xs">
                  <span className="text-[10px] font-mono uppercase text-zinc-400">global_trigger_pct (%)</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="10 (default)"
                    value={cfg.global_trigger_pct ?? ''}
                    onChange={(e) =>
                      setGlobalForm((prev) => ({ ...prev, [upstream]: e.target.value }))
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100 outline-none focus:border-sky-500"
                  />
                </label>
              </div>
            );
          })}
          {!(globalsData?.globals && Object.keys(globalsData.globals).length) && (
            <div className="dt-empty text-xs text-zinc-500">Belum ada konfigurasi upstream.</div>
          )}
        </div>
      </section>

      {/* Tabs */}
      <div className="ap-tabs flex items-center gap-2 border-b border-zinc-800 pb-1 overflow-x-auto">
        {provs.map((u) => (
          <button
            key={u}
            className={`ap-tab px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              prov === u
                ? 'active bg-sky-500/15 text-sky-300 font-semibold border border-sky-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            onClick={() => setProv(u)}
          >
            {u} <span className="faint font-mono text-[10px] text-zinc-500">({byProv[u].length})</span>
          </button>
        ))}
      </div>

      {/* Target Table */}
      <section className="panel rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Target harga per model · {prov || '—'}</h2>
            <div className="sub text-xs text-zinc-400">
              klik set utk simpan trigger% model ini (daemon baca tiap cycle)
            </div>
          </div>
        </div>
        <SkeletonBlock loading={loading} rows={6}>
          <div className="overflow-x-auto max-h-[460px]">
            <table className="tbl w-full text-left text-xs border-collapse font-mono">
              <thead className="sticky top-0 bg-zinc-950 text-zinc-400 text-[10px] uppercase border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Model</th>
                  <th className="right px-4 py-3 text-right">Ask skrg</th>
                  <th className="right px-4 py-3 text-right">Kompetitor</th>
                  <th className="right px-4 py-3 text-center">Trigger %</th>
                  <th className="right px-4 py-3 text-right">Target</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {rows.map((c, i) => {
                  const bare = (c.model_id || '').split('/').pop();
                  const key = `${c.slug}|${bare}`;
                  const cfg = cfgMap[key];
                  const dflt = defaultBand(c.slug, c.model_id);
                  const trigger = cfg ? cfg.trigger_pct : dflt.trigger;
                  const f = form[key] || {};
                  const synced = Math.abs(Number(c.ask_in) - Number(c.target)) < 0.00002;
                  const action = c.action || '';
                  const status =
                    action === 'leader'
                      ? 'LEADER'
                      : action === 'undercut'
                      ? 'UNDERCUT'
                      : action === 'stable'
                      ? 'STABLE'
                      : action === 'hold'
                      ? 'HOLD'
                      : action || '—';
                  const statusCls =
                    action === 'leader'
                      ? 'tag tag-ok px-2 py-0.5 rounded text-[11px] font-medium border bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : action === 'undercut'
                      ? 'tag tag-imp px-2 py-0.5 rounded text-[11px] font-medium border bg-sky-500/10 border-sky-500/30 text-sky-400'
                      : 'tag px-2 py-0.5 rounded text-[11px] font-medium border bg-zinc-800 border-zinc-700 text-zinc-400';
                  return (
                    <tr key={i} className={`hover:bg-zinc-800/30 ${!synced && c.target ? 'row-dirty bg-amber-500/5' : ''}`}>
                      <td className="px-4 py-2.5">
                        <span className="prov-name font-bold text-zinc-200">{c.model_id}</span>
                        {cfg && <span className="prov-sub text-[9px] text-sky-400 ml-1"> custom</span>}
                      </td>
                      <td className="right tnum px-4 py-2.5 text-right font-medium text-zinc-100">
                        ${Number(c.our ?? c.ask_in).toFixed(4)}
                      </td>
                      <td className="right tnum faint px-4 py-2.5 text-right text-zinc-400">
                        {fmtCompetitorPrice(c.competitor_price)}
                      </td>
                      <td className="right px-4 py-2.5 text-center">
                        <input
                          className="ap-in w-16 text-center bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:border-sky-500"
                          type="text"
                          inputMode="decimal"
                          placeholder="%"
                          value={f.trigger ?? trigger}
                          onChange={(e) =>
                            setForm({ ...form, [key]: { ...f, trigger: e.target.value } })
                          }
                        />
                      </td>
                      <td className="right tnum px-4 py-2.5 text-right">
                        <span className="pos text-emerald-400 font-bold">${Number(c.target).toFixed(4)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={statusCls}>{status}</span>
                        {!synced && c.target ? (
                          <span className="prov-sub" title="harga skrg belum sesuai target — menunggu cycle berikutnya">
                            {' '}
                            ⏳
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className="btn btn-sm px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold disabled:opacity-50"
                            disabled={saving === key}
                            onClick={() => saveConfig(c.slug, c.model_id)}
                          >
                            {saving === key ? '…' : cfg ? 'Update' : 'Set'}
                          </button>
                          {cfg && (
                            <button
                              className="btn btn-sm btn-ghost p-1 rounded bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                              disabled={saving === key}
                              onClick={() => resetConfig(cfg.id, c.slug, c.model_id)}
                              title="kembali ke default"
                            >
                              ↺
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && !loading && (
                  <tr>
                    <td colSpan={7} className="dt-empty px-4 py-12 text-center text-zinc-500 font-sans text-xs">
                      Belum ada data — jalankan cycle dulu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SkeletonBlock>
      </section>

      {/* Log */}
      <section className="panel rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="panel-head border-b border-zinc-800/80 pb-2 mb-3">
          <h2 className="text-xs font-mono font-bold text-zinc-200">Log algo (80 baris terakhir)</h2>
        </div>
        <pre className="log-pre p-3 rounded-lg bg-black/60 border border-zinc-800 font-mono text-[11px] text-zinc-400 overflow-x-auto max-h-48">
          {data?.log || '—'}
        </pre>
      </section>
    </div>
  );
}
