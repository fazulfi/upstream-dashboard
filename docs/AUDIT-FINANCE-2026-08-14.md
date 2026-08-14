# AUDIT SISTEM KEUANGAN — TEMUAN & RENCANA FIX (2026-08-14)

Audit 4 subagent paralel (DB integrity, formula, controls, + verifikasi independen) + tes live.
Tujuan: pencatatan keuangan **seperti perusahaan** — akurat, traceable, realtime, tanpa double-count.

## TEMUAN (peringkat prioritas implementasi)

### KRITIS — angka salah / risiko salah catat
| # | Temuan | Bukti | Fix |
|---|---|---|---|
| F1 | **Momo double-count $5.38**: IMP-12 (loss 95.898) + A-017 (retired, masuk amort) — kerugian 2× | net income $247.52 → seharusnya $252.90 | Zero-kan IMP-12 atau hapus amort A-017 (keputusan: impairment adalah beban, retired = status; **retired TANPA impairment = wajar**, jadi yang salah: impairment mencatat ulang) |
| F2 | **Kurs TIDAK per-transaksi**: satu kurs global di meta, semua historis di-revalue tiap regen; klaim R17 audit lalu keliru | assets/refunds/impairments TANPA kolom kurs | **fix realtime (permintaan user)**: fin_ops tarik kurs live saat input → simpan `kurs_idr_usd` per row asset/refund; db_read pakai kurs per-row |
| F3 | **Payout double-count risk**: 3 jalur tulis (fin_ops, ledger_update UUID acak, db_import_ledger) | audit formula | Dedup by withdrawal ID (upsert ON CONFLICT id) — jalur sync sudah pakai id InferHub; hapus UUID random |
| F4 | **Impairments 24/24 orphan** (tanpa FK/asset_id); 3 aset retired tanpa impairment; 13 aset >30 hari masih active (amortisasi tidak jalan) | audit DB | Tambah asset_id relasi; job amortisasi/ekspirasi; konfirmasi aset hilang |
| F5 | **earning_history non-monotonik 8 baris** + 882 baris awal equation break | audit DB | Fix sync lifetime (jangan pernah turun) + baseline |

### REQUIRED — kontrol & keandalan
| # | Temuan | Fix |
|---|---|---|
| R1 | Refund tanpa dedup (id REF-xxxx acak 4-hex, qty bisa negatif, 2 nominal sekaligus) | Validasi: qty≥0, satu nominal saja, unique (upstream,date,amount) |
| R2 | Backup cron BELUM PERNAH JALAN (backup.log tidak ada) + restore tidak pernah diuji + on-server only | Jalankan backup manual, verifikasi cron 03:30, uji restore, catat |
| R3 | Rekonsiliasi payout vs earnings manual saja (gap $79 terbuka) | Script reko otomatis + jurnal gap |
| R4 | ledger_update add-asset silent overwrite; fin_ledger.py yatim di VPS | Hapus/arsipkan jalur legacy |
| R5 | Unit finance VPS ≠ repo (hardcode key forex bocor) | Samakan unit dgn repo (env FOREX_KEY) |
| R6 | opex $0.10 flat 3 tempat | Centralize ke DB meta |

## PLAN IMPLEMENTASI (urutan)
1. **Kurs realtime per-transaksi** (F2 + permintaan user) — fin_ops buy/refund tarik kurs live, simpan per row; db_read_finance pakai per-row
2. **Fix Momo double-count** (F1) — zero-kan IMP-12 (beban sudah masuk amort A-017)
3. **Dedup payout & hapus jalur legacy** (F3, R4)
4. **Amortisasi/ekspirasi aset** (F4) — job cek lifespan
5. **Rekonsiliasi otomatis** (R3) — script reko
6. **Backup verifikasi** (R2) — jalankan + uji restore
7. **Unit finance sync** (R5)

## VERIFIKASI AKHIR
- Rekonsiliasi: payout $300 = withdrawn $300 = balance + payout = lifetime ✓
- Net income baru (fix Momo) = $252.90
- Kurs per transaksi tersimpan & dipakai
- Backup log ada, restore diuji

---

## ✅ HASIL IMPLEMENTASI & AUDIT ULANG (2026-08-14, selesai)

| Fix | Status | Bukti live |
|---|---|---|
| F1 Momo double-count | ✅ | IMP-12 = 0 (persist setelah restart — import ledger.json diblok); net income +$5.38 |
| F2 Kurs realtime per-transaksi | ✅ | fin_ops buy IDR → `kurs_idr_usd=17860` tersimpan per row; ledger_meta `kurs_idr_usd=17860.0`, `kurs_updated=2026-08-14`; FOREX_KEY ditambah ke .env; 34 aset IDR semua punya kurs |
| F3 Payout dedup | ✅ | db_import_ledger skip payout tanpa id valid; add-payout legacy deprecated (auto-sync API) |
| R3 Rekonsiliasi otomatis | ✅ | `scripts/recon_finance.py` — cron harian 04:30; **LULUS**: payout $300 == withdrawn $300 (15), kurs valid |
| R2 Backup | ✅ | Backup manual `inferhub-20260814-021653.sql.gz` (1.26MB); cron 03:30 terpasang |
| R5 Unit finance | ✅ | Unit VPS di-sync ke repo (.venv-dash, FOREX env, tanpa key hardcode) |
| Bug ausd | ✅ | `ausd` undefined di loop refund → REF-1 $22.62 kini dihitung |
| Bug def db() | ✅ | Kembali di fin_ops (NameError fixed) |

**Net income final: $252.91** (sebelum audit: $247.52)
- payout 300.0 + refund 22.62 − amort 45.51 − imp 24.10 − opex 0.10
- Selisih: fix Momo (+$5.38) + kurs live realtime

**Rekonsiliasi akhir:** payout DB == withdrawn API == delta history ($300) ✓ · balance+withdrawn == lifetime ($336.45) ✓ · kurs valid ✓

**Tersisa (butuh keputusan operator):**
- 5 aset retired tanpa impairment row (A-017/A-017a sudah via amort; A-023/A-025/A-039 perlu konfirmasi)
- Invariant 2 live API (stats) dilewati — API key scope terbatas
- Payout 08-05 & 08-06 (2×10/hari) — konfirmasi ke API (tidak terbukti dobel dari relasi lain)

---

## ✅ HASIL ITEM KEPUTUSAN (2026-08-14, Faiz: 1-3 autonomous, 4-5 skip, 6-9 sesuai rekomendasi)

| Item | Keputusan | Status | Bukti |
|---|---|---|---|
| 1 | 3 aset retired: A-023 di-cover REF-1 + IMP-REF1 (sisa Rp23.840); A-025/039 tanpa impairment (full cost sudah amort — konvensi wajar) | ✅ | IMP-REF1 di DB; net_income $251.58 |
| 2 | Payout 08-05/08-06 = **4 RIIL** (id DB == id API InferHub exact match) — bukan duplikat | ✅ | Tidak ada fix; audit item1-2 |
| 3 | Jurnal **J-070..J-072** ($180 payout #13-15) di jurnal-umum.md; **$79.30 TIDAK di-jurnal** (ringkas stale — saldo benar $120, konversi tak terbukti) | ✅ | jurnal-umum.md updated |
| 4,5 | Pajak & kurs topup — **SKIP** (keputusan Faiz) | ⏭️ | — |
| 6 | Baseline earning 10-Agu 17:56:45Z: equation = invariant (PASS), non-monotonik = WARN (artefak sync withdrawn); seed pre-baseline dikecualikan | ✅ | recon PASS, pelanggar live 0 |
| 7 | Backup offsite: **rclone → is3** (aws CLI v2.35 buggy MissingContentLength); 2 objek 1.26MB di S3 | ✅ | rclone ls verified |
| 8 | `fin_ledger.py` → **scripts/archive/** (jangan hapus — Mama mungkin pakai) | ✅ | archive/fin_ledger.py |
| 9 | **Actor log**: created_by/created_at/retired_by/retired_at di assets/refunds/impairments/payouts; fin_ops `--actor > FIN_OPS_ACTOR > getpass` | ✅ | test buy/retire: created_by=faiz, retired_by=faiz |

**Net income final (lengkap): $251.58** = payout 300 + refund 22.62 − amort 45.51 − imp 25.43 − opex 0.10

**Rekonsiliasi final: LULUS** — payout DB $300 == withdrawn API $300 (15) == delta history; equation baseline 0 pelanggar; kurs valid Rp 17.860

---

## REV9 (2026-08-14) — Sinkron keuangan dengan aset aktif

**Keluhan user:** akun yang sudah tidak aktif (retired) tidak boleh terhitung sebagai aset aktif.

**Fix (commit `af2bca8`):** `total_capital` di `db_read_finance` (app.py:343) & `_finance_from_ledger` (app.py:1272) kini **skip aset status != 'active'** — hanya menjumlahkan aset aktif (53). Aset retired (5) tidak lagi masuk modal.

**Bukti live:**
```
Sebelum:  total_capital = $317.14 (53 active + 5 retired)
Sesudah:  total_capital = $271.63 (53 active only)   [manual DB: active $271.70 ✓]
          aktif_aset = 53
          net_income = $297.09
```

**Earning per account** sudah tampil di Upstreams (kolom Earnings per provider) & FleetHealth (kolom Earning (lt)) — tidak berubah.
