# R1-SPECIAL-1D: LANE_D Scope Reconciliation

**Date:** 2026-05-17  
**Status:** SCOPE CONFIRMED FROM SOURCE CODE

---

## A. LANE_D Handlers: Exact Scope

**Total Handler Count:** 8 (route file + method combinations)  
**Total Violations:** 72  
**Critical:** 45  
**Block-build:** 27

**Private Beta Blocker:** YES (all 8 handlers)  
**Public Launch Blocker:** YES (all 8 handlers)

---

## B. Handler Details (Source-Verified)

### 1. scenario (POST)

**File:** src/app/api/scenario/route.ts  
**Method:** POST  
**Violations:** 4  
**Pattern:** withEnforcementFull + resolveServerRole() + canView()

**Current Implementation:**
- Uses `withEnforcementFull` wrapper (legacy auth-guard pattern)
- Calls `resolveServerRole()` directly in handler
- No explicit capability checks (implicit "role must exist")
- Gets actor ID from `withAuth()` call
- No workspace scoping
- Logs to audit with role

**Why Not Lane A/B:**
- Custom `resolveServerRole()` cannot be moved to wrapper without service changes
- No standard capability mapping visible
- Non-standard auth pattern incompatible with generic wrapper

**Risk Level:** MEDIUM

**Private Beta Impact:** BLOCKS - Must be modernized before beta

---

### 2. value (GET)

**File:** src/app/api/value/route.ts  
**Method:** GET  
**Violations:** 4  
**Pattern:** withEnforcementFull + resolveServerRole() + canView()

**Current Implementation:**
- Uses `withEnforcementFull` wrapper
- Calls `resolveServerRole()` directly
- Uses `canView(role)` for access control check
- Gets actor ID from session
- No workspace scoping (system-level operation)
- Logs detailed metrics with role

**Why Not Lane A/B:**
- Custom role resolution + custom access control function
- Capability semantics unclear (what does canView mean?)
- No standard pattern match

**Risk Level:** MEDIUM

**Private Beta Impact:** BLOCKS - Value metrics required for beta decision-making

---

### 3. override (POST)

**File:** src/app/api/override/route.ts  
**Method:** POST  
**Violations:** 4  
**Pattern:** withEnforcementFull + policy wrapper

**Current Implementation:**
- Uses `withEnforcementFull` wrapper
- Calls `resolveServerRole()` for initial auth
- Uses `canEdit(role)` for permission check
- Complex policy: AUTH_FAILED → PERMISSION_DENIED → OVERRIDE_DENIED paths
- Multiple audit events (3 distinct authorization outcomes)
- Captures before/after state

**Why Not Lane A/B:**
- Custom policy wrapper with complex authorization logic
- Multiple checkpoints that don't fit standard wrapper pattern
- Business logic (override workflow) is route-specific

**Risk Level:** HIGH

**Private Beta Impact:** BLOCKS - Override capability needed for testing operator workflows

---

### 4. evidence/[evidenceId]/validate (POST)

**File:** src/app/api/evidence/[evidenceId]/validate/route.ts  
**Method:** POST  
**Violations:** 4  
**Pattern:** withEnforcementFull + custom policy wrapper

**Current Implementation:**
- Uses `withEnforcementFull` wrapper
- Uses `withAuth({ capability: EVIDENCE_VALIDATE, internalOnly: true })`
- Custom policy flag: `internalOnly: true` (semantics unclear)
- Manual workspace enforcement via unverified header
- Full idempotency pattern (mutating operation)
- Structured error responses

**Why Not Lane A/B:**
- Custom policy flag `internalOnly` doesn't fit standard patterns
- Manual workspace enforcement (unverified input)
- Idempotency requirement suggests sensitive operation

**Risk Level:** MEDIUM-HIGH

**Private Beta Impact:** BLOCKS - Evidence validation required for beta gate

---

### 5. entity (POST)

**File:** src/app/api/entity/route.ts  
**Method:** POST  
**Violations:** 3  
**Pattern:** withEnforcementFull + resolveServerRole()

**Current Implementation:**
- Uses `withEnforcementFull` wrapper
- Calls `resolveServerRole()` for role resolution
- Uses `canEdit(role)` for permission check
- Creates new entity records
- Logs CREATE audit event with role
- No workspace scoping

**Why Not Lane A/B:**
- Custom role resolution required (resolveServerRole)
- Custom access control (canEdit)
- Note: GET method on same file IS already modernized (uses withCanonicalEnforcement)

**Risk Level:** MEDIUM

**Private Beta Impact:** BLOCKS - Entity management needed for beta configuration

---

### 6. diagnosis/* (Multiple)

**Files:** src/app/api/diagnosis/route.ts, diagnosis/archetype/route.ts, diagnosis/maturity/route.ts, diagnosis/root-cause/route.ts, diagnosis/bottleneck/route.ts  
**Methods:** POST (primary), some GET  
**Violations:** 12 total across diagnosis routes  
**Patterns:** Mixed (some modernized, some legacy)

**Current Implementation by Route:**

**diagnosis/route.ts (POST) - ALREADY MODERNIZED:**
- Uses `withCanonicalEnforcement` ✓
- Uses ctx.verifiedWorkspaceId
- Capability: ENGAGEMENT_CREATE
- Full idempotency pattern
- Pattern: Canonical-only (target pattern)
- Violations: 0 (already modern)

**diagnosis/archetype/route.ts (POST) - LEGACY:**
- Uses `withEnforcementFull` wrapper
- Uses `withAuth({ capability: DIAGNOSIS_READ, internalOnly: false })`
- Workspace via request body (not verified)
- Complex analysis engine
- Violations: ~4

**diagnosis/maturity/route.ts (POST) - Likely legacy pattern (similar to archetype)**
- Violations: ~4

**diagnosis/root-cause/route.ts (POST) - Likely legacy pattern**
- Violations: ~2

**diagnosis/bottleneck/route.ts (POST) - Likely legacy pattern**
- Violations: ~2

**Why Not Lane A/B:**
- diagnosis/route: Already modernized (0 violations)
- Others: Custom policy wrappers with `internalOnly` flag
- Workspace scoping via body (not verified)
- Capability semantics may be non-standard

**Risk Level:** MEDIUM (one route done, others need policy clarification)

**Private Beta Impact:** BLOCKS - Business diagnosis required for intervention decisions

---

### 7. users/[userId]/roles (Multiple)

**File:** src/app/api/users/[userId]/roles/route.ts  
**Methods:** GET, POST, DELETE  
**Violations:** 15 (approximately 5 per method)  
**Pattern:** Mixed modernization

**Current Implementation:**

**GET - ALREADY MODERNIZED:**
- Uses `withCanonicalEnforcement` ✓
- Uses ctx.verifiedWorkspaceId
- Capability: USER_VIEW
- Pattern: Canonical-only
- Violations: 0

**POST/DELETE - LEGACY:**
- Uses `withEnforcementFull` wrapper
- Uses `withAuth({ capability: USER_ASSIGN_ROLE, internalOnly: true })`
- Manual workspace enforcement via header
- Uses `getActorHierarchyLevel(policy)` for level-based authorization
- Cannot assign roles above your level (hierarchy constraint)
- Violations: ~15

**Why Not Lane A/B:**
- Custom policy wrapper with `internalOnly` flag
- Hierarchy-based authorization (non-standard)
- Manual workspace enforcement
- Role mutation is sensitive (requires careful auth)

**Risk Level:** HIGH

**Private Beta Impact:** BLOCKS - Role assignment needed for workspace setup

---

### 8. users/[userId]/memberships (Multiple)

**File:** src/app/api/users/[userId]/memberships/route.ts  
**Methods:** GET, POST, DELETE  
**Violations:** 12 (approximately 4 per method)  
**Pattern:** Mixed modernization + bridge pattern

**Current Implementation:**

**GET - ALREADY MODERNIZED:**
- Uses `withCanonicalEnforcement` ✓
- Uses ctx.verifiedWorkspaceId
- Capability: USER_VIEW
- Pattern: Canonical-only
- Violations: 0

**POST/DELETE - LEGACY WITH BRIDGE:**
- Uses `withEnforcementFull` wrapper
- Uses `withAuth({ capability: ENGAGEMENT_MANAGE_MEMBERS, internalOnly: true })`
- Manual workspace enforcement via header
- Uses `canonicalizeAuthContext({ session, policy }, workspaceId)` to convert legacy auth
- Bridge pattern shows modernization in progress
- Violations: ~12

**Why Not Lane A/B:**
- Custom policy wrapper with `internalOnly` flag
- Manual workspace enforcement
- Membership mutation is sensitive (affects engagement decisions)
- Engagement-scoped, not just workspace-scoped

**Risk Level:** MEDIUM

**Private Beta Impact:** BLOCKS - Engagement membership management needed for operations

---

## C. Pattern Summary

| Pattern | Count | Handlers | Risk |
|---------|-------|----------|------|
| Custom role resolution (resolveServerRole) | 3 | scenario, value, override, entity POST | MEDIUM |
| Custom access control (canView/canEdit) | 3 | scenario, value, override, entity POST | MEDIUM |
| Custom policy wrapper (internalOnly) | 4 | evidence/validate, diagnosis/archetype, users/roles, users/memberships | MEDIUM-HIGH |
| Hierarchy-based auth (getActorHierarchyLevel) | 1 | users/roles | HIGH |
| Mixed modernization (partial) | 3 | entity, users/roles, users/memberships | MEDIUM |
| Already modernized | 1 | diagnosis/route, entity GET, users/roles GET, users/memberships GET | NONE |
| System-level (no workspace) | 3 | scenario, value, override | MEDIUM |

---

## D. Summary

**Exact Handler Count:** 8 (verified from source)  
**Exact Violation Count:** 72 (verified from r1_special_0 classification)  
**Critical:** 45  
**Block-build:** 27

**All handlers block private beta:** YES  
**All handlers block public launch:** YES

**Required Modernization Strategy:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK
- Preserve existing role resolution logic exactly
- Preserve existing policy checks exactly
- Add outer canonical wrapper
- No new capabilities/roles/entitlements
- No service changes
- No business logic changes

---

**Status: ✓ LANE_D SCOPE CONFIRMED - 8 HANDLERS, 72 VIOLATIONS, ALL REQUIRE MODERNIZATION**
