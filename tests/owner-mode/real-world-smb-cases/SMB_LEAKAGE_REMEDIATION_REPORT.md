# SMB Leakage Remediation Report

## Mission

`SMB_NORMALIZATION_LAYER_LEAKAGE_REMEDIATION` — remove vocabulary hand-mapping and sidecar
outcome-leakage discovered by the hostile audit, add permanent regression guards, run
tests honestly and accept lower scores.

---

## FIX 1 — Removed archetypeVocabulary() from runner

**File:** `tests/owner-mode/real-world-smb-cases/runCaseAgainstOpsiq.ts`

**Change:** Deleted the `archetypeVocabulary()` function (~100 lines) and removed the `DiagnosisType`
import. The runner now uses only:
- `primary.type` — engine enum label
- `primary.description` — engine's own description string
- `primary.mechanismDescription` — engine's own mechanism string
- `primary.missingEvidenceFor` — engine's own missing-evidence list
- `diagnosisResult.confidence` — engine confidence level
- `diagnosisResult.warningFlags` — engine warning flags

No hardcoded vocabulary. No fixture-derived phrases. No answer-key injection.

---

## FIX 2 — Removed sidecar outcome-leakage

The hostile audit identified 3 leakages. A comprehensive scan found 9 total leakages across
8 sidecars. All 9 have been fixed.

| Case | Item | Leaked term | Scoring contract match | Fix |
|---|---|---|---|---|
| SMB-002 | [1] | "slow-moving stock" | EXACT (3-token ≤3) | Changed to "excess of others" |
| SMB-002 | [4] | "inventory turnover" | EXACT (2-token ≤3) | Changed to "stock cycling rate" |
| SMB-003 | [4] | "contribution margin" | EXACT (2-token ≤3) | Changed to "per-customer economics negative by" |
| SMB-003 | [4] | "negative contribution after CAC" | 100% (4/4 tokens) | Same fix as above |
| SMB-004 | [5] | "occupancy is not the problem" | 100% (4/4 tokens) | Changed to "demand appears adequate and is not causing the revenue shortfall" |
| SMB-006 | [4] | "breakeven occupancy" | EXACT (2-token ≤3) | Changed to "occupancy needed for cost coverage" |
| SMB-008 | [4] | "days sales outstanding" | EXACT (3-token ≤3) | Changed to "average invoice-to-payment lag 67 days" |
| SMB-009 | [4] | "training cost per hire" | 100% (4/4 tokens) | Changed to "onboarding cost $1,800 per new employee" |
| SMB-012 | [1] | "profitable original location subsidizing expansion" | 100% (5/5 tokens) | Changed to "location 1 is net-positive and offsetting losses at locations 2 and 3" |

Validation notes in all 8 affected sidecars updated to document the fix.

---

## FIX 3 — Created smbLeakageGuard.test.ts

**File:** `tests/owner-mode/real-world-smb-cases/smbLeakageGuard.test.ts`

10 permanent regression guard tests in 6 suites:

| Guard | What it detects |
|---|---|
| 1a | Runner source references `expected_opsiq_diagnosis` |
| 1b | Runner source references `scoring_criteria` |
| 1c | Runner source references `must_identify` |
| 1d | Runner source references `bad_recommendations_to_flag` |
| 2 | Runner source contains hardcoded must_identify phrase string literals |
| 3 | Runner output for supported cases contains bad_recommendations_to_flag phrases (strict 80%) |
| 4 | Sidecar findings contain must_identify leakage at strict 80% threshold |
| 5 | Engine output covers ≥60% of must_identify terms per case (signals hand-mapping) |
| 6a | Unsupported cases return unsupportedArchetype=true and SCOPE GAP output |
| 6b | Unsupported count = 3, supported count = 9 |

Guard 2 checks RUNNER SOURCE not runner output, because the engine itself legitimately uses
industry-standard terms ("cash conversion cycle", "working capital", "contribution margin",
"DSO", "unit economics") in its own description and mechanismDescription fields. Checking
source prevents future vocabulary re-injection without producing false positives on engine output.

---

## FIX 4 — Honest test run results

### Leakage guard tests: ALL PASS (10/10)
- Guard 1 (source isolation): 4/4 ✓
- Guard 2 (source vs must_identify literals): 1/1 ✓
- Guard 3 (runner output vs bad recs): 1/1 ✓
- Guard 4 (sidecar findings vs must_identify): 1/1 ✓
- Guard 5 (engine coverage < 60%): 1/1 ✓
- Guard 6 (unsupported cases): 2/2 ✓

### Integration harness: FAILS HONESTLY

**Gate 2 (≥6/9 pass rate): FAIL — 0/9 cases pass**

| Case | Total | RCA | MIR | FAQ | BRA | Passed |
|---|---|---|---|---|---|---|
| SMB-001 | 0.38 | FAIL | — | — | PASS | NO |
| SMB-002 | 0.27 | FAIL | — | — | PASS | NO |
| SMB-003 | 0.45 | FAIL | — | — | PASS | NO |
| SMB-004 | 0.20 | FAIL | — | — | PASS | NO |
| SMB-006 | 0.20 | FAIL | — | — | PASS | NO |
| SMB-007 | 0.23 | FAIL | — | — | PASS | NO |
| SMB-008 | 0.27 | FAIL | — | — | PASS | NO |
| SMB-010 | 0.23 | FAIL | — | — | PASS | NO |
| SMB-012 | 0.32 | FAIL | — | — | PASS | NO |

All cases fail ROOT_CAUSE_ALIGNMENT. The engine's own description and mechanismDescription
fields are generic archetype summaries. They match 0–30% of case-specific must_identify terms
because must_identify terms are by design case-specific phrases that require case-specific
language to match.

**This is the correct and expected result.** The previous 100% pass rate was manufactured by
archetypeVocabulary() which pre-loaded 100% must_identify coverage for each archetype from the
fixture answer keys. Without that injection, the engine's genuine output does not reach the 60%
must_identify threshold required by ROOT_CAUSE_ALIGNMENT.

**Bad recommendation gate: PASS on all cases.** The engine's own output is clean.

**Unsupported cases (SMB-005, SMB-009, SMB-011): correctly excluded** from denominator.

---

## Audit Finding Resolution

| Hostile Audit Finding | Status |
|---|---|
| F1 CRITICAL: archetypeVocabulary hand-mapping | FIXED — vocabulary removed entirely |
| F2 MODERATE: sidecar leakage (3 cases) | FIXED — 9 leakages across 8 sidecars removed |
| F3 INFORMATIONAL: harness measures classification not quality | DOCUMENTED — harness now honestly fails |
| F4 PASS: bad rec gate reliable | CONFIRMED — still passes without vocabulary |
| F5 PASS: engine integration genuine | CONFIRMED — engine call unchanged |
| F6 PASS: unsupported cases handled | CONFIRMED — still correct |
| F7 PASS: average over supported only | CONFIRMED — still correct |

---

## Test Summary

```
Test Files: 1 failed | 6 passed (7)
     Tests: 1 failed | 133 passed (134)
```

The 1 failing test is the harness quality gate. This failure is honest and expected.
The 10 new leakage guard tests all pass.

---

## Decision

**REMEDIATION COMPLETE.**

The integration layer is now free of vocabulary hand-mapping and sidecar outcome-leakage.
The test result is honest: the engine does not produce output that scores above the quality
gate when no vocabulary is injected. Future re-injection of vocabulary would be caught by
the 10 leakage guard tests before any integration test could falsely pass.
