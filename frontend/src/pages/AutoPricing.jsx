import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  SlidersHorizontal,
  ShieldCheck,
  ShieldAlert,
  Zap,
  TrendingDown,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Terminal,
  Copy,
  Sparkles,
} from 'lucide-react';
import { useApi, apiFetch } from '../hooks/useApi';
import { SkeletonBlock } from '../components/Skeleton';
import { fmtCompetitorPrice } from '../lib/fmt';
import KpiCard from '../components/KpiCard';
import Badge from '../components/Badge';
import { useToast } from '../components/Toast';

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
  const [searchModel, setSearchModel] = useState('');
  const { success, error: toastError, warn } = useToast();

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

  const rows = useMemo(() => {
    const list = prov ? byProv[prov] || [] : [];
    if (!searchModel) return list;
    return list.filter((r) =>
      (r.model_id || '').toLowerCase().includes(searchModel.toLowerCase())
    );
  }, [prov, byProv, searchModel]);

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
      const msg = d.armed
        ? '✓ ARMED — eksekusi PUT harga jual nyata'
        : '✓ DISARMED — mode dry-run (hitung saja, tanpa PUT)';
      setNote(msg);
      if (d.armed) success('Auto-Pricing ARMED — live PUT active!');
      else warn('Auto-Pricing DISARMED — switched to dry-run mode.');
      setTimeout(reload, 500);
    } catch (e) {
      setNote('Error: ' + e.message);
      toastError(`Error: ${e.message}`);
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
      const err = `Error: trigger (${trigger}) harus > 0`;
      setNote(err);
      toastError(err);
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
        toastError(d.error || 'Update failed');
      } else {
        const okMsg = `✓ ${upstream}/${bare} → trigger ${trigger}%`;
        setNote(okMsg);
        success(okMsg);
        setForm((prev) => {
          const n = { ...prev };
          delete n[key];
          return n;
        });
        setTimeout(reloadCfg, 300);
      }
    } catch (e) {
      setNote('Error: ' + e.message);
      toastError(`Error: ${e.message}`);
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
      if (d.ok) {
        const okMsg = `✓ ${upstream}/${model_id} → kembali default`;
        setNote(okMsg);
        success(okMsg);
        setTimeout(reloadCfg, 300);
      } else {
        setNote('Error: ' + (d.error || ''));
        toastError(d.error || 'Reset failed');
      }
    } catch (e) {
      setNote('Error: ' + e.message);
      toastError(`Error: ${e.message}`);
    } finally {
      setSaving(null);
    }
  };

  const saveGlobalTrigger = async (upstream) => {
    const globals = globalsData?.globals || {};
    const cfg = {
      ...(globals[upstream] || {}),
      ...(globalForm[upstream] !== undefined ? { global_trigger_pct: globalForm[upstream] } : {}),
    };
    if (!(Number(cfg.max_ask_pct) > 0)) {
      const err = `Error: ${upstream} max_ask_pct belum tersedia — simpan via halaman Pricing dulu`;
      setNote(err);
      toastError(err);
      return;
    }
    const trigger =
      cfg.global_trigger_pct !== undefined && cfg.global_trigger_pct !== ''
        ? Number(cfg.global_trigger_pct)
        : null;
    if (trigger !== null && !(trigger > 0)) {
      const err = `Error: trigger global (${trigger}) harus > 0`;
      setNote(err);
      toastError(err);
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
        toastError(d.error || 'Save failed');
      } else {
        const okMsg =
          trigger === null
            ? `✓ ${upstream} trigger global dihapus (default per model dipakai)`
            : `✓ ${upstream} trigger global → ${trigger}%`;
        setNote(okMsg);
        success(okMsg);
        setGlobalForm((prev) => {
          const n = { ...prev };
          delete n[upstream];
          return n;
        });
        setTimeout(reloadGlobals, 300);
      }
    } catch (e) {
      setNote('Error: ' + e.message);
      toastError(`Error: ${e.message}`);
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
        toastError(d.error || 'Failed to update scope');
      } else {
        const okMsg = enabled
          ? `✓ ${upstream} masuk scope auto-pricing (cycle berikutnya diproses)`
          : `✓ ${upstream} dikeluarkan dari scope — TIDAK diproses cycle berikutnya`;
        setNote(okMsg);
        success(okMsg);
        setTimeout(reloadGlobals, 300);
      }
    } catch (e) {
      setNote('Error: ' + e.message);
      toastError(`Error: ${e.message}`);
    } finally {
      setSavingGlobal(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="page space-y-6 max-w-7xl mx-auto"
    >
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/90 via-zinc-900/40 to-zinc-950 p-6 shadow-xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-sky-500/15 text-sky-300 border border-sky-500/30">
                <Zap size={11} className="text-sky-400" />
                Dynamic Market Execution
              </span>
              <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
                Tic-by-tic competitor tracking
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight">
              Auto-Pricing Control & Scope Engine
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
              Configure dynamic undercut margins, global trigger thresholds (uniform 10%), and upstream execution scopes.
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all ${
              data?.armed
                ? 'btn btn-ghost bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                : 'btn btn-primary bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white border border-emerald-400/30 shadow-emerald-500/20'
            }`}
            onClick={toggle}
            disabled={arming}
          >
            {arming ? '…' : data?.armed ? 'Disarm (dry-run)' : 'Arm (eksekusi harga)'}
          </motion.button>
        </div>
      </div>

      {/* Action Notification Note */}
      {note && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`batch-note p-3.5 rounded-xl border text-xs font-semibold shadow-md flex items-center gap-2.5 ${
            note.startsWith('Error')
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {note.startsWith('Error') ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          <span>{note}</span>
        </motion.div>
      )}

      {/* Top KPIs */}
      <div className="kpis grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <KpiCard
          label="Status algo"
          value={data?.armed ? 'ARMED' : 'DRY-RUN'}
          sub={data?.armed ? 'eksekusi PUT nyata' : 'hitung saja, aman'}
          featured={Boolean(data?.armed)}
          icon={data?.armed ? ShieldCheck : ShieldAlert}
        />
        <KpiCard
          label="Model diproses"
          value={cycles.length}
          sub={`${provs.length} provider`}
        />
        <KpiCard
          label="Undercut"
          value={nUnd}
          icon={TrendingDown}
          sub="ikuti kompetitor"
        />
        <KpiCard
          label="Leader/Hold"
          value={nLead + nHold}
          sub="sudah termurah"
        />
        <KpiCard
          label="Update"
          value={data?.ts ? new Date(data.ts).toLocaleTimeString('id-ID') : '—'}
          sub="cycle terakhir"
        />
      </div>

      {/* Global Trigger & Scope per Provider */}
      <section className="panel rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md p-6 space-y-4 shadow-lg">
        <div className="panel-head border-b border-zinc-800/80 pb-3">
          <h2 className="text-sm font-bold text-zinc-100">Trigger global & scope · per provider</h2>
          <div className="sub text-xs text-zinc-400 mt-0.5">
            Default trigger % untuk semua model provider ini — per-model override tetap menang. Kosongkan untuk pakai default 10% · matikan untuk keluarkan provider dari auto-pricing.
          </div>
        </div>

        <div className="pricing-global-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(globalsData?.globals ? Object.keys(globalsData.globals).sort() : []).map((upstream) => {
            const cfg = {
              ...(globalsData.globals[upstream] || {}),
              ...(globalForm[upstream] !== undefined ? { global_trigger_pct: globalForm[upstream] } : {}),
            };
            const isEnabled = cfg.auto_pricing_enabled !== false;
            return (
              <div
                className="pricing-global p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 space-y-3 hover:border-zinc-700 transition-colors shadow-sm"
                key={upstream}
              >
                <div className="pricing-row-head flex items-center justify-between">
                  <strong className="text-xs font-bold text-zinc-200">{upstream}</strong>
                  <div className="flex items-center gap-2">
                    <label
                      className="ap-scope-toggle flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none font-mono"
                      title={
                        cfg.auto_pricing_enabled === false
                          ? 'nonaktif — tidak diproses'
                          : 'aktif — diproses tiap cycle'
                      }
                    >
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        disabled={savingGlobal === upstream}
                        onChange={(e) => toggleScope(upstream, e.target.checked)}
                        className="rounded border-zinc-700 text-sky-600 focus:ring-0"
                      />
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isEnabled
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                            : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                        }`}
                      >
                        {isEnabled ? 'on' : 'off'}
                      </span>
                    </label>
                    <button
                      className="btn btn-sm btn-primary px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] shadow-sm disabled:opacity-50 transition-all"
                      onClick={() => saveGlobalTrigger(upstream)}
                      disabled={savingGlobal === upstream}
                    >
                      {savingGlobal === upstream ? '…' : 'Simpan'}
                    </button>
                  </div>
                </div>

                <label className="pricing-field space-y-1 block text-xs">
                  <span className="text-[10px] font-mono font-bold uppercase text-zinc-400">
                    global_trigger_pct (%)
                  </span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="10 (default)"
                    value={cfg.global_trigger_pct ?? ''}
                    onChange={(e) =>
                      setGlobalForm((prev) => ({ ...prev, [upstream]: e.target.value }))
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 outline-none focus:border-sky-500"
                  />
                </label>
              </div>
            );
          })}
          {!(globalsData?.globals && Object.keys(globalsData.globals).length) && (
            <div className="dt-empty text-xs text-zinc-500 py-4">Belum ada konfigurasi upstream.</div>
          )}
        </div>
      </section>

      {/* Tabs per Provider */}
      <div className="ap-tabs flex items-center gap-2 border-b border-zinc-800 pb-1 overflow-x-auto">
        {provs.map((u) => (
          <button
            key={u}
            className={`ap-tab px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              prov === u
                ? 'active bg-sky-500/15 text-sky-300 font-bold border border-sky-500/30 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
            }`}
            onClick={() => setProv(u)}
          >
            <span>{u}</span>
            <span className="faint font-mono text-[10px] text-zinc-500 ml-1.5">
              ({byProv[u].length})
            </span>
          </button>
        ))}
      </div>

      {/* Target Table */}
      <section className="panel rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-lg">
        <div className="panel-head p-5 border-b border-zinc-800/80 bg-zinc-900/80 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Target harga per model · {prov || '—'}</h2>
            <div className="sub text-xs text-zinc-400 mt-0.5">
              Klik set untuk simpan trigger% model ini (daemon baca tiap cycle)
            </div>
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Cari model..."
              value={searchModel}
              onChange={(e) => setSearchModel(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg pl-7 pr-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-sky-500 font-mono"
            />
          </div>
        </div>

        <SkeletonBlock loading={loading} rows={6}>
          <div className="overflow-x-auto max-h-[480px]">
            <table className="tbl w-full text-left text-xs border-collapse font-mono">
              <thead className="sticky top-0 bg-zinc-950 text-zinc-400 text-[10px] uppercase border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Model</th>
                  <th className="right px-4 py-3 text-right">Ask skrg</th>
                  <th className="right px-4 py-3 text-right">Kompetitor</th>
                  <th className="right px-4 py-3 text-center">Trigger %</th>
                  <th className="right px-4 py-3 text-right font-bold text-emerald-400">Target</th>
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
                      ? 'tag tag-ok px-2 py-0.5 rounded text-[11px] font-bold border bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : action === 'undercut'
                      ? 'tag tag-imp px-2 py-0.5 rounded text-[11px] font-bold border bg-sky-500/10 border-sky-500/30 text-sky-400'
                      : 'tag px-2 py-0.5 rounded text-[11px] font-medium border bg-zinc-800 border-zinc-700 text-zinc-400';
                  return (
                    <tr
                      key={i}
                      className={`hover:bg-zinc-800/30 transition-colors ${
                        !synced && c.target ? 'row-dirty bg-amber-500/5' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <span className="prov-name font-bold text-zinc-200">{c.model_id}</span>
                        {cfg && (
                          <span className="prov-sub text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 ml-1.5">
                            custom
                          </span>
                        )}
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
                        <span className="pos text-emerald-400 font-bold">
                          ${Number(c.target).toFixed(4)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={statusCls}>{status}</span>
                        {!synced && c.target ? (
                          <span className="prov-sub text-xs ml-1" title="harga skrg belum sesuai target — menunggu cycle berikutnya">
                            ⏳
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className="btn btn-sm px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold disabled:opacity-50 shadow-sm"
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
                              <RotateCcw size={13} />
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

      {/* Terminal Log */}
      <section className="panel rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-lg">
        <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-zinc-400" />
            <h2 className="text-xs font-mono font-bold text-zinc-200">Log algo (80 baris terakhir)</h2>
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(data?.log || '');
              success('Log copied to clipboard!');
            }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:text-zinc-100 text-[11px]"
          >
            <Copy size={12} />
            <span>Copy</span>
          </button>
        </div>
        <pre className="log-pre p-4 text-[11px] font-mono text-zinc-400 bg-black/50 overflow-x-auto max-h-52 leading-relaxed">
          {data?.log || '—'}
        </pre>
      </section>
    </motion.div>
  );
}
