#!/usr/bin/env python3
import os, json, time, sys, urllib.request, urllib.error

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
            try:
                j = json.loads(raw)
            except Exception:
                j = raw.decode()[:500]
            return resp.status, j, dict(resp.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            j = json.loads(raw)
        except Exception:
            j = raw.decode()[:500]
        return e.code, j, dict(e.headers)
    except Exception as e:
        return None, str(e), {}

def dog(method, path, body=None):
    st, j, h = req(method, path, body)
    print(f"\n### {method} {path}")
    print(f"STATUS: {st}")
    print("BODY:", json.dumps(j, indent=2)[:2000])
    return st, j

# ---------- 1. GET /me ----------
st, me = dog("GET", "/me")
bal = me.get("balances", {}) if isinstance(me, dict) else {}
print("BALANCES KEYS:", list(bal.keys()) if isinstance(bal, dict) else "n/a")

# ---------- 3. GET /me/data-export ----------
st, exp = dog("GET", "/me/data-export")
exp_keys = list(exp.keys()) if isinstance(exp, dict) else "n/a"
print("EXPORT TOP KEYS:", exp_keys)

# ---------- 4. GET /keys ----------
st, keys = dog("GET", "/keys")
key_list = keys if isinstance(keys, list) else keys.get("keys", keys.get("rows", []))
print("NUM KEYS:", len(key_list) if isinstance(key_list, list) else "n/a")
print("KEY SAMPLE:", json.dumps(key_list[0] if isinstance(key_list, list) and key_list else None, indent=2)[:800])

# ---------- 5-7. Key lifecycle (create -> rotate -> list -> revoke test key) ----------
import uuid
test_key_name = f"audit-test-{int(time.time())}"
st, kc = dog("POST", "/keys", {"name": test_key_name})
kid = None
if isinstance(kc, dict):
    kid = kc.get("id") or kc.get("keyId") or (kc.get("key", {}) or {}).get("id")
print("CREATED KEY ID:", kid, "| raw:", json.dumps(kc)[:400])
if kid:
    time.sleep(1)
    st, kr = dog("POST", f"/keys/{kid}/rotate")
    print("ROTATE RESULT:", json.dumps(kr)[:300])
    time.sleep(1)
    st, kl = dog("GET", "/keys")
    print("AFTER CREATE+ROTATE num keys:", (len(kl) if isinstance(kl, list) else "n/a"))
    time.sleep(1)
    st, kd = dog("DELETE", f"/keys/{kid}")
    print("REVOKE RESULT:", json.dumps(kd)[:300])

# ---------- 8-9. deposit address ----------
dog("GET", "/deposit-address")
dog("POST", "/deposit-address/poll")

# ---------- 10. credit-by-signature (invalid sig test) ----------
st, cbs = dog("POST", "/deposits/credit-by-signature", {"signature": "invalid-sig-123"})
print("NOTE: intentionally invalid signature -> error shape above")

# ---------- 11-14. topups ----------
st, tops = dog("GET", "/topups")
top_list = tops if isinstance(tops, list) else tops.get("topups", tops.get("rows", []))
print("NUM TOPUPS:", len(top_list) if isinstance(top_list, list) else "n/a")
if isinstance(top_list, list) and top_list:
    print("TOPUP SAMPLE:", json.dumps(top_list[0], indent=2)[:600])

tk = None
if isinstance(top_list, list) and top_list:
    tk = top_list[0].get("key") or top_list[0].get("topupKey")
print("EXISTING TOPUP KEY:", tk)

# Create a QRIS topup (min Rp10k) - non-destructive, no charge until paid
st, tc = dog("POST", "/topups", {"amount": 10000, "paymentMethod": "qris"})
print("CREATE TOPUP:", json.dumps(tc)[:600])
new_tk = None
if isinstance(tc, dict):
    new_tk = tc.get("key") or tc.get("topupKey") or (tc.get("topup", {}) or {}).get("key")
print("NEW TOPUP KEY:", new_tk)
if new_tk:
    time.sleep(1)
    dog("GET", f"/topups/{new_tk}/payment")
    time.sleep(1)
    dog("POST", f"/topups/{new_tk}/refresh")

# ---------- 15-19. budgets ----------
st, buds = dog("GET", "/budgets")
print("BUDGETS RAW:", json.dumps(buds, indent=2)[:1500])
st, aliases = dog("GET", "/budgets/aliases")
print("ALIASES RAW:", json.dumps(aliases, indent=2)[:1200])

# Try setting a budget on an existing model, then delete it (cleanup)
picked_model = None
if isinstance(buds, dict):
    arr = buds.get("budgets") or buds.get("rows") or buds.get("items") or []
    if isinstance(arr, list) and arr:
        picked_model = arr[0].get("modelId")
print("PICKED MODEL for budget test:", picked_model)
if picked_model:
    time.sleep(1)
    st, sb = dog("PUT", f"/budgets/{picked_model}", {"maxInputPerMtok": "999", "maxOutputPerMtok": "999", "minDiscountPct": "0", "enabled": True})
    print("SET BUDGET:", json.dumps(sb)[:400])
    time.sleep(1)
    st, db = dog("DELETE", f"/budgets/{picked_model}")
    print("DELETE BUDGET:", json.dumps(db)[:400])

# ---------- 20-23. combos ----------
st, combos = dog("GET", "/combos")
combo_list = combos if isinstance(combos, list) else combos.get("combos", combos.get("rows", []))
print("NUM COMBOS:", len(combo_list) if isinstance(combo_list, list) else "n/a")
if isinstance(combo_list, list) and combo_list:
    print("COMBO SAMPLE:", json.dumps(combo_list[0], indent=2)[:600])

st, avail = dog("GET", "/combos/available-models")
print("AVAILABLE MODELS RAW:", json.dumps(avail, indent=2)[:1200])
avail_ids = []
if isinstance(avail, dict):
    arr = avail.get("models") or avail.get("items") or avail.get("availableModels") or []
    if isinstance(arr, list):
        avail_ids = [m.get("id") or m.get("modelId") for m in arr[:2] if (m.get("id") or m.get("modelId"))]
print("AVAIL MODEL IDS:", avail_ids)

combo_slug = f"audit-test-{int(time.time())}"
if avail_ids:
    st, cc = dog("POST", "/combos", {"name": "Audit Test Combo", "slug": combo_slug, "modelIds": avail_ids, "maxInputPerMtok": "999", "maxOutputPerMtok": "999"})
    print("CREATE COMBO:", json.dumps(cc)[:500])
    cid = None
    if isinstance(cc, dict):
        cid = cc.get("id") or cc.get("comboId") or (cc.get("combo", {}) or {}).get("id")
    print("COMBO ID:", cid)
    if cid:
        time.sleep(1)
        st, dc = dog("DELETE", f"/combos/{cid}")
        print("DELETE COMBO:", json.dumps(dc)[:400])
else:
    print("No available models -> combo creation SKIPPED (document only)")

print("\n\n=== AUDIT COMPLETE ===")