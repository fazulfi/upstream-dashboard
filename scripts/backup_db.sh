#!/usr/bin/env bash
# backup_db.sh — backup PostgreSQL (DSN dari env UPSTREAM_DB) ke folder backups,
# dengan tanggal, retention 14 hari (hapus backup >14d).
#
# Cara pakai:
#   UPSTREAM_DB="postgresql://..." ./backup_db.sh
#   # atau timer systemd yang set Environment=UPSTREAM_DB=...
#
# Default DSN sama dgn backend (peer/password auth via env).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/gamesim/shared-memory/inferhub-business/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_DSN="${UPSTREAM_DB}"
if [ -z "$DB_DSN" ]; then echo "ERROR: UPSTREAM_DB env wajib diisi" >&2; exit 1; fi
STAMP="$(date +%Y%m%d-%H%M%S)"
OUTFILE="${BACKUP_DIR}/inferhub-${STAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"
echo "Backup PostgreSQL → ${OUTFILE}"

# pg_dump via DSN; kompres gzip. Gagal = exit non-zero (set -e abort).
pg_dump "${DB_DSN}" | gzip > "${OUTFILE}"

# Retention: hapus backup lebih tua dari RETENTION_DAYS hari.
find "${BACKUP_DIR}" -type f -name 'inferhub-*.sql.gz' -mtime +"${RETENTION_DAYS}" -delete

echo "✓ Backup selesai: ${OUTFILE}"
echo "Backup tersimpan di: ${BACKUP_DIR}"

# ── Offsite copy (S3 is3.cloudhost.id via rclone — aws CLI v2.35 buggy utk is3) ──
# Kredensial di /run/wwma/env (sistem WWMA). Ukuran ~1.3MB → biaya nol.
# Gagal upload ≠ gagal backup lokal.
if [ -f /run/wwma/env ] && [ -z "${UPSTREAM_BACKUP_SKIP_S3:-}" ] && command -v rclone >/dev/null 2>&1; then
  set +e
  S3_PREFIX_UP="${S3_PREFIX_UP:-upstream-dashboard}"
  # shellcheck disable=SC1091
  . /run/wwma/env
  export S3_ENDPOINT="${S3_ENDPOINT:-https://is3.cloudhost.id}"
  # remote rclone 'is3' di-set via /root/.config/rclone/rclone.conf
  if [ -n "${S3_BUCKET:-}" ]; then
    rclone copy "${OUTFILE}" "is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/" --log-level ERROR \
      && echo "✓ Offsite: is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/$(basename "${OUTFILE}")"
    # Retensi remote 30 hari
    rclone ls "is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/" 2>/dev/null | while read -r _size name; do
      stamp="${name#inferhub-}"; stamp="${stamp%.sql.gz}"
      if [ -n "$stamp" ] && [ "${#stamp}" -ge 15 ]; then
        ts="${stamp:0:8} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2}"
        if [ "$(date -d "${ts}" +%s 2>/dev/null)" -lt "$(date -d '-30 days' +%s)" ]; then
          rclone delete "is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/${name}" --log-level ERROR 2>/dev/null
        fi
      fi
    done
  else
    echo "⚠️ Offsite dilewati: S3_BUCKET kosong"
  fi
  set -e
else
  echo "⚠️ Offsite dilewati: rclone / /run/wwma/env tidak ada"
fi