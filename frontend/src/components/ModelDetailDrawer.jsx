import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, DollarSign, Sliders, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../hooks/useApi';
import { useToast } from './Toast';

export function isDrawerSwipeClose(info) {
  return (info?.offset?.y ?? 0) > 100 || (info?.velocity?.y ?? 0) > 500;
}

export default function ModelDetailDrawer({ model, isOpen, onClose, onUpdated }) {
  const [askInput, setAskInput] = useState('');
  const [triggerInput, setTriggerInput] = useState('');
  const [maxInputCap, setMaxInputCap] = useState('');
  const [maxOutputCap, setMaxOutputCap] = useState('');
  const [minDiscount, setMinDiscount] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const { success, error: toastError } = useToast();

  const bare = (model?.model_id || '').split('/').pop();
  const provider = model?.slug || model?.upstream || 'codebuddy-cn';
  const ourPrice = model?.our_price != null ? Number(model.our_price) : model?.our != null ? Number(model.our) : null;
  const compPrice = model?.competitor_price != null ? Number(model.competitor_price) : null;
  const spreadDelta = ourPrice != null && compPrice != null ? ourPrice - compPrice : null;
  const spreadPct = ourPrice != null && compPrice != null && compPrice > 0 ? ((ourPrice - compPrice) / compPrice) * 100 : null;

  // Keyboard accessibility: dismiss sheet on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleDragEnd = (_e, info) => {
    // Dismiss sheet if user drags down beyond distance threshold or with downward velocity
    if (isDrawerSwipeClose(info)) {
      onClose?.();
    }
  };

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
          upstream_catalog_model_id: model?.model_id,
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

  const handleSaveBudget = async (e) => {
    e.preventDefault();
    const inCap = maxInputCap ? Number(maxInputCap) : null;
    const outCap = maxOutputCap ? Number(maxOutputCap) : null;
    const disc = minDiscount ? Number(minDiscount) : null;
    if (inCap == null && outCap == null && disc == null) {
      toastError('Please enter at least one budget limit or spend cap');
      return;
    }
    setSavingBudget(true);
    try {
      const modelId = model?.model_id || bare;
      const res = await apiFetch(`/api/budgets/${modelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_input_per_mtok: inCap,
          max_output_per_mtok: outCap,
          min_discount_pct: disc,
          enabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to save budget caps');
      success(`Budget spend caps saved for ${bare}`);
      setMaxInputCap('');
      setMaxOutputCap('');
      setMinDiscount('');
      onUpdated?.();
    } catch (err) {
      toastError(err.message);
    } finally {
      setSavingBudget(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && model && (
        <motion.div
          key="model-drawer-container"
          className="fixed inset-0 z-50 overflow-hidden font-sans"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md transition-opacity cursor-pointer"
          />

          {/* Centered Floating Sheet Panel */}
          <div className="fixed inset-0 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="ios-sheet w-full max-w-lg max-h-full pointer-events-auto"
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.8 }}
              dragSnapToOrigin={true}
              dragDirectionLock={true}
              onDragEnd={handleDragEnd}
            >
              {/* iOS Drag Handle */}
              <div
                className="ios-sheet-handle cursor-grab active:cursor-grabbing touch-none select-none"
                aria-label="Drag handle"
              />
              {/* Drawer Header */}
              <div className="p-6 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-400/30">
                      {provider}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Inspector</span>
                  </div>
                  <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white truncate max-w-[280px]">
                    {model?.model_id}
                  </h2>
                </div>
            <button
              onClick={onClose}
              className="ios-icon-btn p-2 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Price Economics Breakdown */}
            <div className="rounded-2xl p-5 space-y-4 border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Market Economics
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Our Active Ask</div>
                  <div className="text-lg font-extrabold font-mono text-sky-600 dark:text-sky-400 mt-1">
                    {ourPrice != null ? `$${ourPrice.toFixed(4)}` : '—'}
                  </div>
                  <div className="text-xs text-zinc-400 font-mono mt-0.5">per Mtok</div>
                </div>

                <div className="p-4 rounded-2xl bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Competitor Floor</div>
                  <div className="text-lg font-extrabold font-mono text-zinc-800 dark:text-zinc-200 mt-1">
                    {compPrice != null ? `$${compPrice.toFixed(4)}` : '—'}
                  </div>
                  <div className="text-xs text-zinc-400 font-mono mt-0.5">market best</div>
                </div>
              </div>

              {spreadDelta != null && (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 text-xs font-mono">
                  <span className="text-zinc-600 dark:text-zinc-400">Spread Difference:</span>
                  <span
                    className={`font-bold text-sm ${
                      spreadDelta <= 0 ? 'text-sky-600 dark:text-sky-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {spreadDelta <= 0 ? '' : '+'}${spreadDelta.toFixed(4)} ({spreadPct?.toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>

            {/* Quick Action 1: Set Direct Manual Ask */}
            <form onSubmit={handleSaveAsk} className="rounded-2xl p-5 space-y-3.5 border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Set Direct Manual Ask
                </span>
                <DollarSign size={16} className="text-sky-500" />
              </div>
              <div className="flex items-center gap-2.5">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder={ourPrice ? `$${ourPrice.toFixed(4)}` : 'e.g. 0.0800'}
                  value={askInput}
                  onChange={(e) => setAskInput(e.target.value)}
                  className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm font-mono text-[var(--text-title)] outline-none focus:border-sky-500 shadow-inner"
                />
                <button
                  type="submit"
                  disabled={saving || !askInput}
                  className="px-5 py-2 rounded-xl ios-btn-primary font-bold text-xs shadow-md disabled:opacity-50 transition-all cursor-pointer"
                >
                  {saving ? '…' : 'Save Ask'}
                </button>
              </div>
            </form>

            {/* Quick Action 2: Trigger Percentage Tuning */}
            <form onSubmit={handleSaveTrigger} className="rounded-2xl p-5 space-y-3.5 border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Auto-Pricing Trigger (%)
                </span>
                <Sliders size={16} className="text-sky-500" />
              </div>
              <div className="flex items-center gap-2.5">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="10 (default)"
                  value={triggerInput}
                  onChange={(e) => setTriggerInput(e.target.value)}
                  className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm font-mono text-[var(--text-title)] outline-none focus:border-sky-500 shadow-inner"
                />
                <button
                  type="submit"
                  disabled={saving || !triggerInput}
                  className="px-5 py-2 rounded-xl ios-btn-primary font-bold text-xs shadow-md disabled:opacity-50 transition-all cursor-pointer"
                >
                  {saving ? '…' : 'Update %'}
                </button>
              </div>
            </form>

            {/* Quick Action 3: Model Budget Spend Caps (R4) */}
            <form onSubmit={handleSaveBudget} className="rounded-2xl p-5 space-y-3.5 border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5" data-testid="model-budget-form">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Budget Manager & Spend Caps
                  </span>
                </div>
                <ShieldCheck size={16} className="text-sky-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="max-input-cap" className="text-[11px] font-mono text-[var(--text-sub)]">Max Input $/Mtok</label>
                  <input
                    id="max-input-cap"
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="e.g. 2.5000"
                    value={maxInputCap}
                    onChange={(e) => setMaxInputCap(e.target.value)}
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 py-2 text-xs sm:text-sm font-mono text-[var(--text-title)] outline-none focus:border-sky-500 shadow-inner"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="max-output-cap" className="text-[11px] font-mono text-[var(--text-sub)]">Max Output $/Mtok</label>
                  <input
                    id="max-output-cap"
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="e.g. 10.0000"
                    value={maxOutputCap}
                    onChange={(e) => setMaxOutputCap(e.target.value)}
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 py-2 text-xs sm:text-sm font-mono text-[var(--text-title)] outline-none focus:border-sky-500 shadow-inner"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={savingBudget || (!maxInputCap && !maxOutputCap && !minDiscount)}
                  className="px-5 py-2 rounded-xl ios-btn-primary font-bold text-xs shadow-md disabled:opacity-50 transition-all cursor-pointer"
                >
                  {savingBudget ? 'Saving…' : 'Save Budget Caps'}
                </button>
              </div>
            </form>

            {/* Model Metadata List */}
            <div className="rounded-2xl p-5 space-y-3 text-xs sm:text-sm font-mono border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                Telemetry Specs
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-black/10 dark:border-white/10">
                <span className="text-zinc-500">Provider Upstream</span>
                <span className="text-zinc-900 dark:text-zinc-100 font-bold">{provider}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-black/10 dark:border-white/10">
                <span className="text-zinc-500">Catalog Bare ID</span>
                <span className="text-zinc-700 dark:text-zinc-300">{bare}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-black/10 dark:border-white/10">
                <span className="text-zinc-500">Action Loop State</span>
                <span className="text-sky-600 dark:text-sky-400 font-bold">{(model.action || model.status || 'HOLD').toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-zinc-500">Last Telemetry Write</span>
                <span className="text-zinc-600 dark:text-zinc-400">{model.freshness || 'Live'}</span>
              </div>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-5 border-t border-black/10 dark:border-white/10 flex items-center justify-end">
            <button
              onClick={onClose}
              className="ios-btn-glass px-5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Close Inspector
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )}
</AnimatePresence>
  );
}
