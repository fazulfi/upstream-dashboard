import { useState } from 'react';
import { useApi, usd, usdIdr } from '../hooks/useApi';
import { SkeletonBlock } from '../components/Skeleton';

const idr = (v, kurs) => (v == null || !kurs ? '—' : 'Rp ' + Math.round(Number(v) * Number(kurs)).toLocaleString('id-ID'));

export default function Pnl() {
  const { data: fin, loading } = useApi('/api/finance');
  const [lossOpen, setLossOpen] = useState(false);
  if (!fin) return <div className="page-loading">Loading…</div>;
  const k = fin.kurs;

  // gabung semua kerugian aset mati: amortisasi + impairment → 1 kategori
  const amort = fin.amort_assets || [];
  const impair = fin.impairments || [];
  const lossRecords = [
    ...amort.map(a => ({ kind: 'Penyusutan', name: a.id + ' · ' + a.upstream, sub: a.status, qty: a.qty, loss_usd: a.cost_usd })),
    ...impair.map(im => ({
      kind: 'Impairment',
      name: (im.upstream || '') + ' · ' + (im.label || ''),
      sub: im.seed_residue ? '⚠ data hilang saat migrasi — loss tidak dihitung' : (im.date || ''),
      qty: im.qty,
      loss_usd: im.seed_residue ? null : im.loss_usd,  // seed → tampil '—'
      seed: im.seed_residue || false,
    })),
  ];
  const totalLoss = (fin.amort_usd ?? 0) + (fin.total_imp_loss_usd ?? 0);

  const rows = [
    { k: 'Revenue · settlements', v: usdIdr(fin.total_payout, k), cls: 'pos' },
    { k: 'Kerugian aset mati (amortisasi + impairment)', v: '(' + usdIdr(totalLoss, k) + ')', cls: 'neg' },
    { k: 'Operating expense', v: '(' + usdIdr(fin.opex, k) + ')', cls: 'neg' },
  ];

  return (
    <div className="page">
      <SkeletonBlock loading={loading} rows={5}>
        {/* KPI row */}
        <div className="kpis kpis-6">
          <div className="kpi featured">
            <div className="k-label">Total modal · investasi aset</div>
            <div className="k-value tnum">{usd(fin.total_capital_usd ?? 0)}</div>
            <div className="k-context">{idr(fin.total_capital_usd ?? 0, k)}</div>
          </div>
          <div className="kpi">
            <div className="k-label">Net income</div>
            <div className="k-value tnum">{usd(fin.net_income)}</div>
            <div className="k-context">{idr(fin.net_income, k)}</div>
          </div>
          <div className="kpi">
            <div className="k-label">Revenue</div>
            <div className="k-value tnum">{usd(fin.total_payout)}</div>
            <div className="k-context">{idr(fin.total_payout, k)}</div>
          </div>
          <div className="kpi">
            <div className="k-label">Kerugian aset mati</div>
            <div className="k-value tnum neg">{usd(totalLoss)}</div>
            <div className="k-context">{idr(totalLoss, k)}</div>
          </div>
          <div className="kpi">
            <div className="k-label">Akun terdampak</div>
            <div className="k-value tnum">{lossRecords.length}</div>
            <div className="k-context">dari {fin.total_asset_qty} unit</div>
          </div>
        </div>

        <div className="pnl-grid">
          {/* Kiri: Profit & loss summary */}
          <section className="panel pnl-panel">
            <div className="panel-head"><div><h2>Profit &amp; loss</h2><div className="sub">period to date · USD (IDR)</div></div></div>
            <div className="pnl">
              {rows.map((r, i) => (
                <div className="pl-row" key={i}><span className="lbl">{r.k}</span><span className={`amt tnum ${r.cls}`}>{r.v}</span></div>
              ))}
              <div className="pl-row total"><span className="lbl">Net income</span>
                <span className={`amt tnum ${fin.net_income >= 0 ? 'pos' : 'neg'}`}>{usdIdr(fin.net_income, k)}</span></div>
              <div className="pl-row fx"><span className="lbl">FX rate</span><span className="amt tnum faint">{usd(1)} ≈ {Number(fin.kurs || 0).toLocaleString('id-ID')} IDR</span></div>
            </div>
          </section>

          {/* Kerugian aset mati summary card (klik modal) */}
          <section className="panel">
            <div className="panel-head">
              <div><h2>Kerugian aset mati</h2><div className="sub">amortisasi + impairment · diakui saat akun mati</div></div>
              <button className="btn btn-ghost" onClick={() => setLossOpen(true)} disabled={lossRecords.length === 0}>
                Lihat detail {lossRecords.length || ''}
              </button>
            </div>
            <div className="sum-grid">
              <div className="sum-cell">
                <div className="sum-label">Penyusutan</div>
                <div className="sum-value tnum">{usd(fin.amort_usd ?? 0)}</div>
                <div className="sum-sub">{amort.length} aset</div>
              </div>
              <div className="sum-cell">
                <div className="sum-label">Impairment</div>
                <div className="sum-value tnum neg">{usd(fin.total_imp_loss_usd ?? 0)}</div>
                <div className="sum-sub">{impair.length} akun</div>
              </div>
              <div className="sum-cell">
                <div className="sum-label">Total kerugian</div>
                <div className="sum-value tnum neg">{usd(totalLoss)}</div>
                <div className="sum-sub">{idr(totalLoss, k)}</div>
              </div>
              <div className="sum-cell">
                <div className="sum-label">Akun terdampak</div>
                <div className="sum-value tnum">{lossRecords.length}</div>
                <div className="sum-sub">dari {fin.total_asset_qty} unit</div>
              </div>
            </div>
          </section>
        </div>
      </SkeletonBlock>

      {/* Modal: kerugian aset mati (amortisasi + impairment gabung) */}
      {lossOpen && (
        <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setLossOpen(false); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>Kerugian aset mati</h3>
              <button className="modal-x" onClick={() => setLossOpen(false)}>×</button>
            </div>
            <div className="modal-sub">{lossRecords.length} records · penyusutan {amort.length} + impairment {impair.length} · total {usd(totalLoss)}</div>
            <div className="modal-body">
              <table className="tbl tbl-compact">
                <thead><tr><th>Jenis</th><th>Aset / Akun</th><th className="right">Qty</th><th className="right">Loss (USDC)</th></tr></thead>
                <tbody>
                  {lossRecords.map((r, i) => (
                    <tr key={i}>
                      <td><span className={`tag ${r.kind === 'Impairment' ? 'tag-imp' : 'tag-amort'}`}>{r.kind}</span></td>
                      <td><span className="prov-name">{r.name}</span><div className="prov-sub">{r.sub}</div></td>
                      <td className="right tnum">{r.qty}</td>
                      <td className="right tnum neg">{r.loss_usd != null ? '$' + Number(r.loss_usd).toFixed(2) : <span className="faint">data hilang</span>}</td>
                    </tr>
                  ))}
                  {!lossRecords.length && <tr><td colSpan={4} className="dt-empty">Belum ada aset mati.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setLossOpen(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
