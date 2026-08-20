# ADR-003: Deploy Manual, CI Tanpa CD

**Status**: Accepted (2026-08-20, konsisten dgn Phase 2)
**Context**: Ada kontradiksi dokumentasi Vercel auto-deploy vs manual deploy.
**Decision**: GitHub Actions = CI only. Frontend Vercel + backend VPS = manual promote
setelah PR merged + CI green. Tidak ada auto-deploy production.
**Consequences**: Release terkontrol, evidence diambil sebelum promote.
