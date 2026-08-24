import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck, KeyRound, AlertTriangle, User, ArrowRight } from 'lucide-react';
import { loginWithPassword, getSessionToken, setSessionToken } from '../hooks/useApi';

/**
 * LoginGate — Apple iOS 26 Glossy Liquid Glass Session Gate with 3D Spring Physics.
 */
export default function LoginGate({ children }) {
  const [pw, setPw] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [authed, setAuthed] = useState(() => !!getSessionToken());

  useEffect(() => {
    const onSessionExpired = (event) => {
      setSessionToken('');
      setAuthed(false);
      setPw('');
      setMsg(event.detail?.message || 'Sesi berakhir. Silakan masuk kembali.');
    };

    window.addEventListener('session-expired', onSessionExpired);
    return () => window.removeEventListener('session-expired', onSessionExpired);
  }, []);

  const doLogin = async (e) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    setMsg('');
    try {
      const name = operatorName.trim();
      await (name ? loginWithPassword(pw, name) : loginWithPassword(pw));
      setAuthed(true);
      window.location.hash = '#/';
    } catch (err) {
      setMsg('Login gagal: ' + (err.message || 'unauthorized'));
    } finally {
      setBusy(false);
    }
  };

  if (authed) return children;

  return (
    <div className="login-wrap min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden font-sans transition-colors duration-500">
      {/* Apple iOS 26 Ambient Mesh Orbs with 700ms Cross-fade */}
      <div
        aria-hidden="true"
        className="ambient-mesh-container fixed inset-0 overflow-hidden pointer-events-none z-0"
        style={{ opacity: 'var(--mesh-opacity, 0.32)' }}
      >
        <div className="ambient-mesh ambient-mesh-dark absolute inset-0">
          <div
            className="ambient-mesh-orb absolute top-1/4 left-1/4 w-[620px] h-[620px] rounded-full blur-[140px]"
            style={{
              background: 'radial-gradient(circle, #38bdf8 0%, #0284c7 50%, transparent 75%)',
            }}
          />
          <div
            className="ambient-mesh-orb absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px]"
            style={{
              background: 'radial-gradient(circle, #818cf8 0%, #6366f1 50%, transparent 75%)',
            }}
          />
        </div>
        <div className="ambient-mesh ambient-mesh-light absolute inset-0">
          <div
            className="ambient-mesh-orb absolute top-1/4 left-1/4 w-[620px] h-[620px] rounded-full blur-[140px]"
            style={{
              background: 'radial-gradient(circle, #7dd3fc 0%, #38bdf8 45%, transparent 70%)',
            }}
          />
          <div
            className="ambient-mesh-orb absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px]"
            style={{
              background: 'radial-gradient(circle, #a5b4fc 0%, #818cf8 45%, transparent 70%)',
            }}
          />
        </div>
      </div>

      {/* Login Card Container */}
      <div className="w-full max-w-md relative z-10 transition-all duration-300">
        <form
          onSubmit={doLogin}
          className="login-card ios-glass-card p-6 sm:p-8 space-y-6"
        >
          {/* Brand Header */}
          <div className="login-brand flex items-center gap-3.5 pb-4 border-b border-black/10 dark:border-white/10">
            <div className="brand-mark w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-base shadow-lg shadow-sky-500/25">
              U
            </div>
            <div>
              <div className="brand-name text-sm font-extrabold font-mono tracking-tight text-zinc-900 dark:text-white uppercase">
                Upstream
              </div>
              <div className="brand-sub text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                Publisher Console
              </div>
            </div>
          </div>

          {/* Title & Description */}
          <div className="space-y-1.5">
            <h2 className="login-title text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Upstream — Operations
            </h2>
            <p className="login-sub text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Dashboard InferHub publisher. Masukkan password untuk akses penuh.
            </p>
          </div>

          {/* Form Inputs */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                Password
              </label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoFocus
                placeholder="Dashboard password"
                className="login-input w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-title)] placeholder-zinc-400 outline-none focus:border-sky-500 font-mono transition-all shadow-inner"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                Operator Name (Optional)
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Operator name (opsional, untuk audit)"
                className="login-input w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-title)] placeholder-zinc-400 outline-none focus:border-sky-500 font-mono transition-all shadow-inner"
              />
            </div>
          </div>

          {/* Error Message */}
          {msg && (
            <div
              className="login-err p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-semibold flex items-center gap-2"
              role="alert"
            >
              <AlertTriangle size={16} className="shrink-0 text-rose-500" />
              <span>{msg}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={busy || !pw}
            className="btn-primary login-btn ios-btn-primary w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold shadow-lg disabled:opacity-50 transition-all cursor-pointer"
          >
            {busy ? (
              <span>Login…</span>
            ) : (
              <>
                <span>Masuk</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Security Footer Note */}
        <div className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400 font-mono flex items-center justify-center gap-2">
          <ShieldCheck size={14} className="text-sky-500" />
          <span>Sesi Terenkripsi 24 Jam</span>
        </div>
      </div>
    </div>
  );
}
