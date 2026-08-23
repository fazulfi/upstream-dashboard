import React from 'react';
import { useLocation, NavLink } from 'react-router-dom';
import {
  Search,
  Sun,
  Moon,
  Radio,
  Menu,
  Activity,
  TrendingUp,
  SlidersHorizontal,
  CircleDollarSign,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useTheme } from '../theme';
import { getSessionToken } from '../hooks/useApi';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', Icon: Activity, end: true },
  { to: '/finance', label: 'Finance & P&L', Icon: TrendingUp },
  { to: '/auto-pricing', label: 'Auto Pricing', Icon: SlidersHorizontal },
  { to: '/pricing', label: 'Pricing', Icon: CircleDollarSign },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

export default function Topbar({ onOpenSearch, onToggleSidebar, streamStatus = 'live' }) {
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const hasSession = Boolean(getSessionToken());
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const pageNames = {
    '/': 'Reliability',
    '/finance': 'Finance & Profitability',
    '/auto-pricing': 'Auto Pricing',
    '/pricing': 'Pricing',
    '/settings': 'Settings',
  };

  const currentPage = pageNames[location.pathname] || 'Reliability';

  const statusConfig = {
    live: { label: 'Live Stream', color: 'bg-emerald-400', textColor: 'text-emerald-400', border: 'border-emerald-500/30 bg-emerald-500/10' },
    connecting: { label: 'Connecting', color: 'bg-amber-400', textColor: 'text-amber-400', border: 'border-amber-500/30 bg-amber-500/10' },
    reconnecting: { label: 'Reconnecting', color: 'bg-rose-400', textColor: 'text-rose-400', border: 'border-rose-500/30 bg-rose-500/10' },
    recovering: { label: 'Recovering', color: 'bg-sky-400', textColor: 'text-sky-400', border: 'border-sky-500/30 bg-sky-500/10' },
    'auth-required': { label: 'Expired', color: 'bg-rose-400', textColor: 'text-rose-400', border: 'border-rose-500/30 bg-rose-500/10' },
  };

  const currentStatus = statusConfig[streamStatus] || statusConfig.live;

  return (
    <header className="topbar sticky top-0 z-30 w-full border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl px-4 sm:px-8 flex flex-col justify-between">
      {/* Upper Header Row */}
      <div className="h-14 flex items-center justify-between gap-4">
        {/* Left: Brand & Mobile Menu */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="menu-btn lg:hidden p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors cursor-pointer"
            aria-label="Menu"
          >
            <Menu size={16} />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-xs shadow-md shadow-sky-500/20">
              U
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-tight text-zinc-100 uppercase">
                Upstream
              </span>
              <span className="text-xs text-zinc-600">/</span>
              <h1 className="text-xs font-bold text-zinc-300">{currentPage}</h1>
            </div>
          </div>
        </div>

        {/* Center: Desktop Segmented Navigation Tabs (Vercel Style) */}
        <nav aria-label="Topbar Tabs" className="hidden lg:flex items-center gap-1 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/80">
          {NAV_ITEMS.map((item) => {
            const Icon = item.Icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'active bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
                  }`
                }
              >
                <Icon size={14} className="text-zinc-400 group-hover:text-zinc-200" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Right: Quick Search, Status Pill & Theme Switcher */}
        <div className="flex items-center gap-2.5">
          {/* Live SSE status indicator pill */}
          <div
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${currentStatus.border} ${currentStatus.textColor}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.color} animate-pulse`} />
            <span>{currentStatus.label}</span>
          </div>

          {/* Command Palette Trigger */}
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors cursor-pointer"
          >
            <Search size={13} />
            <span className="hidden md:inline">Quick search…</span>
            <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-zinc-950 rounded border border-zinc-800 text-zinc-400">
              Ctrl+K
            </kbd>
          </button>

          {/* Theme Switcher */}
          <button
            onClick={toggle}
            aria-label={themeLabel}
            title={themeLabel}
            className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>
    </header>
  );
}
