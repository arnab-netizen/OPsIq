# SMB Benchmark Final Acceptance Report

## Task

`SMB_BENCHMARK_FINAL_ACCEPTANCE_AND_HOLDOUT_PLAN`

Final acceptance assessment for the SMB Owner Mode benchmark track. Read-only. No code changes.

---

## 1. Final Benchmark Status

**Decision: `SMB_INTERNAL_VALIDATION_PASS_HOLDOUT_REQUIRED`**

The SMB Owner Mode benchmark track has reached an internally consistent, leakage-clean honest pass. It is a valid internal engineering benchmark. It is not yet public proof of product capability.

---

## 2. Supported Cases Passed

| Case | Archetype | Sub-mechanism | Score | Passed |
|---|---|---|---|---|
| SMB-001 | WORKING_CAPITAL_STRESS | WC_CASH_CONVERSION_CYCLE | 0.86 | ✓ |
| SMB-002 | INVENTORY_FORECASTING_MISMATCH | WC_INVENTORY_CASH_TRAP | 0.93 | ✓ |
| SMB-003 | UNIT_ECONOMICS_FAILURE | UE_FIXED_COST_BREAKEVEN | 0.84 | ✓ |
| SMB-004 | MARGIN_EROSION | null | 0.73 | ✓ |
| SMB-006 | UNIT_ECONOMICS_FAILURE | UE_PREMATURE_EXPANSION | 0.80 | ✓ |
| SMB-007 | OPERATIONAL_BOTTLENECK | OWNER_CAPACITY_CEILING | 0.86 | ✓ |
| SMB-008 | WORKING_CAPITAL_STRESS | WC_BILLED_NOT_COLLECTED_GAP | 0.88 | ✓ |
| SMB-010 | MARGIN_EROSION | MARGIN_COMMODITY_PASS_THROUGH | 0.86 | ✓ |
| SMB-012 | UNIT_ECONOMICS_FAILURE | UE_PAID_ACQUISITION | 0.89 | ✓ |

**Pass rate: 9/9 (100%) supported cases**

---

## 3. Unsupported Cases Excluded

| Case | Reason |
|---|---|
| SMB-005 | Archetype not yet modelled by diagnosis engine |
| SMB-009 | Archetype not yet modelled by diagnosis engine |
| SMB-011 | Archetype not yet modelled by diagnosis engine |

These 3 cases return SCOPE GAP or abstention output. They are correctly excluded from the pass-rate denominator. Leakage guard G6 and regression lock L8 both enforce this exclusion permanently.

---

## 4. Average Score

**Locked average: 0.85** (across 9 supported cases)

Scoring dimensions:
- ROOT_CAUSE_ALIGNMENT (40%): must_identify ratio ≥ 60% gate, then weighted
- MISSING_INPUT_REQUESTS (20%): anchor-based clarification detection
- FIRST_ACTION_QUALITY (20%): key-token overlap with expected first action
- BAD_RECOMMENDATION_AVOIDANCE (20%): zero-tolerance on flagged phrases

Pass threshold: totalScore ≥ 0.70 AND rca.passed AND bra.passed.

---

## 5. Regression Lock Status

**LOCKED** — 100 permanent assertions in `smbRegressionLock.test.ts` across 9 groups:

- L1: 12-fixture total count and supported/unsupported set membership locked
- L2: Per-case totalScore floors (locked − 0.05 tolerance per case)
- L3: Per-case ROOT_CAUSE_ALIGNMENT.passed = true (9 assertions)
- L4: Per-case BAD_RECOMMENDATION_AVOIDANCE.passed = true (9 assertions)
- L5: Zero bad recommendation violations (aggregate)
- L6: Pass count = 9/9
- L7: Average totalScore ≥ 0.80
- L8: Unsupported cases return scope-gap / abstention (3 assertions)
- L9: No must_identify phrases appear as double-quoted string literals in composer source (63 assertions)

Any regression in composer output, detection logic, or leakage will fail one or more lock tests.

---

## 6. Leakage Remediation History

The benchmark went through two full contamination cycles before reaching its current clean state:

### Contamination Round 1 — archetypeVocabulary() hand-mapping

**Discovered by**: `SMB_NORMALIZATION_LAYER_HOSTILE_AUDIT`

**Mechanism**: The runner's `archetypeVocabulary()` function (~100 lines) was manually populated with phrases directly lifted from fixture `must_identify` lists. This gave the scorer access to answer-key vocabulary before evaluation. Every supported case achieved must_identify coverage purely from this pre-loaded vocabulary, not from engine output.

**Fix**: `SMB_LEAKAGE_REMEDIATION_REPORT` — `archetypeVocabulary()` deleted entirely. 9 sidecar findings containing exact must_identify phrase matches replaced with evidence-neutral language. 10 permanent leakage guards added (`smbLeakageGuard.test.ts`).

**Consequence**: After remediation, 0/9 supported cases passed. This was honest — the pass had been entirely carried by the vocabulary injection, not by genuine output quality.

### Contamination Round 2 — preamble and FAQ overfit

**Discovered by**: `SMB_OUTPUT_COMPOSER_HOSTILE_AUDIT_AFTER_PASS`

**Mechanism**: After the composer was implemented, ARCHETYPE_PREAMBLE entries contained 100% coverage of all 48 must_identify terms across all 9 supported cases via exact or near-exact phrase replication. FAQ_TABLE entries were derived from fixture `expected_first_action`. PER_ARCHETYPE_EXCLUSIONS contained exact substrings of `bad_recommendations_to_flag`.

**Fix**: `SMB_OUTPUT_COMPOSER_CONTAMINATION_REMEDIATION_REPORT` — all three components rebuilt from domain knowledge only. Guards 10, 11, and 12 added to enforce overlap thresholds permanently. Guard 10: preamble covers <60% must_identify per case. Guard 11: FAQ_TABLE has <50% key-token overlap with expected_first_action. Guard 12: no exclusion entry is an exact substring of a flagged bad recommendation.

**Consequence**: After remediation, 0/9 cases passed again. This confirmed the preamble had been the primary score carrier in round 2, not genuine compositional output.

---

## 7. Why the Previous Contaminated Passes Were Invalid

Both contaminated passes failed the same test: **remove the leaking component and the pass collapses**.

Round 1: Remove `archetypeVocabulary()` → 0/9 pass. The vocabulary function was the pass, not the engine.

Round 2: Remove overfit preambles → 0/9 pass. The preambles were the pass, not the composer pipeline.

In both cases, the fixture's `must_identify` terms were available to the output-generating system at construction time, either through direct inclusion or through a vocabulary registry built by reading the fixture answer keys. The scoring system was measuring whether the output contained terms it had been pre-loaded with, not whether the system had independently diagnosed the case.

A benchmark where the answer key is part of the input is not a benchmark.

---

## 8. Why the Current Pass Is More Trustworthy

The current pass satisfies all of the following:

**Structural separation**: `ComposerInput` has no `must_identify`, `expected_first_action`, `bad_recommendations_to_flag`, or `scoring_criteria` field. The composer cannot access the answer key at construction time.

**Derivation traceability**: Every phrase in the output can be traced to one of:
- Standard accounting/consulting domain vocabulary (in CANONICAL_METRIC_LABELS)
- Evidence numerics from `supportingData` or `metric_key_mappings`
- Generic archetype patterns (in ARCHETYPE_PREAMBLE and FAQ_TABLE, post-contamination fix)
- Sub-mechanism vocabulary derived from generic evidence patterns (e.g., "billed vs collected" from detection of "billed"+"collected" in sidecar text — not from the fixture's must_identify list)

**Adversarial guard coverage**: 12 permanent leakage guards plus 63 L9 regression lock assertions defend against both known contamination modes. Any future hand-mapping would need to avoid double-quoted string literals, the preamble overlap threshold, FAQ overlap threshold, and exclusion substring detection simultaneously.

**Honest ceiling documentation**: SMB-008 was explicitly documented as at honest ceiling before a generic sub-mechanism was designed. SMB-008 still cannot match the 6th must_identify term (`collection process failure`) without copying fixture language — and that term is intentionally excluded.

**Controlled vocabulary for sub-mechanisms**: Phase 2A through Phase 4B sub-mechanism vocabulary was reviewed against the leakage guards before acceptance. Approved terms were standard industry phrases that any competent AR consultant would use, not fixture-specific language.

However, the current pass is not unconditional. Three important limitations remain:

---

## 9. Current Limitations

**Limitation 1 — Fixture co-construction risk**: The 12 SMB fixtures and the composer were built in the same development context. Even with leakage guards preventing direct phrase copying, the sub-mechanism vocabulary choices (e.g., "billed vs collected", "accounts receivable timing") may have been influenced by knowledge of what the fixtures were trying to test. This is the core reason holdout validation is required.

**Limitation 2 — 3 unsupported cases**: SMB-005, SMB-009, SMB-011 cannot be scored because the diagnosis engine does not model their archetypes. The actual supported fraction of SMB cases the product handles is unknown until the engine coverage is extended and tested.

**Limitation 3 — Single-scorer dependency**: The benchmark is scored by `scoringContract.ts`, which itself was designed in the same session as the fixtures and the composer. The scoring thresholds (≥60% must_identify, ≥70% totalScore) are not calibrated against human expert judgment. A case could pass the scorer but fail a domain expert review, or vice versa.

**Limitation 4 — 12-case sample**: 12 cases spanning 9 supported archetypes is too small to claim statistical reliability. SMB businesses vary enormously in industry, size, accounting sophistication, and presenting symptom complexity. The 9 covered cases are synthetic constructions, not transcripts of real consulting engagements.

**Limitation 5 — Output form, not outcome**: The benchmark measures whether the composer produces text containing the right phrases, not whether acting on the first-action recommendation actually improved the business. Output quality and business outcome quality are not the same thing.

---

## 10. Why This Is Internal Validation, Not Public Proof

This benchmark is valid for:
- Regression testing: preventing degradation of output quality as the codebase evolves
- Development feedback: identifying which archetypes have vocabulary gaps
- Engineering communication: showing what the system can and cannot express

This benchmark is **not** valid for:
- Marketing claims ("OpsIQ correctly diagnoses X% of SMB cases")
- Product Hunt positioning ("AI-powered business diagnosis")
- Investor claims about diagnostic accuracy
- Any claim that implies real-world validation has been performed

The core reason: **the same team wrote the fixtures, the composer, and the scoring contract.** Even with adversarial leakage guards, this is analogous to a student writing their own exam, their own answer key, and their own grading rubric. The guards prevent cheating, but they cannot overcome the fundamental co-construction problem.

A legitimate public claim requires an independent holdout set with cases constructed by someone who did not read the composer source code or the fixture answer keys.

---

## 11. Required Holdout Test Before SaaS or Product Hunt Claims

### Holdout Validation Plan

**Holdout set size**: 12–25 new SMB cases

**Construction rules**:
- Cases authored by a person who has NOT read `smbOutputComposer.ts`, the existing 12 fixtures, or the existing evidence-hints sidecars
- Cases drawn from real or realistic SMB consulting scenarios (not synthetically constructed to match known archetypes)
- `must_identify` terms defined by the case author using their domain knowledge, not reverse-engineered from the composer
- Sidecars constructed from realistic evidence, not tuned to match any known detection logic
- At minimum: 5 archetypes already covered + at least 3 archetypes NOT yet covered by the engine
- Bad recommendations defined from consulting domain knowledge, not from PER_ARCHETYPE_EXCLUSIONS

**Process rules**:
- Holdout set is sealed until the first test run completes
- The composer and scoring contract are NOT modified between now and the first holdout run
- No sub-mechanism vocabulary additions or detection changes are made in response to seeing holdout case content before the run
- The first run result stands as the unmanipulated measurement, regardless of outcome
- Only AFTER the first run is complete may the team analyze failures and decide what fixes, if any, to make

**Scoring rules**:
- Same `scoringContract.ts`, same thresholds, unchanged
- Same `smbLeakageGuard.test.ts` guards applied to holdout run
- Unsupported cases (archetypes not in engine) reported separately, not counted in denominator
- Pass target: propose before first run, stated in the holdout brief, not adjusted retroactively

**Proposed pass target** (for first holdout run):
- ≥ 60% of supported holdout cases pass (totalScore ≥ 0.70, rca.passed, bra.passed)
- Average totalScore ≥ 0.65 across supported cases
- 0 bad recommendation violations
- No leakage violations detected in holdout run

**Failure classification protocol** (before any fixing):
- For each holdout failure: classify as (a) genuine engine gap, (b) composer vocabulary gap, (c) sidecar evidence gap, (d) scoring calibration issue, or (e) honest ceiling
- Classifications documented before any remediation is begun
- No fix may be described as "tuning to holdout" — all fixes must be described in terms of their generic effect

**Leakage audit**:
- After holdout set is constructed, run the same 12 leakage guards against holdout sidecars
- Run L9 regression lock check against any composer changes made before holdout run
- Confirm no holdout must_identify phrases appear in existing test vocabulary

**Final holdout pass criteria for public claim**:
- ≥ 70% of supported holdout cases pass (proposed; stated before run)
- 0 bad recommendation violations
- No leakage violations
- Independent author confirms they did not read fixture answer keys during case construction

---

## Files Created

- `tests/owner-mode/real-world-smb-cases/SMB_BENCHMARK_FINAL_ACCEPTANCE_REPORT.md` — this file

## Files NOT Modified

All code, fixtures, sidecars, test files, and scoring unchanged.

---

## Final Decision

**`SMB_INTERNAL_VALIDATION_PASS_HOLDOUT_REQUIRED`**

The benchmark is internally consistent, leakage-clean, and regression-locked. It is a trustworthy internal engineering benchmark. It cannot be used as public proof of product capability without an independent holdout validation. The holdout plan above defines the minimum bar for any external claim.
