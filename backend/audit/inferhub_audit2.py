#!/usr/bin/env python3
import os, json, time, urllib.request, urllib.error

BASE = "https://inferhub.dev/api"
KEY = os.environ["INFERHUB_API_KEY"]
UA = {"Authorization": f"Bearer {KEY}", "User-Agent": "audit/1.0", "Accept": "application/json", "Content-Type": "application/json"}

def req(method, path, body=None, timeout=30):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=UA, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            try: j = json.loads(raw)
            except Exception: j = raw.decode()[:300]
            return resp.status, j
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: j = json.loads(raw)
        except Exception: j = raw.decode()[:300]
        return e.code, j
    except Exception as e:
        return None, str(e)

def dog(method, path, body=None):
    st, j = req(method, path, body)
    print(f"\n### {method} {path} -> {st}")
    print(json.dumps(j, indent=2)[:900])
    return st, j

# Budget lifecycle using upstreamCatalogModelId
st, buds = dog("GET", "/budgets")
model_id = None
if isinstance(buds, list) and buds:
    model_id = buds[0].get("upstreamCatalogModelId")
print("BUDGET MODEL ID:", model_id)
if model_id:
    st, sb = req("PUT", f"/budgets/{model_id}", {"maxInputPerMtok": "9.99", "maxOutputPerMtok": "49.99", "minDiscountPct": "10", "enabled": True})
    print("PUT /budgets/{id} ->", st, json.dumps(sb)[:500])
    time.sleep(1)
    st, gb = req("GET", "/budgets")
    print("VERIFY after set:", st, json.dumps(gb[0] if isinstance(gb,list) and gb else gb)[:700])
    time.sleep(1)
    st, cl = req("PUT", f"/budgets/{model_id}", {"enabled": False})  # clear/null budget back
    print("CLEAR budget ->", st, json.dumps(cl)[:300])

# Combo lifecycle - available-models returns raw array
st, avail = req("GET", "/combos/available-models")
print("AVAIL TYPE:", type(avail).__name__, "len:", len(avail) if isinstance(avail, list) else "n/a")
ids = [m["id"] for m in avail[:2]] if isinstance(avail, list) and avail else []
print("SELECTED MODEL IDS:", ids)
combined_name = "combo-audit-" + str(int(time.time()))
if ids:
    st, cc = req("POST", "/combos", {"name": combined_name, "slug": combined_name, "modelIds": ids, "maxInputPerMtok": "9.99", "maxOutputPerMtok": "49.99"})
    print("POST /combos ->", st, json.dumps(cc)[:500])
    cid = None
    if isinstance(cc, dict):
        cid = cc.get("id") or cc.get("comboId") or (cc.get("combo", {}) or {}).get("id")
    print("NEW COMBO ID:", cid)
    if cid:
        time.sleep(1)
        st, dc = req("DELETE", f"/combos/{cid}")
        print("DELETE /combos/{id} ->", st, json.dumps(dc)[:300])
        time.sleep(1)
        st, gc = req("GET", "/combos")
        print("VERIFY combos after delete:", st, json.dumps(gc)[:400])
print("\nDONE")