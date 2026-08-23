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
} from 'lucide-react';

const SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Reliability', Icon: Activity, end: true },
      { to: '/finance', label: 'Finance & P&L', Icon: TrendingUp, badge: 'Phase 3' },
    ],
  },
  {
    label: 'Publisher',
    items: [
      { to: '/auto-pricing', label: 'Auto Pricing', Icon: SlidersHorizontal },
      { to: '/pricing', label: 'Pricing', Icon: CircleDollarSign },
    ],
  },
  {
    label: 'System',
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
        className={`sidebar fixed top-0 bottom-0 left-0 z-50 w-64 bg-zinc-950 border-r border-zinc-800/80 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'open translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-14 px-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-sky-500/20">
              U
            </div>
            <div>
              <div className="font-bold text-sm text-zinc-100 tracking-tight flex items-center gap-1.5">
                Upstream
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  FinOps
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
                Publisher Node
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="lg:hidden p-1 text-zinc-400 hover:text-zinc-200 rounded"
            aria-label="Close Sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Section */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Main">
          {SECTIONS.map((sec) => (
            <div key={sec.label} className="space-y-1">
              <div className="px-3 text-[10px] font-semibold font-mono tracking-wider uppercase text-zinc-500">
                {sec.label}
              </div>
              <div className="space-y-0.5 pt-1">
                {sec.items.map((it) => (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.end}
                    onClick={() => onClose?.()}
                    className={({ isActive }) =>
                      `group nav-item flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'active bg-sky-500/10 text-sky-400 font-semibold border border-sky-500/20 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60 border border-transparent'
                      }`
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <it.Icon
                        size={16}
                        className="transition-colors group-hover:text-zinc-100 group-[.active]:text-sky-400"
                      />
                      <span>{it.label}</span>
                    </div>
                    {it.badge && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 group-[.active]:bg-sky-500/20 group-[.active]:text-sky-300">
                        {it.badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer info & theme toggle */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/40">
          <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                S
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-200 truncate">Ssnford</div>
                <div className="text-[10px] text-zinc-500 truncate flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  InferHub Node
                </div>
              </div>
            </div>

            <button
              onClick={toggle}
              className="sf-theme p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              title={themeLabel}
              aria-label={themeLabel}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
