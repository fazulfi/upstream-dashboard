import Sparkline from './Sparkline';

/**
 * KpiCard — kartu metrik dengan hierarchy:
 *   - headliner: satu angka besar di awal (Mercury/Brex pattern)
 *   - secondary: lebih kecil
 * 1 angka utama + delta + sparkline konteks.
 */
export default function KpiCard({ label, value, delta = null, deltaDir = null, spark = null, sub = null, featured = false }) {
  return (
    <div className={`kpi ${featured ? 'featured' : ''}`}>
      <div className="k-label">{label}</div>
      <div className="k-value tnum">{value}</div>
      <div className="k-context">
        {delta && (
          <span className={`delta ${deltaDir === 'up' ? 'up' : deltaDir === 'down' ? 'down' : ''}`}>
            {deltaDir === 'up' ? '↑' : deltaDir === 'down' ? '↓' : ''} {delta}
          </span>
        )}
        {sub && <span className="k-sub">{sub}</span>}
      </div>
      {spark && <div className="k-spark"><Sparkline data={spark} color="var(--accent)" strokeWidth={1.5} /></div>}
    </div>
  );
}
