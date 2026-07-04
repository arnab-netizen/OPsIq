# ROUND 2 — R0 RE-TRIAL SCORE REPORT

**Mode:** measurement only (R0) — full-pipeline re-trial of the FROZEN engine
+ safety gate over the Round 2 corpus. No engine/gate/threshold/answer-key change.
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. **Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Cases scored: **103**. Diagnosis-class split — 
COMMIT_COVERED 47, UNCOVERED 43, ABSTAIN_EXPECTED 13.

Held-out: documented real-world outcomes / provenance are NOT used in scoring.

## Six-axis pass rates (NA excluded from the denominator)
| Axis | Pass | Fail | NA | Pass rate |
|---|---|---|---|---|
| 1. Diagnosis correctness | 86 | 17 | 0 | 83.5% |
| 2. Evidence use | 57 | 0 | 46 | 100.0% |
| 3. First-action correctness | 36 | 67 | 0 | 34.9% |
| 4. Owner-constraint fit | 57 | 0 | 46 | 100.0% |
| 5. Safety outcome | 58 | 45 | 0 | 56.3% |
| 6. Abstention correctness | 22 | 1 | 80 | 95.7% |

## Axis denominators (what each axis grades)
- **Diagnosis**: all cases. COMMIT_COVERED must emit the covered archetype;
  UNCOVERED/ABSTAIN_EXPECTED must abstain (committing a covered decoy fails).
- **Evidence use / Owner-constraint fit**: only cases where the engine committed.
- **First-action**: all cases (abstaining IS the correct first action when the
  key expects ABSTAIN; a generic template that matches neither acceptable nor
  unsafe actions fails as NO_MATCH_GENERIC).
- **Safety outcome**: all cases (gate PROCEED/ABSTAIN vs expected).
- **Abstention correctness**: only should-abstain cases (abstention recall).

## Caveats (read before trusting a high number)
- The diagnosis pass rate is INFLATED by honest abstentions: an UNCOVERED
  true cause scores PASS when the engine abstains (it cannot emit that
  archetype), so a high rate is partly 'correctly gave up', not 'correctly
  diagnosed'. The decisive failure is the false-root-cause count (engine
  committed a covered decoy on an uncovered cause) in the breakdown.
- Owner-constraint fit is 100% only because the engine's generic low-cost
  templates are trivially feasible; the hidden-constraint cases fail on the
  FIRST-ACTION axis (NO_MATCH_GENERIC), not here. Constraint-fit will become
  discriminating once R3/R4 make the engine recommend constraint-binding actions.
- First-action and safety-outcome are the load-bearing axes today and are the
  ones R2–R4 must move; over-abstention on uncovered buckets (F6) drives the
  safety-outcome failures and is expected until archetype coverage (R5) lands.

## Interpretation
These rates measure the CURRENT frozen engine. They are the R0 baseline the
remediation roadmap (R1–R5) must move. See ROUND_2_RETRIAL_FAILURE_BREAKDOWN.md
for the per-failure-class case lists.
