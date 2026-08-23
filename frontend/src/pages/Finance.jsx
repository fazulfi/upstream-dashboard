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
    <div className="page space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── 1. Top Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Wallet size={11} />
              Finansial & Pendapatan
            </span>
            <span className="text-xs text-zinc-500 font-mono">Realtime Ledger</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
            Finance & Profitability
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Pantau pendapatan publisher, saldo penarikan dana, dan inventaris pengeluaran aset.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Currency Switcher */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 text-xs font-mono">
            <button
              onClick={() => setCurrency('USD')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                currency === 'USD'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              USD ($)
            </button>
            <button
              onClick={() => setCurrency('IDR')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                currency === 'IDR'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              IDR (Rp)
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors shadow-sm cursor-pointer"
            title="Refresh data"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── 2. Kurs Banner ── */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="text-zinc-400">Kurs Referensi (USD/IDR):</span>
          <span className="font-mono font-bold text-zinc-100">
            1 USD = Rp {Number(kurs).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
          </span>
        </div>
        <span className="text-[11px] text-zinc-500 font-mono">Auto-Sync</span>
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
      <div className="flex items-center gap-1.5 border-b border-zinc-800/80 pb-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-sky-400' : 'text-zinc-500'} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── 5. Tab Content ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Breakdown Table */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-md p-5 space-y-4 shadow-lg">
            <div className="border-b border-zinc-800/80 pb-3">
              <h2 className="text-sm font-bold text-zinc-100">Rincian Arus Kas & Pendapatan</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Kalkulasi penerimaan dana dari publisher InferHub terhadap biaya operasional.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="flex items-center justify-between text-xs text-emerald-400 font-mono font-bold">
                  <span>DANA MASUK (PAYOUTS)</span>
                  <ArrowUpRight size={15} />
                </div>
                <div className="text-xl font-extrabold font-mono text-emerald-300 mt-2">
                  {fmtMoney(financeData?.payout_confirmed)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Saldo yang telah ditarik</div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="flex items-center justify-between text-xs text-rose-400 font-mono font-bold">
                  <span>BIAYA ASET & CAPEX</span>
                  <ArrowDownRight size={15} />
                </div>
                <div className="text-xl font-extrabold font-mono text-rose-300 mt-2">
                  -{fmtMoney(financeData?.amortization)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Biaya server & akun</div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-700 shadow-md">
                <div className="flex items-center justify-between text-xs text-sky-400 font-mono font-bold">
                  <span>LABA BERSIH AKHIR</span>
                  <Zap size={15} />
                </div>
                <div className="text-xl font-extrabold font-mono text-zinc-100 mt-2">
                  {fmtMoney(financeData?.net_income)}
                </div>
                <div className="text-[11px] text-zinc-400 mt-1">Laba bersih operasional</div>
              </div>
            </div>
          </div>

          {/* Active Nodes per Upstream */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-md overflow-hidden shadow-lg">
            <div className="p-4 sm:p-5 border-b border-zinc-800/80 bg-zinc-900/60">
              <h2 className="text-sm font-bold text-zinc-100">Distribusi Node Upstream</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Jumlah node aktif per upstream provider</p>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {providers.map((p) => (
                <div
                  key={p.upstream_slug}
                  className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 flex items-center justify-between hover:border-zinc-700 transition-colors"
                >
                  <div>
                    <div className="text-xs font-bold text-zinc-200">{p.upstream_slug}</div>
                    <div className="text-[11px] text-zinc-500">Upstream Provider</div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {p.n} Node Aktif
                  </span>
                </div>
              ))}
              {providers.length === 0 && (
                <div className="col-span-3 py-6 text-center text-xs text-zinc-500">
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
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 shadow-sm">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Cari Asset ID (A-001...) atau nama..."
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-sky-500 font-mono"
              />
            </div>

            <select
              value={assetStatusFilter}
              onChange={(e) => setAssetStatusFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-300 outline-none cursor-pointer"
            >
              <option value="">Semua Status</option>
              <option value="active">Active</option>
              <option value="retired">Retired</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          {/* Asset Table */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-md overflow-hidden shadow-lg">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="sticky top-0 bg-zinc-950 text-zinc-400 text-[10px] uppercase border-b border-zinc-800 font-sans">
                  <tr>
                    <th className="px-4 py-3">Asset ID</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Deskripsi</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-right">Biaya Asli</th>
                    <th className="px-4 py-3 text-right">Biaya (USD)</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
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
                      <td className="px-4 py-3 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            (asset.status || 'active') === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : (asset.status || '') === 'refunded'
                              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          {(asset.status || 'active').toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredAssets.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-500 font-sans">
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
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-md overflow-hidden shadow-lg">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="sticky top-0 bg-zinc-950 text-zinc-400 text-[10px] uppercase border-b border-zinc-800 font-sans">
                <tr>
                  <th className="px-4 py-3">ID Transaksi</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Catatan</th>
                  <th className="px-4 py-3 text-right">Jumlah</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {payouts.map((p, idx) => (
                  <tr key={p.ref || idx} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 font-bold text-sky-400">{p.ref || `payout-${idx + 1}`}</td>
                    <td className="px-4 py-3 text-zinc-400">{p.date || '—'}</td>
                    <td className="px-4 py-3 text-zinc-300 font-sans">{p.note || 'Payout settled'}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400">
                      {fmtMoney(p.usd)}
                    </td>
                    <td className="px-4 py-3 font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {(p.status || 'CONFIRMED').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500 font-sans">
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
