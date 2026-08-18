# Post-MVP Phase 1 — Reliability Plan

> **Status:** Planning decision record normalized, pending separate implementation approval
> **Production lock:** No production changes are permitted while this document is being prepared.
> **Authoritative decision log:** `artifacts/phase1/audit/decision-log.md` is the authoritative B0-B8 record. Historical alternatives and exploratory questions below are non-authoritative.
> **Gate status:** Architecture and production gates remain BLOCKED. This status is an implementation-gate record, not production authorization.
> **Design principle:** UI may be polished and expressive; system architecture must remain minimal, direct, and non-over-engineered.

## Authoritative Phase 1 decisions

The B0-B8 decisions in `artifacts/phase1/audit/decision-log.md` supersede contradictory or open wording in this historical planning document. In particular, Phase 1 uses fetch-based authenticated SSE with an `Authorization` header, never query tokens; delayed data is independent of downtime and never blocks a PUT solely due to delay; JSON heartbeat success is verified; `backend/db_schema.py` owns canonical schema; ARM/DISARM transitions are atomic and compatibility-preserving; retention and rollups use UTC; deployment is manual; all 17 routes remain retained; and the 24-hour gate uses signed numerical thresholds.

Historical question lists and alternatives are retained only for traceability. They are not implementation choices. No implementation, deployment, or production readiness is authorized by this document or its approval/status language.

## 1. Program Context

Post-MVP will be implemented in four phases and merged into one integrated production system:

1. **Phase 1 — Reliability**
2. **Phase 2 — Production Hardening**
3. **Phase 3 — Finance & Profitability**
4. **Phase 4 — Dashboard Control Plane**

The selected implementation order is **Option A**. Phase 1 is the foundation for the other phases.

## 2. Production Freeze

The current production system must remain unchanged during brainstorming and planning:

- No production code changes.
- No VPS or Vercel deployment.
- No service restart.
- No pricing configuration changes.
- No database schema or production-data changes.
- No production feature flags or arm/disarm changes.
- No implementation work until the Phase 1 design is approved.

## 3. Confirmed Decisions

### 3.1 Phase ordering

**Decision:** Use Option A:

```text
Phase 1 — Reliability
Phase 2 — Production Hardening
Phase 3 — Finance & Profitability
Phase 4 — Dashboard Control Plane
```

### 3.2 Phase 1 scope

**Decision:** All reliability areas A–F are mandatory in Phase 1.

#### A. Auto-pricing safety

- Anti-oscillation protection for undercut/resume behavior.
- Degraded/guarded mode when orderbook data is stale; stale data must not trigger aggressive repricing.
- Adaptive protection on API errors or rate limiting without unnecessarily stopping healthy cycles.
- Minimum and maximum price boundaries.
- Emergency disarm.
- Cooldown after price changes.

#### B. Daemon monitoring

- Service status.
- Last successful cycle.
- Counts of undercut/resume/hold/error.
- Cycle duration.
- Models that failed processing.
- Running source/release hash.

#### C. Alerting

- Daemon stopped.
- Repeated processing errors.
- Failed PUT requests.
- Database persistence stopped.
- Abnormally fast or large price changes.
- Empty or stale orderbook.

#### D. Audit and observability

- Every pricing decision stored in PostgreSQL.
- Every InferHub request stored with status and latency.
- Price before and after PUT.
- Reference price and trigger boundary.
- Configuration used for the decision.
- Decision reason.
- Cycle correlation ID.

#### E. Recovery

- Automatic service restart.
- Circuit breaker.
- Manual and/or automatic rollback path.
- Decision replay from database history.
- Recovery after server reboot.
- Health-check endpoint.

#### F. Backend reliability

- Orderbook cache.
- Retry with backoff.
- Rate-limit budget.
- InferHub outage fallback.
- Frontend/daemon data consistency.
- Lock preventing multiple active daemons.

### 3.3 Reliability target

**Decision:** Use **Option B — Production** as the initial Phase 1 SLO target:

The 1-minute detection target is an observability target, not a command to shut down pricing. Stale or delayed data should move the system into a guarded/degraded mode, preserve safe HOLD behavior, record the condition, and recover automatically when fresh data returns. The exact guarded-mode actions and escalation thresholds remain open decisions below.

### 3.4 Delayed orderbook behavior

**Decision:** `B + 3`.

- Mark orderbook data as **delayed** after **120 seconds**.
- Keep the daemon and pricing cycles running.
- Continue normal pricing decisions.
- Show a warning and persist the delayed-data event in the audit trail.
- Do not automatically stop the daemon or block PUTs solely because the data is delayed.
- Revisit this behavior only as a separate, evidence-based decision if production monitoring shows unacceptable risk.

- Daemon availability: **99.9% per month**.
- Maximum error detection delay: **1 minute**.
- Automatic recovery for crash, rate-limit, and stale-data conditions.
- Never allow two active daemon processes.
- Every decision and PUT must be persisted.

These targets are design requirements. They are not yet runtime evidence until the implementation exists and monitoring has been running for the agreed observation period.

## 4. Current Production Baseline

The current system already has these relevant capabilities, which Phase 1 must preserve:

- Provider-scoped orderbook semantics (REV12).
- Official-price trigger-area decision contract.
- PostgreSQL operational persistence (REV13):
  - `auto_pricing_ops`
  - `auto_pricing_state`
  - `auto_pricing_api_log`
- Backend catalog/orderbook cache.
- Systemd user service for the daemon.
- Production-lock documentation and rollback backups.
- Existing 10-cycle zero-oscillation soak evidence.

Phase 1 must improve reliability without silently changing the current pricing contract. Any pricing behavior change requires its own explicit decision and regression tests.

## 5. Proposed Phase 1 Workstreams

These are planning workstreams only. They are not approved implementation tasks yet.

### 5.1 Safety and decision guardrails

Define and test:

- stale orderbook threshold;
- maximum acceptable API/data age;
- maximum price delta per cycle;
- minimum and maximum allowed price;
- consecutive-error threshold;
- circuit-breaker states and reset rules;
- undercut/resume oscillation detection window;
- cooldown semantics;
- behavior when current ask and catalog data disagree.

### 5.2 Daemon lifecycle and singleton control

Define:

- authoritative service unit;
- PID/process uniqueness check;
- startup lock strategy;
- reboot recovery;
- graceful shutdown;
- duplicate-process handling;
- health and readiness states;
- ARM/DISARM interaction with recovery.

### 5.3 Observability and persistence

Define the complete event model for:

- cycle start/end;
- per-model decision;
- API request;
- PUT attempt/result;
- circuit-breaker transition;
- alert emission;
- service restart;
- manual arm/disarm;
- configuration change.

Each event must have a timestamp, provider/model scope where applicable, source version, and correlation/cycle identifier.

### 5.4 Monitoring and alerting

Define alert destinations, severity levels, deduplication, escalation, and recovery notifications.

Initial severity proposal:

- **Critical:** duplicate daemon, unsafe target, repeated PUT failure, DB persistence unavailable.
- **High:** daemon stopped, stale orderbook, repeated InferHub rate-limit, circuit breaker open.
- **Medium:** isolated model error, delayed cycle, cache age warning.
- **Info:** restart recovered, circuit breaker closed, normal cycle summary.

### 5.5 Backend and InferHub resilience

Define:

- cache TTL and maximum stale-serving window;
- retry count and backoff/jitter;
- rate-limit budget shared by backend and daemon;
- endpoint priorities;
- fallback behavior per endpoint;
- stale-data labeling in API responses;
- consistency rules between dashboard data and daemon data.

### 5.6 Recovery and rollback

Define tested procedures for:

- daemon crash;
- backend crash;
- InferHub outage;
- PostgreSQL outage;
- corrupted/stale orderbook;
- bad pricing decision;
- duplicate process;
- failed deployment;
- database migration failure.

### 5.7 Phase 1 dashboard scope

**Decision:** Option 3 — Phase 1 includes a full reliability dashboard, not only backend/DB observability.

The dashboard should expose the reliability timeline, persisted pricing operations, API request history, filters by provider/model/action/time, delayed-data warnings, technical-error warnings, service/cycle status, database persistence freshness, and enough decision detail to explain every price action. This is the reliability/control surface for Phase 1; later Phase 4 may expand it with broader operator workflows such as approvals and full configuration management.

### 5.8 Operational history retention

**Decision:** Option 2 — retain reliability and pricing operational history for **90 days**. The current 30-day cleanup policy must be updated during implementation; no production change is made during planning.

### 5.9 Phase 1 dashboard data boundary

**Decision:** Option 1 — reliability data only. Phase 1 dashboard does not include finance, cost, revenue, margin, ROI, or profitability views. Those belong to Phase 3. The dashboard may show pricing values needed to explain an operation, but it must not become a finance dashboard in Phase 1.

### 5.10 Dashboard access

**Decision:** Option 1 — only the primary admin/operator can access the Phase 1 reliability dashboard. No public read-only access and no broad authenticated-user access are added. Existing authentication/session behavior remains the base; finer-grained roles are deferred until required.

### 5.11 Dashboard pricing detail

**Decision:** Option 1 — show full decision detail to the admin/operator: our price, competitor/reference price, trigger boundary, target, action, reason, HTTP status, and relevant timing/source information. This is operational audit data, not finance reporting.

### 5.12 Dashboard control boundary

**Decision:** Option 2 — the Phase 1 dashboard may arm and disarm the auto-pricing daemon. It may not edit pricing configuration, approve individual PUTs, pause individual models/providers, or perform broader production controls in Phase 1. Every arm/disarm action must be authenticated and audited with operator, timestamp, previous state, and new state.

### 5.13 DISARM behavior

**Decision:** Option 1 — DISARM immediately blocks real PUTs while the daemon continues running cycles in dry-run mode. Decisions, warnings, and audit events continue to be recorded. Re-ARM returns to normal PUT behavior according to the existing service logic.

### 5.14 Arm/disarm interaction

**Decision:** Option 1 — one authenticated click changes ARM/DISARM state immediately; no confirmation dialog or typed command is required. The action must still be audited with operator, timestamp, previous state, and new state.

### 5.15 Reliability history navigation

**Decision:** Option 4 — provide all three levels: cycle summary, provider/model drill-down, and detailed event timeline. The cycle view is the overview; model view explains a specific pricing path; event view exposes API calls, PUTs, warnings, errors, and arm/disarm actions.

### 5.16 Real-time dashboard transport

**Decision:** Option 2 — use Server-Sent Events (SSE) for Phase 1 real-time reliability updates. SSE is server-to-client, suitable for cycle/event streams, and simpler than introducing bidirectional WebSocket state for this phase. Existing REST endpoints remain the source for initial loads and historical queries.

### 5.17 SSE authorization and event source

**Decision:** Backend-owned SSE with existing authentication/session/token behavior. The frontend never connects directly to the daemon or InferHub.

The recommended event source is a backend-managed hybrid: PostgreSQL remains the durable source of truth; the backend uses PostgreSQL notification/listening where available for low-latency updates and a lightweight timestamp poll fallback for reconnects or missed notifications. REST remains the recovery path. This avoids tight daemon-to-backend coupling while preserving reliable replay from persisted events.

### 5.18 Real-time update cadence

**Decision:** Option 1 — emit a dashboard update after every completed daemon cycle. The cycle summary event is published after persistence/state write completes, and detail events are available for drill-down. If no clients are connected, events remain recoverable from PostgreSQL through REST history queries.

### 5.19 Cycle visibility

**Decision:** Option 1 — every cycle includes all processed models, including HOLD/stable models. The dashboard must make action categories filterable without hiding the complete cycle snapshot.

### 5.20 HOLD event persistence

**Decision:** Option 1 — persist every HOLD decision for every processed model on every cycle. HOLD is an auditable operational decision, not an omitted/no-op state. The dashboard cycle snapshot and database history must therefore contain the complete model set, including unchanged HOLD rows.

### 5.21 Storage policy

**Decision:** Raw operational events are retained for 30 days. Aggregates are retained for 90 days, with hourly aggregates for the latest 30 days and daily aggregates for days 31–90.

### 5.22 Availability and maintenance policy

**Decision:** Availability is measured by completed-cycle heartbeat. A service/process outage, no completed cycle for 120 seconds, or a global technical failure is downtime. Scheduled, audited maintenance is excluded up to 30 minutes per calendar month; all other downtime counts.

### 5.23 Severity and heartbeat

**Decision:** Use `info`, `warning`, `error`, and `critical`. Emit one compact heartbeat after each completed cycle, including cycle ID, timestamps, duration, model count, and undercut/resume/hold/error counts. JSON state write is required for heartbeat health; DB failure is a separate warning.

### 5.24 Singleton lock

**Decision:** Use a simple PID/lock file as the primary daemon identity. A dead recorded PID permits takeover; a live recorded PID requires manual disarm/investigation. No TTL complexity and no automatic process kill.

### 5.25 Completion observation period

**Decision:** Phase 1 requires a minimum **24-hour** post-deployment observation period before completion can be declared. The observation must record heartbeat continuity, service status, DB freshness, warnings/errors, duplicate-daemon events, and pricing operation health. The 24-hour gate is a completion threshold, not a replacement for the monthly 99.9% availability target.

### 5.26 Production deployment policy

**Decision:** Phase 1 production deployment requires both **green CI + approved pull request + explicit manual deployment approval**. Direct unreviewed pushes or deployments are not valid Phase 1 release evidence.

### 5.27 Staging policy

**Decision:** No separate staging environment is required for Phase 1. CI, pull-request approval, manual deployment approval, and the minimum 24-hour production observation are the required gates.

### 5.28 Rollback policy

**Decision:** Rollback is operator-triggered when any of these conditions is confirmed: incorrect pricing behavior, undercut/resume oscillation, global technical failure, unsafe or untrusted state, duplicate daemon that cannot be resolved safely, or an availability breach. Isolated model errors, normal HOLD decisions, delayed-data warnings, and DB-only outages do not trigger rollback by themselves. The operator first DISARMs when pricing safety is uncertain, records the incident, restores the last known-good release, restarts the affected service, and verifies fresh heartbeat/DB/state evidence before re-arming.

### 5.29 Incident recording

**Decision:** Use the existing reliability/audit event history as the incident record rather than introducing a separate incident table in Phase 1. Incident events must include severity, incident type, detected timestamp, operator/action when applicable, current status, and resolved timestamp. A separate incident-management subsystem is deferred unless Phase 1 evidence shows the shared event model is insufficient.

### 5.30 Cycle correlation

**Decision:** Every event generated during one daemon cycle shares a single `cycle_id`, including cycle summary, per-model decisions, API calls, PUT attempts/results, warnings, and persistence events. Events outside a cycle, such as manual ARM/DISARM, service restart, maintenance, and incident resolution, use their own event correlation ID and may reference the affected cycle.

### 5.31 Cycle ID format

**Decision:** Use a UUID v4 for each cycle and operational correlation event. UUIDs provide global uniqueness, remain opaque to clients, and avoid coupling event identity to wall-clock time or process sequence.

### 5.32 Event idempotency

**Decision:** Every reliability/audit event receives a unique event ID. Database writes and backend/SSE replay paths use that ID for deduplication, so retries and reconnects do not create duplicate logical events. Event IDs are opaque UUIDs and are separate from `cycle_id`.

### 5.33 API event visibility

**Decision:** Store every API request in the durable API history, but let the reliability timeline default to important events only: errors, retries, timeouts, rate limits, slow requests, and persistence failures. Successful routine API calls remain available through a detail filter without overwhelming the default timeline.

### 5.34 Slow API threshold

**Decision:** Treat an API request as slow when its duration exceeds **the applicable endpoint timeout budget**. This avoids inventing one global number: a request nearing or exceeding its configured timeout is operationally relevant. The event records endpoint, elapsed time, configured timeout, and outcome. Endpoint-specific budgets must be defined in the implementation plan from the existing client configuration.

### 5.35 History pagination

**Decision:** Use the pagination strategy that best preserves stable ordering and query performance for the selected database/index design. The implementation plan must choose and document the strategy after inspecting the existing schema and expected query paths; it must not expose unbounded history queries.

### 5.36 Default timeline filter

**Decision:** Default to an operator-useful reliability view selected from the actual event volume and severity distribution during implementation. It must prioritize actionable warnings, errors, critical events, recovery, delayed data, duplicate daemon, persistence failures, and failed PUTs without hiding access to info/success events through explicit filters. The default must be documented and covered by a UI test.

### 5.37 Provider/model scope

**Decision:** The reliability dashboard loads **all providers and models processed by the daemon**, including normal HOLD/stable rows. Actionable filters may narrow the view, but the complete processing scope remains available and auditable.

### 5.38 Default model detail

**Decision:** Use a compact, operator-focused row selected from real dashboard usage and screen-size constraints. It must make action/status, our price, competitor/reference, target, freshness, and the primary warning/error state visible without opening a detail view. API calls and full event history remain in the provider/model drill-down and timeline. The final row fields must be documented and covered by a UI test.

### 5.39 Dashboard information architecture

**Decision:** Choose the final Phase 1 page structure after auditing actual MVP page usage, route dependencies, API consumers, and operational importance. The reliability surface may become the primary operator landing experience, but no existing MVP page is deleted automatically. Unused pages must first be identified with evidence, checked for backend/API dependencies, marked for deprecation, and removed only after explicit scope approval and migration/redirect coverage.

The user's intent is to remove MVP pages that are no longer used; this is a Phase 1 scope requirement, while the exact deletion list remains open until the audit is complete.

**Audit result (2026-08-17):** all 17 MVP pages are routed, present in active navigation, imported by `App.jsx`, and backed by existing API/context dependencies. No page currently satisfies the mandatory removal criteria. Do not delete any page yet. The only quality candidate is `Topups.test.jsx`, which tests a copied local sanitizer rather than the shipped implementation; this is a test-quality cleanup candidate, not a page deletion. `Dashboard.jsx` may become a deprecation candidate only after the new reliability landing ships and usage is re-evaluated.

### 5.40 Page removal criteria

**Decision:** A page is removable only when all three evidence conditions hold: it is absent from active navigation/important routes, has no active usage in code/runtime audit, and provides no remaining MVP operational function. The implementation plan may refine the audit method and add a deprecation/redirect safety check, but it may not weaken these three mandatory conditions.

### 5.41 Post-login landing

**Decision:** The Phase 1 reliability dashboard becomes the primary post-login landing page for the admin/operator. Other retained pages remain accessible through navigation according to the audited information architecture.

### 5.42 Navigation structure

**Decision:** Final navigation is chosen from the page-usage audit, operational priority, route dependencies, and removal criteria. Reliability remains the primary entry point; retained pages stay reachable, deprecated pages receive safe redirects or removal coverage, and no page is hidden solely for visual simplification without evidence.

### 5.43 Visual direction

**Decision:** Phase 1 includes a full visual redesign of the reliability dashboard, using **Vercel Dashboard + Vercel Geist Design System** as the visual reference. The final character is selected by design audit rather than preset choice: it must remain minimal and clean, use restrained accent colors for reliability state, and support high-density operational monitoring without visual noise. The implementation must first identify the exact reference patterns for layout, typography, color, spacing, density, navigation, tables, status indicators, and responsive behavior. "100%" means matching the approved reference patterns and interaction quality, not copying proprietary source code, assets, branding, or protected content.

### 5.44 Desktop density

**Decision:** Use a **comfortable** desktop density: generous whitespace, readable row height, clear grouping, and low visual fatigue. The design may use compact secondary metadata, but it must not optimize for maximum rows per viewport at the expense of scanability.

### 5.45 Mobile responsiveness

**Decision:** The reliability dashboard is fully responsive. All primary monitoring and permitted arm/disarm functions remain usable on mobile, with content reflow, accessible controls, readable status surfaces, and no reliance on hover-only interaction. Detailed event data may use progressive disclosure, but it must remain reachable.

### 5.46 Accessibility baseline

**Decision:** Phase 1 requires a practical baseline: complete keyboard navigation, visible focus states, sufficient color contrast, semantic labels, and accessible status/action controls for the reliability dashboard. Full WCAG 2.1/2.2 certification and dedicated screen-reader testing are deferred unless later evidence or scope requires them.

### 5.47 Browser support

**Decision:** Support current modern versions of Chrome, Edge, Firefox, and Safari, including Safari on supported iOS devices. Unsupported/obsolete browsers are out of scope for Phase 1.

### 5.48 Browser verification

**Decision:** Phase 1 uses manual smoke testing in the supported primary browsers. The smoke checklist must cover login, reliability landing, cycle/model/event views, filters, SSE reconnect/recovery, ARM/DISARM audit behavior, responsive layout, keyboard navigation, and error/warning states.

### 5.49 Login/session reliability

**Decision:** Preserve the existing authentication/session behavior after audit. The implementation must define and test a clear session-expiry path that does not expose reliability data or controls, preserves navigation context where safe, and gives the operator an explicit explanation/recovery path. No new authentication system is introduced in Phase 1.

### 5.50 SSE reconnect and recovery

**Decision:** Use the implementation approach best matched to the existing frontend/backend conventions, but it must provide automatic reconnect, bounded backoff, and REST snapshot/history recovery after reconnect. A disconnected client must not silently display stale reliability state as current, and reconnect/recovery events must be testable and auditable.

### 5.51 SSE backoff policy

**Decision:** The implementation plan must choose the simplest bounded reconnect strategy that fits the existing client conventions and prevents reconnect storms. It must define initial delay, maximum delay, reset-after-success behavior, jitter if needed, and the REST recovery step. The chosen values require tests but are not fixed during brainstorming.

### 5.52 Stale-state indicator

**Decision:** The UI must clearly indicate when the live connection is lost or REST recovery is incomplete. The implementation may choose the exact visual treatment after the Vercel/Geist design audit, but it must not silently present stale reliability data as current. The indicator must be accessible and tested.

### 5.53 Cycle summary

**Decision:** The final summary-card composition is selected during implementation from real operator needs and screen-size testing. It must make daemon status, last heartbeat, cycle duration, processed-model count, undercut/resume/hold/error counts, and DB freshness readily visible, while keeping detailed API/event data in drill-down views.

### 5.54 Status color system

**Decision:** Derive the status palette from the Vercel/Geist reference and accessibility baseline during implementation. Colors must communicate semantic state consistently, remain restrained in the monochrome UI, and never be the only carrier of meaning; labels/icons/text must accompany status colors.

### 5.55 Theme scope

**Decision:** Phase 1 supports **light mode only**. Dark mode and theme switching are deferred to a later phase unless an accessibility or deployment constraint makes them necessary.

### 5.56 Typography

**Decision:** Choose typography after auditing Geist/System sans patterns, readability at the selected comfortable density, available font loading/performance, and operational numeric legibility. The implementation must choose one consistent stack, avoid unnecessary custom-font dependency, and test prices, timestamps, IDs, and status labels at desktop and mobile sizes.

### 5.57 Motion

**Decision:** Phase 1 may use rich, polished motion inspired by modern operations dashboards, but motion must remain purposeful, performant, and accessible. It must communicate live updates, state transitions, loading, reconnect, and severity without distracting from operations. Reduced-motion preferences and safe fallbacks are mandatory; motion must not hide or delay critical information.

### 5.58 Live update motion

**Decision:** Choose live-update animation after UX/performance audit of the actual dashboard data volume. The implementation must avoid animating the whole dashboard unnecessarily, make changed rows/events understandable, preserve scroll position, and provide a reduced-motion/no-animation fallback. The chosen pattern must be covered by a UI test or deterministic visual acceptance check.

### 5.59 Error presentation

**Decision:** Choose error presentation by severity and context during UX audit. Model-scoped errors must remain visible at the model/event level; broad daemon/backend incidents must also have a global summary surface; critical states must be prominent but not unnecessarily blocking. Toasts may supplement persistent evidence but may not be the only record. The mapping must be documented and tested.

### 5.60 ARM/DISARM feedback

**Decision:** Choose ARM/DISARM feedback after auditing API latency, existing control conventions, and safety semantics. The control must provide immediate understandable feedback, must not falsely imply a state change before server confirmation, must show failure/recovery clearly, and must always surface the persistent audit result with operator and timestamp.

### 5.61 ARM/DISARM control surface

**Decision:** Choose the control surface during UI/safety audit from existing conventions and mobile/accessibility constraints. It must make the current state, pending request, last successful change, operator, and timestamp unmistakable; it must be usable with one authenticated action as already decided; and it must not obscure failure or audit confirmation.

### 5.62 ARM/DISARM audit fields

**Decision:** Choose the final audit fields after reviewing existing auth/session and request metadata conventions. At minimum record operator, timestamp, old state, new state, source, and result. Add reason or request metadata only when already available and privacy-safe; do not expand sensitive device/IP collection without a demonstrated operational need.

### 5.63 Simplicity boundary

**Decision:** UI/UX may receive high-polish design, motion, responsive behavior, and visual refinement. System/backend architecture must use the smallest reliable solution: reuse existing tables/auth/services, avoid new queues/workers/subsystems unless required by evidence, and prefer direct indexed REST/SSE flows over speculative abstractions.

### 5.64 System scope boundary

**Decision:** Final system scope is determined by the smallest architecture that satisfies the confirmed reliability contract and observed gaps. The implementation plan must explicitly justify each new component, prefer existing services/tables/auth, and reject speculative event buses, workers, self-healing layers, or abstractions unless a concrete test/evidence gap requires them. UI polish may expand independently without expanding backend architecture.

### 5.65 Brainstorming closeout order

**Decision:** Use the simplest closeout sequence: first normalize and self-review this decision log; second audit existing MVP pages and route/API usage to identify deletion candidates; third present one consolidated Phase 1 design summary with explicit open items; fourth wait for user design approval before writing the implementation plan. No production or implementation action occurs during these steps.

## 6. Historical exploratory questions, non-authoritative

The following section is retained as historical brainstorming context only. It contains alternatives that were superseded by the authoritative decision log. Do not select from these options during implementation.

## 6A. Open Decisions — Historical Record Only

The following questions are intentionally unresolved. Each answer must be added to the Confirmed Decisions section before the next implementation plan is written.

### Question 1 — Detection window and degraded mode

For the 1-minute detection target, what age should mark orderbook data as **delayed** and move the model into guarded/degraded mode? This does **not** automatically stop the daemon. In guarded mode, the system should keep monitoring, persist events, avoid aggressive repricing from stale references, preserve safe HOLD behavior, and recover automatically when fresh data returns.

Options:

- **A:** 60 seconds
- **B:** 120 seconds
- **C:** 180 seconds
- **D:** Custom value

Also choose the default degraded-mode behavior:

- **1:** Keep current ask; no price-moving PUT until fresh data returns.
- **2:** Allow only changes that pass strict safety bounds; otherwise keep current ask.
- **3:** Continue normal decisions but show a warning and persist the stale-data event.
- **4:** Custom behavior

### 3.5 Automatic price-change guard

**Decision:** Option 1 / no additional percentage guard.

The current pricing contract remains authoritative. Phase 1 must not add a new percentage-based clamp; it continues to use the existing configured `max_in` and pricing rules. Any future change requires separate evidence and approval.

### Question 2 — Automatic price-change guard

What maximum percentage change from the current ask should one cycle be allowed to make?

Options:

- **A:** 5%
- **B:** 10%
- **C:** 20%
- **D:** No percentage guard; use only configured `max_in` ✅ selected
- **E:** Custom value

### 3.6 Error threshold — no automatic circuit breaker

**Decision:** No automatic circuit breaker. The user explicitly set "nggak ada" (none).

- There must be **no automatic circuit breaker** and no automatic stop based on consecutive errors.
- After **5 consecutive technical errors on a model**, the system raises a **dashboard alert / warning** and persists an audit event; it does not stop pricing or change model/provider scope.
- Technical errors are timeout, HTTP 5xx, invalid response, or PUT failure.
- Delayed orderbook data at 120 seconds is not counted as an error.
- Daemon and pricing cycles continue running; recovery follows existing service restart/retry; manual decisions are required if conditions are deemed dangerous.

### Question 3 — Circuit-breaker trigger

How many consecutive cycle/model errors should open the circuit breaker?

Options:

- **A:** 3
- **B:** 5 ✅ selected (as dashboard alert threshold only; opens no breaker)
- **C:** 10
- **D:** Any critical error immediately
- **E:** Custom rule

### Question 4 — Error alert notification scope (no breaker)

The user confirmed there is **no automatic circuit breaker**. After a model reaches 5 consecutive technical errors, the alert is recorded in the database/log only. Since "nggak ada" (no breaker) was chosen and the follow-up alert option was answered separately, the chosen alert delivery for the 5-error condition is **dashboard alert**. No pricing is stopped and no other provider/model is affected.

- **A:** Model only — 💥 not used (no breaker)
- **B:** Provider slug — 💥 not used (no breaker)
- **C:** Global daemon — 💥 not used (no breaker)
- **D:** Escalation — 💥 not used (no breaker)

### 3.7 Error alert notification

**Decision:** after a model reaches 5 consecutive technical errors, the alert/event is recorded and surfaced in the **dashboard** (selected option). Alerts are not delivered via Telegram/email in Phase 1 by default. This records the 5-error threshold and the no-breaker policy.

### 3.8 Alert scope

**Decision:** Option 10 — no additional alert conditions in Phase 1. The dashboard may continue showing existing operational state, but Phase 1 will not add new alert rules beyond the 5-consecutive-error dashboard warning. No Telegram or email notification is added.

### Question 6 — Alert destination

Where should Phase 1 alerts be delivered?

- **A:** Telegram
- **B:** Email
- **C:** Dashboard only ✅ selected
- **D:** Telegram + dashboard
- **E:** Telegram + email + dashboard
- **F:** Another channel

### Question 7 — Alert ownership

Who is the operational recipient and escalation owner for critical alerts?

### Question 8 — Database outage

When the orderbook is stale but the current ask is known, should the system:

- **A:** Hold current prices and stop all PUTs
- **B:** Disarm the daemon globally
- **C:** Continue only safe HOLD decisions, no price movement
- **D:** Use the last valid snapshot for a limited grace period

### 3.9 PostgreSQL outage behavior

**Decision:** Option 3 — no special pricing behavior. If PostgreSQL is unavailable while InferHub and pricing logic are healthy, the daemon continues its existing pricing and PUT behavior. Database persistence remains best-effort and the existing JSON/log path remains available. Phase 1 does not block pricing solely because the database is unavailable.

### 3.10 Duplicate daemon behavior

**Decision:** Option 3 — duplicate detection requires manual disarm; no automatic process kill.

- Detect and show the duplicate-process condition in the dashboard/audit state.
- Do not automatically kill either process.
- Operator manually disarms auto-pricing, investigates the processes, and resolves the duplicate safely.
- The production lock still requires one daemon as the desired steady state; this decision defines the response, not permission to operate two daemons normally.

### 3.11 Re-arm after manual intervention

**Decision:** Option 1 — re-arm immediately after the duplicate/error condition is resolved. No mandatory extra dry-run or database review gate is added. Existing service behavior and operator judgment remain authoritative.

### 3.12 PostgreSQL outage fallback

**Decision:** Option 1 — no additional local fallback file. The daemon keeps using the existing JSON state and log behavior already in production. Database persistence remains best-effort, and no new local queue or replay mechanism is added in Phase 1.

### Question 12 — Database outage fallback

If PostgreSQL is unavailable but InferHub and pricing logic are healthy, should the daemon:

- **A:** Continue pricing but block PUTs until persistence returns
- **B:** Continue pricing and PUTs, while writing local durable fallback events
- **C:** No special handling; continue existing pricing and PUT behavior ✅ selected
- **D:** Custom behavior

If PostgreSQL is unavailable but InferHub and pricing logic are healthy, should the daemon:

- **A:** Continue pricing but block PUTs until persistence returns
- **B:** Continue pricing and PUTs, while writing local durable fallback events
- **C:** Immediately open the circuit breaker
- **D:** Custom behavior

### Question 9 — Duplicate daemon

If a second daemon process is detected, should the system:

- **A:** Stop the newest process
- **B:** Stop the oldest process
- **C:** Disarm both and alert
- **D:** Let systemd enforce singleton and alert only

### Question 10 — Recovery authorization

After an automatic circuit-breaker event, should recovery be:

- **A:** Fully automatic
- **B:** Automatic after a cooldown and health checks
- **C:** Manual approval required
- **D:** Automatic for low severity, manual for critical

### Question 11 — Dashboard scope in Phase 1

Should Phase 1 expose reliability status in the existing dashboard immediately, or should it provide backend/DB/API observability first and leave UI work to Phase 4?

- **A:** Backend/DB/API only; Phase 4 owns UI
- **B:** Minimal read-only health panel in Phase 1
- **C:** Full reliability dashboard in Phase 1

### Question 12 — Historical retention

The current operational log retention is 30 days. Should Phase 1 keep:

- **A:** 30 days
- **B:** 90 days
- **C:** 1 year
- **D:** Hot data 30 days + archived data longer
- **E:** Custom policy

### Question 13 — Phase 1 completion observation period

How long must the implemented system run before Phase 1 is declared complete?

- **A:** 24 hours
- **B:** 7 days
- **C:** 14 days
- **D:** 30 days
- **E:** Custom period

### Question 14 — Production deployment policy

For Phase 1 changes, should production deployment require:

- **A:** Green CI + manual deploy approval
- **B:** Green CI + PR approval + manual deploy approval
- **C:** Green CI + staging soak + PR approval + manual deploy approval
- **D:** Custom policy

## 7. Design Approval Gate

No implementation plan, code change, database migration, deploy, or production configuration change begins until:

1. Questions 1–14 are answered or explicitly marked out of scope.
2. The complete Phase 1 design is presented to the user.
3. The user approves the design.
4. A detailed implementation plan is written.
5. The implementation plan is reviewed separately.
6. A final pre-implementation checklist confirms production remains unchanged.

## 8. Decision-log normalization

The original exploratory question list above is retained as historical brainstorming context only. Where it conflicts with the confirmed decisions below, the confirmed decisions are authoritative. No implementation or production change is approved yet.

### Confirmed operational decisions

1. **Delayed orderbook:** mark delayed after 120 seconds; continue cycles and normal pricing; show and persist a warning; do not auto-stop or block PUT solely because data is delayed.
2. **Price guard:** add no percentage-change clamp; retain the existing pricing contract and `max_in`.
3. **Circuit breaker:** none. Five consecutive technical errors on one model produce a dashboard/audit warning only; no automatic stop and no effect on other models. Delayed data is not a technical error.
4. **Alerts:** no new Telegram/email conditions in Phase 1; dashboard/audit only.
5. **PostgreSQL outage:** no special pricing behavior; pricing/PUT continues when InferHub is healthy; DB persistence remains best-effort with existing JSON/log fallback.
6. **Duplicate daemon:** use a simple PID/lock file as primary identity; do not auto-kill. If the recorded PID is no longer alive, a new daemon may take over the stale lock. If it is alive, require manual disarm/investigation.
7. **Re-arm:** operator may immediately re-arm after the duplicate/error condition is resolved; no mandatory extra dry-run or DB-review gate.
8. **DB fallback:** no new local queue, replay file, or memory queue; use existing JSON/log behavior.
9. **Dashboard:** full reliability dashboard is in Phase 1, including cycle timeline, provider/model drill-down, event timeline, operation/API history, filters, warnings, service status, cycle status, DB freshness, and decision details. Finance/revenue/margin remains Phase 3.
10. **Retention:** raw operational events for 30 days; aggregate history for 90 days. Aggregates are hourly for the latest 30 days and daily for days 31–90.
11. **Availability:** target 99.9% per calendar month. Downtime means service/process absence, no completed cycle for 120 seconds, or a global technical failure preventing all models from processing. Isolated model errors, HOLD, delayed data, and DB-only outages are not daemon downtime when cycles continue.
12. **Maintenance:** scheduled and audited maintenance is excluded up to 30 minutes per month. It requires operator, reason, start, and end timestamps; unscheduled or excess maintenance counts as downtime.
13. **Severity:** use `info`, `warning`, `error`, and `critical`. No external notification channel is added in Phase 1.
14. **Heartbeat:** one compact heartbeat after every completed cycle. It records cycle ID, start/end timestamps, duration, model count, and undercut/resume/hold/error counts. Heartbeat health requires cycle completion and JSON state write; DB failure is a separate warning.
15. **Dashboard controls:** only authenticated arm/disarm is allowed in Phase 1. One authenticated click changes state immediately and is audited with operator, timestamp, previous state, new state, and context. Pricing config, individual approvals, model/provider pauses, and max/trigger editing remain out of scope.
16. **Real-time:** backend-owned SSE emits after each completed cycle and persistence/state write; REST provides initial loads, history, and reconnect recovery. Frontend never connects directly to the daemon or InferHub.
17. **Cycle visibility:** every processed model, including HOLD/stable/error/dry-run/warning, is persisted and visible by default; filters may hide rows in the UI.

### Current open decisions

The remaining design questions are intentionally deferred until the next brainstorming turn:

- exact aggregate schema and rollup job implementation;
- observation period required before declaring the implemented Phase 1 complete;
- deployment approval policy and staging requirements;
- exact dashboard API/SSE event names and pagination;
- whether to expose maintenance scheduling UI or only audited operator events.

## 9. Design approval gate

No implementation plan, code change, database migration, deploy, or production configuration change begins until:

1. The confirmed decisions above and all remaining questions are resolved.
2. The complete Phase 1 design is presented to the user.
3. The user approves the design.
4. A detailed implementation plan is written and reviewed.
5. A final pre-implementation checklist confirms production remains unchanged.
