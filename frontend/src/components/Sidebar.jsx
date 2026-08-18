import { NavLink } from 'react-router-dom';
import { useTheme } from '../theme';
import { LayoutDashboard, TrendingUp, Layers, BarChart3, Receipt, Wallet, Settings, Sun, KeyRound, QrCode, CandlestickChart, Boxes, Gauge, SlidersHorizontal, Activity, Workflow, ShieldCheck } from 'lucide-react';

const SECTIONS = [
  { label: 'Overview', items: [
    { to: '/', label: 'Reliability', Icon: ShieldCheck, end: true },
    { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  ] },
  { label: 'Publisher', items: [
    { to: '/earnings', label: 'Earnings', Icon: TrendingUp },
    { to: '/upstreams', label: 'Upstreams', Icon: Layers },
    { to: '/market', label: 'Market & Pricing', Icon: CandlestickChart },
    { to: '/asks', label: 'Ask Price', Icon: SlidersHorizontal },
    { to: '/auto-pricing', label: 'Auto-Pricing', Icon: Workflow },
    { to: '/fleet-health', label: 'Fleet Health', Icon: Activity },
    { to: '/catalog', label: 'Catalog & Capacity', Icon: Boxes },
    { to: '/budgets', label: 'Budgets', Icon: Wallet },
    { to: '/combos', label: 'Combos', Icon: Boxes },
    { to: '/analytics', label: 'Analytics', Icon: BarChart3 },
    { to: '/pnl', label: 'Profit & Loss', Icon: Receipt },
    { to: '/settlements', label: 'Settlements', Icon: Wallet },
  ]},
  { label: 'Consumer', items: [
    { to: '/usage', label: 'Usage & Cache', Icon: Gauge },
    { to: '/keys', label: 'API Keys', Icon: KeyRound },
    { to: '/topups', label: 'Top-ups', Icon: QrCode },
  ]},
  { label: 'System', items: [ { to: '/settings', label: 'Settings', Icon: Settings } ] },
];

export default function Sidebar() {
  const { toggle } = useTheme();
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
<button className="sf-theme" onClick={toggle} aria-label="Light mode enabled" disabled title="Light mode only">
           <Sun size={14} />
         </button>
      </div>
    </aside>
  );
}
