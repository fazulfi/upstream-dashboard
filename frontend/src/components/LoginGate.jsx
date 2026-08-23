import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, ShieldCheck, KeyRound, AlertTriangle, User, ArrowRight } from 'lucide-react';
import { loginWithPassword, getSessionToken, setSessionToken } from '../hooks/useApi';

/**
 * LoginGate — Secure Session Gate with Vercel & Stripe Obsidian styling.
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
    <div className="login-wrap min-h-screen w-full bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Ambient Lighting Background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Login Card Container */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        <form
          onSubmit={doLogin}
          className="login-card rounded-2xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl space-y-6"
        >
          {/* Brand Header */}
          <div className="login-brand flex items-center gap-3 pb-4 border-b border-zinc-800/80">
            <div className="brand-mark w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-base shadow-lg shadow-sky-500/20">
              U
            </div>
            <div>
              <div className="brand-name text-sm font-extrabold font-mono tracking-tight text-zinc-100 uppercase">
                Upstream
              </div>
              <div className="brand-sub text-[11px] text-zinc-400 font-mono">
                publisher console
              </div>
            </div>
          </div>

          {/* Title & Description */}
          <div className="space-y-1.5">
            <h2 className="login-title text-xl font-bold tracking-tight text-zinc-100">
              Upstream — Operations
            </h2>
            <p className="login-sub text-xs text-zinc-400 leading-relaxed">
              Dashboard InferHub publisher. Masukkan password untuk akses penuh.
            </p>
          </div>

          {/* Form Inputs */}
          <div className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 block">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoFocus
                  placeholder="Dashboard password"
                  className="login-input w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 font-mono transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 block">
                Operator Name (Optional)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="Operator name (opsional, untuk audit)"
                  className="login-input w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 font-mono transition-all"
                />
              </div>
            </div>
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {msg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="login-err p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2"
                role="alert"
              >
                <AlertTriangle size={15} className="shrink-0 text-rose-400" />
                <span>{msg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={busy || !pw}
            className="btn-primary login-btn w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-sky-500/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {busy ? (
              <span>Login…</span>
            ) : (
              <>
                <span>Masuk</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {/* Security Footer Note */}
        <div className="mt-4 text-center text-[11px] text-zinc-500 font-mono flex items-center justify-center gap-1.5">
          <ShieldCheck size={13} className="text-emerald-400" />
          <span>24h Encrypted Session Token · Zero-Credential Bundle</span>
        </div>
      </motion.div>
    </div>
  );
}
