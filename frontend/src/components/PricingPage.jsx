import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CircleDollarSign,
  TrendingUp,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Search,
  Sliders,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, useApi } from '../hooks/useApi';
import Badge from './Badge';
import { useToast } from './Toast';

const fieldNames = ['max_ask_pct', 'platform_fee_pct', 'publisher_share_pct'];

function actionKey(prefix, value) {
  return `${prefix}-${value}`;
}

function idempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pricing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numberValue(value) {
  return value == null || value === '' ? '' : Number(value);
}

function formatValue(value) {
  return value == null || value === '' ? '—' : Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export default function PricingPage({ globals = {}, overrides = [], orderbook = [], onChanged }) {
  const marketApi = useApi('/api/market', 30000);
  const { data: marketData, loading: marketLoading, reload: reloadMarket } = marketApi || {};
  const [globalForms, setGlobalForms] = useState({});
  const [overrideForm, setOverrideForm] = useState({ upstream: '', model_id: '', trigger_pct: '' });
  const [askForm, setAskForm] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState('');
  const [searchOrderbook, setSearchOrderbook] = useState('');
  const [searchMarket, setSearchMarket] = useState('');
  const { success, error: toastError } = useToast();

  const upstreamNames = useMemo(() => Object.keys(globals).sort(), [globals]);
  const overrideRows = Array.isArray(overrides) ? overrides : [];
  const orderbookRows = Array.isArray(orderbook) ? orderbook : [];

  const marketModels = useMemo(() => {
    const raw = marketData?.models || (Array.isArray(marketData) ? marketData : []);
    return Array.isArray(raw) ? raw : [];
  }, [marketData]);

  const filteredMarketModels = useMemo(() => {
    if (!searchMarket) return marketModels;
    return marketModels.filter((m) => {
      const q = searchMarket.toLowerCase();
      const slug = (m.slug || m.model || m.model_id || '').toLowerCase();
      return slug.includes(q);
    });
  }, [marketModels, searchMarket]);

  const filteredOrderbook = useMemo(() => {
    if (!searchOrderbook) return orderbookRows;
    return orderbookRows.filter(
      (r) =>
        (r.model_id || '').toLowerCase().includes(searchOrderbook.toLowerCase()) ||
        (r.label || '').toLowerCase().includes(searchOrderbook.toLowerCase())
    );
  }, [orderbookRows, searchOrderbook]);

  const updateGlobalForm = (upstream, field, value) => {
    setGlobalForms((prev) => ({
      ...prev,
      [upstream]: { ...(prev[upstream] || globals[upstream]), [field]: value },
    }));
  };

  const saveGlobal = async (upstream) => {
    const cfg = { ...(globals[upstream] || {}), ...(globalForms[upstream] || {}) };
    if (!(Number(cfg.max_ask_pct) > 0)) {
      const err = `Error: ${upstream} max_ask_pct harus > 0`;
      setMessage(err);
      toastError(err);
      return;
    }
    const key = actionKey('global', upstream);
    setBusy(key);
    setMessage('');
    try {
      const response = await apiFetch('/api/pricing/global', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({
          upstream,
          ...fieldNames.reduce((out, field) => ({ ...out, [field]: numberValue(cfg[field]) }), {}),
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      const okMsg = `✓ ${upstream} global config tersimpan`;
      setMessage(okMsg);
      success(okMsg);
      setGlobalForms((prev) => {
        const next = { ...prev };
        delete next[upstream];
        return next;
      });
      onChanged?.();
    } catch (err) {
      const errText = `Error: ${err.message}`;
      setMessage(errText);
      toastError(errText);
    } finally {
      setBusy(null);
    }
  };

  const saveOverride = async (event) => {
    event.preventDefault();
    const { upstream, model_id, trigger_pct } = overrideForm;
    if (!upstream || !model_id || !(Number(trigger_pct) > 0)) {
      const err = 'Error: upstream, model_id, dan trigger_pct harus diisi';
      setMessage(err);
      toastError(err);
      return;
    }
    setBusy('override-new');
    setMessage('');
    try {
      const response = await apiFetch('/api/pricing/override', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({ upstream, model_id, trigger_pct: Number(trigger_pct) }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      const okMsg = `✓ ${upstream}/${model_id} override tersimpan`;
      setMessage(okMsg);
      success(okMsg);
      setOverrideForm({ upstream: '', model_id: '', trigger_pct: '' });
      onChanged?.();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
      toastError(`Error: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const deleteOverride = async (override) => {
    const key = actionKey('delete', override.id);
    setBusy(key);
    setMessage('');
    try {
      const response = await apiFetch(`/api/pricing/override/${override.id}`, {
        method: 'DELETE',
        headers: { 'Idempotency-Key': idempotencyKey() },
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      const okMsg = `✓ override ${override.upstream}/${override.model_id} dihapus`;
      setMessage(okMsg);
      success(okMsg);
      onChanged?.();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
      toastError(`Error: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const openAskForm = (row) => {
    const upstream = (row.upstreams || []).find((u) => u.is_ours) || (row.upstreams || [])[0];
    setAskForm({
      model_id: row.model_id,
      upstream: upstream?.slug || row.upstream || '',
      upstream_catalog_model_id:
        upstream?.upstream_catalog_model_id || row.upstream_catalog_model_id || row.model_id,
      ask_input_per_mtok: row.our_ask ?? row.ask ?? '',
      ask_output_per_mtok: row.our_ask ?? row.ask ?? '',
    });
    setMessage('');
  };

  const saveAsk = async (event) => {
    event.preventDefault();
    const { upstream, upstream_catalog_model_id, ask_input_per_mtok, ask_output_per_mtok } = askForm;
    if (!upstream || !upstream_catalog_model_id || !(Number(ask_input_per_mtok) > 0)) {
      const err = 'Error: upstream dan ask input per Mtok valid wajib diisi';
      setMessage(err);
      toastError(err);
      return;
    }
    setBusy('ask-set');
    setMessage('');
    try {
      const response = await apiFetch('/api/ask', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({
          upstream_catalog_model_id,
          upstream_slug: upstream,
          ask_input_per_mtok: Number(ask_input_per_mtok),
          ask_output_per_mtok:
            Number(ask_output_per_mtok) > 0 ? Number(ask_output_per_mtok) : Number(ask_input_per_mtok),
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      const okMsg = `✓ ${upstream} ask tersimpan`;
      setMessage(okMsg);
      success(okMsg);
      setAskForm(null);
      onChanged?.();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
      toastError(`Error: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="page pricing-page space-y-6 max-w-7xl mx-auto pb-12 font-sans transition-colors"
      aria-label="Pricing control plane"
    >
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/10 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-400/30">
              <CircleDollarSign size={13} />
              Manual Ask & Orderbook
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Market Depth</span>
          </div>
          <h1 className="text-3xl sm:text-[34px] font-extrabold tracking-tight leading-tight text-zinc-900 dark:text-white">
            Pricing & Orderbook
          </h1>
          <p className="text-[15px] text-zinc-600 dark:text-zinc-300 mt-1 max-w-2xl leading-relaxed">
            Konfigurasi parameter ekonomi global dan pantau kedalaman ask buku order pasar.
          </p>
        </div>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`batch-note p-4 rounded-2xl border text-xs sm:text-sm font-semibold shadow-md flex items-center gap-2.5 ${
            message.startsWith('Error')
              ? 'pricing-error bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300'
              : 'bg-sky-500/15 border-sky-500/30 text-sky-700 dark:text-sky-300'
          }`}
          role="status"
        >
          {message.startsWith('Error') ? <AlertTriangle size={18} className="text-rose-500" /> : <CheckCircle2 size={18} className="text-sky-500" />}
          <span>{message}</span>
        </motion.div>
      )}

      {/* Global per Upstream Grid */}
      <section className="panel pricing-section ios-glass-card p-6 space-y-4">
        <div className="panel-head border-b border-black/10 dark:border-white/10 pb-3">
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Global per Upstream</h2>
          <div className="sub text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">
            Batas atas ask dan persentase bagi hasil per provider upstream.
          </div>
        </div>

        <div className="pricing-global-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {upstreamNames.map((upstream) => {
            const cfg = { ...globals[upstream], ...(globalForms[upstream] || {}) };
            const key = actionKey('global', upstream);
            return (
              <div
                key={upstream}
                className="pricing-global p-5 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-3 hover:border-black/20 dark:hover:border-white/20 transition-colors"
              >
                <div className="pricing-row-head flex items-center justify-between">
                  <strong className="text-sm font-bold text-zinc-900 dark:text-white">{upstream}</strong>
                  <button
                    className="btn btn-sm btn-primary px-3.5 py-1.5 rounded-xl ios-btn-primary font-bold text-xs shadow-sm cursor-pointer"
                    onClick={() => saveGlobal(upstream)}
                    disabled={busy?.startsWith('global-')}
                  >
                    Simpan
                  </button>
                </div>

                <div className="space-y-2.5 text-xs sm:text-sm">
                  {fieldNames.map((field) => (
                    <label className="pricing-field space-y-1 block" key={field}>
                      <span className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                        {field}
                      </span>
                      <input
                        type="number"
                        step="0.0001"
                        value={cfg[field] ?? ''}
                        onChange={(e) => updateGlobalForm(upstream, field, e.target.value)}
                        className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 py-1.5 text-xs sm:text-sm font-mono text-[var(--text-title)] outline-none focus:border-sky-500 shadow-inner"
                      />
                    </label>
                  ))}
                </div>
                {busy === key && <span className="pricing-saving text-xs text-zinc-500 font-mono">Menyimpan…</span>}
              </div>
            );
          })}
          {!upstreamNames.length && (
            <div className="dt-empty text-sm text-zinc-500 py-4">Belum ada konfigurasi upstream.</div>
          )}
        </div>
      </section>

      {/* Per-Model Override Section */}
      <section className="panel pricing-section ios-glass-card p-6 space-y-4">
        <div className="panel-head border-b border-black/10 dark:border-white/10 pb-3">
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Per-Model Override</h2>
          <div className="sub text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">
            Atur selisih trigger % khusus untuk kombinasi model upstream tertentu.
          </div>
        </div>

        <form onSubmit={saveOverride} className="pricing-override-form grid grid-cols-1 sm:grid-cols-4 gap-3.5">
          {['upstream', 'model_id', 'trigger_pct'].map((field) => (
            <label className="pricing-field space-y-1 block text-xs" key={field}>
              <span className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase">{field}</span>
              <input
                type={field.endsWith('_pct') ? 'number' : 'text'}
                step={field.endsWith('_pct') ? '0.0001' : undefined}
                value={overrideForm[field]}
                onChange={(e) => setOverrideForm((prev) => ({ ...prev, [field]: e.target.value }))}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[var(--text-title)] outline-none focus:border-sky-500 font-mono shadow-inner"
              />
            </label>
          ))}
          <div className="flex items-end">
            <button
              className="btn btn-primary w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl ios-btn-primary text-xs sm:text-sm font-bold shadow-md disabled:opacity-50 transition-all cursor-pointer"
              type="submit"
              disabled={busy === 'override-new'}
            >
              {busy === 'override-new' ? 'Menyimpan…' : 'Tambah override'}
            </button>
          </div>
        </form>

        <div className="table-scroll overflow-x-auto border border-black/10 dark:border-white/10 rounded-2xl">
          <table className="tbl w-full text-left text-xs sm:text-sm border-collapse font-mono">
            <thead className="bg-[var(--table-head-bg)] text-zinc-700 dark:text-zinc-400 text-xs uppercase border-b border-black/10 dark:border-white/10 font-sans">
              <tr>
                <th className="px-5 py-3.5">Upstream / model</th>
                <th className="px-5 py-3.5 text-center">trigger_pct</th>
                <th className="px-5 py-3.5">updated_at</th>
                <th className="px-5 py-3.5 text-right font-sans">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/10">
              {overrideRows.map((override) => {
                const key = actionKey('delete', override.id);
                return (
                  <tr key={`${override.upstream}-${override.model_id}`} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 font-bold text-zinc-900 dark:text-zinc-100">
                      {override.upstream} / {override.model_id}
                    </td>
                    <td className="tnum px-5 py-3 text-center text-sky-700 dark:text-sky-400 font-bold">
                      {formatValue(override.trigger_pct)}
                    </td>
                    <td className="faint px-5 py-3 text-zinc-500 text-xs">{override.updated_at || '—'}</td>
                    <td className="px-5 py-3 text-right font-sans">
                      <button
                        className="btn btn-sm btn-danger px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 font-bold text-xs border border-rose-500/30 disabled:opacity-50 transition-all cursor-pointer"
                        onClick={() => deleteOverride(override)}
                        disabled={!override.id || busy === key}
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!overrideRows.length && (
                <tr>
                  <td colSpan={4} className="dt-empty px-5 py-8 text-center text-zinc-500 font-sans text-xs sm:text-sm">
                    Belum ada override tersimpan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Live Market Rates Section (R3) ── */}
      <section className="panel pricing-section ios-glass-card overflow-hidden shadow-xl" data-testid="live-market-rates-section">
        <div className="panel-head p-6 border-b border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
              <TrendingUp size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="eyebrow text-xs font-mono font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  Live Asks
                </span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              </div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                Live Market Rates & Spread
              </h2>
              <div className="sub text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">
                Snapshot harga ask terendah (floor) dan tertinggi di seluruh pasar InferHub.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Filter live market..."
                value={searchMarket}
                onChange={(e) => setSearchMarket(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl pl-9 pr-3.5 py-2 text-xs sm:text-sm font-mono text-[var(--text-title)] placeholder-zinc-400 outline-none focus:border-sky-500 shadow-inner"
              />
            </div>
            <button
              onClick={() => reloadMarket?.()}
              disabled={marketLoading}
              className="ios-btn-glass p-2 rounded-xl text-xs font-bold cursor-pointer"
              title="Refresh market rates"
            >
              <RefreshCw size={14} className={marketLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="table-scroll overflow-x-auto">
          <table className="tbl w-full text-left text-xs sm:text-sm border-collapse font-mono" data-testid="live-market-table">
            <thead className="bg-[var(--table-head-bg)] text-zinc-700 dark:text-zinc-400 text-xs uppercase border-b border-black/10 dark:border-white/10 font-sans">
              <tr>
                <th className="px-5 py-3.5">Model Identifier</th>
                <th className="px-5 py-3.5 text-right">Lowest Ask (Floor)</th>
                <th className="px-5 py-3.5 text-right">Highest Ask</th>
                <th className="px-5 py-3.5 text-right">Spread ($ / %)</th>
                <th className="px-5 py-3.5 text-center">Active Sellers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/10">
              {filteredMarketModels.map((m, idx) => {
                const slug = m.slug || m.model || m.model_id || `model-${idx}`;
                const minAsk = m.minAskIn ?? m.minAsk ?? m.min_ask ?? m.floorPrice ?? null;
                const maxAsk = m.maxAskIn ?? m.maxAsk ?? m.max_ask ?? m.ceilingPrice ?? null;
                const sellers = m.sellersCount ?? m.sellers ?? m.active_sellers ?? m.sellers_count ?? 1;
                const spreadVal = minAsk != null && maxAsk != null ? maxAsk - minAsk : (m.spread ?? null);
                const spreadPct = minAsk != null && maxAsk != null && minAsk > 0 ? ((maxAsk - minAsk) / minAsk) * 100 : null;

                return (
                  <tr key={slug} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sky-600 dark:text-sky-400">{slug}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-extrabold text-emerald-600 dark:text-emerald-400">
                      {minAsk != null ? `$${Number(minAsk).toFixed(4)}` : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-zinc-700 dark:text-zinc-300">
                      {maxAsk != null ? `$${Number(maxAsk).toFixed(4)}` : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs">
                      {spreadVal != null ? (
                        <div>
                          <span className="font-bold text-zinc-900 dark:text-white">${Number(spreadVal).toFixed(4)}</span>
                          {spreadPct != null && (
                            <span className="text-[10px] text-zinc-500 font-mono block">
                              +{spreadPct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="ios-badge px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                        {sellers} seller{sellers > 1 ? 's' : ''}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredMarketModels.length === 0 && (
                <tr>
                  <td colSpan={5} className="dt-empty px-5 py-8 text-center text-zinc-500 font-sans text-xs sm:text-sm">
                    {marketLoading ? 'Memuat data pasar live…' : 'Tidak ada data market rate yang cocok.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Merged Orderbook Table */}
      <section className="panel pricing-section ios-glass-card overflow-hidden shadow-xl">
        <div className="panel-head p-6 border-b border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">Orderbook · merged asks + auto-pricing</h2>
            <div className="sub text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">
              Kedalaman harga ask kita dibandingkan dengan level kompetitor pasar.
            </div>
          </div>

          <div className="relative min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search model..."
              value={searchOrderbook}
              onChange={(e) => setSearchOrderbook(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl pl-9 pr-3 py-1.5 text-xs sm:text-sm text-[var(--text-title)] placeholder-zinc-400 outline-none focus:border-sky-500 font-mono shadow-inner"
            />
          </div>
        </div>

        <div className="table-scroll overflow-x-auto max-h-[500px]">
          <table className="tbl w-full text-left text-xs sm:text-sm border-collapse font-mono">
            <thead className="sticky top-0 bg-[var(--table-head-bg)] text-zinc-700 dark:text-zinc-400 text-xs uppercase border-b border-black/10 dark:border-white/10 font-sans">
              <tr>
                <th className="px-5 py-3.5">Model</th>
                <th className="px-5 py-3.5 text-right">Min ask</th>
                <th className="px-5 py-3.5 text-right">Max ask</th>
                <th className="px-5 py-3.5 text-right">Spread</th>
                <th className="px-5 py-3.5 text-right font-bold text-sky-600 dark:text-sky-400">Our ask</th>
                <th className="px-5 py-3.5">Levels</th>
                <th className="px-5 py-3.5 text-right font-sans">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/10">
              {filteredOrderbook.map((row) => (
                <tr key={row.model_id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3.5">
                    <strong className="font-bold text-zinc-900 dark:text-zinc-100 font-sans text-sm">{row.label || row.model_id}</strong>
                    <div className="prov-sub text-xs text-zinc-500 font-mono">{row.model_id}</div>
                  </td>
                  <td className="tnum px-5 py-3.5 text-right text-zinc-700 dark:text-zinc-300">
                    {formatValue(row.min_ask ?? row.ask)}
                  </td>
                  <td className="tnum px-5 py-3.5 text-right text-zinc-500 dark:text-zinc-400">{formatValue(row.max_ask)}</td>
                  <td className="tnum px-5 py-3.5 text-right text-amber-700 dark:text-amber-400 font-bold">{formatValue(row.spread)}</td>
                  <td className="tnum pos px-5 py-3.5 text-right font-extrabold text-sky-600 dark:text-sky-400">
                    {formatValue(row.our_ask)}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="pricing-levels flex flex-wrap gap-1.5 max-w-sm">
                      {(row.upstreams || []).flatMap((upstream) =>
                        (upstream.levels || []).map((level, index) => (
                          <span
                            key={`${upstream.slug}-${index}`}
                            className={`pricing-level inline-flex items-center px-2 py-0.5 rounded text-[11px] border ${
                              upstream.is_ours
                                ? 'ours bg-sky-500/15 border-sky-500/30 text-sky-700 dark:text-sky-300 font-bold'
                                : 'bg-black/5 dark:bg-black/50 border-black/10 dark:border-white/10 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            {formatValue(level.price)} · {upstream.is_ours ? 'ours' : upstream.label || upstream.slug}
                          </span>
                        ))
                      )}
                      {!row.upstreams?.length && row.ask != null && (
                        <span className="pricing-level inline-flex items-center px-2 py-0.5 rounded text-[11px] border bg-black/5 dark:bg-black/50 border-black/10 dark:border-white/10 text-zinc-600 dark:text-zinc-400">
                          ask: {formatValue(row.ask)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right font-sans">
                    <button
                      className="btn btn-sm px-3.5 py-1.5 rounded-xl ios-btn-glass font-bold text-xs shadow-sm cursor-pointer"
                      onClick={() => openAskForm(row)}
                    >
                      Set manual ask
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredOrderbook.length && (
                <tr>
                  <td colSpan={7} className="dt-empty px-5 py-12 text-center text-zinc-500 font-sans text-xs sm:text-sm">
                    Belum ada data orderbook.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {askForm && (
          <form className="pricing-ask-form p-6 border-t border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/60 space-y-4" onSubmit={saveAsk}>
            <div className="pricing-ask-head text-sm font-bold text-zinc-900 dark:text-white flex items-center justify-between">
              <strong>
                Set manual ask — {askForm.upstream} / {askForm.model_id}
              </strong>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs sm:text-sm">
              <label className="pricing-field space-y-1 block">
                <span className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase">upstream</span>
                <input
                  type="text"
                  value={askForm.upstream}
                  onChange={(e) => setAskForm((prev) => ({ ...prev, upstream: e.target.value }))}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 py-2 text-[var(--text-title)] font-mono outline-none focus:border-sky-500"
                />
              </label>

              <label className="pricing-field space-y-1 block">
                <span className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                  ask input per Mtok
                </span>
                <input
                  type="number"
                  step="0.0001"
                  value={askForm.ask_input_per_mtok}
                  onChange={(e) =>
                    setAskForm((prev) => ({ ...prev, ask_input_per_mtok: e.target.value }))
                  }
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 py-2 text-[var(--text-title)] font-mono outline-none focus:border-sky-500"
                />
              </label>

              <label className="pricing-field space-y-1 block">
                <span className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                  ask output per Mtok
                </span>
                <input
                  type="number"
                  step="0.0001"
                  value={askForm.ask_output_per_mtok}
                  onChange={(e) =>
                    setAskForm((prev) => ({ ...prev, ask_output_per_mtok: e.target.value }))
                  }
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 py-2 text-[var(--text-title)] font-mono outline-none focus:border-sky-500"
                />
              </label>
            </div>

            <div className="pricing-ask-actions flex items-center justify-end gap-2.5 pt-2 font-sans">
              <button
                type="button"
                className="btn btn-ghost px-4 py-2 rounded-xl text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
                onClick={() => setAskForm(null)}
              >
                Batal
              </button>
              <button
                className="btn btn-primary px-5 py-2.5 rounded-xl ios-btn-primary font-bold text-xs sm:text-sm shadow-md cursor-pointer"
                type="submit"
                disabled={busy === 'ask-set'}
              >
                {busy === 'ask-set' ? 'Menyimpan…' : 'Simpan ask'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
