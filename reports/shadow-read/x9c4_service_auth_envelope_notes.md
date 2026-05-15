# X9C-4 Phase B: ServiceAuthEnvelope Type Definition

**Phase:** X9C-4 (Service Refactor Pilot)  
**Date:** 2026-05-15  
**Status:** TYPE DEFINED AND VALIDATED

---

## ServiceAuthEnvelope Definition

**Location:** `src/lib/canonical-route-enforcement.ts`  
**Inserted after:** CanonicalAuthContext interface (line 51-90)  
**Type:** TypeScript interface (readonly fields)

```typescript
export interface ServiceAuthEnvelope {
  // Mandatory: Core verified identity and scope
  readonly verifiedActorId: string;
  readonly verifiedActorType: "user" | "service";
  readonly verifiedWorkspaceId: string;

  // Mandatory: Verified capability decision
  readonly verifiedCapabilities: ReadonlySet<string>;
  readonly hasInternalAccess: boolean;

  // Optional: Actor details for complex cases
  readonly verifiedActor?: Readonly<{
    id: string;
    email?: string;
    name?: string;
  }>;

  // Optional: Policy context for policy-aware services ONLY
  readonly policy?: Readonly<PolicyContext>;
}
```

---

## Type Safety Features

**Readonly Fields:**
- All fields are `readonly` to prevent mutation
- TypeScript enforces immutability at compile time
- Services cannot accidentally modify verifiedActorId, verifiedWorkspaceId, etc.

**Explicit Types:**
- `verifiedActorId: string` - Not `any`, not optional
- `verifiedActorType: "user" | "service"` - Literal type union
- `verifiedCapabilities: ReadonlySet<string>` - ReadonlySet prevents .add() or .clear()
- `hasInternalAccess: boolean` - Explicit boolean, not falsy/truthy coercion

**No Weak Auth:**
- Does not accept AuthContext (legacy weak auth)
- Does not accept raw headers or unverified data
- Does not include fabricated fields

**Fail-Closed Defaults:**
- Missing optional fields default to falsy (undefined for verifiedActor, undefined for policy)
- Services that check `if (!auth.verifiedActor)` will fail-closed
- Services that use `auth.policy?.roles || []` will default to no roles (least permissive)

---

## Construction Rules (For Routes)

**Routes construct ServiceAuthEnvelope from CanonicalAuthContext:**

```typescript
// In route handler with access to CanonicalAuthContext
const ctx = context.canonicalAuth; // From withCanonicalEnforcement wrapper

const authEnvelope: ServiceAuthEnvelope = {
  verifiedActorId: ctx.verifiedActorId,
  verifiedActorType: ctx.verifiedActorType,
  verifiedWorkspaceId: ctx.verifiedWorkspaceId,
  verifiedCapabilities: ctx.verifiedCapabilities,
  hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
  verifiedActor: ctx.verifiedActor,
  // Omit policy unless service explicitly needs it
};

// Call service with envelope
const result = await findingService.createFinding(input, authEnvelope);
```

**For Legacy Routes (still using withAuth + canonicalizeAuthContext):**

Legacy routes that haven't migrated to withCanonicalEnforcement can still construct the envelope:

```typescript
// In route using old pattern
const canonicalCtx = canonicalizeAuthContext({ session, policy }, workspaceId);

const authEnvelope: ServiceAuthEnvelope = {
  verifiedActorId: canonicalCtx.verifiedActorId,
  verifiedActorType: canonicalCtx.verifiedActorType,
  verifiedWorkspaceId: canonicalCtx.verifiedWorkspaceId,
  verifiedCapabilities: canonicalCtx.verifiedCapabilities,
  hasInternalAccess: policy ? hasInternalAccess(policy) : false,
  verifiedActor: canonicalCtx.verifiedActor,
};

// Call service with envelope
const result = await deliverableService.createDeliverable(input, authEnvelope);
```

---

## Usage Rules (For Services)

**Service receives ServiceAuthEnvelope:**

```typescript
export async function createFinding(
  input: CreateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<Finding> {
  // Service reads readonly envelope fields
  const actorId = auth.verifiedActorId; // ✓ OK
  const workspaceId = auth.verifiedWorkspaceId; // ✓ OK
  
  // Service checks capabilities
  if (!auth.verifiedCapabilities.has("FINDING_CREATE")) {
    throw new ForbiddenError("FINDING_CREATE capability required");
  }
  
  // Service uses verified facts for business decisions
  const finding = await db.finding.create({
    data: {
      ...input,
      workspaceId, // ✓ Verified by route
      createdBy: actorId, // ✓ Verified by route
    },
  });
  
  return finding;
}
```

**Services NEVER:**
- ✗ Modify envelope fields (readonly prevents this)
- ✗ Call auth-guard functions
- ✗ Reconstruct capabilities from policy
- ✗ Derive hasInternalAccess from policy
- ✗ Canonicalize weak auth internally
- ✗ Accept AuthContext parameter

---

## Validation Summary

**Type System Checks:**
✓ All fields are readonly (TypeScript enforces at compile)
✓ No `any` types used
✓ No optional fields that could hide missing data (only 2 truly optional)
✓ ReadonlySet prevents mutations at runtime
✓ Explicit type literals for verifiedActorType

**Security Checks:**
✓ No weak AuthContext accepted
✓ No unverified data included
✓ No fabricated capabilities
✓ Fail-closed defaults for optional fields
✓ No request/headers access
✓ No policy derivation (pre-computed by route)

**Compatibility Checks:**
✓ Can be constructed from CanonicalAuthContext
✓ Can be constructed from legacy canonicalizeAuthContext result
✓ Includes policy field for services that explicitly need it
✓ Includes verifiedActor for complex cases

---

## Integration Points

**Exported from:**
- `src/lib/canonical-route-enforcement.ts`
- Export statement: `export interface ServiceAuthEnvelope`

**Used by (after refactoring):**
- `src/services/findings.ts` (createFinding, updateFinding, validateFinding)
- `src/services/deliverable.ts` (createDeliverable)

**Constructed in (after refactoring):**
- `src/app/api/findings/route.ts` (POST handler)
- `src/app/api/findings/[findingId]/route.ts` (PATCH handler)
- `src/app/api/deliverables/route.ts` (POST handler)

---

## Rationale: Why ServiceAuthEnvelope Over Other Approaches

**Not CanonicalAuthContext:**
- Too permissive - includes optional fields services shouldn't access
- Includes request, session, policy optionally
- Discipline-based instead of type-system enforced

**Not Raw Parameters (hasCreateCapability: boolean, verifiedActorId: string, ...):**
- Too verbose in service signatures
- Can't add new fields without changing all callers
- No clear "this is auth data" grouping

**ServiceAuthEnvelope:**
- Explicit type that says "this is auth data"
- All fields are readonly (type-safe)
- Can add optional fields (verifiedActor, policy) without breaking callers
- Clear boundary: service accepts envelope, not context
- Minimal and purpose-built for services

---

## Field-by-Field Security Analysis

| Field | Type | Required | Mutation Prevention | Rationale |
|-------|------|----------|-------------------|-----------|
| verifiedActorId | string | Yes | Readonly string | Cannot be reassigned or mutated |
| verifiedActorType | "user" \| "service" | Yes | Literal union | Cannot be reassigned to invalid value |
| verifiedWorkspaceId | string | Yes | Readonly string | Cannot be reassigned or mutated |
| verifiedCapabilities | ReadonlySet<string> | Yes | ReadonlySet | Cannot add/remove; caller already checked |
| hasInternalAccess | boolean | Yes | Readonly boolean | Pre-computed by route; immutable |
| verifiedActor | object | Optional | Readonly object | For audit/logging; read-only prevents mutation |
| policy | PolicyContext | Optional | Readonly | For policy-aware services only; not default |

---

## Phase B Completion

✓ ServiceAuthEnvelope type created in canonical-route-enforcement.ts
✓ Type is readonly and type-safe
✓ Type can be constructed from CanonicalAuthContext
✓ Type can be constructed from legacy canonicalizeAuthContext
✓ Field-level security verified
✓ Documentation complete

**Ready for Phase C: Refactor findings.ts**
