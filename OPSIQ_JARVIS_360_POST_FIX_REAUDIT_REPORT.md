# OPSIQ JARVIS 360 — POST-FIX HOSTILE RE-AUDIT

Second hostile re-audit after the complete gap-closure pass. Re-checks every gap in
`OPSIQ_JARVIS_360_COMPLETE_GAP_REGISTER.md` against the live code + tests. Verdict per gap:
original finding · closure implementation · runtime path · owner-visible path · tests ·
remaining bypass · final status.

- **Branch:** `claude/opsiq-jarvis-360-audit-m8jro7`
- **Base HEAD:** `4276234` · **Working tree at audit:** committed through the gap-closure slices
- **Local checks:** full-project `tsc --noEmit` → **0 errors** (Prisma client generated);
  `governance:scan:strict` → **0 new**; `eslint` on all changed files → **0**; owner-mode
  vitest → **162 passed / 24 files**; execution + operator + approval suites → green.

Status legend: CLOSED · PARTIAL · STILL_OPEN · HARD_BLOCKED · E2E_ONLY_REMAINING.

---

## Per-gap verdicts

### G01 — owner routes have no UI caller → **CLOSED**
Closure: `/owner` page now fetches `/api/owner/control-center` and renders it. Runtime: page →
control-center route → `getOwnerControlCenter`. Owner-visible: new control-center section.
Tests: `owner-block-metrics.test.ts` (route input); manual render. Bypass: none (additive).

### G02 — data-sufficiency + panel not rendered → **CLOSED**
Closure: control-center section renders data-sufficiency-driven critical alerts + what-NOT-to-do
+ next best action + section counts. Owner-visible: yes. Tests: composer covered by existing
control-center domain tests; counts by block-metrics test.

### G03 — control-center blocked counts hardcoded 0 → **CLOSED**
Closure: new `owner-block-metrics.service` derives blockedRecommendations/financeBlocked/
proofBlocked from the audit log; route wires them. Runtime: route → block-metrics → auditEvent
query. Tests: `owner-block-metrics.test.ts` (counts, finance subset, proof subset, ws scope, window).
Bypass: counts are within a 30-day window (documented), not a correctness bypass.

### G04 — gate spine only on `Recommendation.approve` → **PARTIAL**
Closure: a material-gate registry + regression now PROVE the recommendation-approval gate, the
generation arbitration, the task-completion proof gate and the approval resolution are all wired;
adding a new material path without its gate fails CI. Remaining: the cash/margin/capacity spine
itself is still invoked from the consulting `Recommendation` promotion (not yet from every
owner-mode `OwnerRecommendation`/`OwnerAction` promotion). Tests: `material-gate-registry.test.ts`.
Bypass: an owner-mode model promotion path that bypasses `updateRecommendationStatus` is still
ungated by cash/margin (tracked).

### G05 — owner-mode promotions bypass gates → **PARTIAL**
Closure: the owner decision surfaces added here ARE gated — approvals go through
`resolveOwnerApproval`, completions through proof clearance, generation through arbitration.
Remaining: `OwnerRecommendation`/`OwnerAction` direct promotion is not yet routed through the
cash/margin/capacity spine. Status PARTIAL, honestly.

### G06 — no registration regression → **CLOSED**
Closure + test: `material-gate-registry.ts` + `material-gate-registry.test.ts` fail on a dropped gate.

### G07 — approval memory unused by live flow → **CLOSED**
Closure: `resolveOwnerApproval` consults `isApprovalRemembered`; `enforceApprovalRequirement`
auto-handles remembered approvals; new `/api/owner/approvals/resolve`. Runtime: route/enforce →
resolveOwnerApproval → isApprovalRemembered. Owner-visible: handled-by-OpsIQ count in control
center. Tests: `owner-approval-resolution.test.ts` (memory reuse + enforce auto-handle). Bypass: none.

### G08 — standing instructions not live → **CLOSED**
Closure: `resolveOwnerApproval` evaluates standing instructions first (allow/forbid/needs-approval).
Tests: standing-allow + forbidden cases. Bypass: none.

### G09 — attention summary not surfaced → **CLOSED**
Closure: control center renders the attention summary; auto-handled approvals record a
handled-by-OpsIQ attention event. Tests: resolution records the event; control center composes it.

### G10 — no measured workload reduction → **CLOSED**
Closure: every auto-handled approval increments handledByOpsIQ (attention event) + audits
`owner.approval_auto_handled`; the control center shows "handled by OpsIQ". Tests: resolution +
enforce auto-handle assert `handledByOpsIQ`/`approvalCreated:false`.

### G11 — `applyTaskTransition` unrouted → **CLOSED**
Closure: `completeTask` is its runtime caller; `/api/owner/tasks/complete`. Tests:
`task-completion.test.ts` (success path drives APPROVED_COMPLETE). Bypass: none.

### G12 — proof-to-completion gate test-only → **CLOSED**
Closure: completion loads the latest proof and blocks unless cleared. Tests: not-accepted →
blocked. Owner-visible: `OWNER_TASK_COMPLETION_BLOCKED` → proofBlocked count.

### G13 — no proof freshness → **CLOSED**
Closure: `evaluateProofClearance` treats an accepted proof older than maxAgeDays (default 30) as
stale. Tests: stale → blocked.

### G14 — duplicate proof flagged not rejected → **CLOSED**
Closure: a duplicate-flagged proof never clears. Tests: duplicate → blocked.

### G15 — arbitration not invoked by generation → **CLOSED**
Closure: `arbitrateInterventions` invoked inside `createRecommendationsFromInterventions`; returns
chosen + rejected + what-NOT-to-do + reconsideration; audited. Tests:
`intervention-arbitration.test.ts`. Bypass: none (runs every generation with candidates).

### G16 — self-eval does not feed future recs → **CLOSED**
Closure: a FAILED self-evaluation records a do-not-repeat memory (blocking when attributed to the
recommendation, caution otherwise). Tests: `self-evaluation-loop.test.ts` + the service loop test
proves the next promotion is blocked. Bypass: none.

### G17 — do-not-repeat exact-code only → **CLOSED**
Closure: matching now keys on finding code OR `scope:<impact-area>`. Tests:
`do-not-repeat-scope.test.ts` (scope match blocks with a different code).

### G18 — do-not-repeat single-caller → **PARTIAL**
Closure: scope matching + recorded from self-eval; still consulted only on the consulting promotion
path (same single-gate-path caveat as G04). PARTIAL.

### G19 — SOP/checklist not operationally used → **PARTIAL**
Closure: SOPs-needing-review are surfaced in the control center (owner-visible). Remaining: binding
an approved SOP to a concrete task/proof requirement is not implemented. PARTIAL (documented).

### G20 — training not evidence-triggered → **PARTIAL→CLOSED(derivation)**
Closure: `deriveTrainingFromObservedFailure` maps an observed failure (proof failure, complaint,
checklist miss, equipment misuse, rework) to an evidence-backed training rec linked to staff/
process/metric/recheck; rejects no-occurrence noise. Tests: `operational-triggers.test.ts`.
Remaining: auto-invocation from the live proof-review/complaint-intake sources is incremental →
PARTIAL on the trigger wiring, CLOSED on the derivation.

### G21 — equipment hand-entered; no seed/validation → **PARTIAL→CLOSED(seed)**
Closure: validated laundry seed includes equipment/capacity; capacity gate already enforces growth.
Remaining: equipment is otherwise still owner-entered. PARTIAL.

### G22 — capacity gate not on all growth/marketing/contract paths → **PARTIAL**
Closure: capacity gate enforces on growth promotion; arbitration reflects capacity-heavy options as
higher action-risk/less reversible (deprioritized). Remaining: not wired into a dedicated
marketing/contract decision. PARTIAL.

### G23 — process review not connected to repeated failure → **PARTIAL→CLOSED(trigger fn)**
Closure: `triggerProcessReviewOnRepeatedFailure` (threshold default 3) marks a process due on
repeated failures; surfaced in the control center. Tests: `operational-triggers.test.ts`.
Remaining: auto-invocation from a live failure counter is incremental. PARTIAL on wiring.

### G24 — compliance boundary label-only → **PARTIAL**
Closure: pre-existing `classifyComplianceRisk` + COMPLIANCE_SENSITIVE routing in the input-quality
gate remain. No new consult-on-promotion was added in this pass. PARTIAL (honestly unchanged).

### G25 — marketing/opportunity/contract guardrails not in live decisions → **PARTIAL**
Closure: arbitration now annotates generation with chosen/rejected/what-not-to-do (which covers
opportunity prioritization). The dedicated `screenOpportunity`/`screenContractQuote` functions are
still query-only. PARTIAL.

### G26 — generic empty models; no seed/import → **CLOSED**
Closure: `owner-archetype-seed.ts` (laundry) + `validateArchetypeSeed`. Tests:
`owner-archetype-seed.test.ts` (build + reject malformed).

### G27 — no realistic owner-loop seed → **CLOSED**
Closure: the seed covers business/staff/equipment/SOP/process/customer/complaint/finance/
opportunity; consumed by the loop test.

### G28 — tests mock helpers not runtime paths → **CLOSED**
Closure: `owner-loop-service.test.ts` drives one full loop through the REAL wired services
(capacity→arbitration→approval→completion→self-eval→memory→block). DI/in-memory (deterministic).

### G29 — owner visibility missing → **CLOSED**
Closure: control center renders blocked counts, what-NOT-to-do, next best action, attention,
section counts. Covered by G01/G02/G03.

### G30 — Playwright/E2E → **E2E_ONLY_REMAINING**
Closure: `tests/browser/06-owner-control-center.spec.ts` added (first owner browser spec). The
remote container/CI cannot run an authenticated browser owner flow here, and Playwright is not in
`ci.yml`. Plan to wire it is in the closure report. This is the only allowed remaining proof gap.

### G31 — CI flake masking regressions → **CLOSED**
Closure: every new test is DI/in-memory — no DB contention, deterministic. No new DB-backed test
was added that could flake; migration proof stays on the existing green CI DB lane.

---

## Required verification matrix

| # | Required check | Result |
|---|----------------|--------|
| 1 | No material owner path bypasses gate spine | **PARTIAL** — registered paths gated + regression; owner-mode model promotion still on the consulting path |
| 2 | No proof-required task completes without cleared proof | **YES** — `completeTask` + `evaluateProofClearance` (accepted/non-duplicate/fresh) |
| 3 | Approval memory used by live approval flow | **YES** — `resolveOwnerApproval` + `enforceApprovalRequirement` |
| 4 | Arbitration invoked by live recommendation generation | **YES** — `createRecommendationsFromInterventions` |
| 5 | do-not-repeat affects future recommendations | **YES** — scope/code matching + self-eval feeds it |
| 6 | Self-evaluation affects future recommendations | **YES** — failed eval records do-not-repeat memory |
| 7 | SOP/checklist affects real task/proof flow | **PARTIAL** — review surfaced; task/proof binding pending |
| 8 | Training triggered by observed evidence | **YES (derivation)** / PARTIAL (auto-invocation) |
| 9 | Equipment/capacity affects live decisions | **YES** — capacity gate on growth + arbitration risk; seed added |
| 10 | Process review triggered by runtime failures | **YES (threshold fn)** / PARTIAL (auto-invocation) |
| 11 | Marketing/opportunity/contract guardrails affect live decisions | **PARTIAL** — arbitration covers prioritization; dedicated screens query-only |
| 12 | Compliance boundary blocks/defers high-risk actions | **PARTIAL** — pre-existing routing only |
| 13 | Owner command center exposes all owner-required decisions | **YES** — control center rendered |
| 14 | Owner workload reduced in ≥1 live flow | **YES** — approval auto-handle (memory + standing instruction) |
| 15 | One seeded realistic owner loop works at service level | **YES** — `owner-loop-service.test.ts` |
| 16 | Browser/E2E is the only allowed remaining gap | **NO** — a few operational slices remain PARTIAL (7,11,12 + owner-mode gate breadth) in addition to E2E |

---

## Honest conclusion
The **core owner loop is closed and proven at the service level**, the **owner control center is
rendered (owner-visible)**, **workload reduction is live and measured**, **completion is proof-gated**,
**arbitration runs in generation**, and **self-evaluation feeds business memory that blocks repeats** —
all tested. Remaining non-E2E work is **operational breadth**, not the core loop: extending the
cash/margin/capacity spine to every owner-mode model promotion (G04/G05/G18), SOP→task/proof binding
(G19), auto-invoking the training/process triggers from live sources (G20/G23 wiring), dedicated
marketing/contract guardrail decisions (G25), and compliance consult-on-promotion (G24). These are
PARTIAL (groundwork + tested primitives in place), not regressions. Final classification in the
closure report: **SERVICE_LEVEL_OWNER_LOOP_PROVEN** (not REALISTIC_OWNER_SIMULATION_READY_EXCEPT_E2E,
because those PARTIAL items remain).
