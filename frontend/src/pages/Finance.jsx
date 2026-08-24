import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  ArrowRightLeft,
  KeyRound,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch, useApi } from '../hooks/useApi';
import KpiCard from '../components/KpiCard';
import Badge from '../components/Badge';
import { useToast } from '../components/Toast';
import { SkeletonBlock, SkeletonCard } from '../components/Skeleton';

export default function Finance() {
  const { data: financeData, loading, reload } = useApi('/api/finance', 30000);
  const { data: payoutsData, reload: reloadPayouts } = useApi('/api/payouts', 30000);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'assets' | 'payouts'
  const [currency, setCurrency] = useState('USD'); // 'USD' | 'IDR'
  const [assetSearch, setAssetSearch] = useState('');
  const [assetStatusFilter, setAssetStatusFilter] = useState('');
  const { success, error: toastError } = useToast();

  // Transfer Modal State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState(null);

  // Payout Modal State (2-Step OTP)
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [payoutStep, setPayoutStep] = useState(1);
  const [payoutDest, setPayoutDest] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutOtp, setPayoutOtp] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState(null);
  const kurs = useMemo(() => {
    if (typeof financeData?.kurs === 'number' && !isNaN(financeData.kurs)) return financeData.kurs;
    if (typeof financeData?.kurs_meta === 'number' && !isNaN(financeData.kurs_meta)) return financeData.kurs_meta;
    if (financeData?.kurs_meta && typeof financeData.kurs_meta === 'object') {
      const val = financeData.kurs_meta.kurs_usd_idr || financeData.kurs_meta.kurs_ref_usd_idr || Object.values(financeData.kurs_meta)[0];
      if (Number(val) > 0) return Number(val);
    }
    if (financeData?.kurs && typeof financeData.kurs === 'object') {
      const val = financeData.kurs.kurs_usd_idr || financeData.kurs.kurs_ref_usd_idr || Object.values(financeData.kurs)[0];
      if (Number(val) > 0) return Number(val);
    }
    return 17801.17;
  }, [financeData]);
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

  const availableEarnings = Math.max(Number(financeData?.net_income ?? financeData?.earnings ?? 0), 0);

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    const amt = Number(transferAmount);
    if (isNaN(amt) || amt <= 0) {
      setTransferError('Nominal transfer harus lebih dari 0.');
      toastError('Nominal transfer harus lebih dari 0.');
      return;
    }
    setTransferLoading(true);
    setTransferError(null);
    try {
      const res = await apiFetch('/api/publisher/earnings/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Transfer gagal diproses.');
      }
      success(`Berhasil transfer $${amt.toFixed(2)} ke saldo consumer.`);
      setIsTransferOpen(false);
      setTransferAmount('');
      handleRefresh();
    } catch (err) {
      setTransferError(err.message || 'Transfer gagal');
      toastError(err.message || 'Transfer gagal');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleRequestOtp = async (e) => {
    e?.preventDefault();
    const amt = Number(payoutAmount);
    if (!payoutDest.trim()) {
      setPayoutError('Alamat destinasi penarikan wajib diisi.');
      toastError('Alamat destinasi penarikan wajib diisi.');
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setPayoutError('Nominal penarikan harus lebih dari 0.');
      toastError('Nominal penarikan harus lebih dari 0.');
      return;
    }
    setPayoutLoading(true);
    setPayoutError(null);
    try {
      const res = await apiFetch('/api/publisher/withdrawals/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: payoutDest.trim(), amount: amt }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Gagal meminta kode OTP.');
      }
      success('Kode OTP verifikasi telah dikirimkan.');
      setPayoutStep(2);
    } catch (err) {
      setPayoutError(err.message || 'Gagal meminta kode OTP');
      toastError(err.message || 'Gagal meminta kode OTP');
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleConfirmWithdrawal = async (e) => {
    e.preventDefault();
    if (!payoutOtp.trim() || payoutOtp.trim().length < 4) {
      setPayoutError('Masukkan kode OTP yang valid.');
      toastError('Masukkan kode OTP yang valid.');
      return;
    }
    setPayoutLoading(true);
    setPayoutError(null);
    try {
      const res = await apiFetch('/api/publisher/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: payoutDest.trim(),
          amount: Number(payoutAmount),
          otp: payoutOtp.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Verifikasi OTP gagal atau penarikan ditolak.');
      }
      success(`Penarikan dana $${Number(payoutAmount).toFixed(2)} berhasil diproses.`);
      setIsPayoutOpen(false);
      setPayoutStep(1);
      setPayoutDest('');
      setPayoutAmount('');
      setPayoutOtp('');
      handleRefresh();
    } catch (err) {
      setPayoutError(err.message || 'Verifikasi OTP gagal');
      toastError(err.message || 'Verifikasi OTP gagal');
    } finally {
      setPayoutLoading(false);
    }
  };

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
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
              <Wallet size={13} />
              Finansial & Pendapatan
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Realtime Ledger</span>
          </div>
          <h1 className="text-3xl sm:text-[34px] font-extrabold tracking-tight leading-tight text-zinc-900 dark:text-white">
            Finance & Profitability
          </h1>
          <p className="text-[15px] text-zinc-600 dark:text-zinc-300 mt-1 max-w-2xl leading-relaxed">
            Pantau pendapatan publisher, saldo penarikan dana, dan inventaris pengeluaran aset.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Action Buttons (R2 & R5) */}
          <button
            onClick={() => {
              setIsTransferOpen(true);
              setTransferError(null);
            }}
            className="ios-btn-glass px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
            data-testid="btn-open-transfer"
          >
            <ArrowRightLeft size={15} />
            <span>Transfer ke Consumer</span>
          </button>

          <button
            onClick={() => {
              setIsPayoutOpen(true);
              setPayoutStep(1);
              setPayoutError(null);
            }}
            className="ios-btn-primary px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
            data-testid="btn-open-payout"
          >
            <CreditCard size={15} />
            <span>Tarik Dana / Payout</span>
          </button>

          {/* Currency Switcher (Apple Segmented Control) */}
          <div className="ios-segmented-control">
            <button
              onClick={() => setCurrency('USD')}
              className={`ios-segment ${currency === 'USD' ? 'active' : ''}`}
            >
              USD ($)
            </button>
            <button
              onClick={() => setCurrency('IDR')}
              className={`ios-segment ${currency === 'IDR' ? 'active' : ''}`}
            >
              IDR (Rp)
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="ios-btn-glass p-2.5 rounded-2xl shadow-sm cursor-pointer"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {loading || !financeData ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
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
              deltaDir="down"
              sub={`${financeData?.impairments_count || 0} kejadian tercatat`}
            />
          </>
        )}
      </div>

      {/* ── 4. Tab Navigation (Apple Segmented Control) ── */}
      <div className="flex justify-center border-b border-black/10 dark:border-white/10 pb-4">
        <div className="ios-segmented-control shadow-sm">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`ios-segment flex items-center gap-1.5 ${isActive ? 'active' : 'opacity-70 hover:opacity-100'}`}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
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
              <div className="p-5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                <div className="flex items-center justify-between text-xs text-sky-700 dark:text-sky-400 font-mono font-bold">
                  <span>DANA MASUK (PAYOUTS)</span>
                  <ArrowUpRight size={16} />
                </div>
                <div className="text-2xl font-extrabold font-mono text-sky-700 dark:text-sky-300 mt-2">
                  {fmtMoney(financeData?.payout_confirmed)}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Saldo yang telah ditarik</div>
              </div>

              <div className="p-5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                <div className="flex items-center justify-between text-xs text-rose-700 dark:text-rose-400 font-mono font-bold">
                  <span>BIAYA ASET & CAPEX</span>
                  <ArrowDownRight size={16} />
                </div>
                <div className="text-2xl font-extrabold font-mono text-rose-700 dark:text-rose-300 mt-2">
                  -{fmtMoney(financeData?.amortization)}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Biaya server & akun</div>
              </div>

              <div className="p-5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                <div className="flex items-center justify-between text-xs text-sky-700 dark:text-sky-400 font-mono font-bold">
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
                  className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center justify-between hover:border-black/20 dark:hover:border-white/20 transition-colors shadow-sm"
                >
                  <div>
                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{p.upstream_slug}</div>
                    <div className="text-xs text-zinc-500">Upstream Provider</div>
                  </div>
                  <span className="ios-badge px-3 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
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
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-[var(--text-title)] placeholder-zinc-400 outline-none focus:border-sky-500 font-mono shadow-inner"
              />
            </div>

            <select
              value={assetStatusFilter}
              onChange={(e) => setAssetStatusFilter(e.target.value)}
              className="ios-popup-btn outline-none cursor-pointer border border-[var(--input-border)]"
            >
              <option value="">Semua Status</option>
              <option value="active">Active</option>
              <option value="retired">Retired</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          {/* Asset Table */}
          <div className="ios-glass-card overflow-hidden">
            <SkeletonBlock loading={loading || !financeData} rows={5}>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-xs sm:text-sm border-collapse font-mono">
                  <thead className="sticky top-0 bg-[var(--table-head-bg)] text-zinc-700 dark:text-zinc-400 text-xs uppercase border-b border-black/10 dark:border-white/10 font-sans">
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
                            className={`ios-badge px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              (asset.status || 'active') === 'active'
                                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                                : (asset.status || '') === 'refunded'
                                ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30'
                                : 'bg-black/10 dark:bg-white/10 text-zinc-700 dark:text-zinc-300'
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
            </SkeletonBlock>
          </div>
        </div>
      )}

      {activeTab === 'payouts' && (
        <div className="ios-glass-card overflow-hidden">
          <SkeletonBlock loading={loading || !financeData || !payoutsData} rows={5}>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs sm:text-sm border-collapse font-mono">
                <thead className="sticky top-0 bg-[var(--table-head-bg)] text-zinc-700 dark:text-zinc-400 text-xs uppercase border-b border-black/10 dark:border-white/10 font-sans">
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
                      <td className="px-5 py-3 text-right font-bold text-sky-700 dark:text-sky-300">
                        {fmtMoney(p.usd)}
                      </td>
                      <td className="px-5 py-3 font-sans">
                        <span className="ios-badge px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
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
          </SkeletonBlock>
        </div>
      )}

      {/* ── Transfer to Consumer Modal (R2) ── */}
      <AnimatePresence>
        {isTransferOpen && (
          <motion.div
            key="transfer-modal"
            className="fixed inset-0 z-50 overflow-hidden font-sans flex items-center justify-center p-4"
            data-testid="transfer-modal"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !transferLoading && setIsTransferOpen(false)}
              className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md cursor-pointer"
            />

            {/* Modal Sheet */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="ios-sheet relative w-full max-w-md p-6 z-10 space-y-5"
            >
              <div className="ios-sheet-handle mx-auto" />

              <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                    <ArrowRightLeft size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-[var(--text-title)]">
                      Transfer ke Saldo Consumer
                    </h3>
                    <p className="text-xs text-[var(--text-sub)]">
                      Pindahkan pendapatan publisher ke saldo consumer InferHub
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsTransferOpen(false)}
                  disabled={transferLoading}
                  className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {transferError && (
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 font-medium" role="alert">
                  <AlertCircle size={15} className="shrink-0 text-rose-500" />
                  <span>{transferError}</span>
                </div>
              )}

              <form onSubmit={handleTransferSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="transfer-amount-input" className="font-semibold text-[var(--text-title)]">Nominal Transfer (USD)</label>
                    <span className="text-[var(--text-sub)] font-mono">
                      Saldo: ${availableEarnings.toFixed(2)}
                    </span>
                  </div>

                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 font-mono text-zinc-400">$</span>
                    <input
                      id="transfer-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="ios-input pl-8 pr-16 py-2.5 text-sm font-mono w-full"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setTransferAmount(availableEarnings.toString())}
                      className="absolute right-2 px-2.5 py-1 text-xs font-bold font-mono rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 hover:bg-sky-500/25 transition-colors"
                    >
                      MAX
                    </button>
                  </div>

                  {Number(transferAmount) > 0 && (
                    <div className="text-xs text-[var(--text-sub)] font-mono pt-1 flex items-center justify-between">
                      <span>Estimasi IDR:</span>
                      <span className="font-bold text-[var(--text-title)]">
                        Rp {Math.round(Number(transferAmount) * Number(kurs)).toLocaleString('id-ID')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsTransferOpen(false)}
                    disabled={transferLoading}
                    className="ios-btn-glass px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={transferLoading || !transferAmount || Number(transferAmount) <= 0}
                    className="ios-btn-primary px-5 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {transferLoading ? 'Memproses…' : 'Konfirmasi Transfer'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tarik Dana / Payout OTP Modal (R5) ── */}
      <AnimatePresence>
        {isPayoutOpen && (
          <motion.div
            key="payout-modal"
            className="fixed inset-0 z-50 overflow-hidden font-sans flex items-center justify-center p-4"
            data-testid="payout-modal"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !payoutLoading && setIsPayoutOpen(false)}
              className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md cursor-pointer"
            />

            {/* Modal Sheet */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="ios-sheet relative w-full max-w-md p-6 z-10 space-y-5"
            >
              <div className="ios-sheet-handle mx-auto" />

              <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                    <CreditCard size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-[var(--text-title)]">
                      Tarik Dana (Payout)
                    </h3>
                    <p className="text-xs text-[var(--text-sub)]">
                      {payoutStep === 1 ? 'Langkah 1: Masukkan Destinasi & Nominal' : 'Langkah 2: Verifikasi Kode OTP'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPayoutOpen(false)}
                  disabled={payoutLoading}
                  className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {payoutError && (
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 font-medium" role="alert">
                  <AlertCircle size={15} className="shrink-0 text-rose-500" />
                  <span>{payoutError}</span>
                </div>
              )}

              {payoutStep === 1 ? (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="payout-dest-input" className="text-xs font-semibold text-[var(--text-title)]">
                      Alamat / Destinasi Penarikan
                    </label>
                    <input
                      id="payout-dest-input"
                      type="text"
                      placeholder="e.g. 0x71C... / TRC20 / Rekening"
                      value={payoutDest}
                      onChange={(e) => setPayoutDest(e.target.value)}
                      className="ios-input px-3.5 py-2.5 text-sm font-mono w-full"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="payout-amount-input" className="font-semibold text-[var(--text-title)]">Nominal Penarikan (USDC / USD)</label>
                      <span className="text-[var(--text-sub)] font-mono">
                        Saldo: ${availableEarnings.toFixed(2)}
                      </span>
                    </div>

                    <div className="relative flex items-center">
                      <span className="absolute left-3.5 font-mono text-zinc-400">$</span>
                      <input
                        id="payout-amount-input"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        className="ios-input pl-8 pr-16 py-2.5 text-sm font-mono w-full"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setPayoutAmount(availableEarnings.toString())}
                        className="absolute right-2 px-2.5 py-1 text-xs font-bold font-mono rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 hover:bg-sky-500/25 transition-colors"
                      >
                        MAX
                      </button>
                    </div>

                    {Number(payoutAmount) > 0 && (
                      <div className="text-xs text-[var(--text-sub)] font-mono pt-1 flex items-center justify-between">
                        <span>Estimasi Diterima:</span>
                        <span className="font-bold text-[var(--text-title)]">
                          Rp {Math.round(Number(payoutAmount) * Number(kurs)).toLocaleString('id-ID')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsPayoutOpen(false)}
                      disabled={payoutLoading}
                      className="ios-btn-glass px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={payoutLoading || !payoutDest || !payoutAmount || Number(payoutAmount) <= 0}
                      className="ios-btn-primary px-5 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {payoutLoading ? 'Meminta OTP…' : 'Minta Kode OTP →'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleConfirmWithdrawal} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-sub)]">Destinasi:</span>
                      <span className="font-bold text-[var(--text-title)] truncate max-w-[200px]">{payoutDest}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-sub)]">Jumlah:</span>
                      <span className="font-bold text-sky-600 dark:text-sky-400">${Number(payoutAmount).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="payout-otp-input" className="font-semibold text-[var(--text-title)]">
                        Kode OTP Verifikasi (6-Digit)
                      </label>
                      <button
                        type="button"
                        onClick={handleRequestOtp}
                        disabled={payoutLoading}
                        className="text-xs text-sky-600 dark:text-sky-400 hover:underline font-semibold cursor-pointer"
                      >
                        Kirim Ulang OTP
                      </button>
                    </div>

                    <input
                      id="payout-otp-input"
                      type="text"
                      maxLength={6}
                      placeholder="123456"
                      value={payoutOtp}
                      onChange={(e) => setPayoutOtp(e.target.value)}
                      className="ios-input text-center font-mono text-xl tracking-[0.5em] py-3 w-full"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setPayoutStep(1)}
                      disabled={payoutLoading}
                      className="ios-btn-glass px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      ← Kembali
                    </button>
                    <button
                      type="submit"
                      disabled={payoutLoading || !payoutOtp || payoutOtp.length < 4}
                      className="ios-btn-primary px-5 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {payoutLoading ? 'Memverifikasi…' : 'Konfirmasi Penarikan'}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
