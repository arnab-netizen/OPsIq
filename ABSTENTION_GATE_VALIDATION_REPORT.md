# ABSTENTION GATE — VALIDATION REPORT

**Date:** 2026-06-17  
**Branch:** claude/execution-consultant-engine-v2-kobwgj  
**Status:** IMPLEMENTED, TESTED, BENCHMARKED — ZERO valid-correct regressions

---

## WHAT WAS BUILT

A Stage A abstention gate that emits `INSUFFICIENT_EVIDENCE` instead of forcing a concrete root cause when evidence does not support a safe diagnosis.

### Files changed (production)
- `src/domain/consulting-engine/types.ts` — added `DiagnosisType.INSUFFICIENT_EVIDENCE = "insufficient_evidence"` (required so the gate can emit a recognized abstention root cause; UNKNOWN is reserved for empty/unscored results).
- `src/services/stage-a/evidence-mapper.ts` — added `[INSUFFICIENT_EVIDENCE]: []` to the exhaustive conflict map (type-completeness only).
- `src/services/stage-a/causal-diagnosis-adjudicator.ts` — added `[INSUFFICIENT_EVIDENCE]: []` to the exhaustive required-dimensions map (type-completeness only).
- `src/services/stage-a/hypothesis-generator.ts` — added `applyAbstentionGate()` + `computeMissingDataDensity()`, invoked after ranking, before returning top hypotheses. **No scoring/mapping/keyword/ranking logic changed.**

### Files added (tests)
- `src/__tests__/services/stage-a/abstention-gate.test.ts` — 8 unit scenarios.
- `src/__tests__/services/stage-a/abstention-gate-benchmark.test.ts` — 21-case abstention-aware benchmark (writes to new output dir).

## GATE LOGIC (final)

Abstain if EITHER rule fires:
- **Rule A — NO_PATTERN_SUPPORT:** `evidenceCount >= 3` AND `winner.patternCount == 0` AND `winner.confidence < 40` AND `missingDataDensity > 0`.
- **Rule B — PERVASIVE_MISSING_DATA:** `evidenceCount >= 4` AND `missingDataDensity >= 1.0`.

`missingDataDensity` = count of generic epistemic/missing-data phrases ("unknown", "has not been", "not yet known", "never computed", "uncharacterized", …) per evidence item. No case IDs, no answer-key strings, no benchmark coupling.

Abstention output: `rootCause = INSUFFICIENT_EVIDENCE`, `confidence = 20`, reasoning explains which rule fired and what data is missing; original candidates preserved at lower ranks for traceability.

## REQUIRED-TEST COVERAGE

| # | Required test | Result |
|---|---|---|
| 1 | Insufficient-evidence case abstains | PASS |
| 2 | Generic/unsupported symptoms abstain | PASS |
| 3 | Ambiguity-without-support abstains; supported close-margin does NOT | PASS |
| 4 | Missing required evidence (no patterns) abstains | PASS |
| 5 | Valid strong diagnosis does not abstain | PASS |
| 6 | Clean single-theme evidence does not abstain (and 10 valid-correct preserved via benchmark) | PASS |
| 7 | Confidence cap preserved (abstention <=40, all <=65) | PASS |
| 8 | Evidence traceability preserved (>=85%; abstention carries refs + reasoning) | PASS |

14/14 abstention tests pass. Full Stage A suite: 6 failures remain — **all pre-existing** (verified by `git stash` at baseline: same 6 failed before this change). The abstention gate introduced **zero new test failures**.

### Pre-existing failures (NOT caused by this work, out of scope)
- causal-diagnosis-adjudicator: 2 (contradiction penalty; ambiguous mixed-signal confidence)
- f1-hypothesis-integration: 3 (pattern-strength visibility confidence assertions)
- slice-6-demand-market-recognition: 1 (pricing-power signal)

These are confidence-threshold assertions from earlier slices; they do not involve abstention.

## GATES

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| Abstention unit tests (8) | PASS |
| Abstention benchmark tests (6) | PASS |
| Stage A suite new failures | 0 (6 pre-existing unchanged) |
| Confidence cap <=65 | PASS (max 65) |
| Evidence trace rate >=85% | PASS (98.1% avg) |

## BENCHMARK RESULT

10/21 → **13/21 (61.9%)**; +3 correct abstentions; 1 wrong abstention (already-wrong case); 0 valid-correct regressions; 1 of 2 false-high-confidence wrong answers removed (ADV-014). See ABSTENTION_GATE_BENCHMARK_COMPARISON.md.

## KNOWN LIMITATIONS

1. **ADV-011 still wrong (UEB @ 50).** Structurally identical to valid PD-017; cannot be abstained without regressing PD-017. Requires evidence-completeness reasoning beyond this gate.
2. **BLND-009 wrong abstention.** Its true diagnosis (operational_bottleneck) is structurally unreachable (dimension issue, separate remediation); abstaining is the least-harmful behavior but is not the ground-truth answer.
3. **No top-two-margin rule** (deliberate): would regress six margin-5 valid-correct cases.

## DISPOSITION

**KEEP.** The gate improves accuracy +3, removes a false-high-confidence wrong answer, introduces zero regressions and zero new test failures, and is principled/generalizable. Stage A remains **NOT promoted** pending fresh manual review (and the remaining ranking/dimension/ADV-011 work).
