import { useState } from 'react';
import { useApi, usd } from '../hooks/useApi';
import Badge from '../components/Badge';
import { SkeletonBlock } from '../components/Skeleton';

export default function Topups() {
  const { data, loading, refetch } = useApi('/api/topups');
  const [modal, setModal] = useState(null); // {new} | {qr}
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const topups = Array.isArray(data) ? data : [];

  async function create() {
    const amt = Number(amount);
    if (!amt || amt < 10000) { setMsg('Minimal Rp 10.000'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/topups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: amt, payment_method: 'qris' }) });
      const j = await r.json();
      if (r.ok && j.topup_key) { setModal({ qr: j }); setAmount(''); refetch(); }
      else setMsg(j.error || 'gagal buat topup');
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  async function refresh(topupKey) {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/topups/${topupKey}/refresh`, { method: 'POST' });
      const j = await r.json();
      setMsg(`status: ${j.status} · paid: ${j.paid}`);
      refetch();
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head">
          <div><h2>Top-ups · pembayaran</h2><div className="sub">{topups.length} transaksi · QRIS / PayPal · dari InferHub</div></div>
          <button className="btn" onClick={() => setModal({ new: true })}>+ Top-up QRIS</button>
        </div>
        <SkeletonBlock loading={loading} rows={4}>
          <table className="tbl">
            <thead><tr><th>Tanggal</th><th>Amount</th><th>Method</th><th>Status</th><th>Topup key</th><th className="right">Aksi</th></tr></thead>
            <tbody>
              {topups.map(t => (
                <tr key={t.id}>
                  <td className="tnum faint">{fmt(t.created_at)}</td>
                  <td className="tnum">{t.payment_method === 'qris' ? 'Rp ' + (t.amount_idr || 0).toLocaleString('id-ID') : usd(t.amount_usdc)}</td>
                  <td>{t.payment_method}</td>
                  <td>{t.status === 'paid' ? <Badge kind="ok">paid</Badge> : <Badge kind="drained">{t.status}</Badge>}</td>
                  <td className="tnum faint">{t.topup_key || '—'}</td>
                  <td className="right">
                    {t.status !== 'paid' && t.topup_key && (
                      <button className="btn btn-sm" disabled={busy} onClick={() => refresh(t.topup_key)}>Refresh</button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && !topups.length && <tr><td colSpan={6} className="dt-empty">Belum ada top-up.</td></tr>}
            </tbody>
          </table>
        </SkeletonBlock>
        {msg && <div className="form-msg">{msg}</div>}
      </section>

      {modal?.new && (
        <div className="modal-back" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>Top-up QRIS</h3><button className="btn btn-sm" onClick={() => setModal(null)}>×</button></div>
            <div className="modal-body">
              <label>Jumlah (IDR)</label>
              <input className="inp" value={amount} onChange={e => setAmount(e.target.value)} placeholder="mis. 50000" />
              <div className="form-msg">QRIS: Rp 10.000 – Rp 500.000. Top-up belum dibayar = tidak ada biaya.</div>
            </div>
            <div className="modal-foot"><button className="btn" disabled={busy} onClick={create}>{busy ? '…' : 'Buat QR'}</button></div>
          </div>
        </div>
      )}

      {modal?.qr && (
        <div className="modal-back" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>Scan QRIS</h3><button className="btn btn-sm" onClick={() => setModal(null)}>×</button></div>
            <div className="modal-body center">
              {modal.qr.qr_svg ? <div dangerouslySetInnerHTML={{ __html: modal.qr.qr_svg }} style={{ width: 220, height: 220 }} /> : <div className="form-msg">QR tidak tersedia</div>}
              <div className="form-msg">Bayar dengan aplikasi apa pun. Lalu klik Refresh di tabel untuk cek status.</div>
            </div>
            <div className="modal-foot"><button className="btn" onClick={() => setModal(null)}>Tutup</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const fmt = s => (s ? String(s).slice(0, 16) : '—');
