import React from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Sun, Moon, RefreshCw, Radio, Menu, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useTheme } from '../theme';
import { getSessionToken } from '../hooks/useApi';

export default function Topbar({ onOpenSearch, onToggleSidebar, streamStatus = 'live' }) {
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const hasSession = Boolean(getSessionToken());
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const pageNames = {
    '/': 'Reliability',
    '/finance': 'Finance & Profitability Hub',
    '/auto-pricing': 'Auto Pricing',
    '/pricing': 'Pricing',
    '/settings': 'Settings',
  };

  const currentPage = pageNames[location.pathname] || 'Dashboard';

  const statusConfig = {
    live: { label: 'Live', color: 'bg-emerald-400', textColor: 'text-emerald-400', border: 'border-emerald-500/30 bg-emerald-500/10' },
    connecting: { label: 'Connecting', color: 'bg-amber-400', textColor: 'text-amber-400', border: 'border-amber-500/30 bg-amber-500/10' },
    reconnecting: { label: 'Reconnecting', color: 'bg-rose-400', textColor: 'text-rose-400', border: 'border-rose-500/30 bg-rose-500/10' },
    recovering: { label: 'Recovering snapshot', color: 'bg-sky-400', textColor: 'text-sky-400', border: 'border-sky-500/30 bg-sky-500/10' },
    'auth-required': { label: 'Session expired', color: 'bg-rose-400', textColor: 'text-rose-400', border: 'border-rose-500/30 bg-rose-500/10' },
  };

  const currentStatus = statusConfig[streamStatus] || statusConfig.live;

  return (
    <header className="topbar sticky top-0 z-30 h-14 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="menu-btn lg:hidden p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
          aria-label="Menu"
        >
          <Menu size={16} />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-medium">Upstream</span>
          <span className="text-xs text-zinc-600">/</span>
          <h1 className="text-xs sm:text-sm font-semibold text-zinc-100">{currentPage}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Live SSE status indicator pill */}
        <div className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${currentStatus.border} ${currentStatus.textColor}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.color} animate-pulse`} />
          <span>{currentStatus.label}</span>
        </div>

        {/* Command Palette Trigger */}
        <button
          onClick={onOpenSearch}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 transition-colors text-xs"
        >
          <Search size={13} />
          <span className="text-zinc-500">Quick search...</span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-800 text-zinc-400 rounded border border-zinc-700">
            Ctrl+K
          </kbd>
        </button>

        {/* Hard refresh */}
        <button
          onClick={() => window.location.reload()}
          className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
          title="Reload Dashboard"
          aria-label="Reload"
        >
          <RefreshCw size={14} />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
          title={themeLabel}
          aria-label={themeLabel}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Session Status Pill */}
        <div className="hidden lg:flex items-center gap-1.5 pl-2 border-l border-zinc-800">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
            U
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-zinc-200 leading-tight">Operator</span>
            <span className="text-[9px] text-zinc-500 leading-tight">
              {hasSession ? '24h Token' : 'Session'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
