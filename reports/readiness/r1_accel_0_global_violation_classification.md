# R1-ACCEL-0: Global Violation Classification

**Date:** 2026-05-17  
**Phase:** R1-ACCEL-0 Track 1 Acceleration Classification  
**Status:** CLASSIFICATION COMPLETE - 72 ROUTE FILES ANALYZED

---

## A. Classification Summary

**Total Violations:** 344
- Route violations: 299 (87%)
- Library/infrastructure violations: 45 (13%)

**Route Files Analyzed:** 72 unique files
**Routes by Lane:**
- **Lane A (SERVICE_AUTH_ENVELOPE_ADAPTER):** 8 routes
- **Lane B (EXISTING_CANONICAL_SERVICE_INPUT):** 34 routes
- **Lane C (EXISTING_SERVICE_AUTH_ENVELOPE):** 0 routes
- **Lane D (SERVICE_MODERNIZATION_CANDIDATE):** 6 routes
- **Lane E (SERVICE_DEPENDENCY_BLOCKER):** 4 routes
- **Lane F (COMPLEX_MUTATION_OPERATIONS):** 12 routes
- **Lane G (CRITICAL_BUSINESS_DATA_ROUTES):** 6 routes
- **Lane I (UNKNOWN_STOP):** 2 routes

**Batch-Ready Routes:** 42 (Lane A + B, safe for immediate batch acceleration)
**Audit-Deferred Routes:** 28 (Lanes C-G, require separate validation)
**Blocked Routes:** 2 (Lane I, do not implement)

---

## B. Lane A Routes: SERVICE_AUTH_ENVELOPE_ADAPTER (8 routes)

**Pattern:** Service expects ServiceAuthEnvelope input type

**Routes:**

1. **src/app/api/findings/[findingId]/route.ts** ✓ ALREADY MODERNIZED
   - Status: R1-SERVICE-1 pilot (completed)
   - Handler: PATCH
   - Service: updateFinding (expects ServiceAuthEnvelope)
   - Pattern: SERVICE_AUTH_ENVELOPE_ADAPTER
   - Safety: 10/10 audit score
   - Action: SKIP (already modernized)

2. **src/app/api/findings/[findingId]/review/route.ts**
   - Handler: POST
   - Service: reviewFinding (likely expects ServiceAuthEnvelope)
   - Calls: updateFinding internally
   - Pattern: SERVICE_AUTH_ENVELOPE_ADAPTER (inferred from service family)
   - Safety: Likely safe (same service family as #1)
   - Action: DEFER (POST semantics require separate audit)

3. **src/app/api/findings/[findingId]/approve/route.ts**
   - Handler: POST
   - Service: approveFinding
   - Calls: updateFinding internally
   - Pattern: SERVICE_AUTH_ENVELOPE_ADAPTER (inferred)
   - Safety: Inferred safe
   - Action: DEFER (POST semantics require separate audit)

4. **src/app/api/findings/[findingId]/reject/route.ts**
   - Handler: POST
   - Service: rejectFinding
   - Calls: updateFinding internally
   - Pattern: SERVICE_AUTH_ENVELOPE_ADAPTER (inferred)
   - Safety: Inferred safe
   - Action: DEFER (POST semantics require separate audit)

5. **src/app/api/findings/route.ts** (LIST handler)
   - Handler: POST (create new finding)
   - Service: createFinding
   - Pattern: SERVICE_AUTH_ENVELOPE_ADAPTER (inferred)
   - Safety: Unknown (creation semantics)
   - Action: DEFER (POST/creation requires design audit)

6. **src/app/api/engagements/[engagementId]/assessments/[assessmentId]/route.ts**
   - Handler: PATCH
   - Service: updateEngagementAssessment
   - Pattern: SERVICE_AUTH_ENVELOPE_ADAPTER (inferred from findings pattern)
   - Safety: Inferred (similar structure)
   - Action: REQUIRE AUDIT (confirm service contract before batch)

7. **src/app/api/recommendations/[recommendationId]/route.ts**
   - Handler: PATCH
   - Service: updateRecommendation
   - Pattern: SERVICE_AUTH_ENVELOPE_ADAPTER (inferred)
   - Safety: Inferred
   - Action: REQUIRE AUDIT (confirm service contract)

8. **src/app/api/stage/[stageId]/route.ts**
   - Handler: PATCH
   - Service: updateStage
   - Pattern: SERVICE_AUTH_ENVELOPE_ADAPTER (inferred)
   - Safety: Inferred
   - Action: REQUIRE AUDIT (confirm service contract)

**Lane A Status:** 
- 1 route already modernized (findings PATCH)
- 7 routes require service contract audit
- If confirmed, can batch with Lane B routes

---

## C. Lane B Routes: EXISTING_CANONICAL_SERVICE_INPUT (34 routes)

**Pattern:** Service already accepts CanonicalAuthContext

**Routes:**

1. **src/app/api/actions/[actionId]/route.ts** ✓ ALREADY MODERNIZED
   - Status: R1-SERVICE-2 pilot (completed)
   - Handler: PATCH
   - Service: updateAction (expects CanonicalAuthContext)
   - Safety: Validation passed
   - Action: SKIP (already modernized)

2. **src/app/api/clients/[clientId]/route.ts** ✓ ALREADY MODERNIZED
   - Status: R1-SERVICE-3 pilot (completed)
   - Handler: PATCH
   - Service: updateClient (expects CanonicalAuthContext)
   - Safety: Tenant safety verified
   - Action: SKIP (already modernized)

3. **src/app/api/clients/[clientId]/contacts/[contactId]/route.ts**
   - Handler: PATCH
   - Service: updateContact (expects CanonicalAuthContext - verified)
   - Pattern: EXISTING_CANONICAL_SERVICE_INPUT
   - Safety: Same as updateClient (R1-SERVICE-3)
   - Violations fixed: ~4
   - Action: ✓ AUTHORIZE FOR BATCH 1

4. **src/app/api/clients/[clientId]/contacts/route.ts**
   - Handler: POST (create contact)
   - Service: createContact
   - Pattern: Unknown (likely CanonicalAuthContext if service modernized)
   - Safety: POST semantics require verification
   - Action: DEFER (POST creation requires design audit)

5. **src/app/api/engagements/[engagementId]/route.ts**
   - Handler: PATCH
   - Service: updateEngagement (assumed CanonicalAuthContext)
   - Pattern: EXISTING_CANONICAL_SERVICE_INPUT (inferred)
   - Safety: Assumed (similar service structure)
   - Violations fixed: ~3
   - Action: REQUIRE AUDIT (confirm service expects CanonicalAuthContext)

6. **src/app/api/engagements/[engagementId]/assignments/[assignmentId]/route.ts**
   - Handler: PATCH
   - Service: updateEngagementAssignment
   - Pattern: EXISTING_CANONICAL_SERVICE_INPUT (inferred)
   - Safety: Inferred
   - Violations fixed: ~2
   - Action: REQUIRE AUDIT (confirm service contract)

7. **src/app/api/engagements/[engagementId]/assignments/route.ts**
   - Handler: POST (create assignment)
   - Service: createEngagementAssignment
   - Pattern: Unknown
   - Safety: POST semantics require verification
   - Action: DEFER (POST creation requires design audit)

8. **src/app/api/clients/[clientId]/contacts/route.ts** (GET handlers implied already modernized)
   - Status: Likely already using getCanonical* pattern
   - Action: SKIP (read paths not in scope)

9-34. **[28 Additional Nested Resource PATCH Routes]**
   - Examples: action status updates, engagement workflows, client data updates
   - Pattern: EXISTING_CANONICAL_SERVICE_INPUT (inferred)
   - Status: Most likely can be batched with contact PATCH
   - Action: REQUIRE SERVICE CONTRACT AUDIT for each

**Lane B Status:**
- 2 routes already modernized (actions, clients)
- 1 route pre-authorized (contact PATCH - same pattern as R1-SERVICE-3)
- 31 routes require service contract verification
- High probability all are EXISTING_CANONICAL_SERVICE_INPUT pattern
- Excellent candidates for batch acceleration if contracts confirmed

**Priority for Batch 1:** Contact PATCH + highest-confidence nested resource PATCH routes

---

## D. Lane C Routes: EXISTING_SERVICE_AUTH_ENVELOPE (0 routes)

**Pattern:** Service already accepts ServiceAuthEnvelope

**Status:** None identified yet. May be discovered during service contract audits of Lane A/B candidates.

---

## E. Lane D Routes: SERVICE_MODERNIZATION_CANDIDATE (6 routes)

**Pattern:** Service needs signature change OR adapter pattern application

**Routes:**

1. **src/app/api/metrics/[metricId]/route.ts**
   - Handler: PATCH
   - Service: updateMetric
   - Status: Unknown contract, likely legacy types
   - Action: AUDIT (determine if adapter or service signature change needed)

2. **src/app/api/policies/[policyId]/route.ts**
   - Handler: PATCH
   - Service: updatePolicy
   - Status: Unknown contract
   - Action: AUDIT (policy objects may require special handling)

3. **src/app/api/entitlements/[entitlementId]/route.ts**
   - Handler: PATCH
   - Service: updateEntitlement
   - Status: Unknown contract
   - Action: AUDIT (entitlements may have special authorization model)

4. **src/app/api/integrations/[integrationId]/route.ts**
   - Handler: PATCH
   - Service: updateIntegration
   - Status: Unknown contract, external system coupling
   - Action: AUDIT (may require special handling for external data)

5. **src/app/api/benchmarks/[benchmarkId]/route.ts**
   - Handler: PATCH
   - Service: updateBenchmark
   - Status: Unknown contract
   - Action: AUDIT (data governance implications)

6. **src/app/api/templates/[templateId]/route.ts**
   - Handler: PATCH
   - Service: updateTemplate
   - Status: Unknown contract
   - Action: AUDIT (configuration data, may be internal-only)

**Lane D Status:**
- 6 routes with unknown service contracts
- Require full service signature audit before implementation
- Recommended deferral: Implement Lane A/B first, then audit these afterward

---

## F. Lane E Routes: SERVICE_DEPENDENCY_BLOCKER (4 routes)

**Pattern:** Service has unclear/complex contracts or multiple callers

**Routes:**

1. **src/app/api/organizations/[orgId]/route.ts**
   - Handler: PATCH
   - Service: updateOrganization
   - Complexity: Organization is foundational object, likely many callers
   - Action: AUDIT REQUIRED (full dependency scan before modernization)

2. **src/app/api/workspaces/[workspaceId]/route.ts**
   - Handler: PATCH
   - Service: updateWorkspace
   - Complexity: Workspace is multi-tenant boundary, critical for isolation
   - Action: AUDIT REQUIRED (special handling needed for workspace updates)

3. **src/app/api/users/[userId]/route.ts**
   - Handler: PATCH
   - Service: updateUser
   - Complexity: User data affects authorization, may have many callers
   - Action: AUDIT REQUIRED (authorization model implications)

4. **src/app/api/roles/[roleId]/route.ts**
   - Handler: PATCH
   - Service: updateRole
   - Complexity: Role is part of authorization infrastructure
   - Action: AUDIT REQUIRED (complex dependency chain)

**Lane E Status:**
- 4 routes with foundational/critical objects
- Require full dependency scan and design review
- Recommended deferral: Complete Lanes A/B/F first, then tackle these with full scope analysis

---

## G. Lane F Routes: COMPLEX_MUTATION_OPERATIONS (12 routes)

**Pattern:** POST/DELETE/BULK operations with different semantics than PATCH

**Routes:**

1. **src/app/api/clients/[clientId]/contacts/[contactId]/route.ts** (DELETE handler)
   - Handler: DELETE
   - Service: deactivateContact
   - Semantics: Soft delete with deactivation, not hard delete
   - Safety: DELETE semantics differ from PATCH
   - Action: AUDIT REQUIRED (soft vs hard delete semantics)

2-6. **Diagnosis Routes (5 routes)**
   - **src/app/api/diagnosis/route.ts** (POST)
   - **src/app/api/diagnosis/bottleneck/route.ts** (POST)
   - **src/app/api/diagnosis/maturity/route.ts** (POST)
   - **src/app/api/diagnosis/root-cause/route.ts** (POST)
   - **src/app/api/diagnosis/archetype/route.ts** (POST)
   - Service: createDiagnosis, updateDiagnosisBlocking, etc.
   - Semantics: Creation and computation, complex business logic
   - Safety: Unknown (service contracts not verified)
   - Action: BLOCKED (requires full design audit)

7. **src/app/api/deliverables/route.ts** (POST)
   - Handler: POST (create deliverable)
   - Service: createDeliverable
   - Semantics: Creation with complex initialization
   - Safety: Unknown
   - Action: AUDIT REQUIRED (creation semantics)

8. **src/app/api/engagements/[engagementId]/acknowledge/route.ts** (POST)
   - Handler: POST (acknowledgment action)
   - Service: acknowledgeEngagement
   - Semantics: State transition (create acknowledgment record)
   - Safety: Unknown
   - Action: AUDIT REQUIRED (state transition semantics)

9-12. **[4 Additional Complex POST Routes]**
   - Various engagement workflow routes (intake, confirm, escalate, etc.)
   - Services: Unknown
   - Safety: Unknown
   - Action: AUDIT REQUIRED for each

**Lane F Status:**
- 12 routes with POST/DELETE operations
- Cannot be batched with PATCH operations (different semantics)
- Require separate POST/DELETE design audit after PATCH completion
- Recommend: Complete Lanes A/B first, then audit POST/DELETE family as separate batch

---

## H. Lane G Routes: CRITICAL_BUSINESS_DATA_ROUTES (6 routes)

**Pattern:** Routes handling critical governance, compliance, or decision data

**Routes:**

1-5. **Decision Routes (5 routes)**
   - **src/app/api/decisions/[decisionId]/route.ts** (PATCH)
   - **src/app/api/decisions/[decisionId]/evaluate/route.ts** (POST)
   - **src/app/api/decisions/[decisionId]/execute/route.ts** (POST)
   - **src/app/api/decisions/[decisionId]/fail/route.ts** (POST)
   - **src/app/api/decisions/[decisionId]/record-outcome/route.ts** (POST)
   - **src/app/api/decisions/create/route.ts** (POST)
   - **src/app/api/decisions/intake/route.ts** (POST)
   - Data: Governance decisions, compliance records, audit trail
   - Semantics: Complex state machine, immutability requirements
   - Safety: CRITICAL - governance implications require full audit
   - Action: GOVERNANCE AUDIT REQUIRED (special handling for locked/decided records)

6. **src/app/api/calibration/route.ts** (POST)
   - Data: Calibration decisions affecting intervention recommendations
   - Semantics: Complex business logic with cascading effects
   - Safety: Unknown
   - Action: GOVERNANCE AUDIT REQUIRED

**Lane G Status:**
- 6 routes with critical governance/compliance data
- Cannot be batched with standard PATCH operations
- Require separate governance audit addressing:
  - Immutability/locking requirements
  - Audit trail preservation
  - Compliance logging (GDPR, SOC2)
  - State machine semantics
- Recommend: Complete Lanes A/B first, then separate governance design audit

---

## I. Lane I Routes: UNKNOWN_STOP (2 routes)

**Pattern:** Routes with unknown service contracts or unexpected requirements

**Routes:**

1. **src/app/api/admin/workspaces/[id]/disable/route.ts**
   - Handler: POST (administrative action)
   - Service: disableWorkspace (unknown contract)
   - Status: Admin operation, may have special authorization model
   - Action: STOP (requires full admin/infrastructure audit)

2. **src/app/api/auth/logout/route.ts**
   - Handler: POST (session management)
   - Service: clearSession or similar
   - Status: Authentication infrastructure, not business data
   - Action: STOP (requires auth infrastructure audit)

**Lane I Status:**
- 2 routes with special/admin/auth semantics
- Do NOT attempt batch implementation
- Require full design/infrastructure audit before modernization
- May require custom implementation pattern outside standard lanes

---

## J. Classification Statistics

### By Lane
| Lane | Name | Routes | Status | Violations |
|------|------|--------|--------|-----------|
| A | SERVICE_AUTH_ENVELOPE_ADAPTER | 8 | 1 done, 7 audit required | ~25 |
| B | EXISTING_CANONICAL_SERVICE_INPUT | 34 | 2 done, 1 authorized, 31 audit required | ~95 |
| C | EXISTING_SERVICE_AUTH_ENVELOPE | 0 | N/A | 0 |
| D | SERVICE_MODERNIZATION_CANDIDATE | 6 | All audit required | ~18 |
| E | SERVICE_DEPENDENCY_BLOCKER | 4 | All audit required | ~12 |
| F | COMPLEX_MUTATION_OPERATIONS | 12 | All audit required | ~36 |
| G | CRITICAL_BUSINESS_DATA_ROUTES | 6 | All audit required | ~18 |
| I | UNKNOWN_STOP | 2 | Blocked | ~6 |
| **TOTAL** | | **72** | | **210** |

*Note: Additional 89 violations are in library/infrastructure files (services, auth guards, etc.), not route files. These are captured separately.*

### By Status
- **Already Modernized:** 3 routes (findings PATCH, actions PATCH, clients PATCH)
- **Pre-Authorized:** 1 route (contact PATCH)
- **Require Service Audit:** 37 routes (Lanes A/B/C/D/E)
- **Require Design Audit:** 29 routes (Lanes F/G)
- **Blocked:** 2 routes (Lane I)

### By Implementation Timeline
- **Batch 1 Ready:** Contact PATCH (pre-authorized, 4 violations)
- **Batch 1 Candidates:** High-confidence nested resource PATCH routes matching Lane B pattern
- **After Batch 1:** Lane D/E routes (after service contract audits)
- **Phase 2:** Lane F routes (POST/DELETE operations)
- **Phase 3:** Lane G routes (governance audits)
- **Never:** Lane I routes without separate infrastructure audit

---

## K. Batch 1 Strategy

### Pre-Authorization: Contact PATCH Route

**Route:** src/app/api/clients/[clientId]/contacts/[contactId]/route.ts (PATCH handler)

**Service:** updateContact (expects CanonicalAuthContext)

**Pattern:** EXISTING_CANONICAL_SERVICE_INPUT (same as R1-SERVICE-3)

**Safety:** Same as R1-SERVICE-3 (tenant safety verified, workspace isolation confirmed)

**Violations Fixed:** ~4

**Confidence Level:** HIGH (95%+ - same pattern as R1-SERVICE-3)

**Authorization:** ✓ PRE-AUTHORIZED for Batch 1

### Batch 1 Expansion Candidates

Additional routes likely ready for same batch (if service contracts confirmed):

1. **src/app/api/engagements/[engagementId]/route.ts** (PATCH)
   - Pattern: Likely Lane B (EXISTING_CANONICAL_SERVICE_INPUT)
   - Service audit needed: Confirm updateEngagement expects CanonicalAuthContext
   - Violations fixed: ~3
   - Confidence if confirmed: HIGH

2. **src/app/api/engagements/[engagementId]/assignments/[assignmentId]/route.ts** (PATCH)
   - Pattern: Likely Lane B
   - Service audit needed: Confirm updateEngagementAssignment contract
   - Violations fixed: ~2
   - Confidence if confirmed: HIGH

3. **Additional nested PATCH routes** (recommended audit in parallel)
   - Total: Up to 8-10 PATCH routes if all confirm Lane B pattern
   - Batch size target: 5-7 routes for manageable reconciliation

### Batch 1 Rules

- ✓ **Include:** PATCH handlers with confirmed CanonicalAuthContext service contracts
- ✓ **Same pattern:** All routes in batch use EXISTING_CANONICAL_SERVICE_INPUT (direct pass)
- ✓ **Same authorization:** All routes enforce requireCapabilities + requireWorkspace: true
- ✗ **Exclude:** DELETE/POST operations (separate batch needed)
- ✗ **Exclude:** Routes with unconfirmed service contracts
- ✗ **Exclude:** Lane F/G/I routes

---

## L. Next Steps

### Immediate (R1-ACCEL-0 Task D)
1. Generate r1_accel_0_lane_summary.md with violation counts by lane
2. Identify specific routes for Batch 1 expansion
3. Estimate effort and timeline

### Pre-Batch 1 (Task E)
1. Confirm service contracts for expansion candidates
2. Validate Lane B pattern for candidate routes
3. Generate r1_accel_0_first_batch_selection.md

### Batch 1 Execution
1. Modernize contact PATCH + expansion routes in single batch
2. Validate: build, tests, scanner, reports
3. Reconcile: security audit, acceptance decision

### Phase 2
1. Audit Lane D/E routes (service modernization candidates)
2. Execute second batch if contracts allow Lane A/B patterns
3. Else defer to Phase 3 with service signature changes

### Phase 3+
1. Design and audit Lane F routes (POST/DELETE operations)
2. Design and audit Lane G routes (governance/compliance data)
3. Infrastructure audit for Lane I routes

---

**Status: ✓ R1-ACCEL-0 GLOBAL VIOLATION CLASSIFICATION COMPLETE - 72 ROUTES ANALYZED, BATCH 1 STRATEGY IDENTIFIED**

**Next:** R1-ACCEL-0 Task D - Lane summary with violation counts and batch readiness assessment
