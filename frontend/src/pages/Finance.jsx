import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  CreditCard,
  RefreshCw,
  Search,
  Building2,
  Receipt,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import KpiCard from '../components/KpiCard';
import Badge from '../components/Badge';
import { useToast } from '../components/Toast';

export default function Finance() {
  const { data: financeData, loading, reload } = useApi('/api/finance', 30000);
  const { data: payoutsData, reload: reloadPayouts } = useApi('/api/payouts', 30000);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'assets' | 'payouts'
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
    success('Data finansial berhasil diperbarui.');
  };

  const tabs = [
    { id: 'overview', label: 'Ringkasan P&L', icon: TrendingUp },
    { id: 'assets', label: `Asset Inventory (${assets.length || 67})`, icon: Layers },
    { id: 'payouts', label: `Payouts & Withdrawals (${payouts.length})`, icon: CreditCard },
  ];

  return (
    <div className="page space-y-6 max-w-7xl mx-auto pb-12 font-sans transition-colors">
      {/* ── 1. Top Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/10 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
              <Wallet size={13} />
              Finansial & Pendapatan
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Realtime Ledger</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Finance & Profitability
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 max-w-2xl">
            Pantau pendapatan publisher, saldo penarikan dana, dan inventaris pengeluaran aset.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Currency Switcher */}
          <div className="flex items-center bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-1 text-xs font-mono shadow-sm">
            <button
              onClick={() => setCurrency('USD')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                currency === 'USD'
                  ? 'ios-pill-active font-extrabold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              USD ($)
            </button>
            <button
              onClick={() => setCurrency('IDR')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                currency === 'IDR'
                  ? 'ios-pill-active font-extrabold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              IDR (Rp)
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2.5 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors shadow-sm cursor-pointer"
            title="Refresh data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── 2. Kurs Banner ── */}
      <div className="ios-glass-card flex items-center justify-between px-5 py-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="text-zinc-600 dark:text-zinc-400">Kurs Referensi (USD/IDR):</span>
          <span className="font-mono font-bold text-zinc-900 dark:text-white">
            1 USD = Rp {Number(kurs).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
          </span>
        </div>
        <span className="text-xs text-zinc-500 font-mono">Auto-Sync</span>
      </div>

      {/* ── 3. 4 Clean FinOps Metric Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Laba Bersih (Net Profit)"
          value={fmtMoney(financeData?.net_income)}
          delta={financeData?.net_income >= 0 ? '+Laba' : '-Defisit'}
          deltaDir={financeData?.net_income >= 0 ? 'up' : 'down'}
          icon={TrendingUp}
          featured
          sub="Total Pendapatan − Biaya"
        />

        <KpiCard
          label="Total Penarikan"
          value={fmtMoney(financeData?.payout_confirmed || payoutsData?.total)}
          icon={CreditCard}
          sub={`${payouts.length} transaksi selesai`}
        />

        <KpiCard
          label="Biaya Aset (CAPEX)"
          value={fmtMoney(financeData?.amortization)}
          icon={Receipt}
          deltaDir="down"
          sub="Amortisasi server & lisensi"
        />

        <KpiCard
          label="Impairment / Rugi"
          value={fmtMoney(financeData?.impairment)}
          icon={TrendingDown}
          sub={`${financeData?.impairments_count || 0} kejadian tercatat`}
        />
      </div>

      {/* ── 4. Tab Navigation ── */}
      <div className="flex items-center gap-2 border-b border-black/10 dark:border-white/10 pb-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                isActive
                  ? 'ios-pill-active'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-sky-500' : 'opacity-70'} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── 5. Tab Content ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Breakdown Table */}
          <div className="ios-glass-card p-6 space-y-5">
            <div className="border-b border-black/10 dark:border-white/10 pb-3">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Rincian Arus Kas & Pendapatan</h2>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">
                Kalkulasi penerimaan dana dari publisher InferHub terhadap biaya operasional.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-black/5 dark:bg-black/50 border border-black/10 dark:border-white/10">
                <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                  <span>DANA MASUK (PAYOUTS)</span>
                  <ArrowUpRight size={16} />
                </div>
                <div className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-300 mt-2">
                  {fmtMoney(financeData?.payout_confirmed)}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Saldo yang telah ditarik</div>
              </div>

              <div className="p-5 rounded-2xl bg-black/5 dark:bg-black/50 border border-black/10 dark:border-white/10">
                <div className="flex items-center justify-between text-xs text-rose-600 dark:text-rose-400 font-mono font-bold">
                  <span>BIAYA ASET & CAPEX</span>
                  <ArrowDownRight size={16} />
                </div>
                <div className="text-2xl font-extrabold font-mono text-rose-600 dark:text-rose-300 mt-2">
                  -{fmtMoney(financeData?.amortization)}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Biaya server & akun</div>
              </div>

              <div className="p-5 rounded-2xl bg-black/5 dark:bg-black/50 border border-black/10 dark:border-white/10 shadow-md">
                <div className="flex items-center justify-between text-xs text-sky-600 dark:text-sky-400 font-mono font-bold">
                  <span>LABA BERSIH AKHIR</span>
                  <Zap size={16} />
                </div>
                <div className="text-2xl font-extrabold font-mono text-zinc-900 dark:text-white mt-2">
                  {fmtMoney(financeData?.net_income)}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Laba bersih operasional</div>
              </div>
            </div>
          </div>

          {/* Active Nodes per Upstream */}
          <div className="ios-glass-card overflow-hidden">
            <div className="p-5 border-b border-black/10 dark:border-white/10">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Distribusi Node Upstream</h2>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">Jumlah node aktif per upstream provider</p>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map((p) => (
                <div
                  key={p.upstream_slug}
                  className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/40 flex items-center justify-between hover:border-black/20 dark:hover:border-white/20 transition-colors"
                >
                  <div>
                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{p.upstream_slug}</div>
                    <div className="text-xs text-zinc-500">Upstream Provider</div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    {p.n} Node Aktif
                  </span>
                </div>
              ))}
              {providers.length === 0 && (
                <div className="col-span-3 py-8 text-center text-sm text-zinc-500">
                  Tidak ada data node provider.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'assets' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="ios-glass-card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Cari Asset ID (A-001...) atau nama..."
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                className="w-full bg-white/80 dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-zinc-900 dark:text-white placeholder-zinc-400 outline-none focus:border-sky-500 font-mono shadow-inner"
              />
            </div>

            <select
              value={assetStatusFilter}
              onChange={(e) => setAssetStatusFilter(e.target.value)}
              className="bg-white/80 dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 outline-none cursor-pointer"
            >
              <option value="">Semua Status</option>
              <option value="active">Active</option>
              <option value="retired">Retired</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          {/* Asset Table */}
          <div className="ios-glass-card overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs sm:text-sm border-collapse font-mono">
                <thead className="sticky top-0 bg-[var(--table-header-bg)] text-zinc-600 dark:text-zinc-400 text-xs uppercase border-b border-black/10 dark:border-white/10 font-sans backdrop-blur-xl">
                  <tr>
                    <th className="px-5 py-3.5">Asset ID</th>
                    <th className="px-5 py-3.5">Provider</th>
                    <th className="px-5 py-3.5">Deskripsi</th>
                    <th className="px-5 py-3.5 text-center">Qty</th>
                    <th className="px-5 py-3.5 text-right">Biaya Asli</th>
                    <th className="px-5 py-3.5 text-right">Biaya (USD)</th>
                    <th className="px-5 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/10">
                  {filteredAssets.map((asset) => (
                    <tr key={asset.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3 font-bold text-sky-600 dark:text-sky-400">{asset.id}</td>
                      <td className="px-5 py-3 text-zinc-700 dark:text-zinc-300">{asset.upstream || '—'}</td>
                      <td className="px-5 py-3 text-zinc-800 dark:text-zinc-200 font-sans">{asset.label || '—'}</td>
                      <td className="px-5 py-3 text-center text-zinc-500 dark:text-zinc-400">{asset.qty || 1}</td>
                      <td className="px-5 py-3 text-right text-zinc-700 dark:text-zinc-300">
                        {asset.curr === 'IDR'
                          ? `Rp ${Number(asset.cost_per || 0).toLocaleString('id-ID')}`
                          : `$${Number(asset.cost_per || 0).toFixed(2)}`}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-zinc-900 dark:text-white">
                        {fmtMoney(asset.cost_usd)}
                      </td>
                      <td className="px-5 py-3 font-sans">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            (asset.status || 'active') === 'active'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                              : (asset.status || '') === 'refunded'
                              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30'
                              : 'bg-black/10 dark:bg-white/10 text-zinc-600 dark:text-zinc-300'
                          }`}
                        >
                          {(asset.status || 'active').toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredAssets.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-500 font-sans text-sm">
                        Tidak ada aset yang sesuai filter.
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
        <div className="ios-glass-card overflow-hidden">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs sm:text-sm border-collapse font-mono">
              <thead className="sticky top-0 bg-[var(--table-header-bg)] text-zinc-600 dark:text-zinc-400 text-xs uppercase border-b border-black/10 dark:border-white/10 font-sans backdrop-blur-xl">
                <tr>
                  <th className="px-5 py-3.5">ID Transaksi</th>
                  <th className="px-5 py-3.5">Tanggal</th>
                  <th className="px-5 py-3.5">Catatan</th>
                  <th className="px-5 py-3.5 text-right">Jumlah</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {payouts.map((p, idx) => (
                  <tr key={p.ref || idx} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 font-bold text-sky-600 dark:text-sky-400">{p.ref || `payout-${idx + 1}`}</td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{p.date || '—'}</td>
                    <td className="px-5 py-3 text-zinc-800 dark:text-zinc-200 font-sans">{p.note || 'Payout settled'}</td>
                    <td className="px-5 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {fmtMoney(p.usd)}
                    </td>
                    <td className="px-5 py-3 font-sans">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        {(p.status || 'CONFIRMED').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-zinc-500 font-sans text-sm">
                      Belum ada catatan transaksi penarikan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
