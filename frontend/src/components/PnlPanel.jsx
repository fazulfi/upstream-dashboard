const usd = v => '$' + (v == null ? '0.00' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const idr = (v, kurs) => (v == null || !kurs ? '' : 'Rp ' + Math.round(Number(v) * Number(kurs)).toLocaleString('id-ID'));
const usdIdr = (v, kurs) => (v == null ? usd(0) : `${usd(v)} (${idr(v, kurs)})`);

export default function PnlPanel({ fin }) {
  if (!fin) return null;
  const k = fin.kurs;
  const net = fin.net_income ?? 0;
  const cap = fin.total_capital_usd ?? null;
  const payout = fin.total_payout ?? 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Profit &amp; loss</h2>
          <div className="sub">ringkasan · detail lengkap di Profit &amp; Loss</div>
        </div>
      </div>
      <div className="pl-list">
        <div className="pl-row">
          <span className="lbl">Revenue · settlements</span>
          <span className="amt tnum pos">{usdIdr(payout, k)}</span>
        </div>
        <div className="pl-row">
          <span className="lbl">Total modal · aset</span>
          <span className="amt tnum">{cap != null ? usdIdr(cap, k) : '—'}</span>
        </div>
        <div className="pl-row">
          <span className="lbl">Net income</span>
          <span className={`amt tnum ${net >= 0 ? 'pos' : 'neg'}`}>{usdIdr(net, k)}</span>
        </div>
        <div className="pl-row total">
          <span className="lbl">FX rate</span>
          <span className="amt tnum faint">$1.00 ≈ {Number(k).toLocaleString('id-ID', { minimumFractionDigits: 2 })} IDR</span>
        </div>
      </div>
    </section>
  );
}
