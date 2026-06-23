# SMB Output Composer Contamination Remediation Report

## Files changed:
- `tests/owner-mode/real-world-smb-cases/smbOutputComposer.ts` — rewrote ARCHETYPE_PREAMBLE, FAQ_TABLE, PER_ARCHETYPE_EXCLUSIONS; exported all three for test use
- `tests/owner-mode/real-world-smb-cases/smbLeakageGuard.test.ts` — added Guards 10, 11, 12

## Leakage removed:
1. **ARCHETYPE_PREAMBLE** — replaced multi-sentence preambles containing exact must_identify vocabulary with short generic diagnostic labels (e.g., "Diagnosis: working capital stress."). No preamble now contains must_identify terms.
2. **FAQ_TABLE** — replaced all first-action entries that shared >=50% key-token overlap with fixture expected_first_action fields with independently-derived, archetype-reasoned first-action patterns using only approved verbs.
3. **PER_ARCHETYPE_EXCLUSIONS** — removed all entries that were exact substrings of fixture bad_recommendations_to_flag phrases (e.g., "hire a sales", "acquire more clients", "expand product range", "increase ad spend", "work harder", "open more locations") and replaced with broad category-level signals derived from archetype reasoning only.
4. **Composer source comments** — removed all references to fixture answer-key field names from comments.

## Guards added:
- **Guard 10**: Verifies composer preamble covers <60% of must_identify terms for each supported case. Prevents future preamble contamination.
- **Guard 11**: Verifies FAQ_TABLE first-action text has <50% key-token overlap with fixture expected_first_action. Key tokens = first 6 words >4 chars from expected_first_action. Prevents future FAQ contamination.
- **Guard 12**: Verifies no PER_ARCHETYPE_EXCLUSIONS entry is an exact substring of any fixture bad_recommendations_to_flag phrase. Prevents future exclusion list contamination.

## Tests run:
`npm run test:owner-real-world-smb` — 199 total tests across 8 test files.

## Harness pass/fail:
FAIL — 0/9 supported cases passed (gate requires >=6/9). 198/199 other tests pass.

## Average score:
- SMB-001: 0.59 (ROOT_CAUSE_ALIGNMENT failure)
- SMB-002: 0.43 (ROOT_CAUSE_ALIGNMENT failure)
- SMB-003: 0.55 (ROOT_CAUSE_ALIGNMENT failure)
- SMB-004: 0.61 (no subscore failure, total below gate)
- SMB-006: 0.43 (ROOT_CAUSE_ALIGNMENT failure)
- SMB-007: 0.40 (ROOT_CAUSE_ALIGNMENT failure)
- SMB-008: 0.50 (ROOT_CAUSE_ALIGNMENT failure)
- SMB-010: 0.42 (ROOT_CAUSE_ALIGNMENT failure)
- SMB-012: 0.59 (ROOT_CAUSE_ALIGNMENT failure)
- Average: approximately 0.50 (gate requires >=0.65)

## Bad recommendation failures:
Zero. Guard 3 (runner output vs bad recommendations) passed for all 9 supported cases.

## Integration genuine:
No. The contamination removal caused ROOT_CAUSE_ALIGNMENT to collapse as predicted. The old preambles were artificially inflating ROOT_CAUSE_ALIGNMENT by front-loading exact must_identify vocabulary into rootCauseSummary. Without that leakage, the engine's own output and sidecar evidence findings alone are insufficient to meet the 60% must_identify coverage threshold. This is an honest measurement of a real gap in engine output richness.

## Decision:
Contamination has been removed and failure is reported honestly. The harness gate failure is a direct, expected consequence of removing artificial must_identify leakage from the composer preambles. The previous preambles were scoring inflators, not domain descriptions. This failure accurately reflects the gap between engine capability and the quality gate. Do not attempt to recover pass rate by re-injecting fixture vocabulary.

## Next exact prompt:
"Improve ROOT_CAUSE_ALIGNMENT scores for the 9 supported SMB cases without modifying the fixtures, scoringContract.ts, or diagnosis-engine.ts, and without injecting fixture must_identify terms into the composer, sidecar, or runner. Specifically: (1) audit each sidecar evidence-hints file and strengthen the evidence findings to more precisely name the causal mechanism without leaking must_identify terms — verify against Guard 4 and Guard 10 after each change; (2) check whether the engine mechanismDescription for each archetype already names the required concepts or whether it needs enrichment in the engine itself; (3) re-run the harness after each batch of sidecar improvements to measure progress toward >=6/9 pass and average >=0.65. Do not touch scoringContract.ts, diagnosis-engine.ts, or fixtures. Do not add must_identify terms to any source file. Accept the result honestly after each run."
