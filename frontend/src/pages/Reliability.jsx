import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleOff, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { reliabilityApi, unwrap } from '../lib/reliabilityApi';
import { useReliabilityStream } from '../hooks/useReliabilityStream';

const value = (obj, ...keys) => keys.reduce((found, key) => found ?? obj?.[key], undefined);
const formatTime = (input) => input ? new Date(input).toLocaleString() : '—';
const rowsFrom = (data, key) => Array.isArray(data) ? data : data?.[key] || [];
const eventView = (event) => ({ ...event, ...(event.payload && typeof event.payload === 'object' ? event.payload : {}) });

function State({ status }) {
  const labels = { live: 'Live', connecting: 'Connecting', reconnecting: 'Reconnecting', recovering: 'Recovering snapshot', 'auth-required': 'Session expired' };
  return <span className={`rel-state rel-state-${status}`} role="status"><i />{labels[status] || status}</span>;
}

export default function Reliability() {
  const [summary, setSummary] = useState(null);
  const [models, setModels] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState({ provider: '', action: '', severity: '' });
  const [transition, setTransition] = useState(null);
  const [recoveryError, setRecoveryError] = useState(null);
  const recover = useCallback(async () => {
    setRecoveryError(null);
    try {
      const [nextSummary, nextCycles, nextEvents, nextModels] = await Promise.all([reliabilityApi.summary(), reliabilityApi.cycles({ limit: 25 }), reliabilityApi.events({ limit: 25 }), reliabilityApi.models({ limit: 50 })]);
      setSummary(unwrap(nextSummary)); setCycles(rowsFrom(unwrap(nextCycles), 'cycles')); setEvents(rowsFrom(unwrap(nextEvents), 'events')); setModels(rowsFrom(unwrap(nextModels), 'models'));
    } catch (error) { setRecoveryError(error); throw error; }
  }, []);
  useEffect(() => { recover().catch(() => {}); }, [recover]);
  const { status, error, reconnect } = useReliabilityStream((event) => {
    const data = eventView(unwrap(event.payload));
    if (data.event_id) setEvents((old) => [data, ...old.filter((row) => row.event_id !== data.event_id)].slice(0, 25));
    if (data.cycle_id && (data.completed_at || data.finished_at || data.status === 'completed')) setCycles((old) => [data, ...old.filter((row) => row.cycle_id !== data.cycle_id)].slice(0, 25));
  }, recover);
  const current = summary || {};
  const visibleEvents = useMemo(() => events.filter((event) => (!filter.provider || event.slug === filter.provider) && (!filter.action || event.event_type === filter.action) && (!filter.severity || event.severity === filter.severity)), [events, filter]);
  const armState = value(current, 'armed', 'is_armed', 'daemon_armed');
  const stale = Boolean(value(current, 'stale', 'delayed'));
  const setArm = async (state) => { setTransition({ pending: true }); try { const result = await reliabilityApi.transition(state ? 'arm' : 'disarm'); const outcome = unwrap(result); setTransition(outcome?.outcome === 'unknown' || outcome?.status === 'unknown' ? { ...outcome, unknown: true } : outcome); await recover(); } catch (err) { setTransition({ error: err.message }); } };
  return <main className="page reliability-page">
    <div className="reliability-heading"><div><p className="eyebrow">Operations / Phase 1</p><h2>Reliability control room</h2><p className="faint">Completed-cycle health, provider coverage, and audited pricing safety.</p></div><State status={status} /></div>
    {(error || recoveryError || transition?.error) && <div className="rel-alert error" role="alert"><AlertTriangle size={16} /> {(error || recoveryError || transition.error).message || error || transition.error}</div>}
    {stale && <div className="rel-alert warning" role="alert"><AlertTriangle size={16} /> Reliability data is delayed; pricing controls remain available.</div>}
    {status === 'auth-required' && <div className="rel-alert warning" role="alert"><CircleOff size={16} /> Your session expired. Sign in again to view reliability data or controls.</div>}
    <section className="rel-toolbar panel"><div><span className="eyebrow">Daemon control</span><strong>{armState ? 'ARMED' : 'DISARMED'}</strong><span className="faint"> · DISARM keeps dry-run cycles running</span></div><button className="btn btn-primary" disabled={transition?.pending || status === 'auth-required'} onClick={() => setArm(!armState)}>{transition?.pending ? 'Saving…' : armState ? 'Disarm daemon' : 'Arm daemon'}</button></section>
    <section className="kpis kpis-6"><Metric label="Service" value={value(current, 'service_status', 'status') || 'Unknown'} icon={<ShieldCheck size={16} />} /><Metric label="Last heartbeat" value={formatTime(value(current, 'last_heartbeat', 'heartbeat_at'))} /><Metric label="Cycle duration" value={`${value(current, 'duration_ms', 'cycle_duration_ms') ?? '—'} ms`} /><Metric label="Models processed" value={value(current, 'model_count', 'models_processed') ?? models.length} /><Metric label="DB freshness" value={value(current, 'db_freshness', 'db_fresh_at') || '—'} icon={<Database size={16} />} /><Metric label="Holds / errors" value={`${value(current, 'hold_count') ?? '—'} / ${value(current, 'error_count') ?? '—'}`} /></section>
    <section className="rel-grid"><div className="panel"><div className="panel-head"><div><span className="eyebrow">Provider / model coverage</span><h3>Every processed model</h3></div><span className="faint">HOLD included</span></div><div className="rel-table-wrap"><table className="tbl"><thead><tr><th>Provider</th><th>Model</th><th>Action</th><th>Our price</th><th>Reference</th><th>Freshness</th></tr></thead><tbody>{models.map((model) => <tr key={`${model.slug}-${model.model_id}`}><td>{model.slug || '—'}</td><td className="mono">{model.model_id || '—'}</td><td><span className="rel-badge">{model.action || model.status || 'HOLD'}</span></td><td>{model.our_price ?? '—'}</td><td>{model.competitor_price ?? model.reference_price ?? '—'}</td><td>{model.freshness || '—'}</td></tr>)}</tbody></table></div>{!models.length && <p className="empty">No model snapshot is available yet.</p>}</div>
      <div className="panel"><div className="panel-head"><div><span className="eyebrow">Cycles</span><h3>Recent completions</h3></div><RefreshCw size={16} /></div>{cycles.slice(0, 8).map((cycle) => <div className="cycle-row" key={cycle.cycle_id}><span className="mono">{String(cycle.cycle_id || 'cycle').slice(0, 8)}</span><span>{cycle.model_count ?? '—'} models</span><span className="faint">{formatTime(cycle.completed_at || cycle.finished_at)}</span></div>)}</div></section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">Audit timeline</span><h3>Important events</h3></div><div className="rel-filters"><select aria-label="Filter provider" value={filter.provider} onChange={(e) => setFilter({ ...filter, provider: e.target.value })}><option value="">All providers</option>{[...new Set(events.map((e) => e.slug).filter(Boolean))].map((slug) => <option key={slug}>{slug}</option>)}</select><select aria-label="Filter severity" value={filter.severity} onChange={(e) => setFilter({ ...filter, severity: e.target.value })}><option value="">All severity</option>{['info', 'warning', 'error', 'critical'].map((s) => <option key={s}>{s}</option>)}</select></div></div>{visibleEvents.map((event) => <div className="event-row" key={event.event_id}><span className={`event-dot ${event.severity || 'info'}`} /><div><strong>{event.event_type || 'event'}</strong><span className="faint"> {event.slug || ''} {event.model_id || ''}</span></div><time>{formatTime(event.occurred_at || event.detected_at)}</time></div>)}{!visibleEvents.length && <p className="empty">No events match the selected filters.</p>}</section>
    {transition && !transition.pending && !transition.error && !transition.unknown && <div className="rel-feedback" role="status"><CheckCircle2 size={15} /> Audit recorded · {transition.operator || 'operator'} · {formatTime(transition.timestamp || transition.detected_at)}</div>}
    {transition?.unknown && <div className="rel-alert warning" role="alert">Transition outcome is unknown. Verify daemon state before retrying.</div>}
    {status === 'reconnecting' && <button className="btn btn-ghost" onClick={reconnect}>Retry connection</button>}
  </main>;
}
function Metric({ label, value: metric, icon }) { return <div className="kpi"><span className="eyebrow">{icon}{label}</span><strong>{metric}</strong></div>; }
