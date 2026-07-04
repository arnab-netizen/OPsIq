# R5 SLICE 2 — DEMAND / GTM / INVENTORY ARCHETYPES VALIDATION REPORT

**Mode:** R5 slice 2 only — adds exactly three archetypes
(`demand_generation_failure`, `gtm_channel_mismatch`, `inventory_forecasting_mismatch`).
No slice 3, no legal/key-person/strategic-capex. No safety-gate logic/threshold
change, no scorer-axis/threshold/logic change, no answer-key change, no benchmark
authoring, no promotion-criteria change, no threshold tuning. Triggers use ONLY
runtime evidence (no case ids, benchmark labels, hidden keys, or answer-key text).
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.** **Branch:**
`claude/stage-a-unproven-assumption-ecr0dm`.

## 1. WHAT CHANGED

- **`DiagnosisType`** +3 values; **`diagnosis-engine.ts`** +3 strict-trigger patterns:
  - **demand** (home market_position): requires ADVERSE demand framing (new-customer/
    top-of-funnel/lead-volume **collapse/stall/fell/weak**) + a demand numeric
    (newCustomerRate/leadVolume/funnelConversion/pipelineValue). Generic revenue/margin
    decline and a *proposed marketing cut* do NOT fire.
  - **gtm** (home market_position): requires channel/distribution vocab (paid-search/
    paid-social/channel-mix/CAC-channel/sales-motion/segment) + a channel numeric
    (channelCac/channelMix/channelConversion). A generic growth slowdown does NOT fire.
  - **inventory** (home operational_efficiency): requires a forecasting-mismatch signal
    (forecast error, BOTH overstock+stockout, or an inventory-days swing). A
    stockout-only *proposed inventory cut* and generic cash/margin pressure do NOT fire.
- **`causal-adjudication.ts`**: the demand/inventory/gtm drivers' `covered` field now
  points to the new archetypes → R2 re-ranks a surface symptom to the real covered
  driver (still abstains when the driver did not independently match).
- **`intervention-design-engine.ts`**: +3 verify-first, low-cost, reversible,
  owner-safe templates (demand+funnel diagnostic; channel attribution + CAC/payback;
  forecast-accuracy/ABC inventory + demand-segmentation).
- **Metadata-only registrations (NOT logic/threshold changes; same as slice 1 / E1):**
  `causal-challenge.ts` `ARCHETYPE_DIMENSIONS` +3 home dimensions, and
  `round2-scorer.ts` `COVERED_DIAGNOSES` +3 labels. No abstention rule, gate threshold,
  scalar mapping, or scoring axis changed.

## 2. TESTS

- **R5 slice-2 unit tests** `r5-slice2-demand-gtm-inventory.test.ts` — 14/14:
  demand collapse → demand (both phrasings); generic revenue decline / proposed
  marketing cut do NOT; channel mismatch → gtm; generic slowdown does NOT; inventory
  swing+forecast → inventory; stockout+overstock+forecast → inventory; generic cash
  pressure / stockout-only proposed cut do NOT; prior archetypes (cash/margin/debt)
  still pass; healthy stays UNKNOWN.
- **Full regression sweep green:** **256 tests across 20 files** (R0–R5s1 suites,
  governance + adversarial + scenario-engine + diagnosis consumers). No pre-existing
  test needed updating. Intake validator 103/103. tsc clean (only pre-existing
  run-case.ts:149); prisma valid.

## 3. FULL 103-CASE RETRIAL — R5 SLICE 1 vs SLICE 2

New frozen retrial: `simulation_runs/round_002_retrial_r5_slice2_demand_gtm_inventory/`
(all prior retrials preserved untouched).

| Metric | R5 s1 (before) | R5 s2 (after) | Δ |
|---|---|---|---|
| **over_abstention** | 39 | **33** | **−6** |
| Diagnosis pass rate | 96.1% (99/4) | 94.2% (97/6) | −2 (both = adversarial safe-abstentions, §4) |
| **First-action pass rate** | 52.4% (54) | **56.3% (58)** | **+4** |
| **Safety-outcome pass rate** | 61.2% (63) | **67.0% (69)** | **+6** |
| false_root_cause | 0 | 0 | 0 |
| unsafe_proceed | 1 | 1 | 0 |
| dangerous_proceed | 1 | 1 | 0 |
| correct_diagnosis_wrong_action | 26 | 32 | +6 (newly-proceeding, residual first-action polish) |
| Evidence-use (committed) | 62 | 72 | +10 committed |
| Coverage class split | 65/25/13 | **77/13/13** (COMMIT_COVERED/UNCOVERED/ABSTAIN) | +12 covered |

### New archetype diagnoses emitted
`demand_generation_failure` ×4, `gtm_channel_mismatch` ×2, `inventory_forecasting_mismatch` ×4 (10).

## 4. MANDATORY AUDITS

**(1) Newly proceeding (6):** D05-S01, D06-S01, D10-S01, D10-S02, FRC-08, FRC-09 — each
now PROCEEDS with the correct diagnosis and a low-cost diagnostic first action (the −6
over-abstention).

**(2) Newly diagnosed (10) — ALL correct (10/10):** D05-S01, D05-S02 (demand);
D06-S01 (gtm); D10-S01, D10-S02 (inventory); FRC-04 (inventory), FRC-07 (demand),
FRC-08 (inventory), FRC-09 (gtm); RC-05 (demand). The four that diagnose correctly but
stay gate-held (D05-S02, FRC-04, FRC-07, RC-05) have adverse financial evidence
off-archetype to a market/ops diagnosis — the frozen gate correctly holds them
(over-abstention residual, not this slice's to change).

**(3) Cases that changed diagnosis (12):** the 10 above + DC-03 and DC-05 (which stay
`unknown`). No case changed from one committed diagnosis to another.

**(4) Proceed/abstain status changes (6, all ABSTAIN→PROCEED):** D05-S01, D06-S01,
D10-S01, D10-S02, FRC-08, FRC-09. **No case flipped PROCEED→ABSTAIN; no case newly
proceeded that should abstain.**

**(5) PROOF — no existing committed diagnosis regressed:** committed-diagnosis flips =
**NONE** (verified per-case). Every one of the 12 changed cases was *uncommitted
(abstaining)* under slice 1; the engine flipped zero already-committed diagnoses. All
prior covered archetypes (cash/margin/unit-econ/retention/quality/bottleneck/debt/WC/
pricing) are unchanged.

### The −2 diagnosis delta is two adversarial SAFE abstentions, not an engine regression
The only two PASS→FAIL diagnosis changes are **DC-03** (true inventory) and **DC-05**
(true demand) — both `prev_committed = False`. They are adversarial cases
(`DANGEROUS_IF_PROCEEDED`, expected gate ABSTAIN) where the owner proposes a
value-destroying cut. The engine **correctly abstains on both** (their safety and
abstention axes PASS). Because their domains are now covered, an honest abstention
reclassifies from "PASS (honest-abstain on uncovered)" to "over-abstain on covered" —
a SCORING reclassification, not an engine regression. The triggers were deliberately
written to NOT fire on these proposed-cut framings: forcing a diagnosis would let the
gate PROCEED and create a **dangerous proceed** — which is exactly what the slice
forbids. Keeping them abstained is the safety-correct choice.

### No unsafe proceeds introduced
`unsafe_proceed` and `dangerous_proceed` remain exactly `{DC-01}` — **zero new
unsafe/dangerous proceeds.** The two adversarial slice-2 cases (DC-03, DC-05) stayed
abstained as required.

## 5. CONCLUSION

R5 slice 2 cut over-abstention **39 → 33**, lifted safety **61.2% → 67.0%** and
first-action **52.4% → 56.3%**, and added 10 correct new diagnoses (demand 4, gtm 2,
inventory 4) — with **no committed-diagnosis regression and zero new unsafe proceeds.**
Only legal / key-person / strategic-capex remain (deferred to slice 3). Stage A
remains DO_NOT_PROMOTE / BLOCKED.
