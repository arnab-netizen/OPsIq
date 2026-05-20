# Governance Violations Discovery (Post-R26N)

**Date:** 2026-05-20  
**Discovery:** Upon installing tsx (required devDependency for governance:scan:strict), 369 pre-existing governance violations were revealed.

## Background

R26N (CI-GATE FINALIZATION) added the `check:security` gate which runs:
```bash
npm run governance:scan:strict && npm run governance:ci-gate
```

However, this gate could not execute before because `tsx` was not installed as a devDependency. The governance:scan:strict script requires tsx to run TypeScript code.

## Discovery Process

1. Installed tsx as devDependency (required for `npm run governance:scan:strict`)
2. Ran `npm run check:security` 
3. Found 369 violations in governance-scan.ts output:
   - 257 errors (must fix for strict mode)
   - 112 warnings

## Violation Breakdown

| Category | Count | Pattern | Fix Required |
|----------|-------|---------|--------------|
| RAW ERROR MESSAGE | 174 | `error.message` used directly | Use `toOperatorSafeError(error, context)` |
| UNSAFE ERROR RENDER | 78 | `new RuntimeError()` without governance | Use `classifyOperatorError(error, context)` |
| DEAD EMPTY STATE | 112 | `return null` without guidance | Use `<GovernedEmptyState reason="..." />` |
| UNSAFE METRIC | 5 | Raw metric display without governance | Use `<GovMetric name="..." value="..." />` |

## Classification

**Type:** BLOCKER (governance framework compliance)  
**Related Work:** R26K-R26N (optional context security hardening)  
**Root Cause:** Pre-existing code patterns that don't comply with OPsIQ's governed framework  
**Scope:** 100+ files across UI components and services  

## Current State

### Gates Passing (R26K-R26N):
- ✓ npm run build
- ✓ npx tsc --noEmit
- ✓ npx prisma validate
- ✓ npm run check:optional-context (12/12 exemptions registered + secure)

### Gates Failing (Pre-existing governance violations):
- ✗ npm run check:security (governance:scan:strict fails with 369 violations)

## Impact on R26N

R26N successfully completed the optional context security hardening work and added new security gates to the CI pipeline. However, one of those gates (check:security) is now failing due to pre-existing governance violations in the codebase.

The R26N work itself is complete and correct. The governance violations are a separate concern that was hidden until the governance:scan:strict gate could run (which required tsx).

## Recommended Next Steps

1. **Option A:** Fix all 369 governance violations in a separate GOVERNANCE_HARDENING phase
   - Estimated effort: 8-10 hours of systematic refactoring
   - Priority: High (blocking deployment readiness)
   - Scope: 100+ files

2. **Option B:** Make governance:scan:strict non-blocking
   - Would allow check:security to pass with warnings
   - Not recommended (contradicts OPsIQ's governed framework)

3. **Option C:** Document as known blocker and defer
   - Document the violations in execution_state.json
   - Mark as GOVERNANCE_VIOLATIONS_BLOCKER
   - Proceed with other work, tackle this in next phase

## Files Affected (Sample)

**High-impact files with multiple violations:**
- `src/runtime/runtime-errors.ts` (UNSAFE ERROR RENDER source)
- `src/services/webhooks.service.ts` (error handling patterns)
- `src/ui/decision-csv-upload.tsx` (empty state + error patterns)
- `src/ui/decision-creation-form.tsx` (empty state + error patterns)
- `src/ui/decision-acceptance-modal.tsx` (empty state + error patterns)
- `src/services/diagnostic-core/root-cause-engine.ts` (metrics + errors)
- `src/services/decisions/outcome-tracker.ts` (metrics + errors)

---

**Note:** This discovery does not invalidate the R26K-R26N work. The optional context security hardening is complete and correct. This is a separate governance framework compliance effort that needs to be completed before the check:security gate can pass.
