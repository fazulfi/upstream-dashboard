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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #0a0a0a)', padding: 20 }}>
      <form onSubmit={doLogin} style={{ width: 360, maxWidth: '100%', background: 'var(--card, #1a1a1a)', border: '1px solid var(--border, #292929)', borderRadius: 8, padding: 28 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Upstream — Operations</h2>
        <p style={{ margin: '0 0 20px', color: 'var(--text2, #a1a1a1)', fontSize: 13, lineHeight: 1.5 }}>
          Dashboard InferHub publisher. Masukkan password untuk akses penuh.
        </p>
        <input
          type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus placeholder="Dashboard password"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border, #333)', background: 'transparent', color: 'inherit', boxSizing: 'border-box' }}
        />
        {msg && <div style={{ marginTop: 10, fontSize: 13, color: '#e5484d' }}>{msg}</div>}
        <button type="submit" disabled={busy || !pw}
          style={{ marginTop: 16, width: '100%', padding: '10px', borderRadius: 8, background: 'var(--accent, #0080ff)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
          {busy ? 'Login…' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}
