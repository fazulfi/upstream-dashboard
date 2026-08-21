import React, { useMemo, useState } from 'react';
import { apiFetch } from '../hooks/useApi';

const fieldNames = ['max_ask_pct', 'platform_fee_pct', 'publisher_share_pct'];

function actionKey(prefix, value) {
  return `${prefix}-${value}`;
}

function idempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pricing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numberValue(value) {
  return value == null || value === '' ? '' : Number(value);
}

function formatValue(value) {
  return value == null || value === '' ? '—' : Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export default function PricingPage({ globals = {}, overrides = [], orderbook = [], onChanged }) {
  const [globalForms, setGlobalForms] = useState({});
  const [overrideForm, setOverrideForm] = useState({ upstream: '', model_id: '', trigger_pct: '' });
  const [askForm, setAskForm] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState('');

  const upstreamNames = useMemo(() => Object.keys(globals).sort(), [globals]);
  const overrideRows = Array.isArray(overrides) ? overrides : [];
  const orderbookRows = Array.isArray(orderbook) ? orderbook : [];

  const updateGlobalForm = (upstream, field, value) => {
    setGlobalForms(prev => ({
      ...prev,
      [upstream]: { ...(prev[upstream] || globals[upstream]), [field]: value },
    }));
  };

  const saveGlobal = async upstream => {
    const cfg = { ...(globals[upstream] || {}), ...(globalForms[upstream] || {}) };
    if (!(Number(cfg.max_ask_pct) > 0)) {
      setMessage(`Error: ${upstream} max_ask_pct harus > 0`);
      return;
    }
    const key = actionKey('global', upstream);
    setBusy(key); setMessage('');
    try {
      const response = await apiFetch('/api/pricing/global', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({
          upstream,
          ...fieldNames.reduce((out, field) => ({ ...out, [field]: numberValue(cfg[field]) }), {}),
          global_trigger_pct: numberValue(cfg.global_trigger_pct),
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      setMessage(`✓ ${upstream} global config tersimpan`);
      setGlobalForms(prev => { const next = { ...prev }; delete next[upstream]; return next; });
      onChanged?.();
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setBusy(null); }
  };

  const saveOverride = async event => {
    event.preventDefault();
    const { upstream, model_id, trigger_pct } = overrideForm;
    if (!upstream || !model_id || !(Number(trigger_pct) > 0)) {
      setMessage('Error: upstream, model_id, dan trigger_pct valid wajib diisi');
      return;
    }
    setBusy('override-new'); setMessage('');
    try {
      const response = await apiFetch('/api/auto-pricing/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({ upstream, model_id, trigger_pct: Number(trigger_pct) }),
      });
      const data = await response.json();
      if (!response.ok || data.error || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      setMessage(`✓ ${upstream}/${model_id} override tersimpan`);
      setOverrideForm({ upstream: '', model_id: '', trigger_pct: '' });
      onChanged?.();
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setBusy(null); }
  };

  const deleteOverride = async override => {
    if (!override.id) return;
    const key = actionKey('delete', override.id);
    setBusy(key); setMessage('');
    try {
      const response = await apiFetch(`/api/auto-pricing/config/${override.id}`, {
        method: 'DELETE', headers: { 'Idempotency-Key': idempotencyKey() },
      });
      const data = await response.json();
      if (!response.ok || data.error || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      setMessage(`✓ ${override.upstream}/${override.model_id} override dihapus`);
      onChanged?.();
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setBusy(null); }
  };

  const openAskForm = row => {
    const upstream = (row.upstreams || []).find(u => u.is_ours) || (row.upstreams || [])[0];
    setAskForm({
      model_id: row.model_id,
      upstream: upstream?.slug || row.upstream || '',
      upstream_catalog_model_id: upstream?.upstream_catalog_model_id || row.upstream_catalog_model_id || row.model_id,
      ask_input_per_mtok: row.our_ask ?? row.ask ?? '',
      ask_output_per_mtok: row.our_ask ?? row.ask ?? '',
    });
    setMessage('');
  };

  const saveAsk = async event => {
    event.preventDefault();
    const { upstream, upstream_catalog_model_id, ask_input_per_mtok, ask_output_per_mtok } = askForm;
    if (!upstream || !upstream_catalog_model_id || !(Number(ask_input_per_mtok) > 0)) {
      setMessage('Error: upstream dan ask input per Mtok valid wajib diisi');
      return;
    }
    setBusy('ask-set'); setMessage('');
    try {
      const response = await apiFetch('/api/ask', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({
          upstream_catalog_model_id,
          upstream_slug: upstream,
          ask_input_per_mtok: Number(ask_input_per_mtok),
          ask_output_per_mtok: Number(ask_output_per_mtok) > 0 ? Number(ask_output_per_mtok) : Number(ask_input_per_mtok),
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      setMessage(`✓ ${upstream} ask tersimpan`);
      setAskForm(null);
      onChanged?.();
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setBusy(null); }
  };

  return (
    <div className="page pricing-page" aria-label="Pricing control plane">
      <div className="page-head"><div><div className="eyebrow">Publisher / Control plane</div><h2>Pricing Control</h2><div className="sub">Global economics, model-specific automation, and the merged ask orderbook.</div></div></div>
      {message && <div className={message.startsWith('Error') ? 'batch-note pricing-error' : 'batch-note'} role="status">{message}</div>}

      <section className="panel pricing-section">
        <div className="panel-head"><div><h3>Global per Upstream</h3><div className="sub">Caps, revenue shares, and the default trigger band applied to every model of this upstream.</div></div></div>
        <div className="pricing-global-grid">
          {upstreamNames.map(upstream => {
            const cfg = { ...globals[upstream], ...(globalForms[upstream] || {}) };
            const key = actionKey('global', upstream);
            return <div className="pricing-global" key={upstream}>
              <div className="pricing-row-head"><strong>{upstream}</strong><button className="btn btn-sm btn-primary" onClick={() => saveGlobal(upstream)} disabled={busy?.startsWith('global-')}>Simpan</button></div>
              {[...fieldNames, 'global_trigger_pct'].map(field => <label className="pricing-field" key={field}><span>{field}</span><input type="number" step="0.0001" value={cfg[field] ?? ''} onChange={event => updateGlobalForm(upstream, field, event.target.value)} /></label>)}
              {busy === key && <span className="pricing-saving">Menyimpan…</span>}
            </div>;
          })}
          {!upstreamNames.length && <div className="dt-empty">Belum ada konfigurasi upstream.</div>}
        </div>
      </section>

      <section className="panel pricing-section">
        <div className="panel-head"><div><h3>Per-Model Override</h3><div className="sub">Override the trigger band for a specific upstream/model pair.</div></div></div>
        <form className="pricing-override-form" onSubmit={saveOverride}>
          {['upstream', 'model_id', 'trigger_pct'].map(field => <label className="pricing-field" key={field}><span>{field}</span><input type={field.endsWith('_pct') ? 'number' : 'text'} step={field.endsWith('_pct') ? '0.0001' : undefined} value={overrideForm[field]} onChange={event => setOverrideForm(prev => ({ ...prev, [field]: event.target.value }))} /></label>)}
          <button className="btn btn-primary" type="submit" disabled={busy === 'override-new'}>{busy === 'override-new' ? 'Menyimpan…' : 'Tambah override'}</button>
        </form>
        <div className="table-scroll"><table className="tbl"><thead><tr><th>Upstream / model</th><th>trigger_pct</th><th>updated_at</th><th>Aksi</th></tr></thead><tbody>
          {overrideRows.map(override => { const key = actionKey('delete', override.id); return <tr key={`${override.upstream}-${override.model_id}`}><td>{override.upstream} / {override.model_id}</td><td className="tnum">{formatValue(override.trigger_pct)}</td><td className="faint">{override.updated_at || '—'}</td><td><button className="btn btn-sm btn-danger" onClick={() => deleteOverride(override)} disabled={!override.id || busy === key}>Hapus</button></td></tr>; })}
          {!overrideRows.length && <tr><td colSpan={4} className="dt-empty">Belum ada override tersimpan.</td></tr>}
        </tbody></table></div>
      </section>

      <section className="panel pricing-section">
        <div className="panel-head"><div><h3>Orderbook · merged asks + auto-pricing</h3><div className="sub">Our asks are marked separately from competitor levels. Set a manual ask per upstream — note: auto-pricing remains authoritative while armed.</div></div></div>
        <div className="table-scroll"><table className="tbl"><thead><tr><th>Model</th><th>Min ask</th><th>Max ask</th><th>Spread</th><th>Our ask</th><th>Levels</th><th>Aksi</th></tr></thead><tbody>
          {orderbookRows.map(row => <tr key={row.model_id}><td><strong>{row.label || row.model_id}</strong><div className="prov-sub">{row.model_id}</div></td><td className="tnum">{formatValue(row.min_ask ?? row.ask)}</td><td className="tnum">{formatValue(row.max_ask)}</td><td className="tnum">{formatValue(row.spread)}</td><td className="tnum pos">{formatValue(row.our_ask)}</td><td><div className="pricing-levels">{(row.upstreams || []).flatMap(upstream => (upstream.levels || []).map((level, index) => <span className={upstream.is_ours ? 'pricing-level ours' : 'pricing-level'} key={`${upstream.slug}-${index}`}>{formatValue(level.price)} · {upstream.is_ours ? 'ours' : upstream.label || upstream.slug}</span>))}{!row.upstreams?.length && row.ask != null && <span className="pricing-level">ask: {formatValue(row.ask)}</span>}</div></td><td><button className="btn btn-sm" onClick={() => openAskForm(row)}>Set manual ask</button></td></tr>)}
          {!orderbookRows.length && <tr><td colSpan={7} className="dt-empty">Belum ada data orderbook.</td></tr>}
        </tbody></table></div>
        {askForm && <form className="pricing-ask-form" onSubmit={saveAsk}>
          <div className="pricing-ask-head"><strong>Set manual ask — {askForm.upstream} / {askForm.model_id}</strong></div>
          <label className="pricing-field"><span>upstream</span><input type="text" value={askForm.upstream} onChange={event => setAskForm(prev => ({ ...prev, upstream: event.target.value }))} /></label>
          <label className="pricing-field"><span>ask input per Mtok</span><input type="number" step="0.0001" value={askForm.ask_input_per_mtok} onChange={event => setAskForm(prev => ({ ...prev, ask_input_per_mtok: event.target.value }))} /></label>
          <label className="pricing-field"><span>ask output per Mtok</span><input type="number" step="0.0001" value={askForm.ask_output_per_mtok} onChange={event => setAskForm(prev => ({ ...prev, ask_output_per_mtok: event.target.value }))} /></label>
          <div className="pricing-ask-actions"><button className="btn btn-primary" type="submit" disabled={busy === 'ask-set'}>{busy === 'ask-set' ? 'Menyimpan…' : 'Simpan ask'}</button><button className="btn" type="button" onClick={() => setAskForm(null)}>Batal</button></div>
        </form>}
      </section>
    </div>
  );
}
