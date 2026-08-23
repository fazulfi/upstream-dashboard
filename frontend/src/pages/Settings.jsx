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
      success('Authentication successful — 24h session token active.');
      setPw('');
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      toastError('Authentication failed: ' + (err.message || 'unauthorized'));
    } finally {
      setBusy(false);
    }
  };

  const doLogout = () => {
    clearSessionToken();
    success('Logged out successfully.');
    setTimeout(() => window.location.reload(), 400);
  };

  const items = [
    { label: 'Account', value: data?.account?.displayName || '—', sub: data?.account?.email || 'publisher@upstream.internal' },
    { label: 'Publisher role', value: 'publisher + consumer', sub: 'InferHub' },
    { label: 'Publisher earnings (USDC)', value: usd(bal.publisher_earnings), sub: 'live' },
    { label: 'Fiat pending', value: usd(bal.fiat_pendings), sub: 'settlement' },
    { label: 'Active fleet', value: `${data?.fleet_summary?.ok_total || 0} / ${data?.fleet_summary?.total || 0}`, sub: 'ok / total providers' },
    { label: 'Data refresh', value: '15s frontend · 60s daemon', sub: `frontend poll interval · source ${data?.ts || ''}` },
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
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                <SettingsIcon size={11} className="text-indigo-400" />
                Platform Configuration · Node Security
              </span>
              <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
                System Diagnostics
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight">
              Settings & Security Gate
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
              Operator session authentication, node infrastructure topology, and decision-grade finance verification.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): System Overview & Bento Grid */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account & Fleet Panel */}
          <section className="panel rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md p-6 space-y-4 shadow-lg">
            <div className="panel-head flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">System · Account</h2>
                <div className="sub text-xs text-zinc-400 mt-0.5">About this deployment</div>
              </div>
              <Badge kind="ok" dot>
                Connected
              </Badge>
            </div>

            <div className="settings-list grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {items.map((it, i) => (
                <div
                  className="setting-row p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 flex flex-col justify-between hover:border-zinc-700 transition-colors shadow-sm"
                  key={i}
                >
                  <div>
                    <div className="setting-label text-[10px] font-mono font-bold uppercase text-zinc-400 tracking-wider">
                      {it.label}
                    </div>
                    <div className="setting-sub text-[11px] text-zinc-500 mt-0.5">{it.sub}</div>
                  </div>
                  <div className="setting-value tnum font-mono font-bold text-zinc-100 text-sm mt-2">
                    {it.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Architecture Topology */}
          <section className="panel rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md p-6 space-y-4 shadow-lg">
            <div className="panel-head flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">Architecture</h2>
                <div className="sub text-xs text-zinc-400 mt-0.5">hybrid deployment</div>
              </div>
              <Server size={16} className="text-sky-400" />
            </div>

            <div className="settings-list space-y-2.5 text-xs">
              <div className="setting-row flex items-center justify-between p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <div className="flex items-center gap-3">
                  <Globe size={16} className="text-sky-400" />
                  <div>
                    <div className="setting-label font-bold text-zinc-200">Frontend</div>
                    <div className="setting-sub text-[11px] text-zinc-500">React · Vite · Vercel edge</div>
                  </div>
                </div>
                <div className="setting-value font-mono font-bold text-emerald-400">hosted</div>
              </div>

              <div className="setting-row flex items-center justify-between p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <div className="flex items-center gap-3">
                  <Server size={16} className="text-indigo-400" />
                  <div>
                    <div className="setting-label font-bold text-zinc-200">Backend API</div>
                    <div className="setting-sub text-[11px] text-zinc-500">Flask · waitress · nginx TLS</div>
                  </div>
                </div>
                <div className="setting-value tnum font-mono font-bold text-sky-400">ops.budgezen.com</div>
              </div>

              <div className="setting-row flex items-center justify-between p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <div className="flex items-center gap-3">
                  <Database size={16} className="text-emerald-400" />
                  <div>
                    <div className="setting-label font-bold text-zinc-200">Real-time source</div>
                    <div className="setting-sub text-[11px] text-zinc-500">InferHub daemon · every 60s · backend REST/SSE</div>
                  </div>
                </div>
                <div className="setting-value font-mono font-bold text-emerald-400">active</div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column (1 col): Security Session & Diagnostics */}
        <div className="space-y-6">
          {/* Session Token Card */}
          <section className="panel rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md p-6 space-y-4 shadow-lg">
            <div className="panel-head flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-sky-400" />
                <h2 className="text-sm font-bold text-zinc-100">Session</h2>
              </div>
              <div className="setting-value font-mono text-xs font-bold text-zinc-300">
                {hasToken ? 'token aktif' : 'belum login'}
              </div>
            </div>

            <div className="sub text-xs text-zinc-400 leading-relaxed">
              login sekali — token sesi (24h), password tidak disimpan di browser
            </div>

            {hasToken ? (
              <div className="space-y-3 pt-1">
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                  <span>Token aktif dalam sessionStorage.</span>
                </div>
                <button
                  onClick={doLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <LogOut size={14} />
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
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-200 outline-none focus:border-sky-500 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !pw}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-sky-500/10 disabled:opacity-50 transition-all cursor-pointer"
                >
                  <KeyRound size={14} />
                  <span>{busy ? 'Login…' : 'Login'}</span>
                </button>
              </form>
            )}
          </section>

          {/* Decision-Grade Finance Status */}
          <section className="panel rounded-2xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md p-6 space-y-4 shadow-lg">
            <div className="panel-head flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">Finance</h2>
                <div className="sub text-xs text-zinc-400 mt-0.5">decision-grade metrics</div>
              </div>
              <ShieldCheck size={16} className="text-emerald-400" />
            </div>
            <FinanceStatus metrics={financeMetrics} variance={financeData?.variance ?? ''} />
          </section>
        </div>
      </div>
    </motion.div>
  );
}
