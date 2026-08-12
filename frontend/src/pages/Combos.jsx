import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import Badge from '../components/Badge';
import { SkeletonBlock } from '../components/Skeleton';

export default function Combos() {
  const { data, loading, refetch } = useApi('/api/combos');
  const { data: avail } = useApi('/api/combos/available-models');
  const [modal, setModal] = useState(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const combos = Array.isArray(data) ? data : [];
  const models = Array.isArray(avail) ? avail : [];

  async function create() {
    if (!name.trim() || !slug.trim() || !selected.length) { setMsg('name, slug, model wajib'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/combos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), slug: slug.trim(), model_ids: selected }) });
      const j = await r.json();
      if (r.ok) { setModal(null); setName(''); setSlug(''); setSelected([]); refetch(); setMsg('Combo dibuat ✓ (id didapat via re-sync)'); }
      else setMsg(j.error || 'gagal');
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  async function remove(id) {
    if (!confirm('Hapus combo ini?')) return;
    setBusy(true); setMsg('');
    try {
      await fetch(`/api/combos/${id}`, { method: 'DELETE' });
      refetch(); setMsg('Combo dihapus ✓');
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  function toggle(m) {
    setSelected(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head">
          <div><h2>Combos · bundle produk</h2><div className="sub">{combos.length} combo · model sama dari banyak upstream jadi satu nama</div></div>
          <button className="btn" onClick={() => setModal({ new: true })}>+ Buat combo</button>
        </div>
        <SkeletonBlock loading={loading} rows={4}>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Slug</th><th>Models</th><th className="right">Max in $</th><th>Created</th><th className="right">Aksi</th></tr></thead>
            <tbody>
              {combos.map(c => (
                <tr key={c.id}>
                  <td><span className="prov-name">{c.name}</span><div className="prov-sub">{c.id.slice(0, 8)}…</div></td>
                  <td className="tnum">{c.slug}</td>
                  <td className="tnum faint">{(c.models || []).join(', ')}</td>
                  <td className="right tnum">{c.max_input_per_mtok ?? '—'}</td>
                  <td className="tnum faint">{c.created_at}</td>
                  <td className="right"><button className="btn btn-sm btn-danger" onClick={() => remove(c.id)}>Hapus</button></td>
                </tr>
              ))}
              {!loading && !combos.length && <tr><td colSpan={6} className="dt-empty">Belum ada combo.</td></tr>}
            </tbody>
          </table>
        </SkeletonBlock>
        {msg && <div className="form-msg">{msg}</div>}
      </section>

      {modal?.new && (
        <div className="modal-back" onClick={() => setModal(null)}>
          <div className="modal wide" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>Buat combo baru</h3><button className="btn btn-sm" onClick={() => setModal(null)}>×</button></div>
            <div className="modal-body">
              <label>Name</label>
              <input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="mis. DeepSeek Bundle" />
              <label>Slug (huruf kecil, tanda hubung)</label>
              <input className="inp" value={slug} onChange={e => setSlug(e.target.value)} placeholder="mis. deepseek-bundle" />
              <label>Model ({selected.length} dipilih) — {models.length} tersedia</label>
              <div className="combo-pick">
                {models.map(m => (
                  <button key={m} className={`chip ${selected.includes(m) ? 'on' : ''}`} onClick={() => toggle(m)}>{m}</button>
                ))}
              </div>
            </div>
            <div className="modal-foot"><button className="btn" disabled={busy} onClick={create}>{busy ? '…' : 'Buat combo'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}