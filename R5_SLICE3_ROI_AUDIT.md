# R5 SLICE-3 ROI AUDIT (machine-grounded)

**Mode:** analysis only. No implementation. **Stage A remains DO_NOT_PROMOTE /
BLOCKED.** **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.

All gains are derived from the per-case gate analysis in
`R5_POST_SLICE2_REMAINING_FAILURE_MAP.md` (out-of-model + off-archetype-adverse check
run against each candidate case's actual evidence/businessProblem), not estimated.

## 1. PER-ARCHETYPE ROI

### legal_governance_failure
- **Addresses (uncovered, expected PROCEED):** D13-S01, D13-S02, PC-05 (3).
- **Does NOT address:** the 21 bucket-E gate-held cases, the 10 F/H action cases.
- **Diagnosis gain:** 0 net (D13-S01/S02, PC-05 are already diagnosis-PASS as
  HONEST_ABSTAIN; committing the covered type keeps PASS).
- **Proceed gain (exact gate analysis):** D13-S01 ✓, D13-S02 ✓, PC-05 ✗ (adverse
  off-archetype operational_efficiency evidence → gate holds). → **+2 proceeds.**
- **First-action gain:** +2 (the two that proceed get a low-cost diagnostic action).
- **Safety risk:** **HIGH** — `ADV-03` (legal/fraud, `DANGEROUS_IF_PROCEEDED`,
  expected ABSTAIN) would draw the legal archetype; if the trigger fires and the gate
  does not hold it → a **new dangerous proceed.** Must be excluded by strict triggers.
- **Overfitting risk:** MED (legal vocabulary is broad; risk of firing on compliance
  mentions in non-legal cases).
- **Required tests:** covenant/regulatory/fraud/governance triggers; generic
  "compliance" mention does NOT trigger; ADV-03 stays abstained.
- **Required adversarial probes:** ADV-03 must remain ABSTAIN (no dangerous proceed).
- **Build now?** Only with an explicit ADV-03 guard. **Depends on:** nothing
  structurally, but see §3 — an action-text fix is higher-ROI and risk-free first.

### key_person_dependency
- **Addresses:** D14-S01, D14-S02, FRC-03, FRC-12 (4).
- **Diagnosis gain:** 0 net (all four already PASS as HONEST_ABSTAIN).
- **Proceed gain (exact):** D14-S02 ✓, FRC-03 ✓; D14-S01 ✗ ("founder" out-of-model in
  problem text), FRC-12 ✗ (adverse off-archetype customer_retention). → **+2 proceeds.**
- **First-action gain:** +2.
- **Safety risk:** LOW (no adversarial key-person case in the corpus).
- **Overfitting risk:** MED (the R2 adjudicator already has a key_person DRIVER with
  guards — reuse its vocab to avoid firing on staffing-constraint cases like HC-04).
- **Required tests:** single-specialist/rainmaker/succession triggers; HC-04 staffing
  constraint does NOT become key-person; MC-02 key-person mention does not steal a
  unit-econ surface.
- **Build now?** Yes-ish (lowest safety risk of the three), but +2 proceeds only.

### strategic_capex_misallocation
- **Addresses:** D15-S01, D15-S02, HC-05 (3).
- **Diagnosis gain:** 0 net (already PASS as HONEST_ABSTAIN).
- **Proceed gain (exact):** D15-S01 ✓, D15-S02 ✓, HC-05 ✓ → **+3 proceeds.**
- **First-action gain:** +3.
- **Safety risk:** **HIGHEST** — `ADV-02` and `DC-04` are adversarial capex cases
  (`DANGEROUS_IF_PROCEEDED`, expected ABSTAIN). The strategic-capex archetype is the
  one most likely to fire on them; without a tight irreversibility/durability guard
  (the R3 `hasIrreversibleDanger` distinction used for ADV-02 in R2) this creates
  **new dangerous proceeds.**
- **Overfitting risk:** MED-HIGH (capex/expansion vocabulary overlaps cash-survival
  cases like PC-11 that must stay cash).
- **Required tests:** irreversible-capex-on-unproven-durability triggers; PC-11
  efficiency-capex survival case does NOT become capex; ADV-02 + DC-04 stay ABSTAIN.
- **Required adversarial probes:** ADV-02, DC-04 must remain ABSTAIN.
- **Build now?** Only behind a proven adversarial guard.

### SLICE-3 TOTAL (exact, machine-derived)
- **Diagnosis gain: 0 net** (all 10 group-A cases already pass as honest-abstain).
- **Proceed gain: +7** (legal +2, key-person +2, capex +3). 3 of 10 stay gate-held.
- **First-action gain: +7** (the 7 new proceeds get low-cost diagnostic actions).
- **over_abstention: 33 → 26 (−7).**
- **Safety risk: introduces dangerous-proceed exposure on ADV-02, ADV-03, DC-04**
  (and DC-03/DC-05 already proved this hazard in slice 2 — both were kept abstained
  only by strict adverse-only triggers).

## 2. NON-ARCHETYPE FIXES — COMPARISON

| Fix | Cases addressed | Proceed/first-action gain | Safety risk | Notes |
|---|---|---|---|---|
| **Action-text fix** (reword slice-1/2 template rationales) | F/H (10) | **+~10 first-action** | **NONE** | engine already recommends the safe action; removes verbatim unsafe-phrase echo |
| Safety-gate enhancement | E (21 + DC-01) | up to +21 + fix dangerous proceed | **HIGH** | the gate is the safety backbone; loosening risks corpus-wide unsafe proceeds |
| Multi-domain synthesis | overlaps E/D | small | MED | most E cases are single correct dx held by the gate, not multi-domain |
| Scorer correction | F/H (10) | +10 first-action | n/a (FORBIDDEN) | could weight title over rationale, but scorer is frozen |
| Benchmark correction | 0 | 0 | n/a | **no benchmark defects found** |

## 3. SEQUENCING CONCLUSION
- **Highest ROI per unit risk = the action-text fix (F/H, +~10 first-action, zero
  safety risk).** It beats Slice 3 (+7 proceeds, real dangerous-proceed risk).
- Slice 3 is worth doing but is NOT the highest-value or lowest-risk next step, and
  must carry explicit ADV-02 / ADV-03 / DC-04 guards.
- The largest bucket (E, 21) is a safety-gate question and is the **highest-risk,
  last** item — never before the safety story is otherwise complete.
