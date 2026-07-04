# R4 — ACTION SEQUENCING VALIDATION REPORT

**Mode:** engine fix (R4 only) — a pure action-sequencing layer that chooses a
constraint-safe, reversible, verify-first FIRST action. No R3, no R5, no new
archetypes, no diagnosis-selection change, no safety-gate change, no scorer change,
no answer-key change, no threshold change. The sequencer uses ONLY runtime evidence
(dimension / finding / supportingData / isCritical) — never case ids, benchmark
labels, hidden keys, or answer-key text. **Not a Stage A pass claim. Stage A remains
DO_NOT_PROMOTE / BLOCKED.** **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.

## 1. WHAT CHANGED

- **New pure module** `src/services/consulting-engine/action-sequencing.ts`
  (`sequenceFirstAction`, `overridesTemplate`, `buildFirstActionIntervention`).
  Given the committed diagnosis + evidence it ranks the FIRST move by the required
  order — survival/cash urgency, safety/legal/compliance, reversibility, owner
  constraints, time-to-impact, dependency order, verify-before-spend, avoid
  irreversible harm — and returns a low-cost diagnostic / stabilization /
  containment / compliance-review / constraint-safe first action.
- **Wired into** `orchestrator.ts` between prioritization and the decision memo: on
  a committed diagnosis where the template first action is sequencing-wrong, the
  sequenced action is prepended as `recommendedInterventions[0]` (the existing
  template interventions are preserved as the follow-on steps). It runs only on a
  committed diagnosis and only ever emits a MINIMAL/LOW-cost STABILIZATION/
  CONTAINMENT action — so it can never make the engine proceed where it would
  otherwise abstain, and never weakens abstention.
- **Scoping guard:** R4 overrides ONLY the two diagnosis families whose template
  first action was sequencing-wrong (`customer_retention_erosion` →
  "launch loyalty program"; `operational_bottleneck` → "implement waitlist"), plus
  a cross-cutting legal-review precedence. cash / unit-economics / margin / quality
  keep their existing verify/stabilize-first templates, so they cannot regress.
- **Diagnosis engine, causal adjudicator, safety gate, scorer, thresholds, answer
  keys: untouched.** (The only diagnosis-engine-adjacent change is the orchestrator
  reading the committed diagnosis to pass it into action selection.)

### Sequencing rules implemented
- legal/compliance review before operational execution when legal risk exists;
- stabilize cash before growth optimization (cash → 13-week forecast/freeze);
- verify root cause before major spend (retention → cohort churn-driver analysis;
  bottleneck → time study/scheduling diagnostic before capacity/hiring/capex);
- reversible diagnostic before irreversible action; containment before scaling;
- constraint-safe over ideal-but-infeasible (budget-constrained bottleneck →
  low-cost scheduling/process; staff-constrained retention → low-headcount
  automated onboarding/win-back), with the binding constraint read from evidence
  (`capitalAvailable: 0`, `hireableHeadcount: 0`, or explicit text);
- monitor/hold when healthy, gather-evidence when ambiguous (no committed diagnosis).

## 2. TESTS

- **R4 unit tests** `src/__tests__/services/action-sequencing.test.ts` — 11/11:
  retention verifies the driver (not a loyalty program); cash → cash-stabilization;
  bottleneck → reversible time study (never capex); legal risk → compliance review;
  healthy → monitor/hold; ambiguous → gather evidence; budget constraint → low-cost
  constraint-safe fix; staff constraint → low-headcount motion; cash/margin/unit-
  econ/quality templates NOT overridden; never emits a growth/scaling first action
  (all MINIMAL/LOW cost, never GROWTH_ENABLEMENT). Plus an end-to-end through
  `runConsultingEngine`: a retention case now leads with a churn-driver analysis.
- **Regression suites all green:** scorer 13/13, R2 14/14, R1 14/14, governance +
  adversarial + diagnosis-consumers + scenario-engine — 176 + 36 pass; consulting
  output consumers 24/24. tsc clean (only pre-existing run-case.ts:149); prisma valid.

## 3. FULL 103-CASE RETRIAL — R2 vs R4

New frozen retrial: `simulation_runs/round_002_retrial_r4_action_sequencing/`
(R0 `…_current/`, R1 `…_r1_lexical_hardening/`, R2 `…_r2_causal_adjudication/`
preserved untouched).

| Metric | R2 (before) | R4 (after) | Δ |
|---|---|---|---|
| **First-action pass rate** | 34.0% (35/103) | **46.6% (48/103)** | **+13** |
| **correct_diagnosis_wrong_action** | 28 | **15** | **−13** |
| Diagnosis pass rate | 96.1% (99) | 96.1% (99) | 0 |
| false_root_cause | 0 | 0 | 0 |
| over_abstention | 53 | 53 | 0 |
| unsafe_proceed | 1 | 1 | 0 |
| dangerous_proceed | 1 | 1 | 0 |
| Safety-outcome pass rate | 47.6% (49) | 47.6% (49) | 0 |
| Abstention recall | 95.7% (22/23) | 95.7% (22/23) | 0 |
| Owner-constraint fit | 100% | 100% | 0 |

### Cases improved (13, first-action FAIL→PASS)
Retention: `D07-S01`, `D07-S02`, `MK-02`, `MK-07`, `MK-10`, `RC-07`, `HC-04`
(staff-constrained variant). Bottleneck: `D09-S01`, `D09-S02`, `MC-01`, `MC-03`,
`PC-08`, `HC-01` (budget-constrained variant).

### Cases worsened: 0
**No first-action regressions.** Diagnosis verdicts unchanged (99/4). Gate decisions
(PROCEED/ABSTAIN) **identical to R2 on every case** — verified per-case — so the
diagnosis, over-abstention, evidence-use, constraint-fit, safety, and abstention
axes are all unchanged. **No new unsafe proceeds**: `unsafe_proceed` and
`dangerous_proceed` remain exactly `{DC-01}` (DC-01 is a gate/R3 concern — the
engine proceeds on a delayed-consequence action; R4 does not touch the gate).

### Why the gate/safety axes are unchanged (not a miss)
The sequenced first action is always a MINIMAL/LOW-cost diagnostic, so the safety
adapter's constraint-alignment never flips (no case hinged on it), and the causal-
challenge / confidence / evidence-support inputs are intervention-independent — so
no abstain/proceed decision changes. R4 strictly improves WHAT the engine recommends
when it proceeds; it does not change WHETHER it proceeds.

## 4. R3 / R5 STILL REQUIRED?

**YES.**
- **R3 (survival prioritization)** still owns `wrong_priority` (PC-01) and the
  delayed-consequence dangerous proceed (DC-01, `ACTED_WHEN_SHOULD_ABSTAIN`) — those
  need urgency-aware ranking / a stronger first-action-vs-abstain decision, not the
  action-content fix R4 provides.
- **R5 (archetype expansion)** is what converts the 53 over-abstentions (uncovered
  upstream drivers, now safely abstained after R2) into correct proceeds — only
  after R2, which is done.
- The remaining first-action failures (55) are dominated by `NO_ACTION_DELIVERED`
  (the gate correctly holding uncovered/conflict cases — R5/R3 territory), plus a
  few un-overridden specifics (e.g. RC-04 margin "portfolio rationalization") left
  to avoid case-tuning.

**Conclusion:** R4 lifted first-action 34.0% → 46.6% and cut correct-diagnosis-wrong-
action 28 → 15 by sequencing a verify/stabilize/constraint-safe first move, with
**zero regressions, identical gate decisions, and no new unsafe proceeds.** Stage A
remains DO_NOT_PROMOTE / BLOCKED.
