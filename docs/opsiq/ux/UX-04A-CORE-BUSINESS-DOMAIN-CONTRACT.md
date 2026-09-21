# UX-04A — Core Business-Domain Detail Contract

Status: READ-ONLY audit. No production code was changed to produce this
document. Every factual claim below is either `VERIFIED` (cited file:line,
read directly from source on the SHA in Section A), `NOT_PRESENT` (checked
for and confirmed absent), or `UNKNOWN` (not verifiable from static
analysis alone). No `UNKNOWN` is ever silently promoted to a fact.

## A. Starting SHA

```
UX04A_START_MAIN_SHA = f823fa938f750cd38ae872bb5574d1764cbd84fe
```

Verified: `git branch --show-current` = `main`; `git rev-parse HEAD` =
`git rev-parse origin/main` = the SHA above; `git status --short` empty.
Merge sequence confirmed present in `git log --oneline --decorate` on
`origin/main`: UX-01 `f0beed5ce0aa37b1b0b03934b798344eaea75706` (#508),
UX-02A `9b18c4e991e9629c65711f6f9db7166b2af2ade7` (#509), UX-02B
`3baa03745d19564393266202c2915963c1807926` (#510), UX-03
`f823fa938f750cd38ae872bb5574d1764cbd84fe` (#511, verified via
`git show --stat` to change exactly the 5 documented UX-03 files).

## B. Exact objective

Define, from current source only, the DOMAIN-DETAIL contract for the three
core Business surfaces (Money, Sales, Operations) so that a later
presentation phase (UX-04B) can make each one immediately understandable
to a non-technical owner — answering "what is happening here, how certain
is OpsIQ, why, and what should I do next" — without inventing any new
diagnosis logic, without deleting any existing capability, and without
competing with Home's canonical overall-business assessment.

## C. Canonical owner-flow position

```
My Business / data
        ↓
Home — overall business assessment (UX-03, complete)
        ↓
Business domain detail — Money / Sales / Operations (THIS PHASE, UX-04A)
        ↓
Tasks / Execution — act (later phase)
        ↓
Evidence & Trust — prove / explain / verify (later phase)
        ↓
specialist / Preview capabilities remain available
```

`OwnerNowView → reconcileOwnerAssessment → CanonicalOwnerAssessment →
composeOwnerAssessment → OwnerAssessmentNarrative → Home presentation` is
unmodified by this phase — no file under `src/domain/owner-guidance/`,
`src/components/owner/OwnerAssessmentSummary.tsx`, or
`src/app/(authenticated)/owner/cockpit/page.tsx` was read for the purpose
of changing it, and none was changed. Each domain page independently runs
its own diagnosis engine over its own snapshot; none of the three reads or
writes `OwnerNowView`, `reconcileOwnerAssessment`, or
`composeOwnerAssessment` (confirmed absent from all three agents' full
reads of the three page files and their direct service dependencies).

## D. Scope — Money / Sales / Operations only

Confirmed directly against `src/ui/shell/sidebar-nav.tsx`:

- Line 220: `title: "Business"`.
- Line 223: `{ label: "Money", href: "/owner/finance", requiresOwner: true }`.
- Line 224: `{ label: "Sales", href: "/owner/sales", requiresOwner: true }`.
- Line 225: `{ label: "Operations", href: "/owner/operations", requiresOwner: true }`.
- Lines 55-59, 209: doc comments state these three are "grouped under one
  disclosure so they read as three views into one operating business."

No fourth item shares this group. Customer records, Goals, Compliance,
Procurement, Vendors, and Diagnosis are documented in the same file
(lines 226-286) as deliberately demoted out of this trio (see Section E).

## E. Explicit exclusions — verified locations

| Item | Verified current location | Nav evidence |
|---|---|---|
| `/owner/execution`, `/owner/tasks` | "Actions" section | sidebar-nav.tsx: `id: "actions"`, items "Tasks" (`/owner/tasks`) and "Execution & SOP" (`/owner/execution`) |
| `/owner/trust` | Top-level "Evidence & Trust" peer, ungrouped | sidebar-nav.tsx line 206: `items: [{ label: "Evidence & Trust", href: "/owner/trust", ... }]`; doc comment lines 56, 197-200 |
| `/owner/data` | "My Business", separate top-level item | sidebar-nav.tsx line 193 |
| `/owner/cockpit` | Canonical Home, UX-03 complete | confirmed unmodified in this phase |
| `/owner/start-here` | Separate top-level item | sidebar-nav.tsx primary-path list |
| Customer records, Goals, Compliance, Procurement, Vendors, Diagnosis | Demoted out of "Business", listed individually in the same section as Money/Sales/Operations but explicitly commented as non-peer | sidebar-nav.tsx lines 116-117 (Customer records demotion), 226-286 |
| Recovery, Strategy, Marketing, Campaigns, Starting up | "More from OpsIQ", `collapsedByDefault: true`, each marked `state: "preview"` | sidebar-nav.tsx lines 350-390 |
| Inventory | No nav entry at all (signal wiring dead, per inline comment) | sidebar-nav.tsx lines 266-270 |
| Consultant/admin surfaces | Gated on `ENGAGEMENT_*`/admin capabilities, no self-serve owner holds them | sidebar-nav.tsx lines 279-286, 314-322 |

No file under any excluded route was modified. Dependencies were read only
where a domain's own service imports from a shared module (e.g.
`src/domain/founder-recovery/action-status.ts`,
`src/domain/founder-recovery/verification.ts`, `src/domain/owner-spine/contracts.ts`)
— reading a shared dependency does not place its owning route in scope.

## F. Money source-of-truth matrix

`DOMAIN: Money` · `ROUTE: /owner/finance` · File:
`src/app/(authenticated)/owner/finance/page.tsx` (738 lines, read in full).

| Field | Status | Evidence |
|---|---|---|
| PURPOSE | VERIFIED | page.tsx:410 — "Diagnose money, find leaks, and act on the single highest-impact financial move — with verification." |
| INPUT/SNAPSHOT SOURCE | VERIFIED | `OwnerFinancialSnapshot` (prisma/schema.prisma:2901-2957); `createFinancialSnapshot()` snapshot.service.ts:97-180 |
| DIAGNOSIS TRIGGER | VERIFIED — manual/button | page.tsx:325-341,460-462; no automatic first-run trigger |
| DIAGNOSIS DATA SOURCE | VERIFIED | `runFinanceDiagnosis()` diagnosis.service.ts:22-247 → `diagnoseFinanceSnapshot()` domain/owner-finance/diagnosis.ts:93-127 |
| CONDITION/STATE | VERIFIED | `SurvivalState = ["SAFE","WATCH","AT_RISK","CRITICAL","INSOLVENT_RISK"]`, types.ts:14-15; `survivalState()` metrics.ts:377-401 — applies stronger risk-condition checks first, then an explicit inline comment (metrics.ts:396) backs a forced `WATCH`-or-worse floor when `dataConfidenceScore < 70` (check at metrics.ts:397); see Section I.0 |
| HEALTH VALUE | VERIFIED | `overallHealthScore`, schema.prisma:2966; `financialHealthScore()` metrics.ts:352-359, capped by `healthScoreCeiling(dataConfidenceScore)` |
| RISK VALUE | VERIFIED | `survivalRiskScore`, schema.prisma:2967; `financialRiskScore()` metrics.ts:301+ |
| OPPORTUNITY VALUE | VERIFIED | `growthOpportunityScore`, schema.prisma:2968; `financialOpportunityScore()` metrics.ts:362+ |
| CONFIDENCE | VERIFIED | `dataConfidenceScore`, tiers HIGH≥85/MEDIUM≥60/LOW≥30/BLOCKED<30, data-confidence.ts:99-106,226-258 |
| MISSING-DATA BEHAVIOUR | VERIFIED | snapshot-level `missingCriticalData` persisted + banner (page.tsx:637-641); diagnosis-level `missingInputsRegistry` computed (diagnosis.ts:23-38,47-60) but **UNUSED by the page** — a real, verified gap between API richness and page display |
| FINDINGS | VERIFIED — exact match | `OwnerFinanceFinding` (schema.prisma:2986-3017) field-identical to `FindingCardData`; rendered via shared `<FindingCard>` (page.tsx:674-676) with the raw Prisma row passed straight through |
| RECOMMENDED ACTION | VERIFIED | `dashboard.recommendedNextAction = latestCycle.actions[0]`, dashboard.service.ts:83-101,122-123 |
| ACTION ORDERING SOURCE | VERIFIED — server-only | `rankOwnerActions()` (owner-spine/contracts.ts) at actions.ts:113-119; deterministic DB `orderBy` tiebreak repeated at dashboard.service.ts:93-100, diagnosis.service.ts:261-268,296-303. Page performs zero sorting. |
| ACTION LIFECYCLE | VERIFIED | Shared `RECOVERY_ACTION_STATUSES`/`canTransition()`, founder-recovery/action-status.ts:9-27; enforced action.service.ts:37-63; completion requires notes+evidence (action.service.ts:50-59); material transitions pass `enforceOwnerActionGates()` |
| VERIFICATION | VERIFIED — with a UI gap | `recordFinanceVerification()` → shared `verifyOutcome()`; page's `verifyAction()` (page.tsx:366-391) never collects `targetValue`/`evidence`/`disputed` even though the schema supports them — target-reached auto-reassessment is unreachable from this page's own UI |
| HISTORY | VERIFIED | `dashboard.cycleHistory`, dashboard.service.ts:30-38,104-109,136-144; rendered page.tsx:723-735 |
| BUSINESS-SWITCH BEHAVIOUR | VERIFIED — real unguarded race, IDENTICAL class to Sales/Operations | Uses `useActiveBusiness()` (page.tsx:9,183) AND `BusinessContextSelector` (presentational only). `load()` (page.tsx:218-240) has **no AbortController/generation-ref/request-id** (grep-confirmed zero matches) and unconditionally calls `setActiveBusinessId(data.selectedBusinessId)` on every resolved response. A slow stale response for business A arriving after a switch to B will silently overwrite B's already-rendered state AND re-anchor the shared `ActiveBusinessContext` back to A — no error, no warning. This `setActiveBusinessId` re-anchoring call is structurally identical across all three pages (re-verified directly for this amendment; see Section I.0 and the revision record after the hostile self-audit). |
| LOADING | VERIFIED | Whole-page skeleton gate, page.tsx:393; separate `busy` flag for in-flight mutations |
| ERROR | VERIFIED — collapses toward empty | All 5 handlers route through `classifyOperatorError()` (never raw); BUT a failed initial `load()` leaves `dashboard` null, and `businesses = dashboard?.businesses ?? []` then renders the SAME "No businesses yet" empty state a genuinely-zero-business account sees, simultaneously with the error banner — the two are not reconciled into one message |
| EMPTY | VERIFIED | Zero-business text (page.tsx:445-448); `<DiagnosisEmptyState>` for no-cycle-yet (page.tsx:557-563) |
| MOBILE | VERIFIED classes / UNKNOWN rendered | `grid-cols-1 sm:grid-cols-2` present on snapshot-form grids (page.tsx:475,496,524,536); actual rendered behavior not visually verified |
| OWNER-LANGUAGE LEAKS | NOT_PRESENT (with a fallback trapdoor) | `SURVIVAL_LABEL`/`ACTION_STATUS_LABEL`/`VERIFY_LABEL` fully cover current enum values; each has a raw-value `??` fallback that would leak if a new unmapped value is ever introduced without a page update |
| ACCESSIBILITY ISSUES | VERIFIED | No `required`/optional marking on 27 of 29 snapshot fields; zero per-field `error` props anywhere (global banner only); `window.prompt()` used for completion notes/evidence and all 3 verification values |

Additional Money-specific findings:
- **Capability gap (VERIFIED):** `POST /api/owner/finance/snapshots/{id}/amend` exists server-side (append-only, row-locked amendment preserving the original as superseded, snapshot.service.ts:223-389) but the page has **no UI to trigger it at all**.
- **Zero-findings copy (VERIFIED):** "No findings generated — this may indicate missing input data rather than a healthy business. Check data confidence above." (page.tsx:672) — static regardless of actual confidence tier. Whether `findings.length === 0` is reachable at HIGH confidence is UNKNOWN (risk-rules.ts/opportunity-rules.ts not read line-by-line).
- **No independent re-ranking in React:** VERIFIED absent.

## G. Sales source-of-truth matrix

`DOMAIN: Sales` · `ROUTE: /owner/sales` · File:
`src/app/(authenticated)/owner/sales/page.tsx` (520 lines, read in full).

| Field | Status | Evidence |
|---|---|---|
| PURPOSE | VERIFIED | page.tsx:273 — "Where sales leak, who is churning, what to push next — with the single highest-impact sales move and verification." |
| INPUT/SNAPSHOT SOURCE | VERIFIED | `OwnerSalesSnapshot`; `createSalesSnapshot`/`listSalesSnapshots`/`getSalesSnapshot`, snapshot.service.ts:76-158 |
| DIAGNOSIS TRIGGER | VERIFIED — manual/button, period-snapshot model (NOT deal/pipeline CRM) | page.tsx:195-210,319-321. A separate, wholly unrelated CRM/deal-pipeline engine exists (`src/services/growth/sales-pipeline-engine.ts`) but is never referenced by this page (grep-confirmed) |
| DIAGNOSIS DATA SOURCE | VERIFIED | `runSalesDiagnosis()` diagnosis.service.ts:25-139 → `diagnoseSalesSnapshot()` domain/owner-sales/diagnosis.ts:46-79 |
| CONDITION/STATE | VERIFIED | `SalesState = ["STRONG","STEADY","SOFT","WEAK","CRITICAL"]`, types.ts:15-16; `salesState()` metrics.ts:256-282 — applies stronger risk-condition checks first, then an explicit inline comment (metrics.ts:265) backs a forced `SOFT`-or-worse floor when `dataConfidenceScore < 50` (check at metrics.ts:266); see Section I.0 |
| HEALTH VALUE | VERIFIED | `healthScore`/`salesHealthScore`, types.ts:85; metrics.ts:226-233 — takes no confidence parameter (unlike Money's `healthScoreCeiling`-capped score; see Section I.0) |
| RISK VALUE | VERIFIED | `riskScore`/`salesRiskScore`, types.ts:86; metrics.ts:210-224 |
| OPPORTUNITY VALUE | VERIFIED | `opportunityScore`/`salesOpportunityScore`, types.ts:87; metrics.ts:235-252 |
| CONFIDENCE | VERIFIED | `dataConfidenceScore`, data-confidence.ts:70-89 |
| MISSING-DATA BEHAVIOUR | VERIFIED | `missingCriticalData` persisted + banner (page.tsx:416-420); dedicated findings `SALES_MISSING_CRITICAL_DATA` (risk-rules.ts:99-121) and `SALES_OPP_DATA_QUALITY` (opportunity-rules.ts:170-194) fire whenever any data is incomplete — practical effect: zero findings essentially cannot occur while data is missing |
| FINDINGS | VERIFIED — shape matches, rendering differs | Same `OwnerFinding` type as Money/Operations, field-for-field equal to `FindingCardData` — but Sales does **NOT** import or render `FindingCard`/`DiagnosisEmptyState` anywhere (grep-confirmed zero matches); renders via bespoke inline JSX (page.tsx:433-459) with equivalent content (title/badges/summary/metric-vs-threshold/evidence/verify-via) |
| RECOMMENDED ACTION | VERIFIED | `recommendedNextAction = latestCycle.actions[0]`, dashboard.service.ts:126-127; actions.ts:95 |
| ACTION ORDERING SOURCE | VERIFIED — server-only, identical pattern to Money | `rankOwnerActions()` actions.ts:84-86; DB `orderBy` tiebreak dashboard.service.ts:97-104, diagnosis.service.ts:153-160,188-195 |
| ACTION LIFECYCLE | VERIFIED — same shared status machine | founder-recovery/action-status.ts, reused per action.service.ts:5-8,13-18. Page exposes only 4 of 6 legal transitions as buttons (no cancel, no un-block) |
| VERIFICATION | VERIFIED — same UI gap as Money | Page's `verifyAction()` (page.tsx:234-258) never collects `targetValue`; `reachedTarget` is hard-coded false when null (verification.ts:66-71) — the auto-reassess-on-target-reached branch is unreachable from this page's own UI (though `verified_improved` still resolves correctly via the baseline-comparison branch) |
| HISTORY | VERIFIED | `cycleHistory`, dashboard.service.ts:30-38,108-113,140-148; rendered page.tsx:504-516 |
| BUSINESS-SWITCH BEHAVIOUR | VERIFIED — real unguarded race, IDENTICAL class to Money/Operations, including the shared-context re-anchoring | Uses `useActiveBusiness()` (page.tsx:7,97) with a documented, passing regression test for the IN-ORDER case (`business-context-sync-sales-trust-execution.test.tsx:76-124`); that test uses a synchronous-resolving fetch mock and cannot prove out-of-order behavior. **No generation-ref/AbortController exists** (page.tsx has no `useRef` at all, grep-confirmed) — an out-of-order slow response is NOT covered by the existing test, WILL overwrite current state, and — re-verified directly for this amendment — also re-calls `setActiveBusinessId(data.selectedBusinessId)`, identically to Money and Operations |
| LOADING | VERIFIED | Two gates: `contextLoading` no-op, then page-local `loading` full-page skeleton (page.tsx:107,121-123,260) |
| ERROR | VERIFIED — does NOT collapse into empty (better than Money/Operations) | Distinct red banner (page.tsx:278-282); catch blocks never clear `dashboard`, so stale-but-displayed data can coexist with the error banner rather than falling back to the zero-business empty state — but none of these catch blocks route through `classifyOperatorError()` (no governance import in this file, grep-confirmed); the banner can therefore render a raw exception message verbatim (see Section J item 7) |
| EMPTY | VERIFIED — three distinct states | Zero businesses (page.tsx:304-307); snapshot-exists-no-diagnosis vs no-snapshot-at-all (page.tsx:357-359); zero-findings (page.tsx:435) |
| MOBILE | VERIFIED classes / UNKNOWN rendered | Three fixed `grid-cols-N` grids with **no** responsive breakpoint modifier at all (page.tsx:287,329,343) — a real, verified regression relative to Money's `sm:grid-cols-2` pattern |
| OWNER-LANGUAGE LEAKS | VERIFIED — one real gap | `ACTION_STATUS_LABEL` (page.tsx:43-49) has no `"cancelled"` entry; falls through to the raw literal string if ever reached (not reachable via this page's own buttons) |
| ACCESSIBILITY ISSUES | VERIFIED | `window.prompt()` for completion notes/evidence and 3 verification values, with no client-side numeric validation before submit (a malformed number silently becomes `NaN`, rejected only server-side); snapshot fields otherwise have visible `<Input label=...>` |

Additional Sales-specific findings:
- **Zero-findings copy (VERIFIED, no hedge):** "No sales issues detected." (page.tsx:435) — unlike Money's and Operations' equivalent copy, this string has **no** "this may indicate missing data" hedge. This is defensible by construction (the missing-data/data-quality findings intercept low-confidence states before zero-findings is reachable, per the Sales agent's rule-engine trace) but the divergent wording is not explained anywhere in-product — classified `UNJUSTIFIED_INCONSISTENCY` pending confirmation that Money/Operations cannot reach the same guarantee (see Section I).
- **A distinct, real customer-CRUD surface exists** (`src/services/owner-sales/customer.service.ts`, `/api/owner/sales/customers/**`) that this page never calls — out of this page's scope but a real, separate capability that must not be assumed reachable from here.

## H. Operations source-of-truth matrix

`DOMAIN: Operations` · `ROUTE: /owner/operations` · File:
`src/app/(authenticated)/owner/operations/page.tsx` (606 lines, read in full).

| Field | Status | Evidence |
|---|---|---|
| PURPOSE | VERIFIED | page.tsx:317 — "Where throughput stalls, where the bottleneck is, and what to fix next — with the single highest-impact execution move and verification." |
| INPUT/SNAPSHOT SOURCE | VERIFIED | `OwnerOperationsSnapshot` (schema.prisma:3464-3499); snapshot.service.ts:70-133 |
| DIAGNOSIS TRIGGER | VERIFIED — manual/button, plus 2 automatic RE-diagnosis paths | page.tsx:239-254,363-365; auto-reruns on action completion (action.service.ts:93-114) and on target-reaching verification (verification.service.ts:75-97), both best-effort/non-blocking |
| DIAGNOSIS DATA SOURCE | VERIFIED | `runOperationsDiagnosis()` diagnosis.service.ts:25-138 → `diagnoseOperationsSnapshot()` domain/owner-operations/diagnosis.ts:46-81 |
| CONDITION/STATE | VERIFIED | `OperationsState = ["SMOOTH","STEADY","STRAINED","BOTTLENECKED","OVERLOADED"]`, types.ts:16-17; `operationsState()` metrics.ts:215-243 — applies stronger risk-condition checks first, then an explicit inline comment (metrics.ts:226) backs a forced `STRAINED`-or-worse floor when `dataConfidenceScore < 50` (check at metrics.ts:227), i.e. low confidence can never yield "SMOOTH"; see Section I.0 |
| HEALTH VALUE | VERIFIED | `healthScore`, schema.prisma:3508; metrics.ts:181-191 — takes no confidence parameter (same asymmetry as Sales; unlike Money's `healthScoreCeiling`-capped score; see Section I.0) |
| RISK VALUE | VERIFIED | `riskScore`, schema.prisma:3509; metrics.ts:160-179 |
| OPPORTUNITY VALUE | VERIFIED | `opportunityScore`, schema.prisma:3510; metrics.ts:193-211 |
| CONFIDENCE | VERIFIED | `dataConfidenceScore`, data-confidence.ts:70-89; staleness penalty only applies at diagnosis-time, never at snapshot-create time (precise code-verified nuance, data-confidence.ts:85) |
| MISSING-DATA BEHAVIOUR | VERIFIED | Every ratio returns `null` never a fabricated number (metrics.ts:33-104); `missingCriticalData` banner (page.tsx:518-522); `<30` critical-confidence banner (page.tsx:512-516) |
| FINDINGS | VERIFIED — exact match, independently confirmed (not by trusting the code comment) | `OwnerOperationsFinding` (schema.prisma:3528-3558) compared column-by-column against `OwnerFinanceFinding` (schema.prisma:2986-3016) — identical scalar shape; rendered via shared `<FindingCard>` (page.tsx:542-544) |
| RECOMMENDED ACTION | VERIFIED | `recommendedNextAction = actions[0]`, dashboard.service.ts:122-123 |
| ACTION ORDERING SOURCE | VERIFIED — server-only, identical pattern | `rankOwnerActions()` actions.ts:86-88; DB `orderBy` tiebreak dashboard.service.ts:93-100, diagnosis.service.ts:152-159,187-194 |
| ACTION LIFECYCLE | VERIFIED — same shared status machine | founder-recovery/action-status.ts; page exposes 4 of 6 statuses as buttons (no cancel, no un-block) |
| VERIFICATION | VERIFIED | Same shared `verifyOutcome()`; `VERIFY_LABEL` includes an `"unverified"` entry whose exact DB default was not located (UNKNOWN) |
| HISTORY | VERIFIED | `cycleHistory`, dashboard.service.ts:104-108,136-144; page.tsx:591-603 |
| BUSINESS-SWITCH BEHAVIOUR | VERIFIED — real unguarded race, IDENTICAL across all three domains | Uses `useActiveBusiness()` (page.tsx:9,84). `load()` (page.tsx:97-113) has **zero** `useRef`/`AbortController`/generation guard (grep-confirmed). On a stale response, the page overwrites its own `dashboard`/`selected` state and **re-calls `setActiveBusinessId(A)`**, re-anchoring the SHARED cross-page active-business context back to the stale business even though the owner has already navigated to B. Re-reading Money's and Sales's `load()` implementations directly for this amendment confirms this exact `setActiveBusinessId` re-anchoring call is present and structurally identical in all three pages, not an Operations-specific "worse variant" — the original version of this document overstated this as unique to Operations; corrected here (see revision record after the hostile self-audit). Server-side workspace-ownership re-validation (dashboard.service.ts:51-54,70) means this can never leak another workspace's data, only show/set the wrong one of the owner's OWN businesses. |
| LOADING | VERIFIED | Whole-page skeleton (page.tsx:304); shared `busy` flag across 6 forms/actions |
| ERROR | VERIFIED — collapses toward empty, same pattern as Money | `load()`'s catch never clears `dashboard`; a failed initial fetch is visually indistinguishable from a genuine zero-business account in the main content area, differentiated only by whether the separate error banner also happens to be showing — and, like Sales, none of Operations' 7 catch blocks route through `classifyOperatorError()` (no governance import in this file, grep-confirmed); the banner can render a raw exception message verbatim (see Section J item 7) |
| EMPTY | VERIFIED | Zero-business text (page.tsx:348-351); `<DiagnosisEmptyState>` (page.tsx:438-444) |
| MOBILE | VERIFIED classes / UNKNOWN rendered | Five `grid-cols-N` grids with **no** responsive modifier at all (page.tsx:331,373,387,415,428) — same regression class as Sales |
| OWNER-LANGUAGE LEAKS | VERIFIED — one confirmed real leak, two minor | **Confirmed leak:** `snap.band` (raw `OwnerLoadBand` enum, e.g. literal `"BOTTLENECK_RISK"`) rendered verbatim in a workload-save toast (page.tsx:230; enum at execution/owner-workload.ts:13-19) — the page's own code comment (page.tsx:45-47) documents that `operationsState` was fixed for exactly this leak class but the fix was never extended to this toast. Minor: raw `"up"/"down"` targetDirection (page.tsx:581); raw `ownerRole` (page.tsx:559, currently always the benign lowercase word "owner" per every template in recommendations.ts) |
| ACCESSIBILITY ISSUES | VERIFIED | All inputs have visible labels (no placeholder-only labeling) except the `BusinessContextSelector`'s own type-to-filter search input, which is `aria-label`-only by that shared component's own design; zero per-field `error` props anywhere; native `required` with no visual asterisk |

Additional Operations-specific findings:
- **Capacity/Workload forms feed a DIFFERENT system (VERIFIED, important nuance):** the page's "Capacity snapshot" and "Owner workload snapshot" forms (page.tsx:412-435) persist to `OwnerCapacitySnapshot`/`OwnerWorkloadSnapshot`, which feed the cross-domain "whole-business plan," **not** the Operations diagnosis engine itself — confirmed by grep showing neither model is ever read anywhere under `src/services/owner-operations/` or `src/domain/owner-operations/`. Visually these two forms sit on the Operations page but do not affect anything else rendered on it.
- **Zero-findings copy (VERIFIED, hedged, matches Money's pattern):** "No operations issues detected — this may indicate missing input data rather than smooth operations. Check data confidence above." (page.tsx:540).
- **No independent re-ranking in React:** VERIFIED absent (no `.sort()`/`.filter()` call anywhere in the 606-line file).
- Explicitly confirmed **out of scope and unrelated despite name collision**: `src/domain/remote-operations/**` is a different product area (multi-location dispatch/compliance), not this page.

## I.0 Home vs. domain-engine confidence semantics — explicit separation

This section corrects a conflation in the original version of this document
(see the revision record following the hostile self-audit) and states the
rule UX-04A/UX-04B must follow going forward.

**Two separate systems exist, and they are NOT governed by the same rule:**

1. **Home's canonical assessment contract** (UX-02A `reconcileOwnerAssessment`,
   UX-02B `composeOwnerAssessment`, rendered via UX-03's
   `OwnerAssessmentSummary`): missing evidence there affects readiness,
   confidence, and next-data-guidance — it does **not** independently
   worsen the canonical overall health verdict. This invariant is
   unchanged by UX-04A and out of scope for the three domain pages.

2. **Each domain engine's own, pre-existing, separate scoring/state
   semantics** (Money/Sales/Operations, entirely independent of Home's
   pipeline — Section C already confirms none of the three reads or writes
   `OwnerNowView`/`reconcileOwnerAssessment`/`composeOwnerAssessment`).
   Directly re-verified against current source for this amendment:

   - **Money**: `survivalState()` (`src/domain/owner-finance/metrics.ts:377-402`)
     applies stronger risk-condition checks first, then — per an explicit
     inline comment at `metrics.ts:396` — forces at least `WATCH` when
     `dataConfidenceScore < 70` (check at `metrics.ts:397`), regardless of
     what the risk checks alone would otherwise conclude. Money additionally
     caps its numeric score: `financialHealthScore()` (`metrics.ts:352-360`)
     is capped via `Math.min(...)` against `healthScoreCeiling(dataConfidenceScore)`
     (`metrics.ts:348-350`).
   - **Sales**: `salesState()` (`src/domain/owner-sales/metrics.ts:256-282`)
     applies the same pattern — stronger risk checks first, then an explicit
     inline comment at `metrics.ts:265` backs a forced-`SOFT`-or-worse floor
     when `dataConfidenceScore < 50` (check at `metrics.ts:266`).
     `salesHealthScore()` (`metrics.ts:226-233`) takes **no** confidence
     parameter at all — Sales does not cap its numeric health score the way
     Money does.
   - **Operations**: `operationsState()` (`src/domain/owner-operations/metrics.ts:215-243`)
     is the same pattern — stronger risk checks first, then an explicit
     inline comment at `metrics.ts:226` backs a forced-`STRAINED`-or-worse
     floor when `dataConfidenceScore < 50` (check at `metrics.ts:227`).
     `operationsHealthScore()` (`metrics.ts:181-191`) also takes **no**
     confidence parameter — same asymmetry as Sales, and unlike Money.

   **This is intentional, documented honesty/caution behavior, not a
   defect.** Each inline comment states the same rationale in substance:
   there is not enough trustworthy data to assert a better state, so the
   engine reports a more cautious one. None of the three is a bug; none is
   proposed for change by this document.

**The corrected UX-04 rule, stated explicitly:** Presentation must render
each domain engine truthfully and must **not** add, remove, rerank, or
reinterpret its scoring/state semantics. This is a UX-04-specific rule
about presentation fidelity to an existing engine — it is not the same
rule as Home's "missing evidence doesn't independently worsen the
canonical verdict" invariant, and the two must not be conflated. Home's
invariant describes Home's own composition logic; it says nothing about,
and does not apply to, how Money/Sales/Operations' independent diagnosis
engines are allowed to treat confidence internally — they already treat it
as germane to state, by design, before UX-04A ever looked at them.

## I. Cross-domain comparison

| Behavior | Money | Sales | Operations | Classification |
|---|---|---|---|---|
| Business context source | `useActiveBusiness()` + presentational `BusinessContextSelector` | Same | Same | **SHARED_SEMANTIC** — all three already use the canonical UX-01 context, contrary to this mission's stated premise that they were excluded from the original 13-page migration list. They were never IN that list, but current source shows all three are wired to it regardless. |
| Stale-response race guard | **Absent** | **Absent** | **Absent** | **SHARED_SEMANTIC DEFECT** — identical missing mitigation across all three, including the identical `setActiveBusinessId` re-anchoring of the shared context on a stale response (re-verified directly for this amendment; the original version of this document overstated this as an Operations-only "extra hazard" — corrected, see revision record after the hostile self-audit). The exact `loadGenerationRef` pattern already shipped for Home in UX-03 was never applied here. This is the single most consistent, highest-confidence finding across all three audits. |
| Findings data shape | `OwnerFinanceFinding`, matches `FindingCardData` exactly | `OwnerFinding` (owner-spine), matches `FindingCardData` exactly | `OwnerOperationsFinding`, matches `FindingCardData` exactly (independently verified column-by-column, not by trusting the code comment) | **SHARED_SEMANTIC** at the data-shape level |
| Findings rendering component | Shared `<FindingCard>` | Bespoke inline JSX (equivalent content) | Shared `<FindingCard>` | **UNJUSTIFIED_INCONSISTENCY**, pending proof that Sales's bespoke rendering has no content difference from FindingCard's output — see Section S/T |
| Empty-state component (no cycle yet) | Shared `<DiagnosisEmptyState>` | Bespoke 2-branch text (a 3rd state: "snapshot recorded, no diagnosis yet" that DiagnosisEmptyState's 2-branch contract doesn't model) | Shared `<DiagnosisEmptyState>` | **DOMAIN_SPECIFIC** as currently built — Sales genuinely has one more distinguishable state than the shared component currently supports; forcing it in without extending the component would be a semantic loss |
| Action status machine | Shared `RECOVERY_ACTION_STATUSES`/`canTransition` | Same | Same | **SHARED_SEMANTIC** |
| Action ordering | Server-side `rankOwnerActions()` + deterministic DB tiebreak; zero React sorting | Same | Same | **SHARED_SEMANTIC** |
| Verification engine | Shared `verifyOutcome()` | Same | Same | **SHARED_SEMANTIC** |
| Verification UI completeness | Missing `targetValue`/`evidence`/`disputed` collection — target-reached auto-reassess unreachable from this page | Same gap | Not confirmed to have the same gap (Operations agent did not verify what fields Operations' `verifyAction()` prompts collect beyond before/after/direction) | **UNKNOWN** whether Operations shares this exact gap — likely (same prompt-based pattern) but not independently confirmed field-by-field |
| Zero-findings copy | Hedged: "...this may indicate missing input data rather than a healthy business..." | **Not hedged**: "No sales issues detected." | Hedged: "...this may indicate missing input data rather than smooth operations..." | **UNJUSTIFIED_INCONSISTENCY** unless Money/Operations can independently prove the same "missing data always produces a finding first" guarantee Sales's rule engine proves — that proof was NOT done for Money/Operations in this pass (risk-rules.ts/opportunity-rules.ts not read line-by-line for either) |
| Data-entry for completion/verification | `window.prompt()` ×5 | `window.prompt()` ×5 | `window.prompt()` ×5 | **SHARED_SEMANTIC DEFECT** — identical accessibility gap class across all three |
| Confidence critically-low banner | `<30` banner present | **Not found** in the agent's read of the page | `<30` banner present | **UNKNOWN** — Sales agent's report does not mention an equivalent banner; may be intentionally absent because Sales's rule engine makes the scenario unreachable, or may be a real gap. Not resolved in this pass. |
| Error-message governance | **Governed** — all 6 catch blocks route through `classifyOperatorError()` | **Ungoverned** — all 6 catch blocks use raw `setError(e.message)`, no governance import | **Ungoverned** — all 7 catch blocks use raw `setError(e.message)`, no governance import | **UNJUSTIFIED_INCONSISTENCY, high-confidence** — identical `api()` helper and an existing, already-shipped governance mechanism exist; Sales/Operations simply never adopted it. Not claimed as an observed leak on Sales/Operations, only structurally proven possible (see Section J item 7). |
| Owner-language leak class | Raw-fallback trapdoor only (no live leak) | Missing `"cancelled"` label (narrow, not reachable via page buttons) | **One confirmed live leak** (`snap.band` raw enum in a toast) | **DOMAIN_SPECIFIC** instances of the same recurring risk pattern (a maintained label map that is not, or cannot be, kept in sync with every field it could ever render) |
| Mobile-responsive form grids | `sm:grid-cols-2` present | **No responsive modifier at all** | **No responsive modifier at all** | **UNJUSTIFIED_INCONSISTENCY** — Money's forms have a responsive breakpoint Sales/Operations' equivalent forms lack |
| Error-state collapse into empty | Collapses (failed load ≈ zero-business empty state) | **Does not collapse** (stale data + banner coexist) | Collapses (same pattern as Money) | **UNJUSTIFIED_INCONSISTENCY** — Sales's behavior here is arguably more correct than Money's/Operations' |
| Editable domain concepts | Financial P&L/cashflow/debt metrics (29 fields) | Sales funnel/customer/B2B pipeline metrics (16+ fields) — genuinely different business concepts | Throughput/capacity/quality/delivery/SOP metrics (13 fields) + 2 cross-domain-only forms | **DOMAIN_SPECIFIC** by design — per mission Section 15, these must NOT be standardized into one schema |

## J. Truthfulness defects

1. **Stale-response overwrite (all three, CRITICAL, identical mechanism):** an out-of-order network response after a business switch silently overwrites the currently-displayed, correct business's data with a different business's stale data, AND re-anchors the shared cross-page `activeBusinessId` back to the stale business — verified identical in all three pages' `load()` implementations, not Operations-specific (the original version of this document overstated this as an Operations-only hazard; corrected here). No error, no warning is shown when this happens.
2. **Error-vs-empty collapse (Money, Operations):** a failed initial load and a genuinely-zero-business account render the identical "No businesses yet" text in the main content area; only the presence of a separate banner (easy to miss) distinguishes them.
3. **Unsupported richer missing-data detail (Money):** `missingInputsRegistry` (per-field `impact` explanation strings) is computed by the diagnosis engine but never surfaced to the owner — the page only shows the flatter `missingCriticalData` list.
4. **Verification-target dead path (Money, Sales; Operations UNKNOWN):** the page's own "Verify outcome" flow cannot supply a `targetValue`, so the domain's target-reached auto-reassessment branch can never fire from this UI — the underlying capability exists and works (verifiable via direct API use) but the page's own control surface cannot exercise it.
5. **Zero-findings guarantee inconsistently worded (all three):** Money and Operations hedge ("this may indicate missing input data..."); Sales does not. Whether Money/Operations could also safely drop the hedge (because their own missing-data findings always intercept the low-confidence case, the way Sales's do) is UNKNOWN — this needs to be resolved with evidence before any copy unification.
6. **Confidence-critically-low banner presence inconsistent (Money/Operations present, Sales UNKNOWN/absent):** not resolved in this pass.
7. **Operator-safe error governance gap (Sales, Operations; Money already fixed) — structurally proven, not confirmed as an observed leak:** all three pages share an identical `api()` helper that throws `Error(data?.error?.message || data?.error || \`Request failed (${res.status})\`)`. Money routes all 6 of its catch blocks through `classifyOperatorError()` (`src/lib/operator-error-governance.ts`), which strips Prisma/DB/UUID/internal-jargon terminology before it reaches the owner. Sales (all 6 catch blocks) and Operations (all 7, including the capacity/workload forms) instead call the raw `setError(e instanceof Error ? e.message : "Failed to X")` pattern, with **no governance import anywhere in either file** (grep-confirmed). This is not a theoretical risk: `src/__tests__/owner-finance/finance-page-owner-safe-errors.test.tsx`'s own header comment documents that this exact defect previously existed on Money itself (5 of 6 handlers) and was fixed, with a concrete example of the resulting leak — a `NotFoundError` formatting as `` `${entityType} not found: ${entityId}` ``, e.g. "OwnerFinancialSnapshot not found: 123e4567-e89b-12d3-a456-426614174000", reaching the owner verbatim before the fix. Sales's and Operations' current code can produce the same class of message today under the same trigger conditions (any server-thrown `NotFoundError`/similar reaching an un-governed catch block); whether this has actually surfaced a raw UUID or internal name in production is UNKNOWN and not claimed here — only that it is structurally proven possible via identical code plus this direct historical precedent on the sibling page.

## K. Forms/accessibility defects

- **No per-field error UI anywhere, in any of the three domains** — every validation/save failure surfaces only via a single page-top (or, on Money, occasionally form-scoped) banner, never localized to the offending input, despite the shared `Input`/`Select` primitives supporting an `error` prop.
- **No visible required/optional indicator on the large majority of snapshot fields** in all three domains — only a handful of top-level fields (dates, business-creation fields) carry the native `required` attribute; every metric field is optional with no visual marker either way.
- **`window.prompt()` used identically in all three domains** for action-completion notes/evidence and all three verification values (before/after/direction) — native browser dialogs with no in-app labeling, styling, or inline validation; a malformed number silently becomes `NaN` before an API round-trip is needed to reject it (Sales confirmed; Money/Operations share the same prompt-then-`parseFloat` pattern).
- **Money-specific:** `Advanced detail`/`Improve the analysis` tier fields (19+3 fields) are not draft-persisted to `localStorage`, unlike the "quick tier" fields — an inconsistency within the same form, not across domains.
- **Operations-specific:** the `BusinessContextSelector`'s own type-to-filter search input is `aria-label`-only (shared-component-level, applies identically wherever the selector's search box appears, i.e. potentially all three domains once business counts exceed the threshold — SHARED_SEMANTIC, not Operations-specific, though only Operations' agent explicitly flagged it).

## L. Empty-state/actionability defects

- Sales has a genuinely distinct third empty state ("snapshot recorded, diagnosis not yet run") that the shared `DiagnosisEmptyState` component's two-branch contract does not model — this is a real semantic gap in the shared component relative to Sales's actual state space, not a bug in Sales.
- No dead-end "No data" text exists anywhere in any of the three domains' verified copy — every empty state names what is missing and gives one next action, consistent with the design direction's Section 17 requirement.
- No domain shows a fabricated "recommended action" or "finding" when none exists — all three correctly render nothing (or the explicit zero-findings sentence) rather than inventing one.

## M. Owner-language defects

- **Operations: one confirmed live leak** — `snap.band` (a raw `OwnerLoadBand` enum, e.g. `"BOTTLENECK_RISK"`) rendered verbatim in a save-confirmation toast, despite the page's own code comment documenting that this exact leak class was fixed for `operationsState` elsewhere on the same page.
- **Sales: one narrow, not-currently-reachable leak** — `ACTION_STATUS_LABEL` has no `"cancelled"` entry.
- **Money: no live leak, but a structural risk** — every label map (`SURVIVAL_LABEL`, `ACTION_STATUS_LABEL`, `VERIFY_LABEL`) has a raw-value fallback (`?? rawEnum`) that would silently leak an internal token the moment a new, unmapped enum value is introduced server-side without a page update. This same fallback pattern likely exists in Sales/Operations' equivalent maps (not independently re-verified for this document, but implied by the shared `?? a.status`-style pattern each agent independently found in its own domain).
- No raw UUIDs were found rendered anywhere in any of the three pages.

## N. Responsive/mobile defects

- Money's snapshot-form grids use `grid-cols-1 sm:grid-cols-2` (responsive).
- Sales's three form grids (`grid-cols-2`×2, `grid-cols-4`×1) and Operations' five form grids (`grid-cols-2`×4, `grid-cols-4`×1) carry **no responsive breakpoint modifier at all** — verified as classes; actual rendered breakage at 390px was not visually tested by any agent (UNKNOWN, marked explicitly by all three reports) and would require a real/known-person or at minimum a live browser check before this is treated as settled, per Section 19's evidence boundary.
- All three domains use `flex flex-wrap` on their action-button rows, which is inherently mobile-safe regardless of the grid finding above.

## O. Progressive-disclosure contract — CURRENT order vs. FUTURE first-read hierarchy (not adopted)

This section is split into two explicitly separate claims, corrected from
the original version of this document, which stated a single "candidate
hierarchy" without clearly separating what is observed today from what
might be authorized later (see the revision record after the hostile
self-audit). **`MUST_PRESERVE` (Section P) is not the same claim as
`MUST_SHOW_FIRST` — preserving a capability says nothing about where in the
render order it belongs.**

### CURRENT RENDER ORDER (verified, descriptive only)

Each page's own JSX already renders, in this order, without intermixing:
score row → confidence/missing-data banners → recommended action →
findings → actions → history. Concretely, present in all three domains
today:

1. condition/state label (`survivalState`/`salesState`/`operationsState`)
   and the three 0-100 scores (health/risk/opportunity).
2. confidence score + missing-critical-data banner.
3. `recommendedNextAction`.
4. `findings` list with evidence-vs-threshold and confidence-per-finding.
5. action list with status/lifecycle controls, verification UI, cycle
   history.

This is a factual description of what each page shows first today. It is
not a recommendation, and no domain requires information to be shown out
of this order to remain truthful today.

### FUTURE FIRST-READ HIERARCHY — USER-EVIDENCE NEEDED

The original version of this document treated the CURRENT RENDER ORDER
above as if it were also the correct, or pre-authorized, first-read
hierarchy for a non-technical owner going forward. That is corrected here:
**this document does not decide, and does not pre-authorize, what a
non-technical owner should see first.** The score triad being rendered
first today is not, by itself, evidence that a score triad is the right
thing to show first — it may equally be evidence of an un-examined default
carried over from an earlier, more technical iteration of these pages.
Whether the current order is also the right order is real-user-evidence
territory, and is explicitly left undecided here, alongside every other
layout/hierarchy/copy-tone question in Section Q item 5 and Section V item
8.

`MUST_PRESERVE` (Section P) governs whether a capability may be removed or
hidden; it does not authorize, and must not be read as authorizing, any
particular render position for that capability.

## P. Existing-feature preservation table

Every item below is `MUST_PRESERVE`. This list is exhaustive per the three
agents' full-file reads and their explicit "every action/mutation this
page or its APIs expose" inventories.

### Money — MUST_PRESERVE

Input/diagnosis: create business; add financial snapshot (29 fields, duplicate-period rejection); run finance diagnosis (rate-limited 10/business/hour, dual in-memory+Postgres limiter); snapshot amendment API (append-only, row-locked) — **UI-unexposed but must not be removed from the API**.
Action: update action status (Assign/Start/Complete/Block, plus server-only Cancel and un-Block); completion requires notes+evidence; material-transition safety gates.
Verification: record before/after outcome verification; auto-reassessment on completion and on target-reached verification; historical-effectiveness Bayesian confidence modifier (never applied to critical-severity findings).
Read-only, page-unused-but-API-present: list/detail snapshots, single action detail, cycle detail, cycle findings/actions lists.
Business switching via shared context; per-business diagnosis history list.
Audit events: `OWNER_FINANCE_SNAPSHOT_RECORDED/AMENDED`, `_DIAGNOSIS_RUN`, `_DIAGNOSIS_LOW_CONFIDENCE`, `_ACTION_UPDATED/COMPLETED`, `_REASSESSMENT_TRIGGERED`, `_OUTCOME_VERIFIED`, `_VERIFICATION_REASSESSMENT_TRIGGERED`.

### Sales — MUST_PRESERVE

Input/diagnosis: create business; add sales snapshot (16 metric fields + period/business-model); run sales diagnosis.
Action: update action status (Assign/Start/Complete/Block, plus server-only Cancel and un-Block); completion requires notes+evidence; material-transition safety gates.
Verification: record before/after outcome verification; auto-reassessment on completion and on target-reached verification.
Read-only, page-unused-but-API-present: list/detail snapshots, single action detail, cycle detail, cycle findings/actions lists, and a **full separate customer CRUD surface** (`owner-sales/customer.service.ts`) not called by this page at all.
Business switching via shared context; per-business diagnosis history list.
Audit events: `owner.sales_snapshot_recorded`, `_diagnosis_run`, `_action_updated/completed`, `_reassessment_triggered`, `_outcome_verified`, `_verification_reassessment_triggered`.

### Operations — MUST_PRESERVE

Input/diagnosis: create business; add operations snapshot (13 metric fields); add capacity snapshot (feeds the cross-domain whole-business plan, NOT this page's own diagnosis — must remain wired exactly that way); add owner-workload snapshot (same cross-domain-only wiring); run operations diagnosis.
Action: update action status (Assign/Start/Complete/Block, plus server-only Cancel and un-Block); completion requires notes+evidence; material-transition safety gates.
Verification: record before/after outcome verification; auto-reassessment on completion and on target-reached verification.
Read-only, page-unused-but-API-present: list/detail snapshots, cycle detail, cycle findings/actions lists, capacity/workload snapshot lists.
Business switching via shared context; per-business diagnosis history list.
Audit events: `OWNER_OPERATIONS_SNAPSHOT_RECORDED`, `_DIAGNOSIS_RUN`, `_ACTION_UPDATED/COMPLETED`, `_REASSESSMENT_TRIGGERED`, `_OUTCOME_VERIFIED`, `_VERIFICATION_REASSESSMENT_TRIGGERED`. (Capacity/workload snapshot creation emits **no** audit event today — a pre-existing gap, not something UX-04B introduces or is asked to fix.)

## Q. Candidate UX-04B presentation changes

Every candidate below states explicitly that it carries **no semantic
change** — UX-04B, if it proceeds, must not compute, rank, score, or
diagnose anything new.

**1. Stale business-switch response guard (all three domains)**
CURRENT: `load()` has no generation-ref/AbortController; a late response
for a previously-active business can overwrite the current business's
state (and, on Operations, the shared `activeBusinessId`).
PROBLEM: violates Section 13's business-switch truthfulness requirement;
identical to the bug UX-03 already fixed for Home via `loadGenerationRef`.
PROPOSED PRESENTATION: apply the same, already-shipped `loadGenerationRef`
pattern to each of the three pages' `load()` functions.
SOURCE OF TRUTH: existing, tested pattern (Home/`page.tsx`, UX-03) — no new
logic invented.
FEATURES PRESERVED: all; this only discards a response that is no longer
current, exactly as Home already does.
DIAGNOSIS/SCORING SEMANTICS CHANGE: NO — no engine output (state, score,
finding, recommended action) is touched.
API CONTRACT CHANGE: NO — no request/response shape changes.
CLIENT STATE BEHAVIOR CHANGE: YES — intentional correctness fix. Today a
stale response can overwrite current state and the shared
`activeBusinessId`; after the fix, a stale response is discarded instead
of applied. This is a real behavior change relative to current code, even
though it changes nothing about what a *correct*, in-order response would
show.
OWNER-VISIBLE EFFECT: the owner stops seeing a rare, silent wrong-business
flash after a fast business switch; nothing else changes for the common
in-order case.
USER-EVIDENCE NEEDED: NO — this mirrors an already-shipped, already-tested
mitigation; the correctness argument does not depend on visual design.

**2. Fix the confirmed raw-enum leak in Operations' workload toast**
CURRENT: `snap.band` renders a raw `OwnerLoadBand` token (e.g.
`"BOTTLENECK_RISK"`) verbatim in a save-confirmation message.
PROBLEM: violates the design direction's Section 3 owner-language rule;
the page already has a label-map pattern for the identical problem class
on `operationsState` two lines away.
PROPOSED PRESENTATION: add a label map for `OwnerLoadBand`'s 5 values,
matching the existing `STATE_LABEL`/`SURVIVAL_LABEL` convention.
SOURCE OF TRUTH: `src/domain/execution/owner-workload.ts`'s existing 5
literal values — no new value invented.
FEATURES PRESERVED: all.
DOMAIN SEMANTICS CHANGE: NO — the underlying `OwnerLoadBand` value, its
meaning, and when it is assigned are untouched.
OWNER-FACING COPY/PRESENTATION CHANGE: YES — the raw enum token is
replaced with a plain-language label in the toast; no new fact is stated
that the enum value didn't already carry.
USER-EVIDENCE NEEDED: NO.

**3. Add the missing `"cancelled"` label entry to Sales' `ACTION_STATUS_LABEL`**
CURRENT: falls through to the raw literal string if a cancelled action is
ever rendered.
PROBLEM: same owner-language rule; narrow but real.
PROPOSED PRESENTATION: add the missing map entry, matching Money's/Operations' complete coverage.
SOURCE OF TRUTH: the existing, already-complete `RECOVERY_ACTION_STATUSES` list.
DOMAIN SEMANTICS CHANGE: NO — the action-status machine and its values are
untouched.
OWNER-FACING COPY/PRESENTATION CHANGE: YES — closes a label-map gap with a
plain-language label; no new fact is stated that the status value didn't
already carry.
USER-EVIDENCE NEEDED: NO.

**4. Operator-safe error governance parity (Sales, Operations)**
CURRENT: Money routes all 6 of its catch blocks through the existing
`classifyOperatorError()` helper (`src/lib/operator-error-governance.ts`).
Sales (6 catch blocks) and Operations (7 catch blocks) use a raw
`setError(e instanceof Error ? e.message : "Failed to X")` pattern instead,
with no governance import in either file.
PROBLEM: violates the design direction's Section 3 owner-language rule and
Section 17's error-state contract; `finance-page-owner-safe-errors.test.tsx`'s
own header comment proves this exact defect previously existed on Money and
was fixed, with a concrete leak example (a `NotFoundError` formatting as
`` `${entityType} not found: ${entityId}` ``, e.g. a raw UUID, reaching the
owner verbatim). Whether this has actually surfaced on Sales/Operations in
production is UNKNOWN; the risk is structural, proven by identical code
plus this direct precedent, not by an observed incident.
PROPOSED PRESENTATION: route Sales's and Operations' catch blocks through
the existing `classifyOperatorError()` helper, exactly as Money already
does — reusing the existing mechanism, no new abstraction, no error-system
redesign.
SOURCE OF TRUTH: `src/lib/operator-error-governance.ts` (already shipped,
already used by Money) and Money's own catch-block call sites as the exact
pattern to replicate.
FEATURES PRESERVED: all; no error is suppressed, only reclassified for
safe display, mirroring Money's already-shipped behavior.
DOMAIN SEMANTICS CHANGE: NO — no diagnosis/scoring/state output changes.
OWNER-FACING COPY/PRESENTATION CHANGE: YES — technical/internal error text
is replaced with governed, plain-language error copy; retryable vs.
non-retryable guidance becomes consistent with Money.
USER-EVIDENCE NEEDED: NO — this reuses an existing, already-shipped
mechanism; the correctness argument does not depend on visual design.
TESTS NEEDED: a dedicated test per page (mirroring
`finance-page-owner-safe-errors.test.tsx`) proving (a) raw exception/server
messages are never rendered, (b) retryable vs. non-retryable copy is
correct, and (c) an ERROR state is visually distinct from an EMPTY state.

**5. Everything else — explicitly NOT decided here**

Unifying the zero-findings copy hedge, unifying the confidence-critically-low
banner's presence, moving Sales onto `FindingCard`/`DiagnosisEmptyState`,
adding responsive breakpoints to Sales'/Operations' form grids, adding
per-field error display, replacing `window.prompt()` with in-page fields,
surfacing Money's `missingInputsRegistry`, or any visual/IA restructuring
of the three pages are all **candidate** UX-04B work, but per Section 19
none may be committed to a file manifest here without either (a) further
source-level proof that the change carries no semantic effect (e.g. the
Sales-vs-Money/Operations zero-findings-hedge question genuinely needs
`risk-rules.ts`/`opportunity-rules.ts` read in full for Money and
Operations before anyone can safely say the hedge can be dropped or added
either way), or (b) real/known-person usage evidence for anything touching
layout, hierarchy, or copy tone. This document intentionally stops short of
proposing a manifest for these.

## R. Candidate UX-04B exact file manifest

The four zero/low-semantic-risk fixes in Section Q have enough evidence to
name files now. This corrects the original version of this document, which
stated no test-file changes were proposed while Section V (acceptance
criterion 3) already required a business-switch regression test per page —
see the revision record after the hostile self-audit.

Production files:
- `src/app/(authenticated)/owner/finance/page.tsx` — add generation-ref guard to `load()`.
- `src/app/(authenticated)/owner/sales/page.tsx` — add generation-ref guard to `load()`; add `"cancelled"` to `ACTION_STATUS_LABEL`; route catch blocks through `classifyOperatorError()`.
- `src/app/(authenticated)/owner/operations/page.tsx` — add generation-ref guard to `load()`; add an `OwnerLoadBand` label map for the workload-save toast; route catch blocks through `classifyOperatorError()`.

Test files (new, dedicated per-domain files, mirroring the existing
templates identified by inspecting `owner-cockpit-business-switch-race.test.tsx`,
`business-context-sync-sales-trust-execution.test.tsx`,
`business-context-selector-migration.test.ts`, and
`finance-page-owner-safe-errors.test.tsx` before choosing this strategy —
extending the two existing test files was ruled out: the sync-execution
test's fetch mock resolves synchronously and cannot prove an out-of-order
race, and the selector-migration test is a static source-string check, not
a runtime/behavioral test):
- `src/__tests__/components/owner-finance-business-switch-race.test.tsx` — new, mirrors `owner-cockpit-business-switch-race.test.tsx`'s scenarios (stale-after-switch, inverse timing, rapid A→B→A, stale-failed-request, remount/generation-reset) for Money.
- `src/__tests__/components/owner-sales-business-switch-race.test.tsx` — same, for Sales.
- `src/__tests__/components/owner-operations-business-switch-race.test.tsx` — same, for Operations.
- `src/__tests__/owner-sales/sales-page-owner-safe-errors.test.tsx` — new, mirrors `finance-page-owner-safe-errors.test.tsx` for Sales (Section Q item 4).
- `src/__tests__/owner-operations/operations-page-owner-safe-errors.test.tsx` — new, mirrors `finance-page-owner-safe-errors.test.tsx` for Operations (Section Q item 4).

No new component files and no shared-hook extraction are proposed in this
manifest — introducing a shared hook (Section S) is a candidate for a
future pass once the fix above has been applied identically three times
and the duplication is visibly proven, not before.

No other file is proposed. Everything else remains `USER-EVIDENCE NEEDED:
YES` or blocked on further source reading, per Section Q item 5.

## S. Proposed shared components

Only where semantic equivalence is already proven by source, not by visual
similarity:

- **`FindingCard`** — already proven identical in data shape across all
  three domains (Money, Sales, Operations all persist the same
  `OwnerFinding`-shaped columns). Sales does not yet use it. A future pass
  MAY migrate Sales onto it once someone confirms Sales's bespoke JSX
  renders no content `FindingCard` cannot (evidence points this way but was
  not pixel/output-diffed in this pass).
- **A shared stale-response generation-ref hook** (e.g.
  `useLoadGeneration()`) — the exact same guard is needed identically in
  Money, Sales, and Operations (Section Q item 1), and already exists,
  inlined, on Home. Proposed only as a future extraction once the pattern
  has been applied three times; not proposed as new shared code in this
  phase's own file manifest (Section R keeps the fix inline per-page to
  minimize risk).

## T. Unsafe abstractions explicitly rejected

- **A single shared input-schema/form component across Money/Sales/Operations** — rejected outright. Per mission Section 15, Money's P&L/cashflow fields, Sales's funnel/customer/B2B fields, and Operations' throughput/capacity/quality fields are different business concepts; standardizing them would fabricate false equivalence.
- **Forcing Sales onto `DiagnosisEmptyState` as-is** — rejected. `DiagnosisEmptyState` models exactly 2 states (no-snapshot / has-snapshot-ready-for-diagnosis); Sales has a genuine third state (snapshot-recorded-but-not-yet-diagnosed) the component does not currently represent. Adopting the component without first extending its own contract would silently lose a real, truthful distinction.
- **A single "business domain page" template/layout abstraction** — rejected at this stage. Section I's cross-domain comparison shows enough `DOMAIN_SPECIFIC` and `UNKNOWN` cells (empty-state shape, confidence-banner presence, zero-findings wording) that a shared page template would either force a premature decision on those open questions or hide genuine domain differences behind a false "the three pages are basically the same" abstraction.
- **Silently dropping Money's `missingInputsRegistry` question by assuming it's fine to keep unused** — not rejected as an abstraction, but explicitly not resolved here; flagged as a residual unknown (Section W) rather than quietly decided either way.

## U. Open-PR collision report

Inspected: full open-PR listing on `main` (`gh`/GitHub API list, 2026-09-21).
Only one non-bot, non-Stage-7-evidence PR was open: **draft PR #496**,
`fix/recommendation-safety-scoping`.

- Diff inspected directly (`git diff --stat` against its merge-base with
  `main`): touches `src/services/owner-finance/recommendation-cash-safety.service.ts`,
  `src/services/owner-finance/recommendation-margin-safety.service.ts`,
  `src/services/owner-mode/recommendation-capacity-safety.service.ts`, and
  two `.db.test.ts` files. All three service-file changes are **pure
  additions with zero deletions** (60 insertions, 0 deletions total),
  consistent with its title "re-verify and prove recommendation-safety
  scoping is not cross-business" — a documentation/test-proof commit, not a
  behavior change.
- **No file overlap** with anything read or proposed in this document
  (this audit's Money service reads were `snapshot.service.ts`,
  `diagnosis.service.ts`, `action.service.ts`, `verification.service.ts`,
  `dashboard.service.ts` — none of which PR #496 touches).
- **No behavioral/domain-contract overlap**: PR #496 concerns the legacy
  consultant-side recommendation-safety scoring gates, not the owner-facing
  Money page's own diagnosis/finding/action pipeline documented above.
- Per mission instruction, PR #496 was not merged, modified, closed,
  cherry-picked, or "fixed" as part of this work.
- All other open PRs are Dependabot version bumps or `stage7-evidence`
  bot-generated artifact PRs — confirmed by title/branch-name inspection,
  none touch `owner-finance`/`owner-sales`/`owner-operations`.
- **Conclusion: no collision.** UX-04A itself makes zero production-code
  changes, so no collision is possible even in principle; the audit above
  is recorded for when UX-04B (which would touch `page.tsx` files) is
  proposed.

## V. UX-04B acceptance criteria (for a future phase, not adopted here)

If a future UX-04B implementation phase proceeds from this contract, it
must satisfy, at minimum:
1. Zero changes to any file under `src/domain/owner-finance/`,
   `src/domain/owner-sales/`, `src/domain/owner-operations/`,
   `src/services/owner-finance/`, `src/services/owner-sales/`,
   `src/services/owner-operations/`, or any shared engine
   (`owner-spine`, `founder-recovery/action-status.ts`,
   `founder-recovery/verification.ts`) — all scoring/ranking/lifecycle
   logic stays exactly as documented in Sections F-H.
2. Every `MUST_PRESERVE` item in Section P remains reachable (UI-exposed
   items keep their exact current trigger; API-only items remain callable
   even if still not surfaced in the UI).
3. The stale-response guard (Section Q item 1) is applied identically to
   all three pages using the exact pattern already proven on Home, with a
   dedicated business-switch regression test per page mirroring
   `owner-cockpit-business-switch-race.test.tsx`'s scenarios — see Section R
   for the exact three new test-file names
   (`owner-finance-business-switch-race.test.tsx`,
   `owner-sales-business-switch-race.test.tsx`,
   `owner-operations-business-switch-race.test.tsx`).
4. No new "why it matters"/"what changed"/scoring text is invented for any
   finding, action, or state that does not already carry that data.
5. Any change to zero-findings copy, confidence-banner presence, or
   empty-state unification is preceded by the specific source reads
   identified as missing in Section W — not shipped on inference.
6. `node scripts/ux/verify-owner-feature-preservation.mjs` continues to
   PASS with no unexplained count change in any of: owner page routes,
   owner API routes, page major actions, owner action families, mutation
   families.
7. No merge of Money/Sales/Operations' distinct input schemas.
8. Real/known-person usage evidence is obtained before any change to
   information hierarchy, IA, or the decision to move any field behind/out
   of progressive disclosure — Section O's CURRENT RENDER ORDER is not
   self-authorizing as a FUTURE FIRST-READ HIERARCHY.
9. If the error-governance fix (Section Q item 4) is included, Sales and
   Operations each gain a dedicated safe-errors test mirroring
   `finance-page-owner-safe-errors.test.tsx` (Section R), proving raw
   exception/server messages are never rendered, retryable vs.
   non-retryable copy is correct, and ERROR is visually distinct from
   EMPTY.

## W. Residual unknowns

Explicitly NOT converted into implementation scope:

1. Whether `findings.length === 0` is reachable at HIGH data-confidence
   for Money and Operations (would require reading
   `risk-rules.ts`/`opportunity-rules.ts` in full for both domains) — this
   directly gates whether the Money/Operations zero-findings hedge is
   necessary or whether Sales's unhedged wording could safely be adopted
   everywhere, or vice versa.
2. Whether Sales's `growth/sales-pipeline` CRM engine has any product
   relationship to `/owner/sales` that a future phase is expected to
   surface — confirmed unrelated to the CURRENT page, but its future
   status is out of this audit's authority to decide.
3. Whether a critically-low-confidence (`<30`) banner is genuinely absent
   from Sales, or simply not mentioned by that agent's report; not
   independently re-verified in synthesis.
4. Exact per-metric finding-code catalog and threshold constants for all
   three domains (`risk-rules.ts`, `opportunity-rules.ts`,
   `recommendations.ts`, `thresholds.ts`, `pricing-analysis.ts`,
   `unit-economics.ts`, `cash-safety-gate.ts`, `margin-safety-gate.ts` were
   not read line-by-line for any domain) — irrelevant to the page-level
   contract documented here, but relevant to any future work on individual
   finding wording.
5. `enforceOwnerActionGates()`'s exact per-domain gating conditions
   (`src/services/owner-mode/owner-action-gate.service.ts`) were not read
   in full for any domain — only its existence and call sites are
   confirmed.
6. `OwnerOperationsVerification`'s Prisma-level default `status` column
   value (relevant to the `"unverified"` label) was not located.
7. Whether Operations' `verifyAction()` UI shares Money's/Sales's exact
   `targetValue`-omission gap — likely, by pattern, but not independently
   confirmed field-by-field for Operations.
8. Actual rendered mobile-viewport behavior (390px/768px) for all three
   domains — only the presence/absence of responsive Tailwind classes was
   verified; no visual/live check was performed, per the read-only scope
   of this phase.
9. Whether `BusinessContextSelector`'s two independent business lists
   (the shared context's own list vs. each page's dashboard-response list)
   can ever genuinely diverge in practice — both ultimately call the same
   `listBusinesses(workspaceId)` server-side, but through separate HTTP
   round-trips; not stress-tested.
10. Whether moving Sales onto `FindingCard` would visually or textually
    change anything a real owner would notice — data-shape equivalence is
    proven; rendered-output equivalence is not.
11. Whether Sales's or Operations' ungoverned error handlers have ever
    actually surfaced a raw UUID or internal name to a real owner in
    production. This amendment establishes the risk is structurally real
    (the same un-governed raw-message pattern Money's own test history
    documents it once had, plus Money's own documented historical leak
    example) but does not claim, and has no evidence of, an actual
    observed leak on Sales or Operations specifically.

---

## Hostile self-audit (Section 24)

1. Did I accidentally turn Execution into a business domain? **No** —
   `/owner/execution`/`/owner/tasks` were excluded per Section E and never
   read as in-scope.
2. Did I allow a domain page to compete with Home's overall assessment?
   **No** — Section C confirms none of the three domains reads or writes
   `OwnerNowView`/`reconcileOwnerAssessment`/`composeOwnerAssessment`.
3. Did I delete or hide a working feature rather than progressively
   disclose it? **No** — zero production code was changed; Section P
   enumerates every capability as `MUST_PRESERVE`.
4. Did I infer good health from zero findings? **No** — Section J item 5
   explicitly flags the inconsistency rather than resolving it in either
   direction, and Sections F-H record each domain's actual zero-findings
   copy verbatim without endorsing a "healthy" reading.
5. Did I treat missing data as bad health, or did I fail to distinguish
   Home's invariant from the domain engines' own semantics? **Corrected in
   this amendment** — the original answer to this question was false: it
   claimed every MISSING-DATA BEHAVIOUR row documents that missing data
   never worsens `healthScore`/`state` directly. Direct re-reading of
   `metrics.ts` in all three domains for this amendment confirms the
   opposite: `survivalState()`, `salesState()`, and `operationsState()` all
   deliberately force a more cautious state when confidence is below a
   threshold (Section I.0), and Money additionally caps its numeric health
   score. The real question this hostile-audit item should test is
   narrower, and is now answered correctly: did UX-04A add a NEW
   presentation-side rule that makes missing data look worse than the
   domain engine itself already says? **No** — this document proposes no
   new confidence-to-severity mapping; Section I.0 states explicitly that
   presentation must preserve each engine's existing semantics unchanged.
6. Did I rerank findings or actions? **No** — Section I and each domain's
   ACTION ORDERING SOURCE row explicitly confirm zero React-side sorting in
   all three domains, and Section Q proposes no ordering change.
7. Did I assume identical-looking scores have identical semantics? **No**
   — Section I marks scoring dimensions `SHARED_SEMANTIC` only where a
   shared underlying function/type was directly cited (e.g.
   `rankOwnerActions()`, the shared action-status machine); domain-specific
   score FORMULAS (health/risk/opportunity) are documented separately per
   domain in Sections F-H, never conflated.
8. Did I propose shared components before proving field/behavior
   equivalence? **No** — Section S proposes `FindingCard` reuse only where
   the data shape was independently column-compared (Operations vs. Money),
   and marks rendered-output equivalence for Sales as unproven (Section W
   item 10); the generation-ref hook is proposed only as a documented,
   already-proven pattern.
9. Did I standardize genuinely domain-specific forms? **No** — Section T
   explicitly rejects a shared input schema across the three domains.
10. Did I expose raw internal language? **No** — this document itself
    quotes raw enum values only as cited evidence inside code blocks/quotes,
    never as a proposal for owner-facing copy.
11. Did I confuse ERROR with EMPTY? **No** — Section J item 2 specifically
    identifies the Money/Operations error-collapses-into-empty defect as a
    defect to fix, not as acceptable current behavior.
12. Did I invent success/verification? **No** — Section Q's candidates are
    all either bug fixes (stale-response guard) or label-mapping fixes
    (raw-enum leaks), never new verification/success claims.
13. Did I broaden into Tasks/Execution? **No.**
14. Did I broaden into Evidence & Trust? **No.**
15. Did I broaden into specialist/Preview features? **No** — Recovery,
    Strategy, Marketing, Campaigns, Starting up are named only in Section E
    as confirmed-excluded, never inspected further.
16. Did I redesign navigation? **No** — `sidebar-nav.tsx` was read
    read-only, for evidence, and was not modified.
17. Did I treat current code as a substitute for actual user evidence?
    **No** — Section 19's boundary is honored explicitly in Sections Q
    item 4, R, and V item 8: every layout/hierarchy/copy-tone change is
    marked `USER-EVIDENCE NEEDED: YES` or left as a residual unknown rather
    than decided from code alone.
18. Did I optimize aesthetics before truthfulness/comprehension? **No** —
    the only concrete UX-04B candidates proposed (Section Q) are
    correctness/truthfulness fixes (stale-response race, raw-enum leaks),
    not visual polish.
19. Did I create generic AI-dashboard styling? **No** — no styling was
    created; this phase produced one markdown document.
20. Could a low-digital-literacy owner understand the proposed first read
    without assistance? Section O's candidate FIRST tier (state label,
    three scores, confidence + missing-data banner, recommended action) is
    already what each page renders first today, in owner-safe language for
    9 of the 10 checked leak points (Section M) — the one confirmed
    remaining leak (Operations' `snap.band` toast) is exactly why Section Q
    proposes fixing it. This document does not yet answer whether the
    proposed FIRST tier is comprehensible without assistance for a real
    low-digital-literacy owner — that is Section 19 evidence, not something
    code inspection can answer, and is not claimed as answered here.

## Revision record (PR #512 amendment)

The original version of this document contained a real defect, surfaced by
a hostile re-audit requested after publication, and corrected in this
revision without any change to production code:

1. **Home-vs-domain-engine confidence semantics were conflated.** The
   original document implied a single confidence-affects-presentation rule
   applied everywhere. Section I.0 (new) separates Home's canonical
   composition invariant from each domain engine's own, separate,
   pre-existing confidence-gates-state semantics, and states the correct,
   narrower UX-04 rule: preserve each engine's semantics exactly, don't add
   a new one.
2. **Hostile self-audit item 5 (above) was factually wrong** and is
   corrected in place, with the corrected, narrower question it should
   have asked.
3. **Section R stated "no test-file changes are proposed" while Section V
   already required a per-page regression test** — an internal
   contradiction. Corrected by naming five concrete new test files in
   Section R after inspecting the repo's existing test-file conventions
   (see Section R for why the two nearest existing test files were not
   extended instead).
4. **Section Q's "SEMANTIC CHANGE: NO" wording was imprecise** for the
   stale-response fix (it is a real client-state behavior change, even
   though it changes no diagnosis/scoring semantics) and for the two
   label-map fixes (they are owner-facing copy/presentation changes, even
   though they change no domain semantics). Both are now stated on
   separate, explicit axes.
5. **A new UX-04B candidate (Section Q item 4) was added**: Sales's and
   Operations' error handling lacks the operator-safe error governance
   Money already has, evidenced by Money's own historical fix
   (`finance-page-owner-safe-errors.test.tsx`) — recorded as structurally
   proven, not as an observed production leak.
6. **Sections H and I overstated Operations as uniquely re-anchoring the
   shared `activeBusinessId` on a stale response.** Direct re-reading of
   Money's and Sales's `load()` implementations for this amendment
   confirms the identical call is present in all three pages. Corrected in
   Sections F, G, H, I, and J.
7. **Section O did not separate what is rendered first today from what
   should be shown first.** Rewritten to state CURRENT RENDER ORDER
   (descriptive) and FUTURE FIRST-READ HIERARCHY (explicitly
   USER-EVIDENCE-NEEDED, not decided here) as two distinct claims.
8. **Section W (residual unknowns) is updated** to add the new,
   error-governance-specific unknown this amendment's investigation
   surfaced (item 11).

No merge, and no start of UX-04B, occurred as part of making these
corrections. This amendment changes only this document.
