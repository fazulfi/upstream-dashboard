import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaDir = 'neutral',
  icon: Icon,
  featured = false,
  sparkline = [30, 45, 35, 60, 50, 75, 65, 80],
  className = '',
}) {
  return (
    <motion.div
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className={`ios-glass-card relative overflow-hidden p-5 flex flex-col justify-between ${
        featured
          ? 'border-sky-500/50 shadow-sky-500/10'
          : ''
      } ${className}`}
    >
      {/* Top Row: Label and Icon */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-sub)]">
          {label}
        </span>
        {Icon && (
          <div
            className={`p-2.5 rounded-xl border ${
              featured
                ? 'bg-sky-500/15 border-sky-500/30 text-sky-700 dark:text-sky-300'
                : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-none text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <Icon size={18} />
          </div>
        )}
      </div>

      {/* Middle Row: Big Crisp Number & Sparkline */}
      <div className="flex items-end justify-between gap-3 mt-4 mb-2">
        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-title)] tabular-nums">
          {value != null ? value : '—'}
        </div>

        {sparkline && sparkline.length > 0 && (
          <div className="hidden sm:block w-20 h-7 shrink-0 opacity-80">
            <svg viewBox="0 0 80 28" className="w-full h-full overflow-visible">
              <polyline
                fill="none"
                stroke={deltaDir === 'up' || featured ? '#0ea5e9' : '#10b981'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparkline
                  .map((val, idx) => `${(idx / (sparkline.length - 1)) * 80},${28 - (val / 100) * 26}`)
                  .join(' ')}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Bottom Row: Clear Context & Delta */}
      <div className="flex items-center justify-between text-xs mt-2 pt-2.5 border-t border-black/10 dark:border-white/10 text-[var(--text-sub)] gap-2">
        <span className="truncate min-w-0 font-medium">{sub || '—'}</span>
        {delta && (
          <span
            className={`inline-flex items-center gap-1 font-bold shrink-0 ${
              deltaDir === 'up'
                ? 'text-emerald-700 dark:text-emerald-400'
                : deltaDir === 'down'
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-zinc-700 dark:text-zinc-300'
            }`}
          >
            {deltaDir === 'up' ? <ArrowUpRight size={14} /> : deltaDir === 'down' ? <ArrowDownRight size={14} /> : null}
            {delta}
          </span>
        )}
      </div>
    </motion.div>
  );
}
