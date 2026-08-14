import { useMemo, useState } from 'react';
import { useApi, usd } from '../hooks/useApi';
import EarningsChart from '../components/EarningsChart';
import KpiCard from '../components/KpiCard';
import { SkeletonBlock } from '../components/Skeleton';
import { fmtUsdMicro, fmtTs } from '../lib/fmt';

const RANGES = [
  { id: '1m', label: '1m' }, { id: '5m', label: '5m' }, { id: '15m', label: '15m' },
  { id: '1h', label: '1h' }, { id: '3h', label: '3h' }, { id: '6h', label: '6h' },
  { id: '12h', label: '12h' }, { id: '24h', label: '24h' },
  { id: '1w', label: '1w' }, { id: '1mo', label: '1mo' }, { id: 'all', label: 'All time' },
];
// Map range chart -> range InferHub utk earnings-log (backend USAGE_RANGES).
const LOG_RANGE = { '1m': '24h', '5m': '24h', '15m': '24h', '1h': '24h', '3h': '7d', '6h': '7d', '12h': '7d', '24h': '7d', '1w': '30d', '1mo': '30d', all: '30d' };
const fmtInterval = s => s >= 3600 ? `${s / 3600}h` : s >= 60 ? `${s / 60}m` : `${s}s`;

export default function Earnings() {
  const [range, setRange] = useState('24h');
  const { data, loading } = useApi(`/api/history?range=${range}`, 10000);
  const { data: log, loading: logLoading } = useApi(`/api/earnings-log?size=25&range=${LOG_RANGE[range]}`, 15000);

  const candles = data?.deltas || [];
  const totalInterval = data?.total_interval_earning ?? null;

  // KPI derivasi
  const liveTotal = log?.total ?? null;
  const avgPerReq = useMemo(() => {
    if (totalInterval == null || !liveTotal) return null;
    return totalInterval / liveTotal;
  }, [totalInterval, liveTotal]);
  const lastTs = log?.rows?.length ? log.rows[0].ts : null;

  return (
    <div className="page">
      {/* 1. KPI row (pola Dashboard) */}
      <div className="kpis kpis-4">
        <KpiCard
          featured
          label={`Real income · ${range}`}
          value={usd(totalInterval)}
          sub={`${data?.candles ?? 0} candles · auto-refresh 10s`}
        />
        <KpiCard
          label={`Live requests · ${LOG_RANGE[range]}`}
          value={liveTotal == null ? '—' : liveTotal.toLocaleString()}
          sub="per request · poll 15s"
        />
        <KpiCard
          label="Avg / request"
          value={avgPerReq == null ? '—' : fmtUsdMicro(avgPerReq)}
          sub="range ini"
        />
        <KpiCard
          label="Last request"
          value={lastTs ? fmtTs(lastTs) : '—'}
          sub={lastTs ? 'just now' : 'belum ada data'}
        />
      </div>

      {/* 2. Range pills global (pola Usage — di luar panel) */}
      <div className="range-pills" role="group" aria-label="Time range">
        {RANGES.map(r => (
          <button
            key={r.id}
            className={range === r.id ? 'on' : ''}
            aria-pressed={range === r.id}
            onClick={() => setRange(r.id)}
          >{r.label}</button>
        ))}
      </div>

      {/* 3. Grid 2 kolom: chart kiri + ticker kanan */}
      <div className="earn-grid">
        <section className="panel chart-panel">
          <div className="panel-head chart-head">
            <div>
              <h2>Real income trend</h2>
              <div className="sub">{data?.candles} candles · {data?.candle_span_s ? `${fmtInterval(data.candle_span_s)} per candle` : 'per interval'} · {range}</div>
            </div>
          </div>
          <div className="chart-meta">
            <span className="cm-label faint">Real income in range</span>
            <span className="cm-value tnum">{usd(totalInterval)}</span>
            <span className="cm-range faint">{range} · {candles.length} candles</span>
          </div>
          <SkeletonBlock loading={loading} rows={3}>
            <div className="chart-body tall">
              <EarningsChart
                data={candles}
                startEpoch={data?.data_start ? Date.parse(data.data_start) : null}
                spanS={data?.candle_span_s || 60}
              />
            </div>
          </SkeletonBlock>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Live earnings per request</h2>
              <div className="sub">{log?.total != null ? `${log.total.toLocaleString()} requests · ${log.range}` : 'from InferHub usage logs'}</div>
            </div>
            <span className="live-pill"><i></i>live</span>
          </div>
          <div className="ticker-scroll">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>Time</th><th>Model</th><th className="right">In tok</th>
                  <th className="right">Out tok</th><th className="right">Amount</th>
                </tr>
              </thead>
              <tbody aria-live="polite" aria-atomic="false">
                <SkeletonBody loading={logLoading} rows={8} />
                {(log?.rows || []).map((r, i) => (
                  <tr key={r.ts + r.model + i} className={i === 0 ? 'row-new' : ''}>
                    <td className="faint tnum">{fmtTs(r.ts)}</td>
                    <td>
                      <span className="prov-name">{r.model}</span>
                      <div className="prov-sub">{r.upstream}</div>
                    </td>
                    <td className="right tnum">{Number(r.in_tok || 0).toLocaleString()}</td>
                    <td className="right tnum">{Number(r.out_tok || 0).toLocaleString()}</td>
                    <td className="right tnum strong">{fmtUsdMicro(r.amount)}</td>
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
    </div>
  );
}

function SkeletonBody({ loading, rows }) {
  if (!loading) return null;
  return (
    <tr><td colSpan={5}><div style={{ padding: 12 }}><SkeletonBlock loading rows={rows} /></div></td></tr>
  );
}
