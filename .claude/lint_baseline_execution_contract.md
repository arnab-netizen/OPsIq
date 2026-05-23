# ESLint Baseline Closure Execution Contract

## MISSION
Reduce ESLint baseline errors from 1,171 to exactly 0 while maintaining simultaneous passage of all five gates: ESLint lint (0 errors), TypeScript compilation (tsc --noEmit, 0 errors), Next.js build, governance scan strict mode, and Prisma schema validation. No gate may pass by breaking another gate.

## FINAL ACCEPTANCE CRITERIA
A batch is COMPLETE only when ALL gates pass together:

```
GATE 1: npm run lint
  PASS: exit code 0 AND reported error count = 0
  FAIL: exit code nonzero OR reported error count > 0
  
GATE 2: npx tsc --noEmit
  PASS: exit code 0 AND no error output
  FAIL: exit code nonzero OR any TypeScript error reported
  
GATE 3: npm run build
  PASS: build completes without error
  FAIL: build fails or warnings exceed baseline
  
GATE 4: npm run governance:scan:strict
  PASS: exits with 0 errors and ≤117 warnings (baseline)
  FAIL: exits with nonzero error count or warning count exceeds 117
  
GATE 5: npx prisma validate
  PASS: schema validates without error
  FAIL: schema validation fails
```

A BATCH IS GREEN only when: GATE1=PASS AND GATE2=PASS AND GATE3=PASS AND GATE4=PASS AND GATE5=PASS

The WORK IS COMPLETE only when: all batches are green AND lint error count = 0

## CORE RULE: NO GATE MAY PASS BY BREAKING ANOTHER GATE

This is the non-negotiable acceptance contract. Violations are fatal to the batch:

- **NO mass type conversions** (any→unknown without narrowing): Causes TypeScript errors. FORBIDDEN.
- **NO @ts-nocheck, @ts-ignore, or TypeScript suppression comments**: Suppresses errors instead of fixing them. FORBIDDEN.
- **NO unsafe commits** (commits that break tsc, build, or governance): Must be reverted or cherry-picked selectively. FORBIDDEN.
- **NO breaking existing tests or type safety**: Must maintain build integrity. FORBIDDEN.
- **NO changes to ESLint config mid-batch**: Config changes only on repair branch head, not during batch work. FORBIDDEN.

## STOP RULE: ALLOWED AND FORBIDDEN STOP STATES

**ALLOWED STOP STATES** (commit the batch, push, and report):
- All 5 gates PASS and lint error count decreased from batch start
- All 5 gates PASS and lint error count is now 0 (WORK COMPLETE)
- A batch fails a gate, is reverted, repair branch remains green, error count > 0 (pause batch, investigate)

**FORBIDDEN STOP STATES** (must not commit; must revert and diagnose):
- Any gate breaks while lint errors decreased (core rule violation)
- TypeScript errors introduced (tsc gate broke)
- Build fails (build gate broke)
- Governance scan error count increased (governance gate broke)
- Prisma validation fails (Prisma gate broke)
- Lint exit code 0 but errors > 0 and changed

If a batch enters a forbidden stop state, immediately:
1. Revert all changes in the batch
2. Verify green baseline restored (all 5 gates PASS)
3. Diagnose root cause
4. Document the failure
5. Plan a corrected batch with smaller scope or different approach

## BATCH RULES

**BATCH SIZE CONSTRAINTS:**
- Max 10 files per batch
- Max 50 lint errors fixed per batch
- Exception: if a single file has >50 fixable errors, it may be split across 2 batches or completed in 1 batch if all gates pass after completion

**GATE VERIFICATION AFTER EACH BATCH:**
Before committing a batch:
1. Run: `npm run lint` → verify exit code = 0 AND error count reported
2. Run: `npx tsc --noEmit` → verify exit code = 0 AND no errors
3. Run: `npm run build` → verify success
4. Run: `npm run governance:scan:strict` → verify exit code = 0
5. Run: `npx prisma validate` → verify success

**GATE VERIFICATION OUTPUT:**
After each batch, output in TEXT ONLY format:
```
BATCH [N] GATES:
  LINT: error_count = X [PASS|FAIL]
  TSC:  error_count = 0 [PASS|FAIL]
  BUILD: [PASS|FAIL]
  GOVERNANCE: error_count = Y [PASS|FAIL]
  PRISMA: [PASS|FAIL]
BATCH [N] OVERALL: [GREEN|RED]
```

## LINT TRUTH RULE

ESLint error count is the single source of truth for lint state.

- `npm run lint` with `exit code 0` BUT `reported error count > 0` = **FAIL** (not PASS)
- `npm run lint` with `exit code 0` AND `reported error count = 0` = **PASS**
- Any output showing lint errors, even if exit code 0 = **FAIL**

The lint state is COMPLETE only when: reported error count = 0

## RECOVERY PROTOCOL

If any gate breaks during a batch:

1. **REVERT IMMEDIATELY**: Do not attempt mid-flight fixes. Revert the entire batch.
2. **RESTORE GREEN BASELINE**: Run all 5 gates. Verify all PASS before proceeding.
3. **DOCUMENT FAILURE**: Record which gate broke, which file caused it, what change triggered it.
4. **ROOT CAUSE ANALYSIS**: Identify why the change broke the gate (type narrowing required? unsafe pattern? missing guard?).
5. **PLAN CORRECTED BATCH**: Redesign the batch with smaller scope, different approach, or additional type safety checks.
6. **NO EXCEPTIONS**: Do not proceed to the next batch until the broken batch is understood and reverted.

## AUDIT TRAIL

Each batch must record:
- Files modified
- Lint errors fixed (count before → count after)
- Any gate that failed and was reverted
- Commit SHA on repair branch
- Timestamp

## WORKSPACE AND BRANCH CONTEXT

- **Repository**: arnab-netizen/opsiq
- **Repair branch**: `lint-baseline-closure-repair`
- **Base branch**: main (ca1e59e782aa74f97ec3fa4b8914904e22ca1f04)
- **Starting state**: 1,171 lint errors, 0 TypeScript errors, all gates green (ADVISORY_EXIT_ZERO_WITH_ERRORS for lint)
- **Target state**: 0 lint errors, 0 TypeScript errors, all gates green

## EXECUTION MODEL

Work proceeds in phases:

1. **Phase 1: Batch 1-N (ONGOING)**
   - Fix up to 50 lint errors in up to 10 files
   - Verify all 5 gates pass after each batch
   - Commit batch, push, record error count decrease
   - Proceed to next batch

2. **Phase 2: Final Verification (when lint error count = 0)**
   - Run final gate check
   - Confirm all 5 gates PASS
   - Create PR from lint-baseline-closure-repair to main
   - Request review

3. **Phase 3: Merge (after review)**
   - Merge PR to main
   - Delete repair branch
   - WORK COMPLETE

## FORBIDDEN PATTERNS (DO NOT USE)

- `@ts-nocheck` on files
- `@ts-ignore` on lines
- `as unknown` without type narrowing
- `as any` without explicit justification in commit message
- Suppressing errors instead of fixing root cause
- Unsafe commits that violate core rule
- Silent mutation of type contracts
- Breaking existing tests

## REQUIRED PATTERNS (MUST USE)

- Type narrowing before unsafe operations (e.g., `if (x !== undefined) { ... }`)
- Explicit type guards for discriminated unions
- Proper error handling with context
- Audit event emission for mutations
- Server-side authorization checks
- Proper async/await patterns in Next.js components
- Correct React hooks dependency arrays
- Immutable state updates

---

**Document Version**: 1.0  
**Created**: 2026-05-23  
**Effective Immediately**: On creation of repair branch `lint-baseline-closure-repair`
