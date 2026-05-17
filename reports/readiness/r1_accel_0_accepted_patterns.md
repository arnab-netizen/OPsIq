# R1-ACCEL-0: Accepted Patterns & Execution Lanes

**Date:** 2026-05-17  
**Phase:** R1-ACCEL-0 Track 1 Acceleration Classification  
**Status:** ACCEPTED PATTERNS DEFINED - EXECUTION LANES ESTABLISHED

---

## A. Summary

Three successful pilots have proven two safe modernization patterns. These patterns establish the foundation for controlled batch acceleration. This document defines 7 execution lanes (A-G) and 1 blocker lane (I) that classify remaining 344 violations based on service contract alignment, authorization requirements, and workspace semantics.

**Total Lanes:** 8
- **Lanes A-B:** Proven safe, ready for batch acceleration
- **Lanes C-G:** Conditional safe, require validation gates
- **Lane I:** Blocker, stop until design audit complete

---

## B. Pattern 1: SERVICE_AUTH_ENVELOPE_ADAPTER (Lane A)

### Pattern Definition

**For services that expect ServiceAuthEnvelope input type**

Route creates CanonicalAuthContext → ServiceAuthEnvelope adapter at call site.
Wrapper verifies all 7 fields before handler runs. Service receives verified context.

### Implementation

```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const authEnvelope: ServiceAuthEnvelope = {
      verifiedActorId: ctx.verifiedActorId,
      verifiedActorType: ctx.verifiedActorType,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedCapabilities: ctx.verifiedCapabilities,
      hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
      verifiedActor: ctx.verifiedActor,
      policy: ctx.policy,
    };
    await updateService(id, body, authEnvelope);
  },
  {
    requireCapabilities: [CAPABILITY_NEEDED],
    requireWorkspace: true,
  }
);
```

### Safety Profile

- **Adapter audit:** 10/10 score (R1-SERVICE-1 validation)
- **Authorization:** Enforced at wrapper before handler
- **Workspace isolation:** Enforced at wrapper before handler
- **Type safety:** Strong (CanonicalAuthContext → ServiceAuthEnvelope, verified fields only)
- **Service signature:** Unchanged (service expects ServiceAuthEnvelope already)
- **Weakness check:** No weak auth patterns, no fallback values, no header extraction

### Batch Eligibility

✓ **Ready for batch acceleration**
- Pattern proven safe (R1-SERVICE-1 pilot)
- All adapter fields verified by wrapper
- No service signature changes needed
- No weak auth patterns possible

### Validation Gates

✓ **Pre-acceleration checklist:**
1. Service signature confirms: `service(id, input, auth: ServiceAuthEnvelope)`
2. Route uses: `withCanonicalEnforcement` wrapper
3. Route enforces: `requireCapabilities: [...]` and `requireWorkspace: true`
4. Adapter creates all 7 fields from CanonicalAuthContext (no header fallbacks)
5. Service uses adapter fields (no re-canonicalization inside service)
6. No query string or header parameters influence authentication
7. Handler signature: `async (ctx: CanonicalAuthContext, params)`

### Example

**R1-SERVICE-1 (findings):**
- Service: updateFinding expects ServiceAuthEnvelope ✓
- Pattern: Adapter created at call site ✓
- Safety: 10/10 audit score ✓

---

## C. Pattern 2: EXISTING_CANONICAL_SERVICE_INPUT (Lane B)

### Pattern Definition

**For services already modernized to accept CanonicalAuthContext**

Service was pre-modernized (expected CanonicalAuthContext signature).
Route passes context directly via withCanonicalEnforcement wrapper. No adapter needed.

### Implementation

```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    await updateService(id, body, ctx, ctx.verifiedWorkspaceId);
  },
  {
    requireCapabilities: [CAPABILITY_NEEDED],
    requireWorkspace: true,
  }
);
```

### Safety Profile

- **Service contract:** Already expects CanonicalAuthContext
- **Authorization:** Enforced at wrapper before handler
- **Workspace isolation:** Enforced at wrapper before handler
- **Type safety:** Strong (exact type match, no conversion needed)
- **Service signature:** Unchanged
- **Complexity:** Minimal (no adapter layer)

### Batch Eligibility

✓ **Ready for batch acceleration**
- Pattern proven safe (R1-SERVICE-2, R1-SERVICE-3 pilots)
- Service already accepts CanonicalAuthContext
- No service signature changes needed
- Simplest modernization path

### Validation Gates

✓ **Pre-acceleration checklist:**
1. Service signature confirms: `service(id, input, ctx: CanonicalAuthContext, workspaceId: string)`
2. Route uses: `withCanonicalEnforcement` wrapper
3. Route enforces: `requireCapabilities: [...]` and `requireWorkspace: true`
4. Route passes: ctx directly (no adapter creation)
5. Service uses ctx fields directly (no re-verification)
6. Service queries filter by: verified workspace ID
7. Handler signature: `async (ctx: CanonicalAuthContext, params)`

### Examples

**R1-SERVICE-2 (actions):**
- Service: updateAction expects CanonicalAuthContext ✓
- Pattern: Direct pass, no adapter ✓
- Safety: Validation passed ✓

**R1-SERVICE-3 (clients):**
- Service: updateClient expects CanonicalAuthContext ✓
- Pattern: Direct pass, no adapter ✓
- Safety: Tenant safety verified ✓

---

## D. Conditional Lanes (C-G)

### Lane C: EXISTING_SERVICE_AUTH_ENVELOPE

**For services already modernized to accept ServiceAuthEnvelope**

Service signature: `service(id, input, auth: ServiceAuthEnvelope, ...)`

**Status:** Conditional (likely safe, but not yet piloted)

**Validation required:**
1. Service file confirms current signature expects ServiceAuthEnvelope
2. No conflicting callers (other code paths still expecting old type)
3. Wrapper verification covers all adapter fields
4. Authorization not changed since service modernization

**If validated:** Use as Lane A (no adapter needed, service already aligned)

---

### Lane D: SERVICE_MODERNIZATION_CANDIDATE

**For services not yet modernized to accept CanonicalAuthContext**

Current signature expects legacy types (e.g., raw request, session object).
Service requires signature change OR adapter pattern application.

**Status:** Requires design decision (Phase 2+)

**Validation required:**
1. Determine service contract (what does it currently accept?)
2. Decide: Adapter pattern OR service signature change?
3. If adapter: Create ServiceAuthEnvelope adapter (Lane A pattern)
4. If service change: Schedule for Phase 2 service migration

**Defer to:** After batch acceleration of Lanes A-B proves pattern safe at scale

---

### Lane E: SERVICE_DEPENDENCY_BLOCKER

**For services with unclear/complex contracts or multiple callers**

Service signature unclear, documentation missing, or extensive dependencies.

**Status:** Blocked (requires full design audit)

**Validation required:**
1. Service file audit: Confirm exact current signature
2. Dependency scan: All callers analyzed
3. Migration design: Path to either Lane A or Lane B determined
4. Authorization model: Unchanged by modernization

**Defer to:** Separate design audit before scheduling

---

### Lane F: COMPLEX_MUTATION_OPERATIONS

**For POST/DELETE/BULK operations (different semantics)**

Creation, deletion, or bulk operations with state machine or side-effects.

**Status:** Requires mutation semantics audit

**Validation required:**
1. HTTP semantics check: POST/DELETE have different guarantees than PATCH
2. Business logic audit: State transitions, cascading effects, idempotency
3. Authorization check: Same capabilities enforced?
4. Workspace scoping: Applies to bulk operations correctly?

**Examples:** diagnosis POST (creation), decisions POST (state machine), contact DELETE (deactivation)

**Defer to:** After PATCH operations (Lane A/B) proven safe, then audit POST/DELETE separately

---

### Lane G: CRITICAL_BUSINESS_DATA_ROUTES

**For routes handling critical business data requiring compliance/audit**

Diagnosis, decisions, recommendations, governance records.

**Status:** Requires governance audit

**Validation required:**
1. Audit trail: Mutations logged with verified actor and workspace
2. Compliance: Data isolation for GDPR/SOC2 requirements
3. Governance: Records remain locked/immutable as needed
4. Authorization: Capability enforcement aligns with governance rules

**Defer to:** After core routes (Lane A/B) proven, then governance-specific audit

---

## E. Blocker Lane: UNKNOWN_STOP (Lane I)

### Pattern Definition

**For routes that don't match any proven pattern**

Service contract unknown, service name unclear, or unexpected requirements.

**Status:** STOP - Do not attempt batch implementation

### Prerequisites for Unblocking

1. Service file located and read
2. Service signature confirmed (what type does it expect?)
3. Service contract matches Lane A, B, C, D, E, F, or G
4. Design audit complete if required
5. Validation gates passed for target lane

### Recovery Path

- Read service file → Reclassify to correct lane
- Audit service contract → Determine pattern needed
- Validate against target lane gates → Confirm safe
- Resubmit for batch assignment

---

## F. Global Execution Lane Definitions

| Lane | Pattern | Service Type | Route Type | Safe for Batch? | Status | Examples |
|------|---------|--------------|-----------|-----------------|--------|----------|
| **A** | SERVICE_AUTH_ENVELOPE_ADAPTER | Expects ServiceAuthEnvelope | PATCH/PUT | ✓ YES | Proven (R1-SERVICE-1) | findings |
| **B** | EXISTING_CANONICAL_SERVICE_INPUT | Already accepts CanonicalAuthContext | PATCH/PUT | ✓ YES | Proven (R1-SERVICE-2, R1-SERVICE-3) | actions, clients, contacts |
| **C** | EXISTING_SERVICE_AUTH_ENVELOPE | Already accepts ServiceAuthEnvelope | PATCH/PUT | ✓ CONDITIONAL | Likely safe, not piloted | TBD |
| **D** | SERVICE_MODERNIZATION_CANDIDATE | Legacy service types | PATCH/PUT | ✗ DEFERRED | Requires design | Various |
| **E** | SERVICE_DEPENDENCY_BLOCKER | Complex/unclear contracts | Any | ✗ BLOCKED | Requires audit | Various |
| **F** | COMPLEX_MUTATION_OPERATIONS | POST/DELETE with state | POST/DELETE | ✗ DEFERRED | Separate semantics audit | diagnosis, decisions |
| **G** | CRITICAL_BUSINESS_DATA_ROUTES | Governance/compliance data | Any | ✗ DEFERRED | Separate governance audit | decisions, recommendations |
| **I** | UNKNOWN_STOP | Unknown contract | Any | ✗ STOP | Do not implement | Unknown services |

---

## G. Validation Gate Checklist

### Pre-Implementation Checklist (Required for All Lanes A-B)

- [ ] **Service file location confirmed**
- [ ] **Service signature verified** (what type does it expect?)
- [ ] **Wrapper usage confirmed** (withCanonicalEnforcement)
- [ ] **Authorization enforcement** (requireCapabilities set correctly)
- [ ] **Workspace enforcement** (requireWorkspace: true)
- [ ] **No query string/header auth** (all data from verified context)
- [ ] **Handler signature correct** (ctx: CanonicalAuthContext, params)
- [ ] **Response shape unchanged** (same type as before)
- [ ] **No service file changes needed** (service already modernized)
- [ ] **No scope creep** (only PATCH/PUT handler, GET/POST unchanged)

### Post-Implementation Checklist (Required before Commit)

- [ ] **Build clean** (TypeScript 0 errors)
- [ ] **Tests pass** (78/78 passing, no regressions)
- [ ] **Scanner run** (violations reduced as expected)
- [ ] **Only pilot route changed** (no other files modified)
- [ ] **Reports generated** (audit/validation/acceptance documents)
- [ ] **Scope audit passed** (only authorized changes made)
- [ ] **No unauthorized files modified** (service files, wrapper files, etc.)

---

## H. Batch Acceleration Rules

### Allowed in Single Batch

✓ **Same service pattern:**
- Multiple routes using Lane A pattern (adapter) together
- Multiple routes using Lane B pattern (direct pass) together
- Routes with identical authorization requirements
- Routes with identical workspace semantics

✓ **No batch crossing patterns:**
- Cannot mix Lane A (adapter) with Lane B (direct pass) in single batch
- Cannot include any Lane C-G routes in batch with Lane A/B
- Cannot include Lane I (unknown) routes at all

✓ **Batch size guidelines:**
- Minimum: 3 handlers per batch (critical mass for validation)
- Maximum: 10 handlers per batch (manageable scope per reconciliation)
- Prefer: 5-7 handlers per batch (good balance)

### Forbidden in Batches

✗ **Never batch together:**
- Routes with different service pattern types
- Routes requiring different authorization changes
- Routes with different workspace semantics
- Any Lane I (unknown) routes
- Any Lane C-G (conditional/deferred) routes without separate validation

✗ **Never include:**
- Webhook routes (special event handling)
- Payment processing routes (financial compliance)
- Run/verify/execute routes (execution engines)
- Policy wrapper implementation routes (meta-infrastructure)
- Service files (only routes allowed)
- Infrastructure/middleware files

---

## I. Acceleration Workflow

### For Each Batch

1. **Classify routes** into execution lane (A, B, C-G, or I)
2. **Validate against gates** appropriate for target lane
3. **Group by pattern** (all A together, all B together)
4. **Batch size check** (3-10 routes per batch, consistent pattern)
5. **Implement batch** (single phase, all routes together)
6. **Validate batch** (build, tests, scanner, reports)
7. **Reconcile batch** (security audit, commitment decision)

### Authorization Scope

- **Single batch authorization required** (per batch, not per route)
- **No broad scaling** (each batch explicitly authorized)
- **Lane-by-lane progression** (A → B → C → D → etc.)
- **Escalation gates** (defer to design/governance as needed)

---

## J. Status Summary

### Proven Patterns (Ready for Batch Acceleration)
✓ Lane A: SERVICE_AUTH_ENVELOPE_ADAPTER (10/10 safety score, R1-SERVICE-1)
✓ Lane B: EXISTING_CANONICAL_SERVICE_INPUT (R1-SERVICE-2, R1-SERVICE-3)

### Conditional Patterns (Require Validation Gates)
△ Lane C: EXISTING_SERVICE_AUTH_ENVELOPE (likely safe, not piloted)
△ Lane D: SERVICE_MODERNIZATION_CANDIDATE (requires design)
△ Lane E: SERVICE_DEPENDENCY_BLOCKER (requires audit)
△ Lane F: COMPLEX_MUTATION_OPERATIONS (requires semantics audit)
△ Lane G: CRITICAL_BUSINESS_DATA_ROUTES (requires governance audit)

### Blocker Lane
✗ Lane I: UNKNOWN_STOP (do not implement)

---

**Status: ✓ R1-ACCEL-0 ACCEPTED PATTERNS DEFINED - EXECUTION LANES ESTABLISHED**

**Next:** R1-ACCEL-0 Task C - Global violation classification into lanes
