# Reliability SSE transport

## Purpose

The reliability dashboard uses server sent events over `fetch`, rather than the
native `EventSource` API. Native `EventSource` cannot send the required
`Authorization` request header. Phase 1 B5 also prohibits putting a token in a
query string. The fetch based client can send the bearer token in a header while
keeping credentials out of URLs.

This stream is a live notification and replay mechanism. PostgreSQL remains the
durable source of truth. The stream does not replace history reads or database
recovery.

## Wire contract

### Request

The client sends an authenticated `GET` request to:

```text
/api/reliability/stream
```

The request includes:

```http
Accept: text/event-stream
Authorization: Bearer <session-token>
```

When the client has a cursor, it also sends:

```http
Last-Event-ID: <cursor>
```

The client stores the most recently received event ID in `sessionStorage` under
`reliability_stream_last_event_id`. The backend accepts that header and also
supports the optional `after` query parameter as a cursor input. A cursor must
parse as an integer, or the backend returns HTTP 400 with `invalid cursor`.

The backend also accepts an optional `interval` query parameter. It defaults to
2 seconds and is bounded to the range 0.5 to 10 seconds.

### Response and events

The response has media type `text/event-stream` and includes these headers:

```http
Cache-Control: no-cache
X-Accel-Buffering: no
```

For each event, the backend sends the cursor, event type, and JSON payload in
SSE format:

```text
id: <cursor>
event: <event_type>
data: <json>

```

When no rows are available, the backend sends an SSE comment as a keepalive:

```text
: keepalive

```

The client ignores comment lines. It parses event data, saves a received event
ID as the new cursor, and passes the parsed event to its callback.

Each server stream has a roughly 30 second deadline. A normal end of that finite
response is treated by the client as `stream ended`, which enters reconnecting
state rather than being treated as a permanent live connection.

### Replay and polling behavior

The backend starts after the supplied cursor and selects reliability events with
`cursor > last cursor`, in ascending cursor order, with a maximum of 50 rows per
query. It emits all rows returned by each query before waiting for the configured
interval and checking again. This gives reconnecting clients cursor based replay
from the durable event history.

### Reconnect and cleanup

The client uses bounded exponential backoff after recoverable stream errors. The
initial delay is 1 second, each scheduled delay doubles, and the delay is capped
at 30 seconds. The sequence is 1, 2, 4, 8, 16, 30, 30 seconds, and so on. A
successful response resets the next delay to 1 second.

HTTP 401 and 403 responses are handled as exactly `auth-required`. They do not
schedule a reconnect, clear the session token, or log the user out. If there is
no session token, the client reports `auth-required` and makes no request.

On unmount, the client aborts the active fetch and clears the pending retry
timer. Cleanup does not clear the session token or the saved cursor.

## Data flow and recovery

1. Reliability data is persisted in PostgreSQL. That database is the durable
   source of truth for event history and cursors.
2. The frontend uses the reliability REST endpoints for recovery and history:
   `/api/reliability/summary`, `/api/reliability/cycles`,
   `/api/reliability/events`, and `/api/reliability/models`.
3. The SSE endpoint provides live notification and cursor replay. In process
   subscribers notify only. Durable state and replay remain database concerns.
4. If the stream is unavailable or ends, the client reconnects when the error
   is retryable and invokes the REST recovery path after a successful stream
   response.

The REST client is in `frontend/src/lib/reliabilityApi.js`. It uses the shared
`apiFetch` authentication path, and bounds REST `limit` values to 1 through 50
on the client.

## Implementation pointers

### Frontend

The transport implementation is in
`frontend/src/hooks/useReliabilityStream.js`:

- Lines 4 to 7 define the API base, 1 second initial delay, 30 second maximum
  delay, and the `reliability_stream_last_event_id` storage key.
- Lines 25 to 32 read and save the cursor in `sessionStorage`.
- Lines 47 to 60 require a session token, build the bearer and SSE `Accept`
  headers, add `Last-Event-ID`, and call the stream endpoint.
- Lines 60 to 85 handle authentication responses, reset successful backoff,
  parse the body, treat an ended stream as an error, and schedule bounded retry.
- Lines 89 to 94 abort the request and clear the retry timer during cleanup.

### Backend

The route is `backend/app.py:2468`, in `api_reliability_stream`.

- The global authentication gate is at `backend/app.py:695-700`. It protects
  the stream and allows only the documented health, login, and CORS preflight
  exceptions.
- Credential parsing is at `backend/app.py:669-678`. It accepts a bearer token
  from `Authorization` or a credential from `X-Auth`; it does not accept
  query string authentication.
- Cursor validation, interval bounds, the 30 second deadline, cursor ordered
  query, event framing, keepalive, and response headers are at
  `backend/app.py:2470-2489`.
- The CORS allowlist is configured at `backend/app.py:647-648`, from
  `ALLOWED_ORIGINS` defined at `backend/app.py:41-42`.

## Security requirements

- Never put session credentials or other secrets in a query string. Query
  values can appear in URLs and access logs. The stream uses the
  `Authorization` header instead.
- Treat 401 and 403 as `auth-required`. The current client does not retry these
  responses, clear the token, or log out the user.
- Keep CORS restricted to the explicit `ALLOWED_ORIGINS` allowlist. The backend
  does not use wildcard origins for credentialed requests.
- `DASHBOARD_PASSWORD` is a server side secret. This document names the
  variable only and contains no secret value.

## Future migration path

If the authentication model changes, two options preserve the transport's
security boundary:

1. Use cookie based credentials, with the required server side CSRF and cookie
   policy review.
2. Use a short lived stream token, with a review of issuance, expiration,
   revocation, access logging, and redaction before adoption.

Either option must keep credentials out of query strings. Any migration also
needs an explicit logging and redaction review so headers, cookies, tokens, and
failure details do not expose secrets.
