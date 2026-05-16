# X9F-1: Implementation Plan for X9F-2

**Date:** 2026-05-16  
**Status:** PLAN READY  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Next Phase Specification

**Phase Name:** X9F-2

**Pilot:** createDecision Service Auth Envelope Refactor

**Type:** DECISION_SERVICE_AUTH_ENVELOPE_REFACTOR

---

## Selected Pilot Details

**Service:** createDecision  
**File:** `src/services/decisions/decision-creation-service.ts`  
**Operation:** CREATE  
**Route Caller:** `src/app/api/decisions/create/route.ts`  
**Wrapper:** withCanonicalEnforcement  
**Capability:** DECISION_CREATE (X9E-2 already cleaned)  
**Risk Level:** LOW

---

## Files Allowed to Change

### Implementation Files (ALLOWED)

**Phase A: Pre-Implementation**
- None (inspection only)

**Phase B: Implementation**
1. `src/services/decisions/decision-creation-service.ts`
   - Modify createDecision signature to accept ServiceAuthEnvelope
   - Replace individual userId parameter with envelope.verifiedActorId
   - Preserve all business logic
   - Preserve response shape

2. `src/app/api/decisions/create/route.ts`
   - Construct ServiceAuthEnvelope from CanonicalAuthContext
   - Pass envelope to createDecision
   - No logic changes, only envelope construction

**Phase C: Tests**
- No test changes required (integration tests will verify)

**Phase D: Validation**
- Reports only

**Phase E: Scope Audit**
- Reports only

**Phase F: Acceptance**
- Reports only

### Report Files (ALLOWED)
- `reports/shadow-read/x9f2_preimplementation_confirmation.md`
- `reports/shadow-read/x9f2_implementation_notes.md`
- `reports/shadow-read/x9f2_test_notes.md`
- `reports/shadow-read/x9f2_validation.md`
- `reports/shadow-read/x9f2_scope_audit.json`
- `reports/shadow-read/x9f2_acceptance_decision.md`

### Generated Files (ALLOWED)
- `shadow_read_violations.json` (scanner output)

---

## Files FORBIDDEN to Change

### ABSOLUTELY FORBIDDEN
- `src/services/decision-validation/decision-acceptance.service.ts` (acceptDecision, rejectDecision)
- `src/services/decisions/decision-lifecycle.service.ts` (closeDecision)
- `src/app/api/decisions/[decisionId]/accept/route.ts`
- `src/app/api/decisions/[decisionId]/reject/route.ts`
- `src/app/api/decisions/[decisionId]/close/route.ts`
- `src/app/api/recommendations/route.ts`
- `src/app/api/decisions/[decisionId]/route.ts` (any other decision route)
- `src/domain/constants/capabilities.ts` (no new capabilities)
- `src/lib/auth-guard.ts` (no wrapper changes)
- `src/lib/canonical-route-enforcement.ts` (no wrapper changes)
- Any service not explicitly listed above
- Any wrapper file
- Any auth context file

---

## Scope Constraints

### MUST DO
1. Convert createDecision to accept ServiceAuthEnvelope
2. Construct envelope in route from CanonicalAuthContext
3. Pass envelope to service
4. Preserve business logic exactly
5. Preserve response shape exactly
6. Preserve error handling exactly
7. Preserve audit events exactly
8. Update only the two files listed above
9. No wrapper changes
10. No auth context changes

### MUST NOT DO
1. Accept CanonicalAuthContext in service
2. Perform auth checks in service
3. Fabricate or modify permissions
4. Change business logic
5. Change response shape
6. Change error handling
7. Add new capabilities
8. Modify any other service
9. Modify any other route
10. Modify wrapper patterns
11. Use any/as any
12. Create fake envelopes
13. Do service-side canonicalization

---

## Implementation Steps (For X9F-2)

### Phase A: Pre-Implementation Confirmation
1. Verify createDecision currently accepts CreateDecisionInput with userId field
2. Verify route constructs from CanonicalAuthContext
3. Verify DECISION_CREATE is in domain CAPABILITIES
4. Verify route uses requireCapabilities: [DECISION_CREATE]
5. Confirm no other changes needed

### Phase B: Service Refactoring
1. Create ServiceAuthEnvelopeAdapter or extend envelope with decision-specific fields if needed
2. Modify createDecision signature:
   ```typescript
   // FROM:
   export async function createDecision(input: CreateDecisionInput): Promise<CreateDecisionResult>
   
   // TO:
   export async function createDecision(
     input: CreateDecisionInput & ServiceAuthEnvelope
   ): Promise<CreateDecisionResult>
   ```
3. Replace userId usage with envelope.verifiedActorId throughout function
4. Ensure all business logic remains identical
5. Ensure response shape unchanged

### Phase B: Route Update
1. In POST handler of decisions/create/route.ts
2. After receiving verified context:
   ```typescript
   const envelope: ServiceAuthEnvelope = {
     verifiedActorId: ctx.verifiedActorId,
     verifiedActorType: ctx.verifiedActorType,
     verifiedWorkspaceId: ctx.verifiedWorkspaceId,
     verifiedCapabilities: ctx.verifiedCapabilities,
     hasInternalAccess: ctx.verifiedCapabilities.has(CAPABILITIES.DECISION_CREATE)
   };
   ```
3. Pass to service:
   ```typescript
   const result = await createDecision({
     ...creationInput,
     ...envelope
   });
   ```
4. No other changes to route handler

### Phase C: Test Verification
- Verify existing tests still pass
- Integration tests will verify creation works
- No new tests required

### Phase D: Validation
1. Build test
2. All test suites
3. Scanner validation
4. Check for 0 violations introduced

### Phase E: Scope Audit
1. Verify only 2 source files changed (service + route)
2. Verify changes are envelope pattern only
3. Verify no unauthorized files touched
4. Generate scope audit

### Phase F: Acceptance
1. Verify all gates pass
2. Confirm envelope pattern correct
3. Confirm no behavior changes
4. Approve for next phase

---

## Validation Commands

**Build:** `npm run build`

**Tests:**
- `npm test -- governance-capabilities --testTimeout=30000`
- `npm test -- policy-wrapper-enforcement --testTimeout=30000`
- `npm test -- g6r-auth-bridge --testTimeout=30000`
- `npm test -- phase-d phase-e phase-f --testTimeout=30000`

**Scanner:** `npx tsx src/governance/auth-shadow-read-scanner.ts`

---

## Success Criteria

### Build
- ✓ Compiles without errors
- ✓ TypeScript validation passes
- ✓ Static pages generated (99/99)

### Tests
- ✓ All 402 tests pass
- ✓ No new test failures
- ✓ Governance-capabilities: 32/32
- ✓ Policy-wrapper: 32/32
- ✓ Auth-bridge: 14/14
- ✓ Phase-d/e/f: 324/324

### Scanner
- ✓ Total violations: 448 (no increase)
- ✓ Critical: 283 (no increase)
- ✓ Block-build: 165 (no increase)
- ✓ No new violations introduced
- ✓ Expected reduction: 0

### Code Quality
- ✓ Only 2 source files changed
- ✓ Changes are envelope pattern only
- ✓ No wrapper changes
- ✓ No auth context changes
- ✓ No capability additions
- ✓ No forbidden files touched
- ✓ Scope constraints observed

### Behavior
- ✓ Business logic preserved
- ✓ Response shape preserved
- ✓ Error handling preserved
- ✓ Audit events preserved
- ✓ Authorization preserved

---

## Rollback Rule

If any test fails, validation gate fails, or scope violation detected:
1. STOP implementation
2. Revert all changes
3. Generate failure report
4. Request clarification
5. Do not proceed to next phase

---

## Stop Conditions

**STOP if:**
1. Any build error
2. Any test failure
3. Any TypeScript error
4. Scanner violations increase
5. Any file outside scope modified
6. Response shape changes
7. Business logic changes
8. Behavior changes
9. Authorization changes
10. any/as any introduced

---

## Maximum Scope

**Total Changes:**
- 2 source files modified (service + route)
- 1 parameter/field change (userId → ServiceAuthEnvelope)
- 0 new capabilities
- 0 new tests
- 0 wrapper changes
- 0 auth context changes

**Lines of Code:**
- Service: ~10 lines (userId → verifiedActorId replacement)
- Route: ~10 lines (envelope construction + passing)
- Total: ~20 lines of actual changes

---

## Risk Mitigation

1. **Proven Pattern:** Follows X9E-2 route modernization pattern
2. **Route Already Modern:** No route migration needed
3. **Single Caller:** Only one route calls this service
4. **Simple Input:** Typed input structure
5. **No Logic Changes:** Only input structure changes
6. **Comprehensive Tests:** 402 existing tests validate
7. **Clean Rollback:** Only 2 files, easy to revert
8. **Low Scope:** Minimal changes, high confidence

---

## Decision Points

**After Phase X9F-2:**

If successful:
- ✓ Proceed to X9F-3 (acceptDecision refactor)
- ✓ Pattern proven for remaining services

If blocked by governance:
- Clarify and address blocker
- Consider alternative service

If infrastructure not ready:
- Defer and continue evaluation

---

## Notes

1. **Why createDecision?** Route already modernized in X9E-2, proven pattern, lowest risk
2. **Why ServiceAuthEnvelope?** Readonly verified decision, prevents fabrication, maintains security boundary
3. **Why no scanner reduction?** Pattern change doesn't affect violation detection (still canonical route)
4. **Why no test changes?** Service behavior unchanged, integration tests sufficient
5. **Why 0-1 service limit?** Single pilot allows careful validation before broader adoption
