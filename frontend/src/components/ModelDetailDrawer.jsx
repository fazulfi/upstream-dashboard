import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Zap,
  TrendingDown,
  ShieldCheck,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  DollarSign,
  Layers,
  Cpu,
} from 'lucide-react';
import { apiFetch } from '../hooks/useApi';
import { useToast } from './Toast';

export default function ModelDetailDrawer({ model, isOpen, onClose, onUpdated }) {
  const [askInput, setAskInput] = useState('');
  const [triggerInput, setTriggerInput] = useState('');
  const [saving, setSaving] = useState(false);
  const { success, error: toastError } = useToast();

  if (!isOpen || !model) return null;

  const bare = (model.model_id || '').split('/').pop();
  const provider = model.slug || model.upstream || 'codebuddy-cn';
  const ourPrice = model.our_price != null ? Number(model.our_price) : model.our != null ? Number(model.our) : null;
  const compPrice = model.competitor_price != null ? Number(model.competitor_price) : null;
  const spreadDelta = ourPrice != null && compPrice != null ? ourPrice - compPrice : null;
  const spreadPct = ourPrice != null && compPrice != null && compPrice > 0 ? ((ourPrice - compPrice) / compPrice) * 100 : null;

  const handleSaveAsk = async (e) => {
    e.preventDefault();
    if (!(Number(askInput) > 0)) {
      toastError('Please enter a valid ask price > 0');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/ask', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upstream_slug: provider,
          upstream_catalog_model_id: model.model_id,
          ask_input_per_mtok: Number(askInput),
          ask_output_per_mtok: Number(askInput),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to update ask');
      success(`Updated ask for ${bare} to $${Number(askInput).toFixed(4)}`);
      setAskInput('');
      onUpdated?.();
    } catch (err) {
      toastError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTrigger = async (e) => {
    e.preventDefault();
    if (!(Number(triggerInput) > 0)) {
      toastError('Please enter a valid trigger % > 0');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/auto-pricing/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upstream: provider,
          model_id: bare,
          trigger_pct: Number(triggerInput),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to save trigger %');
      success(`Updated trigger for ${provider}/${bare} to ${triggerInput}%`);
      setTriggerInput('');
      onUpdated?.();
    } catch (err) {
      toastError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
      />

      {/* Slide-out Sheet Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 280 }}
          className="w-screen max-w-md bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col font-sans text-zinc-100"
        >
          {/* Drawer Header */}
          <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/60">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {provider}
                </span>
                <span className="text-xs text-zinc-500 font-mono">Model Inspector</span>
              </div>
              <h2 className="text-base font-bold text-zinc-100 truncate max-w-[280px]">
                {model.model_id}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Price Economics Breakdown */}
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                Market Economics
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
                  <div className="text-[10px] text-zinc-400 font-mono">Our Active Ask</div>
                  <div className="text-base font-extrabold font-mono text-emerald-400 mt-1">
                    {ourPrice != null ? `$${ourPrice.toFixed(4)}` : '—'}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono mt-0.5">per Mtok</div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
                  <div className="text-[10px] text-zinc-400 font-mono">Competitor Floor</div>
                  <div className="text-base font-extrabold font-mono text-zinc-300 mt-1">
                    {compPrice != null ? `$${compPrice.toFixed(4)}` : '—'}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono mt-0.5">platform best</div>
                </div>
              </div>

              {spreadDelta != null && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs font-mono">
                  <span className="text-zinc-400">Spread Difference:</span>
                  <span
                    className={`font-bold ${
                      spreadDelta <= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {spreadDelta <= 0 ? '' : '+'}${spreadDelta.toFixed(4)} ({spreadPct?.toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>

            {/* Quick Action 1: Set Manual Ask */}
            <form onSubmit={handleSaveAsk} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                  Set Direct Manual Ask
                </span>
                <DollarSign size={14} className="text-emerald-400" />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder={ourPrice ? `$${ourPrice.toFixed(4)}` : 'e.g. 0.0800'}
                  value={askInput}
                  onChange={(e) => setAskInput(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  disabled={saving || !askInput}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 transition-all cursor-pointer"
                >
                  {saving ? '…' : 'Save Ask'}
                </button>
              </div>
            </form>

            {/* Quick Action 2: Trigger Percentage Tuning */}
            <form onSubmit={handleSaveTrigger} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                  Auto-Pricing Trigger (%)
                </span>
                <Sliders size={14} className="text-sky-400" />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="10 (default)"
                  value={triggerInput}
                  onChange={(e) => setTriggerInput(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  disabled={saving || !triggerInput}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 transition-all cursor-pointer"
                >
                  {saving ? '…' : 'Update %'}
                </button>
              </div>
            </form>

            {/* Model Metadata List */}
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2.5 text-xs font-mono">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Telemetry Specs
              </div>
              <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-500">Provider Upstream</span>
                <span className="text-zinc-200 font-bold">{provider}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-500">Catalog Bare ID</span>
                <span className="text-zinc-200">{bare}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-500">Action Loop State</span>
                <span className="text-sky-400 font-bold">{(model.action || model.status || 'HOLD').toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-zinc-500">Last Telemetry Write</span>
                <span className="text-zinc-400">{model.freshness || 'Live'}</span>
              </div>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold cursor-pointer"
            >
              Close Inspector
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
