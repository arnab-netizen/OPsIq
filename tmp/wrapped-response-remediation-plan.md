# Wrapped Response Violations Remediation Plan

## Overview
77 wrapped routes return `Response.json()` to the canonical wrapper expecting plain serializable objects. This causes double-serialization: `JSON.stringify(Response)` serializes the Response object's properties instead of its body.

**Status**: Baseline established. Ratchet gate active. Remediation planned in 5 batches.

## Fix Pattern (Applied to All 77 Routes)
```typescript
// BEFORE (violation)
export const GET = withCanonicalEnforcement(async (ctx) => {
  return Response.json({ data: [...] }); // ❌ Response object
});

// AFTER (fixed)
export const GET = withCanonicalEnforcement(async (ctx) => {
  return { data: [...] }; // ✅ Plain object
});
```

## Batch Strategy

### Batch 1: Read-Only GET Routes (14 violations)
**Priority**: High - lowest risk, no mutations
**Examples**: /api/users, /api/actions, /api/clients, /api/decisions, /api/intelligence/insights

**Routes in this batch**:
- app/api/actions/[actionId]/impact-delta/route.ts
- app/api/clients/[clientId]/kpis/route.ts
- app/api/clients/[clientId]/performance/route.ts
- app/api/decisions/[decisionId]/evidence/route.ts
- app/api/intelligence/insights/route.ts
- app/api/intelligence/pattern/route.ts
- app/api/intelligence/recommendations/route.ts
- app/api/intelligence/trends/route.ts
- app/api/kpis/all/route.ts
- app/api/kpis/route.ts
- app/api/organizations/[orgId]/members/route.ts
- app/api/organizations/[orgId]/teams/route.ts
- app/api/owners/[ownerId]/performance/route.ts
- app/api/users/route.ts

**Validation**: Verify response shape is preserved, counts match before/after

**Timeline**: Week 1

---

### Batch 2: Diagnostic & Proof Routes (3 violations)
**Priority**: High - already fixed in main, ensure consistency
**Examples**: /api/internal/*, endpoints already handling proof/diagnostics

**Routes in this batch**:
- app/api/internal/demo-permission-proof/route.ts
- app/api/internal/demo-engagement-proof/route.ts
- app/api/internal/debug-engagements-p2007/route.ts

**Special handling**: These are already fixed or being monitored for diagnostics

**Timeline**: Week 1

---

### Batch 3: Write Paths (10 violations)
**Priority**: Medium - mutations, need idempotency verification
**Examples**: POST /api/actions, POST /api/clients, POST /api/decisions

**Routes in this batch**:
- app/api/actions/[actionId]/complete/route.ts
- app/api/actions/[actionId]/start/route.ts
- app/api/actions/route.ts
- app/api/clients/route.ts
- app/api/decisions/route.ts
- app/api/intelligence/recommendations/[recommendationId]/implement/route.ts
- app/api/intelligence/recommendations/[recommendationId]/decline/route.ts
- app/api/intelligence/recommendations/[recommendationId]/snooze/route.ts
- app/api/organizations/route.ts
- app/api/users/route.ts (POST variant)

**Validation**: 
- Verify mutations still work correctly
- Check idempotency keys if present
- Verify response includes mutation result

**Timeline**: Week 2

---

### Batch 4: Complex Status/Header Routes (8 violations)
**Priority**: Medium-High - response shape complexity
**Examples**: Routes returning custom headers, status codes, streaming data

**Routes in this batch**:
- app/api/health/route.ts (if wrapped)
- app/api/internal/build-info/route.ts
- app/api/internal/engagements-api-runtime-trace/route.ts
- app/api/[...slug]/route.ts (catch-all handlers)
- Other status/health routes with special response handling

**Special handling**: 
- Verify no header manipulation is lost
- Check status code propagation
- Test streaming/chunked responses if applicable

**Timeline**: Week 2-3

---

### Batch 5: High-Traffic/Critical Routes (42 violations)
**Priority**: Medium - largest batch, requires careful testing
**Examples**: Core business operations

**Routes in this batch**:
All remaining 42 violations not in batches 1-4. Typical examples:
- app/api/engagements/[engagementId]/action-plans/route.ts
- app/api/engagements/[engagementId]/risks/route.ts
- app/api/evidence/[evidenceId]/route.ts
- app/api/recommendations/[recommendationId]/route.ts
- app/api/scenarios/[scenarioId]/route.ts
- And 37 more

**Special handling**: 
- Monitor production metrics during/after fix
- Roll out in smaller sub-batches if needed
- Have rollback plan ready

**Timeline**: Week 3-4

---

## Implementation Process

### Per-Batch Checklist
1. **Create feature branch**: `fix/batch-N-wrapped-responses`
2. **Apply fixes**: 
   ```bash
   # For each route file:
   # 1. Find: return Response.json({
   # 2. Replace: return {
   # 3. Find: return NextResponse.json({
   # 4. Replace: return {
   ```
3. **Verify locally**:
   ```bash
   npm run build
   npm test -- <affected-test>
   npm run audit:wrapped-handlers:ratchet  # Should show progress
   ```
4. **Create PR**: Include before/after test results
5. **Merge to main**: Verify CI gate passes (should pass with fewer violations)
6. **Monitor**: 3+ clean production smokes

### Automated Fixer (Optional)
Create a script to batch-fix files:
```bash
scripts/fix-wrapped-handlers-batch.js batch-1
# Finds all files in batch, applies regex replacements, verifies
```

---

## Risk Assessment

### Risk: Low
- **Pattern**: Consistent, mechanical fix across all violations
- **Scope**: Handler return type only, no logic changes
- **Reversibility**: Trivial to revert if issues arise
- **Testing**: Existing test suites validate response shape

### Safeguards
- Ratchet gate prevents new violations during fixes
- Baseline establishes known state
- Each batch tested independently before merge
- Production smoke tests track stability
- Rollback: revert any problematic batch and release without it

---

## Progress Tracking

### Week 1 Status
- [ ] Batch 1 (14 routes): Read-only GET
  - [ ] Fixed locally
  - [ ] Tests passing
  - [ ] PR created
  - [ ] Merged to main
  - [ ] 3+ clean smokes
  
- [ ] Batch 2 (3 routes): Diagnostic/Proof
  - [ ] Fixed locally
  - [ ] Tests passing
  - [ ] PR created
  - [ ] Merged to main
  - [ ] 3+ clean smokes

### Week 2 Status
- [ ] Batch 3 (10 routes): Write paths
  - [ ] Fixed locally
  - [ ] Idempotency verified
  - [ ] PR created
  - [ ] Merged to main
  - [ ] 3+ clean smokes

- [ ] Batch 4 (8 routes): Complex status/headers
  - [ ] Fixed locally
  - [ ] Response structure verified
  - [ ] PR created
  - [ ] Merged to main
  - [ ] 3+ clean smokes

### Week 3-4 Status
- [ ] Batch 5 (42 routes): High-traffic critical
  - [ ] Fixed locally
  - [ ] Tests passing
  - [ ] Prod metrics monitored
  - [ ] PR created
  - [ ] Merged to main
  - [ ] 5+ clean smokes

---

## Success Criteria

### Completion
- All 77 violations fixed
- Ratchet mode shows 0 current violations matching 0 baseline violations
- Full audit mode shows ✅ All wrapped handlers return plain objects

### Quality Gates
- All tests passing (npm test -- wrapped-handlers-scanner.test.ts)
- All tests passing (npm run test:ci)
- TypeScript strict mode passing (npx tsc --noEmit)
- Build succeeding (npm run build)
- Production smoke tests passing (5+ consecutive)
- Zero customer-impacting regressions

---

## Manual Verification Steps

### After Each Batch
1. **Local verification**:
   ```bash
   git checkout -b test-batch-X
   npm run build
   npm test -- wrapped-handlers-scanner.test.ts
   npm run audit:wrapped-handlers:ratchet
   ```

2. **Response shape verification**:
   - Use `/api/internal/engagements-api-runtime-trace` to trace
   - Verify response structure is preserved
   - Confirm counts match before/after

3. **Integration testing**:
   - Run affected feature tests
   - Test in staging if available
   - Verify dependent APIs still work

---

## Notes

### Why This Approach?
- **Ratchet mode**: Prevents regression while allowing incremental fixes
- **Batch strategy**: Distributes risk, allows monitoring between batches
- **Per-batch testing**: Ensures each fix is isolated and verified
- **Production monitoring**: Catches real-world issues early

### Known Issues During Remediation
- If smoke tests fail after merging a batch: Revert batch, open issue, roll back
- If new violations appear: Ratchet gate will catch them (exit 1), fix before merging

### Deferred Considerations
- Full architectural review of wrapper contract (separate task)
- Documentation updates to enforce plain object requirement
- Linter rule to prevent new Response.json() returns

---

## References

- **Baseline**: qa/baselines/wrapped-response-violations.json (77 violations)
- **Scanner**: scripts/audit-wrapped-handlers.js
- **Tests**: src/__tests__/wrapped-handlers-scanner.test.ts
- **Root cause**: src/__tests__/canonical-wrapper-contract.test.ts
- **CI gate**: .github/workflows/ci.yml (ratchet mode)

