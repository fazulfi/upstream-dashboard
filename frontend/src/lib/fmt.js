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

// Format harga kompetitor SEJATI untuk kolom Kompetitor di Auto Pricing.
// Konsumen WAJIB memakai competitor_price (level orderbook genuine terendah,
// backend scripts/auto_pricing.py `_lowest_competitor_price`), BUKAN comp
// (anchor /market diagnostic — nilainya bisa beda: comp=0.322 vs
// competitor_price=0.07 di live codebuddy/glm-5.2).
// Aturan display: > 0 -> "$X.XXXX" (4 desimal); null/undefined/<=0/invalid -> "—".
export function fmtCompetitorPrice(v) {
  const n = Number(v == null ? 0 : v);
  if (!isFinite(n) || n <= 0) return '—';
  return '$' + n.toFixed(4);
}

// Format timestamp ISO (backend kirim ts UTC, e.g. 2026-08-14T05:50:00Z).
// Rev2 fix: KONVERSI ke zona waktu LOKAL user (bukan tampil UTC mentah) —
// user Indonesia melihat jam WIB (UTC+7), "just now" harus sesuai jam lokal.
// Hari ini -> "HH:mm:ss"; lebih tua -> "dd MMM HH:mm". Deterministik per user.
export function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay) return `${hm}:${pad(d.getSeconds())}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${hm}`;
}
