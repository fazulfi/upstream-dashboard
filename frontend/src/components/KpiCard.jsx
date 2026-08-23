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
      className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 flex flex-col justify-between transition-colors ${
        featured
          ? 'bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-sky-950/30 border-sky-500/30 shadow-lg shadow-sky-500/5'
          : 'bg-zinc-900/40 hover:bg-zinc-900/70 border-zinc-800/80 hover:border-zinc-700/80 shadow-sm'
      } ${className}`}
    >
      {/* Top Row: Label and Icon */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        {Icon && (
          <div
            className={`p-2 rounded-xl border ${
              featured
                ? 'bg-sky-500/10 border-sky-500/20 text-sky-400'
                : 'bg-zinc-800/60 border-zinc-700/50 text-zinc-400'
            }`}
          >
            <Icon size={16} />
          </div>
        )}
      </div>

      {/* Middle Row: Big Number & Sparkline */}
      <div className="flex items-end justify-between gap-3 mt-3 mb-1">
        <div className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight text-zinc-100 tabular-nums">
          {value != null ? value : '—'}
        </div>

        {sparkline && sparkline.length > 0 && (
          <div className="hidden sm:block w-20 h-7 shrink-0 opacity-70">
            <svg viewBox="0 0 80 28" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id={`sparkGrad-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={deltaDir === 'up' || featured ? '#38bdf8' : '#10b981'}
                    stopOpacity="0.4"
                  />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline
                fill="none"
                stroke={deltaDir === 'up' || featured ? '#38bdf8' : '#10b981'}
                strokeWidth="2"
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

      {/* Bottom Row: Context & Delta */}
      <div className="flex items-center justify-between text-[11px] mt-1 pt-2 border-t border-zinc-800/40 text-zinc-500 font-mono">
        <span className="truncate max-w-[180px]">{sub || '—'}</span>
        {delta && (
          <span
            className={`inline-flex items-center gap-0.5 font-bold ${
              deltaDir === 'up'
                ? 'text-emerald-400'
                : deltaDir === 'down'
                ? 'text-rose-400'
                : 'text-zinc-400'
            }`}
          >
            {deltaDir === 'up' ? <ArrowUpRight size={12} /> : deltaDir === 'down' ? <ArrowDownRight size={12} /> : null}
            {delta}
          </span>
        )}
      </div>
    </motion.div>
  );
}
