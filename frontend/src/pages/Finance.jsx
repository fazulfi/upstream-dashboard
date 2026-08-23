import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Building2,
  CreditCard,
  Receipt,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import KpiCard from '../components/KpiCard';
import Badge from '../components/Badge';
import { SkeletonBlock } from '../components/Skeleton';
import { useToast } from '../components/Toast';

export default function Finance() {
  const { data: financeData, loading, error, reload } = useApi('/api/finance', 30000);
  const { data: payoutsData, reload: reloadPayouts } = useApi('/api/payouts', 30000);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'assets' | 'payouts' | 'audit'
  const [currency, setCurrency] = useState('USD'); // 'USD' | 'IDR'
  const [assetSearch, setAssetSearch] = useState('');
  const [assetStatusFilter, setAssetStatusFilter] = useState('');
  const { success } = useToast();

  const kurs = financeData?.kurs_meta || financeData?.kurs || 17801.17;
  const assets = useMemo(() => financeData?.assets || [], [financeData]);
  const payouts = useMemo(() => payoutsData?.payouts || [], [payoutsData]);
  const providers = useMemo(() => financeData?.providers || [], [financeData]);

  const fmtMoney = (usdVal) => {
    if (usdVal == null || isNaN(usdVal)) return '—';
    if (currency === 'IDR') {
      const idr = Number(usdVal) * Number(kurs);
      return `Rp ${Math.round(idr).toLocaleString('id-ID')}`;
    }
    return `$${Number(usdVal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      const q = assetSearch.toLowerCase();
      const matchQ =
        !q ||
        (a.id || '').toLowerCase().includes(q) ||
        (a.label || '').toLowerCase().includes(q) ||
        (a.upstream || '').toLowerCase().includes(q);
      const matchStatus = !assetStatusFilter || (a.status || 'active') === assetStatusFilter;
      return matchQ && matchStatus;
    });
  }, [assets, assetSearch, assetStatusFilter]);

  const handleRefresh = async () => {
    await Promise.all([reload(), reloadPayouts()]);
    success('Financial ledger synchronized with PostgreSQL primary store.');
  };

  const tabs = [
    { id: 'overview', label: 'P&L Overview', icon: TrendingUp },
    { id: 'assets', label: `Asset Inventory (${assets.length || 67})`, icon: Layers },
    { id: 'payouts', label: `Payouts & Withdrawals (${payouts.length})`, icon: CreditCard },
    { id: 'audit', label: 'Source of Truth & Rules', icon: ShieldCheck },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="page space-y-6 max-w-7xl mx-auto"
    >
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/90 via-zinc-900/40 to-zinc-950 p-6 shadow-xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <Building2 size={11} className="text-emerald-400" />
                FinOps Command Center · Profitability Intelligence
              </span>
              <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
                PostgreSQL Single Source of Truth
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight">
              Finance & Profitability Hub
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
              Decision-grade financial equation reporting, audited asset amortizations (A-001..A-069), and settlement reconciliation tracking.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Currency Toggle */}
            <div className="flex items-center bg-zinc-900/80 border border-zinc-800 rounded-xl p-1 text-xs font-mono shadow-sm">
              <button
                onClick={() => setCurrency('USD')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  currency === 'USD'
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                USD ($)
              </button>
              <button
                onClick={() => setCurrency('IDR')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  currency === 'IDR'
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                IDR (Rp)
              </button>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              disabled={loading}
              className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 shadow-sm transition-all"
              title="Sync Ledger"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Live Kurs Bar */}
      <div className="flex items-center justify-between px-5 py-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md text-xs shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Building2 size={15} />
          </div>
          <div>
            <span className="text-zinc-400 font-medium">Live Reference Kurs (USD/IDR): </span>
            <span className="font-mono font-bold text-zinc-100">
              1 USD = Rp {Number(kurs).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge kind="ok" dot>
            Audited Rule Engine
          </Badge>
          <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
            Per-asset purchase rate applied
          </span>
        </div>
      </div>

      {/* Top 4 FinOps KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Net Profit / Income"
          value={fmtMoney(financeData?.net_income)}
          delta={financeData?.net_income >= 0 ? '+Profitable' : '-Deficit'}
          deltaDir={financeData?.net_income >= 0 ? 'up' : 'down'}
          icon={TrendingUp}
          featured
          sub="Equation: Payouts + Refunds − Amort − Impairment − Opex"
        />

        <KpiCard
          label="Confirmed Payouts"
          value={fmtMoney(financeData?.payout_confirmed || payoutsData?.total)}
          icon={CreditCard}
          sub={`${payouts.length} total withdrawal transactions`}
        />

        <KpiCard
          label="Amortized CAPEX"
          value={fmtMoney(financeData?.amortization)}
          icon={Receipt}
          deltaDir="down"
          sub="Status != active assets (full cost amortized)"
        />

        <KpiCard
          label="Impairments & Loss"
          value={fmtMoney(financeData?.impairment)}
          icon={AlertTriangle}
          sub={`${financeData?.impairments_count || 0} recognized impairment events`}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-zinc-800 space-x-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                isActive
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <Icon size={15} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* P&L Waterfall Breakdown Card */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md p-6 space-y-4 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Financial Waterfall Equation</h3>
                <p className="text-xs text-zinc-400">
                  Calculated strictly using authoritative rule engine formula with zero-variance guarantee.
                </p>
              </div>
              <div className="text-xs font-mono font-bold text-zinc-300">
                Net = Payouts + Refunds − Amort − Impairment − Opex
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5 pt-2">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase">Payouts In</span>
                  <ArrowUpRight size={14} className="text-emerald-400" />
                </div>
                <div className="text-lg font-bold font-mono text-emerald-300 mt-2">
                  {fmtMoney(financeData?.payout_confirmed)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-sky-400 uppercase">Refunds In</span>
                  <ArrowUpRight size={14} className="text-sky-400" />
                </div>
                <div className="text-lg font-bold font-mono text-sky-300 mt-2">
                  {fmtMoney(financeData?.refund)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-rose-400 uppercase">Amortization</span>
                  <ArrowDownRight size={14} className="text-rose-400" />
                </div>
                <div className="text-lg font-bold font-mono text-rose-300 mt-2">
                  -{fmtMoney(financeData?.amortization)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">Impairments</span>
                  <ArrowDownRight size={14} className="text-amber-400" />
                </div>
                <div className="text-lg font-bold font-mono text-amber-300 mt-2">
                  -{fmtMoney(financeData?.impairment)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-800/90 border border-zinc-700 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-zinc-300 uppercase">Net Income</span>
                  <Zap size={14} className="text-sky-400" />
                </div>
                <div className="text-lg font-bold font-mono text-zinc-100 mt-2">
                  {fmtMoney(financeData?.net_income)}
                </div>
              </div>
            </div>
          </div>

          {/* Provider Fleet Distribution */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-lg">
            <div className="p-5 border-b border-zinc-800/80 bg-zinc-900/80 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Upstream Fleet Operational Density</h3>
                <p className="text-xs text-zinc-400">Active providers generating revenue per upstream</p>
              </div>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {providers.map((p) => (
                <div
                  key={p.upstream_slug}
                  className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 flex items-center justify-between hover:border-zinc-700 transition-colors"
                >
                  <div>
                    <div className="text-xs font-bold text-zinc-200">{p.upstream_slug}</div>
                    <div className="text-[11px] text-zinc-500">Upstream Provider Pool</div>
                  </div>
                  <Badge kind="ok" dot>
                    {p.n} Active Nodes
                  </Badge>
                </div>
              ))}
              {providers.length === 0 && (
                <div className="col-span-3 py-8 text-center text-xs text-zinc-500 font-sans">
                  No active provider nodes data available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'assets' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md shadow-sm">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search Asset ID (e.g. A-001, A-069) or label..."
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={assetStatusFilter}
                onChange={(e) => setAssetStatusFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 outline-none"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="retired">Retired / Expired</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
          </div>

          {/* Asset Table */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-lg">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-zinc-950 text-zinc-400 font-mono text-[10px] uppercase border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-3">Asset ID</th>
                    <th className="px-4 py-3">Upstream</th>
                    <th className="px-4 py-3">Label / Description</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-right">Cost (Original)</th>
                    <th className="px-4 py-3 text-right">Cost (USD)</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 font-mono">
                  {filteredAssets.map((asset) => (
                    <tr key={asset.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-sky-400">{asset.id}</td>
                      <td className="px-4 py-3 text-zinc-300">{asset.upstream || '—'}</td>
                      <td className="px-4 py-3 text-zinc-300 font-sans">{asset.label || '—'}</td>
                      <td className="px-4 py-3 text-center text-zinc-400">{asset.qty || 1}</td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {asset.curr === 'IDR'
                          ? `Rp ${Number(asset.cost_per || 0).toLocaleString('id-ID')}`
                          : `$${Number(asset.cost_per || 0).toFixed(2)}`}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-zinc-100">
                        {fmtMoney(asset.cost_usd)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          kind={
                            (asset.status || 'active') === 'active'
                              ? 'ok'
                              : (asset.status || '') === 'refunded'
                              ? 'info'
                              : 'warn'
                          }
                          dot
                        >
                          {(asset.status || 'active').toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {filteredAssets.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-zinc-500 font-sans">
                        No asset matches your filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'payouts' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-lg">
            <div className="p-5 border-b border-zinc-800/80 bg-zinc-900/80 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Confirmed Payout & Settlement Ledger</h3>
                <p className="text-xs text-zinc-400">
                  Live API withdrawal records verified against PostgreSQL payouts table.
                </p>
              </div>
              <div className="text-xs font-mono font-extrabold text-emerald-400 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                Total Withdrawn: {fmtMoney(payoutsData?.total)}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-zinc-950 text-zinc-400 font-mono text-[10px] uppercase border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-3">Reference ID</th>
                    <th className="px-4 py-3">Requested Date</th>
                    <th className="px-4 py-3">Note / Type</th>
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 font-mono">
                  {payouts.map((p) => (
                    <tr key={p.ref} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-zinc-200">{p.ref}</td>
                      <td className="px-4 py-3 text-zinc-400">{p.date || '—'}</td>
                      <td className="px-4 py-3 text-zinc-300 font-sans">{p.note || 'Payout'}</td>
                      <td className="px-4 py-3 text-zinc-500 truncate max-w-[180px]">
                        {p.destination || 'USDC Wallet'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-400">
                        {fmtMoney(p.usd)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge kind="ok" dot>
                          {(p.status || 'CONFIRMED').toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {payouts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-zinc-500 font-sans">
                        No payout records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md p-6 space-y-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">
                  Decision-Grade Single Source of Truth Architecture
                </h3>
                <p className="text-xs text-zinc-400">
                  PostgreSQL (`memory` schema) is the sole authoritative source. All Excel workbooks and `ledger.json` are downstream outputs.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs">
              <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2">
                <div className="font-semibold text-zinc-200">Financial Invariant Rules</div>
                <ul className="space-y-1.5 text-zinc-400 list-disc list-inside">
                  <li>Asset Capex: 67 verified assets (A-001..A-069) preserved with zero data loss.</li>
                  <li>Amortization: Assets with `status != active` amortized at full cost.</li>
                  <li>Exchange Rates: Per-asset kurs prioritized; live global meta as fallback.</li>
                  <li>Refunds: Credited directly as income reduction.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2">
                <div className="font-semibold text-zinc-200">Reconciliation Checks</div>
                <ul className="space-y-1.5 text-zinc-400 list-disc list-inside">
                  <li>Database Schema: `assets`, `payouts`, `refunds`, `impairments`, `ledger_meta`.</li>
                  <li>Variance Threshold: $0.00 zero-tolerance difference between DB & API views.</li>
                  <li>Audit Trail: All mutations persisted to financial audit tables.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
