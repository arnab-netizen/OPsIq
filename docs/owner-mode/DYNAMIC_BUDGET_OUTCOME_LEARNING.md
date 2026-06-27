# Dynamic Budget — Outcome Learning Loop

Makes OpsIQ learn from budget recommendation outcomes: compare expected vs actual impact,
classify the cause of success/failure, decide what to do with the recommendation next, and
record how confidence should move. The system no longer just generates actions — it learns
from how they turn out.

Owner Mode only. **Reuses** action-linkage (`updateBudgetAction`), the `FundedInitiativeOutcome`
store, the existing `classifyInitiativeOutcome` engine, and the audit ledger — **no duplicate
learning engine, no schema change.** Gate 10 / `execution.md` / billing / stripe untouched.
**Not OWNER_MODE_READY.**

## What was implemented
- **Pure learning classifier** `src/domain/owner-budget/outcome-learning.ts`
  (`classifyBudgetOutcome`): wraps `classifyInitiativeOutcome` and adds
  - **disposition**: `repeat | modify | escalate | block`
  - **confidenceImpact**: `raise | maintain | lower_recommendation | lower_data`
  - prior-failure awareness (a recommendation that already failed escalates, then blocks).
- **Wiring** in `updateBudgetAction` completion: counts prior FAILED outcomes for the same
  recommendation (initiative label), classifies the outcome from the owner-supplied
  expected/actual impact + cause flags (external factor / owner override), persists a
  `FundedInitiativeOutcome` (outcome / nextStep / safeForLearning / expected / actual + a
  note carrying disposition, confidenceImpact, priorFailures, reason), stamps
  `action.outcomeClass`, and audits with the disposition/confidence impact.
- **Validation** (`budgetActionUpdateSchema`) extended with `expectedImpact`, `actualImpact`,
  `externalFactor`, `ownerOverridden` (so the existing PATCH route records outcomes).

## Learning rules (honest attribution)
| Outcome | Trigger | Disposition | Confidence impact |
|---|---|---|---|
| SUCCESS | actual ≥ ~90% of expected | repeat (scale) | raise |
| PARTIAL | actual ≥ ~50% | modify | maintain |
| FAILED (first) | actual well below expected | escalate | lower **recommendation** |
| FAILED (repeat) | failed before | **block** | lower recommendation |
| UNVERIFIED | no/incomplete impact data | modify | lower **data** confidence |
| OVERRIDDEN | owner overrode advice | modify | maintain (not the rec's fault) |
| EXTERNAL_FACTOR | external event | modify | maintain (not attributable) |
| CANCELLED | cancelled | block | maintain |

A completion **without evidence is refused** by the shared FSM, so a "couldn't-complete"
action records no failure — a bad recommendation is never inferred from missing proof.

## Tests
- **9 unit** (`outcome-learning.test.ts`): every outcome → disposition/confidence; repeated
  failure → block; missing-data → lower_data; override/external → maintain; determinism.
- **8 `[db]`** (`outcome-learning.service.db.test.ts`, through real `updateBudgetAction`):
  success → SUCCESS+raise+safeForLearning; poor result → FAILED+escalate+lower_recommendation;
  repeated failure → block; missing impact → UNVERIFIED+lower_data; owner-override → OVERRIDDEN+maintain;
  no-evidence completion refused (no failure recorded); cross-workspace update blocked
  (record unchanged); completion audits the disposition.
- Regression owner-budget + services **218/218** (incl. action-linkage suite). `tsc` 0;
  `lint:ratchet` PASS. No schema.

## What remains / honest scope
- The recorded outcome + disposition is available to the next reassessment; `updateBudgetAction`
  does NOT call `reassessBudget` directly (that would create a budget↔action-link import cycle) —
  it records the learning + audit signal, which the reassessment/UI consume. Documented.
- "Successful collection-first reduces working-capital risk" is realised when the underlying
  receivable is marked collected (the ageing engine already excludes collected/paid items); the
  learning loop records the SUCCESS + raise for that action.

## Classification
`DYNAMIC_BUDGET_OUTCOME_LEARNING_DB_PROVEN` — the learning loop records outcome/cause/
disposition/confidence-impact through the real DB completion path, proven by unit + `[db]`
tests. **Not OWNER_MODE_READY.**
