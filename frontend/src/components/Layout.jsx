import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useApi } from '../hooks/useApi';

const TITLES = {
  '': { crumb: 'Reliability / Overview', title: 'Reliability' },
  '/': { crumb: 'Reliability / Overview', title: 'Reliability' },
  '/auto-pricing': { crumb: 'Publisher / Auto Pricing', title: 'Auto Pricing' },
  '/pricing': { crumb: 'Publisher / Pricing', title: 'Pricing' },
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
