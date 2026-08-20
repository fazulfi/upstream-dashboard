# ADR-002: Hapus Page yang API-nya Dimatikan (Q13)

**Status**: Accepted (2026-08-20)
**Context**: Allowlist frontend hanya mengizinkan auto-pricing/reliability/orderbook/ask.
14 page lain memanggil API terblokir setiap interval poll → boros rate limit.
**Decision**: Hapus 14 page (frontend-only). Route backend tetap (tidak dipanggil =
tidak konsumsi rate limit). Reversible via git.
**Consequences**: Dashboard lebih ramping (5 route), polling sia-sia berhenti.
