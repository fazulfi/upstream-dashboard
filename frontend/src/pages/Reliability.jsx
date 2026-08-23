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
  ArrowUpRight,
} from 'lucide-react';
import { reliabilityApi, unwrap } from '../lib/reliabilityApi';
import { useReliabilityStream } from '../hooks/useReliabilityStream';
import Badge from '../components/Badge';

const value = (obj, ...keys) => keys.reduce((found, key) => found ?? obj?.[key], undefined);

const formatClock = (input) => {
  if (!input) return '—';
  try {
    const d = new Date(input);
    return isNaN(d.getTime()) ? String(input).slice(0, 10) : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

function State({ status }) {
  const labels = {
    live: 'Live Stream',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    recovering: 'Recovering…',
    'auth-required': 'Session expired',
  };
  return (
    <span
      className={`rel-state rel-state-${status} inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
        status === 'live'
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          : status === 'connecting'
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
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
    <div className="page reliability-page space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="eyebrow inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Radio size={12} className="animate-pulse" />
              Realtime Telemetry
            </span>
            <span className="text-xs text-zinc-500 font-mono">InferHub Autonomous Node</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
            Reliability & Operations
          </h1>
          <p className="faint text-xs sm:text-sm text-zinc-400 mt-0.5">
            Realtime pricing daemon health, model coverage inventory, and audited mutation history.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <State status={status} />
          <button
            onClick={() => recover()}
            className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors"
            title="Refresh snapshot"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Dynamic Alerts */}
      <AnimatePresence>
        {(error || recoveryError || transition?.error) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rel-alert error p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center justify-between gap-3"
            role="alert"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={16} className="shrink-0 text-rose-400" />
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
            className="rel-alert warning p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2.5"
            role="alert"
          >
            <AlertTriangle size={16} className="shrink-0 text-amber-400" />
            <span>Reliability telemetry is delayed; pricing controls remain available in fail-safe mode.</span>
          </motion.div>
        )}

        {status === 'auth-required' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="rel-alert warning p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2.5"
            role="alert"
          >
            <CircleOff size={16} className="shrink-0 text-amber-400" />
            <span>Your session expired. Sign in again to view reliability data or controls.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Daemon Status & Arm/Disarm Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg border ${
              armState
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}
          >
            {armState ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="eyebrow text-[10px] font-mono uppercase text-zinc-400">DAEMON STATUS:</span>
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                  armState
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                }`}
              >
                {armState ? 'ARMED (LIVE PRICING)' : 'DISARMED'}
              </span>
            </div>
            <p className="faint text-xs text-zinc-400 mt-0.5">
              {armState
                ? 'Mutations are actively applied to live InferHub market asks.'
                : 'Dry-run mode active — prices are calculated without mutating live asks.'}
            </p>
          </div>
        </div>

        <button
          className={`btn btn-primary px-4 py-2 rounded-lg font-bold text-xs shadow-sm transition-all ${
            armState
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 shadow-emerald-500/20'
          } disabled:opacity-50`}
          disabled={transition?.pending || status === 'auth-required'}
          onClick={() => setArm(!armState)}
        >
          {transition?.pending ? 'Saving…' : armState ? 'Disarm daemon' : 'Arm daemon'}
        </button>
      </div>

      {/* KPI Stats Grid (6 cols) */}
      <div className="kpis kpis-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi
          label="Service"
          value={value(current, 'service_status', 'status') || 'Healthy'}
          sub="systemd active"
          color="text-emerald-400"
        />
        <Kpi
          label="Last heartbeat"
          value={formatClock(value(current, 'last_heartbeat', 'heartbeat_at'))}
          sub="60s interval"
          color="text-sky-400"
        />
        <Kpi
          label="Cycle duration"
          value={`${value(current, 'duration_ms', 'cycle_duration_ms') ?? '—'} ms`}
          sub="poll response"
        />
        <Kpi
          label="Models processed"
          value={value(current, 'model_count', 'models_processed') ?? models.length}
          sub="across providers"
        />
        <Kpi
          label="DB Freshness"
          value={formatClock(value(current, 'db_freshness', 'db_fresh_at'))}
          sub="PostgreSQL write"
        />
        <Kpi
          label="Holds / errors"
          value={`${value(current, 'hold_count') ?? '0'} / ${value(current, 'error_count') ?? '0'}`}
          sub="stability guard"
          color={Number(value(current, 'error_count')) > 0 ? 'text-rose-400' : 'text-zinc-300'}
        />
      </div>

      {/* Split Grid: Model Coverage (Left) & Recent Cycles (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Model Coverage Table */}
        <div className="panel lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden flex flex-col">
          <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="eyebrow text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 block">
                Model Inventory Snapshot
              </span>
              <h2 className="text-sm font-bold text-zinc-100">Every processed model</h2>
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
                  className="bg-zinc-950 border border-zinc-800 rounded-lg pl-7 pr-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-sky-500 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="rel-table-wrap overflow-x-auto max-h-[440px]">
            <table className="tbl w-full text-left text-xs border-collapse font-mono">
              <thead className="sticky top-0 bg-zinc-950 text-zinc-400 text-[10px] uppercase border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3 font-sans">Provider</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3 text-center">Action</th>
                  <th className="px-4 py-3 text-right">Our price</th>
                  <th className="px-4 py-3 text-right">Reference</th>
                  <th className="px-4 py-3 text-right">Freshness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {filteredModels.map((model) => {
                  const act = model.action || model.status || 'hold';
                  const isUpd = act.toLowerCase().includes('undercut') || act.toLowerCase().includes('update');
                  return (
                    <tr key={`${model.slug}-${model.model_id}`} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-2.5 font-bold text-zinc-300 font-sans">{model.slug || '—'}</td>
                      <td className="mono px-4 py-2.5 text-zinc-200 font-medium">{model.model_id || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={`rel-badge inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isUpd
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isUpd ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                          {act.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-zinc-100">
                        {model.our_price != null ? `$${Number(model.our_price).toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-400">
                        {model.competitor_price != null
                          ? `$${Number(model.competitor_price).toFixed(4)}`
                          : model.reference_price != null
                          ? `$${Number(model.reference_price).toFixed(4)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-500 text-[11px]">
                        {formatClock(model.freshness || model.updated_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!models.length && (
            <p className="empty py-12 text-center text-xs text-zinc-500 font-sans">
              No model snapshot is available yet.
            </p>
          )}
        </div>

        {/* Execution Cycles List */}
        <div className="panel rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden flex flex-col">
          <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
            <div>
              <span className="eyebrow text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 block">
                Execution History
              </span>
              <h2 className="text-sm font-bold text-zinc-100">Recent completions</h2>
            </div>
            <Clock size={15} className="text-zinc-500" />
          </div>

          <div className="p-3 divide-y divide-zinc-800/40 flex-1 overflow-y-auto max-h-[440px] font-mono text-xs">
            {cycles.slice(0, 10).map((cycle) => (
              <div
                className="cycle-row py-2.5 px-2 rounded-lg hover:bg-zinc-800/40 transition-colors flex items-center justify-between"
                key={cycle.cycle_id}
              >
                <div>
                  <div className="mono font-bold text-zinc-200 text-xs">
                    {String(cycle.cycle_id || 'cycle').slice(0, 12)}
                  </div>
                  <div className="faint text-[10px] text-zinc-500">
                    {formatFullDate(cycle.completed_at || cycle.finished_at)}
                  </div>
                </div>
                <span className="text-[11px] font-bold text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
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
      </div>

      {/* Security & Audit Events */}
      <div className="panel rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="eyebrow text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 block">
              Security & Operations Stream
            </span>
            <h2 className="text-sm font-bold text-zinc-100">Audit timeline</h2>
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

        <div className="p-3 divide-y divide-zinc-800/40 max-h-64 overflow-y-auto">
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
                {formatFullDate(event.occurred_at || event.detected_at)}
              </time>
            </div>
          ))}
          {!visibleEvents.length && (
            <p className="empty py-6 text-center text-xs text-zinc-500 font-sans">
              No events match the selected filters.
            </p>
          )}
        </div>
      </div>

      {/* Transition Success Feedback */}
      {transition && !transition.pending && !transition.error && !transition.unknown && (
        <div
          className="rel-feedback p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2.5"
          role="status"
        >
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>
            Audit recorded · {transition.operator || 'operator'} · {formatFullDate(transition.timestamp || transition.detected_at)}
          </span>
        </div>
      )}

      {transition?.unknown && (
        <div
          className="rel-alert warning p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs"
          role="alert"
        >
          Transition outcome is unknown. Verify daemon state before retrying.
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value: val, sub, color = 'text-zinc-100' }) {
  return (
    <div className="kpi p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col justify-between">
      <div className="eyebrow text-[10px] font-mono uppercase text-zinc-400">{label}</div>
      <div className={`text-base font-bold font-mono mt-1.5 truncate ${color}`}>{val}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-1 font-mono">{sub}</div>}
    </div>
  );
}
