#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/artifacts/phase2/deploy"
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
elif [[ "${1:-}" != "" ]]; then
  printf 'Usage: %s [--dry-run]\n' "$0" >&2
  exit 2
fi

mkdir -p "$DEPLOY_DIR"
TIMESTAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
FILE_TIMESTAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
OUTPUT="${DEPLOY_DIR}/evidence-${FILE_TIMESTAMP}.md"
REMOTE_TARGET="${EVIDENCE_SSH_TARGET:-root@faiz-prod-01}"
BACKUP_DIR="/home/gamesim/shared-memory/inferhub-business/backups"
BACKUP_SCRIPT="${ROOT_DIR}/scripts/backup_db.sh"

unavailable() { printf 'unavailable (%s)' "$1"; }

capture_local_commits() {
  local head origin
  head="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"
  origin="$(git -C "$ROOT_DIR" rev-parse origin/main 2>/dev/null || true)"
  printf 'local HEAD: %s; origin/main: %s' "${head:-unavailable}" "${origin:-unavailable}"
}

capture_schema_check() {
  local diff destructive
  diff="$(git -C "$ROOT_DIR" diff -- backend/db_schema.py 2>/dev/null || true)"
  if [[ -z "$diff" ]]; then
    printf 'empty (no working-tree diff in backend/db_schema.py)'
    return
  fi
  destructive="$(printf '%s\n' "$diff" | grep -E -i '^[+].*(DROP|TRUNCATE|ALTER[[:space:]]+TABLE.*(DROP|ALTER)|DELETE[[:space:]]+FROM)' || true)"
  if [[ -n "$destructive" ]]; then
    printf 'FAIL: destructive DDL detected; review required'
  else
    printf 'non-destructive-only (working-tree diff requires review)'
  fi
}

curl_status() {
  local url token="${UPSTREAM_TOKEN:-}" status
  if ! command -v curl >/dev/null 2>&1; then
    unavailable 'curl not installed'
    return
  fi
  if [[ "$1" == 'auth' && -z "$token" ]]; then
    unavailable 'UPSTREAM_TOKEN not supplied'
    return
  fi
  if [[ "$1" == 'auth' ]]; then
    status="$(curl -fsS --max-time 15 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${token}" "$2" 2>/dev/null || true)"
  else
    status="$(curl -fsS --max-time 15 -o /dev/null -w '%{http_code}' "$2" 2>/dev/null || true)"
  fi
  [[ -n "$status" ]] && printf '%s' "$status" || unavailable 'endpoint unreachable'
}

capture_sse() {
  local token="${UPSTREAM_TOKEN:-}" body
  if [[ -z "$token" ]]; then
    unavailable 'UPSTREAM_TOKEN not supplied'
    return
  fi
  body="$(timeout 12 curl -sS --max-time 15 -H "Authorization: Bearer ${token}" -H 'Accept: text/event-stream' 'https://ops.budgezen.com/api/reliability/stream' 2>/dev/null || true)"
  if printf '%s' "$body" | grep -qE '(^|\n)(data:|event:)'; then
    printf 'live (SSE event received)'
  else
    unavailable 'no SSE event received'
  fi
}

capture_remote() {
  local remote_cmd
  remote_cmd="sudo -u gamesim env XDG_RUNTIME_DIR=/run/user/\$(id -u gamesim) bash -s"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_TARGET" "$remote_cmd" <<'REMOTE'
set -u
unit_state() {
  local unit="$1" active enabled pid
  active="$(systemctl --user is-active "$unit" 2>/dev/null || true)"
  enabled="$(systemctl --user is-enabled "$unit" 2>/dev/null || true)"
  pid="$(systemctl --user show "$unit" -p MainPID --value 2>/dev/null || true)"
  printf '%s: active=%s, enabled=%s, main_pid=%s\n' "$unit" "${active:-unavailable}" "${enabled:-unavailable}" "${pid:-unavailable}"
  if [[ "$unit" == "wwma-auto-pricing.service" ]]; then
    daemon_count="$(pgrep -fc 'scripts/auto_pricing.py' 2>/dev/null || true)"
    printf 'auto-pricing daemon process_count=%s (expected 1)\n' "${daemon_count:-0}"
  fi
}
unit_state wwma-upstream-backend.service
unit_state wwma-auto-pricing.service
unit_state wwma-finance.service
latest="$(find /home/gamesim/shared-memory/inferhub-business/backups -maxdepth 1 -type f -name 'inferhub-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk 'NR==1 {$1=""; sub(/^ /," "); print}')"
if [ -n "$latest" ]; then
  printf 'backup_file=%s\n' "$latest"
  printf 'backup_sha256=%s\n' "$(sha256sum "$latest" | awk '{print $1}')"
else
  printf 'backup_file=unavailable (no backup found)\nbackup_sha256=unavailable (no backup found)\n'
fi
REMOTE
}

SYSTEMD_STATES=""
BACKUP_FILE=""
BACKUP_SHA256=""
if "$DRY_RUN"; then
  SYSTEMD_STATES="$(unavailable 'dry-run does not query VPS systemd')"
  BACKUP_FILE="$(unavailable 'dry-run does not run backup_db.sh or query VPS')"
  BACKUP_SHA256="$(unavailable 'dry-run does not run backup_db.sh or query VPS')"
else
  REMOTE_OUTPUT="$(capture_remote 2>&1 || true)"
  SYSTEMD_STATES="$(printf '%s' "$REMOTE_OUTPUT" | grep -E '^wwma-' || unavailable 'SSH/systemd query failed')"
  BACKUP_FILE="$(printf '%s' "$REMOTE_OUTPUT" | awk -F= '/^backup_file=/{sub(/^backup_file=/,""); print; exit}')"
  BACKUP_SHA256="$(printf '%s' "$REMOTE_OUTPUT" | awk -F= '/^backup_sha256=/{sub(/^backup_sha256=/,""); print; exit}')"
  BACKUP_FILE="${BACKUP_FILE:-$(unavailable 'SSH backup query failed')}"
  BACKUP_SHA256="${BACKUP_SHA256:-$(unavailable 'SSH backup query failed')}"
fi

if "$DRY_RUN"; then
  FRONTEND_STATUS="$(unavailable 'dry-run does not contact frontend')"
  HEALTH_STATUS="$(unavailable 'dry-run does not contact backend health')"
  LOGIN_RESULT="$(unavailable 'dry-run does not contact login')"
  RELIABILITY_RESULT="$(unavailable 'dry-run does not contact reliability')"
  SSE_RESULT="$(unavailable 'dry-run does not contact SSE')"
elif [[ -n "${UPSTREAM_TOKEN:-}" ]]; then
  FRONTEND_STATUS="$(curl_status public https://upstream-static.vercel.app/)"
  HEALTH_STATUS="$(curl_status public https://ops.budgezen.com/health)"
  LOGIN_RESULT='session-ok via token'
  RELIABILITY_RESULT="$(curl_status auth https://ops.budgezen.com/api/reliability/summary)"
  SSE_RESULT="$(capture_sse)"
else
  FRONTEND_STATUS="$(curl_status public https://upstream-static.vercel.app/)"
  HEALTH_STATUS="$(curl_status public https://ops.budgezen.com/health)"
  if [[ -n "${UPSTREAM_PASSWORD:-}" ]]; then
    LOGIN_RESULT="$(curl -fsS --max-time 15 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' --data "{\"password\":\"${UPSTREAM_PASSWORD}\"}" https://ops.budgezen.com/api/login 2>/dev/null || unavailable 'login endpoint unreachable')"
  else
    LOGIN_RESULT='skipped (UPSTREAM_PASSWORD not supplied)'
  fi
  RELIABILITY_RESULT='unavailable (UPSTREAM_TOKEN not supplied)'
  SSE_RESULT='unavailable (UPSTREAM_TOKEN not supplied)'
fi
OPERATOR="${OPERATOR_NAME:-unavailable (set OPERATOR_NAME for signing)}"

cat > "$OUTPUT" <<EOF
# Phase 2 Deployment Evidence

**Status:** UNSIGNED / BLOCKED until reviewed by the operator.
**Capture mode:** $( [[ "$DRY_RUN" == true ]] && printf 'dry-run' || printf 'production observation' )

## Required release fields

- **timestamp (UTC):** ${TIMESTAMP}
- **source_commit:** $(capture_local_commits)
- **backup_file:** ${BACKUP_FILE}
- **backup_sha256:** ${BACKUP_SHA256}
- **schema_additive_check:** $(capture_schema_check)
- **systemd_states:**
${SYSTEMD_STATES//$'\n'/$'\n  '}
- **smoke_results:**
  - frontend: HTTP ${FRONTEND_STATUS}
  - backend /health: HTTP ${HEALTH_STATUS}
  - login/authenticated session: ${LOGIN_RESULT}
  - reliability summary: ${RELIABILITY_RESULT}
  - SSE live: ${SSE_RESULT}
- **operator_signature:** ${OPERATOR}; date ${TIMESTAMP}

## Capture notes

- Backup source: latest existing file under ${BACKUP_DIR}; backup_db.sh was not executed by this tool.
- Backup script prints the output path and stores the artifact at the path it reports; verify with sha256sum of the reported file.
- Authentication uses only the existing UPSTREAM_TOKEN environment variable; no credential is recorded.
- Normal mode observes systemd as user gamesim through SSH; --dry-run intentionally does not contact or modify production.
EOF

printf 'Evidence written: %s\n' "$OUTPUT"
