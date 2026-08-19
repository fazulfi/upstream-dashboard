# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| main (production) | ✅ |
| older releases | ❌ |

Only the current production state (branch `main`) is supported.

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report privately to the repository owner. If you know a maintainer, contact them directly. Otherwise open a GitHub private advisory via **Security → Report a vulnerability** on the repository.

### What to include
- Affected endpoint / component / file
- Steps to reproduce (minimal)
- Impact and severity assessment
- Suggested mitigation (if any)

### Response expectations
- Acknowledgment within **72 hours**.
- A fix plan or mitigation within **7 days** for valid reports.
- Coordinated disclosure: please give us time to fix before public disclosure.

## Secrets handling
Production secrets (`DASHBOARD_PASSWORD`, `UPSTREAM_DB`, `FOREX_KEY`) live **server-side only** (systemd drop-in / process environment). They must never be committed to this repository. If a secret is committed, it is considered **compromised** and must be rotated immediately.

## Security-relevant areas
- Authentication: password → Bearer token (24h expiry)
- Authorization: all `/api/reliability/*` + finance endpoints require a valid token
- Data retention: raw reliability events 30 days, aggregates 90 days
- No secrets in repository history (any exposure → rotation)
