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
# ── Path injectable — override via env utk test (default = prod) ──
WWMA_ENV_FILE="${WWMA_ENV_FILE:-/run/wwma/env}"
OFFSITE_STATUS="${OFFSITE_STATUS:-/home/gamesim/.backup-offsite-status}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}"
export RCLONE_CONFIG
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
if [ -f "${WWMA_ENV_FILE}" ] && [ -z "${UPSTREAM_BACKUP_SKIP_S3:-}" ] && command -v rclone >/dev/null 2>&1; then
  set +e
  S3_PREFIX_UP="${S3_PREFIX_UP:-upstream-dashboard}"
  # shellcheck disable=SC1091
  . "${WWMA_ENV_FILE}"
  export S3_ENDPOINT="${S3_ENDPOINT:-https://is3.cloudhost.id}"
  if [ -n "${S3_BUCKET:-}" ]; then
    if rclone copy "${OUTFILE}" "is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/" --log-level ERROR; then
      echo "✓ Offsite: is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/$(basename "${OUTFILE}")"
      # verifikasi: rclone ls sukses → offsite ok; gagal → offsite failed
      if rclone ls "is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/" >/dev/null 2>&1; then
        echo "offsite ok $(date -u +%FT%TZ)" > "$OFFSITE_STATUS"
      else
        echo "offsite failed $(date -u +%FT%TZ)" > "$OFFSITE_STATUS"
        echo "WARN: offsite upload tidak terverifikasi" >&2
      fi
      # Retensi remote 30 hari (blok existing, tidak berubah)
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
      echo "offsite failed $(date -u +%FT%TZ)" > "$OFFSITE_STATUS"
      echo "WARN: offsite upload gagal" >&2
    fi
  else
    echo "offsite skipped $(date -u +%FT%TZ)" > "$OFFSITE_STATUS"
    echo "⚠️ Offsite dilewati: S3_BUCKET kosong"
  fi
  set -e
else
  echo "offsite skipped $(date -u +%FT%TZ)" > "$OFFSITE_STATUS"
  echo "⚠️ Offsite dilewati: rclone / ${WWMA_ENV_FILE} tidak ada"
fi