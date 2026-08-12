import { useState } from 'react';
import { useApi, apiFetch } from '../hooks/useApi';
import Badge from '../components/Badge';
import { SkeletonBlock } from '../components/Skeleton';

export default function Keys() {
  const { data, loading, refetch } = useApi('/api/keys');
  const [modal, setModal] = useState(null); // {name} | {created}
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const keys = Array.isArray(data) ? data : [];

  async function create() {
    if (!name.trim()) return;
    setBusy(true); setMsg('');
    try {
      const r = await apiFetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
      const j = await r.json();
      if (r.ok && j.id) { setModal({ created: j }); setName(''); refetch(); }
      else setMsg(j.error || 'gagal buat key');
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  async function rotate(id) {
    if (!confirm('Rotate key ini? Key lama tetap aktif 24 jam (grace).')) return;
    setBusy(true); setMsg('');
    try {
      const r = await apiFetch(`/api/keys/${id}/rotate`, { method: 'POST' });
      const j = await r.json();
      if (r.ok && j.id) { setModal({ created: j }); refetch(); }
      else setMsg('rotate gagal');
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  async function revoke(id) {
    if (!confirm('Revoke key ini? Akses langsung mati, tidak bisa dibatalkan.')) return;
    setBusy(true); setMsg('');
    try {
      await apiFetch(`/api/keys/${id}`, { method: 'DELETE' });
      refetch();
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head">
          <div><h2>API keys</h2><div className="sub">{keys.length} key · dari InferHub (secret hanya tampil sekali)</div></div>
          <button className="btn" onClick={() => setModal({ name: true })}>+ Buat key</button>
        </div>
        <SkeletonBlock loading={loading} rows={4}>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Created</th><th>Last used</th><th>Status</th><th className="right">Aksi</th></tr></thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id}>
                  <td><span className="prov-name">{k.name}</span><div className="prov-sub">{k.id.slice(0, 8)}…</div></td>
                  <td className="tnum">{k.key_prefix}</td>
                  <td className="tnum faint">{(k.scopes || []).join(', ')}</td>
                  <td className="tnum faint">{fmt(k.created_at)}</td>
                  <td className="tnum faint">{fmt(k.last_used_at)}</td>
                  <td>{k.expires_at ? <Badge kind="drained">rotating</Badge> : <Badge kind="ok">active</Badge>}</td>
                  <td className="right">
                    <button className="btn btn-sm" onClick={() => rotate(k.id)}>Rotate</button>{' '}
                    <button className="btn btn-sm btn-danger" onClick={() => revoke(k.id)}>Revoke</button>
                  </td>
                </tr>
              ))}
              {!loading && !keys.length && <tr><td colSpan={7} className="dt-empty">Belum ada key.</td></tr>}
            </tbody>
          </table>
        </SkeletonBlock>
        {msg && <div className="form-msg">{msg}</div>}
      </section>

      {modal?.name && (
        <div className="modal-back" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>Buat API key baru</h3><button className="btn btn-sm" onClick={() => setModal(null)}>×</button></div>
            <div className="modal-body">
              <label>Nama key</label>
              <input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="mis. reseller-a" />
              <div className="form-msg">Secret hanya ditampilkan SEKALI saat dibuat — simpan baik-baik.</div>
            </div>
            <div className="modal-foot"><button className="btn" disabled={busy} onClick={create}>{busy ? '…' : 'Buat'}</button></div>
          </div>
        </div>
      )}

      {modal?.created && (
        <div className="modal-back" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>Key dibuat — SALIN SEKARANG</h3><button className="btn btn-sm" onClick={() => setModal(null)}>×</button></div>
            <div className="modal-body">
              <div className="secret-box">{modal.created.secret || '(secret di-redact API — cek dashboard InferHub)'}</div>
              <div className="form-msg">Secret tidak bisa dilihat lagi. Rotate 24h grace jika bocor.</div>
            </div>
            <div className="modal-foot"><button className="btn" onClick={() => setModal(null)}>Selesai</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const fmt = s => (s ? String(s).slice(0, 10) : '—');
