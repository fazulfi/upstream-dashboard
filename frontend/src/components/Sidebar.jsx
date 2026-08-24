import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
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
  BarChart3,
  ScrollText,
} from 'lucide-react';

const SECTIONS = [
  {
    label: 'Telemetry & Analytics',
    items: [
      { to: '/', label: 'Reliability', Icon: Activity, end: true },
      { to: '/analytics', label: 'Consumer Analytics', Icon: BarChart3 },
      { to: '/logs', label: 'Request Logs', Icon: ScrollText },
    ],
  },
  {
    label: 'Operations & Finance',
    items: [
      { to: '/finance', label: 'Finance & P&L', Icon: TrendingUp },
      { to: '/auto-pricing', label: 'Auto Pricing', Icon: SlidersHorizontal },
      { to: '/pricing', label: 'Pricing', Icon: CircleDollarSign },
      { to: '/settings', label: 'Settings', Icon: Settings },
    ],
  },
];

export function isSidebarSwipeClose(info) {
  return (info?.offset?.x ?? 0) < -80 || (info?.velocity?.x ?? 0) < -300;
}

export default function Sidebar({ isOpen = false, onClose }) {
  const { theme, toggle } = useTheme();
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  // Keyboard accessibility: dismiss sidebar on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleDragEnd = (_e, info) => {
    // Trigger onClose if user swipes left past distance threshold or with velocity
    if (isSidebarSwipeClose(info)) {
      onClose?.();
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden cursor-pointer"
          />
        )}
      </AnimatePresence>

      <motion.aside
        className={`sidebar ios-sidebar fixed top-0 bottom-0 left-0 z-50 lg:z-30 w-64 flex flex-col touch-pan-y ${
          isOpen ? 'open shadow-2xl' : 'pointer-events-none lg:pointer-events-auto'
        }`}
        initial={false}
        animate={{ x: isOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 250 }}
        drag={isOpen ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.8, right: 0 }}
        dragSnapToOrigin={true}
        dragDirectionLock={true}
        onDragEnd={handleDragEnd}
      >
        {/* Brand Header */}
        <div className="h-14 px-5 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-xs shadow-md shadow-sky-500/20">
              U
            </div>
            <div>
              <div className="text-xs font-bold font-mono tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">
                Upstream
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">Control Plane</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="ios-icon-btn p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer lg:hidden"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation Section */}
        <nav aria-label="Main" className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {SECTIONS.map((sec) => (
            <div key={sec.label} className="space-y-1">
              <div className="px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {sec.label}
              </div>
              <div className="space-y-1 pt-1">
                {sec.items.map((item) => {
                  const Icon = item.Icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `group ios-sidebar-item text-xs font-semibold ${isActive ? 'active' : ''}`
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={15} className="text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200" />
                        <span>{item.label}</span>
                      </div>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer & Theme Switcher */}
        <div className="p-4 border-t border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
            <span className="text-zinc-600 dark:text-zinc-400 text-[11px] font-mono">Live Stream</span>
          </div>
          <button
            onClick={toggle}
            aria-label={themeLabel}
            title={themeLabel}
            className="ios-icon-btn p-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer shadow-sm"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </motion.aside>
    </>
  );
}
