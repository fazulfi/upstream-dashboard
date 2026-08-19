import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { usd, loginWithPassword, getSessionToken } from '../hooks/useApi';

export default function Settings() {
  const { data } = useOutletContext();
  const bal = data?.balances || {};
  const [pw, setPw] = useState('');
  const [loginMsg, setLoginMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const doLogin = async (e) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true); setLoginMsg('');
    try {
      await loginWithPassword(pw);
      setLoginMsg('Login OK — token sesi aktif (24h). Halaman akan refresh.');
      setPw('');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setLoginMsg('Login gagal: ' + (err.message || 'unauthorized'));
    } finally { setBusy(false); }
  };

  const items = [
    { label: 'Account', value: data?.account?.displayName || '—', sub: data?.account?.email || '' },
    { label: 'Publisher role', value: 'publisher + consumer', sub: 'InferHub' },
    { label: 'Publisher earnings (USDC)', value: usd(bal.publisher_earnings), sub: 'live' },
    { label: 'Fiat pending', value: usd(bal.fiat_pendings), sub: 'settlement' },
    { label: 'Active fleet', value: `${data?.fleet_summary?.ok_total || 0} / ${data?.fleet_summary?.total || 0}`, sub: 'ok / total providers' },
    { label: 'Data refresh', value: '15s frontend · 60s daemon', sub: `frontend poll interval · source ${data?.ts || ''}` },
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
        <div className="panel-head"><div><h2>Session</h2><div className="sub">login sekali — token sesi (24h), password tidak disimpan di browser</div></div>
          <div className="setting-value">{getSessionToken() ? 'token aktif' : 'belum login'}</div></div>
        <form onSubmit={doLogin} style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Dashboard password"
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #333)', background: 'transparent', color: 'inherit' }} />
          <button type="submit" disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent, #3b82f6)', border: 'none', color: '#fff', cursor: 'pointer' }}>
            {busy ? 'Login…' : 'Login'}
          </button>
          {loginMsg && <div className="setting-sub" style={{ color: loginMsg.startsWith('Login OK') ? 'var(--pos, #30a46c)' : 'var(--neg, #e5484d)' }}>{loginMsg}</div>}
        </form>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><div><h2>Architecture</h2><div className="sub">hybrid deployment</div></div></div>
        <div className="settings-list">
          <div className="setting-row"><div><div className="setting-label">Frontend</div><div className="setting-sub">React · Vite · Vercel edge</div></div><div className="setting-value">hosted</div></div>
          <div className="setting-row"><div><div className="setting-label">Backend API</div><div className="setting-sub">Flask · waitress · nginx TLS</div></div><div className="setting-value tnum">ops.budgezen.com</div></div>
          <div className="setting-row"><div><div className="setting-label">Real-time source</div><div className="setting-sub">InferHub daemon · every 60s · backend REST/SSE</div></div><div className="setting-value">active</div></div>
        </div>
      </section>
    </div>
  );
}
