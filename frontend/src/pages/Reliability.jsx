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
    live: 'Live',
    connecting: 'Connecting',
    reconnecting: 'Reconnecting',
    recovering: 'Recovering snapshot',
    'auth-required': 'Session expired',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
        status === 'live'
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          : status === 'connecting'
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
      }`}
      role="status"
    >
      <i className={`w-1.5 h-1.5 rounded-full ${status === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
      {labels[status] || status}
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
    <main className="page reliability-page space-y-6">
      {/* Page Heading */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <p className="eyebrow text-xs font-mono font-semibold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20 inline-block mb-1">
            Operations / Phase 1
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
            Reliability control room
          </h2>
          <p className="faint text-xs sm:text-sm text-zinc-400 mt-0.5">
            Completed-cycle health, provider coverage, and audited pricing safety.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <State status={status} />
          <button
            onClick={() => recover()}
            className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors"
            title="Refresh snapshot"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {(error || recoveryError || transition?.error) && (
        <div
          className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-3"
          role="alert"
        >
          <AlertTriangle size={16} className="shrink-0 text-rose-400" />
          <span>{(error || recoveryError || transition.error).message || error || transition.error}</span>
        </div>
      )}

      {stale && (
        <div
          className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-3"
          role="alert"
        >
          <AlertTriangle size={16} className="shrink-0 text-amber-400" />
          <span>Reliability data is delayed; pricing controls remain available.</span>
        </div>
      )}

      {status === 'auth-required' && (
        <div
          className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-3"
          role="alert"
        >
          <CircleOff size={16} className="shrink-0 text-amber-400" />
          <span>Your session expired. Sign in again to view reliability data or controls.</span>
        </div>
      )}

      {/* Daemon Control Toolbar */}
      <section className="rel-toolbar panel p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="eyebrow text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-semibold block">
            Daemon control
          </span>
          <div className="flex items-center gap-2 mt-1">
            <strong className="text-sm font-mono font-bold text-zinc-100">
              {armState ? 'ARMED' : 'DISARMED'}
            </strong>
            <span className="faint text-xs text-zinc-500">
              · DISARM keeps dry-run cycles running
            </span>
          </div>
        </div>
        <button
          className="btn btn-primary px-4 py-2 rounded-lg font-semibold text-xs transition-all shadow-md bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 disabled:opacity-50"
          disabled={transition?.pending || status === 'auth-required'}
          onClick={() => setArm(!armState)}
        >
          {transition?.pending ? 'Saving…' : armState ? 'Disarm daemon' : 'Arm daemon'}
        </button>
      </section>

      {/* KPI Cards Grid */}
      <section className="kpis kpis-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Metric
          label="Service"
          value={value(current, 'service_status', 'status') || 'Unknown'}
          icon={<ShieldCheck size={16} className="text-emerald-400 mr-1 inline" />}
        />
        <Metric
          label="Last heartbeat"
          value={formatTime(value(current, 'last_heartbeat', 'heartbeat_at'))}
        />
        <Metric
          label="Cycle duration"
          value={`${value(current, 'duration_ms', 'cycle_duration_ms') ?? '—'} ms`}
        />
        <Metric
          label="Models processed"
          value={value(current, 'model_count', 'models_processed') ?? models.length}
        />
        <Metric
          label="DB freshness"
          value={value(current, 'db_freshness', 'db_fresh_at') || '—'}
          icon={<Database size={16} className="text-sky-400 mr-1 inline" />}
        />
        <Metric
          label="Holds / errors"
          value={`${value(current, 'hold_count') ?? '—'} / ${value(current, 'error_count') ?? '—'}`}
        />
      </section>

      {/* Main Grid: Model Coverage & Recent Cycles */}
      <section className="rel-grid grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="panel lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden flex flex-col">
          <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="eyebrow text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold block">
                Provider / model coverage
              </span>
              <h3 className="text-sm font-bold text-zinc-100">Every processed model</h3>
            </div>
            <span className="faint text-xs text-zinc-500">HOLD included</span>
          </div>

          <div className="rel-table-wrap overflow-x-auto flex-1 max-h-96">
            <table className="tbl w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-zinc-950 text-zinc-400 font-mono text-[10px] uppercase border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-2.5">Provider</th>
                  <th className="px-4 py-2.5">Model</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5 text-right">Our price</th>
                  <th className="px-4 py-2.5 text-right">Reference</th>
                  <th className="px-4 py-2.5">Freshness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40 font-mono">
                {models.map((model) => (
                  <tr key={`${model.slug}-${model.model_id}`} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-zinc-300 font-sans">{model.slug || '—'}</td>
                    <td className="mono px-4 py-2.5 text-zinc-200">{model.model_id || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="rel-badge inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border bg-zinc-800 text-zinc-300 border-zinc-700">
                        {model.action || model.status || 'HOLD'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-100">{model.our_price ?? '—'}</td>
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
        <div className="panel rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden flex flex-col">
          <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
            <div>
              <span className="eyebrow text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold block">
                Cycles
              </span>
              <h3 className="text-sm font-bold text-zinc-100">Recent completions</h3>
            </div>
            <RefreshCw size={16} className="text-zinc-400" />
          </div>
          <div className="p-2 divide-y divide-zinc-800/40 flex-1 overflow-y-auto max-h-96 font-mono text-xs">
            {cycles.slice(0, 8).map((cycle) => (
              <div
                className="cycle-row p-3 rounded-lg hover:bg-zinc-800/30 transition-colors flex items-center justify-between"
                key={cycle.cycle_id}
              >
                <span className="mono font-semibold text-zinc-200">
                  {String(cycle.cycle_id || 'cycle').slice(0, 8)}
                </span>
                <span className="text-sky-400">{cycle.model_count ?? '—'} models</span>
                <span className="faint text-[11px] text-zinc-500">
                  {formatTime(cycle.completed_at || cycle.finished_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audit Timeline */}
      <section className="panel rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="panel-head p-4 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="eyebrow text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold block">
              Audit timeline
            </span>
            <h3 className="text-sm font-bold text-zinc-100">Important events</h3>
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
                  {s}
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
            <p className="empty py-6 text-center text-xs text-zinc-500">
              No events match the selected filters.
            </p>
          )}
        </div>
      </section>

      {/* Transition Feedback */}
      {transition && !transition.pending && !transition.error && !transition.unknown && (
        <div
          className="rel-feedback p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2"
          role="status"
        >
          <CheckCircle2 size={15} />
          <span>
            Audit recorded · {transition.operator || 'operator'} · {formatTime(transition.timestamp || transition.detected_at)}
          </span>
        </div>
      )}

      {transition?.unknown && (
        <div
          className="rel-alert warning p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs"
          role="alert"
        >
          Transition outcome is unknown. Verify daemon state before retrying.
        </div>
      )}

      {status === 'reconnecting' && (
        <button
          className="btn btn-ghost px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold"
          onClick={reconnect}
        >
          Retry connection
        </button>
      )}
    </main>
  );
}

function Metric({ label, value: metric, icon }) {
  return (
    <div className="kpi p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col justify-between">
      <span className="eyebrow text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center">
        {icon}
        {label}
      </span>
      <strong className="text-sm sm:text-base font-bold font-mono text-zinc-100 mt-2 truncate">
        {metric}
      </strong>
    </div>
  );
}
