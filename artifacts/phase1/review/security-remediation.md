# Security Remediation

- **Credential rotation:** Generated with `openssl rand -base64 48 | tr -d '=/+'`; new credential is masked here as `<redacted>` and was not written to the repository.
- **Production update:** Updated `/home/gamesim/.config/systemd/user/wwma-upstream-backend.service.d/phase1-env.conf` using the `gamesim` systemd user-unit access pattern. Preserved `UPSTREAM_DB` unchanged. Reloaded and restarted `wwma-upstream-backend.service`; status reported `Active: active (running)`.
- **End-to-end verification:** `POST https://ops.budgezen.com/api/login` with the new credential returned HTTP 200. The compromised active credential returned HTTP 401 after restart.
- **Repository redaction:** Replaced both exposed credential values in `artifacts/phase1/audit/observation-24h-report.md` with `<redacted>`. Final repository search confirmed zero occurrences of either exposed value.

The full new credential was provided directly to the operator in the remediation response and is intentionally absent from this file.
