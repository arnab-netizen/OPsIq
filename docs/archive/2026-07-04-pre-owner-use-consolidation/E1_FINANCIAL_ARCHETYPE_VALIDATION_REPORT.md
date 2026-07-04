# E1 — FINANCIAL ARCHETYPE VALIDATION REPORT

**Scope:** Implement **E1 only** — financial-health archetypes (cash/liquidity,
unit economics, margin erosion). **Date:** 2026-06-17 ·
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Constraints honored:** no safety-gate logic/threshold change; no abstention-
threshold change; no answer-key use; E2–E6 not implemented. **Not a Stage A pass
claim.**

---

## 1. WHAT CHANGED

| File | Change |
|---|---|
| `src/domain/consulting-engine/types.ts` | +3 `DiagnosisType`: `CASH_LIQUIDITY_CRISIS`, `UNIT_ECONOMICS_FAILURE`, `MARGIN_EROSION`. |
| `src/services/consulting-engine/diagnosis-engine.ts` | +3 patterns, triggering **only on clear financial-distress signals** (text or numeric `supportingData`); generic financial evidence does not trigger. |
| `src/services/consulting-engine/intervention-design-engine.ts` | +3 safe templates: low-cost, reversible, with fallback; classes CONTAINMENT/STABILIZATION only (no capex/hiring/discount/irreversible). |
| `src/services/governance/causal-challenge.ts` | Archetype→dimension **metadata** extended (financial archetypes → `financial_health`) so the existing off-archetype rule knows their home dimension. **No rule/threshold change.** |
| `simulation_runner/rerun-e1.ts` *(new)* | Re-runs the engine (E1) from `01_case_input.json` and applies the unchanged gate; writes `18_*` only — frozen `09_*` untouched. |
| `src/__tests__/services/financial-archetypes.test.ts` *(new)* | 6 tests. |

### Trigger discipline (anti-over-triggering)
- **Cash/liquidity:** runway/liquidity/burn language or `cashRunwayMonths ≤ 6`.
- **Unit economics:** negative contribution / `variableCost > price` / explicit CAC>LTV language. **Positive economics do not trigger** (verified: BLND-001, PD-001 stay abstained).
- **Margin erosion:** profit-down / negative operating margin / cost-inflation language or negative numeric trend.
- Generic placeholder financial evidence ("Business facing performance challenge…") → **no trigger** (stays abstained).

---

## 2. ROUND 1 — BEFORE vs AFTER (new `18_abstention_decision_e1.json`; old outputs intact)

| Metric | Before (E0/16_*/17_*) | After E1 (18_*) |
|---|---|---|
| proceed | 1 (RW-002) | **1 (RW-002)** |
| abstain | 49 | **49** |
| committed diagnoses | 3 | **5** |
| committed by type | quality 1, retention 2 | quality 1, retention 2, **margin_erosion 2** |

- **New committed diagnoses unlocked: 2** — RW-003 and RW-006, both
  `margin_erosion` (RW-006 negative operating margin; RW-003 profit −28%).
- **New committed diagnoses' first action:** "Decompose cost drivers and identify
  margin-recovery levers" — **LOW cost, reversible, STABILIZATION**, with fallback.
- **Proceed/abstain unchanged.** Both new commits are **held by the gate**
  (abstain, `CONFLICTING_SIGNALS`) because each carries adverse evidence in
  non-financial dimensions → the causal challenge correctly routes them to human
  review rather than proceeding. **0 new proceeds.**

---

## 3. SAFETY — UNSAFE PROCEEDS & ADVERSARIAL SUITE (`adversarial_safety_probes_v2_e1/`)

- **Unsafe proceeds (Round 1): 0.**
- **Adversarial unsafe caught: 10 / 10.**
- **Controls preserved: 2 / 2** (HSW-C1, HSW-C2 PROCEED).
- The archetype→dimension metadata extension did **not** weaken the gate: the full
  adversarial suite remains green, proving safety non-regression empirically.

---

## 4. FALSE HIGH-CONFIDENCE RISK

- E1 produced 2 new committed diagnoses. **Neither proceeded** — the gate abstained
  both. So E1 introduced **no new confident-wrong proceed**.
- Residual risk: a `margin_erosion` label on RW-003 (whose documented root cause is
  strategic over-expansion) would be a *misaligned* diagnosis — but it is (a)
  abstained by the gate and (b) attached to a safe, analysis-only first action.
  Risk is **LOW and contained**. RW-006 (negative operating margin) is a plausibly
  aligned margin diagnosis.
- The financial archetypes return MODERATE confidence by default (HIGH only on hard
  numeric proof), keeping confidence honest.

---

## 5. GATES
- Unit/regression: **122 tests pass** (6 new financial-archetype + all governance +
  engine regression).
- `npx tsc --noEmit`: changed engine/governance files **clean** (pre-existing
  unrelated `run-case.ts:149` persists). `npx prisma validate`: valid.

## 6. OUTPUTS (old artifacts preserved)
- `simulation_runs/round_001/case_*/18_abstention_decision_e1.json` (50, new).
- `simulation_runs/adversarial_safety_probes_v2_e1/` (new).
- Frozen `09_*`, `10_*`, and prior `12/14/15/16/17_*` untouched.

---

## 7. IS E2 AUTHORIZED?

**E1 is complete and validated** (model coverage extended, no safety regression).
**E2 (unit-economics / margin / pricing split) is a further capability change and
is NOT self-authorized** — it requires an explicit owner instruction per the
workstream guardrails, and (like E1) must re-run the adversarial suite and keep it
10/10 with controls preserved.

**Observation for E2 planning:** E1's net committed-output *proceed* gain is 0 (the
2 new commits were gate-abstained on non-financial adverse evidence). Raising the
*proceed* rate safely will require either (a) cases whose evidence is
predominantly financial (so no adverse off-archetype signal), or (b) the broader
taxonomy (E3/E4) so the off-archetype evidence is itself diagnosable — not looser
thresholds.

**Stage A remains BLOCKED.**
