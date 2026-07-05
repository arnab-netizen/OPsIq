# Merged Branch Verification Ledger

**main = `59c85033`** now contains all five depth passes. Verified present on main:

| Dependency | Evidence on main |
|-----------|------------------|
| Owner-use blocker closure (atomic audit, proof precheck, human acceptance, SoD, re-eval triggers, shock, error safety, real-business sim, archived artifacts) | branches 1 merged; docs under `docs/remediation/2026-07-04-*` + archive dir |
| Opportunity Decision Envelope (confidence, cash impact, owner-approval gate, stop-loss, reassessment, no fabricated ROI) | `src/domain/owner-mode/opportunity-decision-envelope.ts` |
| Owner Workload Budget (+ /api/owner/now-view) | `src/domain/owner-guidance/owner-workload-budget.ts` + now-view integration |
| Constraint Engine (+ topConstraint in now-view + envelope growth-block gate) | `src/domain/owner-mode/constraint-engine.ts` |
| Profit-Leak Radar (+ topProfitLeak in now-view + envelope cash/margin-leak gate) | `src/domain/owner-mode/profit-leak-radar.ts` |

Baseline on merged main: prisma valid, tsc 0 errors, 94 targeted tests pass. No regression.
