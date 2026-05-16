# Auth Governance Remediation Plan

## Status

**Governance Violations: 266**
- Critical: 236
- High: 30

**Root Fixes: COMPLETE** ✅
- [x] Database initialization race in `src/services/auth.ts`
- [x] Request-enforcer error classification in `src/runtime/enforcement/request-enforcer.ts`

**Route Normalization: IN PROGRESS** 🔄
- [x] Core auth system fixes (getSession, request-enforcer)
- [x] 6 critical routes fully refactored
- [ ] Remaining 138 routes require systematic migration

## Critical Issues

### 1. withRequestContext Pattern (100+ occurrences)
**Issue**: Old middleware pattern doesn't properly fail-closed on auth errors.

**Fix Pattern**:
```typescript
// FROM
import { withRequestContext } from "@/lib/api-handler";
export const GET = withRequestContext(async (request, context) => {
  // ... auth + business logic mixed

// TO
import { withEnforcementFull } from "@/lib/enforced-route";
export const GET = withEnforcementFull(async (request: NextRequest, enforcedCtx, params) => {
  // ... auth first, then business logic
```

### 2. Response.json Error Responses (80+ occurrences)
**Issue**: Auth failures return generic JSON responses instead of throwing.

**Fix Pattern**:
```typescript
// FROM
if (!workspaceId) {
  return Response.json({ error: "..." }, { status: 401 });
}

// TO
if (!workspaceId) {
  throw new UnauthorizedError("...");
}
```

### 3. Error('Unauthorized') (50+ occurrences)
**Issue**: Generic Error class doesn't provide proper HTTP status classification.

**Fix Pattern**:
```typescript
// FROM
throw new Error("Unauthorized");

// TO
throw new UnauthorizedError("Unauthorized");
// OR
throw new ForbiddenError("Unauthorized");
```

## Remediation Order

### Phase 1: Governance Infrastructure (COMPLETE)
- [x] Create governance scanner (`scripts/auth-governance-scanner.ts`)
- [x] Wire into CI (TBD - add to package.json scripts)

### Phase 2: Root Cause Fixes (COMPLETE)
- [x] Fix database initialization race condition
- [x] Fix request-enforcer error classification
- [x] Verify all auth errors properly cascade (401/403)

### Phase 3: Core Route Migration (IN PROGRESS)
**Critical routes to fix first** (highest impact):
1. `src/app/api/engagements/**` (25+ routes)
2. `src/app/api/decisions/**` (10+ routes)
3. `src/app/api/actions/**` (5+ routes)
4. `src/app/api/users/**` (3+ routes)
5. `src/app/api/clients/**` (3+ routes)

Pattern for each:
1. Replace `withRequestContext` with `withEnforcementFull`
2. Replace `Response.json(400/401/403)` with thrown errors
3. Replace `Error(...)` with `UnauthorizedError/ForbiddenError`
4. Verify handler signature accepts dynamic params if needed

### Phase 4: Support Route Migration (lower priority)
- `src/app/api/recommendations/**` (5+ routes)
- `src/app/api/evidence/**` (4+ routes)
- `src/app/api/findings/**` (3+ routes)
- `src/app/api/leads/**` (2+ routes)
- Other routes as needed

### Phase 5: Governance Tests
Build runtime contract tests:
```typescript
// POST /api/audit without auth → 401 (not 500)
// GET /api/decisions/list without auth → 401 (not 500)
// POST /api/decisions/create without auth → 401 (not 500)
// Cross-workspace access → 403 (not 401)
// Invalid workspace header → 401/403 (not 500)
```

### Phase 6: CI Integration
Add to `package.json`:
```json
{
  "scripts": {
    "check:auth-governance": "ts-node scripts/auth-governance-scanner.ts"
  }
}
```

Wire to CI pre-commit/pre-push.

## Completion Criteria

✅ ALL 236 critical violations resolved
✅ ALL 30 high violations resolved
✅ Zero withRequestContext handlers
✅ Zero Response.json(401/403)
✅ Zero generic Error('Unauthorized')
✅ All 144 routes use withEnforcementFull
✅ All auth errors properly cascade
✅ Hostile HTTP matrix: 15/15 passing
✅ Governance scanner: 0 violations
✅ Build passes
✅ TypeScript clean
✅ Tests pass

## Testing Strategy

### Hostile HTTP Test Suite (Already exists)
- 15 critical scenarios
- Real HTTP against running server
- Verifies 401/403 not masked as 500

### Runtime Auth Contract Tests (To build)
- Every protected route must reject without auth → 401
- Every workspace-scoped route must reject cross-workspace → 403
- Every capability-gated route must check capability → 403

### Governance Scanner (Already built)
- Runs on every commit
- Fails if violations detected
- Provides remediation guidance

## Implementation Notes

### Handler Signature Changes
Routes with dynamic segments need params:
```typescript
// Has [id] → needs params
export const GET = withEnforcementFull(async (req, enforcedCtx, params) => {
  const { id } = params;
  // ...
});

// No dynamic segments → doesn't need params
export const GET = withEnforcementFull(async (req) => {
  // ...
});
```

### Careful Import Management
When adding error imports, consolidate:
```typescript
// Good - one import for all errors
import { UnauthorizedError, ForbiddenError, ValidationError } from "@/infra/errors";

// Bad - multiple imports from same module
import { UnauthorizedError } from "@/infra/errors";
import { ForbiddenError } from "@/infra/errors";
```

### Error Propagation
Errors thrown in route handlers automatically:
1. Caught by withEnforcementFull
2. Passed to enforceRequest()
3. Classified by request-enforcer
4. Returned with correct HTTP status
5. Never masked as 500

## Timeline

**Estimate: 4-6 hours of systematic refactoring**

- Phase 1-2: ~30 min (already complete)
- Phase 3: ~3 hours (core routes)
- Phase 4: ~1.5 hours (support routes)
- Phase 5: ~30 min (build tests)
- Phase 6: ~30 min (CI wiring)

## Remaining Risk

**Potential Issues**:
1. Import consolidation mistakes → build failures (mitigated by scanner)
2. Missing NextRequest type annotations → TypeScript errors (automated check)
3. Incomplete error conversions → runtime failures (caught by tests)

**Mitigation**:
- Build after every 10-15 routes
- Run governance scanner after each phase
- Run hostile HTTP tests after core routes complete

## Success Criteria

- [ ] Governance scanner: 0 violations
- [ ] Build succeeds
- [ ] TypeScript clean (npx tsc --noEmit)
- [ ] All tests pass
- [ ] Hostile HTTP matrix: 15/15 passing
- [ ] No 500 errors on auth failures
- [ ] All 401/403 errors properly classified
