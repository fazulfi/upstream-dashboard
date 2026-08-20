#!/usr/bin/env bash
set -euo pipefail
# Stub pg_dump + rclone, verify offsite gate + status marker (P4-Q12c).
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

# Resolve repo root: test dijalankan dari scripts/ (bash tests/test_backup_offsite.sh).
# Pakai repo-root-relative path ke backup_db.sh supaya TIDAK bergantung CWD.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-$REPO_ROOT/scripts/backup_db.sh}"

export BACKUP_DIR="$TEST_DIR/backups"
export UPSTREAM_DB="postgresql://x:x@127.0.0.1:1/x"
export PATH="$TEST_DIR/bin:$PATH"
mkdir -p "$TEST_DIR/bin"

cat > "$TEST_DIR/bin/pg_dump" <<'EOF'
#!/usr/bin/env bash
cat /dev/null
EOF
# Stub rclone deterministik: SUCCESS default; STUB_RCLONE_EXIT != 0 → gagal.
cat > "$TEST_DIR/bin/rclone" <<'EOF'
#!/usr/bin/env bash
echo "rclone-call $*"
exit "${STUB_RCLONE_EXIT:-0}"
EOF
chmod +x "$TEST_DIR/bin/pg_dump" "$TEST_DIR/bin/rclone"

echo 'export S3_BUCKET=test-bucket' > "$TEST_DIR/wwma-env"
touch "$TEST_DIR/rclone.conf"

export OFFSITE_STATUS="$TEST_DIR/offsite-status"
export WWMA_ENV_FILE="$TEST_DIR/wwma-env"
export RCLONE_CONFIG="$TEST_DIR/rclone.conf"

# case skipped: SKIP_S3=1 → gate gagal → marker "offsite skipped"
UPSTREAM_BACKUP_SKIP_S3=1 bash "$BACKUP_SCRIPT"
grep -q "offsite skipped" "$OFFSITE_STATUS" || { echo "FAIL: skipped marker"; exit 1; }
echo "PASS: skipped marker"

# case ok: rclone sukses (STUB_RCLONE_EXIT=0) + env dummy + S3_BUCKET → "offsite ok"
STUB_RCLONE_EXIT=0 bash "$BACKUP_SCRIPT"
grep -q "offsite ok" "$OFFSITE_STATUS" || { echo "FAIL: ok marker"; exit 1; }
echo "PASS: ok marker"

# case failed-upload: rclone copy gagal (STUB_RCLONE_EXIT=1) → "offsite failed"
STUB_RCLONE_EXIT=1 bash "$BACKUP_SCRIPT"
grep -q "offsite failed" "$OFFSITE_STATUS" || { echo "FAIL: failed marker"; exit 1; }
echo "PASS: failed marker"

echo "ALL PASS: offsite status marker (3 states)"
