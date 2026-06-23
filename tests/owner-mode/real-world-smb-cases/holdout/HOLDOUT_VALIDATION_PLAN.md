# Holdout Validation Plan

## Purpose

This document defines the protocol for running the OpsIQ SMB holdout validation. The holdout is the first test of OpsIQ's SMB diagnostic capability against cases it has never been tuned on.

The holdout is not a performance optimisation exercise. It is a measurement exercise. Its value comes from running the system against the sealed set exactly once without modification, recording what happens, and classifying the results honestly.

---

## Minimum and Target Case Counts

| Threshold | Count | Purpose |
|---|---|---|
| Minimum to run | 12 | Sufficient to detect gross capability failures |
| Target | 25 | Sufficient for statistical confidence in pattern claims |
| Minimum for any public claim | 20 accepted cases | Reasonable sample for SaaS or product positioning |

If fewer than 12 cases pass the acceptance checklist, the holdout set is not ready. Construct more cases.

---

## Pre-Run Requirements

Before the first run is conducted, the following must all be true:

1. **Sealed set** — `holdout_cases.jsonl` is final and hash-recorded. No modifications after sealing.
2. **No OpsIQ changes** — `smbOutputComposer.ts`, `scoringContract.ts`, `smbLeakageGuard.test.ts`, the diagnosis engine, and all sidecars are identical to their state at `SMB_PHASE_5_REGRESSION_LOCK_REPORT.md`. No sub-mechanism additions or vocabulary changes in response to holdout case content.
3. **Pass target declared** — The success threshold is written below in this document, before the run. It cannot be changed after the sealed set is final.
4. **Acceptance checklist complete** — All holdout cases have passed Sections A–E of `HOLDOUT_CASE_ACCEPTANCE_CHECKLIST.md`.
5. **Leakage audit complete** — `HOLDOUT_LEAKAGE_AUDIT.md` has been completed for the holdout set.
6. **Harness variant ready** — The holdout runner (`holdoutRunner.test.ts`) has been implemented and verified against a single synthetic case before running the sealed set.

---

## Declared Pass Target (Before First Run)

The following thresholds are declared before the first run and cannot be changed retroactively:

| Metric | First-Run Pass Threshold |
|---|---|
| Supported pass rate | ≥ 60% of holdout cases the engine supports |
| Average totalScore (supported cases) | ≥ 0.65 |
| Bad recommendation violations | 0 |
| Abstention quality (unsupported cases) | 100% — all unsupported cases must return scope-gap or abstention, never a confident wrong answer |

**What counts as a supported case**: any holdout case where the engine produces a non-scope-gap output. Cases that return SCOPE GAP or abstention due to unmodelled archetypes are classified separately; they do not count toward pass rate denominator.

**Why 60%, not 9/9**: The internal benchmark was tuned iteratively. The holdout has no tuning. A 60% first-run supported pass rate from a zero-tuning cold start is the minimum bar that indicates genuine capability. Anything below 60% indicates either a capability gap requiring investigation or a calibration problem with the fixtures.

---

## First Run Protocol

### Step 1 — Verify seal
Recompute SHA-256 of `holdout_cases.jsonl`. Confirm it matches the pre-run hash. If it does not match, the file has been modified. Do not run. Investigate.

### Step 2 — Confirm no OpsIQ changes
`git diff` against the commit hash at `SMB_PHASE_5_REGRESSION_LOCK_REPORT.md` for all files in scope. If any relevant file has changed, document why. If the change was made after seeing holdout case content, the run is invalid.

### Step 3 — Run leakage audit
Run `HOLDOUT_LEAKAGE_AUDIT.md` checks on the holdout set. If any leakage is found, stop. Do not run.

### Step 4 — Run the holdout
Execute the holdout runner:
```
npm run test:holdout
```
(or equivalent vitest command targeting `holdoutRunner.test.ts`)

### Step 5 — Record raw results immediately
Before any analysis or discussion, record the complete score output for every case:
- case_id
- totalScore
- passed (boolean)
- dimensionResults for all four dimensions
- unsupportedArchetype (boolean)

This record is the ground truth. It cannot be amended.

### Step 6 — No immediate re-runs
Do not re-run the holdout after seeing results. If a technical failure occurs (database connection error, timeout), document it, fix the technical issue, and re-run from Step 1. Technical failures are not the same as result failures.

---

## Classification Protocol

After the first run, every case is classified. Classification is done before any discussion of fixes.

### Classification decision tree

```
Did the engine return SCOPE GAP or abstention?
  YES → Classify as UNSUPPORTED_ARCHETYPE
        (excluded from pass-rate denominator; counts toward abstention quality check)
  NO  → Did the case PASS (totalScore ≥ 0.70, rca.passed, bra.passed)?
          YES → Classify as PASS
          NO  → Apply failure classification below
```

### Failure classifications

For each failing supported case, assign exactly one primary classification:

**ENGINE_GAP**
The engine produces an incorrect or generic archetype diagnosis. The primary root cause type returned by the engine does not match the case's diagnosis. OpsIQ classified the case as a different problem category.

*Indicators*: Diagnosis type mismatch, ROOT_CAUSE_ALIGNMENT score near zero, output discusses different mechanism than case requires.

*Implication*: The engine does not model this problem type. This is a structural gap, not a vocabulary gap. Fixing it requires engine work.

---

**INPUT_MODEL_GAP**
The engine produces the correct archetype but ROOT_CAUSE_ALIGNMENT fails because the case's must_identify terms are not in OpsIQ's output vocabulary for that archetype.

*Indicators*: Correct archetype, rca.passed = false, missingTerms list contains standard domain vocabulary that OpsIQ should know, terms are not obscure case-specific language.

*Implication*: The composer's sub-mechanism vocabulary does not cover this domain variant. Fixing it requires adding a generic sub-mechanism.

---

**SCORING_LIMITATION**
The case passes qualitatively — a human reviewer would say the output is correct — but fails the scorer because must_identify terms are too specific, too obscure, or require exact phrase matching that the output approximates but does not contain.

*Indicators*: Output is substantively correct per human review, missingTerms list contains very specific or unusual phrases, rca.score is close to the 0.60 threshold but just below.

*Implication*: The fixture's must_identify terms may be miscalibrated. This classification requires human review to confirm before any scoring changes are made.

---

**HONEST_CEILING**
The case fails because the required diagnostic conclusion cannot be reached from the evidence provided without copying the fixture's answer key. Even a human analyst given only the presented facts would not reliably use those exact phrases.

*Indicators*: missingTerms list contains highly specific phrases that are not derivable from generic evidence, the case's must_identify terms are outcome-specific rather than mechanism-specific.

*Implication*: The fixture may be too specific in its must_identify terms. This classification requires honest documentation and does not justify tuning.

---

**HOLDOUT_ERROR**
The case itself is the problem — the must_identify terms are wrong, the scenario is inconsistent, or the diagnosis is debatable by domain experts.

*Indicators*: Human domain expert review concludes the expected diagnosis is incorrect or the must_identify terms would not be used by competent consultants.

*Implication*: The case should be corrected or retired. It does not count toward pass or fail for the purpose of capability assessment. Corrected cases may only be rescored if corrections are purely factual (wrong formula) not preference-driven (changing terms because OpsIQ doesn't use them).

---

### Classification rules

1. Each failing case gets exactly one primary classification
2. Classifications are assigned by someone other than the OpsIQ implementer
3. Classifications are documented before any fix is designed
4. A case cannot change classification after a fix is proposed (to prevent classification laundering)
5. HOLDOUT_ERROR is a high bar — it requires domain expert confirmation that the case answer key is wrong, not just that OpsIQ doesn't match it

---

## Reporting Requirements

After the first run, produce a `HOLDOUT_RUN_REPORT.md` containing:

1. Run date and sealed file hash
2. OpsIQ commit hash at time of run
3. Total holdout cases submitted
4. Cases passing acceptance checklist
5. Per-case results (table): case_id, totalScore, passed, classification, primary failure dimension
6. Supported pass rate (numerator/denominator)
7. Average totalScore (supported cases)
8. Bad recommendation violations (must be 0 or each violation documented)
9. Unsupported case abstention quality
10. Whether first-run pass target was met (YES/NO)
11. Classification breakdown (count per classification)
12. Whether any fix is warranted (each fix proposed with justification)

---

## Post-First-Run Fix Policy

Fixes are permitted after the first run, but under strict rules:

**Permitted fixes after classification**:
- ENGINE_GAP cases: engine work to add the missing archetype — permitted, but only if the fix is generic (applies to all cases of that type) and does not reference the holdout fixture's specific content
- INPUT_MODEL_GAP cases: adding a generic sub-mechanism — permitted, following the same leakage rules as Phase 2A–4B; any new sub-mechanism must be described in terms of its generic detection logic, not in terms of what it does for the specific holdout case
- HOLDOUT_ERROR cases: correcting the fixture — permitted only with domain expert sign-off

**Prohibited fixes**:
- Changing `scoringContract.ts` thresholds to make more cases pass
- Adding `must_identify` vocabulary to the composer that was derived by reading holdout fixture answer keys
- Reclassifying SCORING_LIMITATION or HONEST_CEILING as ENGINE_GAP to justify composer changes

**After any fix**: Re-run the full holdout (sealed set unchanged). The re-run result is the second data point. If first-run failed the pass target but second-run passes, document both results honestly. The second run is not the "real" result — both runs are real.

---

## Success Metrics Summary

| Metric | First-Run Target | Minimum for Public Claim |
|---|---|---|
| Supported pass rate | ≥ 60% | ≥ 70% (on ≥ 20 accepted cases) |
| Average totalScore | ≥ 0.65 | ≥ 0.70 |
| Bad recommendation violations | 0 | 0 |
| Unsupported abstention quality | 100% | 100% |
| Author independence confirmed | 100% of cases | 100% of cases |
| Leakage audit passed | Required | Required |

A public claim ("OpsIQ correctly diagnoses SMB cases") requires the **minimum for public claim** column, on a second or later run only if the first run was below threshold, with all classification documentation visible.
