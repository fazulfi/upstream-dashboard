# ADR-001: Rule Engine Finance sebagai Satu-Satunya Sumber Formula

**Status**: Accepted (2026-08-20)
**Context**: Dashboard (app.py db_read_finance) dan workbook (gen_finance.py)
menghitung net income dengan formula terpisah → mismatch (amortisasi retired,
kurs global vs per-asset).
**Decision**: Buat `backend/finance_rules.py`; kedua konsumen memanggil fungsi yang sama.
**Consequences**: Satu titik perubahan formula; regression test wajib; parity dijamin
oleh recon_finance (FIN-PARITY).
