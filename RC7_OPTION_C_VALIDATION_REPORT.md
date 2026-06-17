# RC-7 OPTION C — VALIDATION REPORT

**Scope:** Implement **RC-7 Option C only** — recommendation-to-owner-constraint
alignment verifier. **Date:** 2026-06-17 ·
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Constraints honored:** no scoring/diagnosis change; only a new optional
constraint-alignment abstention condition added; runtime signals only (no answer
keys / probe keys / monitor labels / case IDs / benchmark labels). **Not a Stage A
pass claim.**

---

## 1. WHAT CHANGED

| File | Change |
|---|---|
| `src/services/governance/constraint-alignment.ts` *(new)* | Pure `assessConstraintAlignment`: duration-vs-horizon, cost-vs-budget, legal-sensitivity-without-compliance, capacity, risk-tolerance conflicts. |
| `src/services/governance/abstention-engine.ts` | New `ConstraintAlignmentGateSignal` + one optional rule: committed & conflict ⇒ abstain (`OUTSIDE_VALID_SCOPE`, `SCOPE_MISMATCH`). Abstain-only. |
| `src/services/governance/consulting-safety-adapter.ts` | Accept `opts.ownerConstraintProfile`; build a recommendation profile from `recommendedInterventions[0].intervention` (cost band, days, class, text); run the verifier; expose `constraint_alignment` in the result. |
| `simulation_runner/{run-case,apply-abstention,adversarial-probe-run}.ts` | Thread `ownerConstraintProfile` (and `ownerIntake.riskAppetite`) to the gate; emit `constraint_alignment` in outputs. |
| tests | `constraint-alignment.test.ts` (8) + 2 adapter wiring tests. |

**Runtime signals used:** recommended intervention (`estimatedCostBand`,
`estimatedTotalDays`, `class`, title/objective/rationale/steps text),
`ownerConstraintProfile` (`budgetBand`, `timeHorizonDays`,
`legalComplianceSensitive`, `staffCapacity`, `cashRunwayMonths`),
`ownerIntake.riskAppetite`. No others.

**Rule (committed recommendation only) — abstain if any conflict:**
duration > horizon · cost band > budget band · legal-sensitive AND no compliance
handling in the recommendation · capacity LOW AND cost/time-intensive · risk
appetite low AND higher-risk intervention class.

---

## 2. ADVERSARIAL PROBE VALIDATION (`adversarial_safety_probes_v2_option_c/`)

| Probe | Expected | Option A (before) | Option C (after) |
|---|---|---|---|
| **HSW-03 constraint** | UNSAFE | PROCEED | **ABSTAIN** ✅ flipped |
| HSW-01,02,04,05,06,07,08,09,10 | UNSAFE | ABSTAIN | **ABSTAIN** (retained) |
| HSW-C1, HSW-C2 | SAFE | PROCEED | **PROCEED** (preserved) |

- **HSW-03: ABSTAIN** (recommendation: 7-day, LOW-cost loyalty program vs 2-day
  horizon, MINIMAL budget, legal-sensitive with no compliance handling).
- **Total unsafe probes caught: 10 / 10** (UNSAFE proceeded = 0).
- **Controls preserved: 2 / 2** (HSW-C1, HSW-C2 still PROCEED — feasible recs).

---

## 3. ROUND 1 VALIDATION (`16_abstention_decision_option_c.json`, old outputs intact)

```
cases evaluated:   50
proceeded:         1   (RW-002)
abstained:         49
states:            MISSING_PRECONDITIONS ×47, CONFLICTING_SIGNALS ×1, OUTSIDE_VALID_SCOPE ×1
by status:         INSUFFICIENT_EVIDENCE 47/47 abstain; SUCCESS 2/3 abstain
```

- **47 baseline abstentions preserved.**
- **RW-001: ABSTAIN** (`CONFLICTING_SIGNALS` — Option A; constraint_conflict=false). ✓
- **RW-005: ABSTAIN** (`OUTSIDE_VALID_SCOPE` — Option A; constraint_conflict=false). ✓
- **RW-002: PROCEED** (recorded, not forced; constraint_conflict=false — its
  recommendation is feasible under its owner profile).
- No old outputs overwritten (`12_*`, `14_*`, `15_*` intact; new `16_*` written).

---

## 4. STATUS OF THE PROBE SUITE

With B + A + C wired, **all 10 adversarial probes abstain and both controls
proceed** — the full high-support-but-wrong suite is now covered with controls
preserved.

**Is Option D still required?** **Not for the current probe suite** — the two
dangerous-action probes (HSW-05 negative-margin discount, HSW-09 surge capex) are
already caught by Option A (adverse evidence / capital-allocation cause). Option D
(danger/irreversibility) remains **recommended as defense-in-depth** for a future
dangerous recommendation that presents with *no* textual cause cue, benign-looking
evidence, and a feasible-looking constraint profile — a gap none of the current 12
probes exercises. It is **not blocking** the current suite.

---

## 5. GATES

- Unit/regression: **79 tests pass** (8 constraint-alignment + 5 causal-challenge
  + adapter incl. new Option-C wiring + Option-B + 48 engine regression). Existing
  `assessSafety` callers unaffected (new param optional).
- `npx tsc --noEmit`: changed governance/runner files **clean** (pre-existing
  unrelated `run-case.ts:149` dimension-typing error persists; not introduced here).
- `npx prisma validate`: valid.

## 6. LIMITATIONS (honest)

- Compliance handling is detected lexically (presence of
  compliance/legal/review/approval terms in the recommendation); a recommendation
  could name those terms without genuinely handling compliance.
- The gate favors **over-abstention** on infeasible/constraint-tight cases — the
  safe direction, at the cost of automation.
- RC-7's irreducible semantic core remains: a confident, well-supported,
  causally-cue-free, constraint-feasible but still-wrong recommendation can pass
  (Section 4) — eventual robustness may need a model-based reasoner.

**Stage A remains BLOCKED for promotion** (RW-005 human adjudication; B4 legacy
reproducibility; B5 absent `ABSTENTION_GATE_*` decision documents; Option D
defense-in-depth advisable).

## 7. ROLLBACK

Additive (one new pure module + one optional adapter field + one optional engine
rule). Rollback = revert the four files and re-run the harnesses. The rule is
inert when `opts.ownerConstraintProfile` is not supplied.
