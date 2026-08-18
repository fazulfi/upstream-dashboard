# External SSE Research — Phase 1

**Scope:** backend-owned authenticated Server-Sent Events (SSE) with REST recovery; no WebSocket, event bus, or queue.

**Status legend:** **Recommended** = directly supported by standards/framework documentation; **Recommended with design work** = evidence supports the pattern but application policy is required; **Pitfall** = avoid unless the stated constraint is addressed.

## Executive recommendations

| Area | Recommendation | Status | Evidence |
|---|---|---|---|
| Transport | Use HTTP `GET` with `Content-Type: text/event-stream`; emit complete SSE blocks terminated by a blank line. | Recommended | WHATWG HTML §9.2.1, §9.2.5; FastAPI `StreamingResponse`; `sse-starlette` README. |
| Authentication | Prefer the existing authenticated session cookie for native browser `EventSource`; use `withCredentials: true` for cross-origin requests and configure explicit CORS origin plus credentials. | Recommended | WHATWG `EventSourceInit`; MDN “Using server-sent events”; WHATWG credentials mode. |
| Bearer/custom headers | Native `EventSource` exposes only `withCredentials`; it does not provide a headers option. If bearer `Authorization` is mandatory, use `fetch()` + `ReadableStream` (or a vetted fetch-based SSE client) and own parsing/reconnect behavior. | Recommended with design work | WHATWG §9.2.2 interface; MDN; mature client examples must be checked against the actual library implementation. |
| Resume | Assign a stable, ordered `id:` to every replayable event. On reconnect, the browser sends `Last-Event-ID`; the backend must validate it, replay events after it, and define a stale/out-of-retention cursor response. | Recommended with design work | WHATWG §9.2.3–§9.2.6; MDN event-stream fields; `sse-starlette` structured event example. |
| REST recovery | Keep a normal authenticated REST snapshot/reconciliation endpoint. On initial load, stale cursor, auth refresh, or bounded reconnect exhaustion, fetch the snapshot, replace/reconcile local state, then reopen SSE from the returned cursor. | Recommended with design work | This is an application-level recovery pattern; SSE standards define cursor replay, not domain snapshot semantics. |
| Reconnect | For native `EventSource`, send an explicit bounded `retry:` value and let the browser reconnect. Do not assume native EventSource provides a configurable max-attempt count or application-level circuit breaker. | Recommended with design work | WHATWG `retry` parsing and reconnection model; browser may add delay, but default is implementation-defined. |
| Backoff bounds | If hard max attempts, exponential backoff, jitter, auth-specific handling, or a circuit breaker is required, wrap `fetch` streaming or explicitly recreate/close native EventSource under application control. Always cap delay and attempts; reset the backoff after a successful authenticated open. | Recommended with design work | WHATWG permits extra UA delay but does not expose max attempts; `sse-starlette` production notes show client-side retry as application responsibility. |
| Cleanup | React must create the stream in `useEffect`, remove listeners, call `EventSource.close()` on cleanup, and abort `fetch` streams with `AbortController`. Python generators must observe disconnect/cancellation and release subscriptions/resources. | Recommended | WHATWG `close()` and garbage collection; FastAPI `Request.is_disconnected()` and cancellation guidance; `sse-starlette` disconnect/cleanup examples. |
| Keepalive/proxies | Emit comment heartbeats roughly every 15 seconds (or below the shortest known idle timeout), disable intermediary buffering, and set suitable no-cache headers. Verify the complete proxy chain. | Recommended with deployment validation | WHATWG §9.2.7 recommends comment lines every 15 seconds; `sse-starlette` README documents ping, buffering, and timeout concerns. |

## Evidence and implementation implications

### 1. Browser contract: credentials, IDs, retry, and closure

**WHATWG HTML Standard, library ID not applicable (official URL):**
- https://html.spec.whatwg.org/multipage/server-sent-events.html
- §9.2.2 defines `EventSourceInit` with `withCredentials` as the browser-facing option; `EventSource` is a browser-managed request rather than a general request builder.
- `withCredentials: true` sets the request credentials mode to `include`.
- §9.2.3 says a reconnect uses the stored last event ID and sets the `Last-Event-ID` request header.
- §9.2.4 defines the header’s purpose.
- §9.2.6 says `id:` updates the stored cursor and `retry:` accepts only ASCII digits and sets the reconnection time in milliseconds.
- `close()` aborts the fetch and sets `readyState` to `CLOSED`.
- HTTP 204 tells a client to stop reconnecting; non-200 or non-`text/event-stream` responses fail the connection.

**MDN Web Docs, Context7 library ID `/mdn/content`:**
- https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- The cross-origin example uses `new EventSource(url, { withCredentials: true })`.
- MDN documents `event`, `data`, `id`, and `retry` fields and explicitly states that `retry` is an integer millisecond delay.
- MDN documents explicit closure with `evtSource.close()`.

**Recommendation:** For the likely cookie/session-authenticated dashboard, native EventSource is the least complex option when the stream is same-origin or cross-origin with correct credentialed CORS. Do not attempt to pass an `Authorization` header through native EventSource; the standard interface does not expose arbitrary headers. Query-string bearer tokens are a poor default because URLs can enter browser history, Referer values, proxy logs, and analytics logs. If the project cannot use cookies, use a fetch-based stream with an in-memory access token and explicit header handling, not a secret embedded in source or persistent browser storage.

**CORS pitfall:** credentialed cross-origin requests require a specific allowed origin and credentials permission; wildcard origin is not a safe credentialed configuration. Treat this as a deployment/configuration requirement and test the actual browser request.

### 2. Python backend streaming and cleanup

**FastAPI, Context7 library ID `/websites/fastapi_tiangolo`:**
- https://fastapi.tiangolo.com/advanced/custom-response/
- `StreamingResponse` accepts an async generator and streams chunks.
- FastAPI’s documentation warns that an async generator needs an await point so cancellation can be handled; this matters especially for infinite streams.

**FastAPI Request reference, same library ID:**
- https://fastapi.tiangolo.com/reference/request/
- `await request.is_disconnected()` checks whether the ASGI client connection has closed.

**Mature OSS: `sysid/sse-starlette`, BSD-3-Clause:**
- Repository: https://github.com/sysid/sse-starlette
- Context7 was not needed; GitHub source was inspected directly.
- README documents `EventSourceResponse`, structured `ServerSentEvent(data, event, id, retry)`, automatic client-disconnect detection, ping configuration, `send_timeout`, cancellation, and cleanup.
- Example pattern checks `await request.is_disconnected()` inside the generator and re-raises `asyncio.CancelledError` after cleanup.
- README documents a default ping interval of 15 seconds and configurable ping comments.
- README’s production notes call out proxy buffering, `X-Accel-Buffering: no`, no-cache headers, load-balancer timeout alignment, and connection/file-descriptor limits.

**Recommendation:** Authenticate before constructing the stream response. Make the generator own its database/subscription lifetime; do not create a resource that outlives the generator accidentally. Check disconnection in the loop, handle cancellation in `try/finally`, and ensure every blocking wait has cancellation/timeout behavior. For Phase 1, backend-owned SSE can use an in-process bounded subscription mechanism only if the existing architecture permits it; this research does not recommend introducing an event bus or queue.

### 3. Last-Event-ID plus REST recovery contract

The browser’s native resume behavior is transport-level only: it preserves the last successfully parsed `id:` and sends that cursor on a reconnect. It does not know whether the application’s state can be reconstructed from that cursor.

**Recommended backend contract:**

1. `GET /api/.../snapshot` returns the authoritative REST state plus a cursor/version representing the snapshot boundary.
2. `GET /api/.../stream` authenticates the user and reads `Last-Event-ID`.
3. If no cursor is supplied, send a snapshot-ready/bootstrap event or begin from the current boundary according to the API contract.
4. If the cursor is retained, replay strictly newer events, then continue live events.
5. If the cursor is too old, malformed, from another tenant/user scope, or otherwise not replayable, return a typed recoverable response (for example, an HTTP conflict or application-defined reset signal) rather than silently skipping history.
6. The client calls REST snapshot, replaces/reconciles state, records the new cursor, and reopens the stream.
7. Event IDs must be stable across reconnects and unique within the stream’s authorization scope. A process-local counter is unsafe once more than one worker can emit events.

**Important semantic pitfall:** `Last-Event-ID` is not an authorization credential. Validate it as untrusted input and bind replay to the authenticated principal/tenant. Never let a client use another user’s cursor to read events. REST recovery must be idempotent and safe to repeat because it may run after an ambiguous disconnect.

### 4. Bounded reconnect and backoff policy

The WHATWG processing model mandates automatic reconnect for eligible failures and allows the user agent to wait longer, including exponential delay, but native EventSource does not expose a standard max-attempt, max-delay, jitter, or circuit-breaker setting. `retry:` changes the browser’s reconnection time; it is not a complete application retry policy.

**Native EventSource policy:**
- Emit an explicit conservative `retry:` early in the stream, rather than relying on the implementation-defined initial delay.
- On `error`, inspect `readyState`. `CONNECTING` generally means the browser is already retrying; do not create a second connection on every error event.
- Call `close()` for deliberate shutdown, logout, component unmount, or terminal authorization failure.
- If the product requires a hard attempt limit, native EventSource alone is insufficient; track connection lifetime/attempt state externally and close it when the budget is exceeded. Reopen only after REST recovery or explicit user action.

**Fetch-stream policy:**
- Use `AbortController` for cleanup.
- Send `Accept: text/event-stream`, authentication, and `Last-Event-ID` explicitly.
- Parse incrementally and preserve incomplete trailing event blocks.
- Use bounded exponential backoff with jitter, e.g. `delay = min(base * 2^attempt + jitter, maxDelay)`; cap attempts or transition to a stopped state.
- Reset the backoff after a successful open, not merely after starting a request.
- Treat `401/403` separately from transient network errors: refresh/reauthenticate once if supported, otherwise stop and surface an auth state.
- Never retry tight loops on malformed responses, permanent 4xx errors, or an aborted signal.

The `sse-starlette` README includes a simple client retry example but does not make it a standards guarantee; it is evidence that retry policy is application-owned, not a substitute for defining the project’s bounds.

### 5. React lifecycle and UI state

**Recommended lifecycle:**
- Open one stream from a `useEffect` whose dependencies are stable URL/auth/enabled inputs.
- Keep the `EventSource` or fetch abort controller in a ref.
- Register `open`, message/named-event, and `error` handlers.
- Remove listeners and close/abort in the effect cleanup.
- Avoid constructing EventSource during render or using unstable callback/array dependencies that recreate it on every render.
- Expose explicit `idle`, `connecting`, `open`, `reconnecting`, `recovering`, `auth-required`, `stopped`, and `error` states so a silent retry loop is not mistaken for healthy live data.
- Bound retained event history in memory; use REST snapshot as the authoritative reset path.

**Mature OSS evidence:**
- `sysid/sse-starlette` is a mature Python SSE implementation with examples for disconnect checks, pings, cancellation, and structured IDs.
- `nodejs/undici` repository tests exercise EventSource reconnect and explicit `close()` behavior: https://github.com/nodejs/undici/tree/main/test/eventsource
- These examples/tests validate lifecycle mechanics, not the project’s authentication or replay policy; do not copy them as a complete production design.

## Verification matrix for Phase 1

| Check | Expected evidence | Recommendation status |
|---|---|---|
| Authenticated initial stream | Browser Network panel shows authenticated `GET`, correct `Content-Type`, and no secret in URL. | Must pass — Recommended |
| Credentialed cross-origin mode | `withCredentials` and explicit CORS origin/credentials behavior verified in browser. | Must pass when cross-origin — Recommended |
| Resume | After receiving `id: N`, forced disconnect causes reconnect request with `Last-Event-ID: N`. | Must pass — Recommended |
| Replay ordering | Backend returns only events after the cursor, in deterministic order, then live events. | Must pass — Recommended with design work |
| Stale cursor | Expired cursor triggers REST snapshot/recovery, not silent data loss. | Must pass — Recommended with design work |
| Auth failure | 401/403 transitions to auth-required/stopped and does not hot-loop. | Must pass — Recommended with design work |
| Bounded retry | Network failures obey max delay and max attempts/circuit-breaker policy. | Must pass — Recommended with design work |
| React cleanup | Unmount/logout leaves no active stream and no stale state updates. | Must pass — Recommended |
| Python cleanup | Disconnect/cancellation releases listeners, DB/session resources, and tasks. | Must pass — Recommended |
| Proxy behavior | Heartbeats arrive, events are not buffered, and idle timeout exceeds heartbeat interval. | Must pass in deployment — Recommended with validation |
| REST idempotence | Repeated snapshot/recovery calls produce safe, consistent state. | Must pass — Recommended with design work |

## Source index and library IDs

1. WHATWG HTML Standard, Server-sent events: https://html.spec.whatwg.org/multipage/server-sent-events.html — official normative protocol and browser behavior.
2. MDN Web Docs, Context7 library ID `/mdn/content`: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events — browser usage, credentials, fields, close.
3. FastAPI, Context7 library ID `/websites/fastapi_tiangolo`: https://fastapi.tiangolo.com/advanced/custom-response/ — `StreamingResponse`, cancellation/await points.
4. FastAPI Request reference, same library ID: https://fastapi.tiangolo.com/reference/request/ — `Request.is_disconnected()`.
5. `sysid/sse-starlette`, BSD-3-Clause: https://github.com/sysid/sse-starlette — mature Starlette/FastAPI SSE response, ping, IDs, disconnect and cancellation examples.
6. Node.js `undici` EventSource tests, MIT: https://github.com/nodejs/undici/tree/main/test/eventsource — mature implementation tests for reconnect and close.

## Bottom line

For Phase 1, use cookie-authenticated native EventSource where possible, explicit event IDs, backend replay keyed by validated `Last-Event-ID`, and an authenticated REST snapshot for stale-cursor or bounded-retry recovery. Keep reconnect policy finite and observable; native browser retry is not a substitute for an application circuit breaker. If bearer headers are unavoidable, switch to a fetch-based stream and accept the additional parser, abort, credential refresh, and retry complexity. No evidence supports adding WebSockets, an event bus, or a queue to satisfy these requirements.
