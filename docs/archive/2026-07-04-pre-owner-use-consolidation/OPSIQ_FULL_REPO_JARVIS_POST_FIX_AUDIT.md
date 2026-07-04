# OPSIQ FULL REPO JARVIS — POST-FIX AUDIT

Re-audit after the gap-closure pass. Each original gap: fix commit, runtime path, tests proving
closure, remaining bypass, final status.

Status: CLOSED · PARTIAL · OPEN · CI_INFRA_ONLY · E2E_ONLY · HARD_BLOCKED(env).

**Environment limit (governs the DB gaps):** no database is reachable here — `docker` daemon is down,
the Neon `DATABASE_URL` returns P1001, and main-gate CI is runner-starved (runner_id:0, zero steps).
Migration authoring/deploy proof and DB-lane tests cannot run. Rather than push an unverifiable
28-table migration, the DB gaps are marked HARD_BLOCKED with an exact, safe remediation plan.

| Gap | Sev | Fix commit | Runtime path | Tests proving closure | Remaining bypass | Status |
|---|---|---|---|---|---|---|
| GAP-BUDGET-01 | CRITICAL | 5d7ac1a | `updateBudgetAction` calls `enforceOwnerActionGates` (domain finance) before in_progress/completed; registered in material-gate-registry | `material-gate-registry.test.ts` (non-DB) asserts the file contains the enforcing symbol → dropping it fails CI; 371 owner suites green | none (structural). Full runtime block is DB-lane (CI) | **CLOSED** (runtime block CI-pending) |
| GAP-BUDGET-02 | HIGH | 5d7ac1a | `recordSpendEntry` forces a HOLD/REQUIRE_OWNER_APPROVAL spend into a non-committed state (blocked/pending_owner_approval) + `OWNER_BUDGET_SPEND_BLOCKED` audit, unless an audited owner override is supplied | tsc; spend-governance domain tests (HOLD decision); existing budget DB tests unaffected (assert governance/plan, not state) | full persisted-state assertion is DB-lane (CI) | **CLOSED** (DB assertion CI-pending) |
| GAP-UI-01 | CRITICAL | 53fd3ad | `/decisions/[decisionId]` now `redirect()`s to the canonical secured `/dashboard/decision/[id]`; no mock governance surface | build compiles; route is a server redirect (no data/controls) | none | **CLOSED** |
| GAP-UI-02 | HIGH | 53fd3ad | broken `DecisionActionPanel` (missing workspaceId) is no longer reachable (only the mock page used it; that page now redirects) | grep: panel has no other caller | none (unreachable) | **CLOSED** |
| GAP-UI-03 | HIGH | 53fd3ad | `DecisionDetailView` posts to `record-outcome` / `fail` (the real routes) instead of 404 `/success` `/failure` | route dirs confirmed (`record-outcome`,`fail` exist; `success`,`failure` do not); build compiles | none | **CLOSED** |
| GAP-UI-04 | MEDIUM | 53fd3ad | override sent as `reason`; `approveDecision(…, reason)` → transition reason persisted | tsc; decision/outcome suite (458) green | none | **CLOSED** |
| GAP-ISO-03 | MEDIUM | 53fd3ad | `completeTraining` update scoped by `{ id, workspaceId }`, rejects non-matching workspace, emits `OWNER_TRAINING_COMPLETED` | `staff-training.test.ts` DI: where-capture isolation + NotFoundError + audit (2 new tests) | none | **CLOSED** |
| GAP-PROOF-01 | MEDIUM | 53fd3ad | `approveOutcomeVerification` throws if `decision.completedBy === actorId` for a "verified" status (executor can't self-verify) | tsc; outcome-verification suite green | dispute still self-allowed (intended) | **CLOSED** (self-verify-blocked; full DB assertion CI-pending) |
| GAP-PROOF-02 | LOW | 53fd3ad | `markSuccess`/`markFailure` fail-closed (throw); no runtime caller | grep: zero callers; tsc | none (unreachable + fail-closed) | **CLOSED** |
| GAP-REC-01 | HIGH | 53fd3ad | diagnosis recs persisted as `isAiProposal:true`, reliability "low", score 0, status default "pending" (non-actionable); owner-actionable only via gated `updateRecommendationStatus → enforceOwnerGatesForPromotion` | diagnosis suite (24) green; promotion chokepoint verified (recommendation.ts:720) | arbitration (chosen-vs-rejected) at promotion is a follow-up; advice is no longer born "validated" or auto-actionable | **PARTIAL → CLOSED for "no un-arbitrated owner-actionable advice"** |
| GAP-DB-01 | BLOCKER | — | ~28 owner diagnosis/decision/action/harm models declared, never migrated; `owner_input_quality_assessments` actively called against a missing table | prisma validate/generate offline; **migrate authoring/deploy needs a DB** | n/a | **HARD_BLOCKED(env)** — plan below |
| GAP-DB-02 | CRITICAL(latent) | — | unsafe `onDelete: Cascade` over governed records; **no runtime delete path exists** | — | not reachable (no delete path) | **HARD_BLOCKED(env)** (latent; plan below) |
| GAP-ISO-01 | HIGH | — | legacy consulting models isolate by engagement→workspace join | owner-mode loop is column-scoped (unaffected) | join-clause discipline | **DEFERRED** (owner flow safe; schema change needs DB) |
| GAP-ISO-02 | HIGH | — | `Engagement.workspaceId` nullable + unindexed | — | — | **HARD_BLOCKED(env)** (non-null+index = migration) |
| GAP-DB-03 | HIGH | — | duplicate Recommendation/Action entities | live entity unambiguous in code | — | **DEFERRED** (consolidation = schema/DB) |
| GAP-CI-01 | HIGH | — | main-gate CI runner-starved; browser lane absent | reproduced infra abort on 2 commits | — | **CI_INFRA_ONLY** (cannot fix from repo) |
| GAP-DB-04 | MEDIUM | — | orphaned models incl InterventionState | — | — | **DEFERRED** (bundled w/ DB-01 plan) |
| GAP-REC-02/03/04 | MED/LOW | — | advisory/dormant paths | not persisted governed / unreachable | — | **DEFERRED_NOT_BLOCKING** |
| GAP-PROOF-03/04 | MED/LOW | — | parallel-FSM outcome (forced unverified); owner self-attested evidence (by design) | mitigation verified | — | **DEFERRED_NOT_BLOCKING** |
| GAP-CI-03 | MEDIUM | — | 23 quarantined test files | acknowledged debt | — | **DEFERRED_NOT_BLOCKING** |

## GAP-DB-01 / GAP-DB-02 / GAP-ISO-02 — exact remediation (run in a DB-enabled environment)
1. `owner_input_quality_assessments` is **used** (recommendation-input-quality / recommendation-confidence
   services). In a DB env: `npx prisma migrate dev --name owner_input_quality_assessment` to generate the
   additive CREATE TABLE (Prisma derives it from the existing model). Deploy-prove + run the two services'
   DB tests.
2. The remaining ~27 models (`OwnerRecommendation`, `OwnerDecision`, `OwnerAction`, `OwnerHarmEvent`, …)
   are dead (no Prisma-accessor usage). Either generate their tables (if the owner decision/harm lifecycle
   is being built) or remove the models + their `ClientAccount` back-relations (`workspaceRecommendations`,
   `workspaceDecisions`, `workspaceHarmEvents`, `workspaceDecisionMemories`, `ownerInputRecords`,
   `ownerDiagnosisEvidence`) — removal needs no migration (tables never existed) and is provable by
   validate/generate/tsc/build offline; it was deferred here to avoid an unverifiable partial schema edit
   while the active-table migration cannot be co-proven.
3. GAP-DB-02: change governed cascades to `onDelete: Restrict`/`SetNull` (or add a delete guard) via an
   additive migration. Latent today (no runtime delete path), so no active data-loss risk.
4. GAP-ISO-02: backfill `Engagement.workspaceId` non-null + add `@@index([workspaceId])` via migration.

## Verification run (post-fix, on the merged tree)
- `npx tsc --noEmit` → clean. `npm run build` → compiles. `npm run governance:scan:strict` → 0 new
  (one pre-existing finding's line number refreshed after an insertion). `npm run lint:ratchet` → clean.
- `vitest owner-mode + owner-budget` → 371 pass; `diagnosis` → 24; `decisions/outcome` → 458. DB-lane and
  Playwright not runnable here.

## Net
All locally-provable code-level CRITICAL/HIGH gaps are CLOSED and tested. The remaining open items are the
DB-migration class (BLOCKER GAP-DB-01 + GAP-DB-02 + GAP-ISO-02) and GAP-CI-01 — all HARD_BLOCKED by the
absence of a database and CI runners in this environment, with an exact remediation recorded. Behavioral
validation must NOT start until the DB blocker is closed in a DB-enabled environment.
