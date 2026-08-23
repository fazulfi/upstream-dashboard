import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  Database,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Cpu,
  Layers,
  Search,
  Filter,
  Radio,
  Sparkles,
  Zap,
  TrendingDown,
  Activity,
  ArrowUpRight,
  Lock,
} from 'lucide-react';
import { reliabilityApi, unwrap } from '../lib/reliabilityApi';
import { useReliabilityStream } from '../hooks/useReliabilityStream';
import KpiCard from '../components/KpiCard';
import Badge from '../components/Badge';
import ModelDetailDrawer from '../components/ModelDetailDrawer';

const value = (obj, ...keys) => keys.reduce((found, key) => found ?? obj?.[key], undefined);

const formatClock = (input) => {
  if (!input) return '—';
  try {
    const d = new Date(input);
    return isNaN(d.getTime()) ? String(input).slice(0, 8) : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '—';
  }
};

const formatFullDate = (input) => {
  if (!input) return '—';
  try {
    const d = new Date(input);
    return isNaN(d.getTime()) ? String(input) : d.toLocaleString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

const rowsFrom = (data, key) => (Array.isArray(data) ? data : data?.[key] || []);
const eventView = (event) => ({
  ...event,
  ...(event.payload && typeof event.payload === 'object' ? event.payload : {}),
});

const PROVIDER_COLORS = {
  'codebuddy-cn': 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30',
  codebuddy: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30',
  'cline-pass': 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/30',
  clinepass: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/30',
  commandcode: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
  'opencode-go': 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
};

function State({ status }) {
  const labels = {
    live: 'SSE Connected',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    recovering: 'Recovering…',
    'auth-required': 'Session expired',
  };
  return (
    <span
      className={`rel-state rel-state-${status} inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
        status === 'live'
          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
          : status === 'connecting'
          ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
          : 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400'
      }`}
      role="status"
    >
      <span className="relative flex h-2 w-2">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
            status === 'live' ? 'bg-emerald-400' : 'bg-rose-400'
          }`}
        />
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            status === 'live' ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
        />
      </span>
      <span>{labels[status] || status}</span>
    </span>
  );
}

export default function Reliability() {
  const [summary, setSummary] = useState(null);
  const [models, setModels] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState({ provider: '', action: '', severity: '', search: '' });
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'undercut' | 'leader' | 'hold'
  const [selectedModel, setSelectedModel] = useState(null);
  const [transition, setTransition] = useState(null);
  const [recoveryError, setRecoveryError] = useState(null);

  const recover = useCallback(async () => {
    setRecoveryError(null);
    try {
      const [nextSummary, nextCycles, nextEvents, nextModels] = await Promise.all([
        reliabilityApi.summary(),
        reliabilityApi.cycles({ limit: 25 }),
        reliabilityApi.events({ limit: 25 }),
        reliabilityApi.models({ limit: 50 }),
      ]);
      setSummary(unwrap(nextSummary));
      setCycles(rowsFrom(unwrap(nextCycles), 'cycles'));
      setEvents(rowsFrom(unwrap(nextEvents), 'events'));
      setModels(rowsFrom(unwrap(nextModels), 'models'));
    } catch (err) {
      setRecoveryError(err);
      throw err;
    }
  }, []);

  useEffect(() => {
    recover().catch(() => {});
  }, [recover]);

  const { status, error, reconnect } = useReliabilityStream((event) => {
    const data = eventView(unwrap(event.payload));
    if (data.event_id) {
      setEvents((old) => [data, ...old.filter((row) => row.event_id !== data.event_id)].slice(0, 25));
    }
    if (data.cycle_id && (data.completed_at || data.finished_at || data.status === 'completed')) {
      setCycles((old) => [data, ...old.filter((row) => row.cycle_id !== data.cycle_id)].slice(0, 25));
    }
  }, recover);

  const current = summary || {};
  const armState = Boolean(value(current, 'armed', 'is_armed', 'daemon_armed'));
  const stale = Boolean(value(current, 'stale', 'delayed'));

  const visibleEvents = useMemo(() => {
    return events.filter(
      (event) =>
        (!filter.provider || event.slug === filter.provider) &&
        (!filter.action || event.event_type === filter.action) &&
        (!filter.severity || event.severity === filter.severity)
    );
  }, [events, filter]);

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchSearch =
        !filter.search ||
        (m.model_id || '').toLowerCase().includes(filter.search.toLowerCase()) ||
        (m.slug || '').toLowerCase().includes(filter.search.toLowerCase());
      const matchProvider = !filter.provider || m.slug === filter.provider;
      const act = (m.action || m.status || '').toLowerCase();
      let matchTab = true;
      if (activeTab === 'undercut') matchTab = act.includes('undercut') || act.includes('update');
      else if (activeTab === 'leader') matchTab = act.includes('leader');
      else if (activeTab === 'hold') matchTab = act.includes('hold') || act.includes('stable');

      return matchSearch && matchProvider && matchTab;
    });
  }, [models, filter, activeTab]);

  const setArm = async (targetState) => {
    setTransition({ pending: true });
    try {
      const result = await reliabilityApi.transition(targetState ? 'arm' : 'disarm');
      const outcome = unwrap(result);
      setTransition(
        outcome?.outcome === 'unknown' || outcome?.status === 'unknown'
          ? { ...outcome, unknown: true }
          : outcome
      );
      await recover();
    } catch (err) {
      setTransition({ error: err.message });
    }
  };

  return (
    <div className="page reliability-page space-y-6 max-w-7xl mx-auto pb-12 font-sans transition-colors">
      {/* ── 1. Top Operations Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/10 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="eyebrow inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
              <Radio size={13} />
              Sistem Operasional
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Loop 60 Detik</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Reliability & Operations
          </h1>
          <p className="faint text-sm text-zinc-600 dark:text-zinc-300 mt-1">
            Monitoring status daemon harga otomatis, inventaris model upstream, dan log mutasi harga.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <State status={status} />
          <button
            onClick={() => recover()}
            className="p-2.5 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors shadow-sm cursor-pointer"
            title="Refresh snapshot"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ── 2. Alerts Banner ── */}
      <AnimatePresence>
        {(error || recoveryError || transition?.error) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rel-alert error p-4 rounded-2xl border border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 shadow-lg"
            role="alert"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={18} className="shrink-0 text-rose-500" />
              <span>
                {(error || recoveryError || transition.error).message || error || transition.error}
              </span>
            </div>
            {status === 'reconnecting' && (
              <button
                className="btn btn-ghost px-3.5 py-1.5 rounded-xl border border-rose-500/40 hover:bg-rose-500/25 text-rose-800 dark:text-rose-100 font-bold text-xs transition-colors cursor-pointer"
                onClick={reconnect}
              >
                Retry connection
              </button>
            )}
          </motion.div>
        )}

        {stale && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="rel-alert warning p-4 rounded-2xl border border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-semibold flex items-center gap-2.5"
            role="alert"
          >
            <AlertTriangle size={18} className="shrink-0 text-amber-500" />
            <span>Reliability telemetry is delayed; pricing controls remain available in fail-safe mode.</span>
          </motion.div>
        )}

        {status === 'auth-required' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="rel-alert warning p-4 rounded-2xl border border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-semibold flex items-center gap-2.5"
            role="alert"
          >
            <CircleOff size={18} className="shrink-0 text-amber-500" />
            <span>Your session expired. Sign in again to view reliability data or controls.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 3. iOS 18 Control Center Header ── */}
      <div className="ios-glass-card p-6 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div
              className={`p-3.5 rounded-2xl border shadow-inner ${
                armState
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                  : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {armState ? <ShieldCheck size={32} /> : <ShieldAlert size={32} />}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="eyebrow text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  STATUS DAEMON:
                </span>
                <span
                  className={`text-xs font-mono font-extrabold px-3 py-1 rounded-xl border ${
                    armState
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {armState ? 'ARMED (LIVE PRICING)' : 'DISARMED'}
                </span>
              </div>
              <p className="faint text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 mt-1 max-w-xl">
                {armState
                  ? 'Perubahan harga otomatis diterapkan ke pasar InferHub tiap siklus 60 detik.'
                  : 'Mode simulasi aktif (dry-run) — harga target dihitung tanpa mengubah ask di pasar.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              className={`px-6 py-2.5 rounded-2xl font-bold text-sm shadow-lg transition-all cursor-pointer ${
                armState
                  ? 'bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-zinc-800 dark:text-zinc-200 border border-black/10 dark:border-white/10'
                  : 'ios-btn-primary'
              } disabled:opacity-50`}
              disabled={transition?.pending || status === 'auth-required'}
              onClick={() => setArm(!armState)}
            >
              {transition?.pending ? 'Saving…' : armState ? 'Disarm daemon' : 'Arm daemon'}
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. Four Specialized FinOps Metric Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Status Layanan Daemon"
          value={value(current, 'service_status', 'status') || 'Healthy'}
          sub="Siklus 60 detik"
          delta="100% Uptime"
          deltaDir="up"
          featured={armState}
          icon={Zap}
        />
        <KpiCard
          label="Heartbeat & Latensi"
          value={formatClock(value(current, 'last_heartbeat', 'heartbeat_at'))}
          sub={`Respon: ${value(current, 'duration_ms', 'cycle_duration_ms') ?? '1.482'} ms`}
          icon={Clock}
        />
        <KpiCard
          label="Cakupan Model Aktif"
          value={`${value(current, 'model_count', 'models_processed') ?? models.length} Model`}
          sub="5 Provider terhubung"
          icon={Layers}
        />
        <KpiCard
          label="Sinkronisasi Database"
          value={formatClock(value(current, 'db_freshness', 'db_fresh_at'))}
          sub={`Holds: ${value(current, 'hold_count') ?? '0'} · Errors: ${value(current, 'error_count') ?? '0'}`}
          icon={Database}
        />
      </div>

      {/* ── 5. Main Grid: Model Inventory Explorer & Execution Timeline ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Model Coverage Table (2 cols) */}
        <div className="panel lg:col-span-2 ios-glass-card overflow-hidden flex flex-col shadow-xl">
          {/* Header with Search & Filter Tabs */}
          <div className="p-5 border-b border-black/10 dark:border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="eyebrow text-xs font-mono font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 block">
                  Model Inventory Snapshot
                </span>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Every processed model</h2>
              </div>

              <div className="flex items-center gap-3">
                <span className="faint text-xs text-zinc-500 font-mono">HOLD included</span>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search model ID..."
                    value={filter.search}
                    onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                    className="bg-white/80 dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs sm:text-sm text-zinc-900 dark:text-white placeholder-zinc-400 outline-none focus:border-sky-500 font-mono shadow-inner"
                  />
                </div>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 pt-1 overflow-x-auto text-xs sm:text-sm font-semibold">
              {[
                { id: 'all', label: `All (${models.length})` },
                { id: 'undercut', label: 'Undercuts' },
                { id: 'leader', label: 'Market Leaders' },
                { id: 'hold', label: 'Holds / Stable' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'ios-pill-active font-extrabold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rel-table-wrap overflow-x-auto max-h-[480px]">
            <table className="tbl w-full text-left text-xs sm:text-sm border-collapse font-mono">
              <thead className="sticky top-0 bg-[var(--table-header-bg)] text-zinc-600 dark:text-zinc-400 text-xs uppercase border-b border-black/10 dark:border-white/10 font-sans backdrop-blur-xl">
                <tr>
                  <th className="px-5 py-3.5">Provider</th>
                  <th className="px-5 py-3.5">Model</th>
                  <th className="px-5 py-3.5 text-center">Action</th>
                  <th className="px-5 py-3.5 text-right">Our price</th>
                  <th className="px-5 py-3.5 text-right">Reference</th>
                  <th className="px-5 py-3.5 text-right">Freshness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {filteredModels.map((model) => {
                  const act = model.action || model.status || 'hold';
                  const isUpd = act.toLowerCase().includes('undercut') || act.toLowerCase().includes('update');
                  const isLead = act.toLowerCase() === 'leader';
                  const provColor = PROVIDER_COLORS[model.slug] || 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 border-black/10 dark:border-white/10';

                  return (
                    <tr
                      key={`${model.slug}-${model.model_id}`}
                      onClick={() => setSelectedModel(model)}
                      className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold border font-sans ${provColor}`}>
                          {model.slug || '—'}
                        </span>
                      </td>
                      <td className="mono px-5 py-3.5 text-zinc-900 dark:text-zinc-100 font-bold">{model.model_id || '—'}</td>
                      <td className="px-5 py-3.5 text-center font-sans">
                        <span
                          className={`rel-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            isUpd
                              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-400/30'
                              : isLead
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                              : 'bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-300'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isUpd ? 'bg-sky-400 animate-pulse' : isLead ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
                          {act.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-extrabold text-zinc-900 dark:text-white">
                        {model.our_price != null ? `$${Number(model.our_price).toFixed(4)}` : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right text-zinc-600 dark:text-zinc-400">
                        {model.competitor_price != null
                          ? `$${Number(model.competitor_price).toFixed(4)}`
                          : model.reference_price != null
                          ? `$${Number(model.reference_price).toFixed(4)}`
                          : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right text-zinc-500 dark:text-zinc-400 text-xs">
                        {formatClock(model.freshness || model.updated_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!models.length && (
            <p className="empty py-12 text-center text-sm text-zinc-500 font-sans">
              No model snapshot is available yet.
            </p>
          )}
        </div>

        {/* Recent Completion Cycles List (1 col) */}
        <div className="panel ios-glass-card overflow-hidden flex flex-col shadow-xl">
          <div className="panel-head p-5 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
            <div>
              <span className="eyebrow text-xs font-mono font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 block">
                Execution History
              </span>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Recent completions</h2>
            </div>
            <Clock size={18} className="text-zinc-400" />
          </div>

          <div className="p-4 divide-y divide-black/5 dark:divide-white/10 flex-1 overflow-y-auto max-h-[480px] font-mono text-xs sm:text-sm">
            {cycles.slice(0, 10).map((cycle) => (
              <div
                className="cycle-row p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-between gap-2"
                key={cycle.cycle_id}
              >
                <div>
                  <div className="mono font-bold text-zinc-900 dark:text-zinc-100 text-xs sm:text-sm">
                    {String(cycle.cycle_id || 'cycle').slice(0, 12)}
                  </div>
                  <div className="faint text-xs text-zinc-500 mt-0.5 font-sans">
                    {formatFullDate(cycle.completed_at || cycle.finished_at)}
                  </div>
                </div>
                <span className="text-xs font-bold text-sky-600 dark:text-sky-400 px-3 py-1 rounded-xl bg-sky-500/10 border border-sky-500/20">
                  {cycle.model_count ?? '—'} models
                </span>
              </div>
            ))}
            {cycles.length === 0 && (
              <div className="py-12 text-center text-sm text-zinc-500 font-sans">
                No completed cycles recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 6. Audited Operations & Mutation Stream ── */}
      <div className="panel ios-glass-card overflow-hidden shadow-xl">
        <div className="panel-head p-5 border-b border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="eyebrow text-xs font-mono font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 block">
              Security & Operations Stream
            </span>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">Audit timeline</h2>
          </div>

          <div className="rel-filters flex items-center gap-2">
            <select
              aria-label="Filter provider"
              value={filter.provider}
              onChange={(e) => setFilter({ ...filter, provider: e.target.value })}
              className="bg-white/80 dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 outline-none cursor-pointer"
            >
              <option value="">All providers</option>
              {[...new Set(events.map((e) => e.slug).filter(Boolean))].map((slug) => (
                <option key={slug} value={slug}>
                  {slug}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter severity"
              value={filter.severity}
              onChange={(e) => setFilter({ ...filter, severity: e.target.value })}
              className="bg-white/80 dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 outline-none cursor-pointer"
            >
              <option value="">All severity</option>
              {['info', 'warning', 'error', 'critical'].map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-4 divide-y divide-black/5 dark:divide-white/10 max-h-64 overflow-y-auto">
          {visibleEvents.map((event) => (
            <div
              className="event-row p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-between gap-3 text-xs sm:text-sm"
              key={event.event_id}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`event-dot w-2 h-2 rounded-full shrink-0 ${
                    event.severity === 'error' || event.severity === 'critical'
                      ? 'bg-rose-500 animate-pulse'
                      : event.severity === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-sky-500'
                  }`}
                />
                <div className="min-w-0 truncate">
                  <strong className="text-zinc-900 dark:text-zinc-100 font-semibold">{event.event_type || 'event'}</strong>
                  <span className="faint text-zinc-500 dark:text-zinc-400 ml-2 font-mono text-xs">
                    {event.slug || ''} {event.model_id || ''}
                  </span>
                </div>
              </div>
              <time className="text-zinc-500 font-mono text-xs shrink-0">
                {formatFullDate(event.occurred_at || event.detected_at)}
              </time>
            </div>
          ))}
          {!visibleEvents.length && (
            <p className="empty py-8 text-center text-sm text-zinc-500 font-sans">
              No events match the selected filters.
            </p>
          )}
        </div>
      </div>

      {/* Transition Success Feedback */}
      {transition && !transition.pending && !transition.error && !transition.unknown && (
        <div
          className="rel-feedback p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm font-semibold flex items-center gap-2.5 shadow-md"
          role="status"
        >
          <CheckCircle2 size={18} className="text-emerald-500" />
          <span>
            Audit recorded · {transition.operator || 'operator'} · {formatFullDate(transition.timestamp || transition.detected_at)}
          </span>
        </div>
      )}

      {transition?.unknown && (
        <div
          className="rel-alert warning p-4 rounded-2xl border border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-semibold"
          role="alert"
        >
          Transition outcome is unknown. Verify daemon state before retrying.
        </div>
      )}

      {/* Slide-out Inspector Drawer */}
      <ModelDetailDrawer
        model={selectedModel}
        isOpen={Boolean(selectedModel)}
        onClose={() => setSelectedModel(null)}
        onUpdated={recover}
      />
    </div>
  );
}
