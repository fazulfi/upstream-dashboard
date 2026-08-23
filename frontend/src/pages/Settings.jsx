import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
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
      success('Authentication successful — 24h session token issued.');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
              Platform Configuration
            </span>
            <span className="text-xs text-zinc-500 font-mono">System & Node Diagnostics</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
            System Settings & Security Gate
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Operator authentication, node architecture diagnostics, and decision-grade finance verification.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): System Overview & Bento Grid */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account & Fleet Panel */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Deployment & Fleet Summary</h3>
                <p className="text-xs text-zinc-400">Connected InferHub node and balance state</p>
              </div>
              <Badge kind="ok" dot>
                Online
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="text-zinc-500 text-[10px] uppercase font-mono">Node Identity</div>
                <div className="font-bold text-zinc-200 mt-1">{data?.account?.displayName || 'InferHub Publisher'}</div>
                <div className="text-[11px] text-zinc-500">{data?.account?.email || 'publisher@upstream.internal'}</div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="text-zinc-500 text-[10px] uppercase font-mono">Publisher Earnings</div>
                <div className="font-mono font-bold text-emerald-400 text-sm mt-1">
                  {usd(bal.publisher_earnings)} USDC
                </div>
                <div className="text-[11px] text-zinc-500">Live balance</div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="text-zinc-500 text-[10px] uppercase font-mono">Active Provider Fleet</div>
                <div className="font-mono font-bold text-zinc-200 mt-1">
                  {data?.fleet_summary?.ok_total || 0} / {data?.fleet_summary?.total || 0} OK
                </div>
                <div className="text-[11px] text-zinc-500">Healthy provider connections</div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="text-zinc-500 text-[10px] uppercase font-mono">Data Poll Cadence</div>
                <div className="font-mono font-bold text-zinc-200 mt-1">15s SWR · 60s Daemon</div>
                <div className="text-[11px] text-zinc-500">Realtime SSE fallback</div>
              </div>
            </div>
          </div>

          {/* Architecture Topology */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Hybrid Architecture Topology</h3>
                <p className="text-xs text-zinc-400">Production multi-tier deployment spec</p>
              </div>
              <Server size={16} className="text-sky-400" />
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <Globe size={16} className="text-sky-400" />
                  <div>
                    <div className="font-semibold text-zinc-200">Frontend Web Surface</div>
                    <div className="text-[11px] text-zinc-500">React 19 · Vite · Tailwind v4 · Vercel Edge</div>
                  </div>
                </div>
                <Badge kind="ok">Hosted</Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <Server size={16} className="text-indigo-400" />
                  <div>
                    <div className="font-semibold text-zinc-200">Backend API & Control Plane</div>
                    <div className="text-[11px] text-zinc-500">Flask · Waitress · Nginx TLS · VPS (82.25.62.204)</div>
                  </div>
                </div>
                <Badge kind="ok">Operational</Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <Database size={16} className="text-emerald-400" />
                  <div>
                    <div className="font-semibold text-zinc-200">PostgreSQL Primary Ledger</div>
                    <div className="text-[11px] text-zinc-500">Authoritative Schema (`memory.*`)</div>
                  </div>
                </div>
                <Badge kind="ok">Synced</Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1 col): Security Session & Diagnostics */}
        <div className="space-y-6">
          {/* Session Token Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Lock size={15} className="text-sky-400" />
                <h3 className="text-sm font-bold text-zinc-100">Operator Session</h3>
              </div>
              <Badge kind={hasToken ? 'ok' : 'warn'} dot>
                {hasToken ? 'Active (24h)' : 'Unauthenticated'}
              </Badge>
            </div>

            <p className="text-xs text-zinc-400">
              Session tokens enable mutation endpoints (Arm/Disarm, Overrides, Payout sync) without storing raw passwords in browser storage.
            </p>

            {hasToken ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                  <span>Valid session token loaded in browser memory.</span>
                </div>
                <button
                  onClick={doLogout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
                >
                  <LogOut size={14} />
                  <span>Clear Session Token</span>
                </button>
              </div>
            ) : (
              <form onSubmit={doLogin} className="space-y-3">
                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400">Dashboard Password</label>
                  <input
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="Enter operator password"
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-sky-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !pw}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-sm disabled:opacity-50 transition-all"
                >
                  <KeyRound size={14} />
                  <span>{busy ? 'Authenticating…' : 'Authenticate Session'}</span>
                </button>
              </form>
            )}
          </div>

          {/* Decision-Grade Finance Status */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Finance Verification</h3>
                <p className="text-xs text-zinc-400">Rule engine verification status</p>
              </div>
              <ShieldCheck size={16} className="text-emerald-400" />
            </div>
            <FinanceStatus metrics={financeMetrics} variance={financeData?.variance ?? ''} />
          </div>
        </div>
      </div>
    </div>
  );
}
