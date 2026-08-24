import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ScrollText,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
  DollarSign,
  Layers,
  Copy,
  Check,
  X,
  ExternalLink,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import { apiFetch } from '../hooks/useApi';
import { SkeletonBlock } from '../components/Skeleton';
import Badge from '../components/Badge';
import { fmtUsdMicro, fmtTs } from '../lib/fmt';

const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'all', label: 'All' },
];

const STATUS_OPTIONS = [
  { id: 'all', label: 'All Statuses' },
  { id: 'ok', label: '200 OK' },
  { id: '429', label: '429 Rate Limit' },
  { id: 'error', label: 'Errors (4xx/5xx)' },
];

function formatRelativeTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

function formatTokens(val) {
  const n = Number(val || 0);
  if (!isFinite(n) || n === 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + ' k';
  return n.toLocaleString();
}

function RequestDetailModal({ request, onClose }) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!request) return null;

  const handleCopyId = () => {
    if (request.id) {
      navigator.clipboard?.writeText(request.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard?.writeText(JSON.stringify(request, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const promptTokens = Number(request.prompt_tokens || request.promptTokens || 0);
  const cachedTokens = Number(request.cached_tokens || request.cachedTokens || 0);
  const cacheWriteTokens = Number(request.cache_write_tokens || request.cacheWriteTokens || 0);
  const completionTokens = Number(request.completion_tokens || request.completionTokens || 0);
  const totalTokens = Number(request.total_tokens || request.totalTokens || promptTokens + completionTokens);
  const cacheHitPct = promptTokens > 0 ? ((cachedTokens / promptTokens) * 100).toFixed(1) : 0;
  const cost = request.cost_consumer_usdc || request.costUsdc || request.cost || 0;
  const isOk = request.status === 'ok' || (request.http_status >= 200 && request.http_status < 300);
  const is429 = request.status === '429' || request.http_status === 429;

  return (
    <motion.div
      key="request-detail-modal-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-md cursor-pointer"
      />

      {/* Modal Dialog */}
      <motion.div
        key="request-detail-modal-dialog"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: 'spring', damping: 25, stiffness: 280 }}
        className="relative w-full max-w-2xl ios-glass-card rounded-3xl border border-white/20 dark:border-white/10 shadow-2xl p-6 overflow-hidden z-10 space-y-5 my-8 max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Request Details"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-2xl border ${
                isOk
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : is429
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400'
              }`}
            >
              {isOk ? <CheckCircle2 size={20} /> : is429 ? <AlertTriangle size={20} /> : <XCircle size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[var(--text-title)]">
                  Request Telemetry
                </h3>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    isOk
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                      : is429
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                  }`}
                >
                  HTTP {request.http_status || (isOk ? '200' : '500')}
                </span>
              </div>
              <p className="text-xs text-vibrant-secondary font-mono">
                {request.ts ? new Date(request.ts).toISOString() : '—'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="ios-icon-btn p-2 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Request ID Banner */}
          <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">Request ID</span>
              <span className="font-mono text-xs font-semibold text-[var(--text-title)] truncate block">
                {request.id || 'req_anonymous'}
              </span>
            </div>
            <button
              onClick={handleCopyId}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors"
            >
              {copiedId ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              <span>{copiedId ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* Model & Upstream Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">Target Model</span>
              <span className="font-mono text-xs font-bold text-[var(--text-title)]">
                {request.model || 'Unknown Model'}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">Upstream Provider</span>
              <span className="font-mono text-xs font-bold text-[var(--text-title)]">
                {request.upstream_label || request.upstream || 'Direct'}
              </span>
            </div>
          </div>

          {/* Token Breakdown Inset Card */}
          <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-title)]">
                Token Breakdown
              </span>
              <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {cacheHitPct}% Cached
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5">
                <span className="text-[10px] uppercase text-zinc-400 block">Prompt</span>
                <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                  {promptTokens.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5">
                <span className="text-[10px] uppercase text-zinc-400 block">Cached</span>
                <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {cachedTokens.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5">
                <span className="text-[10px] uppercase text-zinc-400 block">Completion</span>
                <span className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400 tabular-nums">
                  {completionTokens.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5">
                <span className="text-[10px] uppercase text-zinc-400 block">Total</span>
                <span className="font-mono text-xs font-bold text-[var(--text-title)] tabular-nums">
                  {totalTokens.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Latency & Financial Performance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">TTFT (First Token)</span>
              <span className="font-mono text-sm font-bold text-[var(--text-title)] tabular-nums">
                {request.ttft_ms != null ? `${request.ttft_ms} ms` : '—'}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">Total Duration</span>
              <span className="font-mono text-sm font-bold text-[var(--text-title)] tabular-nums">
                {request.duration_ms != null
                  ? request.duration_ms >= 1000
                    ? `${(request.duration_ms / 1000).toFixed(2)}s`
                    : `${request.duration_ms} ms`
                  : '—'}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">Consumer Cost</span>
              <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {fmtUsdMicro(cost)}
              </span>
            </div>
          </div>

          {/* Raw JSON Viewer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-vibrant-secondary">
                Raw Telemetry Payload
              </span>
              <button
                onClick={handleCopyJson}
                className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
              >
                {copiedJson ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                <span>{copiedJson ? 'Copied JSON' : 'Copy JSON'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-2xl bg-black/10 dark:bg-black/40 border border-black/10 dark:border-white/10 font-mono text-[11px] text-zinc-800 dark:text-zinc-200 overflow-x-auto max-h-48 scrollbar-thin">
              {JSON.stringify(request, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-black/10 dark:border-white/10 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="ios-btn-primary px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
          >
            Close Details
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Logs() {
  const [range, setRange] = useState('24h');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [logsData, setLogsData] = useState(null);
  const [modelsList, setModelsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedRequest, setSelectedRequest] = useState(null);

  // Fetch available models for dropdown filter
  const fetchModels = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/usage/logs-models?range=${range}`);
      if (res.ok) {
        const json = await res.json();
        // Support array of strings or array of objects {value, label}
        if (Array.isArray(json)) {
          setModelsList(json.map((m) => (typeof m === 'string' ? { value: m, label: m } : m)));
        }
      }
    } catch {
      // Non-fatal if models endpoint fails
    }
  }, [range]);

  // Fetch request logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        range,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (modelFilter && modelFilter !== 'all') {
        params.append('model', modelFilter);
      }
      if (searchQuery.trim()) {
        params.append('q', searchQuery.trim());
      }

      const res = await apiFetch(`/api/usage/logs?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setLogsData(json);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [range, page, pageSize, statusFilter, modelFilter, searchQuery]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page to 1 when filters change
  const handleRangeChange = (r) => {
    setRange(r);
    setPage(1);
  };

  const handleStatusChange = (s) => {
    setStatusFilter(s);
    setPage(1);
  };

  const handleModelChange = (m) => {
    setModelFilter(m);
    setPage(1);
  };

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    setPage(1);
  };

  // Rows and Pagination Stats
  const rows = useMemo(() => {
    const rawRows = logsData?.rows || [];
    // If client-side search query is entered and server returned unfiltered list, do quick local fallback filter
    if (searchQuery.trim() && rawRows.length > 0) {
      const q = searchQuery.trim().toLowerCase();
      return rawRows.filter((r) => {
        return (
          String(r.id || '').toLowerCase().includes(q) ||
          String(r.model || '').toLowerCase().includes(q) ||
          String(r.upstream_label || '').toLowerCase().includes(q) ||
          String(r.status || '').toLowerCase().includes(q)
        );
      });
    }
    return rawRows;
  }, [logsData, searchQuery]);

  const effectivePageSize = Number(logsData?.pageSize || pageSize || 25);
  const totalRecords = logsData?.total || logsData?.rangeTotal || rows.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / effectivePageSize));
  const totalCost = logsData?.totalCostUsdc || logsData?.total_cost || null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Detail Inspection Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <RequestDetailModal
            request={selectedRequest}
            onClose={() => setSelectedRequest(null)}
          />
        )}
      </AnimatePresence>

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-title)] flex items-center gap-2">
            <ScrollText className="text-sky-500" size={24} />
            <span>Request Logs</span>
          </h2>
          <p className="text-xs sm:text-sm text-vibrant-secondary mt-0.5">
            Per-request telemetry history, TTFT latency, token composition, and audit logs
          </p>
        </div>

        {/* Range Segmented Control */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="ios-segmented-control flex items-center p-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 shadow-inner">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => handleRangeChange(r.id)}
                className={`ios-segment px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  range === r.id
                    ? 'active bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="ios-icon-btn p-2 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            title="Refresh logs"
            aria-label="Refresh logs"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="ios-glass-card p-4 rounded-2xl border border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 shadow-md">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by model, upstream, ID..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-[var(--text-title)] placeholder-zinc-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Dropdown */}
          <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 px-2.5 py-1.5 rounded-xl border border-black/10 dark:border-white/10">
            <span className="text-[11px] text-zinc-400 font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[var(--text-title)] outline-none cursor-pointer"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model Dropdown */}
          <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 px-2.5 py-1.5 rounded-xl border border-black/10 dark:border-white/10">
            <span className="text-[11px] text-zinc-400 font-semibold">Model:</span>
            <select
              value={modelFilter}
              onChange={(e) => handleModelChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[var(--text-title)] outline-none cursor-pointer max-w-[140px] truncate"
            >
              <option value="all" className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                All Models
              </option>
              {modelsList.map((m) => (
                <option key={m.value} value={m.value} className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 flex items-center justify-between text-xs">
          <span>Failed to load request logs: {error}</span>
          <button
            onClick={fetchLogs}
            className="px-3 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Inset Grouped Table Container */}
      <div className="ios-glass-card rounded-[1.75rem] border border-black/10 dark:border-white/10 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-vibrant-secondary font-semibold uppercase tracking-wider text-[10px]">
                <th className="px-5 py-3.5">Time</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Model & Upstream</th>
                <th className="px-5 py-3.5 text-right">Tokens (Prompt / Cache / Comp)</th>
                <th className="px-5 py-3.5 text-right">Latency</th>
                <th className="px-5 py-3.5 text-right">Cost</th>
                <th className="px-5 py-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/10">
              {loading && !logsData ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="px-5 py-4">
                      <div className="h-4 bg-black/5 dark:bg-white/5 rounded-md w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-vibrant-secondary text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ScrollText size={28} className="opacity-40" />
                      <span className="font-semibold text-sm text-[var(--text-title)]">No requests found</span>
                      <span className="text-xs max-w-sm">
                        No request telemetry logged matching the active filters or time period.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const isOk = row.status === 'ok' || (row.http_status >= 200 && row.http_status < 300);
                  const is429 = row.status === '429' || row.http_status === 429;
                  const prompt = Number(row.prompt_tokens || row.promptTokens || 0);
                  const cached = Number(row.cached_tokens || row.cachedTokens || 0);
                  const comp = Number(row.completion_tokens || row.completionTokens || 0);
                  const cost = row.cost_consumer_usdc || row.costUsdc || row.cost || 0;

                  return (
                    <tr
                      key={row.id || idx}
                      onClick={() => setSelectedRequest(row)}
                      className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      {/* Time */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="font-semibold text-[var(--text-title)]">
                          {formatRelativeTime(row.ts)}
                        </div>
                        <div className="text-[10px] text-vibrant-secondary font-mono">
                          {fmtTs(row.ts)}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            isOk
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                              : is429
                              ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isOk ? 'bg-emerald-500' : is429 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                          />
                          <span>{row.http_status || (isOk ? '200 OK' : '500')}</span>
                        </span>
                      </td>

                      {/* Model & Upstream */}
                      <td className="px-5 py-3.5 max-w-[200px] truncate">
                        <div className="font-mono font-bold text-xs text-[var(--text-title)] truncate">
                          {row.model || 'unknown'}
                        </div>
                        <div className="text-[10px] text-vibrant-secondary font-mono flex items-center gap-1.5 mt-0.5">
                          <span className="px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 text-zinc-500">
                            {row.upstream_label || row.upstream || 'direct'}
                          </span>
                          {row.id && (
                            <span className="text-[10px] text-zinc-400 font-mono truncate">
                              {row.id}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tokens */}
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 text-xs">
                          <span className="text-sky-600 dark:text-sky-400 font-semibold" title="Prompt Tokens">
                            {formatTokens(prompt)}
                          </span>
                          {cached > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30"
                              title={`Cached: ${cached.toLocaleString()} tokens`}
                            >
                              <Zap size={10} />
                              <span>{formatTokens(cached)}</span>
                            </span>
                          )}
                          <span className="text-zinc-400">/</span>
                          <span className="text-pink-600 dark:text-pink-400 font-semibold" title="Completion Tokens">
                            {formatTokens(comp)}
                          </span>
                        </div>
                      </td>

                      {/* Latency */}
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="text-xs font-semibold text-[var(--text-title)]">
                          {row.ttft_ms != null ? `${row.ttft_ms} ms TTFT` : '—'}
                        </div>
                        <div className="text-[10px] text-vibrant-secondary">
                          {row.duration_ms != null
                            ? row.duration_ms >= 1000
                              ? `${(row.duration_ms / 1000).toFixed(2)}s total`
                              : `${row.duration_ms} ms total`
                            : '—'}
                        </div>
                      </td>

                      {/* Cost */}
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {fmtUsdMicro(cost)}
                      </td>

                      {/* Action */}
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRequest(row);
                          }}
                          className="ios-icon-btn p-1.5 rounded-lg hover:bg-sky-500/15 text-zinc-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
                          title="Inspect request details"
                          aria-label="Inspect request details"
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer & Pagination Controls */}
        <div className="p-4 border-t border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3 text-vibrant-secondary font-mono text-[11px]">
            <span>
              {totalRecords.toLocaleString()} {totalRecords === 1 ? 'request' : 'total requests'}
            </span>
            {totalCost && (
              <>
                <span>•</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  Total spend: {fmtUsdMicro(totalCost)}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Page Size Dropdown */}
            <div className="flex items-center gap-1.5 text-vibrant-secondary text-xs">
              <select
                aria-label="Requests per page"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1 text-xs text-[var(--text-title)] outline-none cursor-pointer"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size} className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                    {size} / page
                  </option>
                ))}
              </select>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="ios-icon-btn p-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-black/10 dark:hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="px-2 font-mono text-[11px] text-[var(--text-title)]">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="ios-icon-btn p-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-black/10 dark:hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
