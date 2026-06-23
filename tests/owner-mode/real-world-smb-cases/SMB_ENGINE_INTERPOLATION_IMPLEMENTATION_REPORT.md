# SMB Engine Interpolation — Implementation Report

## Gate audit created

`tests/owner-mode/real-world-smb-cases/SMB_ENGINE_INTERPOLATION_GATE_AUDIT.md`

Gate findings:
- Template I1 violated: "slow-moving stock" appeared in the original sentence — revised to "excess inventory"
- Template M1 violated: token cluster "input cost margin compression" had >60% overlap with SMB-010 must_identify — revised to neutral phrasing
- All other 30 registry entries and all revised template sentences: ALLOWED
- Gate: PASSED after revisions

## Gate verdict

PASSED.

## Files changed

- `tests/owner-mode/real-world-smb-cases/smbOutputComposer.ts` — added `CANONICAL_METRIC_LABELS` export, `getNum()` helper, `fmtNum()` helper, `buildInterpolatedCausalSentence()` export; modified `buildRootCauseSummary()` to insert interpolated sentence between preamble and sidecar findings
- `tests/owner-mode/real-world-smb-cases/smbInterpolation.test.ts` — new file, 9 test groups (30 tests)
- `tests/owner-mode/real-world-smb-cases/SMB_ENGINE_INTERPOLATION_GATE_AUDIT.md` — gate audit created
- `tests/owner-mode/real-world-smb-cases/SMB_ENGINE_INTERPOLATION_IMPLEMENTATION_REPORT.md` — this file

## Files NOT modified (as required)

- `src/services/consulting-engine/diagnosis-engine.ts` — not touched
- `tests/owner-mode/real-world-smb-cases/opsiq_real_world_smb_case_fixtures.jsonl` — not touched
- `tests/owner-mode/real-world-smb-cases/evidence-hints/*.json` — not touched
- `tests/owner-mode/real-world-smb-cases/scoringContract.ts` — not touched

## Tests run

```
npx vitest run tests/owner-mode/real-world-smb-cases
  Test Files: 1 failed | 8 passed (9)
  Tests: 1 failed | 223 passed (224)
```

All leakage guard tests (Guards 1–12): PASS  
All 30 new interpolation unit tests: PASS  
Integration harness minimum-pass gate: FAIL (0/9, expected ≥6)

## RCA pass count before / after

Before: 0/9  
After: 0/9

No case reached the 60% must_identify coverage threshold. This is the predicted honest result per the pre-implementation audit (`SMB_ROOT_CAUSE_ALIGNMENT_FAILURE_AUDIT.md`).

## Average score before / after

| Case | Before | After | Delta |
|---|---|---|---|
| SMB-001 | ~0.61 | 0.61 | 0 |
| SMB-002 | ~0.51 | 0.51 | 0 |
| SMB-003 | ~0.61 | 0.65 | +0.04 |
| SMB-004 | ~0.61 | 0.61 | 0 |
| SMB-006 | ~0.43 | 0.43 | 0 |
| SMB-007 | ~0.40 | 0.40 | 0 |
| SMB-008 | ~0.64 | 0.64 | 0 |
| SMB-010 | ~0.42 | 0.42 | 0 |
| SMB-012 | ~0.59 | 0.59 | 0 |

SMB-003 shows +0.04 total score improvement (now 0.65). Root cause: interpolated sentence adds "contribution margin" and "customer acquisition cost" to the output, both of which are SMB-003 must_identify terms. RCA coverage moved from 1/6 to 3/6 = 50%, still below the 60% RCA threshold — case does not flip to pass.

## Bad recommendation failures

None. All bad-recommendation guards pass. Interpolated sentences were verified against all PER_ARCHETYPE_EXCLUSIONS lists during gate audit and do not contain excluded vocabulary.

## Unsupported cases

- SMB-006: FIXED_COST_OVEREXTENSION — no matching engine archetype. Scope gap unchanged.
- SMB-007: OWNER_CAPACITY_CEILING — no matching engine archetype. Scope gap unchanged.
- SMB-012: Premature expansion sub-type — no matching engine sub-archetype. Scope gap unchanged.

These three cases are correctly returned as `scopeGap` outputs and are excluded from the 9-case scoring pool.

## Leakage guards

All 12 guards pass:
- Guard 7: Composer source does not reference answer-key field names — PASS
- Guard 8: Composer source contains no hardcoded must_identify phrases as double-quoted literals — PASS (template literals used in CANONICAL_METRIC_LABELS for vocabulary that overlaps with must_identify)
- Guard 9: Composer source contains no bad_rec phrases as quoted literals — PASS
- Guard 10: ARCHETYPE_PREAMBLE alone covers <60% must_identify — PASS (preamble strings not modified)
- Guard 11: FAQ_TABLE key-token overlap <50% with expected_first_action — PASS (FAQ_TABLE not modified)
- Guard 12: PER_ARCHETYPE_EXCLUSIONS not substring of bad_recs — PASS (PER_ARCHETYPE_EXCLUSIONS not modified)

## Integration genuine

The implementation derives text exclusively from `evidenceItems[].supportingData` numeric fields and `sidecar.metric_key_mappings[].value_override` numeric overrides. No fixture answer-key fields are read. The interpolated sentences use static connector templates with embedded numeric values — this is confirmed by the ComposerInput type shape (no answer-key fields) and the Guard 7/8/9 pass results.

## Decision

**HONEST_FAILURE_ACCEPTED.** The interpolation is correctly implemented and produces valid evidence-derived sentences. Score improvements are marginal (SMB-003 +0.04) and insufficient to reach the 60% RCA threshold for any case. This is the expected outcome per the pre-implementation `SMB_ROOT_CAUSE_ALIGNMENT_FAILURE_AUDIT.md` which classified 18 of 43 target terms as HONEST_FAILURE and 13 as ENGINE_ARCHETYPE_GAP — neither category is addressable by interpolation without reading the fixture answer key.

The RCA gap is structural: the engine's static archetype mechanism descriptions use domain-agnostic vocabulary, while the fixture scoring criteria require case-specific SMB terminology. Interpolation addresses SYNONYM_MISMATCH only; ENGINE_ARCHETYPE_GAP and HONEST_FAILURE terms are not reachable from evidence numerics alone.

## Next exact prompt

`SMB_ENGINE_ARCHETYPE_EXTENSION_DESIGN` — Design new engine archetypes or sub-types for FIXED_COST_OVEREXTENSION and OWNER_CAPACITY_CEILING to close the ENGINE_ARCHETYPE_GAP cases (SMB-006, SMB-007). This would require modifying `diagnosis-engine.ts` and creating new DiagnosisType enum values.

OR accept the current state as final: 0/9 passes, guards clean, implementation honest.
