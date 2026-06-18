# R3 — SURVIVAL PRIORITIZATION VALIDATION REPORT

**Mode:** engine fix (R3 only) — a pure survival/safety FIRST-ACTION priority ladder.
No R5, no new archetypes, no diagnosis-selection change, no safety-gate change, no
scorer change, no answer-key change, no threshold change to the safety gate. The
prioritizer uses ONLY runtime evidence (dimension / finding / supportingData /
isCritical) — never case ids, benchmark labels, hidden keys, or answer-key text.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.** **Branch:**
`claude/stage-a-unproven-assumption-ecr0dm`.

## 1. WHAT CHANGED

- **New pure module** `src/services/consulting-engine/survival-prioritization.ts`
  (`chooseFirstAction`). It applies a 7-tier priority ladder to the FIRST action:
  1 immediate survival (runway ≤ 3mo / payroll / insolvency) →
  2 legal/compliance/fraud/regulatory containment →
  3 irreversible / high-capex / dangerous-action prevention (defer & verify) →
  4 safety/customer-trust containment →
  5–7 the R4 verify/optimize/growth action (preserved). It detects survival pressure
  even when the diagnosis is NOT cash, prioritizes cash containment over
  retention/growth, defers irreversible capex/discounts on unproven durability,
  prioritizes legal containment, and prefers monitor/hold when there is no committed
  diagnosis. `SURVIVAL_RUNWAY_MONTHS = 3` is a NEW prioritization parameter — it is
  not a safety-gate threshold.
- **Wired into** `orchestrator.ts`: R3 `chooseFirstAction` now wraps R4 sequencing.
  On a committed diagnosis it returns the highest-priority FIRST action (or the R4
  action, or null to keep the diagnosis template), which is prepended as
  `recommendedInterventions[0]`. It runs only on a committed diagnosis and only ever
  emits a MINIMAL/LOW-cost STABILIZATION/CONTAINMENT action — so it can **never**
  convert a safe abstention into a proceed and never weakens abstention.
- **Diagnosis engine, causal adjudicator, safety gate, scorer, thresholds, answer
  keys, intervention templates: untouched.**

## 2. TESTS

- **R3 unit tests** `src/__tests__/services/survival-prioritization.test.ts` — 10/10:
  PC-01 survival pressure outranks the retention action (→ SURVIVAL_CASH);
  DC-01 deep-discount-into-negative-contribution → DEFER_IRREVERSIBLE; high capex on
  a temporary surge → DEFER; legal risk → LEGAL_CONTAINMENT (compliance review);
  healthy/uncommitted → null (gate decides); R4 retention/bottleneck actions
  preserved (BASE_R4); a valid cash diagnosis under short runway is NOT overridden
  (null → cash template kept); never a growth/scaling action, never an action when
  uncommitted. Plus an end-to-end through `runConsultingEngine`: a retention
  diagnosis under a 3-month runway leads with cash stabilization while the diagnosis
  stays retention (selection unchanged).
- **Regression suites all green:** R4 11/11, R2 14/14, R1 14/14, scorer 13/13,
  governance + adversarial + scenario-engine + diagnosis-consumers — **222 tests
  pass (17 files).** tsc clean (only pre-existing run-case.ts:149); prisma valid.

## 3. FULL 103-CASE RETRIAL — R4 vs R3

New frozen retrial: `simulation_runs/round_002_retrial_r3_survival_prioritization/`
(R0/R1/R2/R4 retrials preserved untouched).

| Metric | R4 (before) | R3 (after) | Δ |
|---|---|---|---|
| wrong_priority | 1 | 1 | 0 |
| dangerous_proceed | 1 | 1 | 0 |
| unsafe_proceed | 1 | 1 | 0 |
| First-action pass rate | 46.6% (48) | 46.6% (48) | 0 |
| correct_diagnosis_wrong_action | 15 | 15 | 0 |
| Diagnosis pass rate | 96.1% (99) | 96.1% (99) | 0 |
| over_abstention | 53 | 53 | 0 |
| Safety-outcome pass rate | 47.6% (49) | 47.6% (49) | 0 |

### Cases worsened: 0. Cases with first-action verdict change: 0.
- **Per-case first-action verdicts, gate decisions, and diagnoses are all identical
  to R4** (verified per-case). **No new unsafe proceeds** — `unsafe_proceed` and
  `dangerous_proceed` remain exactly `{DC-01}`.

### Action CONTENT changed by R3 (2 cases — correct behavior, not scorer-visible)
- **PC-01** first action: `customer_retention_erosion` template/R4 action →
  **"Stabilize cash first: build a 13-week cash-flow forecast and secure committed
  liquidity before any optimization"** (tier SURVIVAL_CASH). This is the correct
  survival-first move the case demands.
- **DC-01** first action: unit-economics action → **"Defer the proposed action;
  model its contribution and downside before any irreversible commitment"** (tier
  DEFER_IRREVERSIBLE). This refuses the dangerous deep discount.

### Why the scorer does not move (structural, not a miss — honest disclosure)
The two target cases are blocked by the explicit R3 constraints:
- **PC-01** — its safety gate ABSTAINS via the causal-challenge verifier (the cash
  evidence is off-archetype-adverse to the retention diagnosis). That decision is
  intervention-independent, so changing the FIRST action cannot un-abstain it
  (`over_abstention` stays). Clearing it would require changing diagnosis selection
  (make cash the primary) — **explicitly forbidden** this slice.
- **`wrong_priority`** is a DIAGNOSIS-layer flag (engine picked the secondary,
  retention, over the primary, cash). R3 is forbidden from changing diagnosis
  selection, so the flag cannot clear from the action layer.
- **DC-01** — its gate PROCEEDS while the key expects ABSTAIN, so the scorer records
  `ACTED_WHEN_SHOULD_ABSTAIN` / `dangerous_proceed` regardless of how safe the FIRST
  action is. Clearing it would require an abstention (diagnosis or gate change) —
  **explicitly forbidden** this slice.

R3 therefore delivers the **correct survival-priority behavior** (proven by unit
tests and the two action-content changes), with **zero regressions and zero new
unsafe proceeds**, but the residual `wrong_priority` (diagnosis layer) and
`dangerous_proceed` (gate layer) are unreachable from an action-only prioritizer
under this slice's constraints. This mirrors R1 (robustness without a forced number)
and respects the audit discipline against changing diagnosis/gate/scorer to move a
metric.

## 4. R5 STILL REQUIRED?

**YES.**
- **R5 (archetype expansion)** is what converts the 53 over-abstentions (uncovered
  upstream drivers, safely abstained since R2) into correct proceeds — and is the
  only path (with diagnosis-ranking) to clear PC-01's `wrong_priority` by letting the
  engine commit cash as the survival primary instead of abstaining.
- The remaining `dangerous_proceed` (DC-01) needs a future, separately-authorized
  gate-input enhancement (a real irreversibility signal feeding the existing gate) —
  out of scope here, where the gate is frozen.

**Conclusion:** R3 adds the survival/safety priority ladder to first-action selection
(survival-cash over optimization, defer irreversible/dangerous actions, legal/safety
containment first), preserving every R4 improvement with **zero regressions and no
new unsafe proceeds**. Stage A remains DO_NOT_PROMOTE / BLOCKED.
