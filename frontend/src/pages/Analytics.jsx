import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  Zap,
  Layers,
  CircleDollarSign,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Server,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '../hooks/useApi';
import KpiCard from '../components/KpiCard';
import { SkeletonBlock, SkeletonCard } from '../components/Skeleton';
import { fmtUsdMicro } from '../lib/fmt';

const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'all', label: 'All Time' },
];

function formatTokens(val) {
  const n = Number(val || 0);
  if (!isFinite(n) || n === 0) return '0';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + ' B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + ' k';
  return n.toLocaleString();
}

function PromptCacheEfficiencyRing({ hitRate = 0, cachedTokens = 0, promptTokens = 0, size = 160 }) {
  const percentage = Math.min(100, Math.max(0, Number(hitRate || 0) * 100));
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  let badgeLabel = '🌱 Cold Cache';
  let badgeColor = 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30';
  let gradientFrom = '#38bdf8';
  let gradientTo = '#06b6d4';

  if (percentage >= 70) {
    badgeLabel = '⚡ High Efficiency';
    badgeColor = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
    gradientFrom = '#10b981';
    gradientTo = '#06b6d4';
  } else if (percentage >= 40) {
    badgeLabel = '⚡ Normal';
    badgeColor = 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
    gradientFrom = '#0ea5e9';
    gradientTo = '#38bdf8';
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 p-6 ios-glass-card rounded-[1.75rem] border border-black/10 dark:border-white/10">
      <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <defs>
            <linearGradient id="cacheGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradientFrom} />
              <stop offset="100%" stopColor={gradientTo} />
            </linearGradient>
          </defs>
          {/* Background Track Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-black/10 dark:text-white/10"
          />
          {/* Progress Activity Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="url(#cacheGaugeGrad)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        {/* Center Percentage Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums text-[var(--text-title)]">
            {percentage.toFixed(1)}%
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-vibrant-secondary font-mono">
            Hit Rate
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-2 text-center sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badgeColor}`}>
            {badgeLabel}
          </span>
          <span className="text-xs text-vibrant-secondary font-mono">
            Target &gt; 70%
          </span>
        </div>
        <h3 className="text-lg font-bold text-[var(--text-title)]">
          Prompt Cache Efficiency
        </h3>
        <p className="text-xs text-vibrant-secondary max-w-md leading-relaxed">
          {percentage >= 70
            ? 'Optimal prompt cache utilization. Reusing cached contexts significantly reduces latency and token costs.'
            : percentage >= 40
            ? 'Moderate cache hit rate. Grouping similar system prompts can increase efficiency.'
            : 'Low cache reuse detected. Consider reusing common system prefixes across API requests.'}
        </p>
        <div className="flex items-center justify-center sm:justify-start gap-4 pt-2 text-xs font-mono text-vibrant-secondary border-t border-black/5 dark:border-white/10">
          <div>
            <span className="text-[10px] uppercase text-zinc-400 block">Cached</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatTokens(cachedTokens)}
            </span>
          </div>
          <div className="h-6 w-px bg-black/10 dark:bg-white/10" />
          <div>
            <span className="text-[10px] uppercase text-zinc-400 block">Total Prompt</span>
            <span className="font-bold text-sky-600 dark:text-sky-400 tabular-nums">
              {formatTokens(promptTokens)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TokenCompositionBar({ cachedPrompt = 0, uncachedPrompt = 0, completion = 0 }) {
  const total = (cachedPrompt || 0) + (uncachedPrompt || 0) + (completion || 0);
  const cachedPct = total > 0 ? ((cachedPrompt / total) * 100).toFixed(1) : '0.0';
  const uncachedPct = total > 0 ? ((uncachedPrompt / total) * 100).toFixed(1) : '0.0';
  const compPct = total > 0 ? ((completion / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="ios-glass-card p-6 rounded-[1.75rem] border border-black/10 dark:border-white/10 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-title)] uppercase tracking-wider">
            Token Composition
          </h3>
          <p className="text-xs text-vibrant-secondary">
            Distribution across cached prompt, standard prompt, and completion
          </p>
        </div>
        <span className="text-xs font-mono font-bold text-[var(--text-title)] tabular-nums">
          Total: {formatTokens(total)} tokens
        </span>
      </div>

      {/* Horizontal Stacked Bar */}
      <div className="h-5 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden flex p-0.5 gap-0.5">
        {Number(cachedPct) > 0 && (
          <div
            style={{ width: `${cachedPct}%` }}
            className="h-full bg-emerald-500 rounded-l-full transition-all duration-500"
            title={`Cached Prompt: ${formatTokens(cachedPrompt)} (${cachedPct}%)`}
          />
        )}
        {Number(uncachedPct) > 0 && (
          <div
            style={{ width: `${uncachedPct}%` }}
            className={`h-full bg-sky-500 transition-all duration-500 ${Number(cachedPct) === 0 ? 'rounded-l-full' : ''} ${Number(compPct) === 0 ? 'rounded-r-full' : ''}`}
            title={`Uncached Prompt: ${formatTokens(uncachedPrompt)} (${uncachedPct}%)`}
          />
        )}
        {Number(compPct) > 0 && (
          <div
            style={{ width: `${compPct}%` }}
            className="h-full bg-pink-500 rounded-r-full transition-all duration-500"
            title={`Completion: ${formatTokens(completion)} (${compPct}%)`}
          />
        )}
      </div>

      {/* Interactive Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
          <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-vibrant-secondary truncate">Cached Prompt</div>
            <div className="text-xs font-bold text-[var(--text-title)] font-mono tabular-nums">
              {formatTokens(cachedPrompt)} <span className="text-zinc-400 font-normal">({cachedPct}%)</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
          <span className="w-3 h-3 rounded-full bg-sky-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-vibrant-secondary truncate">Uncached Prompt</div>
            <div className="text-xs font-bold text-[var(--text-title)] font-mono tabular-nums">
              {formatTokens(uncachedPrompt)} <span className="text-zinc-400 font-normal">({uncachedPct}%)</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
          <span className="w-3 h-3 rounded-full bg-pink-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-vibrant-secondary truncate">Completion</div>
            <div className="text-xs font-bold text-[var(--text-title)] font-mono tabular-nums">
              {formatTokens(completion)} <span className="text-zinc-400 font-normal">({compPct}%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelCacheTable({ rows = [] }) {
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const bCached = Number(b.cachedTokens || b.cached_tokens || 0);
      const aCached = Number(a.cachedTokens || a.cached_tokens || 0);
      return bCached - aCached;
    });
  }, [rows]);

  if (!sortedRows.length) {
    return (
      <div className="ios-glass-card p-8 rounded-[1.75rem] border border-black/10 dark:border-white/10 text-center text-vibrant-secondary text-xs">
        No model cache performance records for the selected period.
      </div>
    );
  }

  return (
    <div className="ios-glass-card rounded-[1.75rem] border border-black/10 dark:border-white/10 overflow-hidden shadow-lg">
      <div className="p-5 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-title)] uppercase tracking-wider">
            Model Cache Performance
          </h3>
          <p className="text-xs text-vibrant-secondary">
            Per-model prompt cache hit rates and token volume
          </p>
        </div>
        <span className="text-xs font-mono text-vibrant-secondary">
          {sortedRows.length} {sortedRows.length === 1 ? 'model' : 'models'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-vibrant-secondary font-semibold uppercase tracking-wider text-[10px]">
              <th className="px-5 py-3">Model</th>
              <th className="px-5 py-3 text-right">Hit Rate</th>
              <th className="px-5 py-3 text-right">Requests</th>
              <th className="px-5 py-3 text-right">Prompt Tokens</th>
              <th className="px-5 py-3 text-right">Cached Tokens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {sortedRows.map((row, idx) => {
              const label = row.label || row.model || 'Unknown Model';
              const reqs = Number(row.reqs || row.requests || 0);
              const promptTokens = Number(row.promptTokens || row.prompt_tokens || 0);
              const cachedTokens = Number(row.cachedTokens || row.cached_tokens || 0);
              const hitRatePct = promptTokens > 0
                ? (cachedTokens / promptTokens) * 100
                : (row.hitRate != null ? Number(row.hitRate) * 100 : 0);

              return (
                <tr key={idx} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-[var(--text-title)]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-sky-500" />
                      <span className="font-mono text-xs">{label}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                    <div className="inline-flex items-center gap-2 justify-end">
                      <div className="w-16 h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden hidden sm:block">
                        <div
                          style={{ width: `${Math.min(100, Math.max(0, hitRatePct))}%` }}
                          className={`h-full ${hitRatePct >= 70 ? 'bg-emerald-500' : hitRatePct >= 40 ? 'bg-sky-500' : 'bg-zinc-500'}`}
                        />
                      </div>
                      <span className={`font-bold ${hitRatePct >= 70 ? 'text-emerald-600 dark:text-emerald-400' : hitRatePct >= 40 ? 'text-sky-600 dark:text-sky-400' : 'text-zinc-500'}`}>
                        {hitRatePct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-vibrant-secondary">
                    {reqs.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-vibrant-secondary">
                    {formatTokens(promptTokens)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                    {formatTokens(cachedTokens)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProviderBreakdownSection({ providers = [] }) {
  if (!providers || !providers.length) return null;

  return (
    <div className="ios-glass-card p-6 rounded-[1.75rem] border border-black/10 dark:border-white/10 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-title)] uppercase tracking-wider">
            Provider Consumption Breakdown
          </h3>
          <p className="text-xs text-vibrant-secondary">
            Request volume, token throughput, and aggregate spend by provider
          </p>
        </div>
        <span className="text-xs font-mono text-vibrant-secondary">
          {providers.length} {providers.length === 1 ? 'provider' : 'providers'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers.map((p, idx) => {
          const name = p.provider || p.name || `Provider ${idx + 1}`;
          const cost = p.costUsdc || p.cost_usdc || p.cost || 0;
          const reqs = p.reqs || p.requests || 0;
          const tokens = p.tokens || p.totalTokens || 0;

          return (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col justify-between gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[var(--text-title)] uppercase">
                  {name}
                </span>
                <span className="text-xs font-mono font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {fmtUsdMicro(cost)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-vibrant-secondary font-mono">
                <span>{Number(reqs).toLocaleString()} reqs</span>
                <span>{formatTokens(tokens)} tokens</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState('24h');
  const [cacheStats, setCacheStats] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resStats = await apiFetch(`/api/usage/cache-stats?range=${range}`);
      if (!resStats || !resStats.ok) {
        throw new Error(`HTTP ${resStats?.status || 500}`);
      }
      const jsonStats = await resStats.json();
      setCacheStats(jsonStats);

      try {
        const resBreakdown = await apiFetch(`/api/usage/breakdown?range=${range}`);
        if (resBreakdown && resBreakdown.ok) {
          const jsonBreakdown = await resBreakdown.json();
          setBreakdown(jsonBreakdown);
        }
      } catch {
        // Non-fatal if breakdown is not available
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived Totals & KPI Metrics
  const totals = useMemo(() => {
    return cacheStats?.totals || {};
  }, [cacheStats]);

  const rows = useMemo(() => {
    return cacheStats?.rows || [];
  }, [cacheStats]);

  const promptTokens = Number(totals.promptTokens || totals.prompt_tokens || 0);
  const cachedTokens = Number(totals.cachedTokens || totals.cached_tokens || 0);
  const uncachedPrompt = Math.max(0, promptTokens - cachedTokens);

  // Compute completion tokens from breakdown or models
  const completionTokens = useMemo(() => {
    if (totals.completionTokens != null) return Number(totals.completionTokens);
    if (breakdown?.byModel) {
      return breakdown.byModel.reduce((acc, m) => acc + Number(m.completionTokens || m.completion_tokens || 0), 0);
    }
    return Math.round(promptTokens * 0.25); // reasonable fallback ratio if completion not separated
  }, [totals, breakdown, promptTokens]);

  const totalTokens = promptTokens + completionTokens;
  const hitRate = totals.hitRate != null ? Number(totals.hitRate) : promptTokens > 0 ? cachedTokens / promptTokens : 0;

  // Estimated Savings: Prompt cache gives ~50-80% discount. Assuming ~$0.50 per 1M cached tokens discount
  const estimatedSavingsUsd = useMemo(() => {
    if (totals.estimatedSavingsUsdc != null) return Number(totals.estimatedSavingsUsdc);
    return (cachedTokens / 1_000_000) * 0.50;
  }, [totals, cachedTokens]);

  const providers = useMemo(() => {
    return breakdown?.byProvider || breakdown?.by_provider || [];
  }, [breakdown]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header Row with Range Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-title)] flex items-center gap-2">
            <BarChart3 className="text-sky-500" size={24} />
            <span>Consumer Analytics</span>
          </h2>
          <p className="text-xs sm:text-sm text-vibrant-secondary mt-0.5">
            Prompt cache optimization, token breakdown, and efficiency metrics
          </p>
        </div>

        {/* Range Switcher + Refresh Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="ios-segmented-control flex items-center p-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 shadow-inner">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`ios-segment px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  range === r.id
                    ? 'active bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="ios-icon-btn p-2 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            title="Refresh analytics data"
            aria-label="Refresh analytics data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && !cacheStats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonCard className="h-44" />
          <SkeletonCard className="h-44" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-6"
        >
          {/* Section 1: Apple Health Activity Ring Gauge */}
          <PromptCacheEfficiencyRing
            hitRate={hitRate}
            cachedTokens={cachedTokens}
            promptTokens={promptTokens}
          />

          {/* Section 2: Summary KPI Cards Grid (4 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Overall Hit Rate"
              value={`${(hitRate * 100).toFixed(1)}%`}
              sub="Cache read tokens / Prompt tokens"
              icon={Sparkles}
              featured={hitRate >= 0.7}
              delta={hitRate >= 0.7 ? 'Optimal' : 'Standard'}
              deltaDir={hitRate >= 0.7 ? 'up' : 'neutral'}
            />

            <KpiCard
              label="Cached Tokens"
              value={formatTokens(cachedTokens)}
              sub="Tokens served from memory cache"
              icon={Zap}
              delta={promptTokens > 0 ? `${((cachedTokens / promptTokens) * 100).toFixed(0)}% prompt` : undefined}
              deltaDir="up"
            />

            <KpiCard
              label="Total Tokens Consumed"
              value={formatTokens(totalTokens)}
              sub="Prompt + Completion throughput"
              icon={Layers}
            />

            <KpiCard
              label="Estimated Cache Savings"
              value={fmtUsdMicro(estimatedSavingsUsd)}
              sub="Discount earned vs full prompt"
              icon={CircleDollarSign}
              delta="Saved"
              deltaDir="up"
            />
          </div>

          {/* Section 3: Token Composition Activity Bar */}
          <TokenCompositionBar
            cachedPrompt={cachedTokens}
            uncachedPrompt={uncachedPrompt}
            completion={completionTokens}
          />

          {/* Section 4: Model Cache Performance Inset Grouped Table */}
          <ModelCacheTable rows={rows} />

          {/* Section 5: Provider Consumption Breakdown */}
          <ProviderBreakdownSection providers={providers} />
        </motion.div>
      )}
    </div>
  );
}
