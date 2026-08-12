import { useOutletContext } from 'react-router-dom';
import { usd } from '../hooks/useApi';

export default function Settings() {
  const { data } = useOutletContext();
  const bal = data?.balances || {};
  const fin = data?.finance || {};

  const items = [
    { label: 'Account', value: data?.account?.displayName || '—', sub: data?.account?.email || '' },
    { label: 'Publisher role', value: 'publisher + consumer', sub: 'InferHub' },
    { label: 'Publisher earnings (USDC)', value: usd(bal.publisher_earnings), sub: 'live' },
    { label: 'Fiat pending', value: usd(bal.fiat_pendings), sub: 'settlement' },
    { label: 'Active fleet', value: `${data?.fleet_summary?.ok_total || 0} / ${data?.fleet_summary?.total || 0}`, sub: 'ok / total providers' },
    { label: 'Data refresh', value: '15s frontend · 30s daemon', sub: `source ${data?.ts || ''}` },
  ];

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head"><div><h2>System · Account</h2><div className="sub">About this deployment</div></div></div>
        <div className="settings-list">
          {items.map((it, i) => (
            <div className="setting-row" key={i}>
              <div><div className="setting-label">{it.label}</div><div className="setting-sub">{it.sub}</div></div>
              <div className="setting-value tnum">{it.value}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><div><h2>Architecture</h2><div className="sub">hybrid deployment</div></div></div>
        <div className="settings-list">
          <div className="setting-row"><div><div className="setting-label">Frontend</div><div className="setting-sub">React · Vite · Vercel edge</div></div><div className="setting-value">hosted</div></div>
          <div className="setting-row"><div><div className="setting-label">Backend API</div><div className="setting-sub">Flask · waitress · nginx TLS</div></div><div className="setting-value tnum">ops.budgezen.com</div></div>
          <div className="setting-row"><div><div className="setting-label">Real-time source</div><div className="setting-sub">InferHub daemon · poll 30s · live.json</div></div><div className="setting-value">active</div></div>
        </div>
      </section>
    </div>
  );
}
