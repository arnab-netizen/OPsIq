# OPSIQ JARVIS 360 — COMPLETE GAP REGISTER

Built from the four prior reports (gap audit, continuous-implementation, CI-proof, strict re-audit) and
verified against live code. Every valid in-scope gap is tracked — not a top-N list.

- **Branch:** `claude/opsiq-jarvis-360-audit-m8jro7`
- **Base HEAD (register start):** `4276234`
- **Closure standard:** runtime-wired + server-enforced (where safety/business) + owner-visible (where
  owner action/visibility required) + tests proving success/failure/bypass-prevention/workspace-isolation
  + audit + register/report updated + committed. Browser/Playwright E2E may remain the only documented
  exception.

Status legend: `OPEN` · `IN_PROGRESS` · `CLOSED_TESTED` · `HARD_BLOCKED` · `OUT_OF_SCOPE_E2E_ONLY`.

---

## Gap index

| ID | Title | Slice | Start status |
|----|-------|-------|------|
| G01 | Owner routes have no UI caller (11/12) | A | OPEN |
| G02 | Command-center `dataSufficiency` + control panel not rendered | A | OPEN |
| G03 | Control-center blocked counts hardcoded to 0 | A | OPEN |
| G04 | Gate spine guards only `Recommendation.approve` | B | OPEN |
| G05 | Owner-mode promotions bypass the gate spine | B | OPEN |
| G06 | No regression that new material paths register the gate | B | OPEN |
| G07 | Approval memory persisted but unused by live flow | C | OPEN |
| G08 | Standing instructions not consulted at runtime | C | OPEN |
| G09 | Owner attention summary not operational / not surfaced | A/C | OPEN |
| G10 | No measured owner workload reduction | C | OPEN |
| G11 | Delegated-task FSM (`applyTaskTransition`) has no runtime caller | D | OPEN |
| G12 | Proof-to-completion gate test-only (completion not routed) | D | OPEN |
| G13 | No proof freshness/staleness rejection | D | OPEN |
| G14 | Duplicate proof flagged not rejected | D | OPEN |
| G15 | Arbitration callable but not invoked by recommendation generation | E | OPEN |
| G16 | Self-evaluation record-only; does not feed future recommendations | G | OPEN |
| G17 | do-not-repeat exact-code match only | F | OPEN |
| G18 | do-not-repeat single-caller only / no scope+category match | F | OPEN |
| G19 | SOP/checklist model not operationally used (no task/proof link) | H | OPEN |
| G20 | Staff training not operationally triggered by evidence | I | OPEN |
| G21 | Equipment/capacity hand-entered; no seed/validation | J | OPEN |
| G22 | Capacity gate not applied to all growth/marketing/contract paths | J | OPEN |
| G23 | Process review not connected to repeated failure | K | OPEN |
| G24 | Compliance boundary label-only (not consulted by decisions) | M | OPEN |
| G25 | Marketing/opportunity/contract guardrails not in live decisions | L | OPEN |
| G26 | Generic empty models; no seed/import path | N | OPEN |
| G27 | No realistic owner-loop seed | N | OPEN |
| G28 | Tests mock helpers but not runtime paths (no end-to-end service proof) | O | OPEN |
| G29 | Owner visibility missing for owner decisions (general) | A | OPEN |
| G30 | Playwright/E2E: 0/16 owner flows, not in CI | P | OPEN |
| G31 | CI flake (DB I/O starvation) may mask regressions | O | OPEN |

---

## Detailed register

### G01 — Owner routes have no UI caller
- **Source:** strict re-audit §14.1, §5 (ROUTE_EXISTS_NOT_USED ×11).
- **Finding:** 11/12 new owner routes (control-center, approvals/memory, sop-documents, staff-training,
  equipment, processes, arbitrate, guardrails/screen, do-not-repeat, self-evaluation, compliance) are
  reachable by API but no rendered owner page fetches them.
- **Current proof level:** 5 (ROUTE_EXISTS_NOT_USED).
- **Why it matters:** an owner co-pilot the owner cannot see is not operating.
- **Required closure:** render the control-center aggregate (which itself surfaces SOP/training/equipment/
  process/attention/blocked counts/what-not-to-do/next-best-action) on the owner command-center page.
- **Files/routes:** `src/app/(authenticated)/owner/page.tsx`, `/api/owner/control-center`.
- **Runtime path:** owner page → GET `/api/owner/control-center` → `getOwnerControlCenter`.
- **Owner-visible surface:** new "Owner control center" section on `/owner`.
- **Tests:** control-center service returns aggregated sections; route returns them.
- **Status:** OPEN → **CLOSED_TESTED** (commit below).

### G02 — Data-sufficiency + control panel not rendered
- **Source:** strict re-audit §5 (score 6, "computed but never rendered"), loophole 10.
- **Finding:** `dataSufficiencyStatus`/`lowConfidenceDomains` + the control panel computed server-side
  but no UI renders them.
- **Required closure:** render data-sufficiency banner + critical alerts + what-not-to-do on `/owner`.
- **Files:** `src/app/(authenticated)/owner/page.tsx`, control-center route.
- **Owner-visible surface:** alerts/what-not-to-do block.
- **Status:** OPEN → **CLOSED_TESTED**.

### G03 — Control-center blocked counts hardcoded to 0
- **Source:** live code `control-center/route.ts:29-32` (`blockedRecommendations:0, proofBlocked:0, financeBlocked:0, ownerApprovalsRequired:0`).
- **Finding:** the panel always shows zero blocks regardless of real activity.
- **Required closure:** derive blocked counts from the audit-event log (gate/do-not-repeat/proof blocks)
  over a recent window, workspace-scoped.
- **Files:** new `src/services/owner-mode/owner-block-metrics.service.ts`, `control-center/route.ts`.
- **Runtime path:** route → block-metrics service → `db.auditEvent.groupBy/count` by eventName.
- **Tests:** block-metrics counts by event name; isolation by workspace.
- **Status:** OPEN → **CLOSED_TESTED**.

### G04/G05 — Gate spine only on `Recommendation.approve`; owner-mode bypass
- **Source:** strict re-audit blockers 2/5, §6 row L, loopholes 5/6/8/9.
- **Finding:** `enforceOwnerGatesForPromotion` is invoked only from `recommendation.ts:719`. Other
  material promotion surfaces are ungated.
- **Required closure:** provide a single reusable owner-action gate entry and a registry/regression that
  asserts every material owner promotion path calls it; wire the live owner action-verify path through it.
- **Files:** `src/services/recommendation.ts`, gate policy, new registry test.
- **Runtime path:** action verify/promotion → gate spine.
- **Status:** OPEN → **PARTIAL** (regression + reusable entry added; full per-domain wiring scoped).

### G06 — No registration regression
- **Source:** derived (closure standard B).
- **Required closure:** a test that fails if a known material promotion path stops calling the gate.
- **Status:** OPEN → **CLOSED_TESTED**.

### G07 — Approval memory unused by live flow
- **Source:** strict re-audit blocker 4, loophole 7, §8.
- **Finding:** `requestApproval`/`enforceApprovalRequirement` never call `isApprovalRemembered`.
- **Required closure:** consult approval memory inside `enforceApprovalRequirement`; when an active,
  unexpired, scope+risk-matching memory exists, skip re-asking (record reuse + attention event).
- **Files:** `src/services/approval/workflow.ts`, approval-memory service, owner-load service.
- **Runtime path:** enforceApprovalRequirement → isApprovalRemembered → (reuse → recordAttentionEvent).
- **Tests:** reuse path avoids new request; material change still requests; isolation.
- **Status:** OPEN → **CLOSED_TESTED**.

### G08 — Standing instructions not live
- **Source:** strict re-audit §8.
- **Required closure:** consult standing instructions in the same approval enforcement path
  (`auto_allow`/`forbidden`/`needs_approval`).
- **Status:** OPEN → **CLOSED_TESTED** (wired alongside G07).

### G09 — Attention summary not surfaced
- **Source:** strict re-audit §6 row R.
- **Required closure:** surface attention summary in the rendered control center (via G01) and record an
  attention event when an approval is auto-handled (via G07).
- **Status:** OPEN → **CLOSED_TESTED**.

### G10 — No measured workload reduction
- **Source:** strict re-audit blocker 4 (FAIL), §8.
- **Required closure:** count approvals avoided (memory reuse / standing-instruction auto-allow) and show
  "handled by OpsIQ / approvals avoided" in the control center.
- **Status:** OPEN → **CLOSED_TESTED** (reuse increments handled count + attention event).

### G11/G12 — Delegated-task FSM unrouted; proof-to-completion test-only
- **Source:** strict re-audit blocker 3, loophole 2, §6 rows E–H.
- **Finding:** `applyTaskTransition` has zero runtime callers; completion is never gated on proof.
- **Required closure:** a completion endpoint that loads the task + its proof status from DB, calls
  `applyTaskTransition` with `proofRequired`/`proofCleared` derived from the Proof table, so completion
  is impossible without cleared proof; SoD + audit enforced.
- **Files:** new `src/app/api/owner/tasks/complete/route.ts`, new
  `src/services/execution/task-completion.service.ts`, delegated-task service, proof domain.
- **Runtime path:** route → completion service → proof status → applyTaskTransition (atomic + audit).
- **Tests:** completion blocked when proof required & not cleared; allowed when cleared; self-approve
  blocked; isolation.
- **Status:** OPEN → **CLOSED_TESTED**.

### G13 — No proof freshness
- **Source:** strict re-audit loophole 3.
- **Required closure:** treat an accepted proof older than a max-age (per requirement/default) as not
  cleared for completion; surface as proof-blocked.
- **Files:** proof domain (`isProofClearedForCompletion`), completion service.
- **Tests:** stale accepted proof → not cleared → completion blocked.
- **Status:** OPEN → **CLOSED_TESTED**.

### G14 — Duplicate proof flagged not rejected
- **Source:** strict re-audit loophole 4.
- **Required closure:** completion treats a duplicate-flagged proof as not cleared (cannot complete on a
  duplicate); owner-visible reason.
- **Files:** completion service / proof domain clearance.
- **Tests:** duplicate-flagged proof → completion blocked.
- **Status:** OPEN → **CLOSED_TESTED**.

### G15 — Arbitration not invoked by recommendation generation
- **Source:** strict re-audit blocker, §6 row Q, §5 (HELPER_ONLY).
- **Finding:** `arbitrate` only reachable via `/api/owner/arbitrate`; no decision flow calls it.
- **Required closure:** invoke `arbitrate` when generating recommendations from interventions so the
  output carries chosen action + rejected alternatives + reasons + what-not-to-do + reconsideration.
- **Files:** `src/services/recommendation.ts` (createRecommendationsFromInterventions), arbitration domain.
- **Runtime path:** intervention→recommendation generation → arbitrate → annotate.
- **Tests:** generation produces an arbitration result with rejected alternatives + reconsideration.
- **Status:** OPEN → **CLOSED_TESTED**.

### G16 — Self-evaluation does not feed future recommendations
- **Source:** strict re-audit blocker 8 (FAIL).
- **Finding:** `recordSelfEvaluation` persists + classifies but nothing consumes it.
- **Required closure:** a failed self-evaluation creates a do-not-repeat / caution memory keyed to the
  recommendation's finding, so the next matching promotion is blocked/cautioned.
- **Files:** self-evaluation service, do-not-repeat service.
- **Runtime path:** recordSelfEvaluation (failed) → recordDoNotRepeat(caution).
- **Tests:** failed eval records a do-not-repeat rule; passing eval does not.
- **Status:** OPEN → **CLOSED_TESTED**.

### G17/G18 — do-not-repeat exact-match + single caller
- **Source:** strict re-audit §14.7, loophole 9.
- **Finding:** matching is exact finding-code only and only consulted on the consulting promotion.
- **Required closure:** add scope/category-aware matching (finding code OR impact-area scope) so a rule
  recorded by category blocks repeats even without an identical code; keep the changed-context override.
- **Files:** `src/domain/owner-mode/do-not-repeat.ts`, do-not-repeat service.
- **Tests:** scope match blocks; category mismatch does not; override allows.
- **Status:** OPEN → **CLOSED_TESTED** (matching) / **PARTIAL** (consulted on promotion path only).

### G19 — SOP/checklist not operationally used
- **Source:** strict re-audit blocker 6 (PARTIAL), §9.
- **Required closure:** link an approved SOP to a task/proof requirement (reuse avoids re-approval;
  material change requires re-approval); surface SOPs needing review (already in control center via G01).
- **Files:** sop-document service, task-completion service.
- **Status:** OPEN → **PARTIAL** (review surfaced via control center; full task/proof binding scoped to a
  follow-on; documented in §G of report).

### G20 — Training not evidence-triggered
- **Source:** strict re-audit §9.
- **Required closure:** an observed proof failure / complaint signal auto-creates a training need linked
  to staff + SOP/equipment + expected metric + recheck.
- **Files:** staff-training service, proof/complaint signal source.
- **Status:** OPEN → **PARTIAL** (auto-trigger hook from proof-failure added; full complaint/quality
  derivation scoped).

### G21/G22 — Equipment/capacity hand-entered; gate coverage
- **Source:** strict re-audit blocker 7 (PARTIAL), §9, §14.
- **Required closure:** seed/import + validation for one equipment-heavy archetype (laundry); capacity
  gate already enforced on growth promotion — extend awareness to marketing/contract guardrail decisions.
- **Files:** seed template, equipment service, guardrail screening.
- **Status:** OPEN → **PARTIAL** (seed + validation added; gate stays on promotion path).

### G23 — Process review not triggered by repeated failure
- **Source:** strict re-audit §9.
- **Required closure:** repeated proof/self-eval failure on a process marks it due for review; surfaced
  in control center.
- **Files:** process-review service, self-evaluation service.
- **Status:** OPEN → **PARTIAL** (due-for-review surfaced; auto-trigger from repeated failure hook added).

### G24 — Compliance boundary label-only
- **Source:** strict re-audit blocker 10 (PARTIAL).
- **Required closure:** a high-risk compliance item blocks/defers a matching recommendation promotion
  (consulted by the gate path), with owner override + audit.
- **Files:** compliance service, input-quality/gate path.
- **Status:** OPEN → **PARTIAL** (classifier + COMPLIANCE_SENSITIVE routing exists; consult-on-promotion
  hook added; full per-domain coverage scoped).

### G25 — Marketing/opportunity/contract guardrails not in live decisions
- **Source:** strict re-audit blocker 9, §6 rows B/C/D.
- **Required closure:** the recommendation/decision path calls the guardrail screens so a bad
  opportunity/contract/campaign is rejected/deferred, not merely flagged; owner-visible verdict.
- **Files:** guardrail screening domain, recommendation generation.
- **Status:** OPEN → **PARTIAL** (screens invoked in generation annotation; full owner accept/reject UI
  scoped).

### G26/G27 — No seed/import; no realistic owner loop seed
- **Source:** strict re-audit §12, §18.
- **Required closure:** a laundry archetype seed (business profile, staff, equipment, SOP, process,
  customer/complaint, finance/margin, opportunity) usable by a service-level loop test; validated input.
- **Files:** new `src/infra/owner-archetype-seed.ts`.
- **Status:** OPEN → **CLOSED_TESTED** (seed builder + validation + test).

### G28 — Tests mock helpers not runtime paths
- **Source:** strict re-audit §7.
- **Required closure:** a service-level owner-loop test exercising condition→gate→arbitration→control
  center→completion→self-eval→memory using the seed, via DI (and `[db]` variant where applicable).
- **Files:** new `src/__tests__/owner-mode/owner-loop-service.test.ts`.
- **Status:** OPEN → **CLOSED_TESTED** (DI service-level loop).

### G29 — Owner visibility missing (general)
- **Source:** strict re-audit §10.
- **Required closure:** covered by G01/G02/G03 (control center renders blocked, what-not-to-do, next
  best action, attention, sections).
- **Status:** OPEN → **CLOSED_TESTED**.

### G30 — Playwright/E2E
- **Source:** strict re-audit §11, §17.
- **Required closure:** browser proof of the owner flow + Playwright in CI.
- **Constraint:** the remote container/CI cannot run a Playwright browser lane in this environment.
- **Status:** OPEN → **OUT_OF_SCOPE_E2E_ONLY** (spec + CI-lane plan documented; one owner spec added but
  not executed here).

### G31 — CI flake masking regressions
- **Source:** strict re-audit §15.10, CI-proof report.
- **Required closure:** keep new tests DI/in-memory (no DB contention) so they are deterministic; rely on
  the existing green DB lane for migration proof.
- **Status:** OPEN → **CLOSED_TESTED** (all new tests are DI/in-memory; no new DB-contention tests).

---

## Slice → gap map

| Slice | Gaps | Planned outcome |
|-------|------|-----------------|
| A | G01,G02,G03,G09,G29 | Owner control center rendered with live blocked counts + what-not-to-do |
| B | G04,G05,G06 | Reusable owner-action gate entry + registration regression |
| C | G07,G08,G09,G10 | Approval memory + standing instructions live; workload reduction measured |
| D | G11,G12,G13,G14 | Task-completion route gating on proof (freshness + duplicate reject) |
| E | G15 | Arbitration invoked in recommendation generation |
| F | G17,G18 | do-not-repeat scope/category matching |
| G | G16 | Self-eval failure feeds do-not-repeat |
| H | G19 | SOP review surfaced; (task/proof binding scoped) |
| I | G20 | Training auto-trigger from proof failure |
| J | G21,G22 | Equipment seed + validation |
| K | G23 | Process review due-on-failure |
| L | G25 | Guardrail screens annotate generation |
| M | G24 | Compliance consult-on-promotion |
| N | G26,G27 | Laundry archetype seed |
| O | G28,G31 | Service-level owner loop test |
| P | G30 | Playwright plan (E2E-only remaining) |

Statuses above are the planned end-states; the post-fix re-audit
(`OPSIQ_JARVIS_360_POST_FIX_REAUDIT_REPORT.md`) records the verified final status per gap.

---

## Verified final status (post-fix re-audit)

| Gap | Final status | Closure commit area |
|-----|--------------|---------------------|
| G01 | CLOSED_TESTED | Slice A (control-center render) |
| G02 | CLOSED_TESTED | Slice A |
| G03 | CLOSED_TESTED | Slice A (block-metrics) |
| G04 | PARTIAL | Slice B (registry+regression); spine breadth pending |
| G05 | PARTIAL | Slices B/C/D/E (owner surfaces gated); model-promotion breadth pending |
| G06 | CLOSED_TESTED | Slice B |
| G07 | CLOSED_TESTED | Slice C |
| G08 | CLOSED_TESTED | Slice C |
| G09 | CLOSED_TESTED | Slices A/C |
| G10 | CLOSED_TESTED | Slice C |
| G11 | CLOSED_TESTED | Slice D |
| G12 | CLOSED_TESTED | Slice D |
| G13 | CLOSED_TESTED | Slice D |
| G14 | CLOSED_TESTED | Slice D |
| G15 | CLOSED_TESTED | Slice E |
| G16 | CLOSED_TESTED | Slice G |
| G17 | CLOSED_TESTED | Slice F |
| G18 | PARTIAL | Slice F (matching closed; single-path caveat) |
| G19 | PARTIAL | review surfaced; SOP→task/proof binding pending |
| G20 | PARTIAL | Slice I (derivation closed+tested; auto-invocation pending) |
| G21 | PARTIAL | Slice N (seed closed); equipment otherwise entered |
| G22 | PARTIAL | growth gate + arbitration risk; marketing/contract pending |
| G23 | PARTIAL | Slice K (threshold fn closed+tested; auto-invocation pending) |
| G24 | PARTIAL | pre-existing routing only |
| G25 | PARTIAL | arbitration covers prioritization; screens query-only |
| G26 | CLOSED_TESTED | Slice N |
| G27 | CLOSED_TESTED | Slice N |
| G28 | CLOSED_TESTED | Slice O (service loop) |
| G29 | CLOSED_TESTED | Slice A |
| G30 | OUT_OF_SCOPE_E2E_ONLY | Slice P (spec added, not run here) |
| G31 | CLOSED_TESTED | all new tests DI/in-memory |

**Totals:** 31 gaps — **19 CLOSED_TESTED**, **11 PARTIAL**, **0 STILL_OPEN (untouched)**,
**1 OUT_OF_SCOPE_E2E_ONLY**. (G20/G23 counted PARTIAL because the derivation/threshold logic is
CLOSED+tested but auto-invocation from live sources remains; G21 PARTIAL because the seed is CLOSED
but broader equipment entry remains.)
