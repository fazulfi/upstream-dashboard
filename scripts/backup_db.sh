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
DB_DSN="${UPSTREAM_DB:-postgresql://gamesim:upstream_local@127.0.0.1:5432/upstream}"
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