# ESLint Debt Forensic Report

**Date:** 2026-06-23  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Starting state**: 7 warnings, 0 errors  
**Final state**: 0 warnings, 0 errors

---

## Warnings eliminated

### `simulationScoringContract.ts:295` — unused parameter `_fixture`

`scoreReassessmentQuality()` accepted a `SimulationFixture` parameter that was never read inside the function body. The parameter was added for anticipated future use but the function scores only output text.

**Fix**: Removed the parameter from the signature and updated the call site at line 373.

---

### `fixtureSchema.test.ts:68` — unused binding `_removed`

Destructuring `const { primary_root_cause: _removed, ...rest } = dx` created a binding to discard the `primary_root_cause` key. The `_removed` name was intentional but the ESLint config has no `argsIgnorePattern` exception.

**Fix**: Replaced destructuring with `Object.fromEntries(Object.entries(dx).filter(([k]) => k !== "primary_root_cause"))`.

---

### `smbPhase3SubMechanism.test.ts:24` — unused import `serializeComposerOutput`

`serializeComposerOutput` was imported from `smbOutputComposer` but never called in the Phase 3 test file. It was likely left over from a copy-paste during test authoring.

**Fix**: Removed the import.

---

### `smbPhase3SubMechanism.test.ts:41` — unused function `loadSidecar`

`loadSidecar()` was defined but never called in `smbPhase3SubMechanism.test.ts`. Phase 3 tests use `runCaseAgainstOpsiq()` for full-engine integration, which internally handles sidecar loading.

**Fix**: Removed the function definition and its dependent `SIDECAR_DIR` constant.

---

### `smbSubMechanism.test.ts:26` — unused import `scoreOutput`

`scoreOutput` was imported from `./scoringContract` but never called. Phase 2A sub-mechanism tests verify `detectSubMechanism` return values directly, not end-to-end scores.

**Fix**: Removed the import.

---

### `smbSubMechanism.test.ts:605` — unused constant `REGRESSION_TOLERANCE`

`REGRESSION_TOLERANCE = 0.03` was defined but never applied in the test body. The test at line 607 only asserts `expect(baseline).toBeGreaterThan(0)` and `toBeLessThanOrEqual(1.0)` — it does not use tolerance math.

**Fix**: Removed the constant.

---

### `smbSubMechanism.test.ts:610` — unused variable `sidecar`

`const sidecar = loadSidecar(caseId)` loaded the evidence-hints file but `sidecar` was never referenced. The test body only reads the `BASELINE` map.

**Fix**: Changed to `loadSidecar(caseId)` (call without assignment) to preserve the file-existence validation side effect while eliminating the unused binding.

---

## Verification

```
npx eslint tests/owner-mode/ --ext .ts
# → (no output, exit 0)
```

All 7 warnings resolved with zero new warnings introduced. No test behavior changed.
