# Original User Request

## 2026-08-23T12:37:18Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: A small focused team

Implement native mobile touch gestures (Swipe-to-Close) for the Sidebar and Floating Sheets in a React/Tailwind application to match iOS 26 behavior.

This is a single self-contained fix; keep it small and focused.

Working directory: c:\Users\faizz\upstream-dashboard\frontend
Integrity mode: development

## Requirements

### R1. Sidebar Swipe-to-Close
Modify `Sidebar.jsx` to support touch/drag gestures. When the user drags the open sidebar to the left past a certain velocity or distance threshold, it should trigger the `onClose` callback to dismiss the sidebar smoothly.

### R2. Floating Sheet Swipe-to-Close
Modify `ModelDetailDrawer.jsx` (which acts as a `.ios-sheet`) to support a vertical drag gesture. Dragging the sheet downwards should dismiss it. Ensure the drag handle (`.ios-sheet-handle`) or the entire sheet responds to drag events natively.

### R3. Spring Physics Integration
Use the project's existing `motion/react` (Framer Motion) library to handle the `drag` properties (`drag="x"`, `drag="y"`, `dragConstraints`, `dragElastic`, `onDragEnd`) so the swipe feels bouncy, physics-based, and identical to native iOS interactions. Do not install new dependencies like `react-use-gesture` unless absolutely necessary; stick to Framer Motion.

## Acceptance Criteria

### Verification
- [ ] `npm run build` completes successfully.
- [ ] `npx vitest run` passes all existing tests (ensure gesture wrappers don't break component rendering in tests).
- [ ] `Sidebar.jsx` utilizes Framer Motion's `drag="x"` (or similar) to allow horizontal dismissal.
- [ ] `ModelDetailDrawer.jsx` utilizes Framer Motion's `drag="y"` (or similar) to allow vertical dismissal.

## 2026-08-23T12:41:47Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: A small focused team

The user wants to eliminate the generic "system green" (emerald) status colors across the dashboard, as they look too much like a standard admin panel rather than an iOS 26 / VisionOS spatial UI. Replace all instances of `emerald` and generic green badges with Apple HIG-compliant semantic colors (e.g., subtle indigo, sky blue, translucent white, or deep glass effects) while preserving the semantic meaning of "success" or "active".

This is a single self-contained fix; keep it small and focused.

Working directory: c:\Users\faizz\upstream-dashboard\frontend
Integrity mode: development

## Requirements

### R1. Replace Emerald/Green utility classes
Scan the frontend components (especially `Reliability.jsx`, `Badge.jsx`, `KpiCard.jsx`, `Finance.jsx`, and any topbar/status components) and replace Tailwind `emerald-*` classes. Use colors more aligned with Apple's spatial design language: 
- For "Active/Healthy" states: Use a soft vibrant blue (`sky-500`), a deep spatial indigo (`indigo-500`), or a glowing monochromatic glass (`bg-white/10 text-white`). 
- Avoid raw system greens unless strictly necessary for financial positive deltas.

### R2. Refine Status Badges
Ensure that "ARMED", "healthy", "SSE Connected", and provider tags do not look like flat bootstrap badges. They should use `ios-badge` or similar subtle translucent glass styling (`bg-white/10 border-white/20`) rather than bright solid green backgrounds.

## Acceptance Criteria

### Verification
- [ ] `npm run build` completes successfully.
- [ ] `npx vitest run` passes all existing tests (no component test IDs are broken).
- [ ] A `grep -r "emerald" src/` (or equivalent search) shows a significant reduction in `emerald` usage across `Reliability.jsx` and status components.

## 2026-08-23T12:45:27Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: The full multi-agent team

The user feels the overall layout still looks like a generic "operational admin dashboard" (like Grafana or standard Tailwind templates) rather than a "Pure iOS 26 / VisionOS Spatial Application". The goal is to completely restructure the layout paradigms (KPI cards, tables, headers) into authentic Apple HIG paradigms while retaining all functionality.

Working directory: c:\Users\faizz\upstream-dashboard\frontend
Integrity mode: development

## Requirements

### R1. Overhaul KPI Cards to Apple Widgets/Health App Style
Refactor `KpiCard.jsx` and the metric grids in `Reliability.jsx` and `Finance.jsx`. 
- Discard the blocky, standard admin-panel look (big number in the center of a huge box). 
- Adopt Apple's "Health app" or "VisionOS Control Center" widget style: compact, semantic groupings, elegant typography (SF Pro Display), and subtle visual hierarchy. 

### R2. Refactor Tables to iOS Inset Grouped Lists
Transform the standard HTML data tables (like the Model Inventory and Recent Completions) into iOS "Inset Grouped" lists.
- Remove standard table headers (`<thead>`) if they look too web-like, or restyle them to look like subtle iOS section headers.
- Rows should be clean, separated by 1px translucent lines (`border-bottom: 1px solid rgba(0,0,0,0.05)`), with no harsh zebra-striping.

### R3. App-like Header and Navigation
Transform the generic web page headers ("Reliability & Operations" + subtitle) into native-feeling iOS Large Navigation Titles. Ensure the spacing, padding, and typography scale feels like a native desktop/iPad app, not a web admin template.

## Acceptance Criteria

### Verification
- [ ] `npm run build` completes successfully.
- [ ] `npx vitest run` passes all existing tests (no component test IDs are broken).
- [ ] The dashboard grid no longer resembles a generic 4-column Bootstrap/Tailwind admin template, but rather a fluid, widget-based spatial layout.

## 2026-08-23T16:02:24Z

# Teamwork Project — iOS Loading States + Glass Context Menu

Working directory: c:\Users\faizz\upstream-dashboard\frontend
Integrity mode: development

Implement two native iOS 26 interaction patterns: skeleton loading screens and a glass context menu that appears on right-click or long-press.

## Requirements

### R1. iOS-Style Skeleton Loading States
Create a reusable `SkeletonLoader` component (`src/components/SkeletonLoader.jsx`) with:
- Animated shimmer effect (left-to-right shimmer using `@keyframes shimmer` with `background: linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.15), rgba(255,255,255,0.05))`)  
- Skeleton variants for: KPI card (`SkeletonKpiCard`), list row (`SkeletonRow`), and full page (`SkeletonPage`)
- Use these skeletons in `Reliability.jsx` and `Finance.jsx` while `useApi` hook is loading (when `data` is null/undefined)
- Replace any existing spinner/loading text with these skeleton screens
- Must work in both Light Mode and Dark Mode

### R2. Glass Context Menu
Create a `ContextMenu` component (`src/components/ContextMenu.jsx`) that:
- Appears on right-click on any `.ios-glass-card` element in the dashboard
- Styled as an `.ios-sheet` glass panel (blur, translucent background, rounded corners, shadow)
- Contains contextual actions (e.g., "View Details", "Copy Model ID", "Dismiss") with `.ios-menu-item` styling
- Animates in with Framer Motion `scale(0.8) → scale(1)` spring entrance
- Closes on click outside, Escape key, or selecting an action
- Smart positioning: never clips off-screen edges

## Acceptance Criteria
- [ ] `npm run build` completes successfully.
- [ ] `npx vitest run` passes all existing tests.
- [ ] `SkeletonLoader.jsx` exists and is rendered in `Reliability.jsx` when data is loading.
- [ ] `ContextMenu.jsx` appears on right-click on glass cards.

## 2026-08-23T16:02:23Z

# Teamwork Project — iPad Split View + Enhanced Spotlight Search

Working directory: c:\Users\faizz\upstream-dashboard\frontend
Integrity mode: development

Implement two iOS 26 navigation paradigms: a persistent iPad-style sidebar split view for large screens, and a deeply enriched Command Palette (Spotlight) with categories and animated results.

## Requirements

### R1. iPad Split View Layout
Modify `Layout.jsx` and `Sidebar.jsx` to implement true iPad-style persistent split view:
- On screens `>= 1024px (lg breakpoint)`: sidebar should be **always visible** on the left (no toggle), content shifts right. Sidebar width: `w-64`.
- On screens `< 1024px`: existing mobile drawer behavior stays (hamburger → slide-in overlay).
- The sidebar in split-view mode must NOT have an overlay/backdrop — it's a native panel.
- `Topbar.jsx`: hide the hamburger menu button on `lg:` screens since sidebar is always visible.
- The transition between mobile and desktop should be smooth.

### R2. Enhanced Spotlight / Command Palette
Enhance `src/components/CommandPalette.jsx`:
- Add result categories with glass section headers (e.g., "Pages", "Models", "Actions")
- Each result row should have a leading icon (use lucide-react icons) + label + keyboard shortcut hint on the right
- Animate search result list items in with staggered Framer Motion entrance (`initial={{ opacity: 0, y: 8 }}`, each item 30ms delayed)
- Add keyboard navigation (↑/↓ arrows to select, Enter to navigate)
- Add a "No results" empty state with a muted glass illustration

## Acceptance Criteria
- [ ] `npm run build` completes successfully.
- [ ] `npx vitest run` passes all existing tests.
- [ ] On `>= 1024px` viewport, sidebar is always visible without hamburger toggle.
- [ ] `CommandPalette` shows categorized results with staggered animation.

## 2026-08-24T00:24:18+07:00

# Teamwork Project Prompt
> Goal: Publisher & Operations Tools

Working directory: c:\Users\faizz\upstream-dashboard
Integrity mode: development

## Requirements

### R1. Provider Quota Tracker (Reliability)
- Di `Reliability.jsx`, tambahkan progress bar/indikator kuota untuk setiap provider card.
- Ambil data dari `GET /publisher/providers/usage-windows` (atau data yang di-pass dari backend `/api/data`).

### R2. Earnings Transfer (Finance)
- Di `Finance.jsx`, tambahkan tombol "Transfer ke Consumer Balance".
- Panggil `POST /publisher/earnings/transfer` dengan input nominal.

### R3. Simplified Live Market Rates (Pricing)
- Di `Pricing.jsx`, tambahkan tabel/list sederhana yang menampilkan *live asks* terendah dan tertinggi.
- Ambil data dari `GET /market` (batasi tampilan ke info esensial saja).

### R4. Simplified Budget Manager (Auto Pricing)
- Di `AutoPricing.jsx`, sediakan input sederhana untuk mengatur *spend cap* (`maxInputPerMtok`, dll) per model.
- Panggil `PUT /budgets/{modelId}` untuk menyimpannya.

### R5. Withdrawal OTP Flow (Finance)
- Di `Finance.jsx`, tambahkan modal/flow untuk *Payout* yang membutuhkan verifikasi OTP.
- Implementasikan call ke `/publisher/withdrawals/otp` (request) dan `/publisher/withdrawals` (submit).

### R6. Backend Integration
- Buka route proxy yang relevan di `backend/app.py` menggunakan `inferhub_get/post/put`.
- Tambahkan prefix yang diperlukan ke `isApiEnabled` dalam `useApi.jsx`.

## Acceptance Criteria
- [ ] UI komponen baru (Quota, Transfer, Market Rates, Budget, Payout) ter-render sesuai gaya iOS 26 tanpa merusak layout lama.
- [ ] Semua panggilan API di-proxy lewat `backend/app.py` menggunakan auth token yang tepat.
- [ ] Error handling state (contoh: salah OTP, transfer gagal) ditangani via UI feedback (alerts/toast).
- [ ] `npm run build` dan `npx vitest run` selesai dengan sukses (Exit 0).

