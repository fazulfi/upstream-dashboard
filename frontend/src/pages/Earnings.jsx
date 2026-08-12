import { useState } from 'react';
import { useApi, usd } from '../hooks/useApi';
import EarningsChart from '../components/EarningsChart';
import { SkeletonBlock } from '../components/Skeleton';

const RANGES = [
  { id: '1m', label: '1m' }, { id: '5m', label: '5m' }, { id: '15m', label: '15m' },
  { id: '1h', label: '1h' }, { id: '3h', label: '3h' }, { id: '6h', label: '6h' },
  { id: '12h', label: '12h' }, { id: '24h', label: '24h' },
  { id: '1w', label: '1w' }, { id: '1mo', label: '1mo' }, { id: 'all', label: 'All time' },
];
const fmtInterval = s => s >= 3600 ? `${s / 3600}h` : s >= 60 ? `${s / 60}m` : `${s}s`;

export default function Earnings() {
  const [range, setRange] = useState('1h');
  const { data, loading } = useApi(`/api/history?range=${range}`);
  const { data: log, loading: logLoading } = useApi('/api/earnings-log?size=25', 15000);

  const candles = data?.deltas || [];
  const totalInterval = data?.total_interval_earning ?? null;

  return (
    <div className="page">
      <section className="panel chart-panel">
        <div className="panel-head chart-head">
          <div>
            <h2>Real income trend</h2>
            <div className="sub">{data?.candles} candles · {data?.candle_span_s ? `${fmtInterval(data.candle_span_s)} per candle` : 'per interval'} · {range === 'all' ? 'all time' : range}</div>
          </div>
          <div className="range-pills" role="tablist" aria-label="Time range">
            {RANGES.map(r => (
              <button key={r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>
            ))}
          </div>
        </div>
        <div className="chart-meta">
          <span className="cm-label faint">Real income in range</span>
          <span className="cm-value tnum">{usd(totalInterval)}</span>
          <span className="cm-range faint">{candles.length} candles · {data?.candle_span_s ? fmtInterval(data.candle_span_s) : ''} per candle</span>
        </div>
        <SkeletonBlock loading={loading} rows={3}>
          <div className="chart-body tall"><EarningsChart data={candles} /></div>
        </SkeletonBlock>
      </section>

      {/* Live earning ticker — from InferHub /usage/logs */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Live earnings per request</h2>
            <div className="sub">{log?.total != null ? `${log.total.toLocaleString()} requests · ${log.range}` : 'from InferHub usage logs'}</div>
          </div>
          <span className="live-pill"><i></i>live</span>
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="tbl tbl-compact">
            <thead>
              <tr>
                <th>Time</th><th>Model</th><th className="right">In tok</th>
                <th className="right">Out tok</th><th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonBody loading={logLoading} rows={8} />
              {(log?.rows || []).map((r, i) => (
                <tr key={i}>
                  <td className="faint tnum">{r.ts}</td>
                  <td>
                    <span className="prov-name">{r.model}</span>
                    <div className="prov-sub">{r.upstream}</div>
                  </td>
                  <td className="right tnum">{Number(r.in_tok || 0).toLocaleString()}</td>
                  <td className="right tnum">{Number(r.out_tok || 0).toLocaleString()}</td>
                  <td className="right tnum pos">+$ {Number(r.amount || 0).toFixed(4)}</td>
                </tr>
              ))}
              {!logLoading && !log?.rows?.length && (
                <tr><td colSpan={5} className="dt-empty">Belum ada request dalam range ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SkeletonBody({ loading, rows }) {
  if (!loading) return null;
  return (
    <tr><td colSpan={5}><div style={{ padding: 12 }}><SkeletonBlock loading rows={rows} /></div></td></tr>
  );
}
