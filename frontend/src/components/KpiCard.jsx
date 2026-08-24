import React, { useId } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

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
  const gradientId = useId();
  const cleanId = `kpi-grad-${gradientId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // Theme styling mapping for icons, sparkline, and delta pills
  const theme = React.useMemo(() => {
    if (featured) {
      return {
        accent: '#0ea5e9',
        iconBg: 'bg-sky-500/15 border-sky-500/30 text-sky-600 dark:text-sky-400',
        sparkStroke: '#0ea5e9',
        sparkStop: '#38bdf8',
        deltaClass: 'bg-sky-500/15 border-sky-500/30 text-sky-700 dark:text-sky-300',
      };
    }
    if (deltaDir === 'up') {
      return {
        accent: '#0ea5e9',
        iconBg: 'bg-sky-500/15 border-sky-500/30 text-sky-600 dark:text-sky-400',
        sparkStroke: '#0ea5e9',
        sparkStop: '#38bdf8',
        deltaClass: 'bg-sky-500/15 border-sky-500/30 text-sky-700 dark:text-sky-300',
      };
    }
    if (deltaDir === 'down') {
      return {
        accent: '#f43f5e',
        iconBg: 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400',
        sparkStroke: '#f43f5e',
        sparkStop: '#fb7185',
        deltaClass: 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300',
      };
    }
    return {
      accent: '#6366f1',
      iconBg: 'bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/10 text-zinc-700 dark:text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-none',
      sparkStroke: '#6366f1',
      sparkStop: '#818cf8',
      deltaClass: 'bg-zinc-500/10 dark:bg-zinc-400/15 border-zinc-500/20 text-zinc-700 dark:text-zinc-300',
    };
  }, [featured, deltaDir]);

  // Compute SVG geometry for sparkline
  const sparklineData = React.useMemo(() => {
    if (!sparkline || sparkline.length < 2) return null;
    const width = 80;
    const height = 28;
    const min = Math.min(...sparkline);
    const max = Math.max(...sparkline);
    const range = max - min || 1;

    const pts = sparkline.map((val, idx) => {
      const x = (idx / (sparkline.length - 1)) * width;
      const y = height - 3 - ((val - min) / range) * (height - 6);
      return [x, y];
    });

    const linePoints = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const areaPoints = `0,${height} ${linePoints} ${width},${height}`;

    return { linePoints, areaPoints, width, height };
  }, [sparkline]);

  return (
    <div
      className={`ios-glass-card group relative overflow-hidden p-5 sm:p-6 rounded-[1.75rem] flex flex-col justify-between cursor-default ${
        featured
          ? 'border-sky-500/40 dark:border-sky-400/40 shadow-[0_12px_36px_-6px_rgba(14,165,233,0.22)] ring-1 ring-sky-500/25'
          : ''
      } ${className}`}
    >
      {/* Specular Top Rim Highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 dark:via-white/20 to-transparent" />

      {/* Ambient Accent Glow (featured cards) */}
      {featured && (
        <div className="pointer-events-none absolute -top-12 -right-12 w-32 h-32 bg-sky-500/15 dark:bg-sky-400/20 rounded-full blur-2xl transition-opacity group-hover:opacity-100 opacity-60" />
      )}

      {/* Top Row: Eyebrow Category Label & Tinted Icon Squircle */}
      <div className="flex items-center justify-between gap-2 z-10">
        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-vibrant-secondary font-sans truncate">
          {label}
        </span>
        {Icon && (
          <div
            className={`p-2.5 rounded-2xl border transition-colors duration-300 group- group-hover:rotate-1 shrink-0 ${theme.iconBg}`}
          >
            <Icon size={18} strokeWidth={2.2} />
          </div>
        )}
      </div>

      {/* Middle Row: Big Crisp Tabular Readout & Volume Sparkline */}
      <div className="flex items-baseline justify-between gap-3 mt-4 mb-2 min-w-0 z-10">
        <div className="text-2xl sm:text-3xl lg:text-[2rem] font-extrabold tracking-tight text-[var(--text-title)] tabular-nums font-sans leading-none break-words min-w-0">
          {value != null ? value : '—'}
        </div>

        {sparklineData && (
          <div className="hidden sm:block w-20 h-7 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
            <svg
              viewBox={`0 0 ${sparklineData.width} ${sparklineData.height}`}
              className="w-full h-full overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={cleanId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.sparkStop} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={theme.sparkStroke} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={sparklineData.areaPoints} fill={`url(#${cleanId})`} />
              <polyline
                fill="none"
                stroke={theme.sparkStroke}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparklineData.linePoints}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Bottom Row: Context Subtitle & Semantic Delta Badge */}
      <div className="flex items-center justify-between text-xs mt-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08] text-vibrant-secondary gap-2 z-10">
        <span
          className="truncate min-w-0 font-medium text-xs text-vibrant-secondary"
          title={typeof sub === 'string' ? sub : undefined}
        >
          {sub || '—'}
        </span>
        {delta && (
          <span
            className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[11px] tabular-nums shrink-0 border transition-colors ${theme.deltaClass}`}
          >
            {deltaDir === 'up' ? (
              <ArrowUpRight size={13} className="stroke-[2.5]" />
            ) : deltaDir === 'down' ? (
              <ArrowDownRight size={13} className="stroke-[2.5]" />
            ) : (
              <Minus size={11} className="stroke-[2.5]" />
            )}
            <span>{delta}</span>
          </span>
        )}
      </div>
    </div>
  );
}
