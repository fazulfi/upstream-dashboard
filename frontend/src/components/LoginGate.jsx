import { useState } from 'react';
import { loginWithPassword, getSessionToken } from '../hooks/useApi';

/**
 * LoginGate — tampilkan layar login kalau belum ada token sesi.
 * Setelah login sukses, token tersimpan (sessionStorage) & halaman dirender.
 * Konsisten dgn Settings.jsx (loginWithPassword + getSessionToken).
 */
export default function LoginGate({ children }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [authed, setAuthed] = useState(() => !!getSessionToken());

  const doLogin = async (e) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true); setMsg('');
    try {
      await loginWithPassword(pw);
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
    <div className="login-wrap">
      <form onSubmit={doLogin} className="login-card">
        <div className="login-brand">
          <div className="brand-mark">U</div>
          <div>
            <div className="brand-name">Upstream</div>
            <div className="brand-sub">publisher</div>
          </div>
        </div>
        <h2 className="login-title">Upstream — Operations</h2>
        <p className="login-sub">
          Dashboard InferHub publisher. Masukkan password untuk akses penuh.
        </p>
        <input
          type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus placeholder="Dashboard password"
          className="login-input"
        />
        {msg && <div className="login-err" role="alert">{msg}</div>}
        <button type="submit" disabled={busy || !pw} className="btn-primary login-btn">
          {busy ? 'Login…' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}
