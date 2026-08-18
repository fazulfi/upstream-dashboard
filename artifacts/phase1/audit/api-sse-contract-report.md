# W3/W4 API and SSE contract report

- All reliability endpoints use the existing global Bearer HMAC/X-Auth gate.
- Cursors and REST limits are bounded; query-string authentication is not supported.
- `GET /api/reliability/summary`, `/cycles`, `/events`, and `/models` read the canonical PostgreSQL reliability/auto-pricing tables.
- `GET /api/reliability/stream` uses an Authorization header, `Last-Event-ID` replay cursor, bounded 30-second lifetime, 50-event batches, keepalive comments, and generator cleanup on disconnect.
- ARM/DISARM routes and the legacy `/api/auto-pricing/arm` route share transactional state plus audit persistence. If either persistence or file publication fails, the response is an explicit unknown outcome rather than success.
- Interface adaptation: the existing schema has no dedicated control/audit tables, so the backend creates additive `auto_pricing_control` and `auto_pricing_control_audit` tables transactionally.
- No frontend, pricing calculation, WebSocket, queue, event bus, circuit breaker, auto-kill, or deployment changes were made.
