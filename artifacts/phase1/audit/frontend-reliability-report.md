# Frontend Reliability Implementation Audit

## Scope
Implemented the Reliability dashboard as the authenticated post-login root while retaining every previously active route. The existing Dashboard remains available at `/dashboard`; the 17 original routes remain routed and navigable.

## Files added/changed
- `frontend/src/pages/Reliability.jsx`: light-mode reliability landing UI with summary metrics, all-model/HOLD table, cycles, timeline filters, stale/auth/error surfaces, and audited ARM/DISARM feedback.
- `frontend/src/lib/reliabilityApi.js`: authenticated REST client for summary, bounded history requests, and ARM/DISARM.
- `frontend/src/hooks/useReliabilityStream.js`: fetch-based SSE with `Authorization` header, JSON frame parsing, bounded exponential reconnect (1s–30s), cleanup, auth termination, and REST recovery callback.
- `frontend/src/App.jsx`, `Layout.jsx`, `Sidebar.jsx`: root landing, title/navigation updates, and preserved Dashboard alias.
- `frontend/src/hooks/useApi.jsx`: reliability API paths added to the existing allowlist.
- `frontend/src/theme.jsx`, `App.css`: light-only tokens/interaction and responsive accessible dashboard styles.

## Contract assumptions and dependencies
The authoritative plan documents endpoint names and proposed fields but does not yet define exact JSON envelopes, SSE event names, cursor encoding, or ARM/DISARM response bodies. The client therefore accepts `data`/`result` envelopes and renders documented fields defensively; backend implementation must finalize and test the wire contract. ARM/DISARM currently sends an empty JSON body because the contract does not document a request body. No secrets are put in URLs. No WebSocket, queue, event bus, backend, CI, or deployment changes were made.

## Verification checklist
Run from `frontend/`:

```text
npm test -- --run
npm run lint
npm run build
```

Diagnostics: `Reliability.jsx`, `useReliabilityStream.js`, `reliabilityApi.js`, `App.jsx`, `Layout.jsx`, `Sidebar.jsx`, `useApi.jsx`, and `theme.jsx` reported no diagnostics. `npm test -- --run` passed: 5 files, 21 tests. `npm run lint` passed with pre-existing warnings in unrelated files plus the existing theme warning; no Reliability-file lint errors. `npm run build` passed; Vite emitted only the existing large-chunk warning. Backend endpoint availability and final response/SSE shapes remain dependencies outside this frontend-only change.
