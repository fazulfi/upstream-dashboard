---
trigger: always_on
---

# Upstream Dashboard — Teamwork & Shell Rules

## Teamwork Preview Concurrency Limit
- **Jangan launch lebih dari 2 `teamwork_preview` agen secara bersamaan** di project ini.
- Jika perlu >2 tim, launch 2 dulu, tunggu salah satu selesai, baru launch tim berikutnya.
- Jika `teamwork_preview` mengembalikan `RESOURCE_EXHAUSTED (429)`, **jangan retry** — implementasi fitur tersebut manual oleh parent agent lebih efisien daripada menunggu 4 jam reset quota.

## PowerShell Shell Rules
- PowerShell tidak mengenal `grep`, `cat`, `tail`. Gunakan `Select-String`, `Get-Content`, atau Node.js script.
- Hindari `>>` redirect di PowerShell untuk file CSS/JS — bisa UTF-16 encoding yang merusak Vite compiler. Gunakan `fs.appendFileSync` di Node.js atau write_to_file tool.

## Backend Architecture
- Backend adalah Python Flask di `backend/app.py` dengan helpers: `inferhub_get()`, `inferhub_post()`, `inferhub_put()`, `inferhub_delete()`.
- Frontend hanya boleh call `/api/*` ke backend lokal — bukan langsung ke `inferhub.dev`.
- Semua path baru harus ditambahkan ke `FOCUSED_API_PREFIXES` atau `isApiEnabled()` di `frontend/src/hooks/useApi.jsx`.

## Vercel Deployment Workflow
- **Vercel Production URL hanya mengarah ke branch main.**
- Jika bekerja di branch fitur (misal: feat/...), push ke GitHub hanya akan membuat preview deployment.
- Agar perubahan live dan bisa diakses user di dashboard utama, pastikan untuk **selalu merge branch fitur ke main** (melalui Pull Request) setelah verifikasi lokal selesai.
