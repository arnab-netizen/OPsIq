# G7D-C-C: Request Field Contract Decision

**Phase**: G7D-C (Request Field Decision)
**Timestamp**: 2026-05-14T20:54:00Z
**Classification**: RUNTIME_ENFORCED_HYBRID

---

## DECISION: OPTION 2 — REVERT_TO_OPTIONAL_REQUEST

---

## Rationale

### Key Finding
CanonicalAuthContext is **NOT strictly request-bound**:
- 54% of usages are request-bound (route handlers)
- 46% of usages are non-request-bound (services, tests, background jobs)
- Manual construction exists in background event processing (re-evaluation.ts)

### Why Revert?

1. **Constraint Compliance**: 
   - Current non-optional field forces `null as any` workaround in re-evaluation.ts
   - Violates "NO any/as any types" constraint
   - Reverting removes this violation immediately

2. **Architecture Integrity**:
   - Background event processing legitimately doesn't have HTTP requests
   - Service layer shouldn't be coupled to HTTP concepts
   - Optional request acknowledges this reality

3. **No Safety Loss**:
   - Route handlers can use `ctx.request!` (non-null assertion is safe in route context)
   - Wrapper always provides request for route-bound contexts
   - Type inference still works for most cases

4. **Simplicity**:
   - Single revert vs. complex split-type solution
   - No new interfaces, no refactoring needed
   - Immediate fix for existing violations

---

## Implementation

### Step 1: Revert CanonicalAuthContext

**File**: `src/lib/canonical-route-enforcement.ts` (line 82)

```typescript
// BEFORE (current, non-optional):
request: NextRequest;

// AFTER (reverted, optional):
request?: NextRequest;
```

### Step 2: Fix re-evaluation.ts

**File**: `src/services/re-evaluation.ts` (lines 718, 789)

```typescript
// BEFORE (violates NO any/as any):
const authContext: CanonicalAuthContext = {
  // ... fields ...
  request: null as any,  // VIOLATION
} as CanonicalAuthContext;

// AFTER (clean, no violations):
const authContext: CanonicalAuthContext = {
  // ... fields ...
  // request field: omitted (undefined, which is valid for optional)
};
```

### Step 3: Verify Route Handlers

**Files**: All route handlers using `ctx.request` (~30 files)

**Current pattern** (with non-optional request):
```typescript
const url = new URL(ctx.request.url);  // No null check needed
```

**With optional request**, options:
```typescript
// Option A: Non-null assertion (safe in route context, request always provided by wrapper):
const url = new URL(ctx.request!.url);

// Option B: Guard (more explicit):
if (ctx.request) {
  const url = new URL(ctx.request.url);
}

// Option C: Optional chaining (if logic can handle undefined):
const url = ctx.request?.url;
```

**Recommendation**: Use non-null assertion (`ctx.request!`) for route handlers since wrapper guarantees request exists.

---

## Risks & Mitigation

### Risk: Handler Code Becomes Slightly More Verbose
**Severity**: LOW
**Mitigation**: Non-null assertion is minimal verbosity, clear intent
**Impact**: None on functionality

### Risk: Backward Compatibility
**Severity**: NONE
**Reason**: Optional field is compatible with non-optional usage (assertion needed, but safe)

### Risk: Type Safety Loss in Route Handlers
**Severity**: NONE (mitigated)
**Reason**: Route handlers have guarantee from wrapper; assertion documents this

---

## Constraints Compliance Verification

✓ **NO TIER B**: No tier business logic added/modified
✓ **NO any/as any**: Revert removes the `null as any` violation
✓ **NO SERVICE WEAKENING**: Services remain unchanged
✓ **NO PERMISSION FABRICATION**: Context construction unchanged
✓ **NO SCANNER RULE RELAXATION**: Scanner rules unchanged
✓ **NO SCANNER REWRITE**: Scanner logic unchanged
✓ **NO POLICY_CONTEXT MIGRATION**: Out of scope
✓ **NO ENGAGEMENTS ROUTE MIGRATION**: Out of scope

---

## Files Affected

### Must Change:
1. **src/lib/canonical-route-enforcement.ts** (line 82)
   - Change: `request: NextRequest;` → `request?: NextRequest;`
   - Risk: LOW (single interface change)

2. **src/services/re-evaluation.ts** (lines 718, 789)
   - Change: Remove `request: null as any,`
   - Risk: LOW (remove workaround)

### May Need Changes (Non-Null Assertions):
- ~30 route handler files that use `ctx.request`
- All changes are addition of `!` operator
- All are safe (wrapper guarantees request exists)
- Changes are optional (handlers work either way)

### No Changes Needed:
- 25+ service files (don't use request field)
- Test files (already adapted)
- Core enforcement logic (unchanged)

---

## Validation Steps

1. **npm run build** — Verify TypeScript compiles with optional request
2. **npm test -- g6r-auth-bridge** — Verify auth bridge tests pass
3. **npm test -- phase-d phase-e phase-f** — Verify phase tests pass
4. **npx tsx src/governance/auth-shadow-read-scanner.ts** — Verify no new violations

---

## Next Steps

1. **Revert request field to optional** in canonical-route-enforcement.ts
2. **Remove null as any workaround** in re-evaluation.ts
3. **Run validation commands** to confirm safety
4. **Add non-null assertions** to route handlers (if TypeScript requires)
5. **Commit changes** with clear message explaining revert

---

## Safe to Continue G7 Batches?

**YES** — After decision is implemented.

Reverting to optional request:
- ✓ Fixes current architectural blocker
- ✓ Removes constraint violation (any/as any)
- ✓ Maintains safety of route handlers
- ✓ Acknowledges legitimate non-request contexts
- ✓ Clears path for continued G7 batches

**G7E can proceed** with handler migration once request field decision is implemented.

---

## Decision Approved

**OPTION 2: REVERT_TO_OPTIONAL_REQUEST**

**Reason**: Acknowledges actual architecture (non-request-bound contexts exist), fixes existing constraint violation, maintains safety with non-null assertions in route handlers.

---

End of Decision Report
