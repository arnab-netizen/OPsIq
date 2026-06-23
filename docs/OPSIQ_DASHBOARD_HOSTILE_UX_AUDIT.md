# OpsIQ Dashboard Hostile UX Audit

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase A  
**Status:** AUDIT — findings require resolution before dashboard is owner-ready  

---

## 1. Purpose

This document is a hostile audit of the OpsIQ Owner Dashboard UX as currently implemented. "Hostile" means: approach the dashboard as a stressed, distracted SMB owner who has 2 minutes and no patience. Find every point where the UI fails to deliver actionable clarity.

---

## 2. Audit Scope

Files audited:
- `src/app/(authenticated)/owner/page.tsx` — Owner Command Center
- `src/app/dashboard/impact/page.tsx` — Impact Dashboard
- `src/app/dashboard/inbox/inbox-client.tsx` — Decision Inbox
- `src/app/dashboard/decision/[id]/` — Decision detail

---

## 3. Findings — P0 (Owner Cannot Complete Core Task)

### P0-001: No single answer to "What do I do today?"

**Finding:** The owner must navigate between at least three separate pages (`/owner`, `/dashboard/inbox`, `/dashboard/impact`) to understand their situation. No single page answers: What is my condition? What action do I take? What is the outcome?

**Impact:** Owner confusion leads to non-compliance. Non-compliance on P1 actions is the #1 reason SMB interventions fail.

**Required fix:** Consolidate all 8 panels on a single root page (`/owner`) with progressive disclosure (collapse panels below the fold). This is a structural change.

---

### P0-002: No overdue action surfacing

**Finding:** If an owner has a P1 action that is 14 days overdue, the current dashboard does not visually distinguish it from a new pending action. The inbox shows a flat list.

**Impact:** Overdue P1 actions become invisible. The intervention stalls.

**Required fix:** Overdue P1 actions must appear above the fold, in red, before any other content.

---

### P0-003: No data staleness warning

**Finding:** If the owner's diagnosis is 21 days old and no new evidence has been submitted, the dashboard displays the same content as if it were fresh. There is no visual indicator that the displayed information is stale.

**Impact:** Owner may make decisions based on outdated diagnosis. Especially dangerous if business condition has deteriorated.

**Required fix:** Inline stale-data banners per panel with last-updated timestamp and days since update.

---

## 4. Findings — P1 (Owner Confidence Severely Impaired)

### P1-001: No confidence score visible

**Finding:** The current owner page shows diagnosis results but no indication of how confident OpsIQ is in that diagnosis. An owner with a "Low" confidence diagnosis sees the same UI as one with a "High" confidence diagnosis.

**Impact:** Owner may over-trust a low-confidence diagnosis and act on insufficient evidence, or under-trust a high-confidence diagnosis and fail to act.

**Required fix:** Confidence score and tier must be visible on first screen load, adjacent to the diagnosis.

---

### P1-002: Missing input call-to-action is buried

**Finding:** `missingCriticalData` is returned by the API and rendered as a plain list at the bottom of the page. It does not visually indicate that these missing inputs are blocking diagnosis confidence.

**Impact:** Owners skip filling in missing data because it looks optional. Diagnosis confidence remains low.

**Required fix:** Missing critical inputs must be rendered as a `MissingInputCallout` with high visual weight (e.g., yellow warning card above diagnosis panel) if count > 0.

---

### P1-003: Risk score and health score have no context

**Finding:** The current page renders risk score and health score as badge numbers (e.g., "67") with color coding, but no explanation of what those numbers mean or what changed them.

**Impact:** Owner sees "67" and does not know if that is good, bad, up, or down. No trust is built.

**Required fix:** Each score must display: current value, trend direction (up/down/flat), and a 1-sentence explanation of the primary driver.

---

### P1-004: No reassessment date or schedule visible

**Finding:** The current dashboard contains no reference to when the next reassessment is scheduled.

**Impact:** Owner does not know when OpsIQ will re-evaluate their situation. Creates a feeling of abandonment.

**Required fix:** Reassessment panel must show next date, days remaining, and what would trigger an early reassessment.

---

### P1-005: Action queue has no priority tier display

**Finding:** The inbox displays decisions in a flat list. There is no P1/P2/P3 priority distinction. An owner cannot tell which action is most critical.

**Impact:** Owners tackle the easiest or most familiar action rather than the most critical.

**Required fix:** Actions must display P1/P2/P3 tier with P1 visually dominant.

---

## 5. Findings — P2 (Owner Experience Degraded)

### P2-001: Business switcher is not prominent enough

**Finding:** For multi-business owners, the business switcher is a dropdown that requires interaction to see. The current business name is not prominently displayed.

**Required fix:** Active business name must be displayed as a heading, not only inside the dropdown.

---

### P2-002: Navigation bar lists too many destinations

**Finding:** The top of the owner page has 7+ buttons (`Home`, `Finance`, `Cashflow`, `Sales`, `Operations`, `Execution`, `Marketing`). This creates navigation anxiety for a stressed owner.

**Required fix:** Collapse domain navigation into a single "Go to Module" dropdown or sidebar. The top-level CTA should be one action, not seven destinations.

---

### P2-003: Mobile: tap targets on domain buttons too small

**Finding:** The domain navigation buttons are rendered as standard Button components without mobile-specific sizing. On a 375px viewport they may be below the 44px touch target minimum.

**Required fix:** All interactive elements must have a minimum 44×44px touch target on mobile.

---

### P2-004: Error state is generic

**Finding:** When the command center API fails, the error message is "Failed to load" with no guidance on what to do.

**Required fix:** Error state must include: what failed, whether to retry, and a contact path if the problem persists.

---

### P2-005: Loading state has no skeleton

**Finding:** The loading state renders "Loading owner command center…" as plain text. On slow connections this creates a blank-page experience.

**Required fix:** Loading state must render panel skeletons to reduce perceived load time.

---

## 6. Findings — P3 (Polish and Trust)

### P3-001: Diagnosis text uses raw enum codes

**Finding:** In some rendering paths, root cause codes such as `WORKING_CAPITAL_STRESS` may appear in UI text rather than human-readable labels.

**Required fix:** All root cause codes must be mapped to plain-language labels before rendering.

---

### P3-002: No audit trail visible to owner

**Finding:** The owner cannot see a record of what OpsIQ has done: when was the last diagnosis, what changed, what actions were issued.

**Required fix:** Audit panel (collapsed by default) must be present on the dashboard.

---

### P3-003: Outcome panel is a separate page

**Finding:** Outcome data (impact page) is a separate route (`/dashboard/impact`) and not integrated into the owner dashboard. The owner must know to navigate there.

**Required fix:** Outcome summary (KPI delta, completed actions, open actions) must appear as a panel on the root owner page.

---

## 7. Hostile Audit Verdict

| Classification | Count |
|----------------|-------|
| P0 (blocking — owner cannot complete core task) | 3 |
| P1 (severe — owner confidence impaired) | 5 |
| P2 (degraded — experience materially worse) | 5 |
| P3 (polish — trust and clarity) | 3 |

**Verdict:** The dashboard is NOT owner-ready in its current form. P0 and P1 issues must be resolved before any owner uses it in a real-world context.

---

## 8. Required Resolution Steps

1. P0-001: Consolidate all 8 panels on `/owner` root page
2. P0-002: Overdue P1 action surfacing above the fold
3. P0-003: Stale-data banners per panel
4. P1-001: Confidence score and tier on first screen load
5. P1-002: Missing critical input callout as high-weight card
6. P1-003: Risk and health score with trend and driver
7. P1-004: Reassessment panel with next date and early triggers
8. P1-005: P1/P2/P3 priority tier display on action queue
9. P2-001–P2-005: As resources allow after P0/P1

These steps constitute the dashboard implementation backlog for authorized development work.

---

*This document is part of the OPTION-A Phase A repository completion work.*
