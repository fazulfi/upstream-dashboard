import React from 'react';
import { motion } from 'motion/react';
import Sparkline from './Sparkline';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function KpiCard({
  label,
  value,
  delta = null,
  deltaDir = null,
  spark = null,
  sub = null,
  icon: Icon = null,
  featured = false,
  className = '',
}) {
  const isPositive = deltaDir === 'up';
  const isNegative = deltaDir === 'down';

  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className={`relative overflow-hidden rounded-xl border p-4 transition-colors ${
        featured
          ? 'bg-zinc-900/90 border-sky-500/30 shadow-lg shadow-sky-500/5'
          : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700/80'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-zinc-400 truncate uppercase tracking-wider">{label}</span>
        {Icon && (
          <div className="p-1.5 rounded-md bg-zinc-800/80 text-zinc-400">
            <Icon size={14} />
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold font-mono tracking-tight text-zinc-100">{value ?? '—'}</div>
        {delta && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded border ${
              isPositive
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : isNegative
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300'
            }`}
          >
            {isPositive && <TrendingUp size={12} />}
            {isNegative && <TrendingDown size={12} />}
            {delta}
          </span>
        )}
      </div>

      {(sub || spark) && (
        <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between gap-2">
          {sub && <span className="text-[11px] text-zinc-400 truncate">{sub}</span>}
          {spark && spark.length > 0 && (
            <div className="w-20 h-6 shrink-0 ml-auto">
              <Sparkline data={spark} color={featured ? '#38bdf8' : '#a1a1aa'} strokeWidth={1.5} />
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
