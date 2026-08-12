#!/usr/bin/env python3
"""Upstream — company finance dashboard for AI API reselling (InferHub).
Real-time: reads live.json (daemon 30s poll) + ledger.json (assets/impairment/payout)
           + live-history.ndjson (trend). Standalone, production (waitress).
Design system: graphite/charcoal neutral + emerald accent, Inter + tabular-nums,
               sidebar 256px, job-based nav, KPI cards with delta + sparkline, dense tables.
"""
import json
import os
from datetime import datetime, timezone
from flask import Flask, jsonify, render_template_string

BASE = "/home/gamesim/shared-memory/inferhub-business"
LIVE = os.path.join(BASE, "revenue", "live.json")
LEDGER = os.path.join(BASE, "finance", "ledger.json")
HIST = os.path.join(BASE, "revenue", "live-history.ndjson")
PORT = int(os.environ.get("DASH_PORT", "8123"))

app = Flask(__name__)


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


@app.route("/api/data")
def api_data():
    live = load_json(LIVE) or {}
    ledger = load_json(LEDGER) or {}
    bal = live.get("balances", {})
    fleet = live.get("fleet", {})
    meta = ledger.get("meta", {})
    assets = ledger.get("assets", [])
    impairments = ledger.get("impairments", [])
    payouts = ledger.get("payouts", [])

    kurs = meta.get("kurs_idr_usd", 17801)
    total_payout = sum(p.get("usd", 0) for p in payouts)
    total_asset_qty = sum(a.get("qty", 0) for a in assets)
    total_imp_qty = sum(i.get("qty", 0) for i in impairments)
    total_imp_loss = sum(i.get("loss", 0) for i in impairments)
    aktif = max(total_asset_qty - total_imp_qty, 0)
    imp_loss_usd = total_imp_loss / kurs

    from datetime import datetime as _dt
    asof = meta.get("as_of", "2026-08-08")
    try:
        asof_dt = _dt.strptime(asof, "%Y-%m-%d")
    except Exception:
        asof_dt = _dt.now()
    amort_usd = 0.0
    for a in assets:
        try:
            buy = _dt.strptime(a.get("buy", asof), "%Y-%m-%d")
        except Exception:
            buy = asof_dt
        days = max((asof_dt - buy).days, 0)
        frac = min(days / max(a.get("lifespan_d", 30), 1), 1.0)
        cost = a.get("cost_per", 0) * a.get("qty", 0)
        amort_usd += (cost if a.get("curr") == "USD" else cost / kurs) * frac

    opex = 0.10
    net_income = total_payout - amort_usd - imp_loss_usd - opex

    # Trend dari live-history (untuk sparkline earning)
    trend = []
    try:
        with open(HIST) as f:
            for line in f:
                line = line.strip()
                if line:
                    trend.append(json.loads(line))
    except Exception:
        pass
    # ambil sample hingga 40 poin
    step = max(len(trend) // 40, 1)
    ts_series = [t["ts"] for t in trend[::step]][-40:]
    earn_series = [round(t["earnings"], 4) for t in trend[::step]][-40:]

    # Fleet detail + sparkline per upstream (drain trend sederhana dari used%)
    raw = fleet.get("raw", [])
    fleet_rows = []
    for p in raw:
        slug = p.get("upstreamSlug")
        if slug == "codebuddy-cn":
            continue
        fleet_rows.append({
            "id": p.get("id"),
            "slug": slug,
            "label": p.get("upstreamLabel", slug),
            "name": p.get("displayName"),
            "status": p.get("apiKeyCheckStatus"),
            "enabled": p.get("enabled"),
            "used_pct": p.get("observedUsedPct"),
            "limit_tokens": p.get("observedLimitTokens"),
            "reset": (p.get("observedResetAt") or "")[:10],
            "drained": bool(p.get("drainedUntil")),
            "earnings": float(p.get("earningsLifetimeUsdc", 0)),
        })

    return jsonify({
        "ts": live.get("ts"),
        "refreshed": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        "account": live.get("account", {}),
        "balances": bal,
        "fleet_summary": {
            "total": fleet.get("total", 0),
            "ok_total": fleet.get("ok_total", 0),
            "ok_by_upstream": fleet.get("ok_by_upstream", {}),
            "rows": fleet_rows,
        },
        "trend": {"ts": ts_series, "earnings_usdc": earn_series},
        "finance": {
            "kurs": kurs, "total_payout": total_payout, "n_payout": len(payouts),
            "total_asset_qty": total_asset_qty, "total_imp_qty": total_imp_qty,
            "aktif": aktif, "total_imp_loss_usd": round(imp_loss_usd, 2),
            "amort_usd": round(amort_usd, 2), "opex": opex,
            "net_income": round(net_income, 2),
        },
    })


HTML = """<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upstream</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#0e1116; --surface:#151a21; --surface2:#1a2028; --border:#242b36; --border-strong:#2f3846;
    --text:#e7ebf2; --text2:#9aa4b5; --text3:#6b7688;
    --accent:#2dd4a7; /* emerald/teal — growth + crypto-neutral */
    --accent2:#1f8f77; --accent-soft:rgba(45,212,167,.12);
    --pos:#34d399; --neg:#f87171; --warn:#fbbf24;
    --radius:10px; --radius-sm:6px;
    --sidebar:256px;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{background:var(--bg);color:var(--text);font-family:'Inter',system-ui,-apple-system,sans-serif;
       font-feature-settings:'tnum' 1; -webkit-font-smoothing:antialiased; font-size:14px; line-height:1.5}
  .num{font-variant-numeric:tabular-nums; font-feature-settings:'tnum' 1}
  .layout{display:flex; min-height:100vh}
  /* ── SIDEBAR 256px ── */
  .sidebar{width:var(--sidebar); flex-shrink:0; background:var(--surface); border-right:1px solid var(--border);
           display:flex; flex-direction:column; padding:20px 16px; position:sticky; top:0; height:100vh}
  .brand{display:flex; align-items:center; gap:10px; padding:0 8px 22px; border-bottom:1px solid var(--border)}
  .brand-mark{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent2));
             display:grid;place-items:center;color:#06231c;font-weight:700;font-size:16px}
  .brand-name{font-weight:700;font-size:16px;letter-spacing:-.01em}
  .brand-sub{font-size:11px;color:var(--text3);font-weight:500;letter-spacing:.03em;text-transform:uppercase}
  .nav{flex:1;padding:16px 0;display:flex;flex-direction:column;gap:2px}
  .nav-label{font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;font-weight:600;padding:14px 8px 6px}
  .nav a{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--radius-sm);color:var(--text2);
         text-decoration:none;font-weight:500;font-size:13.5px;transition:background .12s,color .12s}
  .nav a:hover{background:var(--surface2);color:var(--text)}
  .nav a.active{background:var(--accent-soft);color:var(--accent);font-weight:600}
  .nav .ico{width:16px;height:16px;display:grid;place-items:center;color:var(--text3)}
  .nav a.active .ico{color:var(--accent)}
  .side-foot{padding:14px 8px;border-top:1px solid var(--border);font-size:11.5px;color:var(--text3)}
  .side-foot .act{color:var(--text);font-weight:600;margin-bottom:2px}
  /* ── MAIN ── */
  .main{flex:1;padding:26px 32px;max-width:1280px}
  .top{display:flex;align-items:baseline;gap:14px;margin-bottom:24px;flex-wrap:wrap}
  .crumbs{font-size:13px;color:var(--text3)}
  .crumbs b{color:var(--text);font-weight:600}
  h1{font-size:20px;font-weight:650;letter-spacing:-.015em}
  .live-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;
             background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
  .live-pill i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:pulse 2.2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
  .clock{margin-left:auto;color:var(--text3);font-size:12px;font-variant-numeric:tabular-nums}
  .range{display:flex;align-items:center;gap:4px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:2px;background:var(--surface)}
  .range button{border:none;background:transparent;color:var(--text3);padding:5px 11px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:500}
  .range button.on{background:var(--accent-soft);color:var(--accent)}
  /* ── KPI CARDS (asymmetric grid — bukan seragam) ── */
  .kpis{display:grid;grid-template-columns:repeat(12,1fr);gap:14px;margin-bottom:24px}
  .kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px 18px 14px;display:flex;flex-direction:column}
  .kpi.feature{grid-column:span 5}
  .kpi.std{grid-column:span 3}
  .kpi .k-label{font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;font-weight:600}
  .kpi .k-value{font-size:30px;font-weight:700;letter-spacing:-.02em;margin-top:8px;line-height:1.1;font-variant-numeric:tabular-nums}
  .kpi .k-context{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;color:var(--text3)}
  .kpi .delta{display:inline-flex;align-items:center;gap:3px;font-weight:600;font-size:12px}
  .kpi .delta.up{color:var(--pos)} .kpi .delta.down{color:var(--neg)}
  .kpi .spark{margin-top:10px;height:28px}
  /* ── TABEL ── */
  .panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
  .panel-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)}
  .panel-head h2{font-size:13px;font-weight:600;color:var(--text);letter-spacing:-.005em}
  .panel-head .sub{font-size:12px;color:var(--text3);margin-top:2px}
  table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
  th,td{text-align:left;padding:11px 20px;border-bottom:1px solid var(--border);font-size:13px}
  th{color:var(--text3);font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;white-space:nowrap}
  tr:last-child td{border-bottom:none}
  tbody tr:hover{background:rgba(255,255,255,.015)}
  .badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600}
  .badge.ok{color:var(--pos);background:rgba(52,211,153,.1)}
  .badge.invalid{color:var(--neg);background:rgba(248,113,113,.1)}
  .badge.drained{color:var(--warn);background:rgba(251,191,36,.1)}
  .badge.off{color:var(--text3);background:rgba(155,168,181,.1)}
  .uproot{color:var(--text2);font-weight:500}
  .earn{font-weight:600;color:var(--text)}
  .right{text-align:right}
  .muted{color:var(--text3)}
  .grid2{display:grid;grid-template-columns:3fr 2fr;gap:16px;margin-top:16px;align-items:start}
  .grid2 > div{display:flex;flex-direction:column}
  .grid2 .panel{display:flex;flex-direction:column}
  .pnl{display:flex;flex-direction:column}
  .pnl .pl-row{display:flex;justify-content:space-between;align-items:center;padding:13px 20px;border-bottom:1px solid var(--border);font-size:13.5px}
  .pl-row .lbl{color:var(--text2)}
  .pl-row .amt{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
  .pl-row.total{background:var(--surface2);border-radius:0 0 var(--radius) var(--radius)}
  .pos{color:var(--pos)} .neg{color:var(--neg)}
  .cur {font-size:11px;color:var(--text3);font-weight:500;margin-left:4px}
  .up-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;padding:14px 20px;border-bottom:1px solid var(--border);background:var(--surface2)}
  .upsum{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;background:var(--surface);flex-wrap:wrap}
  .upsum .u-name{font-weight:600;color:var(--text);display:flex;align-items:center;gap:6px}
  .upsum .u-name small{color:var(--text3);font-size:11px;font-weight:500}
  .upsum .counts{display:flex;gap:6px;flex-wrap:wrap}
  .upsum .sm{font-size:11px;font-weight:600;padding:1px 7px;border-radius:99px;white-space:nowrap}
  .upsum .sm.t{color:var(--text2);background:rgba(155,168,181,.12)}
  .upsum .sm.ok{color:var(--pos);background:rgba(52,211,153,.12)}
  .upsum .sm.warn{color:var(--warn);background:rgba(251,191,36,.14)}
  .upsum .sm.bad{color:#fca5a5;background:rgba(248,113,113,.15)}
  .panel-foot{display:flex;justify-content:space-between;align-items:center;padding:10px 20px;color:var(--text3);font-size:12px;border-top:1px solid var(--border)}
  @media(max-width:960px){ .grid2{grid-template-columns:1fr} .kpi.feature,.kpi.std{grid-column:span 12} .sidebar{display:none} }
</style>
</head>
<body>
<div class="layout">
  <!-- SIDEBAR -->
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">◧</div>
      <div><div class="brand-name">Upstream</div><div class="brand-sub">Operations</div></div>
    </div>
    <nav class="nav">
      <div class="nav-label">Overview</div>
      <a class="active" href="#"><span class="ico">◆</span>Dashboard</a>
      <div class="nav-label">Operations</div>
      <a href="#"><span class="ico">↗</span>Earnings</a>
      <a href="#"><span class="ico">⇄</span>Upstreams</a>
      <a href="#"><span class="ico">≡</span>P&amp;L</a>
      <a href="#"><span class="ico">●</span>Settlements</a>
      <div class="nav-label">System</div>
      <a href="#"><span class="ico">⚙</span>Settings</a>
    </nav>
    <div class="side-foot">
      <div class="act" id="acct">Ssnford</div>
      <div id="acct-sub">InferHub · publisher</div>
    </div>
  </aside>

  <!-- MAIN -->
  <main class="main">
    <div class="top">
      <div>
        <div class="crumbs"><b>Dashboard</b> / Overview</div>
        <h1>Operations overview</h1>
      </div>
      <span class="live-pill"><i></i>Live</span>
      <span class="clock" id="clock">—</span>
      <div class="range" role="tablist" aria-label="Periode">
        <button class="on" >24h</button><button>7d</button><button>30d</button><button>All</button>
      </div>
    </div>

    <!-- KPI — asymmetric -->
    <div class="kpis">
      <div class="kpi feature"><div class="k-label">Publisher earning · USDC</div>
        <div class="k-value" id="k-earn">—</div>
        <div class="k-context"><span class="delta up">↑</span><span id="k-earn-ctx"></span></div>
        <svg class="spark" id="s-earn" preserveAspectRatio="none"></svg></div>
      <div class="kpi std"><div class="k-label">Fiat pending</div>
        <div class="k-value" id="k-fiat">—</div><div class="k-context"><span class="muted" id="k-fiat-ctx">settlement</span></div></div>
      <div class="kpi std"><div class="k-label">Fleet active</div>
        <div class="k-value" id="k-fleet">—</div><div class="k-context"><span class="delta up" id="k-fleet-delta">ok</span><span class="muted" id="k-fleet-ctx"></span></div></div>
      <div class="kpi std"><div class="k-label">Net income</div>
        <div class="k-value" id="k-net">—</div><div class="k-context"><span class="muted" id="k-net-ctx">P&amp;L</span></div></div>
      <div class="kpi std"><div class="k-label">Total payout</div>
        <div class="k-value" id="k-tp">—</div><div class="k-context"><span class="muted" id="k-tp-ctx">13 settlements</span></div></div>
    </div>

    <div class="grid2">
      <!-- FLEET TABLE -->
      <div class="panel">
        <div class="panel-head"><div><h2>Upstream fleet</h2><div class="sub" id="fleet-sub">—</div></div></div>
        <div class="up-summary" id="up-summary"></div>
        <table>
          <thead><tr>
            <th>Provider</th><th>Status</th><th>Usage</th><th>Reset</th><th class="right">Earnings</th>
          </tr></thead>
          <tbody id="fleet-body">
            <tr><td colspan="5" class="muted" style="padding:24px">Loading…</td></tr>
          </tbody>
        </table>
        <div class="panel-foot"><span id="fleet-count">—</span><span id="fleet-more"></span></div>
      </div>

      <!-- P&L -->
      <div>
        <div class="panel">
          <div class="panel-head"><div><h2>Profit &amp; loss</h2><div class="sub" id="pnl-sub">period to date</div></div></div>
          <div class="pnl">
            <div class="pl-row"><span class="lbl">Revenue · settlements</span><span class="amt" id="pl-rev">—</span></div>
            <div class="pl-row"><span class="lbl">Asset amortization</span><span class="amt neg" id="pl-amort">—</span></div>
            <div class="pl-row"><span class="lbl">Impairment · dead accounts</span><span class="amt neg" id="pl-imp">—</span></div>
            <div class="pl-row"><span class="lbl">Operating expense</span><span class="amt neg" id="pl-opex">—</span></div>
            <div class="pl-row total"><span class="lbl">Net income</span><span class="amt" id="pl-net">—</span></div>
            <div class="pl-row"><span class="lbl">FX rate</span><span class="amt muted" id="pl-kurs">—</span></div>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>

<script>
const usd = v => '$' + (v==null?'0.00':Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
const set=(id,tx,cls)=>{const e=document.getElementById(id);e.textContent=tx;if(cls)e.className=cls;};
function spark(id, data, color){
  const el=document.getElementById(id); if(!el||!data||data.length<2){return;}
  const w=el.clientWidth||120,h=28,min=Math.min(...data),max=Math.max(...data),r=max-min||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1)*w).toFixed(1)},${(h-2-((v-min)/r*(h-4))).toFixed(1)}`);
  el.innerHTML=`<polyline fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"/>`;
}
async function refresh(){
  try{
    const d=await(await fetch('/api/data')).json();
    document.getElementById('clock').textContent='updated '+d.refreshed+' UTC';
    set('acct',d.account.displayName); set('acct-sub',d.account.email||'InferHub');
    // KPI
    set('k-earn',usd(d.balances.publisher_earnings));
    set('k-earn-ctx', usd(d.balances.fiat_pendings)+' fiat pending');
    spark('s-earn', d.trend.earnings_usdc, '#2dd4a7');
    set('k-fiat',usd(d.balances.fiat_pendings));
    set('k-fleet', d.fleet_summary.ok_total+' / '+d.fleet_summary.total);
    set('k-fleet-ctx', 'ok / total providers');
    set('k-net',usd(d.finance.net_income)); document.getElementById('k-net').style.color=d.finance.net_income>=0?'var(--pos)':'var(--neg)';
    set('k-tp',usd(d.finance.total_payout));
    // fleet table
    const rows=d.fleet_summary.rows||[];
    document.getElementById('fleet-sub').textContent = rows.length+' providers';
    // summary strip per upstream: total, ok, drained, invalid
    const sum = {}; rows.forEach(r=>{ sum[r.slug]=sum[r.slug]||{t:0,ok:0,dr:0,inv:0}; const s=sum[r.slug]; s.t++; s[r.status==='invalid'?'inv':r.drained&&r.status==='ok'?'dr':'ok']++; });
    document.getElementById('up-summary').innerHTML = Object.entries(sum).map(([k,v])=>
      `<div class="upsum"><div class="u-name">${k}</div><div class="counts">
        <span class="sm t">${v.t}</span><span class="sm ok">${v.ok} ok</span>
        ${v.dr?`<span class="sm warn">${v.dr} drained</span>`:''}${v.inv?`<span class="sm bad">${v.inv} invalid</span>`:''}
      </div></div>`).join('');
    document.getElementById('fleet-count').textContent = rows.length+' providers';
    const rowHtml = r=>{
      let b='off', bl=r.status; if(r.status==='ok'&&r.drained){b='drained';bl='drained';} else if(r.status==='ok'){b='ok';bl='ok';} else if(r.status==='invalid'){b='invalid';bl='invalid';}
      const used = r.used_pct==null?'—':r.used_pct+'%';
      return `<tr><td><div class="uproot">${r.name}</div><div class="muted" style="font-size:11px">${r.slug} · ${r.label}</div></td>
        <td><span class="badge ${b}">${bl}</span></td>
        <td class="num">${used}</td><td class="num muted">${r.reset||'—'}</td>
        <td class="right earn">${usd(r.earnings)}</td></tr>`;
    };
    document.getElementById('fleet-more').textContent = rows.length>24 ? `show all (${rows.length})` : '';
    document.getElementById('fleet-more').onclick = ()=>{ document.getElementById('fleet-body').innerHTML = rows.map(rowHtml).join(''); };
    document.getElementById('fleet-body').innerHTML = rows.slice(0,24).map(rowHtml).join('');
    // P&L
    set('pl-rev',usd(d.finance.total_payout));
    set('pl-amort','('+usd(d.finance.amort_usd)+')');
    set('pl-imp','('+usd(d.finance.total_imp_loss_usd)+')');
    set('pl-opex','('+usd(d.finance.opex)+')');
    const net=d.finance.net_income;
    const ne=document.getElementById('pl-net'); ne.textContent=usd(net); ne.className='amt '+(net>=0?'pos':'neg');
    set('pl-kurs','Rp '+Number(d.finance.kurs).toLocaleString('id-ID'));
  }catch(e){document.getElementById('clock').textContent='⚠ '+e;}
}
refresh(); setInterval(refresh,15000);
</script>
</body>
</html>
"""


@app.route("/")
def index():
    return render_template_string(HTML)


if __name__ == "__main__":
    from waitress import serve
    serve(app, host="0.0.0.0", port=PORT, threads=8)
