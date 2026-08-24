import React from 'react';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';

export default function FinanceStatus({ metrics = [], variance = '' }) {
  return (
    <section className="finance-status ios-inset-group rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]" aria-label="Finance status">
      <div className="px-4 py-2.5 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.04]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-vibrant-secondary font-sans">
          Status Metrik (decision-grade)
        </h3>
      </div>
      <ul className="finance-metrics divide-y divide-black/[0.06] dark:divide-white/[0.08]">
        {metrics.map((m) => (
          <li
            key={m.key}
            className={`metric metric-${m.verified ? 'verified' : 'pending'} px-4 py-3 flex items-center justify-between gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`p-1 rounded-full ${m.verified ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
                {m.verified ? <CheckCircle2 size={13} className="stroke-[2.5]" /> : <Clock size={13} className="stroke-[2.5]" />}
              </div>
              <span className="metric-label text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {m.label}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="metric-value font-mono tabular-nums text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {m.value}
              </span>
              <span
                className={`ios-badge badge badge-${m.verified ? 'verified' : 'pending'} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors ${
                  m.verified
                    ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                }`}
              >
                {m.verified ? '✓ verified' : 'pending'}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {variance ? (
        <div className="px-4 py-2.5 border-t border-black/[0.06] dark:border-white/[0.08] bg-rose-500/[0.06] dark:bg-rose-500/[0.10] flex items-center gap-2">
          <AlertCircle size={14} className="text-rose-600 dark:text-rose-400 shrink-0" />
          <p className="finance-variance text-xs font-medium text-rose-700 dark:text-rose-300">
            {variance}
          </p>
        </div>
      ) : null}
    </section>
  );
}
