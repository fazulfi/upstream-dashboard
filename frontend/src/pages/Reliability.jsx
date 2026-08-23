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
  Activity,
  Zap,
  Radio,
} from 'lucide-react';
import { reliabilityApi, unwrap } from '../lib/reliabilityApi';
import { useReliabilityStream } from '../hooks/useReliabilityStream';
import Badge from '../components/Badge';

const value = (obj, ...keys) => keys.reduce((found, key) => found ?? obj?.[key], undefined);
const formatTime = (input) => (input ? new Date(input).toLocaleString() : '—');
const rowsFrom = (data, key) => (Array.isArray(data) ? data : data?.[key] || []);
const eventView = (event) => ({
  ...event,
  ...(event.payload && typeof event.payload === 'object' ? event.payload : {}),
});

function State({ status }) {
  const labels = {
    live: 'Live Stream Active',
    connecting: 'Connecting SSE…',
    reconnecting: 'Reconnecting…',
    recovering: 'Recovering snapshot',
    'auth-required': 'Session expired',
  };
  return (
    <motion.span
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`rel-state rel-state-${status} inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-md shadow-sm ${
        status === 'live'
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-emerald-500/10'
          : status === 'connecting'
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-amber-500/10'
          : 'bg-rose-500/10 border-rose-500/30 text-rose-300 shadow-rose-500/10'
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
    </motion.span>
  );
}

export default function Reliability() {
  const [summary, setSummary] = useState(null);
  const [models, setModels] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState({ provider: '', action: '', severity: '', search: '' });
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
      const matchAction = !filter.action || m.action === filter.action || m.status === filter.action;
      return matchSearch && matchProvider && matchAction;
    });
  }, [models, filter]);

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
    <motion.main
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="page reliability-page space-y-6 max-w-7xl mx-auto"
    >
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/90 via-zinc-900/40 to-zinc-950 p-6 shadow-xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="eyebrow inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-sky-500/15 text-sky-300 border border-sky-500/30">
                <Radio size={11} className="animate-pulse" />
                Operations Room · Realtime Telemetry
              </span>
              <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
                InferHub Autonomous Node
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight">
              Reliability & Fleet Telemetry
            </h2>
            <p className="faint text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
              Completed pricing loop health, multi-upstream model snapshots, and audited mutation guardrails.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <State status={status} />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => recover()}
              className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 shadow-sm transition-all"
              title="Refresh telemetry snapshot"
            >
              <RefreshCw size={15} />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Dynamic Alerts */}
      <AnimatePresence>
        {(error || recoveryError || transition?.error) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rel-alert error p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center justify-between gap-3 shadow-lg shadow-rose-500/5"
            role="alert"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={17} className="shrink-0 text-rose-400" />
              <span className="font-medium">
                {(error || recoveryError || transition.error).message || error || transition.error}
              </span>
            </div>
            {status === 'reconnecting' && (
              <button
                className="btn btn-ghost px-3 py-1 rounded-lg border border-rose-500/40 hover:bg-rose-500/20 text-rose-200 font-semibold text-xs transition-colors"
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
            className="rel-alert warning p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-3 shadow-lg"
            role="alert"
          >
            <AlertTriangle size={17} className="shrink-0 text-amber-400" />
            <span>Reliability data is delayed; pricing controls remain available in fail-safe mode.</span>
          </motion.div>
        )}

        {status === 'auth-required' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="rel-alert warning p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-3 shadow-lg"
            role="alert"
          >
            <CircleOff size={17} className="shrink-0 text-amber-400" />
            <span>Your session expired. Sign in again to view reliability data or controls.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Daemon Mode Control Banner */}
      <section className="rel-toolbar panel relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-4">
          <div
            className={`p-3 rounded-xl border ${
              armState
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-md shadow-emerald-500/10'
                : 'bg-zinc-800/90 border-zinc-700 text-zinc-400'
            }`}
          >
            {armState ? <ShieldCheck size={26} /> : <ShieldAlert size={26} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="eyebrow text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                Daemon Status:
              </span>
              <strong
                className={`text-xs font-mono font-extrabold px-2.5 py-0.5 rounded border ${
                  armState
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                }`}
              >
                {armState ? 'ARMED (LIVE PRICING)' : 'DISARMED'}
              </strong>
            </div>
            <p className="faint text-xs text-zinc-400 mt-1">
              {armState
                ? 'Mutations are actively applied to live InferHub market prices.'
                : 'DISARM keeps dry-run cycles running without mutating live published asks.'}
            </p>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`btn btn-primary px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all ${
            armState
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
              : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white border border-emerald-400/30 shadow-emerald-500/20'
          } disabled:opacity-50`}
          disabled={transition?.pending || status === 'auth-required'}
          onClick={() => setArm(!armState)}
        >
          {transition?.pending ? 'Saving…' : armState ? 'Disarm daemon' : 'Arm daemon'}
        </motion.button>
      </section>

      {/* KPI Cards Grid */}
      <section className="kpis kpis-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <Metric
          label="Service"
          value={value(current, 'service_status', 'status') || 'Operational'}
          icon={<ShieldCheck size={16} className="text-emerald-400 mr-1.5" />}
        />
        <Metric
          label="Last heartbeat"
          value={formatTime(value(current, 'last_heartbeat', 'heartbeat_at'))}
          icon={<Clock size={16} className="text-sky-400 mr-1.5" />}
        />
        <Metric
          label="Cycle duration"
          value={`${value(current, 'duration_ms', 'cycle_duration_ms') ?? '—'} ms`}
          icon={<Cpu size={16} className="text-indigo-400 mr-1.5" />}
        />
        <Metric
          label="Models processed"
          value={value(current, 'model_count', 'models_processed') ?? models.length}
          icon={<Layers size={16} className="text-teal-400 mr-1.5" />}
        />
        <Metric
          label="DB freshness"
          value={value(current, 'db_freshness', 'db_fresh_at') || 'Live'}
          icon={<Database size={16} className="text-sky-400 mr-1.5" />}
        />
        <Metric
          label="Holds / errors"
          value={`${value(current, 'hold_count') ?? '0'} / ${value(current, 'error_count') ?? '0'}`}
          icon={<AlertTriangle size={16} className="text-amber-400 mr-1.5" />}
        />
      </section>

      {/* Main Grid: Model Coverage & Recent Cycles */}
      <section className="rel-grid grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Model Coverage Table (2 cols) */}
        <div className="panel lg:col-span-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md overflow-hidden flex flex-col shadow-lg">
          <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-900/80 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="eyebrow text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 block">
                Model Inventory Snapshot
              </span>
              <h3 className="text-sm font-bold text-zinc-100">Every processed model</h3>
            </div>

            <div className="flex items-center gap-3">
              <span className="faint text-[11px] text-zinc-500 font-mono">HOLD included</span>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter model ID..."
                  value={filter.search}
                  onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                  className="bg-zinc-950/80 border border-zinc-800 rounded-lg pl-7 pr-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20"
                />
              </div>
            </div>
          </div>

          <div className="rel-table-wrap overflow-x-auto flex-1 max-h-96">
            <table className="tbl w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-zinc-950 text-zinc-400 font-mono text-[10px] uppercase border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3 text-right">Our price</th>
                  <th className="px-4 py-3 text-right">Reference</th>
                  <th className="px-4 py-3">Freshness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40 font-mono">
                {filteredModels.map((model) => (
                  <tr key={`${model.slug}-${model.model_id}`} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-zinc-300 font-sans">{model.slug || '—'}</td>
                    <td className="mono px-4 py-2.5 text-zinc-200 font-bold">{model.model_id || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="rel-badge inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border bg-zinc-800 text-zinc-300 border-zinc-700">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            model.action === 'UPDATE' || model.status === 'UPDATE'
                              ? 'bg-emerald-400'
                              : 'bg-amber-400'
                          }`}
                        />
                        {model.action || model.status || 'HOLD'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-zinc-100">
                      {model.our_price != null ? `$${model.our_price}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-400">
                      {model.competitor_price ?? model.reference_price ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 text-[11px]">{model.freshness || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!models.length && (
            <p className="empty py-12 text-center text-xs text-zinc-500 font-sans">
              No model snapshot is available yet.
            </p>
          )}
        </div>

        {/* Cycles list */}
        <div className="panel rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md overflow-hidden flex flex-col shadow-lg">
          <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-900/80 flex items-center justify-between">
            <div>
              <span className="eyebrow text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 block">
                Execution History
              </span>
              <h3 className="text-sm font-bold text-zinc-100">Recent completions</h3>
            </div>
            <RefreshCw size={15} className="text-zinc-400" />
          </div>
          <div className="p-2.5 divide-y divide-zinc-800/40 flex-1 overflow-y-auto max-h-96 font-mono text-xs">
            {cycles.slice(0, 8).map((cycle) => (
              <div
                className="cycle-row p-3 rounded-xl hover:bg-zinc-800/40 transition-colors flex items-center justify-between"
                key={cycle.cycle_id}
              >
                <div>
                  <span className="mono font-bold text-zinc-200 block">
                    {String(cycle.cycle_id || 'cycle').slice(0, 10)}
                  </span>
                  <span className="faint text-[10px] text-zinc-500">
                    {formatTime(cycle.completed_at || cycle.finished_at)}
                  </span>
                </div>
                <span className="text-xs font-bold text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                  {cycle.model_count ?? '—'} models
                </span>
              </div>
            ))}
            {cycles.length === 0 && (
              <div className="py-8 text-center text-xs text-zinc-500 font-sans">
                No completed cycles recorded yet.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Audit Timeline */}
      <section className="panel rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-lg">
        <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-900/80 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="eyebrow text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 block">
              Security & Operations Stream
            </span>
            <h3 className="text-sm font-bold text-zinc-100">Audit timeline</h3>
          </div>
          <div className="rel-filters flex items-center gap-2">
            <select
              aria-label="Filter provider"
              value={filter.provider}
              onChange={(e) => setFilter({ ...filter, provider: e.target.value })}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 outline-none"
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
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 outline-none"
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

        <div className="p-3 divide-y divide-zinc-800/40 max-h-72 overflow-y-auto">
          {visibleEvents.map((event) => (
            <div
              className="event-row p-2.5 rounded-lg hover:bg-zinc-800/30 transition-colors flex items-center justify-between gap-3 text-xs"
              key={event.event_id}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`event-dot w-2 h-2 rounded-full shrink-0 ${
                    event.severity === 'error' || event.severity === 'critical'
                      ? 'bg-rose-400'
                      : event.severity === 'warning'
                      ? 'bg-amber-400'
                      : 'bg-sky-400'
                  }`}
                />
                <div className="min-w-0 truncate">
                  <strong className="text-zinc-200 font-semibold">{event.event_type || 'event'}</strong>
                  <span className="faint text-zinc-500 ml-2 font-mono">
                    {event.slug || ''} {event.model_id || ''}
                  </span>
                </div>
              </div>
              <time className="text-zinc-500 font-mono text-[11px] shrink-0">
                {formatTime(event.occurred_at || event.detected_at)}
              </time>
            </div>
          ))}
          {!visibleEvents.length && (
            <p className="empty py-6 text-center text-xs text-zinc-500 font-sans">
              No events match the selected filters.
            </p>
          )}
        </div>
      </section>

      {/* Transition Feedback */}
      {transition && !transition.pending && !transition.error && !transition.unknown && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="rel-feedback p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2.5 shadow-md"
          role="status"
        >
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>
            Audit recorded · {transition.operator || 'operator'} · {formatTime(transition.timestamp || transition.detected_at)}
          </span>
        </motion.div>
      )}

      {transition?.unknown && (
        <div
          className="rel-alert warning p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs"
          role="alert"
        >
          Transition outcome is unknown. Verify daemon state before retrying.
        </div>
      )}
    </motion.main>
  );
}

function Metric({ label, value: metric, icon }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="kpi p-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md flex flex-col justify-between shadow-sm transition-colors hover:border-zinc-700"
    >
      <span className="eyebrow text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center">
        {icon}
        {label}
      </span>
      <strong className="text-base sm:text-lg font-bold font-mono text-zinc-100 mt-2 truncate">
        {metric}
      </strong>
    </motion.div>
  );
}
