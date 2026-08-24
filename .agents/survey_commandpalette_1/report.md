# Specification Survey Report: Command Palette & Spotlight Search

**Target Component**: `frontend/src/components/CommandPalette.jsx`  
**Integration Points**: `frontend/src/components/Layout.jsx`, `frontend/src/components/Topbar.jsx`  
**Associated Test Suite**: `frontend/src/components/CommandPalette.test.jsx`, `frontend/src/components/Layout.test.jsx`  
**Survey Date**: 2026-08-23  

---

## 1. Executive Summary & Component Architecture

The **Command Palette (Spotlight Search)** in `upstream-dashboard` is an Apple iOS 26 spatial modal search interface designed for rapid keyboard-driven navigation, model inspection, operational automation triggers, and preference toggles.

### Core Architecture
- **Mounting**: Conditionally rendered in `Layout.jsx` with `{searchOpen && <CommandPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />}`.
- **Trigger Mechanisms**:
  - Global Keyboard Shortcut: `⌘K` / `Ctrl+K` (handled by `Layout.jsx` window key listener).
  - Quick Search Button: Topbar button `<button className="ios-btn-glass" onClick={onOpenSearch}>` with leading `<Search size={14} />` and `⌘K` kbd badge.
- **Routing & Execution**: Powered by `useNavigate()` (`react-router-dom`), executing parameterized routes (e.g. `/?search=claude-3-5-sonnet`) and navigation to major modules (`/`, `/finance`, `/auto-pricing`, `/pricing`, `/settings`).
- **Theming Integration**: Uses `useTheme()` from `../theme` with real-time dynamic label updates (`Switch to Light Mode` / `Switch to Dark Mode`) and `⇧⌘T` shortcut.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Categorization | Grouped Command Registry | Commands organized into ordered categories: `Pages`, `Models`, `Actions`, `Preferences` (plus dynamic `Other` fallback). | `commands` array with `category` property | Grouped sections in order with section headers and item counts | Uncategorized items placed in `Other` group | `CommandPalette.jsx:234-266` |
| 2 | Categorization | Glass Section Headers | Translucent section header with uppercase title, dot indicator, and item counter badge. | Category title, item count | Rendered header `<div className="px-3 py-1.5 text-[11px] ...">` | N/A | `CommandPalette.jsx:404-412` |
| 3 | Filtering | Multi-Field Search | Fuzzy multi-field search across `title`, `sub`, `category`, and `keywords` array. | User input string `query` | Filtered list of matching commands | Empty list triggers Empty State | `CommandPalette.jsx:221-231` |
| 4 | Search UX | Clear Query Button | Inline `X` button appears when `query` is non-empty to clear input with one click. | Button click event | Sets `query = ''`, refocuses full item list | Safe no-op if query already empty | `CommandPalette.jsx:358-366` |
| 5 | Row UX | Leading Squircle Icon | Rounded-xl container with category/action specific Lucide icon (e.g. `<Activity>`, `<Cpu>`, `<Sparkles>`). | `item.icon` React component | Rendered icon with active/inactive contrast background | Falls back to default container | `CommandPalette.jsx:441-449` |
| 6 | Row UX | Dual-Line Metadata | Title in bold (`text-xs sm:text-sm font-semibold`) and subtitle metadata in muted text (`text-[11px] sm:text-xs`). | `item.title`, `item.sub` | Styled title + subtitle text with text truncation | Safe truncation with CSS `truncate` | `CommandPalette.jsx:452-459` |
| 7 | Row UX | Shortcut Badges | Monospace `<kbd>` badges indicating keyboard shortcut (e.g. `⌘1`-`⌘5`, `↵`, `⇧⌘T`). | `item.shortcut` string | Styled `<kbd>` badge + animated `CornerDownLeft` when selected | Omitted if no shortcut defined | `CommandPalette.jsx:463-481` |
| 8 | Animation | Spring Modal Entrance | Apple HIG Spring modal entrance with backdrop blur. | `isOpen` prop transition | `scale: 0.96 -> 1`, `y: -16 -> 0`, spring damping 26, stiffness 320 | N/A | `CommandPalette.jsx:338-342` |
| 9 | Animation | Staggered Row Entrance | Framer Motion staggered fade-in and slide-up per item row. | `globalIndex` counter | `initial={{ opacity: 0, y: 6/8 }}`, `animate={{ opacity: 1, y: 0 }}`, `delay: index * 0.03` | Delay capped at 0.3s for large lists | `CommandPalette.jsx:422-427` |
| 10 | Navigation | 1D Continuous Arrow Navigation | `ArrowUp` and `ArrowDown` navigate smoothly across categories with wrap-around. | Keyboard arrow key events | Updates `selectedIndex` (0 to N-1) | Wraps from bottom to top and vice-versa | `CommandPalette.jsx:278-284` |
| 11 | Navigation | Auto Scroll into View | Selected element automatically scrolls into view within the scrollable container. | `selectedIndex` state change | `itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })` | Polyfilled safely if `scrollIntoView` undefined | `CommandPalette.jsx:314-321` |
| 12 | Execution | Action Execution | Pressing `Enter` or clicking an item executes its `action()` and closes the palette. | `Enter` key or click event | Triggers `action()` and `onClose()` | Guarded against out-of-bounds `selectedIndex` | `CommandPalette.jsx:284-289, 428-431` |
| 13 | Shortcuts | Direct Jump Shortcuts | `⌘1`-`⌘5` immediately triggers page navigation from within the open palette. | `metaKey/ctrlKey + 1..5` | Navigates to corresponding page and closes modal | Ignores indices with no matching page | `CommandPalette.jsx:293-301` |
| 14 | Shortcuts | Direct Theme Toggle | `⇧⌘T` executes theme toggle directly while palette is open. | `metaKey + shiftKey + T` | Toggles theme via `useTheme()` | No modal close required | `CommandPalette.jsx:302-306` |
| 15 | Empty State | Centered Glass Empty State | Glass container with glowing Lucide Search icon, ping dot, informative guidance, and Reset button. | `filtered.length === 0` | Rendered empty state illustration + Reset button | Resets query to restore full list | `CommandPalette.jsx:371-399` |
| 16 | Footer | Keyboard Hints Bar | Bottom bar showing shortcuts (`↑↓ Navigate`, `↵ Select`, `Esc Close`) and status indicator. | Static metadata | Rendered footer `<kbd>` badges and `Spotlight Ready` pill | N/A | `CommandPalette.jsx:491-516` |

---

## 3. Edge Cases & Observed Behavior

| # | Feature | Input / Condition | Observed Behavior |
|---|---------|-------------------|-------------------|
| 1 | Keyboard Navigation | Rapid ArrowDown at bottom of list | Wraps around to index `0` (`(prev + 1) % filtered.length`). |
| 2 | Keyboard Navigation | Rapid ArrowUp at top of list (index `0`) | Wraps around to index `filtered.length - 1` (`(prev - 1 + filtered.length) % filtered.length`). |
| 3 | Search Filtering | Search query with leading/trailing whitespace (e.g. `"  claude  "`) | Trimmed before filtering; matches `anthropic/claude-3-5-sonnet`. |
| 4 | Search Filtering | Search query matching only keyword (e.g. `"jwt"` or `"cost leader"`) | Matches `Inspect Session Auth Token` and `deepseek/deepseek-chat` respectively. |
| 5 | Search Filtering | Query matching nothing (e.g. `"xyz-no-match-query"`) | Renders centered glass empty state with query quote and "Clear search" button. |
| 6 | Direct Shortcuts | `⌘9` or number exceeding Pages count | Safely ignored (no-op, does not crash). |
| 7 | Modal Focus | Palette opens | `setTimeout` focuses `inputRef.current` after 50ms, selection reset to `0`. |
| 8 | Escape Key | `Escape` pressed with text in input | Closes entire modal immediately via `onClose()`. |
| 9 | Backdrop Click | User clicks frosted glass backdrop | Calls `onClose()`, dismissal without execution. |
| 10 | Mouse + Keyboard Hybrid | User moves mouse over item, then uses `ArrowDown` | `onMouseEnter` sets `selectedIndex` to hovered item, subsequent `ArrowDown` continues from that item. |

---

## 4. Detailed Specification Analysis per Requirement

### A. Categorized Results ("Pages", "Actions", "Models") & Glass Section Headers
- **Data Structure**:
  ```js
  const categoryOrder = ['Pages', 'Models', 'Actions', 'Preferences'];
  ```
- **Section Header Specification**:
  - Class name: `text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-3 py-1.5`
  - Elements: Left category title with indicator dot, right item count badge (`${count} items`).
  - Container: Frosted glass background `bg-black/5 dark:bg-white/5 backdrop-blur-md rounded-lg mb-1`.

### B. Row Enhancements
- **Leading Squircle Icons**:
  - `Pages`: `<Activity size={18}>` (Reliability), `<TrendingUp size={18}>` (Finance), `<SlidersHorizontal size={18}>` (Auto-Pricing), `<CircleDollarSign size={18}>` (Pricing), `<Settings size={18}>` (Settings).
  - `Models`: `<Sparkles size={18}>` (Claude 3.5 Sonnet, Gemini Flash), `<Cpu size={18}>` (GPT-4o), `<Layers size={18}>` (Llama 3.3), `<Zap size={18}>` (DeepSeek Chat).
  - `Actions`: `<ShieldCheck size={18}>` (Arm Daemon), `<ShieldAlert size={18}>` (Disarm Daemon), `<RefreshCw size={18}>` (Refresh Telemetry), `<Download size={18}>` (Export Finance), `<Key size={18}>` (Auth Token).
  - `Preferences`: `<Sun size={18}>` / `<Moon size={18}>` (Theme toggle).
- **Row Content**:
  - Primary Label: `text-xs sm:text-sm font-semibold truncate text-zinc-900 dark:text-zinc-100`
  - Subtitle: `text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate`
- **Right Shortcut Badges**:
  - Badge container: `<kbd className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-md border ...">`
  - Badges: `⌘1`-`⌘5` (Pages), `↵` (Enter for actions/models), `⇧⌘T` (Theme toggle).
  - Active selection indicator: `<CornerDownLeft size={13} className="text-sky-600 dark:text-sky-400 animate-pulse ml-0.5" />`

### C. Staggered Entrance Animation (Framer Motion)
- **Target Specification**:
  ```jsx
  <motion.button
    key={item.id}
    ref={(el) => (itemRefs.current[item.globalIndex] = el)}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{
      delay: item.globalIndex * 0.03,
      duration: 0.2,
    }}
    ...
  />
  ```
- **Modal Window Spring Physics**:
  ```jsx
  <motion.div
    initial={{ opacity: 0, scale: 0.96, y: -16 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ type: 'spring', damping: 26, stiffness: 320 }}
    className="relative w-full max-w-2xl rounded-3xl border border-white/20 dark:border-white/10 ios-sheet p-2 shadow-2xl overflow-hidden font-sans z-10"
  >
  ```

### D. Keyboard Navigation
- Continuous 1D index mapping with `globalIndex` mapped across all category arrays.
- `ArrowDown` increments index with modulo `filtered.length`.
- `ArrowUp` decrements index with wrap-around `(prev - 1 + filtered.length) % filtered.length`.
- `Enter` triggers `filtered[selectedIndex].action()` and `onClose()`.
- Synchronized `itemRefs` scroll current item into view with `{ block: 'nearest', behavior: 'smooth' }`.

### E. Empty State
- **Illustration**: Glowing Squircle container `w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500/10 to-indigo-500/20 border border-sky-500/30 backdrop-blur-md` with `<Search size={26} className="text-sky-500/80" />` and pulsing beacon indicator.
- **Message**: `No matching results for “{query}”` (or `No results for "{query}"`).
- **Helper Description**: Contextual hints for navigation, models, and action searches.
- **Clear Action**: Action button `Clear search` that invokes `setQuery('')`.

---

## 5. Test Suite Verification & Impact Analysis

### Current Test Coverage (`CommandPalette.test.jsx`)
13 comprehensive tests covering:
1. `renders nothing when isOpen is false`
2. `renders search input, glass category headers, and initial command items when open`
3. `filters results across title, subtitle, and keywords`
4. `supports clearing search query via X button`
5. `navigates with ArrowDown and ArrowUp with wrap-around`
6. `updates selection on mouse hover`
7. `executes item action and closes palette on Enter key press`
8. `executes item action and closes palette on button click`
9. `closes palette when Escape key is pressed`
10. `supports direct ⌘1-⌘5 shortcuts to navigate and close`
11. `supports theme toggle shortcut ⇧⌘T`
12. `renders muted glass empty state illustration and supports Clear search button`
13. `calls scrollIntoView when selection changes`

### Associated Tests
- `Layout.test.jsx`: Verifies `Ctrl+K` and `Cmd+K` toggles `CommandPalette` and topbar search button opens it.

### Build Verification
- `npm run build`: Verified successful (0 compilation errors, Vite transformed 2227 modules into clean production assets in `dist/`).

---

## 6. Recommendations & Integration Checklist

1. **Header Typography Alignment**: Ensure section headers use `text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-3 py-1.5` as standard.
2. **Animation Consistency**: Maintain Framer Motion transition `initial={{ opacity: 0, y: 6 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ delay: index * 0.03, duration: 0.2 }}`.
3. **Accessibility**: Retain `role="dialog"`, `aria-modal="true"`, `aria-label="Spotlight Search"`, and `aria-label="Clear search query"`.
4. **Scroll Safety**: Retain the `Element.prototype.scrollIntoView` guard in `Layout.jsx` for JSDOM test environment safety.
