# X9C-3: Service Contract Options Evaluation

**Phase:** X9C-3 (Service Auth Boundary Design)  
**Date:** 2026-05-15  
**Status:** OPTIONS EVALUATED - RECOMMENDATION READY

---

## Option A: All Services Accept CanonicalAuthContext

**Pattern:**
```typescript
export async function doSomething(input, authContext: CanonicalAuthContext, workspaceId: string) {
  // Service receives full canonical context
  // Service may access any field (verifiedActorId, verifiedCapabilities, policy, etc.)
}
```

**Evaluation:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Security Impact | ⚠️ MEDIUM | Services could access optional fields (policy, session) they shouldn't. Need discipline. |
| Tenant Isolation | ✓ GOOD | workspaceId and verifiedWorkspaceId align |
| Service Boundary Clarity | ✗ POOR | Unclear what fields service should use |
| Migration Complexity | ✓ LOW | Just change context type, no signature changes |
| Compatibility with Current Routes | ✓ HIGH | Many routes already pass authContext |
| Compatibility with BG/System Actors | ✗ POOR | How do background jobs construct authContext? |
| Compatibility with Tests | ✗ POOR | Tests must construct valid authContext |
| Risk of Fake Auth | ⚠️ MEDIUM | Services could misuse context fields |
| Risk of Policy Fabrication | ⚠️ MEDIUM | Unclear rules about accessing policy |
| Expected Scanner Reduction | ~ 60-80 | Removes auth-guard imports, but services still receive context |
| Implementation Risk | ✓ LOW | No service logic changes needed |

**Verdict: ✗ REJECTED**  
Reason: Too permissive. Services could misuse optional context fields. Creates unclear boundaries. Doesn't force refactoring that would actually improve service design.

---

## Option B: Services Accept Minimal Explicit Parameters Only

**Pattern:**
```typescript
export async function doSomething(
  input,
  verifiedActorId: string,
  verifiedWorkspaceId: string,
  hasCreateCapability: boolean,
  hasInternalAccess: boolean = false
) {
  // Service receives ONLY the facts needed for decisions
}
```

**Evaluation:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Security Impact | ✓ EXCELLENT | Explicit parameters eliminate accidental field access |
| Tenant Isolation | ✓ EXCELLENT | workspaceId is required parameter |
| Service Boundary Clarity | ✓ EXCELLENT | Crystal clear what service receives |
| Migration Complexity | ✗ VERY HIGH | Must update every service signature |
| Compatibility with Current Routes | ✗ LOW | Routes must extract each parameter |
| Compatibility with BG/System Actors | ✓ GOOD | System can pass empty actorId if needed |
| Compatibility with Tests | ✓ EXCELLENT | Tests explicitly construct parameters |
| Risk of Fake Auth | ✓ NONE | No context object to misuse |
| Risk of Policy Fabrication | ✓ NONE | No policy object to access |
| Expected Scanner Reduction | ~ 60-80 | Removes auth-guard, parameter-based |
| Implementation Risk | ✗ VERY HIGH | 27+ services need signature changes, all callers need updates |

**Verdict: ⚠️ PROMISING BUT HIGH RISK**  
Reason: Most secure and clear, but implementation complexity very high. Requires updating all 27 services and all their callers simultaneously. Risk of mass refactor failure.

---

## Option C: Split Service Contracts

**Pattern:**
```typescript
// Pure business services: parameter-based
export async function getEngagements(
  workspaceId: string,
  hasInternalAccess: boolean
) { ... }

// Enforcement-aware services: accept CanonicalAuthContext
export async function createEngagement(
  input,
  authContext: CanonicalAuthContext,
  workspaceId: string
) {
  // Can read fields but doesn't call auth functions
}

// Policy-aware services: explicitly accept policy
export async function evaluatePolicy(
  policy: PolicyContext,
  workspace Id: string
) { ... }
```

**Evaluation:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Security Impact | ✓ GOOD | Rules are clear for each category |
| Tenant Isolation | ✓ GOOD | Depends on implementation per service |
| Service Boundary Clarity | ✓ GOOD | Category-based clarity |
| Migration Complexity | ✓ MEDIUM | Services can be grouped by type |
| Compatibility with Current Routes | ✓ MEDIUM | Some services already fit categories |
| Compatibility with BG/System Actors | ✓ GOOD | Different services have different needs |
| Compatibility with Tests | ✓ GOOD | Can construct appropriate inputs per service |
| Risk of Fake Auth | ⚠️ MEDIUM | Context-accepting services need discipline |
| Risk of Policy Fabrication | ⚠️ MEDIUM | Policy-aware services need guardrails |
| Expected Scanner Reduction | ~ 60-80 | Removes auth-guard imports |
| Implementation Risk | ✓ MEDIUM | Phased refactoring possible |

**Verdict: ⚠️ VIABLE BUT REQUIRES DISCIPLINE**  
Reason: Good middle ground. Allows phased refactoring by service type. Clear separation. Risk: requires strong discipline to prevent context misuse in "enforcement-aware" category.

---

## Option D: Create ServiceAuthEnvelope

**Pattern:**
```typescript
interface ServiceAuthEnvelope {
  readonly verifiedActorId: string;
  readonly verifiedWorkspaceId: string;
  readonly verifiedCapabilities: ReadonlySet<string>;
  readonly hasInternalAccess: boolean;
  // Optional for complex cases
  readonly originalContext?: CanonicalAuthContext;
}

export async function doSomething(input, auth: ServiceAuthEnvelope) {
  // Service uses envelope, strongly typed
}
```

**Evaluation:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Security Impact | ✓ EXCELLENT | Explicit, readonly fields, type-safe |
| Tenant Isolation | ✓ EXCELLENT | verifiedWorkspaceId mandatory |
| Service Boundary Clarity | ✓ EXCELLENT | Type explicitly states what service needs |
| Migration Complexity | ✓ MEDIUM | Create envelope type, services use it |
| Compatibility with Current Routes | ⚠️ MEDIUM | Routes need to construct envelope |
| Compatibility with BG/System Actors | ✓ GOOD | Can construct envelope with minimal fields |
| Compatibility with Tests | ✓ GOOD | Clear fixture construction |
| Risk of Fake Auth | ✓ NONE | Readonly object prevents changes |
| Risk of Policy Fabrication | ✓ NONE | Policy not in envelope |
| Expected Scanner Reduction | ~ 60-80 | Removes auth-guard imports |
| Implementation Risk | ✓ LOW-MEDIUM | Single type change, services use it |

**Verdict: ✓ STRONG ALTERNATIVE**  
Reason: Best of both worlds - explicit parameters in a type-safe object. Allows phased refactoring. Clear boundary. Minimal implementation risk.

---

## Option E: Allow Services to Canonicalize Internally (WITH CONDITIONS)

**Pattern:**
```typescript
export async function doSomething(input, authContext: AuthContext, workspaceId: string) {
  const canonical = canonicalizeAuthContext(authContext, workspaceId); // ← Service does this
  // Use canonical for decisions
}
```

**Evaluation:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Security Impact | ✗ VERY BAD | Services upgrade weak auth - violation of principle |
| Tenant Isolation | ⚠️ RISKY | Service does verification, opportunity for error |
| Service Boundary Clarity | ✗ POOR | Blurs route/service responsibility |
| Migration Complexity | ✓ LOW | Just call canonicalize in service |
| Compatibility with Current Routes | ✓ HIGH | Works with legacy route patterns |
| Compatibility with BG/System Actors | ✗ POOR | System must pass AuthContext |
| Compatibility with Tests | ✗ POOR | Tests construct raw AuthContext |
| Risk of Fake Auth | ✗ EXTREME | Service could fabricate canonical context |
| Risk of Policy Fabrication | ✗ EXTREME | Service could fake policy data |
| Expected Scanner Reduction | ✗ ZERO | No refactoring, auth-guard still imported |
| Implementation Risk | ✓ LOW | No changes needed |

**Verdict: ✗✗ ABSOLUTELY REJECTED**  
Reason: **FUNDAMENTAL VIOLATION OF SECURITY PRINCIPLE.** Services must NOT upgrade weak auth into canonical. This pattern INCREASES risk. Never acceptable.

---

## RECOMMENDED DESIGN: Option D (ServiceAuthEnvelope)

### Why Option D is Selected

**Strengths:**
1. **Type Safety:** ServiceAuthEnvelope is explicit type, not loose object
2. **Readonly:** Fields are readonly, prevents accidental mutation
3. **Clear Contract:** Service signature clearly states what auth data is expected
4. **Phased Migration:** Routes and services can be refactored in phases
5. **Minimal Risk:** ServiceAuthEnvelope is single new type, services use it
6. **Flexible:** Can include optional originalContext for complex cases
7. **Testable:** Easy to construct in tests with clear semantics
8. **Auditable:** Clear which services access which auth fields

### Why Others Are Rejected

- **Option A (All Services Accept CanonicalAuthContext):** Too permissive, services could misuse optional fields
- **Option B (Minimal Parameters):** Extremely high implementation risk (27+ services), too disruptive
- **Option C (Split Contracts):** Requires discipline, categories unclear, too many categories
- **Option E (Service Canonicalization):** REJECTED - violates security principle

---

## ServiceAuthEnvelope Design Specification

```typescript
export interface ServiceAuthEnvelope {
  // Mandatory: Core identity and scope
  readonly verifiedActorId: string;
  readonly verifiedActorType: "user" | "service";
  readonly verifiedWorkspaceId: string;

  // Mandatory: Verified decisions
  readonly verifiedCapabilities: ReadonlySet<string>;
  readonly hasInternalAccess: boolean;

  // Optional: For complex multi-decision cases
  readonly verifiedActor?: Readonly<{
    id: string;
    email?: string;
    name?: string;
  }>;

  // Optional: For services that need policy semantics
  // Only included if service explicitly handles policy
  readonly policy?: Readonly<PolicyContext>;
}
```

**Constructor (on route/wrapper):**
```typescript
// Route creates envelope from verified context
const envelope: ServiceAuthEnvelope = {
  verifiedActorId: ctx.verifiedActorId,
  verifiedActorType: ctx.verifiedActorType,
  verifiedWorkspaceId: ctx.verifiedWorkspaceId,
  verifiedCapabilities: ctx.verifiedCapabilities,
  hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
  verifiedActor: ctx.verifiedActor,
  // Omit policy unless service needs it
};

// Service call
const result = await findingService.createFinding(input, envelope);
```

**Service Usage:**
```typescript
export async function createFinding(
  input: CreateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<Finding> {
  // Service uses envelope, type-safe, readonly
  if (auth.hasInternalAccess) {
    // Visibility filtering
  }
  
  // Never do this:
  // auth.verifiedActorId = "fake";  // ❌ Error: readonly
  // auth.verifiedCapabilities.add("FAKE");  // ❌ Error: readonly Set
}
```

---

## Migration Path with ServiceAuthEnvelope

**Phase 1 (X9C-3):** Design + Pilot Selection
- Create ServiceAuthEnvelope type
- Design test fixtures
- Select 1-2 pilot services
- Plan refactoring sequence

**Phase 2 (X9C-4 Pilot):** Pilot 1-2 Services
- Refactor selected services to use envelope
- Update callers (routes, tests)
- Validate against baseline
- Establish patterns

**Phase 3 (X9C-4+):** Rollout
- Refactor remaining services incrementally
- Update callers in phases
- No mass changes

---

**Decision: ✓ ServiceAuthEnvelope (Option D)**

**Status:** READY FOR PHASE D FINAL DECISION
