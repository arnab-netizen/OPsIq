# PHASE G1: CATEGORY_A MIGRATION PLAN

**Date**: 2026-05-14  
**Target**: 368 violations → 0 violations  
**Phases**: Type imports (150) → withAuth() calls (216) → requireAuth() (2)

## Migration Strategy

### BATCH 1: Type Import Removals (150 violations)
**Effort**: ~150 minutes (trivial - remove lines)  
**Risk**: None (types don't affect runtime)  
**Process**:
1. Identify all `import type { AuthContext } from "@/lib/auth-guard"` lines
2. Remove import statements
3. Update function signatures to use `CanonicalAuthContext` from wrapper
4. Verify: No TypeScript errors

### BATCH 2: withAuth() Call Replacements (216 violations)
**Effort**: ~1080-1440 minutes (small - direct replacement)  
**Risk**: Medium (behavioral equivalence must match)  
**Process**:
1. Find each `await withAuth()` or `withAuth()` call
2. Check what's being destructured: `{ session, policy }`
3. Replace with:
   - `const { session, policy } = ctx;` OR
   - Extract from `ctx.verifiedSessionSnapshot`
4. Verify:
   - Response unchanged
   - Permissions still checked (via snapshot)
   - Workspace behavior unchanged
   - No side effects

### BATCH 3: Standalone Auth Calls (2 violations)
**Effort**: ~10-20 minutes (small - 2 calls)  
**Risk**: Low  
**Process**:
1. Replace `requireAuth()` with snapshot usage
2. Verify exception behavior unchanged

## File Grouping Strategy

**Group 1 (Services)**: src/services/*.ts (type imports only)
- Low risk: types removed, no runtime changes
- Count: ~50 files

**Group 2 (API Routes)**: src/app/api/*/route.ts (withAuth calls + imports)
- Medium risk: routes need snapshot context passed
- Count: ~20-30 files

**Group 3 (Utilities)**: src/lib/*.ts (withAuth calls)
- Medium risk: helpers need context
- Count: ~10 files

## Verification Checklist

For each migrated violation:
- [ ] TypeScript compiles
- [ ] Runtime enforcer silent (no SHADOW_AUTH_READ_DETECTED)
- [ ] Response structure unchanged
- [ ] Permission checks still active
- [ ] Workspace isolation maintained
- [ ] No side effects added/removed

## Rollback Plan

Each batch:
1. Commit before starting
2. Run full test suite
3. If failure: `git reset --hard HEAD~1`
4. Skip file and move to next

## Success Criteria

After each batch:
- [ ] Build succeeds (`npm run build`)
- [ ] Tests pass (`npm run test`)
- [ ] Type check succeeds (`npm run lint`)
- [ ] No new violations introduced (CI gate passes)
- [ ] Runtime enforcer shows 0 violations

## Expected Outcome

**Before**: 418 violations (368 A + 50 B + 0 C)  
**After G1**: 50 violations (0 A + 50 B + 0 C)  
**After G1+G2**: 0 violations (0 A + 0 B + 0 C)

---

## Progress Tracking

- [ ] Batch 1: Type imports (150) - Not started
- [ ] Batch 2: withAuth() replacements (216) - Not started
- [ ] Batch 3: requireAuth() calls (2) - Not started
- [ ] Tests: All green
- [ ] CI gate: Violations trending 418 → 0
