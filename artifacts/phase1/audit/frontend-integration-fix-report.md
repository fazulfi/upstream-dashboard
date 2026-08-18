# Frontend integration fix report

## Scope

Updated the frontend reliability REST adapters, fetch-based SSE client, reliability page mapping, and focused integration tests. Existing reliability routes and the 17 MVP routes were not removed or renamed. Authentication remains in headers; no credentials are placed in URLs, and no WebSocket, queue, event bus, or polling transport was added.

## Contract-aligned changes

- REST query limits are bounded to 1–50 and transition states are validated.
- Envelope handling supports only documented `data` and `result` envelopes; unsupported raw shapes are not broadly hidden.
- Model data is loaded from `/api/reliability/models` rather than inferred from summary data.
- Events apply nested payload fields while retaining event metadata and deduplicate by stable event ID.
- Cycle rendering accepts the documented completion timestamp (`completed_at`) and existing explicit compatibility field (`finished_at`). Event rendering accepts `occurred_at` and the existing documented compatibility field (`detected_at`).
- SSE parsing handles LF/CRLF framing, comments, event names, IDs, multiline data, arbitrary decoded chunks, and malformed JSON without advancing a cursor.
- Last accepted SSE IDs persist in session storage and are sent through `Last-Event-ID` on reconnect. Cursor values remain opaque.
- Reconnect delay is bounded at 30 seconds, reset after an accepted stream, and timers/readers are cleaned up on unmount.
- UI distinguishes connecting, recovering, live, reconnecting, auth-required, stale/delayed, error, and unknown transition outcomes.
- REST recovery runs before the stream is marked live. Unknown ARM/DISARM outcomes are warnings, not success feedback.

## Verification

- LSP diagnostics: clean for changed reliability API, SSE hook, and Reliability page files.
- Frontend tests: passed, 5 files / 23 tests.
- Frontend lint: passed with repository-wide pre-existing warnings; the new unused import was removed. Remaining warnings are in unrelated existing files.
- Frontend build: passed with Vite. Existing chunk-size warning remains.

## Remaining blockers and dependencies

- The backend parallel work must finalize and verify the exact canonical `{data, meta}` fields, chronological opaque cursor format, valid SSE newline framing, nested event payload, freshness/stale metadata, and explicit transition outcome schema.
- Backend audit artifacts still report missing daemon reliability writes, cursor ordering/framing defects, and backend test fixture/schema blockers. Frontend cannot independently manufacture missing summary/model/replay guarantees without violating the no-broad-fallback requirement.
- No backend, CI, deployment, or git changes were made.
