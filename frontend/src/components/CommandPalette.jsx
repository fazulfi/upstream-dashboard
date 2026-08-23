import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Activity,
  DollarSign,
  SlidersHorizontal,
  Settings,
  Sun,
  Moon,
  ShieldCheck,
  RefreshCw,
  X,
  ExternalLink,
} from 'lucide-react';
import { useTheme } from '../theme';

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const commands = [
    { id: 'rel', title: 'Reliability Control Room', sub: 'Completed cycles & SSE stream', category: 'Navigation', icon: Activity, action: () => navigate('/') },
    { id: 'fin', title: 'Finance & Profitability Hub', sub: 'P&L, Asset Inventory, Payouts', category: 'Navigation', icon: DollarSign, action: () => navigate('/finance') },
    { id: 'auto', title: 'Auto-Pricing Engine', sub: 'Provider threshold tuning & scope', category: 'Navigation', icon: SlidersHorizontal, action: () => navigate('/auto-pricing') },
    { id: 'price', title: 'Manual Pricing & Orderbook', sub: 'Price overrides & margin globals', category: 'Navigation', icon: DollarSign, action: () => navigate('/pricing') },
    { id: 'set', title: 'System & Diagnostics', sub: 'Session token & environment diagnostics', category: 'Navigation', icon: Settings, action: () => navigate('/settings') },
    { id: 'theme', title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`, sub: 'Toggle dashboard color scheme', category: 'Preferences', icon: theme === 'dark' ? Sun : Moon, action: () => toggle() },
    { id: 'reload', title: 'Hard Refresh Dashboard', sub: 'Reload current page and clear state', category: 'Actions', icon: RefreshCw, action: () => window.location.reload() },
  ];

  const filtered = commands.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.sub.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl overflow-hidden z-10 flex flex-col"
          >
            <div className="flex items-center px-4 py-3 border-b border-zinc-800 gap-2.5">
              <Search size={18} className="text-zinc-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command, page, or search..."
                className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 border-none outline-none focus:ring-0 p-0"
              />
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-zinc-800 text-zinc-400 rounded border border-zinc-700">
                ESC
              </kbd>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 divide-y divide-zinc-800/40">
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
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${
                        isSelected ? 'bg-sky-500/15 text-sky-200' : 'text-zinc-300 hover:bg-zinc-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-1.5 rounded-md ${
                            isSelected ? 'bg-sky-500/20 text-sky-300' : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate text-zinc-100">{item.title}</div>
                          <div className="text-[11px] text-zinc-400 truncate">{item.sub}</div>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0 ml-2">
                        {item.category}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2 bg-zinc-950/60 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
              <span>Navigate with ↑ ↓ and Enter</span>
              <span>Upstream FinOps v2</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
