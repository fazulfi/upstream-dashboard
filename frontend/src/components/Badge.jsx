import React from 'react';

export default function Badge({ kind = 'ok', dot = false, children, className = '' }) {
  const map = {
    ok: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    live: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    warn: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    drained: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    hold: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    bad: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    error: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    invalid: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    off: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    info: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    neutral: 'bg-zinc-800 text-zinc-300 border-zinc-700/60',
  };

  const dotMap = {
    ok: 'bg-emerald-400',
    active: 'bg-emerald-400',
    live: 'bg-emerald-400',
    warn: 'bg-amber-400',
    warning: 'bg-amber-400',
    drained: 'bg-amber-400',
    hold: 'bg-amber-400',
    bad: 'bg-rose-400',
    error: 'bg-rose-400',
    invalid: 'bg-rose-400',
    off: 'bg-rose-400',
    info: 'bg-sky-400',
    neutral: 'bg-zinc-400',
  };

  const colorCls = map[kind] || map.neutral;
  const dotCls = dotMap[kind] || dotMap.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border tracking-wide transition-colors ${colorCls} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotCls} animate-pulse`} />}
      {children}
    </span>
  );
}
