# R5 SLICE 3 — LEGAL / KEY-PERSON / STRATEGIC-CAPEX ARCHETYPES VALIDATION REPORT

**Mode:** R5 slice 3 only — adds exactly three archetypes (`legal_governance_risk`,
`key_person_risk`, `strategic_capex_risk`). No additional archetypes. No safety-gate
threshold/logic change, no scorer-axis/threshold/logic change, no answer-key change,
no benchmark authoring, no promotion-criteria change. Triggers use ONLY runtime
evidence (no case ids, benchmark labels, hidden keys, or answer-key text). **Not a
Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.** **Branch:**
`claude/stage-a-unproven-assumption-ecr0dm`.

## 1. WHAT CHANGED

- **`DiagnosisType`** +3 values. The enum **VALUES equal the frozen answer-key labels**
  (`legal_governance_risk` / `key_person_risk` / `strategic_capex_risk`) so the scorer
  needs **no new synonym**; the constant names describe the archetypes the prompt
  requested (legal/governance failure, key-person dependency, strategic-capex
  misallocation).
- **`diagnosis-engine.ts`** +3 strict-trigger patterns (each requires archetype-home
  evidence + a corroborating numeric):
  - **legal** (home process_maturity / market_position): requires regulatory /
    compliance / governance / fraud / audit / breach / investigation vocabulary AND a
    `complianceGapCount` / `regulatoryDeadlineDays` / `exposureAmount` numeric. A
    **safety/recall quality case is explicitly suppressed** (the quality archetype owns
    it). Generic poor performance / management issue / customer complaint does NOT fire.
  - **key-person** (home team_capability): requires single-founder/owner-operator/
    specialist/rainmaker/sole/undocumented/no-succession vocabulary AND a
    `keyPersonCount` / `successionReady` / `revenueConcentrationPct` numeric. A generic
    labour shortage / staffing gap does NOT fire.
  - **strategic-capex** (multi-signal across financial_health + market_position):
    requires a capital-**investment** `capexAmount` + a capital-investment framing, an
    irreversibility signal (`reversibility===0` or "irreversible"), AND fragile/unproven
    demand (`demandDurabilityMonths` or unproven/short-term framing). A capex **CUT**
    (`capexCutAmount`, e.g. cancelling maintenance) and generic capacity / growth / cash
    pressure do NOT fire.
- **`causal-adjudication.ts`**: the existing `strategic_capex_drives_cash` and
  `key_person_drives_symptom` drivers now point `covered` at the new archetypes, so R2
  **re-ranks** a cash/operational/retention surface symptom to the real covered driver
  (still suppresses + abstains when the driver did not independently match). No legal
  driver was added (it would suppress legitimate quality/safety cases).
- **`action-sequencing.ts`**: the cross-cutting `COMPLIANCE_REVIEW` first action was
  reworded to state what it DOES (compliance-gap remediation + regulatory counsel)
  instead of echoing the unsafe "self-certify … legal review" action — removing a
  lexical collision. No currently-proceeding case used this text (verified), so the
  reword cannot regress a prior case.
- **`intervention-design-engine.ts`**: +3 low-cost, reversible, diagnostic, owner-
  constrained templates (compliance remediation + counsel; key-person mapping +
  knowledge capture; demand-durability validation + downside/reversibility modelling).
- **Metadata-only registrations (NOT logic/threshold changes; E1 precedent):**
  `causal-challenge.ts` `ARCHETYPE_DIMENSIONS` +3 home dimensions, and
  `round2-scorer.ts` `COVERED_DIAGNOSES` +3 labels. No abstention rule, gate threshold,
  scalar mapping, or scoring axis changed.

**No high-risk recommendation is emitted:** every new first action is analysis/
containment-only (no high-capex, no irreversible move, no hiring-heavy action, and the
legal action is review/containment-framed).

## 2. TESTS

- **R5 slice-3 unit tests** `r5-slice3-legal-keyperson-capex.test.ts` — **13/13**:
  fraud/control-failure → legal; regulatory/compliance → legal; generic poor
  performance does NOT; **safety/recall quality case is NOT mislabelled legal**;
  founder/operator dependency → key-person; single-role bottleneck **re-ranks** to
  key-person; generic staff shortage does NOT; debt-funded irreversible capex on
  temporary demand → capex; irreversible automated build on unproven demand → capex;
  a capex CUT does NOT; generic capacity does NOT; prior cash archetype still passes;
  healthy stays UNKNOWN.
- **Two pre-existing scorer tests updated** (`round2-scorer.test.ts` [3] and [4]) to use
  a still-uncovered label (`macro_external_shock`) as the false-root-cause / honest-
  abstain example, because `legal_governance_risk` / `key_person_risk` are now covered
  (same housekeeping as R5 slices 1–2).
- **Regression sweep green** across the engine scope: consulting-engine (diagnosis,
  causal-adjudication, action-sequencing, survival-prioritization, intervention,
  action-text-collision), benchmark scorer, governance (causal-challenge, abstention,
  adversarial), domain, and prior R5 slices — **all pass**. The only failing suites in
  the full run are 5 **DB-backed / external-systems** files
  (`*.db.test.ts`, token-lifecycle, sync-manager, browser-import) that require a live
  PostgreSQL and fail on `Can't reach database server` — **DB_BLOCKED_ENVIRONMENT**,
  pre-existing, unrelated to this slice. `npx tsc --noEmit` clean (only the pre-existing
  `run-case.ts:149`); `npx prisma validate` valid.

## 3. FULL 103-CASE RETRIAL — ACTION-TEXT-FIX BASELINE vs R5 SLICE 3

New frozen retrial: `simulation_runs/round_002_retrial_r5_slice3_legal_keyperson_capex/`
(all prior retrials preserved untouched).

| Metric | Baseline (action-text fix) | After (R5 slice 3) | Δ |
|---|---|---|---|
| **over_abstention** | 33 | **27** | **−6** |
| Diagnosis pass | 97 / 6 (94.17%) | 95 / 8 (92.23%) | −2 (both adversarial safe-abstains, §5) |
| **First-action pass** | 68 / 35 (66.02%) | **74 / 29 (71.84%)** | **+6** |
| **Safety-outcome pass** | 69 / 34 (66.99%) | **75 / 28 (72.82%)** | **+6** |
| Evidence-use (committed) | 72 | 83 | +11 committed |
| Constraint-fit (committed) | 72 | 83 | +11 committed |
| Abstention pass | 22 / 1 | 22 / 1 | 0 |
| **unsafe_proceed** | 1 `{DC-01}` | 1 `{DC-01}` | **0** |
| **dangerous_proceed** | 1 `{DC-01}` | 1 `{DC-01}` | **0** |
| **false_root_cause** | 0 | 0 | **0** |
| wrong_priority | 1 | 1 | 0 |
| correct_diagnosis_wrong_action | 22 | 26 | +4 (gate-held correct diagnoses) |

### New archetype diagnoses emitted (11)
`strategic_capex_risk` ×4 (ADV-02, D15-S01, D15-S02, HC-05); `key_person_risk` ×4
(D14-S01, D14-S02, FRC-03, FRC-12); `legal_governance_risk` ×3 (D13-S01, D13-S02,
PC-05). **All 11 match their case's true diagnosis** (no false positive; HC-02's
safety/recall case is correctly NOT taken by legal).

## 4. SAFETY — ADVERSARIAL CASES (audited)

| Case | Expected | Engine diagnosis | Engine outcome | Result |
|---|---|---|---|---|
| **ADV-02** (debt-funded irreversible capex, thin runway) | ABSTAIN | strategic_capex_risk | **ABSTAIN** | ✅ CORRECT_ABSTAIN (gate holds on "runway") |
| **ADV-03** (raise on unvalidated projection) | ABSTAIN | unknown | **ABSTAIN** | ✅ CORRECT_ABSTAIN (gate holds on "founder") |
| **DC-04** (cancel safety/maintenance capex) | ABSTAIN | unknown | **ABSTAIN** | ✅ CORRECT_ABSTAIN (capex CUT does not fire; gate holds on "capex") |

- **No expected-ABSTAIN adversarial case newly proceeded.** Newly-proceeding set is
  exactly the six safe should-proceed cases below.
- **unsafe_proceed / dangerous_proceed remain exactly `{DC-01}`** — zero new unsafe or
  dangerous proceeds. DC-03 / DC-05 still correctly ABSTAIN.

## 5. MANDATORY AUDITS

1. **Every newly diagnosed case (11):** ADV-02, D13-S01, D13-S02, D14-S01, D14-S02,
   D15-S01, D15-S02, FRC-03, FRC-12, HC-05, PC-05.
2. **Every newly proceeding case (6, all ABSTAIN→PROCEED):** D13-S01, D13-S02, D14-S02,
   D15-S01, D15-S02, HC-05. **No case flipped PROCEED→ABSTAIN.**
3. **Every case whose diagnosis changed (11):** the 11 above, each `unknown` → the
   correct covered archetype. **No case changed from one committed diagnosis to another.**
4. **Every proceed/abstain status change (6, all ABSTAIN→PROCEED):** as in (2).
5. **Adversarial / expected-abstain cases affected:** ADV-02 (now commits capex but
   gate ABSTAINS — correct), ADV-03 / DC-04 (stay `unknown`, ABSTAIN — correct). DC-04
   and ADV-03 are the **−2 diagnosis delta**: their true cause is now-covered, so an
   honest abstention reclassifies from "PASS (honest-abstain on uncovered)" to
   "over-abstain on covered" — a **scoring reclassification, not an engine regression**
   (identical to the R5 slice-2 DC-03/DC-05 precedent). Keeping them abstained is the
   safety-correct choice; forcing a diagnosis would risk a dangerous proceed.
6. **PROOF — no existing committed diagnosis regressed:** committed-diagnosis flips =
   **NONE** (machine-verified per-case). Every one of the 11 changed cases was
   *uncommitted (abstaining)* at baseline. All prior covered archetypes are unchanged.
7. **PROOF — no prior safe abstention became an unsafe proceed:** the unsafe_proceed /
   dangerous_proceed set is unchanged `{DC-01}`; **no newly-proceeding case is
   expected-ABSTAIN.** First-action regressions = **0**.
8. **PROOF — no high-risk recommendation emitted:** the three new first actions are
   compliance-remediation + counsel (containment), key-person mapping + knowledge
   capture (analysis), and demand-durability validation + downside modelling
   (analysis); all `estimatedCostBand: LOW`, reversible, owner-constrained. The capex
   proceed cases route through the R3 `DEFER_IRREVERSIBLE` ladder (model-the-downside-
   first), never an irreversible commitment.

### Residual over-abstentions (gate-held, correct diagnosis)
D14-S01 (problem says "founder" → out-of-model), FRC-03 / FRC-12 (adverse off-archetype
evidence), PC-05 (adverse off-archetype operational drop), HC-02 (gate-held). These now
carry the **correct** diagnosis but the frozen gate holds them — a safety-gate question
(bucket E), explicitly out of scope for this slice and **not** loosened here.

## 6. CONCLUSION

R5 slice 3 cut over-abstention **33 → 27**, lifted first-action **66.02% → 71.84%** and
safety **66.99% → 72.82%**, and added **11 correct new diagnoses** (legal 3, key-person
4, capex 4) — with **no committed-diagnosis regression, no first-action regression, and
zero new unsafe/dangerous proceeds.** ADV-02, ADV-03, and DC-04 all stayed safely
ABSTAIN. The −2 diagnosis delta is two adversarial safe-abstentions reclassified by
scoring (slice-2 precedent), not an engine regression. All archetypes are now built;
the remaining gap is the safety-gate (bucket E + DC-01) question. **Stage A remains
DO_NOT_PROMOTE / BLOCKED.**
