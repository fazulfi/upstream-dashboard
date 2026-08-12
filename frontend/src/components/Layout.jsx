import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useApi } from '../hooks/useApi';

const TITLES = {
  '/': { crumb: 'Dashboard / Overview', title: 'Operations overview' },
  '/earnings': { crumb: 'Operations / Earnings', title: 'Earnings' },
  '/upstreams': { crumb: 'Operations / Upstreams', title: 'Upstream fleet' },
  '/analytics': { crumb: 'Operations / Analytics', title: 'Analytics' },
  '/pnl': { crumb: 'Operations / Profit & Loss', title: 'Profit & loss' },
  '/settlements': { crumb: 'Operations / Settlements', title: 'Settlements' },
  '/market': { crumb: 'Market / Pricing', title: 'Market & Pricing' },
  '/catalog': { crumb: 'Catalog / Capacity', title: 'Catalog & Capacity' },
  '/usage': { crumb: 'Usage / Cache', title: 'Usage & Cache' },
  '/asks': { crumb: 'Ask Price / Manual', title: 'Ask Price' },
  '/fleet-health': { crumb: 'Fleet / Health', title: 'Fleet Health' },
  '/auto-pricing': { crumb: 'Auto / Pricing', title: 'Auto-Pricing' },
  '/keys': { crumb: 'Account & Billing / API Keys', title: 'API keys' },
  '/topups': { crumb: 'Account & Billing / Top-ups', title: 'Top-ups' },
  '/settings': { crumb: 'System / Settings', title: 'Settings' },
};

export default function Layout() {
  const loc = useLocation();
  const { data } = useApi('/api/data', 15000);
  const t = TITLES[loc.pathname] || TITLES['/'];
  const bal = data?.balances || {};

  const toggleMenu = () => document.querySelector('.sidebar')?.classList.toggle('open');

  return (
    <div className="layout">
      <Sidebar account={data?.account} onToggle={toggleMenu} />
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={toggleMenu} aria-label="Menu">☰</button>
          <div className="topbar-title">
            <div className="crumbs"><b>{t.crumb.split('/')[0]}</b> / {t.crumb.split('/')[1]}</div>
            <h1>{t.title}</h1>
          </div>
          {bal.publisher_earnings != null && (
            <span className="top-earn tnum">
              <span className="t-label">Balance</span>
              ${Number(bal.publisher_earnings).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          <span className="live-pill"><i />Live</span>
          <span className="updated tnum">{data?.refreshed ? `updated ${data.refreshed}` : ''}</span>
        </header>
        <Outlet context={{ data }} />
      </div>
    </div>
  );
}
