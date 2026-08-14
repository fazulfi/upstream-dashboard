// Format helpers khusus Earnings — presisi mikro untuk amount per-request.
// RC1 fix: amount nyata bisa < $0.00005 (mis. $0.000014) — toFixed(4) menampilkan 0.0000.
// Aturan: >= $1 -> 2 desimal; >= $0.01 -> 4 desimal; else -> 6 desimal. 0/null -> $0.

export function fmtUsdMicro(v) {
  const n = Number(v == null ? 0 : v);
  if (!isFinite(n)) return '$0';
  if (n === 0) return '$0';
  if (n >= 1) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 0.01) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

// Format timestamp ISO utuh (backend kirim ts utuh sejak Task 1).
// Hari ini -> "HH:mm:ss"; lebih tua -> "dd MMM HH:mm".
// Pakai jam UTC dari string ISO (deterministik, tidak terpengaruh TZ lokal).
export function fmtTs(ts) {
  if (!ts) return '—';
  const m = String(ts).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return String(ts);
  const [, y, mo, d, hh, mm, ss] = m;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  if (today === `${y}-${mo}-${d}`) return `${hh}:${mm}:${ss}`;
  return `${d} ${months[Number(mo) - 1]} ${hh}:${mm}`;
}
