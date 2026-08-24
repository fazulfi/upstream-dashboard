import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Activity,
  TrendingUp,
  SlidersHorizontal,
  CircleDollarSign,
  Settings,
  Sun,
  Moon,
  Cpu,
  Layers,
  Sparkles,
  Zap,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Download,
  Key,
  X,
  CornerDownLeft,
  BarChart3,
  ScrollText,
} from 'lucide-react';
import { useTheme } from '../theme';

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const itemRefs = useRef([]);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  // Reset query, selection, and focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const commands = useMemo(
    () => [
      // ── Category: Pages (Navigation) ──
      {
        id: 'nav-reliability',
        title: 'Reliability & Telemetry',
        sub: 'Live pricing daemon status, SSE stream, and model snapshots',
        category: 'Pages',
        icon: Activity,
        keywords: ['overview', 'telemetry', 'status', 'stream', 'home', 'health', 'reliability', 'daemon'],
        shortcut: '⌘1',
        action: () => navigate('/'),
      },
      {
        id: 'nav-finance',
        title: 'Finance & Profitability',
        sub: 'P&L breakdown, revenue metrics, asset inventory, and payouts',
        category: 'Pages',
        icon: TrendingUp,
        keywords: ['finance', 'pnl', 'profit', 'revenue', 'money', 'balance', 'payouts', 'assets'],
        shortcut: '⌘2',
        action: () => navigate('/finance'),
      },
      {
        id: 'nav-auto-pricing',
        title: 'Auto-Pricing Engine',
        sub: 'Configure undercut margins, provider scopes, and daemon triggers',
        category: 'Pages',
        icon: SlidersHorizontal,
        keywords: ['auto', 'pricing', 'engine', 'margin', 'undercut', 'trigger', 'scope', 'rules'],
        shortcut: '⌘3',
        action: () => navigate('/auto-pricing'),
      },
      {
        id: 'nav-pricing',
        title: 'Pricing & Orderbook',
        sub: 'Manual ask controls, market depth visualizer, and active bids',
        category: 'Pages',
        icon: CircleDollarSign,
        keywords: ['orderbook', 'bids', 'asks', 'market', 'manual', 'pricing', 'depth'],
        shortcut: '⌘4',
        action: () => navigate('/pricing'),
      },
      {
        id: 'nav-settings',
        title: 'Settings & Security',
        sub: 'Session authentication tokens, operator preferences, and audit logs',
        category: 'Pages',
        icon: Settings,
        keywords: ['settings', 'security', 'auth', 'token', 'session', 'operator', 'fleet'],
        shortcut: '⌘5',
        action: () => navigate('/settings'),
      },
      {
        id: 'nav-analytics',
        title: 'Consumer Analytics',
        sub: 'Prompt cache optimization, token breakdown, and efficiency metrics',
        category: 'Pages',
        icon: BarChart3,
        keywords: ['analytics', 'cache', 'tokens', 'efficiency', 'stats', 'breakdown', 'hit rate', 'savings'],
        shortcut: '⌘6',
        action: () => navigate('/analytics'),
      },
      {
        id: 'nav-logs',
        title: 'Request Logs',
        sub: 'Per-request telemetry history, TTFT latency, and audit logs',
        category: 'Pages',
        icon: ScrollText,
        keywords: ['logs', 'history', 'requests', 'ttft', 'audit', 'telemetry', 'calls'],
        shortcut: '⌘7',
        action: () => navigate('/logs'),
      },

      // ── Category: Models (Fleet & Endpoints) ──
      {
        id: 'model-claude-3-5',
        title: 'anthropic/claude-3-5-sonnet',
        sub: 'codebuddy-cn · 99.8% uptime · $3.20/M tokens · Active Fleet',
        category: 'Models',
        icon: Sparkles,
        keywords: ['claude', 'anthropic', 'sonnet', '3.5', 'llm', 'codebuddy', 'ai', 'model'],
        shortcut: '↵',
        action: () => navigate('/?search=claude-3-5-sonnet'),
      },
      {
        id: 'model-gpt-4o',
        title: 'openai/gpt-4o',
        sub: 'cline-pass · 99.9% uptime · $2.50/M tokens · High Priority',
        category: 'Models',
        icon: Cpu,
        keywords: ['gpt-4o', 'openai', 'gpt4', 'gpt', 'cline', 'llm', 'ai', 'model'],
        shortcut: '↵',
        action: () => navigate('/?search=gpt-4o'),
      },
      {
        id: 'model-llama-3-3',
        title: 'meta-llama/llama-3.3-70b-instruct',
        sub: 'commandcode · 99.4% uptime · $0.80/M tokens · Open Weights',
        category: 'Models',
        icon: Layers,
        keywords: ['llama', 'meta', '70b', 'instruct', 'commandcode', 'open', 'llm', 'model'],
        shortcut: '↵',
        action: () => navigate('/?search=llama-3.3'),
      },
      {
        id: 'model-deepseek',
        title: 'deepseek/deepseek-chat',
        sub: 'opencode-go · 99.1% uptime · $0.27/M tokens · Cost Leader',
        category: 'Models',
        icon: Zap,
        keywords: ['deepseek', 'chat', 'v3', 'opencode', 'cheap', 'llm', 'ai', 'model'],
        shortcut: '↵',
        action: () => navigate('/?search=deepseek-chat'),
      },
      {
        id: 'model-gemini-flash',
        title: 'google/gemini-flash-1.5',
        sub: 'codebuddy · 99.9% uptime · $0.15/M tokens · Ultra Low Latency',
        category: 'Models',
        icon: Sparkles,
        keywords: ['gemini', 'google', 'flash', '1.5', 'fast', 'latency', 'llm', 'model'],
        shortcut: '↵',
        action: () => navigate('/?search=gemini-flash'),
      },

      // ── Category: Actions (Operational Controls) ──
      {
        id: 'action-arm-daemon',
        title: 'Arm Auto-Pricing Daemon',
        sub: 'Enable automated live undercut execution across all providers',
        category: 'Actions',
        icon: ShieldCheck,
        keywords: ['arm', 'enable', 'start', 'pricing', 'daemon', 'active', 'live'],
        shortcut: '↵',
        action: () => navigate('/auto-pricing'),
      },
      {
        id: 'action-disarm-daemon',
        title: 'Disarm Auto-Pricing Daemon',
        sub: 'Pause automated pricing mutations safely into dry-run mode',
        category: 'Actions',
        icon: ShieldAlert,
        keywords: ['disarm', 'stop', 'pause', 'pricing', 'daemon', 'dry-run', 'safe'],
        shortcut: '↵',
        action: () => navigate('/auto-pricing'),
      },
      {
        id: 'action-refresh-telemetry',
        title: 'Refresh Telemetry Stream',
        sub: 'Force immediate cycle poll and reload live SSE stream',
        category: 'Actions',
        icon: RefreshCw,
        keywords: ['refresh', 'reload', 'sync', 'stream', 'sse', 'cycles', 'poll'],
        shortcut: '↵',
        action: () => navigate('/'),
      },
      {
        id: 'action-export-finance',
        title: 'Export Finance Statement (CSV)',
        sub: 'Download complete billing, payout, and P&L ledger',
        category: 'Actions',
        icon: Download,
        keywords: ['export', 'download', 'csv', 'finance', 'pnl', 'ledger', 'report'],
        shortcut: '↵',
        action: () => navigate('/finance'),
      },
      {
        id: 'action-auth-token',
        title: 'Inspect Session Auth Token',
        sub: 'View current operator JWT token and security credentials',
        category: 'Actions',
        icon: Key,
        keywords: ['auth', 'token', 'jwt', 'session', 'keys', 'security', 'credentials'],
        shortcut: '↵',
        action: () => navigate('/settings'),
      },

      // ── Category: Preferences (System & UI) ──
      {
        id: 'pref-theme-toggle',
        title: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        sub: `Currently using ${theme} spatial theme material`,
        category: 'Preferences',
        icon: theme === 'dark' ? Sun : Moon,
        keywords: ['theme', 'dark', 'light', 'appearance', 'mode', 'color', 'ui', 'toggle'],
        shortcut: '⇧⌘T',
        action: () => toggle(),
      },
    ],
    [navigate, theme, toggle]
  );

  // Filter commands by query across title, sub, category, and keywords
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.trim().toLowerCase();
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.sub.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.keywords && c.keywords.some((k) => k.toLowerCase().includes(q)))
    );
  }, [commands, query]);

  // Group filtered results into ordered categories with globalIndex tracking
  const groupedResults = useMemo(() => {
    const categoryOrder = ['Pages', 'Models', 'Actions', 'Preferences'];
    const groups = [];
    let globalCounter = 0;

    categoryOrder.forEach((cat) => {
      const itemsInCat = filtered.filter((item) => item.category === cat);
      if (itemsInCat.length > 0) {
        groups.push({
          category: cat,
          items: itemsInCat.map((item) => ({
            ...item,
            globalIndex: globalCounter++,
          })),
        });
      }
    });

    // Handle any custom categories not in categoryOrder
    const knownCats = new Set(categoryOrder);
    const otherItems = filtered.filter((item) => !knownCats.has(item.category));
    if (otherItems.length > 0) {
      groups.push({
        category: 'Other',
        items: otherItems.map((item) => ({
          ...item,
          globalIndex: globalCounter++,
        })),
      });
    }

    return groups;
  }, [filtered]);

  // Reset selectedIndex whenever filtered items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  // Keyboard navigation: ArrowUp, ArrowDown, Enter, Escape, Shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
        // Direct jump shortcut ⌘1-⌘7 for pages
        const pageIdx = parseInt(e.key, 10) - 1;
        const pageItems = commands.filter((c) => c.category === 'Pages');
        if (pageItems[pageIdx]) {
          e.preventDefault();
          pageItems[pageIdx].action();
          onClose();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 't' || e.key === 'T')) {
        // Theme toggle shortcut ⇧⌘T
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, commands, onClose, toggle]);

  // Auto-scroll selected element into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
      {/* Spatial Frosted Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Apple iOS 26 Glass Spotlight Window */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="relative w-full max-w-2xl rounded-3xl border border-white/20 dark:border-white/10 ios-sheet p-2 shadow-2xl overflow-hidden font-sans z-10"
        role="dialog"
        aria-modal="true"
        aria-label="Spotlight Search"
      >
            {/* Spotlight Search Header */}
            <div className="flex items-center px-3.5 py-3 border-b border-black/10 dark:border-white/10 gap-3 bg-white/40 dark:bg-black/40 backdrop-blur-xl rounded-2xl">
              <Search size={20} className="text-sky-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Type a command or search modules, models, actions... (Esc to close)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-sm sm:text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none font-medium"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                  aria-label="Clear search query"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Results List View */}
            <div className="max-h-[22rem] sm:max-h-96 overflow-y-auto p-1.5 space-y-3 mt-1 scrollbar-thin">
              {filtered.length === 0 ? (
                /* Muted Glass Empty State Illustration */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className="py-10 px-4 flex flex-col items-center justify-center text-center"
                >
                  <div className="relative mb-4 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500/10 to-indigo-500/20 dark:from-sky-500/20 dark:to-indigo-500/30 border border-sky-500/30 backdrop-blur-md flex items-center justify-center shadow-lg shadow-sky-500/10">
                      <Search size={26} className="text-sky-500/80" />
                    </div>
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-sky-400 animate-ping" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-sky-500" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-1">
                    No matching results for &ldquo;{query}&rdquo;
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mb-4 leading-relaxed">
                    Try searching for navigation pages (e.g. <em>Finance</em>, <em>Pricing</em>), fleet models (e.g. <em>Claude</em>, <em>GPT</em>), or operational actions (e.g. <em>Arm</em>, <em>Theme</em>).
                  </p>
                  <button
                    onClick={() => setQuery('')}
                    className="px-3.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-xs font-semibold text-zinc-700 dark:text-zinc-300 border border-black/10 dark:border-white/10 transition-all cursor-pointer"
                  >
                    Clear search
                  </button>
                </motion.div>
              ) : (
                /* Grouped Categorized Results */
                groupedResults.map((group) => (
                  <div key={group.category} className="space-y-1">
                    {/* Glass Section Header */}
                    <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center justify-between bg-black/5 dark:bg-white/5 backdrop-blur-md rounded-lg mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500/70" />
                        <span>{group.category}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-60">
                        {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>

                    {/* Staggered Item Rows */}
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isSelected = item.globalIndex === selectedIndex;
                      return (
                        <motion.button
                          key={item.id}
                          ref={(el) => (itemRefs.current[item.globalIndex] = el)}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.18,
                            delay: Math.min(item.globalIndex * 0.03, 0.3),
                          }}
                          onClick={() => {
                            item.action();
                            onClose();
                          }}
                          onMouseEnter={() => setSelectedIndex(item.globalIndex)}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-left transition-all duration-150 cursor-pointer border ${
                            isSelected
                              ? 'bg-sky-500/15 dark:bg-sky-950/60 text-sky-900 dark:text-sky-100 border-sky-500/30 shadow-xs scale-[1.008]'
                              : 'bg-transparent text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Leading Squircle Icon */}
                            <div
                              className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-sky-500/25 text-sky-600 dark:text-sky-300 shadow-inner'
                                  : 'bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-400'
                              }`}
                            >
                              <Icon size={18} />
                            </div>

                            {/* Label & Description */}
                            <div className="min-w-0">
                              <div className="text-xs sm:text-sm font-semibold truncate text-zinc-900 dark:text-zinc-100">
                                {item.title}
                              </div>
                              <div className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                {item.sub}
                              </div>
                            </div>
                          </div>

                          {/* Right Keyboard Shortcut Badge */}
                          <div className="flex items-center gap-1.5 shrink-0 ml-3">
                            {item.shortcut && (
                              <kbd
                                className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded-md border transition-colors ${
                                  isSelected
                                    ? 'bg-sky-500/20 text-sky-800 dark:text-sky-200 border-sky-500/30'
                                    : 'bg-black/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 border-black/10 dark:border-white/10'
                                }`}
                              >
                                {item.shortcut}
                              </kbd>
                            )}
                            {isSelected && (
                              <CornerDownLeft
                                size={13}
                                className="text-sky-600 dark:text-sky-400 animate-pulse ml-0.5"
                              />
                            )}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer Keyboard Hints */}
            <div className="px-3.5 py-2.5 border-t border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 rounded-b-2xl mt-1">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 font-mono text-[10px]">
                    ↑↓
                  </kbd>{' '}
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 font-mono text-[10px]">
                    ↵
                  </kbd>{' '}
                  Select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 font-mono text-[10px]">
                    Esc
                  </kbd>{' '}
                  Close
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Spotlight Ready</span>
              </div>
            </div>
          </motion.div>
        </div>
  );
}

