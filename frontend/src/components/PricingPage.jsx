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
} from 'lucide-react';
import { apiFetch } from '../hooks/useApi';
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
  const [globalForms, setGlobalForms] = useState({});
  const [overrideForm, setOverrideForm] = useState({ upstream: '', model_id: '', trigger_pct: '' });
  const [askForm, setAskForm] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState('');
  const [searchOrderbook, setSearchOrderbook] = useState('');
  const { success, error: toastError } = useToast();

  const upstreamNames = useMemo(() => Object.keys(globals).sort(), [globals]);
  const overrideRows = Array.isArray(overrides) ? overrides : [];
  const orderbookRows = Array.isArray(orderbook) ? orderbook : [];

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
      setMessage(`✓ ${upstream} global config tersimpan`);
      success(`✓ ${upstream} global config tersimpan`);
      setGlobalForms((prev) => {
        const next = { ...prev };
        delete next[upstream];
        return next;
      });
      onChanged?.();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
      toastError(`Error: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const saveOverride = async (event) => {
    event.preventDefault();
    const { upstream, model_id, trigger_pct } = overrideForm;
    if (!upstream || !model_id || !(Number(trigger_pct) > 0)) {
      const err = 'Error: upstream, model_id, dan trigger_pct valid wajib diisi';
      setMessage(err);
      toastError(err);
      return;
    }
    setBusy('override-new');
    setMessage('');
    try {
      const response = await apiFetch('/api/auto-pricing/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({ upstream, model_id, trigger_pct: Number(trigger_pct) }),
      });
      const data = await response.json();
      if (!response.ok || data.error || data.ok === false)
        throw new Error(data.error || `HTTP ${response.status}`);
      setMessage(`✓ ${upstream}/${model_id} override tersimpan`);
      success(`✓ ${upstream}/${model_id} override tersimpan`);
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
    if (!override.id) return;
    const key = actionKey('delete', override.id);
    setBusy(key);
    setMessage('');
    try {
      const response = await apiFetch(`/api/auto-pricing/config/${override.id}`, {
        method: 'DELETE',
        headers: { 'Idempotency-Key': idempotencyKey() },
      });
      const data = await response.json();
      if (!response.ok || data.error || data.ok === false)
        throw new Error(data.error || `HTTP ${response.status}`);
      setMessage(`✓ ${override.upstream}/${override.model_id} override dihapus`);
      success(`✓ ${override.upstream}/${override.model_id} override dihapus`);
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
      setMessage(`✓ ${upstream} ask tersimpan`);
      success(`✓ ${upstream} ask tersimpan`);
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
    <div className="page pricing-page space-y-6" aria-label="Pricing control plane">
      {/* Header */}
      <div className="page-head flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="eyebrow text-xs font-mono font-semibold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20 inline-block mb-1">
            Publisher / Control plane
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
            Pricing Control
          </h2>
          <div className="sub text-xs sm:text-sm text-zinc-400 mt-0.5">
            Global economics, model-specific automation, and the merged ask orderbook.
          </div>
        </div>
      </div>

      {message && (
        <div
          className={
            message.startsWith('Error')
              ? 'batch-note pricing-error p-3 rounded-lg border bg-rose-500/10 border-rose-500/30 text-rose-300 text-xs'
              : 'batch-note p-3 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-xs'
          }
          role="status"
        >
          {message}
        </div>
      )}

      {/* Global per Upstream Grid */}
      <section className="panel pricing-section rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <div className="panel-head">
          <div>
            <h3 className="text-sm font-bold text-zinc-100">Global per Upstream</h3>
            <div className="sub text-xs text-zinc-400">
              Caps and revenue shares per upstream — trigger global kini di halaman Auto Pricing.
            </div>
          </div>
        </div>

        <div className="pricing-global-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {upstreamNames.map((upstream) => {
            const cfg = { ...globals[upstream], ...(globalForms[upstream] || {}) };
            const key = actionKey('global', upstream);
            return (
              <div
                key={upstream}
                className="pricing-global p-4 rounded-lg border border-zinc-800 bg-zinc-950/60 space-y-3"
              >
                <div className="pricing-row-head flex items-center justify-between">
                  <strong className="text-xs text-zinc-200">{upstream}</strong>
                  <button
                    className="btn btn-sm btn-primary px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px] disabled:opacity-50"
                    onClick={() => saveGlobal(upstream)}
                    disabled={busy?.startsWith('global-')}
                  >
                    Simpan
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  {fieldNames.map((field) => (
                    <label className="pricing-field space-y-0.5 block" key={field}>
                      <span className="text-[10px] font-mono text-zinc-400 uppercase">
                        {field}
                      </span>
                      <input
                        type="number"
                        step="0.0001"
                        value={cfg[field] ?? ''}
                        onChange={(e) => updateGlobalForm(upstream, field, e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100 outline-none focus:border-sky-500"
                      />
                    </label>
                  ))}
                </div>
                {busy === key && <span className="pricing-saving text-xs text-zinc-500">Menyimpan…</span>}
              </div>
            );
          })}
          {!upstreamNames.length && (
            <div className="dt-empty text-xs text-zinc-500">Belum ada konfigurasi upstream.</div>
          )}
        </div>
      </section>

      {/* Per-Model Override Section */}
      <section className="panel pricing-section rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <div className="panel-head">
          <div>
            <h3 className="text-sm font-bold text-zinc-100">Per-Model Override</h3>
            <div className="sub text-xs text-zinc-400">
              Override the trigger band for a specific upstream/model pair.
            </div>
          </div>
        </div>

        <form onSubmit={saveOverride} className="pricing-override-form grid grid-cols-1 sm:grid-cols-4 gap-3">
          {['upstream', 'model_id', 'trigger_pct'].map((field) => (
            <label className="pricing-field space-y-1 block text-xs" key={field}>
              <span className="text-[10px] font-mono text-zinc-400 uppercase">{field}</span>
              <input
                type={field.endsWith('_pct') ? 'number' : 'text'}
                step={field.endsWith('_pct') ? '0.0001' : undefined}
                value={overrideForm[field]}
                onChange={(e) => setOverrideForm((prev) => ({ ...prev, [field]: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-sky-500 font-mono"
              />
            </label>
          ))}
          <div className="flex items-end">
            <button
              className="btn btn-primary w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
              type="submit"
              disabled={busy === 'override-new'}
            >
              {busy === 'override-new' ? 'Menyimpan…' : 'Tambah override'}
            </button>
          </div>
        </form>

        <div className="table-scroll overflow-x-auto border border-zinc-800/80 rounded-lg">
          <table className="tbl w-full text-left text-xs border-collapse font-mono">
            <thead className="bg-zinc-950 text-zinc-400 text-[10px] uppercase border-b border-zinc-800">
              <tr>
                <th className="px-4 py-2.5">Upstream / model</th>
                <th className="px-4 py-2.5 text-center">trigger_pct</th>
                <th className="px-4 py-2.5">updated_at</th>
                <th className="px-4 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {overrideRows.map((override) => {
                const key = actionKey('delete', override.id);
                return (
                  <tr key={`${override.upstream}-${override.model_id}`} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-2 font-bold text-zinc-200">
                      {override.upstream} / {override.model_id}
                    </td>
                    <td className="tnum px-4 py-2 text-center text-sky-400">
                      {formatValue(override.trigger_pct)}
                    </td>
                    <td className="faint px-4 py-2 text-zinc-500 text-[11px]">{override.updated_at || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        className="btn btn-sm btn-danger px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-semibold text-[11px] border border-rose-500/30 disabled:opacity-50"
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
                  <td colSpan={4} className="dt-empty px-4 py-6 text-center text-zinc-500 font-sans text-xs">
                    Belum ada override tersimpan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Merged Orderbook Table */}
      <section className="panel pricing-section rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-100">Orderbook · merged asks + auto-pricing</h3>
            <div className="sub text-xs text-zinc-400">
              Our asks are marked separately from competitor levels. Set a manual ask per upstream — note: auto-pricing remains authoritative while armed.
            </div>
          </div>
        </div>

        <div className="table-scroll overflow-x-auto max-h-[500px]">
          <table className="tbl w-full text-left text-xs border-collapse font-mono">
            <thead className="sticky top-0 bg-zinc-950 text-zinc-400 text-[10px] uppercase border-b border-zinc-800">
              <tr>
                <th className="px-4 py-3 font-sans">Model</th>
                <th className="px-4 py-3 text-right">Min ask</th>
                <th className="px-4 py-3 text-right">Max ask</th>
                <th className="px-4 py-3 text-right">Spread</th>
                <th className="px-4 py-3 text-right font-bold text-emerald-400">Our ask</th>
                <th className="px-4 py-3">Levels</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {filteredOrderbook.map((row) => (
                <tr key={row.model_id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <strong className="font-bold text-zinc-200 font-sans">{row.label || row.model_id}</strong>
                    <div className="prov-sub text-[10px] text-zinc-500 font-mono">{row.model_id}</div>
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-zinc-300">
                    {formatValue(row.min_ask ?? row.ask)}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-zinc-400">{formatValue(row.max_ask)}</td>
                  <td className="tnum px-4 py-2.5 text-right text-amber-400">{formatValue(row.spread)}</td>
                  <td className="tnum pos px-4 py-2.5 text-right font-bold text-emerald-400">
                    {formatValue(row.our_ask)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="pricing-levels flex flex-wrap gap-1 max-w-sm">
                      {(row.upstreams || []).flatMap((upstream) =>
                        (upstream.levels || []).map((level, index) => (
                          <span
                            key={`${upstream.slug}-${index}`}
                            className={`pricing-level inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${
                              upstream.is_ours
                                ? 'ours bg-emerald-500/15 border-emerald-500/30 text-emerald-300 font-bold'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                            }`}
                          >
                            {formatValue(level.price)} · {upstream.is_ours ? 'ours' : upstream.label || upstream.slug}
                          </span>
                        ))
                      )}
                      {!row.upstreams?.length && row.ask != null && (
                        <span className="pricing-level inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border bg-zinc-950 border-zinc-800 text-zinc-400">
                          ask: {formatValue(row.ask)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      className="btn btn-sm px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-[11px]"
                      onClick={() => openAskForm(row)}
                    >
                      Set manual ask
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredOrderbook.length && (
                <tr>
                  <td colSpan={7} className="dt-empty px-4 py-12 text-center text-zinc-500 font-sans text-xs">
                    Belum ada data orderbook.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {askForm && (
          <form className="pricing-ask-form p-5 border-t border-zinc-800 bg-zinc-950/80 space-y-4" onSubmit={saveAsk}>
            <div className="pricing-ask-head text-sm font-bold text-zinc-100">
              <strong>
                Set manual ask — {askForm.upstream} / {askForm.model_id}
              </strong>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <label className="pricing-field space-y-1 block">
                <span className="text-[10px] font-mono text-zinc-400 uppercase">upstream</span>
                <input
                  type="text"
                  value={askForm.upstream}
                  onChange={(e) => setAskForm((prev) => ({ ...prev, upstream: e.target.value }))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 font-mono outline-none"
                />
              </label>

              <label className="pricing-field space-y-1 block">
                <span className="text-[10px] font-mono text-zinc-400 uppercase">
                  ask input per Mtok
                </span>
                <input
                  type="number"
                  step="0.0001"
                  value={askForm.ask_input_per_mtok}
                  onChange={(e) =>
                    setAskForm((prev) => ({ ...prev, ask_input_per_mtok: e.target.value }))
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 font-mono outline-none focus:border-sky-500"
                />
              </label>

              <label className="pricing-field space-y-1 block">
                <span className="text-[10px] font-mono text-zinc-400 uppercase">
                  ask output per Mtok
                </span>
                <input
                  type="number"
                  step="0.0001"
                  value={askForm.ask_output_per_mtok}
                  onChange={(e) =>
                    setAskForm((prev) => ({ ...prev, ask_output_per_mtok: e.target.value }))
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 font-mono outline-none focus:border-sky-500"
                />
              </label>
            </div>

            <div className="pricing-ask-actions flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200"
                onClick={() => setAskForm(null)}
              >
                Batal
              </button>
              <button
                className="btn btn-primary px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-sm"
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
