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
    live: { label: 'Live Stream', color: 'bg-emerald-500', textColor: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-500/30 bg-emerald-500/10' },
    connecting: { label: 'Connecting', color: 'bg-amber-500', textColor: 'text-amber-800 dark:text-amber-400', border: 'border-amber-500/30 bg-amber-500/10' },
    reconnecting: { label: 'Reconnecting', color: 'bg-rose-500', textColor: 'text-rose-700 dark:text-rose-400', border: 'border-rose-500/30 bg-rose-500/10' },
    recovering: { label: 'Recovering', color: 'bg-sky-500', textColor: 'text-sky-700 dark:text-sky-400', border: 'border-sky-500/30 bg-sky-500/10' },
    'auth-required': { label: 'Expired', color: 'bg-rose-500', textColor: 'text-rose-700 dark:text-rose-400', border: 'border-rose-500/30 bg-rose-500/10' },
  };

  const currentStatus = statusConfig[streamStatus] || statusConfig.live;

  return (
    <header className="ios-glass-nav sticky top-0 z-30 w-full px-4 sm:px-8 flex flex-col justify-between transition-colors">
      {/* Upper Header Row */}
      <div className="h-16 flex items-center justify-between gap-4">
        {/* Left: Brand & Mobile Menu */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="menu-btn lg:hidden p-2 rounded-xl border border-black/10 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Menu"
          >
            <Menu size={18} />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-sky-500/25">
              U
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white uppercase font-mono">
                Upstream
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-600">/</span>
              <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-300">{currentPage}</h1>
            </div>
          </div>
        </div>

        {/* Center: Desktop Segmented Navigation Tabs (Apple Segmented Style) */}
        <nav aria-label="Topbar Tabs" className="hidden lg:flex items-center gap-1.5 bg-black/5 dark:bg-white/5 p-1.5 rounded-2xl border border-black/10 dark:border-white/10">
          {NAV_ITEMS.map((item) => {
            const Icon = item.Icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'active ios-pill-active font-extrabold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
                  }`
                }
              >
                <Icon size={14} className="opacity-80" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Right: Quick Search, Status Pill & Theme Switcher */}
        <div className="flex items-center gap-2.5">
          {/* Live SSE status indicator pill */}
          <div
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${currentStatus.border} ${currentStatus.textColor}`}
          >
            <span className={`w-2 h-2 rounded-full ${currentStatus.color} animate-pulse`} />
            <span>{currentStatus.label}</span>
          </div>

          {/* Command Palette Trigger */}
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition-colors cursor-pointer shadow-sm"
          >
            <Search size={14} />
            <span className="hidden md:inline">Quick search…</span>
            <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-black rounded border border-black/10 dark:border-white/10 text-zinc-500">
              ⌘K
            </kbd>
          </button>

          {/* Theme switcher toggle */}
          <button
            onClick={toggle}
            aria-label={themeLabel}
            title={themeLabel}
            className="p-2 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer shadow-sm"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
}
