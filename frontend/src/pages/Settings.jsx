import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Settings as SettingsIcon,
  KeyRound,
  ShieldCheck,
  Server,
  Database,
  Globe,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Lock,
  LogOut,
  Cpu,
} from 'lucide-react';
import { usd, loginWithPassword, getSessionToken, clearSessionToken, useApi } from '../hooks/useApi';
import FinanceStatus from '../components/FinanceStatus';
import Badge from '../components/Badge';
import { useToast } from '../components/Toast';

export default function Settings() {
  const { data } = useOutletContext();
  const { data: financeData } = useApi('/api/finance');
  const bal = data?.balances || {};
  const { success, error: toastError } = useToast();

  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const hasToken = Boolean(getSessionToken());

  const financeMetrics = [
    {
      key: 'net_income',
      label: 'Net Income',
      value: financeData?.net_income != null ? `$${Number(financeData.net_income).toFixed(2)}` : '—',
      verified: Boolean(financeData?.net_income != null),
    },
    {
      key: 'kurs',
      label: 'Kurs Reference',
      value: financeData?.kurs != null ? `Rp ${Number(financeData.kurs).toLocaleString('id-ID')}` : '—',
      verified: Boolean(financeData?.kurs != null),
    },
  ];

  const doLogin = async (e) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    try {
      await loginWithPassword(pw);
      success('Autentikasi berhasil — token sesi 24 jam aktif.');
      setPw('');
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      toastError('Autentikasi gagal: ' + (err.message || 'unauthorized'));
    } finally {
      setBusy(false);
    }
  };

  const doLogout = () => {
    clearSessionToken();
    success('Berhasil logout.');
    setTimeout(() => window.location.reload(), 400);
  };

  const items = [
    { label: 'Akun Operator', value: data?.account?.displayName || '—', sub: data?.account?.email || 'publisher@upstream.internal' },
    { label: 'Role Publisher', value: 'publisher + consumer', sub: 'InferHub' },
    { label: 'Pendapatan USDC', value: usd(bal.publisher_earnings), sub: 'real-time' },
    { label: 'Fiat Pending', value: usd(bal.fiat_pendings), sub: 'settlement' },
    { label: 'Node Provider Aktif', value: `${data?.fleet_summary?.ok_total || 0} / ${data?.fleet_summary?.total || 0}`, sub: 'node terhubung' },
    { label: 'Interval Refresh', value: '15s UI · 60s Daemon', sub: `source: ${data?.ts || 'live'}` },
  ];

  return (
    <div className="page space-y-6 max-w-7xl mx-auto pb-12 font-sans transition-colors">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/10 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
              <SettingsIcon size={13} />
              Konfigurasi & Keamanan
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Sistem Platform</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Settings & Security
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 max-w-2xl">
            Manajemen autentikasi sesi operator, topologi server hybrid, dan diagnostik platform.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): System Overview & Bento Grid */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account & Fleet Panel */}
          <section className="panel ios-glass-card p-6 space-y-4 shadow-xl">
            <div className="panel-head flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">System & Account</h2>
                <div className="sub text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">Informasi akun deployment saat ini</div>
              </div>
              <Badge kind="ok" dot>
                Connected
              </Badge>
            </div>

            <div className="settings-list grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((it, i) => (
                <div
                  className="setting-row p-4 rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-black/40 flex flex-col justify-between hover:border-black/20 dark:hover:border-white/20 transition-colors shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-none"
                  key={i}
                >
                  <div>
                    <div className="setting-label text-xs font-mono font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">
                      {it.label}
                    </div>
                    <div className="setting-sub text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{it.sub}</div>
                  </div>
                  <div className="setting-value tnum font-mono font-bold text-zinc-900 dark:text-white text-base mt-2">
                    {it.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Architecture Topology */}
          <section className="panel ios-glass-card p-6 space-y-4 shadow-xl">
            <div className="panel-head flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Arsitektur Infrastruktur</h2>
                <div className="sub text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">Topologi deployment hybrid production</div>
              </div>
              <Server size={18} className="text-sky-500" />
            </div>

            <div className="settings-list space-y-3 text-xs sm:text-sm">
              <div className="setting-row flex items-center justify-between p-4 rounded-2xl bg-white/60 dark:bg-black/40 border border-white/80 dark:border-white/10 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-none">
                <div className="flex items-center gap-3">
                  <Globe size={18} className="text-sky-500" />
                  <div>
                    <div className="setting-label font-bold text-zinc-900 dark:text-white">Frontend Edge</div>
                    <div className="setting-sub text-xs text-zinc-500 dark:text-zinc-400">React · Vite · Vercel Edge Serverless</div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  HOSTED
                </span>
              </div>

              <div className="setting-row flex items-center justify-between p-4 rounded-2xl bg-white/60 dark:bg-black/40 border border-white/80 dark:border-white/10 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-none">
                <div className="flex items-center gap-3">
                  <Server size={18} className="text-indigo-500" />
                  <div>
                    <div className="setting-label font-bold text-zinc-900 dark:text-white">Backend Production Server</div>
                    <div className="setting-sub text-xs text-zinc-500 dark:text-zinc-400">Python Flask · Nginx Reverse Proxy · TLS</div>
                  </div>
                </div>
                <div className="setting-value tnum font-mono font-bold text-sky-600 dark:text-sky-400">ops.budgezen.com</div>
              </div>

              <div className="setting-row flex items-center justify-between p-4 rounded-2xl bg-white/60 dark:bg-black/40 border border-white/80 dark:border-white/10 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-none">
                <div className="flex items-center gap-3">
                  <Database size={18} className="text-emerald-500" />
                  <div>
                    <div className="setting-label font-bold text-zinc-900 dark:text-white">Pricing Loop Engine</div>
                    <div className="setting-sub text-xs text-zinc-500 dark:text-zinc-400">InferHub autonomous daemon · Loop 60s</div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  ACTIVE
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column (1 col): Security Session & Diagnostics */}
        <div className="space-y-6">
          {/* Session Token Card */}
          <section className="panel ios-glass-card p-6 space-y-4 shadow-xl">
            <div className="panel-head flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-sky-500" />
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Sesi Operator</h2>
              </div>
              {hasToken ? (
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  Token Aktif
                </span>
              ) : (
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-black/5 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  Belum Login
                </span>
              )}
            </div>

            <div className="sub text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Token sesi terenkripsi 24 jam. Password tidak disimpan secara terbuka.
            </div>

            {hasToken ? (
              <div className="space-y-3 pt-1">
                <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2.5">
                  <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
                  <span>Token aktif dalam sessionStorage.</span>
                </div>
                <button
                  onClick={doLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <LogOut size={16} />
                  <span>Hapus Token Sesi</span>
                </button>
              </div>
            ) : (
              <form onSubmit={doLogin} className="space-y-3 pt-1">
                <div>
                  <input
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="Dashboard password"
                    className="w-full bg-white/80 dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-zinc-900 dark:text-white outline-none focus:border-sky-500 font-mono shadow-inner"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !pw}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ios-btn-primary font-bold text-xs sm:text-sm shadow-md disabled:opacity-50 transition-all cursor-pointer"
                >
                  <KeyRound size={16} />
                  <span>{busy ? 'Login…' : 'Login'}</span>
                </button>
              </form>
            )}
          </section>

          {/* Decision-Grade Finance Status */}
          <section className="panel ios-glass-card p-6 space-y-4 shadow-xl">
            <div className="panel-head flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Finance Status</h2>
                <div className="sub text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">Status verifikasi metrik keuangan</div>
              </div>
              <ShieldCheck size={18} className="text-emerald-500" />
            </div>
            <FinanceStatus metrics={financeMetrics} variance={financeData?.variance ?? ''} />
          </section>
        </div>
      </div>
    </div>
  );
}
