# Root Cause Class Ledger — OpsIQ BOS Validation (Stage A7)
**Date:** 2026-07-11
**Branch:** claude/phase-7-bos-validation
**Baseline:** 136/136 integration tests passing

---

## RC-A7-001: Workflow A Dashboard Dead End — Consulting-Mode Table Coupling

**Classification:** CRITICAL — Workflow dead end for all pure owner-mode users

**Root Cause:**
`src/app/api/owner/dashboard/route.ts` → `buildOwnerDashboardPayload()` queries
`db.engagement`, `db.action`, `db.KPI`, `db.recommendation` — all Prisma models from the
consulting-mode data schema. An owner-mode user who has never been part of a consulting
Engagement will always get zeros: empty `engagements[]`, `actions[]`, `kpis[]`,
`recommendations[]`.

**Why the architecture allowed it:**
The `/api/owner/dashboard` route was written using the pre-existing consulting-mode
`dashboard.service.ts` which was designed around `EngagementHealthSnapshot`. The owner-mode
data model (OwnerBusiness, OwnerFinanceCycle, OwnerFinanceAction, etc.) was added later
but never wired into the main dashboard route.

**Occurrences found (full repo grep):**
- `src/app/api/owner/dashboard/route.ts` — only file querying consulting-mode tables in the owner/ route tree

**Downstream workflow broken:**
- Workflow A: Owner → ... → Progress → **Dashboard** → Learning
  The Dashboard step is broken for owner-mode users.

**Fix required:**
Replace `db.engagement/action/KPI/recommendation` queries in `buildOwnerDashboardPayload`
with owner-mode queries: `db.ownerBusiness` (via `listBusinesses`), and
`getOwnerBusinessProgress` for cross-domain action counts.
Map `OwnerBusiness` health scores (via `getBusinessCondition`) into
`EngagementHealthSnapshot` shape for `calculateWorkspaceHealth` compatibility.

**Status:** FIXED in this PR (see FINAL_REPORT.md)

---

## RC-A7-002: Missing End-to-End BOS Workflow Integration Tests

**Classification:** HIGH — No test proves the complete A→E workflow chains work end-to-end

**Root Cause:**
Integration tests exist for individual workflow slices (W1–W7) but no test validates
the complete Workflow A (Owner→Business→ManualEntry→Snapshot→Diagnosis→Recommendations→
Actions→Evidence→Verification→Reassessment→Progress→Dashboard→Learning) or the
cross-domain consistency across Workflows B/C/D/E.

**Occurrences found:**
- `src/__tests__/integration/` has 8 test files, none spanning a complete end-to-end flow
- No test verifies: `recommendation exists → can become action → action has evidence →
  evidence triggers verification → verification triggers reassessment → reassessment
  updates progress`

**Fix required:**
Add `workflow-bos-validation.test.ts` covering the complete chain using mock-injectable
pattern (no real DB needed).

**Status:** FIXED in this PR

---

## RC-A7-003: Workflow C Learning Loop Not Proven to Feed Back

**Classification:** MEDIUM — Learning promotes candidates but no test proves recommendations change

**Root Cause:**
`promoteLearningCandidate` marks a DB record as promoted. However, there is no verified
path from a promoted learning candidate back into the recommendation engines to prove that
future recommendations are actually influenced. The promote route returns `{promoted: true}`
but the downstream effect is not tested.

**Occurrences found:**
- `src/services/controlled-learning-candidate.service.ts` — promote marks status
- No route or service that reads promoted candidates and modifies recommendation parameters

**Clarification:**
The controlled learning architecture is intentionally human-gated — a human must promote,
and promotion creates a record. The record's effect on recommendations is a future
implementation concern. This is a known limitation of the current design.

**Status:** DOCUMENTED — Out of scope for this PR per stage A7 rules (no rebuild of learning engine)

---

## RC-A7-004: Dashboard `/api/owner/dashboard` Uses `EngagementHealthSnapshot` Consulting Pattern

**Classification:** MEDIUM — Architectural coupling in `dashboard.service.ts`

**Root Cause:**
`calculateWorkspaceHealth` in `dashboard.service.ts` accepts `EngagementHealthSnapshot[]`
which uses `engagementId: string` as the key. For owner-mode adaptation, the route
can map `businessId` to `engagementId` in the snapshot shape without changing the service.

**Fix:**
Route-level adaptation: map OwnerBusiness condition data into `EngagementHealthSnapshot`
format. The service itself does not need to be changed (no parallel architecture).

**Status:** FIXED via route-level adaptation in RC-A7-001 fix

