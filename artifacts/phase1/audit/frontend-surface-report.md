# Frontend Surface Audit — Phase 1 Reliability

**Repository:** `C:\Users\faizz\upstream-dashboard`
**Scope:** `frontend/src` routing, layout, sidebar, pages, API clients, tests, styling, accessibility, and build conventions.
**Audit mode:** read-only source inspection; no files, routes, pages, or runtime configuration were modified.
**Evidence date:** 2026-08-18.

## Executive result

The frontend has a working React/Vite shell with a `HashRouter`, `LoginGate`, shared `Layout`, 17 routed MVP pages, a dark/light token provider, and a polling API hook. The current `/` landing is `Dashboard.jsx`, not Reliability. No Reliability page, reliability API module, or SSE/EventSource hook exists. Existing `useApi.jsx` deliberately blocks most API paths, so reliability endpoints must be explicitly added rather than assumed to work.

Phase 1 replacement is structurally feasible at `App.jsx`, `Layout.jsx`, `Sidebar.jsx`, `useApi.jsx`, and new Reliability-specific files, but the current frontend does not implement the required reliability dashboard, REST history, SSE/reconnect recovery, stale-state indication, or audited ARM/DISARM surface. Existing MVP pages should not be deleted based on this audit: all 17 are routed, imported, and navigable.

## 1. Exact route map (17 MVP routes)

Source: `frontend/src/App.jsx:24-53`; route title metadata: `frontend/src/components/Layout.jsx:5-23`; active navigation: `frontend/src/components/Sidebar.jsx:5-27`.

| # | Route | Component | Layout title / breadcrumb | Sidebar section | Current status |
|---:|---|---|---|---|---|
| 1 | `/` | `Dashboard` (`pages/Dashboard.jsx`) | Operations overview / Dashboard / Overview | Overview | Current landing; must become Reliability landing |
| 2 | `/earnings` | `Earnings` | Earnings / Operations / Earnings | Publisher | Retain; uses history/earnings-log |
| 3 | `/upstreams` | `Upstreams` | Upstream fleet / Operations / Upstreams | Publisher | Retain; uses upstream API |
| 4 | `/analytics` | `Analytics` | Analytics / Operations / Analytics | Publisher | Retain; publisher analytics/ranking |
| 5 | `/pnl` | `Pnl` | Profit & loss / Operations / Profit & Loss | Publisher | Retain; finance view (Phase 3 boundary) |
| 6 | `/settlements` | `Settlements` | Settlements / Operations / Settlements | Publisher | Retain; payouts |
| 7 | `/keys` | `Keys` | API keys / Account & Billing / API Keys | Consumer | Retain; create/rotate/revoke |
| 8 | `/topups` | `Topups` | Top-ups / Account & Billing / Top-ups | Consumer | Retain; QRIS operations |
| 9 | `/market` | `Market` | Market & Pricing / Market / Pricing | Publisher | Retain; market/pricing data |
| 10 | `/catalog` | `Catalog` | Catalog & Capacity / Catalog / Capacity | Publisher | Retain; catalog |
| 11 | `/usage` | `Usage` | Usage & Cache / Usage / Cache | Consumer | Retain; usage/cache/logs |
| 12 | `/asks` | `Asks` | Ask Price / Ask Price / Manual | Publisher | Retain; manual ask controls |
| 13 | `/budgets` | `Budgets` | Budgets / Publisher / Budgets | Publisher | Retain; budget controls |
| 14 | `/combos` | `Combos` | Combos / Publisher / Combos | Publisher | Retain; combo create/delete |
| 15 | `/fleet-health` | `FleetHealth` | Fleet Health / Fleet / Health | Publisher | Retain; provider recheck |
| 16 | `/auto-pricing` | `AutoPricing` | Auto-Pricing / Auto / Pricing | Publisher | Existing ARM/config surface; compatibility dependency |
| 17 | `/settings` | `Settings` | Settings / System / Settings | System | Retain; settings/auth-related operations |

`Sidebar.jsx` exposes every route above through `NavLink`; `/` alone has `end: true`. `Layout` uses `TITLES[loc.pathname]`, defaulting unknown paths to `/` metadata. There is no `/reliability` route and no redirect from the existing root to a Reliability page.

### Page/deletion audit conclusion

- Every one of the 17 routes is imported by `App.jsx`, routed, and present in `Sidebar.jsx`.
- Existing pages have API/context dependencies; examples include `Dashboard` history/earnings, `Earnings` history/log, `Upstreams`, `Market`, `Catalog`, `Usage`, `AutoPricing`, and control pages.
- Current evidence does **not** satisfy the required deletion test: absence from active navigation/important routes, no active code/runtime usage, and no remaining MVP operational function.
- `Dashboard.jsx` may become a deprecation candidate only after Reliability ships and usage is re-evaluated. Do not delete any page in this audit.

## 2. Integration points and symbols

### Application shell and routing

- `frontend/src/main.jsx`: `createRoot`, `StrictMode`, imports `index.css` and `App.css`, renders `App`.
- `frontend/src/App.jsx`: `App`, `ErrBoundary`; `ThemeProvider > ErrBoundary > HashRouter > Routes > LoginGate/Layout > Outlet` composition.
- `frontend/src/components/Layout.jsx`: `TITLES`, `Layout`; calls `useApi('/api/data', 15000)`, renders `Sidebar`, topbar, live pill, balance, refreshed timestamp, and `Outlet context={{ data }}`.
- `frontend/src/components/Sidebar.jsx`: `SECTIONS`, `Sidebar`; `NavLink` active classes; theme toggle via `useTheme`.
- `frontend/src/components/LoginGate.jsx`: `LoginGate`; password form, session token check, login state, redirect to `#/` after success.

### Existing page/component inventory

Pages: `Dashboard.jsx`, `Earnings.jsx`, `Upstreams.jsx`, `Analytics.jsx`, `Pnl.jsx`, `Settlements.jsx`, `Keys.jsx`, `Topups.jsx`, `Market.jsx`, `Catalog.jsx`, `Usage.jsx`, `Asks.jsx`, `Budgets.jsx`, `Combos.jsx`, `FleetHealth.jsx`, `AutoPricing.jsx`, `Settings.jsx`.

Shared components: `Badge.jsx`, `DataTable.jsx`, `EarningsChart.jsx`, `KpiCard.jsx`, `Layout.jsx`, `LoginGate.jsx`, `Sidebar.jsx`, `Skeleton.jsx`, `Sparkline.jsx`.

Shared utility/theme: `frontend/src/hooks/useApi.jsx`, `frontend/src/lib/fmt.js`, `frontend/src/theme.jsx`.

No `Reliability.jsx`, `lib/reliabilityApi.js`, or `hooks/useReliabilityStream.js` exists.

## 3. API client, auth, and session patterns

Source: `frontend/src/hooks/useApi.jsx`.

- `API = import.meta.env.VITE_API_URL || ''`; API URLs are same-origin by default.
- `getSessionToken()` / `setSessionToken()` use `sessionStorage` key `upstream_session_token`, with guarded storage access.
- `loginWithPassword(password)` POSTs JSON to `/api/login`, stores returned `token`, and throws on non-OK response.
- `authHeaders()` prefers `Authorization: Bearer <session token>` and falls back to `X-Auth` from `VITE_DASHBOARD_PASSWORD` (explicitly deprecated and unsafe to bundle in production).
- `LoginGate` initially checks only `getSessionToken()`. It does not proactively validate/refresh a token, handle a 401 globally, or preserve the original deep-link beyond resetting to `#/` after login.
- `apiFetch(path, options)` is guarded by `isApiEnabled(path)`.
- Current allowlist is only `/api/auto-pricing` and descendants plus exact `/api/orderbook` and `/api/ask` (`FOCUSED_API_PREFIX`, `MANUAL_ASK_PATHS`).
- `useApi(path, pollMs)` fetches with `AbortController`, loading/error state, optional interval polling, and cleanup. It does not implement SSE, cursor recovery, stale/live state, or reconnect backoff.
- Existing pages nevertheless call `useApi` for many paths (`/api/data`, `/api/history`, `/api/market`, `/api/finance`, `/api/keys`, etc.); the hook's current implementation sets no data for disallowed paths. This is an important integration gap to resolve or avoid duplicating for Reliability.
- `AutoPricing.jsx` uses `apiFetch('/api/auto-pricing/arm', { method: 'POST', body: { armed } })`; this existing endpoint is a compatibility dependency and currently is not a reliability audit surface.

### Required Reliability API status

| Required capability | Expected Phase 1 surface | Current frontend evidence | Status |
|---|---|---|---|
| Summary | `/api/reliability/summary` | No caller/module | Missing |
| Cycle history | `/api/reliability/cycles` | No caller/module | Missing |
| Event timeline | `/api/reliability/events` | No caller/module | Missing |
| Model/provider drill-down | `/api/reliability/models` or equivalent | No caller/module | Missing |
| Live updates | `/api/reliability/stream` via backend-owned SSE | No `EventSource` anywhere in `src` | Missing |
| ARM | `/api/reliability/arm` or compatibility wrapper | Only `/api/auto-pricing/arm` in `AutoPricing.jsx` | Missing for Reliability |
| DISARM | `/api/reliability/disarm` or compatibility wrapper | No dedicated frontend Reliability action | Missing |
| Authenticated requests | Bearer session token | Existing token/header helper available | Partial foundation |
| REST recovery after SSE reconnect | Snapshot/history refetch | No stream hook/recovery logic | Missing |
| stale/disconnected indicator | Accessible live/recovery status | Layout has static `Live` pill unrelated to SSE | Missing |

The backend baseline/plan audit confirms these Reliability endpoints are absent on the server too; this report does not infer runtime availability from frontend intent.

## 4. Required dashboard surface versus current implementation

Requirements are taken from `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability.md`, especially decisions 5.7, 5.12-5.23, 5.30-5.60, and the audit reports in `artifacts/phase1/audit/`.

| Requirement | Current evidence | Status / gap |
|---|---|---|
| Reliability becomes post-login landing | Root maps to `Dashboard`; `LoginGate` redirects to `#/` | Not implemented |
| Reliability-only scope, excluding finance/profitability | Existing root is finance/earnings-oriented; no Reliability page | Missing |
| Full dashboard: service status, heartbeat, cycle duration, counts, DB freshness | No Reliability component/API | Missing |
| All processed models including HOLD visible | No reliability model view | Missing |
| Cycle summary, provider/model drill-down, detailed events | No routes/components/data client | Missing |
| Filters by provider/model/action/time | Existing pages have local filters, but no Reliability filters | Missing |
| Delayed-data warning at 120s | No frontend reliability state/API | Missing |
| Five-consecutive-technical-error dashboard warning without breaker | No frontend reliability state/API | Missing |
| Persisted pricing/API operation detail: prices, trigger, target, reason, HTTP, timing/source | No reliability detail component | Missing |
| Backend-owned SSE after completed cycle | No EventSource client; static Layout live pill only | Missing |
| Automatic reconnect, bounded backoff, REST snapshot/history recovery | No stream hook | Missing |
| Never present disconnected data as current | No connection state or stale marker | Missing |
| Authenticated ARM/DISARM, one-click, server-confirmed feedback | Existing AutoPricing arm action only; no audit/result display | Missing for Phase 1 |
| ARM/DISARM audit fields: operator, timestamp, old/new state, source, result | No frontend display/client contract | Missing |
| Light mode only | `ThemeProvider` defaults to `dark`; sidebar toggle persists both themes | Conflicts; must change/scope for Phase 1 |
| Comfortable desktop density | Existing dense ledger/table system; `--row-h: 36px` | Partial; needs Reliability-specific review |
| Responsive mobile monitoring and controls | CSS has mobile sidebar, overflow tables, breakpoint grids | Foundation exists; Reliability behavior unverified |
| Keyboard navigation, visible focus, semantic labels, contrast | Global `:focus-visible`; some `aria-label`, table keyboard sorting; many icon/modal controls lack semantics | Partial; needs Reliability-specific evidence/tests |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` collapses animation/transition duration | Foundation exists; live update behavior unimplemented |
| Current browser smoke support | No browser test/config in frontend source | Not evidenced |
| Session expiry without data/control exposure | Login exists, but no global 401/session-expiry path | Gap |

## 5. Styling and design-system conventions

Sources: `frontend/src/theme.jsx`, `frontend/src/index.css`, `frontend/src/App.css`, `frontend/index.html`.

- Tokens are set at runtime by `ThemeProvider`: `--bg`, `--layer`, `--card`, `--elevated`, `--surface2`, border/text tokens, `--accent`, semantic `--pos`/`--neg`/`--warn`, and soft backgrounds.
- `index.css` only defines radius defaults; the substantial system is in `App.css`.
- `App.css` documents a “Ledger” fintech system: Inter + JetBrains Mono, hairline borders, 4px base radius, tabular numerics, dense panels/tables, no-shadow intent. Later sections introduce inconsistent 5/6/7/8/10/12px radii, hardcoded colors, shadows, duplicate modal/button rules, and undefined legacy variables (`--bg-soft`, `--success`, `--surface`, `--mono`, `--success-r/g/b`).
- Existing primitives/classes include `.panel`, `.kpi`, `.tbl/.table`, `.badge-*`, `.btn`, `.btn-ghost`, `.btn-primary`, `.inp`, `.modal`, `.range-pills`, `.skeleton`, `.datatable`, and grid/layout utilities.
- `index.html` loads Inter and JetBrains Mono from Google Fonts and sets `lang="id"`, viewport, title, and description.
- Theme currently supports dark and light with localStorage persistence and a visible sidebar toggle; Phase 1 explicitly requires light-only. Reliability work must decide whether to scope/disable the toggle rather than assume current theme behavior is compliant.
- Existing visual patterns are reusable, but Reliability should not add ad-hoc hardcoded colors/spacing. New status states should extend semantic tokens and include text/icons in addition to color.

## 6. Responsive and accessibility conventions

Evidence in `App.css`, `Sidebar.jsx`, `Layout.jsx`, `DataTable.jsx`, `Skeleton.jsx`, `EarningsChart.jsx`, and page grep results:

- Desktop shell: flex layout, sticky sidebar, `.main` max width 1440px.
- At `max-width: 900px`, sidebar is hidden by the base rule, then at `max-width: 860px` becomes a fixed off-canvas drawer opened by `.sidebar.open`; `.menu-btn` becomes visible.
- At `max-width: 860px`, main padding reduces to 14px and tables may horizontally scroll; buttons get minimum heights.
- KPI, earnings, P&L, and summary grids collapse at 1200/1100/900/600/520px breakpoints.
- `:focus-visible` provides a 2px accent outline globally.
- Existing semantic examples: `nav aria-label="Main"`, menu/theme/search labels, table `aria-live` on Earnings, chart `role="img"` + label, skeleton `role="status"`, tablist/group labels, `aria-pressed` for Earnings ranges, keyboard Enter sorting in `DataTable`.
- Gaps: mobile drawer has no explicit overlay/close-on-navigation evidence; modal implementations commonly use click handlers without dialog roles/focus trapping; `th onClick` sorting is not consistently semantic; several icon-only close buttons lack `aria-label`; static `Live` is not a connection status. These are conventions to improve or explicitly test on Reliability.
- Reduced-motion CSS exists at `App.css:278-280`, but there is no Reliability live-row animation yet and no test evidence for reduced-motion behavior.

## 7. Tests and build conventions

### Frontend scripts

`frontend/package.json`:

- `npm run dev` → `vite`
- `npm run build` → `vite build`
- `npm run lint` → `oxlint`
- `npm test` → `vitest run --coverage`
- `npm run test:watch` → `vitest`
- `npm run preview` → `vite preview`

`frontend/vitest.config.js`:

- `environment: 'node'`, `globals: true`
- includes `src/**/*.test.{js,jsx}`
- coverage reporters `text`, `json-summary`
- includes `src/**/*.{js,jsx}`; excludes `src/main.jsx` and `src/theme.jsx`.

`frontend/vite.config.js` uses React plugin and dev proxy `/api` → `http://127.0.0.1:8124`. `frontend/vercel.json` builds to `dist` and rewrites `/api/:path*` to `https://ops.budgezen.com/api/:path*`.

### Existing test references

- `frontend/src/hooks/useApi.test.jsx`: tests `isApiEnabled` and currently expects `/api/auto-pricing`, `/api/auto-pricing/config`, `/api/orderbook`, `/api/ask` true and `/api/data`, `/api/market` false. This test documents the intentional/current allowlist and will need new Reliability expectations.
- `frontend/src/pages/Topups.test.jsx`: exists; prior audit identifies it as testing a copied local sanitizer rather than the shipped implementation, a test-quality issue, not a page-removal reason.
- `frontend/src/lib/fmt.test.js`: formatting utility tests.
- `frontend/coverage/coverage-summary.json`: generated coverage artifact exists; not runtime evidence.
- No Reliability page/API/SSE tests exist. No browser/E2E test harness is present in `frontend/package.json`.

Repository README and `.github/workflows/ci.yml` establish the CI convention: backend pytest/coverage plus frontend Vitest/coverage, lint, and build; CI has no CD. The prescribed frontend verification commands are `npm test`, `npm run lint`, and `npm run build` from `frontend/`.

## 8. Exact implementation gaps to close

1. Add a Reliability page/component and route; switch `/` post-login landing without removing retained routes.
2. Add a Reliability API client with authenticated summary, bounded cycles/events/models/history, filters, stable ordering/pagination, and ARM/DISARM calls.
3. Extend or separate the API allowlist without regressing existing callers; add tests for reliability paths and unauthorized/session-expired behavior.
4. Add native `EventSource` handling for backend SSE, or the selected authenticated SSE mechanism compatible with current session behavior; define reconnect backoff, success reset, and REST recovery.
5. Add explicit `connected`, `reconnecting`, `stale`, `recovered`, and error UI states; do not label stale snapshots “Live.”
6. Build cycle summary, model/provider drill-down, event timeline, operation/API detail, provider/model/action/time filters, delayed warning, five-error warning, and DB freshness surfaces.
7. Add server-confirmed ARM/DISARM feedback and persistent audit result display; preserve `/auto-pricing` compatibility.
8. Reconcile Phase 1 light-only requirement with `ThemeProvider` dark default and theme toggle.
9. Extend semantic labels, keyboard behavior, focus management, modal/dialog behavior, contrast-safe status tokens, mobile drawer behavior, and reduced-motion live updates.
10. Add unit/component tests for API contracts, stream lifecycle/recovery/stale state, landing route, filters, ARM/DISARM feedback, accessibility-critical controls, and light-only behavior. Add manual browser smoke evidence separately because no E2E harness exists.
11. Run lint, tests with coverage, and build; inspect diagnostics on changed files. Runtime claims require actual evidence and must not be inferred from source shape.

## 9. Requirement status summary

| Area | Status |
|---|---|
| 17 MVP routes enumerated | PASS — all 17 mapped above |
| Active navigation enumerated | PASS — all 17 represented in `Sidebar.SECTIONS` |
| Current landing identified | PASS — `/` → `Dashboard.jsx` |
| Auth/session pattern identified | PASS — `LoginGate`, `sessionStorage`, Bearer token, deprecated X-Auth fallback |
| Layout/sidebar integration points identified | PASS |
| API clients/hooks identified | PASS — `useApi`, `apiFetch`, allowlist, polling/abort behavior |
| Existing page/API dependencies identified | PASS — source grep/AST evidence |
| Responsive/accessibility conventions identified | PASS — breakpoints, focus, labels, reduced motion, gaps |
| Test/build commands identified | PASS — package scripts, Vitest, Vite, Oxlint, CI README convention |
| Reliability route/page | FAIL — absent |
| Reliability REST client and data views | FAIL — absent |
| Reliability SSE/reconnect/recovery | FAIL — absent |
| Reliability ARM/DISARM audit UI | FAIL — absent; old AutoPricing control only |
| Reliability stale/error/DB freshness UI | FAIL — absent |
| Phase 1 light-only theme | FAIL — dark default/toggle currently present |
| No-deletion decision evidence | PASS — no route currently satisfies all removal criteria |

**Audit conclusion:** frontend discovery is complete and supports a focused Reliability landing replacement while retaining all existing MVP routes. Source implementation is not represented by this artifact and should remain behind the documented Phase 1 design/implementation approval gate. No runtime behavior, endpoint availability, SSE delivery, or production status is claimed without execution evidence.
