# Mobile-First Owner Mode Audit

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase C  
**Status:** AUDIT — findings require resolution before mobile-first readiness is declared  

---

## 1. Purpose

This document audits the OpsIQ Owner Mode for mobile-first usability. The target persona is an SMB owner who checks OpsIQ while:

- On a job site (trades, construction, retail) — one hand, gloves possible, direct sunlight
- On a ship, vessel, or remote location — poor/intermittent network, small screen
- Using a personal phone (375px–430px viewport) — not a desktop
- Using a tablet in landscape or portrait — 768px–1024px

The audit applies a hostile lens: what breaks, what is unreadable, what requires scrolling before the owner can act?

---

## 2. Test Viewports

| Viewport | Width × Height | Represents |
|----------|---------------|-----------|
| Minimum mobile | 375 × 667 | iPhone SE, older Android |
| Standard mobile | 390 × 844 | iPhone 14 |
| Large mobile | 430 × 932 | iPhone 14 Plus |
| Small tablet | 768 × 1024 | iPad mini portrait |
| Large tablet | 1024 × 1366 | iPad Pro portrait |

All findings below reference the 375px (minimum mobile) viewport as the worst case.

---

## 3. One-Hand Usability Audit

### OH-001: Domain navigation buttons — tap target failure

**Component:** `/owner` page navigation bar (Home, Finance, Cashflow, Sales, Operations, Execution, Marketing)

**Finding:** 7 buttons rendered as `<Button>` components side-by-side in a flex row. On 375px, these wrap and compress to approximately 40–45px width each. The height depends on padding in `ui/primitives/button.tsx`. If padding is `py-1` or `py-1.5`, the tap target is below 44px height.

**One-hand test:** With thumb in bottom-center of screen, buttons in top navigation require full hand repositioning or phone shift. Failure.

**Required fix:** 
1. Replace horizontal nav bar with a bottom navigation bar (thumb-zone accessible) or a single large "Go to Domain" button
2. Minimum tap target: 44×44px per WCAG 2.5.5
3. Spacing between buttons: ≥ 8px to prevent mis-taps

---

### OH-002: Business switcher dropdown — too small

**Component:** `/owner` page business `<Select>` component

**Finding:** The `Select` component renders a standard HTML select-like dropdown. Tap target depends on Tailwind sizing. If rendered at `h-9` (36px), it is below the 44px touch target minimum.

**One-hand test:** Small select elements are difficult to open with one thumb, especially with a protective phone case.

**Required fix:** Select component minimum height: 44px. Consider a bottom-sheet picker on mobile for multi-business selection.

---

### OH-003: Action queue items — link tap area

**Component:** `/dashboard/inbox` inbox items

**Finding:** Decision inbox items are rendered as list items with a link. If the tap target is the text only (not the full row), thumb accuracy becomes critical. On a 375px viewport a narrow text link in a dense list is a frequent mis-tap source.

**Required fix:** Full row must be a tap target. Use `block w-full` on the wrapping link.

---

## 4. Shipboard / Poor-Network Usability Audit

### NET-001: No offline capability or graceful degradation

**Finding:** All pages are client-side data-fetching with no service worker, no cache-first strategy, and no offline fallback. On poor network (2G, satellite, intermittent WiFi), the owner sees a blank loading state indefinitely or an error.

**Impact:** An owner on a vessel or remote site cannot access their action queue when they need it most.

**Required fix (minimum):**
1. Loading skeleton must appear immediately (no blank-page flash)
2. Error state must include "Retry" button and timestamp of last successful load
3. Critical data (current diagnosis, P1 action) should be cached in `localStorage` with a staleness indicator

**Required fix (preferred):**
- Service worker with cache-first strategy for owner dashboard data
- Offline banner: "You are offline. Showing data from [timestamp]."

---

### NET-002: No request timeout handling

**Finding:** API calls in `owner/page.tsx` use `fetch` without a timeout. On a slow network, the page hangs indefinitely.

**Required fix:** Wrap all fetch calls with a 10-second timeout. On timeout: display last cached data (if available) or structured error with retry.

---

### NET-003: No progressive loading

**Finding:** The entire command center payload loads as one request. If the payload is large (many businesses, many evidence items), the page is blocked until the full response arrives.

**Required fix:** Panel data should be loaded independently. Critical panels (Command Center, Action Queue, Diagnosis) load first. Secondary panels (Evidence, Audit) load lazily.

---

## 5. Poor-Lighting / Direct-Sunlight Audit

### SUN-001: No dark mode support

**Finding:** The UI uses Tailwind CSS classes with `text-foreground`, `bg-background`, etc. These appear to support a CSS variable–based theming system. However, no dark mode implementation was found in the owner mode pages.

**Impact:** On a job site in direct sunlight, the default light theme may cause glare and readability issues. Dark mode dramatically improves outdoor readability on OLED screens.

**Required fix:** Implement dark mode support via `prefers-color-scheme` media query, using the existing CSS variable system if present.

---

### SUN-002: Contrast — muted text insufficient in sunlight

**Finding:** `text-muted-foreground` (used extensively for subtitles, labels, secondary content) typically renders at a lower contrast ratio than `text-foreground`. On a bright screen outdoors, muted text may fall below the 4.5:1 WCAG AA contrast ratio.

**Required fix:** Audit all `text-muted-foreground` usage in owner mode pages. Upgrade to `text-foreground` for any text that conveys diagnosis, action priority, or confidence information.

---

### SUN-003: Badge text contrast

**Finding:** Badge components with `variant="destructive"` and `variant="warning"` must have sufficient text contrast. Warning badges (yellow/amber background) often fail contrast requirements.

**Required fix:** Verify all badge variants meet 4.5:1 contrast ratio. Use dark text on light badge backgrounds.

---

## 6. Tablet Usability Audit

### TAB-001: Layout does not adapt to tablet viewport

**Finding:** The owner command center uses `max-w-5xl mx-auto` layout. On a 768px tablet, this behaves similarly to mobile (single-column). There is no two-column or grid layout for tablet.

**Impact:** Tablets have screen real estate for showing the Action Queue and Diagnosis Panel side-by-side, but the current layout wastes this space.

**Required fix:** At `md:` breakpoint (≥ 768px), implement a two-column grid: [Action Queue + Diagnosis | Evidence + Confidence].

---

### TAB-002: Navigation not adapted for tablet

**Finding:** The same 7-button navigation bar from mobile appears on tablet without adaptation. On tablet, a sidebar navigation pattern is expected.

**Required fix:** At `md:` breakpoint, render a left sidebar for domain navigation rather than a top button bar.

---

## 7. Critical Information Above-Fold Audit (375px × 667px)

What must be visible without scrolling on minimum mobile (375 × 667px):

| Item | Required Above Fold | Currently Above Fold |
|------|---------------------|---------------------|
| Business name | Yes | Unknown |
| Current intervention mode | Yes | Partially (in loading/data state) |
| P1 action (if exists) | Yes | No (below scroll) |
| Overdue action warning | Yes | No (not implemented) |
| Confidence tier | Yes | No (not implemented) |
| Reload/retry if stale | Yes | No |

**Finding:** At minimum mobile viewport (375px), the most critical information (P1 action, overdue warning, confidence) is not visible without scrolling. An owner with 30 seconds to check their status must scroll multiple times.

**Required fix:** On mobile (< 768px), enforce this above-fold layout priority:
1. Business name + lifecycle stage (1 row)
2. Overdue P1 action callout (if exists) — full-width red card
3. Confidence indicator (if Low or Blocked) — yellow/red strip
4. Current P1 action — verb-first, large font, full-width tap target
5. Diagnosis in one sentence

Everything else collapses below this.

---

## 8. Input Usability on Mobile

### INP-001: Intake form not optimized for mobile keyboards

**Finding:** `/owner/intake` form uses `<Input>` components for numeric data entry (financial figures). These should use `inputMode="numeric"` to trigger the numeric keyboard on mobile.

**Required fix:** All numeric fields must have `inputMode="numeric"` or `type="number"`.

---

### INP-002: Long text input areas not scroll-locked

**Finding:** Long text areas within the intake form (descriptions, notes) may cause the entire page to scroll when the owner tries to scroll within the text area on iOS.

**Required fix:** Use `overscroll-contain` on text area containers.

---

## 9. Audit Summary

| Classification | Count |
|----------------|-------|
| P0 (owner cannot complete task on mobile) | 3 |
| P1 (mobile experience severely degraded) | 7 |
| P2 (polish — mobile experience materially worse) | 5 |

**P0 findings:** NET-001 (offline/poor network), OH-001 (nav tap targets), FOLD-001 (critical info not above fold)

**P1 findings:** NET-002, NET-003, SUN-001, SUN-002, OH-002, OH-003, TAB-001

**P2 findings:** SUN-003, TAB-002, INP-001, INP-002, remaining

---

## 10. Mobile-First Readiness Verdict

**NOT MOBILE-READY.** The current implementation was not designed mobile-first. It is a desktop-first layout that renders on mobile with significant usability gaps.

Required before declaring mobile-first readiness:
1. Resolve P0 findings: offline degradation, tap target minimums, above-fold critical information
2. Resolve P1 findings: progressive loading, dark mode, two-column tablet layout
3. Test on physical devices: iPhone SE (smallest target) and iPad mini (smallest tablet target)

---

*This document is part of the OPTION-A Phase C repository completion work.*
