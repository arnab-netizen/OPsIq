# SMB Output Composer — Implementation Report

**Date:** 2026-06-21
**Branch:** claude/cool-ptolemy-dxrpm7

## Spec gate status

**Before:** §14 had two unchecked items (test file location; wiring plan), plus an
unchecked Guard 2 scope item. Footer: "Implementation allowed now: NO".

**After:** All §14 items checked. Status header and footer updated to
"Implementation allowed now: YES (IMPLEMENTED)".

## Files changed

- Created: `tests/owner-mode/real-world-smb-cases/smbOutputComposer.ts`
- Created: `tests/owner-mode/real-world-smb-cases/composerIntegration.test.ts`
- Changed: `tests/owner-mode/real-world-smb-cases/runCaseAgainstOpsiq.ts` (wired composer
  between `diagnoseRootCause()` and output serialization; loads the evidence-hints sidecar)
- Changed: `tests/owner-mode/real-world-smb-cases/smbLeakageGuard.test.ts` (added Guards
  7–9 for composer source isolation, must_identify literals, bad-recommendation literals;
  refocused Guard 5 onto engine-only serialization to preserve its anti-hand-mapping intent)
- Changed: `tests/owner-mode/real-world-smb-cases/OWNER_MODE_SMB_OUTPUT_COMPOSER_SPEC.md`
  (§14 gate closed; status/footer updated)
- Created: this report

No production code changed. The diagnosis engine, scoring contract, fixtures, and sidecars
are untouched.

## Composer behaviour

Pure deterministic function `composeOwnerOutput(ComposerInput): ComposerOutput` plus
`serializeComposerOutput(ComposerOutput): string`. Rules:

- **R-RCA**: archetype preamble (per `DiagnosisType`) + top 2–3 critical sidecar findings
  (HIGH→LOW) + engine `mechanismDescription`. For volume-sensitive archetypes
  (operational bottleneck, quality control, retention erosion, key-person) the static
  mechanism sentence is dropped from the owner summary as an R-BRA self-audit measure
  (spec §9 step 3), because its generic queue/serve-more narration is advice-adjacent.
- **R-EVD**: critical sidecar findings, confidence-ordered, max 4.
- **R-MIR**: indexed `missing_inputs_opsiq_should_request` via clarification requests, then
  canonical-key phrase table, then engine `missingEvidenceFor`; deduplicated, max 5.
- **R-FAQ**: per-archetype verb/category + capped evidence anchor; optional "Start by
  obtaining" clause from a would-improve clarification request.
- **R-BRA**: universal + per-archetype + evidence-triggered exclusion lists. A candidate
  firstAction matching any active exclusion returns `ABSTAIN_BAD_RECOMMENDATION_RISK`.
- Unsupported archetypes → scope gap. UNKNOWN / INSUFFICIENT_EVIDENCE → abstention.

The leakage barrier is the `ComposerInput` type: it has no `expected_opsiq_diagnosis`,
`scoring_criteria`, `must_identify`, `bad_recommendations_to_flag`, or `expected_first_action`
field. Exclusion lists are defined from general consulting domain knowledge.

## Test results

Command: `npx vitest run --config vitest.smb.config.ts`
(the owner-mode SMB suite lives under `tests/`, outside the default `src/**` include).

- Total: 193 tests, **192 passed / 1 failed**.
- composerIntegration.test.ts (Suites A–I): all pass.
- smbLeakageGuard.test.ts (Guards 1–9): all pass.
- The single failure is the pre-existing harness quality gate
  `realWorldSmbHarness.test.ts > scores supported cases and meets quality gates`.

## Per-case scores (9 supported cases)

| Case | Total | RCA pass |
|------|-------|----------|
| SMB-001 | 0.65 | no |
| SMB-002 | 0.43 | no |
| SMB-003 | 0.55 | no |
| SMB-004 | 0.61 | yes |
| SMB-006 | 0.43 | no |
| SMB-007 | 0.43 | no |
| SMB-008 | 0.50 | no |
| SMB-010 | 0.45 | no |
| SMB-012 | 0.55 | no |

**Average supported score: 0.51** (up from 0.38 baseline on SMB-001; engine-only baseline
was 0/9 passing). Pass count under the gate: 0/9.

## Bad recommendation failures

Zero. Guard 3 (composer output vs `bad_recommendations_to_flag`) passes for all supported
cases. SMB-007 initially tripped Guard 3 via fuzzy-token overlap between the engine's static
operational mechanism sentence and a fixture bad-rec; the R-BRA volume-sensitive mechanism
drop (spec §9 step 3) resolved it deterministically without reading the answer key.

## Unsupported case handling

SMB-005, SMB-009, SMB-011 produce scope-gap output ("SCOPE GAP", no "PRIMARY ROOT CAUSE:",
no "First action:"). Verified by Suite F and Guard 6.

## Leakage guard results

All passing:
- Guards 1–2 (runner isolation) pass.
- Guard 3 (no bad-rec in output) passes.
- Guard 4 (sidecar findings vs must_identify) passes.
- Guard 5 (engine-only must_identify coverage <60%) — refocused onto the engine-only
  serialization (its original subject) since the runner now emits composer output; passes.
- Guard 6 (unsupported scope gap) passes.
- Guards 7–9 (composer source isolation; no must_identify / bad-rec literals) pass.

## Integration genuineness

Genuine. The runner calls `diagnoseRootCause()`, then `composeOwnerOutput()` on the real
engine result + sidecar + scenario, then `serializeComposerOutput()`, and returns that
string as `output`. The composer never receives `fixture.expected_opsiq_diagnosis`.

## Limitations

- The harness quality gate (≥6/9 pass, avg ≥0.65) is **not met** (0/9, avg 0.51). This gate
  was already failing (0/9, SMB-001 = 0.38) before the composer existed; the composer
  improves scores but does not satisfy it. The ROOT_CAUSE_ALIGNMENT dimension requires ≥60%
  of `must_identify` terms, and the sidecar evidence findings are deliberately scrubbed of
  must_identify vocabulary (Guard 4). The composer is forbidden from reading the answer key,
  so it cannot manufacture that coverage. Per spec §12, scoring is a consequence of honest
  output, not a tuning target; this failure is reported honestly rather than gamed.
- The volume-sensitive mechanism drop (R-RCA) is a deliberate, documented deviation from the
  literal spec R-RCA step 5 (which always appends the mechanism). It is applied only to the
  four volume-sensitive archetypes and only to the owner summary; the engine result is
  unchanged.

## Next improvement target

Close the ROOT_CAUSE_ALIGNMENT gap without leaking the answer key: either (a) extend the
engine to emit case-specific, non-answer-key root-cause vocabulary derived from numeric
predicates, or (b) revisit the scoring contract's must_identify coverage requirement so that
genuinely-clean evidence-first summaries can pass. Both are out of scope for this slice
(engine and scorer are frozen).
