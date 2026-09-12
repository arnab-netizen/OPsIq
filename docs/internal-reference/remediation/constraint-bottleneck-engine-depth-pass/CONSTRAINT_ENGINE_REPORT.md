# Constraint / Bottleneck Engine — Report

**Classification:** `CONSTRAINT_ENGINE_REAL_AND_OWNER_VISIBLE`
**Code:** `src/domain/owner-mode/constraint-engine.ts` (pure), integrated in
`src/services/owner-guidance/owner-now-view.service.ts`, surfaced via `GET /api/owner/now-view`.
**Opportunity integration:** `src/domain/owner-mode/opportunity-decision-envelope.ts`.
**Tests:** `src/__tests__/owner-mode/constraint-engine.test.ts` (15),
`src/__tests__/owner-mode/constraint-engine-simulation.db.test.ts` (3 DB).

## What it answers
"What is limiting this business MOST right now?" — the single **binding** constraint (Theory of
Constraints), not a flood of issues.

## Constraint types
`CASH, OWNER, MANAGER, QUALITY, CAPACITY, EQUIPMENT, DELIVERY, PRICING, STAFF,
CUSTOMER_RETENTION, B2B_ACCOUNT, DEMAND, COMPLIANCE_OR_LOCAL_VERIFICATION, STARTUP_VALIDATION,
DATA_INSUFFICIENT`.

## Finding shape (all 18 required fields)
`workspaceId, constraintType, domain, severity, confidence, evidence[], missingData[], businessImpact,
ownerExplanation, recommendedAction, ownerApprovalRequired, riskLevel, cashImpact, operationalBurden,
successMetric, stopLoss, reassessmentTrigger, evaluatedAt` (+ internal `bindingScore` for deterministic
ranking).

## Determinism
Ranked by `severityWeight × + typePriority`. `CASH` (survival) outranks all; ties break by a fixed type
order. Same signals → same top constraint and `bindingScore` (tested; and re-verified through two live
now-view calls in the DB simulation).

## Honesty / missing data
- Consumes the **same live, workspace-scoped signals** the Owner Now View already assembles — no parallel
  data source, no static mock.
- **Fabricates nothing.** When cash/margin snapshots are absent, the raw state passes through as `null`
  and the engine returns `DATA_INSUFFICIENT` with the exact missing data — it never invents a cash crisis.
  (This pass fixed a real bug where `ctx.cashSafe === false` from *missing* data would have mapped to a
  fabricated `CRITICAL` cash constraint; `assembleGuidanceContext` now returns the raw survival states.)
- Event-only signals (delivery delay, discount leak, major client loss, startup validation) are supported
  and unit-tested, but are **not** fabricated from now-view snapshots — they fire only when a real source
  provides them.

## Integration (not a disconnected engine)
1. **Owner Now View** — exposes exactly one `topConstraint` in the payload (`/api/owner/now-view`).
2. **Owner Workload Budget** — supplies the OWNER-constraint signal (owner bottleneck items, owner-only
   pending decisions/reviews).
3. **Opportunity decision envelope** — when a growth-blocking constraint
   (`CASH|CAPACITY|QUALITY|OWNER|EQUIPMENT|DELIVERY`) is active, an expansion opportunity is **owner-gated**
   and its upside band **capped** (never `STRONG`). You do not scale into a bottleneck.
4. **Reassessment** — the now-view recomputes constraints on each call, so state changes driven by
   re-evaluation/shock (e.g. major client loss) change the binding constraint on the next read.

## Owner-visible output
For the top constraint the owner sees: what's holding the business back, why it matters, the evidence,
the specific next action, whether owner approval is needed, the success metric, and the reassessment
trigger — no raw logs, no generic advice.
