import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Activity,
  TrendingUp,
  SlidersHorizontal,
  CircleDollarSign,
  Settings,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '../theme';

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const commands = useMemo(
    () => [
      {
        id: 'nav-reliability',
        title: 'Go to Reliability & Telemetry',
        sub: 'Live pricing daemon status and model snapshots',
        category: 'Navigation',
        icon: Activity,
        action: () => navigate('/'),
      },
      {
        id: 'nav-finance',
        title: 'Go to Finance & Profitability',
        sub: 'P&L breakdown, asset inventory, and payouts',
        category: 'Navigation',
        icon: TrendingUp,
        action: () => navigate('/finance'),
      },
      {
        id: 'nav-auto-pricing',
        title: 'Go to Auto-Pricing Engine',
        sub: 'Configure undercut margins, scope, and triggers',
        category: 'Navigation',
        icon: SlidersHorizontal,
        action: () => navigate('/auto-pricing'),
      },
      {
        id: 'nav-pricing',
        title: 'Go to Pricing & Orderbook',
        sub: 'Manual ask controls and market depth visualizer',
        category: 'Navigation',
        icon: CircleDollarSign,
        action: () => navigate('/pricing'),
      },
      {
        id: 'nav-settings',
        title: 'Go to Settings & Security',
        sub: 'Session token, fleet health, and architecture',
        category: 'Navigation',
        icon: Settings,
        action: () => navigate('/settings'),
      },
      {
        id: 'theme-toggle',
        title: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        sub: `Currently using ${theme} theme`,
        category: 'Preferences',
        icon: theme === 'dark' ? Sun : Moon,
        action: () => toggle(),
      },
    ],
    [navigate, theme, toggle]
  );

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.sub.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
        onClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-2xl overflow-hidden font-sans">
        <div className="flex items-center px-3 py-2.5 border-b border-zinc-800/80 gap-3">
          <Search size={18} className="text-zinc-500 shrink-0" />
          <input
            type="text"
            placeholder="Type a command or search modules... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">No matching commands found.</div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-sky-950/60 text-sky-100'
                      : 'bg-transparent text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg ${
                        isSelected
                          ? 'bg-sky-900/80 text-sky-300'
                          : 'bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate text-zinc-100">{item.title}</div>
                      <div className="text-[11px] text-zinc-400 truncate">{item.sub}</div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 shrink-0 ml-2">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-3 py-2 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-2">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
          <span>Upstream Console</span>
        </div>
      </div>
    </div>
  );
}
