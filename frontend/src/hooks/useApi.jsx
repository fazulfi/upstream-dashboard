import { useCallback, useEffect, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL || ''; // Vercel rewrites /api -> backend

// ── Auth: token sesi (aman) > X-Auth password (deprecated, jangan di bundle) ──
// Frontend login sekali via /api/login -> simpan token di sessionStorage ->
// kirim `Authorization: Bearer <token>`. Password TIDAK pernah di-bundle.
const TOKEN_KEY = 'upstream_session_token';
export function getSessionToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setSessionToken(tok) {
  try { if (tok) sessionStorage.setItem(TOKEN_KEY, tok); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
}

// DEPRECATED: X-Auth password dari env. JANGAN set VITE_DASHBOARD_PASSWORD di
// produksi — password itu bocor ke bundle publik. Pakai /api/login + token.
const AUTH = import.meta.env.VITE_DASHBOARD_PASSWORD || '';

async function loginWithPassword(password, operatorName) {
  const r = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(operatorName ? { password, operator_name: operatorName } : { password }),
  });
  if (!r.ok) throw new Error('login failed');
  const d = await r.json();
  setSessionToken(d.token);
  return d.token;
}

function authHeaders(extra = {}) {
  const tok = getSessionToken();
  if (tok) return { ...extra, Authorization: `Bearer ${tok}` };
  if (AUTH) return { ...extra, 'X-Auth': AUTH };
  return extra;
}

const FOCUSED_API_PREFIXES = ['/api/auto-pricing', '/api/pricing'];
const MANUAL_ASK_PATHS = new Set(['/api/orderbook', '/api/ask']);
const RELIABILITY_PREFIX = '/api/reliability';
const SESSION_EXPIRED_MESSAGE = 'Sesi berakhir. Silakan masuk kembali.';

export function handleSessionExpiry(path, headers, response) {
  const isLoginRequest = path === '/api/login' || path.endsWith('/api/login');
  if (isLoginRequest || (response.status !== 401 && response.status !== 403)) return;

  const authHeader = Object.entries(headers).find(
    ([key, value]) => key.toLowerCase() === 'authorization' && typeof value === 'string' && value.startsWith('Bearer '),
  );
  if (!authHeader) return;

  // Stale-response guard: hanya invalidasi sesi bila token yang dipakai request
  // MASIH sama dengan token aktif. Late 401 dari request lama tidak boleh
  // menghapus token baru setelah user login ulang.
  const usedToken = authHeader[1].slice('Bearer '.length);
  if (!usedToken || usedToken !== getSessionToken()) return;

  setSessionToken('');
  window.dispatchEvent(new CustomEvent('session-expired', {
    detail: { message: SESSION_EXPIRED_MESSAGE },
  }));
}

// Hanya Auto Pricing yang dipoll; orderbook/ask tetap diizinkan untuk Set Manual.
export function isApiEnabled(path) {
  return FOCUSED_API_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
    || path === RELIABILITY_PREFIX
    || path.startsWith(`${RELIABILITY_PREFIX}/`)
    || MANUAL_ASK_PATHS.has(path);
}

export async function apiFetch(path, options = {}) {
  if (!isApiEnabled(path)) {
    throw new Error('API scope aktif: hanya Auto Pricing yang diizinkan');
  }
  const headers = authHeaders({ ...(options.headers || {}) });
  const url = path.startsWith('/api/') ? `${API}${path}` : path;
  const response = await fetch(url, { ...options, headers });
  handleSessionExpiry(path, headers, response);
  return response;
}

/**
 * useApi — fetch with auto-refresh + loading/error state.
 * pollMs: 0 = once; >0 = interval (ms).
 */
export function useApi(path, pollMs = 0) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const ac = useRef(null);

  const load = useCallback(async () => {
    if (!isApiEnabled(path)) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (ac.current) ac.current.abort();
    const controller = new AbortController();
    ac.current = controller;
    try {
      const headers = authHeaders();
      const r = await fetch(`${API}${path}`, { signal: controller.signal, headers });
      handleSessionExpiry(path, headers, r);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const json = await r.json();
      if (ac.current === controller && !controller.signal.aborted) {
        setData(json);
        setError(null);
      }
    } catch (e) {
      if (ac.current === controller && !controller.signal.aborted) setError(e.message);
    } finally {
      if (ac.current === controller && !controller.signal.aborted) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
    if (pollMs > 0) {
      timer.current = setInterval(load, pollMs);
    }
    return () => {
      clearInterval(timer.current);
      if (ac.current) ac.current.abort();
    };
  }, [load, pollMs]);

  return { data, loading, error, reload: load, refetch: load };
}

export const usd = v => '$' + (v == null ? '0.00' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// Konversi USD -> IDR pakai kurs. kembalikan string "Rp 1.234.567" atau '' bila kurs unavailable.
export const idr = (v, kurs) => {
  if (v == null || !kurs) return '';
  const rp = Number(v) * Number(kurs);
  return 'Rp ' + Math.round(rp).toLocaleString('id-ID');
};

// Kombinasi: "$5.00 (Rp 89.006)" — tampil utama USD + konteks Rupiah.
export const usdIdr = (v, kurs) => {
  const u = usd(v);
  const i = idr(v, kurs);
  return i ? `${u} (${i})` : u;
};
export { loginWithPassword };
