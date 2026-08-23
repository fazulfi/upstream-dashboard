import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTheme } from '../theme';
import {
  Settings,
  Sun,
  Moon,
  Activity,
  CircleDollarSign,
  SlidersHorizontal,
  TrendingUp,
  X,
  Radio,
  Sparkles,
} from 'lucide-react';

const SECTIONS = [
  {
    label: 'Operations',
    items: [
      { to: '/', label: 'Reliability', Icon: Activity, end: true },
      { to: '/finance', label: 'Finance & P&L', Icon: TrendingUp, badge: 'FinOps' },
    ],
  },
  {
    label: 'Market Execution',
    items: [
      { to: '/auto-pricing', label: 'Auto Pricing', Icon: SlidersHorizontal },
      { to: '/pricing', label: 'Pricing', Icon: CircleDollarSign },
    ],
  },
  {
    label: 'Platform',
    items: [{ to: '/settings', label: 'Settings', Icon: Settings }],
  },
];

export default function Sidebar({ isOpen = false, onClose }) {
  const { theme, toggle } = useTheme();
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      <aside
        className={`sidebar fixed top-0 bottom-0 left-0 z-50 w-64 bg-zinc-950/95 backdrop-blur-xl border-r border-zinc-800/80 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'open translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-sky-500/20">
              U
            </div>
            <div>
              <div className="text-xs font-bold font-mono tracking-tight text-zinc-100 uppercase">
                Upstream
              </div>
              <div className="text-[10px] text-zinc-400 font-mono">Control Plane v2</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Section */}
        <nav aria-label="Main" className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
          {SECTIONS.map((sec) => (
            <div key={sec.label} className="space-y-1">
              <div className="px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                {sec.label}
              </div>
              <div className="space-y-0.5 pt-1">
                {sec.items.map((item) => {
                  const Icon = item.Icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                          isActive
                            ? 'active bg-sky-500/15 text-sky-300 font-bold border border-sky-500/30 shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
                        }`
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          size={15}
                          className="text-zinc-400 group-hover:text-zinc-200 group-[.active]:text-sky-400 transition-colors"
                        />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer & Theme Switcher */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/60 space-y-2">
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-zinc-400 text-[11px] font-mono">SSE Stream</span>
            </div>
            <button
              onClick={toggle}
              aria-label={themeLabel}
              title={themeLabel}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
