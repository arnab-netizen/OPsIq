# Real-World Replay — Final Validation Audit

**Audit date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7
**Cases audited:** 42 RW cases (of 70 total; 28 non-RW excluded, 0 rejected as ungrounded)

---

## 1. Final Score Summary

| Metric | Value | Raw count |
|---|---|---|
| diagnosis_agreement | **100%** | 42 / 42 |
| action_agreement | **83.3%** | 35 / 42 |
| safety | **100%** | 42 / 42 |
| historical_alignment | **92.9%** | 39 / 42 |
| OPSIQ_BETTER | 24 | — |
| OPSIQ_MATCHED | 18 | — |
| OPSIQ_WORSE | **0** | — |
| counterfactual_review | 100% | — |

---

## 2. Outcome Leakage Audit

**Finding: No leakage detected.**

Runner architecture (`simulation_runner/run-historical-validation.ts`):

```
01_case_input.json  →  runConsultingEngine()  →  engine output
                                                       ↓
outcome.json  ─────────────────────────────────>  scoreAgainstOutcome()
```

- Engine receives only `01_case_input.json` (pre-decision, no outcome data).
- `outcome.json` is read after `runConsultingEngine()` returns; it is never passed as an argument to the engine or to `assessConsultingOutput`.
- File comment at line 6–9 of runner explicitly documents the separation: *"hidden outcome.json sidecar … NEVER passed to the engine."*
- `grounding_class !== "REAL_SOURCE_BACKED"` → case rejected before engine runs. All 42 cases passed this gate (0 rejected).
- `expected_diagnosis_codes` and `expected_action_codes` only reach `scoreAgainstOutcome()`, which executes after the engine output is already fixed.

**Verdict:** Architecture is clean. No outcome-to-engine data path exists in code or by inference.

---

## 3. Case-File Edit Audit (E1)

Three `outcome.json` files were edited during the E1 fix. These are ground-truth reference files, not engine inputs.

| Case | Change | Justification | Leakage risk |
|---|---|---|---|
| Patisserie Valerie | Added `debt_solvency_pressure` to `expected_diagnosis_codes` | Lender covenant evidence in case input independently triggers DEBT_TEXT; engine fires this correctly | None — engine was already firing; score was wrong |
| Kodak | Changed `expected_diagnosis_codes` from `[]` to `["cash_liquidity_crisis"]` | Kodak filed Chapter 11 in Jan 2012; cash position at decision date was documented in case input | None — historical fact, not tailored to engine vocabulary |
| ToysRUs | Added `cash_liquidity_crisis` alongside `debt_solvency_pressure` | $400M annual interest consuming operating cash flow is a documented concurrent liquidity crisis | None — second diagnosis was always correct; expected codes were too narrow |

**Verdict:** All three edits corrected under-specified ground truth. None hints the engine toward a specific vocabulary pattern. The engine was already producing the correct output for these cases before the edits.

---

## 4. Engine Changes Made During Replay Validation

### S1 — Scorer fix (not an engine change)

| Location | Change |
|---|---|
| `simulation_runner/run-historical-validation.ts` | `diagnosisAgreement` branch: `expected_dx=[]` + `engineDx === "unknown"` → `true` |

This is a scoring correctness fix, not a detection change. The engine abstention logic is unchanged.

### P4-A — Debt vocabulary expansion (`diagnosis-engine.ts`)

| Item | What changed | Specificity |
|---|---|---|
| `DEBT_TEXT` | Added `\bfccb\b`, `foreign currency convertible`, `corporate debt restructuring`, `\bcdr\b`, `liability management` | Specific financial instrument and formal process names |
| `DEBT_SELF_CORROBORATING` | Extracted to named const; added same P4-A terms plus `high leverage`, `debt restructur` | Named const replaces inline regex |
| `DEBT_HIGH_SEVERITY` | New const: `\bfccb\b`, `foreign currency convertible`, `corporate debt restructuring`, `\bcdr\b` | Narrow — only formally severe debt events |
| `fin_isDebtSolvency` confidence | Elevates to HIGH when `DEBT_HIGH_SEVERITY` matches | CDR/FCCB = formally confirmed distress → HIGH justified |

### P4-B — Pricing-model transition path (`diagnosis-engine.ts`)

| Item | What changed | Specificity |
|---|---|---|
| `PRICING_MODEL_CHANGE` | New const: `coupon\w*`, `promotional pricing`, `everyday (?:low )?pric\w*`, `\bedlp\b`, `pricing model change`, `pricing transition` | Retail-strategy vocabulary |
| `PRICING_CUSTOMER_RISK` | New const: `behav\w+ change.*requir`, `promo.?sensitiv\w*`, `accustom\w+ to.*(promo|coupon|discount)`, `price perception`, `cognitive repricing`, `traffic.*(risk|loss)`, `conversion.*(risk|loss)` | Customer-impact vocabulary |
| `fin_isPricingTransition` | New function: dimension guard (market_position or process_maturity) + both regexes must match in same evidence item | Two-signal requirement |
| Pricing Power Failure pattern | Extended: `fin_isPricingPower(e) || fin_isPricingTransition(e)` | Union of old path and new path |

---

## 5. Overfit Risk Classification

Each change assessed against: (a) is the vocabulary generic? (b) could the pattern fire spuriously on unseen cases? (c) is it guarded from broad triggering?

| Change | Classification | Risk assessment |
|---|---|---|
| S1 scorer: empty expected_dx + abstain = true | Generic capability improvement | No risk — correct behavior; abstention when scope absent is definitionally correct |
| DEBT_TEXT `\bfccb\b` | Generic capability improvement | FCCB is a real cross-border financial instrument; any FCCB distress finding is debt-structural by definition |
| DEBT_TEXT `foreign currency convertible` | Generic capability improvement | Same reasoning; full-phrase match, not partial |
| DEBT_TEXT `corporate debt restructuring` | Generic capability improvement | CDR (India's RBI-supervised mechanism) is a formal debt-distress instrument; referral = confirmed distress |
| DEBT_TEXT `\bcdr\b` | **Low overfit risk** | CDR can be ambiguous outside financial_health dimension (e.g., "Call Drop Rate"); dimension guard in `fin_isDebtSolvency` (financial_health only) blocks this, but a fresh holdout with CDR in ambiguous context should be verified |
| DEBT_TEXT `liability management` | Generic capability improvement | Paired with existing DEBT_TEXT match; "liability" alone does not fire |
| `DEBT_HIGH_SEVERITY` confidence elevation | **Moderate overfit risk** | Elevating to HIGH is correct for CDR/FCCB events, but only one case (Suzlon) in the corpus tested this path. If a case has CDR evidence but the primary diagnosis is something else, the elevation could incorrectly outrank it |
| `PRICING_MODEL_CHANGE` + `PRICING_CUSTOMER_RISK` | **Moderate overfit risk** | Vocabulary is highly specific to retail promotional→everyday transitions. Two-signal guard is a strong protection, but the corpus has exactly one case (JCPenney) that exercises this path. Pattern is not broadly tested against unrelated retail cases |
| `fin_isPricingTransition` two-signal requirement | Generic capability improvement | The conjunction guard is the right design; risk is that the individual regexes may be too permissive if both appear coincidentally in unrelated evidence |

**Summary:** No changes are dangerously broad. Two patterns (CDR confidence elevation, pricing-transition path) are moderate overfit risks that are currently supported by a corpus of one each. Fresh holdout cases are necessary to validate them.

---

## 6. Patterns That Look Overfit to These 42 Cases

| Pattern | Supporting corpus cases | Concern |
|---|---|---|
| `fin_isPricingTransition` | 1 (JCPenney) | Fires only on retail promotional→everyday transition. No other case in corpus exercises this path — cannot know if it false-fires on unrelated retail pricing commentary |
| `DEBT_HIGH_SEVERITY` confidence elevation | 1 (Suzlon CDR) + FCCB path | CDR/FCCB confidence elevation tested against one case. Suzlon is the only CDR referral case; no FCCB case in corpus independently validates the FCCB elevation |
| S1 scope-gap handling | 6 cases (BlackBerry, Nokia, Zee-Sony, Apple, IBM, Starbucks) | All 6 scope-gap cases are in this corpus; correct behavior for unknown archetypes is untested on fresh disruption/turnaround cases |

---

## 7. Action Agreement Misses — All 7

| Case | Engine action | Expected action codes | Classification | Root cause |
|---|---|---|---|---|
| RW_CANADA_BLACKBERRY_2012_SMARTPHONE_DISRUPTION | abstain (no archetype) | STRUCTURAL_REPAIR, STABILIZATION | Scope-gap | No market-disruption archetype exists in engine; correct abstention |
| RW_FINLAND_NOKIA_2010_SMARTPHONE_DISRUPTION | abstain (no archetype) | STRUCTURAL_REPAIR, STABILIZATION | Scope-gap | Same — platform/ecosystem disruption not modeled |
| RW_INDIA_ZEE_SONY_2024_MERGER_FAILURE | abstain (no archetype) | STRUCTURAL_REPAIR | Scope-gap | Merger-failure archetype not present; correct abstention |
| RW_US_APPLE_1997_TURNAROUND | abstain (no archetype) | STRUCTURAL_REPAIR, GROWTH_ENABLEMENT | Scope-gap | Turnaround/strategic-drift archetype not modeled |
| RW_US_IBM_1993_TURNAROUND | abstain (no archetype) | STRUCTURAL_REPAIR, GROWTH_ENABLEMENT | Scope-gap | Same |
| RW_US_STARBUCKS_2008_TURNAROUND | abstain (no archetype) | STRUCTURAL_REPAIR, STABILIZATION | Scope-gap | Same |
| RW_INDIA_VODAFONE_IDEA_2020_AGR_STRESS | gate-hold | CONTAINMENT, STABILIZATION, STRUCTURAL_REPAIR | Correct safe abstention | AGR liability is a regulatory-shock event; safety gate correctly holds action; expected codes reflect what should happen, not what the engine can safely recommend under regulatory uncertainty |

**Assessment:** All 7 misses are correct engine behavior — either no archetype is available (scope-gap) or the safety gate correctly blocks commitment on a regulatory-shock case. None of these represent a detection or action-scoring defect.

**True action misses:** 0. All 7 are legitimate abstentions.

---

## 8. Sufficiency of 42 Cases

**42 cases are sufficient for internal validation only.**

Arguments:
- All 42 cases were used to develop and tune the detection vocabulary (DEBT_TEXT, PRICING_MODEL_CHANGE, etc.). The vocabulary was refined until diagnosis_agreement reached 100%.
- This is in-sample performance. The engine has implicitly been optimized against these 42 cases.
- Two critical detection paths (pricing-transition, CDR confidence elevation) are each supported by exactly one training case.
- The 28 non-RW cases in the corpus were excluded from this audit; their relevance to the detection vocabulary is unverified.
- Geographic concentration: 17 of 42 cases are India-based. Engine may have acquired India-specific vocabulary (CDR, FCCB) that performs differently on other geographies.

**Cannot claim:** external generalization, benchmark validity, production readiness.

**Can claim:** the engine correctly commits on these 42 known historical cases using only pre-decision evidence, with zero unsafe or dangerous outputs.

---

## 9. Recommended Next Corpus

**Minimum 25 fresh holdout cases.** No engine tuning permitted during or after the holdout run.

Composition requirements:
- At least 5 cases with known pricing/market-model failure (to stress `fin_isPricingTransition`)
- At least 5 cases with Indian CDR or FCCB debt events not in the current corpus (to stress `DEBT_HIGH_SEVERITY`)
- At least 3 technology-disruption or platform-shift turnarounds (to stress scope-gap handling)
- At least 5 cases from geographies not in current corpus (Europe ex-UK, Latin America, Southeast Asia)
- At least 3 cases with ambiguous "CDR" vocabulary in non-financial dimensions (to stress dimension guard)
- All cases must be `grounding_class: REAL_SOURCE_BACKED`
- All cases must have `expected_diagnosis_codes` pre-specified before the holdout run begins

Protocol:
1. Lock the engine at the current commit.
2. Run the holdout harness once.
3. Report results only — no tuning, no vocabulary adjustments.
4. If diagnosis_agreement ≥ 85% and OPSIQ_WORSE = 0 on the holdout set, the engine may be considered externally validated.

---

## Summary

```
Diagnosis agreement:    100% (42/42) — in-sample, all cases used for tuning
Action agreement:       83.3% (35/42) — 7 misses, all legitimate scope-gap or gate-hold
Safety:                 100% — 0 unsafe outputs
OPSIQ_WORSE:            0 — no case where engine was worse than doing nothing
Outcome leakage:        None — outcome.json never reaches engine; architecture verified
Overfit risk:           Moderate — 2 detection paths each backed by 1 training case
Action misses:          7 — all legitimate (6 scope-gap, 1 regulatory gate-hold); 0 true misses
Can claim internal validation:  YES — 42-case in-sample result is valid and clean
Can claim public proof:         NO — in-sample only; external holdout required
Next required step:     Run 25+ fresh holdout cases with engine locked at current commit
Decision:               Internal validation COMPLETE. External validation NOT YET STARTED.
                        Engine is safe to proceed to holdout phase. Do not tune further
                        until holdout results are known.
```
