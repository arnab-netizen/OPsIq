# Authentication & Authorization Patterns

This document defines the standard auth patterns for OpsIQ. All new code should follow these patterns.

## Core Principles

1. **Fail-Closed:** When in doubt, deny access. Never default to allowing access.
2. **Server-Derived:** Auth context derived from server cookies, not client headers.
3. **Capabilities-Based:** Use RBAC (role → capability mapping), not hard-coded checks.
4. **Consistent:** Single pattern used across all routes.
5. **Testable:** Primitives are unit-testable, behavior is integration-testable.

---

## Auth Primitives (Recommended)

### 1. Simple Authentication

**When:** Route needs any authenticated user.

```typescript
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  // auth.session.user.id available
  // auth.policy has roles and capabilities
}
```

**Behavior:**
- Throws `UnauthorizedError` if session invalid/missing
- Returns `{ session, policy }`
- Fail-closed: no session → error

---

### 2. Capability-Based Access

**When:** Route needs specific capability (recommended over hard-coded checks).

```typescript
import { requireAuthForCapability } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export async function POST(request: NextRequest) {
  const auth = await requireAuthForCapability(CAPABILITIES.ENGAGEMENT_CREATE);
  // User confirmed to have ENGAGEMENT_CREATE capability
}
```

**Behavior:**
- Throws `UnauthorizedError` if no session
- Throws `ForbiddenError` if capability missing
- Supports scoped capabilities: `requireAuthForCapability(cap, { type: "engagement", id })`

---

### 3. Internal-Only Access

**When:** Route restricted to internal staff (not clients).

```typescript
import { requireAuthInternal } from "@/lib/auth-guard";

export async function GET(request: NextRequest) {
  const auth = await requireAuthInternal();
  // User confirmed to have at least one internal role
}
```

**Behavior:**
- Throws `UnauthorizedError` if no session
- Throws `ForbiddenError` if user is client-only

---

### 4. Optional Authentication

**When:** Route supports both authenticated and anonymous users.

```typescript
import { getServerAuthContext } from "@/lib/auth-guard";

export async function GET(request: NextRequest) {
  const auth = await getServerAuthContext();
  
  if (auth) {
    // Authenticated: show workspace-specific data
    return NextResponse.json({ data: auth.policy.userId });
  } else {
    // Anonymous: show public data
    return NextResponse.json({ data: "public" });
  }
}
```

**Behavior:**
- Returns `null` if session/policy invalid (no error)
- Useful for endpoints that gracefully downgrade

---

### 5. Workspace Scoping (In-Progress)

**Temporary Pattern (Until Multi-Tenancy Implemented):**

```typescript
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";

export async function GET(request: NextRequest) {
  const workspaceIdParam = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceIdParam) {
    return NextResponse.json({ error: "Workspace ID required" }, { status: 400 });
  }

  const membership = await enforceWorkspaceScoping(request, workspaceIdParam);
  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // membership contains { userId, role }
  // Use workspaceIdParam for all Prisma queries
}
```

**Future Pattern (After Multi-Tenancy):**

```typescript
// NOT YET IMPLEMENTED
const auth = await requireAuth();
const workspaceId = auth.session.workspaceId; // from session, not headers/params
```

---

## Legacy Pattern (Deprecating)

### `withAuth()` - Higher-Order Wrapper

**Status:** Supported for backward compatibility, prefer primitives above.

```typescript
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export async function POST(request: NextRequest) {
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
    internalOnly: false,
  });
}
```

**Options:**
- `capability?: CapabilityName` - Required capability
- `scope?: { type: string; id: string }` - Scoped capability
- `internalOnly?: boolean` - Client roles forbidden

---

## Role → Capability Mapping

**Location:** `/src/policies/capability-check.ts`

**File:** ROLE_CAPABILITIES map defines:
- System roles: SYSTEM_ADMIN, ADMIN_OR_PORTFOLIO_MANAGER, etc.
- Consultant roles: EXPERIENCED_CONSULTANT, BEGINNER_CONSULTANT, ANALYST
- Client roles: CLIENT_OWNER, CLIENT_TEAM_MEMBER, VIEWER

**Usage:**

```typescript
import { hasCapability, getCapabilitiesForRole } from "@/policies/capability-check";
import { ROLES } from "@/domain/constants/roles";

// Check if context has capability
const canCreate = hasCapability(policy, CAPABILITIES.ENGAGEMENT_CREATE);

// Get all capabilities for a role
const caps = getCapabilitiesForRole(ROLES.EXPERIENCED_CONSULTANT);
```

**Internal-Only Capabilities:**

Defined in `capability-check.ts` - client roles CANNOT access these even if listed:

- System: SYSTEM_ADMIN, SYSTEM_VIEW_AUDIT
- User management: USER_CREATE, USER_UPDATE, USER_ASSIGN_ROLE
- Governance: ENGAGEMENT_CREATE, ENGAGEMENT_UPDATE, RISK_MANAGE, SCOPE_MANAGE
- Others: FINDING_CREATE, OVERRIDE_DECIDE, EVIDENCE_VALIDATE, FILE_DELETE

---

## Workspace Isolation

### Current Implementation (Temporary)

**Workspace Context Derivation:**

```typescript
// In /src/services/workspace/context.ts
const workspaceId = session.user.id; // TEMPORARY: use userId
```

**⚠️ This is a placeholder** - not true multi-tenancy. All data scoped to user, not organization.

### Prisma Middleware Enforcement

**File:** `/src/lib/prisma-workspace-enforcement.ts`

**Protected Models (49 total):**
All workspace-owned data must include workspaceId in queries.

**Enforcement Levels:**
1. **Creates:** BLOCKS if workspaceId missing (line 136-150)
2. **Updates/Deletes:** BLOCKS if WHERE doesn't include workspaceId (line 98-133)
3. **Reads:** WARNS if unscoped (line 152-166) - still executes (fix in progress)

**Usage:**

```typescript
// ✅ CORRECT - includes workspaceId in WHERE
const decisions = await db.operatorItem.findMany({
  where: { workspaceId, status: "pending" },
});

// ❌ WRONG - missing workspaceId (will throw on create, warn on read)
const decisions = await db.operatorItem.findMany({
  where: { status: "pending" }, // missing workspaceId!
});
```

### Service Layer Pattern

**All service functions dealing with workspace data must require workspaceId:**

```typescript
// ✅ CORRECT
export async function getControlSurface(workspaceId: string) {
  enforceWorkspaceId(workspaceId, "getControlSurface", "OperatorItem");
  // ...
}

// ❌ WRONG - missing workspaceId parameter
export async function getControlSurface(engagementId: string) {
  // Cannot properly scope data
}
```

---

## Fail-Closed Behavior

### Session Validation

```typescript
// Session stored in Prisma, validated on every request
const session = await getSession();
// Checks:
// - Token exists in session table
// - Session not revoked
// - Session not expired
// - User is active
// Returns null if ANY check fails (fail-closed)
```

### Policy Context Loading

```typescript
// Loads roles + engagement memberships
const policy = await getPolicyContext();
// Returns null if:
// - No session
// - User has no roles
// - Database error
```

### Capability Checks

```typescript
// requireCapability() throws ForbiddenError if missing
requireCapability(policy, CAPABILITIES.ENGAGEMENT_CREATE);
// Checks:
// - User has role with capability
// - If scoped: user has role in specified scope
// - If client role: capability not in internal-only list
```

---

## Testing Auth

### Unit Tests

**Location:** `/src/lib/auth-guard.test.ts`

```typescript
import { requireAuth, requireAuthForCapability } from "@/lib/auth-guard";

describe("Auth Primitives", () => {
  it("throws UnauthorizedError when session missing", async () => {
    vi.mocked(authService.requireSession).mockRejectedValueOnce(
      new UnauthorizedError("No session")
    );
    await expect(requireAuth()).rejects.toThrow(UnauthorizedError);
  });

  it("throws ForbiddenError when capability missing", async () => {
    vi.mocked(authService.requireSession).mockResolvedValueOnce(session);
    vi.mocked(authService.requirePolicyContext).mockResolvedValueOnce(policy);
    await expect(
      requireAuthForCapability(CAPABILITIES.ENGAGEMENT_CREATE)
    ).rejects.toThrow(ForbiddenError);
  });
});
```

### Integration Tests

**Location:** `/src/app/api/__tests__/rbac-enforcement.test.ts`

```typescript
// Test actual routes with mocked auth
const request = new NextRequest("http://localhost/api/engagements");
const response = await GET(request);

// Verify 403 when not authenticated
expect(response.status).toBe(403);
```

---

## Common Patterns

### Create a New Route (Best Practice)

```typescript
// 1. Import primitives
import { requireAuthForCapability } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";

export async function POST(request: NextRequest) {
  // 2. Authenticate + authorize
  const auth = await requireAuthForCapability(CAPABILITIES.ENGAGEMENT_CREATE);

  // 3. Get workspace context (temporary pattern)
  const workspaceIdParam = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceIdParam) {
    return NextResponse.json({ error: "Workspace ID required" }, { status: 400 });
  }
  const membership = await enforceWorkspaceScoping(request, workspaceIdParam);
  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // 4. Parse + validate input
  const body = await parseRequestBody(request, createEngagementSchema);

  // 5. Perform action with workspace context
  const engagement = await createEngagement(workspaceIdParam, body);

  // 6. Return result
  return NextResponse.json(engagement, { status: 201 });
}
```

### Add Role-Based Logic

**DON'T:** Hard-code role checks
```typescript
// ❌ BAD
if (policy.roles[0].role === ROLES.ADMIN) {
  // ...
}
```

**DO:** Use capability checks
```typescript
// ✅ GOOD
if (canDo(policy, CAPABILITIES.OVERRIDE_DECIDE)) {
  // ...
}
```

### Test Authentication

```typescript
import { withAuth } from "@/lib/auth-guard";

vi.mock("@/services/auth", () => ({
  requireSession: vi.fn(),
  requirePolicyContext: vi.fn(),
}));

it("requires auth", async () => {
  vi.mocked(authService.requireSession).mockRejectedValueOnce(
    new UnauthorizedError("No session")
  );
  await expect(withAuth()).rejects.toThrow(UnauthorizedError);
});
```

---

## Migration Path

### Phase 1: Implement Primitives (DONE)
- ✅ `requireAuth()` - simple auth
- ✅ `requireAuthForCapability()` - capability-based
- ✅ `requireAuthInternal()` - internal-only
- ✅ `getServerAuthContext()` - optional auth
- ✅ Tests for primitives

### Phase 2: Consolidate Routes
- Routes using `withAuth()` should migrate to primitives
- Audit 96 routes for consistency
- Add workspace param validation to all routes

### Phase 3: Implement Real Multi-Tenancy
- Add workspace_id to session table
- Derive workspace from session, not headers/params
- Remove temporary userId-as-workspace pattern
- Simplify workspace enforcement

### Phase 4: Harden Unscoped Read Detection
- Change Prisma middleware from warn to error for unscoped reads
- All routes must include workspaceId in read queries
- Add CI/CD check for unscoped query detection

---

## References

- **Auth Service:** `/src/services/auth.ts` - Session + policy context
- **Auth Guard:** `/src/lib/auth-guard.ts` - Primitives + legacy wrapper
- **Capability Check:** `/src/policies/capability-check.ts` - Role → capability mapping
- **Workspace Enforcement:** `/src/middleware/workspace-enforcement.ts` - Workspace scoping
- **Workspace Validation:** `/src/lib/workspace-validation.ts` - ID validation helpers
- **Audit Surface:** `/AUTH_SURFACE.md` - Comprehensive auth audit

---

## Q&A

**Q: Should I use headers or query params for workspace ID?**  
A: Neither is ideal. Use query params for now (more testable). After multi-tenancy implemented, use session.workspaceId.

**Q: Can I skip auth on a public endpoint?**  
A: Yes, but explicitly allow it:
- Document it in code comment
- Add to PUBLIC_ENDPOINTS list in audit trail
- Test that it doesn't leak data

**Q: What if I need to check multiple capabilities?**  
A: Use `canDo()` (non-throwing) in business logic, `requireCapability()` (throwing) for mandatory checks.

**Q: How do I scope a capability to an engagement?**  
A: Pass scope param: `requireAuthForCapability(cap, { type: "engagement", id: "eng-123" })`

---

**Last Updated:** 2026-05-01  
**Status:** Live - implements fail-closed auth primitives
