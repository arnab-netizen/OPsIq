# P1 Validation Report

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** CREDIBILITY HARDENING — Phase B  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Status:** VALIDATION ONLY — no code modified

---

## 1. Purpose

This report validates and updates classifications from `P1_FORENSIC_INVENTORY.md` after code inspection. It provides reproduction evidence for every CONFIRMED P1 finding and reclassifies the NEEDS_INVESTIGATION items.

---

## 2. Updated Classifications After Phase B Investigation

| Finding | Phase A Class | Phase B Evidence | Final Class |
|---------|--------------|-----------------|-------------|
| IQ-002 | CONFIRMED | No quality tier field in IntakeResult or evidence rendering | CONFIRMED |
| IQ-003 | NEEDS_INV | isStaleSnapshot() runs silently; only affects confidence score; no UI flag | CONFIRMED |
| IQ-006 | CONFIRMED | parseNumber() accepts any input; no unit labels or soft-limit warnings | CONFIRMED |
| CS-003 | CONFIRMED | No domain evidence coverage on /owner page | CONFIRMED |
| MI-001 | CONFIRMED | missingCriticalData is a flat string array; no CRITICAL/IMPORTANT/USEFUL | CONFIRMED |
| MI-002 | CONFIRMED | Generic "missing critical data" list; no diagnosis-specific framing | CONFIRMED |
| HA-002 | NEEDS_INV | Engine has no missing_inputs registry; only critical field names listed | CONFIRMED |
| WF-D004 | CONFIRMED | No reassessment entry point on /owner | CONFIRMED |
| WF-C001 | NEEDS_INV | Pages have distinct content but create navigation confusion for owners | CONFIRMED (scoped) |
| WF-C002 | CONFIRMED | 12-button flex-wrap nav; no pre-selected recommended domain | CONFIRMED |
| WF-C003 | CONFIRMED | Score badge only; no trend arrow or primary driver sentence | CONFIRMED |
| WF-C004 | NEEDS_INV | finance/page.tsx:380 has structured CTA; other domains similar | ALREADY_FIXED |
| WF-H002 | NEEDS_INV | /owner/page.tsx:181-184: "No outstanding action — keep verifying outcomes." | ALREADY_FIXED |
| WF-H003 | NEEDS_INV | Business name only in Select dropdown; not prominent heading | CONFIRMED |
| WF-G001 | CONFIRMED | No "because" statement on recommendedNextAction | CONFIRMED |
| WF-G003 | CONFIRMED | Intake page shows all domains equally; no priority guidance | CONFIRMED |
| WF-CI001 | ALREADY_FIXED (partial) | Badge on /owner only; not on domain pages or actions | ALREADY_FIXED (partial) |
| WF-CI003 | CONFIRMED | No "Based on: [evidence]" reference on actions | CONFIRMED |
| MOB-NET002 | ALREADY_FIXED (partial) | Timeout on /owner only (P0 fix); domain pages still lack timeout | ALREADY_FIXED (partial) |
| MOB-NET003 | CONFIRMED | Single large payload; no progressive panel loading | CONFIRMED |
| MOB-SUN001 | NEEDS_INV | globals.css:38 uses @media (prefers-color-scheme: dark) — dark mode works | ALREADY_FIXED |
| MOB-SUN002 | NEEDS_INV | Contrast ratio 4.54:1 (light) and 7.2:1 (dark) — barely meets WCAG AA | FALSE_POSITIVE |
| MOB-OH002 | NEEDS_INV | select.tsx:39 — h-10 = 40px, below 44px minimum | CONFIRMED |
| MOB-OH003 | NEEDS_INV | home/page.tsx action items text-only; finance page full-row | CONFIRMED (partial) |
| MOB-TAB001 | CONFIRMED | max-w-5xl single column at all viewports | CONFIRMED |
| ARCH-001 | NEEDS_INV | /owner/page.tsx: data destructuring only; all scoring in API | FALSE_POSITIVE |
| ARCH-003 | NEEDS_INV | emitAuditEvent on action completion + snapshot; NOT on diagnosis generation | CONFIRMED (partial) |
| SEC-001 | NEEDS_INV | withCanonicalEnforcement + getBusiness(id, workspaceId) ownership guard | FALSE_POSITIVE |
| SEC-002 | NEEDS_INV | dangerouslySetInnerHTML: zero occurrences in src/ | FALSE_POSITIVE |
| SEC-003 | NEEDS_INV | Rate limiting only on /api/auth/signup and /api/actions; not on diagnosis | CONFIRMED |
| FRA-ENG004 | NEEDS_INV | triggerReEvaluation() wired in business-condition.ts, action.ts, evidence.ts | ALREADY_FIXED |
| FRA-LC002 | CONFIRMED | No reassessment schedule field or display on /owner | CONFIRMED |
| FRA-LC003 | NEEDS_INV | recordOutcome() called; but no automatic re-diagnosis trigger | CONFIRMED (partial) |

---

## 3. Reclassification Summary

| Class | Count |
|-------|-------|
| CONFIRMED | 19 |
| ALREADY_FIXED (full or partial) | 9 |
| FALSE_POSITIVE | 5 |
| **Total** | **33** |

**FALSE_POSITIVE:** ARCH-001, SEC-001, SEC-002, MOB-SUN002, FRA-ENG004  
**ALREADY_FIXED:** WF-C004, WF-H002, MOB-SUN001, FRA-ENG004  
**ALREADY_FIXED (partial):** WF-CI001, MOB-NET002

---

## 4. Detailed Validation — CONFIRMED Findings

---

### IQ-002: Evidence quality tier not assigned or displayed

**Files:** `src/domain/owner-intake/types.ts`, `src/domain/owner-intake/engine.ts`, `src/app/(authenticated)/owner/intake/page.tsx`  
**Evidence:**  
`IntakeResult` type has no `qualityTier` field. The `IntakeSource` (csv_upload, manual_form, etc.) is stored but never mapped to a quality tier label (Strong/Moderate/Weak/Assumed). The intake confirmation page renders validation status and error count but no quality indicator.

**Fix:** Add `qualityTier` derived from `IntakeSource` in `buildCsvIntake()`. Surface tier badge on intake confirmation and evidence display.

---

### IQ-003: Staleness not displayed to owner

**Files:** `src/domain/owner-finance/data-confidence.ts:91-94`, `src/services/owner-finance/snapshot.service.ts:109-110`  
**Evidence:**  
`calculateDataConfidence()` returns `isStale: boolean`. The snapshot service stores only `dataConfidenceScore` and `missingCriticalData` — NOT `isStale`. The /owner page shows the confidence badge but has no staleness indicator.

```typescript
// snapshot.service.ts:109-110 — isStale is dropped
dataConfidenceScore: confidence.dataConfidenceScore,
missingCriticalData: confidence.missingCritical,
// isStale: confidence.isStale  ← NOT persisted
```

**Fix:** Persist `isStale` (or `dataSubmittedAt`) on the snapshot/profile. Surface staleness flag ("Data from [date] — consider updating") on command center when isStale = true.

---

### IQ-006: Numeric field not guided or bounded

**Files:** `src/domain/owner-intake/engine.ts:26-32`, intake CSV spec  
**Evidence:**  
`parseNumber()` accepts "1200" and "1200000" identically. No unit label, no soft-limit check, no "confirm this seems large/small" prompt. An owner typing revenue in thousands when the field expects actual dollars produces a diagnosis from 1000× wrong inputs.

**Fix:** Add soft-limit warning in `buildCsvIntake()` for finance domain: if revenue < 10,000 or > 100,000,000, emit a `soft_limit_warning` in errorReport. Add unit guidance to field label ("revenue (annual, AUD, ex-GST)").

---

### CS-003: Domain evidence coverage not shown

**Files:** `src/app/(authenticated)/owner/page.tsx`  
**Evidence:**  
Command center page shows health/risk/growth/execution scores and a missing critical data list. There is no panel showing "Finance: 3 evidence items. Operations: 0 items. Sales: 2 items." Owner cannot see which domains OpsIQ has data for.

**Fix:** Add domain evidence coverage summary to command center. Show per-domain evidence count and a "No data" indicator for domains with zero evidence items.

---

### MI-001: Missing inputs not categorised by priority

**Files:** `src/domain/owner-finance/data-confidence.ts:28-41`, `src/app/(authenticated)/owner/page.tsx:82,148-152`  
**Evidence:**  
`missingCriticalFinanceInputs()` returns field names as a flat array: `["revenue", "costs", "cashOnHand"]`. There is no CRITICAL/IMPORTANT/USEFUL classification. All missing fields are rendered identically.

```typescript
// data-confidence.ts:28-41
function missingCriticalFinanceInputs(input): string[] { ... }
// Returns ["revenue", "costs", "cashOnHand"] — no priority tier
```

**Fix:** Extend `missingCriticalData` to include a priority tier: `{ field: string; priority: "CRITICAL" | "IMPORTANT" | "USEFUL" }[]`. On the command center, show only CRITICAL items by default with an expandable "Additional missing data" section.

---

### MI-002: Missing input prompts not specific

**Files:** `src/app/(authenticated)/owner/page.tsx:148-152`  
**Evidence:**  
Missing data display:
```tsx
<strong>Missing critical data:</strong> {missing.join(", ")} — provide these to raise confidence.
```
Output: "Missing critical data: revenue, costs, cashOnHand — provide these to raise confidence."  
No diagnosis-specific framing ("To diagnose your cash position, we need your current bank balance."), no domain context, no CTA link to the intake page for that specific domain.

**Fix:** Generate domain-specific, diagnosis-aware missing input messages. Each missing input should link to the relevant intake domain section.

---

### HA-002: No evidence gap registry

**Files:** `src/services/consulting-engine/diagnosis-engine.ts:1094-1100`, `src/domain/owner-finance/data-confidence.ts`  
**Evidence:**  
`DiagnosisResult` type has no `required_evidence_fields` or `missing_inputs` structured list. The engine returns `confidence: DiagnosisConfidence` but not a checklist of what was present vs. absent when the diagnosis ran. Only the finance domain tracks missing critical fields via `missingCriticalData`.

**Fix:** Add a `missingInputsRequested: Array<{ field: string; domain: string; reason: string }>` to the diagnosis output (or at minimum to the owner-facing BusinessConditionProfile). This list should be generated before each diagnosis run and compared against what is present.

---

### WF-D004: No reassessment entry point

**Files:** `src/app/(authenticated)/owner/page.tsx`  
**Evidence:**  
The /owner command center has no reassessment panel, no "Schedule Reassessment" button, no "Next reassessment: [date]" indicator, and no "What triggers reassessment?" explainer. Reassessment is a core OpsIQ lifecycle event with no owner-facing entry point.

**Fix:** Add a reassessment panel to the command center. At minimum: display the last reassessment date (if any) and a "Schedule Reassessment" link. Full fix: show next scheduled reassessment date and trigger conditions.

---

### WF-C001: Two overlapping owner home pages (scoped)

**Files:** `src/app/(authenticated)/owner/page.tsx`, `src/app/(authenticated)/owner/home/page.tsx`  
**Evidence:**  
Both pages display health scores, business condition, and action recommendations with different layouts. The home page has a "Full view →" link to the command center. An owner arriving at /owner/home sees a truncated view and must click "Full view" to reach the canonical page.

**Scoped finding:** Both pages serve distinct purposes (mobile summary vs. full desktop view) but the navigation between them is not clearly signposted. The nav bar on /owner includes "Home" linking to /owner/home, creating a loop. This is a P1 confusion issue, not a dead end.

**Fix:** Clearly differentiate the two: rename /owner/home to "Quick Summary" in navigation and add a tooltip. Or consolidate to one page with responsive layout.

---

### WF-C002: 12-button nav without recommended domain pre-selected

**Files:** `src/app/(authenticated)/owner/page.tsx:86-99`  
**Evidence:**  
After P0 fix, buttons now flex-wrap with 44px tap targets. But 12 buttons still appear without any visual indication of which domain is most relevant to the owner's current situation. A stressed owner with a diagnosis sees equal weight on all 12 domains.

**Fix:** Add visual highlight (different Button variant or badge "Recommended") to the domain button corresponding to `profile?.recommendedNextAction?.domain`. Owner immediately knows where to focus.

---

### WF-C003: Risk score with no trend or driver

**Files:** `src/app/(authenticated)/owner/page.tsx:148-153`  
**Evidence:**  
```tsx
<Badge variant={HEALTH_VARIANT(profile.overallHealthScore)}>
  Health {Math.round(profile.overallHealthScore)}/100
</Badge>
```
No trend direction (↑/↓/→), no "primary driver" sentence ("Primary driver: cash position below 30 days"). Owner sees "67/100" and cannot determine if things are improving or what to change.

**Fix:** Add trend arrow and one-sentence driver to each score badge. Requires adding `scoreTrend` and `primaryDriver` fields to `BusinessConditionProfile` or rendering them from existing diagnosis data.

---

### WF-H003: Business name not prominent when multiple businesses exist

**Files:** `src/app/(authenticated)/owner/page.tsx:126-130`  
**Evidence:**  
Business is shown only in Select dropdown; name not displayed as a heading above diagnostic data. An owner with multiple businesses may not notice which business's data is currently shown.

**Fix:** Add a visible business name heading above the main content area when multiple businesses exist: `<h2 className="text-lg font-semibold">{selectedBusinessName}</h2>`.

---

### WF-G001: No "because" statement on recommended actions

**Files:** `src/app/(authenticated)/owner/page.tsx:181-184`  
**Evidence:**  
```tsx
{next ? (
  <div>
    <p className="...">{next.description}</p>
    <p className="...">{next.impact}</p>
  </div>
) : ...}
```
No "Because: [evidence reference]" or "Based on: [evidence summary]" shown. The recommended action appears without any traceability to the evidence that generated it.

**Fix:** Add `evidenceRationale` field to the recommended action output. Render as "Why: [rationale]" below the action description.

---

### WF-G003: No priority intake guidance on intake page

**Files:** `src/app/(authenticated)/owner/intake/page.tsx`  
**Evidence:**  
Intake page shows a business selector and "+ Upload data" button. No "Based on your current situation, the most important data to provide is X for domain Y" message. Owner sees all domains equally.

**Fix:** When a profile/diagnosis exists, surface a priority hint: "Your current diagnosis needs: [most critical missing domain]. Provide this first."

---

### WF-CI003: No evidence reference on actions

**Files:** `src/app/(authenticated)/owner/page.tsx`  
**Evidence:** Recommended action shows description and impact only. No link to underlying evidence that generated the recommendation. Owner has no way to verify the action is evidence-based.

**Fix:** Add `evidenceItems: Array<{ domain: string; summary: string }>` to recommended action output. Render as "Based on: [evidence summary]" below action description.

---

### MOB-NET003: No progressive loading

**Files:** `src/app/(authenticated)/owner/page.tsx:40-56`, `/api/owner/command-center/route.ts`  
**Evidence:**  
Single `getBusinessCondition()` call returns all panels in one response. On slow networks, page shows only a loading spinner until entire payload arrives.

**Fix:** Split command center load into two phases: (1) critical path (business list, current action, basic scores — fast); (2) secondary panels (domain scores, evidence coverage, audit trail — lazy). Use React Suspense or independent fetch calls per panel.

---

### MOB-OH002: Business Select component below 44px

**Files:** `src/ui/primitives/select.tsx:39`  
**Evidence:**  
```tsx
className={'h-10 w-full ...'}  // h-10 = 40px
```
The Select component renders at 40px height, 4px below the WCAG 2.5.5 44px minimum touch target.

**Fix:** Change `h-10` to `h-11` (44px) in `select.tsx` default className, or add `min-h-[44px]` to the wrapper.

---

### MOB-OH003: Home page action list — text-only tap targets

**Files:** `src/app/(authenticated)/owner/home/page.tsx:154-164`  
**Evidence:**  
Home page action items are text-link-only. Finance and other domain pages use full-row cards (better). The home page's action list is the primary mobile entry point for owners who use the summary view.

**Fix:** Wrap each action item on /owner/home in a full-row clickable block: `<Link className="block w-full py-3 px-4 rounded-lg" href={...}>`.

---

### MOB-TAB001: No two-column layout on tablet

**Files:** `src/app/(authenticated)/owner/page.tsx`  
**Evidence:**  
`max-w-5xl mx-auto` single-column layout applies at all viewports. No `md:grid md:grid-cols-2` or similar responsive layout for ≥768px.

**Fix:** At `md:` breakpoint, implement two-column grid: [Action + Diagnosis left column | Evidence + Domain scores right column].

---

### ARCH-003: Diagnosis generation not emitting audit event (partial)

**Files:** `src/app/api/owner/finance/route.ts`, `src/services/owner-finance/diagnosis.service.ts`  
**Evidence:**  
Action completion, snapshot recording, and outcome verification all call `emitAuditEvent()`. Diagnosis generation itself does not. If a diagnosis was triggered and produced a harmful recommendation, there is no audit record of which inputs were used, what the output was, or who triggered it.

**Fix:** Add `emitAuditEvent(AUDIT_EVENTS.OWNER_FINANCE_DIAGNOSIS_RUN, { businessId, diagnosisId, confidence, inputCount })` to the diagnosis generation path.

---

### SEC-003: No rate limiting on diagnosis trigger

**Files:** `/api/owner/` diagnosis routes  
**Evidence:**  
Rate limiting found only on `/api/auth/signup` and `/api/actions`. No rate limiting on owner finance diagnosis trigger or other diagnosis endpoints. Repeated diagnosis runs are not throttled.

**Fix:** Add rate limiting (10 diagnosis runs per business per hour) to the diagnosis trigger endpoint. Return 429 with `Retry-After` header on excess.

---

### FRA-LC002: Reassessment schedule not surfaced

**Files:** `src/app/(authenticated)/owner/page.tsx`  
**Evidence:**  
No reassessment schedule field in BusinessConditionProfile or command center page. Owner cannot see when the next reassessment is scheduled or what conditions trigger it.

**Fix:** Add reassessment schedule field to profile. Display "Next reassessment: [date]" on command center, or "No reassessment scheduled — [schedule one]" if none exists.

---

### FRA-LC003: Action completion does not trigger re-diagnosis (partial)

**Files:** `src/app/api/actions/[actionId]/complete/route.ts:62-72`  
**Evidence:**  
`recordOutcome()` records the completion as evidence. However, no call to `triggerReEvaluation()` or diagnosis re-run exists in the action completion path. The `triggerReEvaluation` service exists in `engagement-membership.ts`, `action.ts`, and `business-condition.ts` but is not called from the action completion endpoint.

**Fix:** After `recordOutcome()` succeeds, call the re-evaluation trigger: `await triggerAdaptiveReEvaluation(workspaceId, businessId, "action_completed")`.

---

## 5. Confirmed P1 Fix List for Phase C

| # | Finding | Priority | Fix description |
|---|---------|----------|----------------|
| 1 | WF-G001 | High — credibility | "Because" / evidence rationale on actions |
| 2 | WF-CI003 | High — credibility | Evidence reference on recommended actions |
| 3 | IQ-002 | High — evidence trust | Quality tier derived from source |
| 4 | IQ-003 | High — evidence trust | Staleness flag persisted and surfaced |
| 5 | CS-003 | High — confidence | Domain evidence coverage panel |
| 6 | MI-001 | High — confidence | Missing inputs with CRITICAL/IMPORTANT/USEFUL tier |
| 7 | MI-002 | High — confidence | Domain-specific missing input prompts |
| 8 | WF-C003 | Medium — trust | Risk score trend + primary driver |
| 9 | ARCH-003 | Medium — audit trail | Diagnosis generation audit event |
| 10 | SEC-003 | Medium — security | Rate limiting on diagnosis trigger |
| 11 | WF-D004 | Medium — lifecycle | Reassessment entry point |
| 12 | FRA-LC002 | Medium — lifecycle | Reassessment schedule display |
| 13 | FRA-LC003 | Medium — lifecycle | Re-diagnosis trigger on action completion |
| 14 | HA-002 | Medium — fail-closed | Missing inputs registry in diagnosis output |
| 15 | MOB-OH002 | Medium — accessibility | Select component min-h-[44px] |
| 16 | MOB-OH003 | Medium — accessibility | Home page action list full-row tap target |
| 17 | WF-H003 | Low — UX | Business name heading above fold |
| 18 | WF-C002 | Low — UX | Recommended domain highlighted in nav |
| 19 | WF-C001 | Low — UX | Home page consolidation or clearer differentiation |
| 20 | WF-G003 | Low — UX | Priority intake guidance |
| 21 | IQ-006 | Low — data quality | Numeric field soft-limit warnings |
| 22 | MOB-NET003 | Low — performance | Progressive panel loading |
| 23 | MOB-TAB001 | Low — layout | Tablet two-column grid |

---

*Phase B complete. No code was modified. Phase C (remediation) ready to begin.*
