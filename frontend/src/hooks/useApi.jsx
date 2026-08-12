import { useCallback, useEffect, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL || ''; // Vercel rewrites /api -> backend
const AUTH = import.meta.env.VITE_DASHBOARD_PASSWORD || ''; // password dashboard (X-Auth)

/**
 * apiFetch — fetch ke backend dengan auth header (X-Auth) & prefix API.
 * Pakai ini untuk SEMUA request manual (POST/PUT/DELETE) di halaman.
 */
export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (AUTH) headers['X-Auth'] = AUTH;
  const url = path.startsWith('/api/') ? `${API}${path}` : path;
  return fetch(url, { ...options, headers });
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
    const controller = new AbortController();
    ac.current = controller;
    try {
      const headers = {};
      if (AUTH) headers['X-Auth'] = AUTH;
      const r = await fetch(`${API}${path}`, { signal: controller.signal, headers });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const json = await r.json();
      if (ac.current && !ac.current.signal.aborted) {
        setData(json);
        setError(null);
      }
    } catch (e) {
      if (ac.current && !ac.current.signal.aborted) setError(e.message);
    } finally {
      if (ac.current && !ac.current.signal.aborted) setLoading(false);
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
export const API_BASE = API;
