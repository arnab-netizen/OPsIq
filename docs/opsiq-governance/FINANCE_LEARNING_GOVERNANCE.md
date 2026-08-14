# Finance Closed-Loop Learning — Governance Decision Record

**Decision date:** 2026-08-14  
**Decision authority:** Owner (explicit written decision)  
**Immutable:** Yes — this record must not be modified without a new explicit owner decision.

---

## Governance Rule (Verbatim)

> An `OwnerFinanceOutcomeSignal` MUST NOT change owner-facing recommendation, diagnosis confidence, ranking, prioritization, action selection, or any other adaptive behavioral output **until the corresponding governed `ControlledLearningCandidate` has been human-approved through the canonical promotion path** (`promotionLocked = true`).

---

## What Is Permitted Before CLC Approval

A verified outcome signal MAY be persisted immediately for:
- Audit trail (immutable record of what happened)
- Evidence (factual `reachedTarget` value)
- Measurement (operational visibility for the owner)
- Reconciliation (gap sweep to recover from bridge failures)
- Human review queue population (governance inbox)

---

## What Is Prohibited Before CLC Approval

A signal MUST NOT influence:
- Recommendation ranking (`planFinanceActionsFromDiagnosis`)
- Diagnosis confidence scores (`getFinanceEffectivenessMap` effectiveness modifier)
- Action prioritization (Bayesian modifier applied in `actions.ts`)
- Any other adaptive behavioral output

---

## Canonical Eligibility Gate

**File:** `src/services/owner-finance/effectiveness.service.ts`  
**Function:** `getFinanceEffectivenessMap`

Two-step eligibility filter applied on every read:

1. **Step 1 — structural linkage gate:** Exclude all signals where `learningCandidateId IS NULL`.
   Signals with no linked CLC can never be human-approved and are permanently excluded.

2. **Step 2 — governance approval gate:** From remaining signals, retain only those whose
   `ControlledLearningCandidate` has `promotionLocked = true`.

Only signals passing both steps contribute to the Bayesian effectiveness sample.

---

## Canonical Promotion State

`promotionLocked = true` on `ControlledLearningCandidate` is the ONE canonical promotion indicator.

- Set exclusively by `promoteLearningCandidate()` in `controlled-learning-candidate.service.ts`
- Never reverted after being set (enforced by `assertCandidateImmutable()`)
- Requires: human reviewer ID + human reviewer timestamp (SEC-005)
- `eligibilityStatus` must be `LEARNING_ELIGIBLE_VERIFIED_OUTCOME` or `LEARNING_ELIGIBLE_HUMAN_REVIEWED`

**Do NOT use** `humanReviewed`, `promotedAt`, `reviewerId`, or any other field as the promotion signal. `promotionLocked = true` is the only gate.

---

## Hard Rules (Non-Overridable)

| Rule | Location | Consequence of violation |
|------|----------|-------------------------|
| Critical findings never modified | `modifierAllowedForSeverity("critical") = false` in `outcome-signals.ts` | Zero modifier always applied for critical severity |
| `MIN_SAMPLE = 3` cold-start guard | `outcome-signals.ts:14` | modifier=0 for n < 3 even if all approved |
| Workspace isolation | `getFinanceEffectivenessMap(workspaceId, ...)` | Signal query is always scoped to the caller's workspaceId |
| Signal evidence is immutable | `OwnerFinanceOutcomeSignal.reachedTarget` is write-once | CLC promotion state changes eligibility, not the factual evidence |
| No auto-approve | Only `promoteLearningCandidate()` sets `promotionLocked=true` | The bridge never auto-promotes; promotion requires a human actor |

---

## Signal Creation Policy

- Signals MAY be created immediately when a terminal verification is recorded.
- Signals are created by `bridgeVerificationToLearning()` (called from `verification.service.ts`).
- A scheduled reconciler (`reconcileMissingFinanceLearningSignals`) recovers any gaps.
- Signal creation is idempotent: the `@@unique([workspaceId, verificationId])` constraint ensures at most one signal per verification.
- CLC creation failure is non-fatal: the signal is persisted regardless.

---

## Permanent Test Coverage

| Test file | Type | Scenarios covered |
|-----------|------|-------------------|
| `src/__tests__/services/owner-finance/effectiveness-eligibility.db.test.ts` | DB (PostgreSQL) | Scenarios 1–6: null CLC, non-promoted, partial promotion, full promotion, cross-workspace, evidence immutability |
| `src/__tests__/services/owner-finance/learning-bridge-concurrency.db.test.ts` | DB (PostgreSQL) | A: bridge vs bridge, B: bridge vs reconcile, C: repeated reconcile |
| `src/__tests__/services/owner-finance/learning-bridge-p1.test.ts` | Unit (mock) | Bayesian calc, MIN_SAMPLE guard, critical severity hard rule, modifier math |
| `src/__tests__/services/owner-finance/learning-bridge-p2-integration.test.ts` | Integration (mock) | 6-step reconciliation, workspace dispatch, gap detection, cron shape |

---

## Lane B Coverage

Lane B (`lane-b-db-test.yml`) runs the DB-gated tests with pattern:

```
services/owner-finance/effectiveness-eligibility.db.test.ts
services/owner-finance/learning-bridge-concurrency.db.test.ts
```

Both files are tagged `[db]` and are excluded from `npm test` without `TEST_WITH_DB=true`. Lane B sets `TEST_WITH_DB=true` and runs `npx prisma migrate deploy` first.

Recommended Lane B test_pattern for governance closure:

```
src/__tests__/services/owner-finance/(effectiveness-eligibility|learning-bridge-concurrency)\.db\.test\.ts
```

---

## Reviewer Note

This document is a governance record, not implementation documentation. The implementation must conform to this record. Any deviation — even for performance or convenience — constitutes a governance violation and must be escalated to the owner before implementation.
