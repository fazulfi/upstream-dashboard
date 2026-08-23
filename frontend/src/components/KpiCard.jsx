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
          ? 'border-sky-400/40 shadow-sky-500/10'
          : ''
      } ${className}`}
    >
      {/* Top Row: Label and Icon */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        {Icon && (
          <div
            className={`p-2.5 rounded-xl border ${
              featured
                ? 'bg-sky-500/15 border-sky-400/30 text-sky-300'
                : 'bg-white/5 border-white/10 text-zinc-300'
            }`}
          >
            <Icon size={18} />
          </div>
        )}
      </div>

      {/* Middle Row: Big Crisp Number & Sparkline */}
      <div className="flex items-end justify-between gap-3 mt-4 mb-2">
        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white tabular-nums">
          {value != null ? value : '—'}
        </div>

        {sparkline && sparkline.length > 0 && (
          <div className="hidden sm:block w-20 h-7 shrink-0 opacity-80">
            <svg viewBox="0 0 80 28" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id={`sparkGrad-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={deltaDir === 'up' || featured ? '#38bdf8' : '#34d399'}
                    stopOpacity="0.5"
                  />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline
                fill="none"
                stroke={deltaDir === 'up' || featured ? '#38bdf8' : '#34d399'}
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
      <div className="flex items-center justify-between text-xs mt-2 pt-2.5 border-t border-white/10 text-zinc-400 gap-2">
        <span className="truncate min-w-0 font-medium">{sub || '—'}</span>
        {delta && (
          <span
            className={`inline-flex items-center gap-1 font-bold shrink-0 ${
              deltaDir === 'up'
                ? 'text-emerald-400'
                : deltaDir === 'down'
                ? 'text-rose-400'
                : 'text-zinc-300'
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
