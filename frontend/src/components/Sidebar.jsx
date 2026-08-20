import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTheme } from '../theme';
import { Settings, Sun, Activity, MessageSquare, Zap } from 'lucide-react';

const SECTIONS = [
  { label: 'Overview', items: [
    { to: '/', label: 'Reliability', Icon: Activity, end: true },
  ] },
  { label: 'Publisher', items: [
    { to: '/asks', label: 'Ask Price', Icon: MessageSquare },
    { to: '/auto-pricing', label: 'Auto-Pricing', Icon: Zap },
  ]},
  { label: 'System', items: [ { to: '/settings', label: 'Settings', Icon: Settings } ] },
];

export default function Sidebar() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">U</div>
        <div>
          <div className="brand-name">Upstream</div>
          <div className="brand-sub">publisher</div>
        </div>
      </div>
      <nav className="nav" aria-label="Main">
        {SECTIONS.map(sec => (
          <div key={sec.label}>
            <div className="nav-label">{sec.label}</div>
            {sec.items.map(it => (
              <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <it.Icon size={15} strokeWidth={1.75} className="nav-ico" />
                <span>{it.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <div className="sf-avatar">S</div>
        <div>
          <div className="sf-name">Ssnford</div>
          <div className="sf-sub">publisher</div>
        </div>
        <button className="sf-theme" onClick={toggle} aria-label={label} title={label}>
          <Sun size={14} />
        </button>
      </div>
    </aside>
  );
}
