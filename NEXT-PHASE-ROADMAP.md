# Post-MVP Roadmap — Phase 2, 3, 4 (Authoritative Plan)

**Repository:** `fazulfi/upstream-dashboard`
**Baseline:** `main` @ `234a8bd` (Phase 1 complete: PRs #2–#13 merged)
**Status:** Planning document. Does NOT authorize deployment or production changes by itself; each phase requires its own implementation plan + user approval before execution.

---

## Roadmap (otoritatif, dari sesi perencanaan asli)

1. ~~Phase 1 — Reliability~~ ✅ **SELESAI** (37/37 kriteria, deployed & verified)
2. **Phase 2 — Production Hardening** ← berikutnya
3. **Phase 3 — Finance & Profitability**
4. **Phase 4 — Dashboard Control Plane**

> Setiap phase: buat implementation plan sendiri → PR dulu (CI tanpa CD) → deploy VPS → production lock + release evidence.

---

## Phase 2 — Production Hardening

**Goal:** Reduce operational risk without changing the pricing algorithm or introducing unnecessary infrastructure.

### P1. SSE transport decision (documented architecture note)

- **Problem:** Dashboard realtime memakai fetch-based SSE karena `EventSource` native tidak bisa mengirim header `Authorization` (bearer).
- **Decision to record:** fetch-based SSE adalah keputusan arsitektur yang disengaja. Migrasi ke `EventSource` native di masa depan WAJIB lewat cookie credential atau short-lived token flow dengan logging/redaction review.
- **Deliverable:** catatan arsitektur eksplisit (mis. `docs/architecture/sse-transport.md`) + referensi dari README.

### P2. Frontend page-level test coverage

- **Problem:** Coverage halaman routed dashboard = **0%**. Yang ada hanya hook/library/component tests.
- **Deliverable:** page-level tests untuk permukaan dashboard yang di-route (login/session expiry, landing reliability, error states, responsive navigation) — minimal critical paths, naikkan coverage bertahap.

### P3. Deployment evidence + rollback automation

- **Deliverable:** definisi + otomasi:
  - backup/restore rehearsal (teruji)
  - service uniqueness check (single daemon PID)
  - heartbeat freshness check
  - SSE reconnect/recovery check
  - rollback procedure terdokumentasi (VPS `git pull --ff-only` + restart, revert commit)
- **Gate:** evidence dari tiap deploy disimpan sebagai artifact.

### P4. Credential git-history purge

- **Problem:** material credential lama masih ada di git history.
- **Constraint:** `git filter-repo` HANYA sebagai operasi repository-maintenance terpisah yang disetujui eksplisit. Rotate/revoke credential dulu. **Jangan force-push dalam feature work biasa.**
- **Note:** password aktif sudah di-rotate (yang lama invalid/401); purge = defense-in-depth, bukan darurat.

### P5. Ignored-artifacts audit

- **Deliverable:** pastikan tetap untracked: `.venv-test`, `__pycache__`, pytest caches, coverage output, frontend `node_modules`, `dist`, `.vercel`, `frontend/.env.local`, dan env files.
- **Include:** audit file yang terlanjur tracked tapi tidak seharusnya (dipindah ke gitignore + hapus dari index bila ada).

---

## Phase 3 — Finance & Profitability

**Goal:** Make profitability reporting trustworthy, explainable, and operationally useful.

### F1. Single source of truth (dual-source risk)

- **Problem:** ada dual-source-of-truth (DB finance vs generated ledger.json/workbook).
- **Decision:** DB PostgreSQL (`memory` schema) = authoritative. `ledger.json` = synced mirror/output, bukan input tandingan.
- **Deliverable:** dokumentasi jalur otoritatif untuk asset inventory, ledger input, generated workbook output, dan derived P&L views.

### F2. Preserve + reconcile inventory

- **Constraint:** saat ini 67 assets (A-001..A-069; A-001..A-060 dari sebelum, A-061..A-069 CAPEX terbaru). Jangan kehilangan data.
- **Deliverable:** reconciliation checks antara DB records, finance generation scripts, dan dashboard totals; variance reporting.

### F3. Rule engine + fixture tests

- **Deliverable:** aturan eksplisit (period, currency, kurs/exchange-rate, refund, impairment, payout, amortization, rounding) dengan fixture-backed tests.
- **Catatan terkini:** kurs live sudah wajib per-row (`kurs_idr_usd` per asset, ledger_meta updated; backfill 17824.4344; PR #13 memperbaiki CLI agar menulis kurs otomatis).

### F4. Decision-grade finance

- **Deliverable:** reconciliation/variance reporting + restore-tested backup evidence SEBELUM metrik finance dianggap decision-grade.
- **Deliverable:** mutasi finance auditable; generated artifacts = outputs, bukan competing inputs.

---

## Phase 4 — Dashboard Control Plane

**Goal:** Safely expose operational controls and decision support in the dashboard.

### C1. Build on existing surface

- Build on reliability landing page + authenticated API yang sudah ada. **Tidak** membuat control path kedua.

### C2. Read-only summaries dulu

- **Deliverable:** fleet, pricing, finance, dan health summaries read-only yang eksplisit sebelum mengaktifkan kontrol berisiko tinggi.

### C3. Mutation controls gated

- **Deliverable:** gate semua kontrol mutasi dengan: authorization, idempotency, audit records, operator feedback jelas, dan rollback/disarm procedures.

### C4. Page-level tests

- **Deliverable:** page-level tests untuk semua critical workflows: pricing controls, finance actions, login/session expiry, error states, responsive navigation.

### C5. Deployment discipline

- Manual deployment + CI-only terus berlanjut sampai ada desain CD yang disetujui independen.

---

## Urutan eksekusi

1. Phase 2 (evidence/test hardening + keputusan credential history)
2. Phase 3 (finance source-of-truth/reconciliation, dengan data-preservation checks)
3. Phase 4 (control-plane workflows kritis + page coverage)
4. Setelah setiap perubahan production yang disetujui: **re-run production lock + release evidence**

## Aturan lintas phase

- Production tidak berubah sebelum source, tests, PR, CI, approval, dan deployment plan siap.
- Selama brainstorming/audit/plan: production lock (tidak ada perubahan production).
- UI boleh dipoles; arsitektur sistem tetap minimal, direct, non-over-engineered (simplicity boundary dari Phase 1 tetap berlaku).
- Deploy: PR dulu, CI tanpa CD, VPS `ssh root@82.25.62.204`.
- Gaya eksekusi user: **FULL AUTONOMUS sampai phase selesai deployed & aktif**, semua skill/MCP tersedia, tracking via todo.
