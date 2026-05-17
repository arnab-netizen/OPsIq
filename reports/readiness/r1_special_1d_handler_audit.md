# R1-SPECIAL-1-D: LANE_D Handler Policy/Role Audit

**Date:** 2026-05-17  
**Phase:** R1-SPECIAL-1-D Handler Analysis (Audit Only - No Code Changes)  
**Status:** AUDIT PHASE - ANALYZING PATTERNS

---

## Handler-by-Handler Audit

### 1. scenario (POST)

**File:** src/app/api/scenario/route.ts  
**State:** Legacy (withEnforcementFull)  
**Violations:** 1 handler with ~9 violations

**Pattern Analysis:**
```
POST handler:
- Wrapper: withEnforcementFull (legacy auth-guard pattern)
- Role resolution: await resolveServerRole() - custom function call
- Access control: Implicit (role must exist, no explicit canView/canEdit)
- Actor identity: session?.user.id via withAuth()
- Workspace: None (no workspace isolation)
- Audit: Logs role and actorId to ANALYZE event
```

**Design Constraints:**
- `resolveServerRole()` is a custom function that must be understood to modernize
- No explicit capability mapping visible (just "role must exist")
- No workspace scoping - operates at system level
- Scenario analysis affects decisions (implicit high-priority operation)
- Audit event includes role, which may be business-critical

**Modernization Approach Options:**
1. **CANONICAL_ONLY**: Require capability (e.g., SCENARIO_RUN) via withCanonicalEnforcement
2. **CUSTOM_ROLE_GUARD**: Keep resolveServerRole but wrap it in canonical context
3. **DEFER**: Mark as requiring design audit (if role semantics unclear)
4. **BLOCKED**: If resolveServerRole cannot be modernized without service changes

**Risk Level:** MEDIUM (implicit capability, no workspace scoping)

---

### 2. value (GET)

**File:** src/app/api/value/route.ts  
**State:** Legacy (withEnforcementFull)  
**Violations:** 1 handler with ~9 violations

**Pattern Analysis:**
```
GET handler:
- Wrapper: withEnforcementFull
- Role resolution: await resolveServerRole()
- Access control: canView(role) - custom access control function
- Actor identity: session?.user.id
- Workspace: None
- Audit: Logs role and detailed metrics
```

**Design Constraints:**
- `canView(role)` is an explicit custom access control function
- Must understand what roles allow value viewing
- Metrics are system-level (no workspace scoping)
- Returns computed ROI and loss metrics (business-critical read)

**Modernization Approach Options:**
1. **CANONICAL_ONLY**: Define VALUE_VIEW capability and map canView(role) to it
2. **CUSTOM_ACCESS_WRAPPER**: Keep canView but express result in verifiedCapabilities
3. **DEFER**: If canView role mapping is complex
4. **BLOCKED**: If requires role-specific logic not expressible in capabilities

**Risk Level:** MEDIUM (explicit access function with role-specific logic)

---

### 3. override (POST)

**File:** src/app/api/override/route.ts  
**State:** Legacy (withEnforcementFull)  
**Violations:** 1 handler with ~9 violations

**Pattern Analysis:**
```
POST handler:
- Wrapper: withEnforcementFull
- Role resolution: await resolveServerRole()
- Access control: canEdit(role) - custom edit permission function
- Policy complexity: HIGH
  - Multiple permission checks (AUTH_FAILED, PERMISSION_DENIED, OVERRIDE_DENIED)
  - Multiple audit events (3 distinct authorization outcomes)
  - Override approval workflow
- Actor identity: session?.user.id
- Workspace: None
- State mutation: Yes (applies override, modifies items)
```

**Design Constraints:**
- Complex policy logic with 3 permission states
- Policy wrapper enforces multiple checks before mutation
- Audit trail captures all authorization decisions
- Override workflow requires before/after state capture
- Cannot silently fail - must log denial reasons

**Modernization Approach Options:**
1. **CAPABILITY_WITH_AUDIT**: OVERRIDE_APPROVE capability + audit wrapper
2. **POLICY_WRAPPER_PATTERN**: Keep canEdit as policy wrapper inside withCanonicalEnforcement
3. **STATE_MACHINE**: Use service-level state machine (defer to LANE_E)
4. **BLOCKED**: If workflow complexity requires custom auth logic

**Risk Level:** HIGH (complex authorization policy, state mutation, audit requirements)

---

### 4. evidence/[evidenceId]/validate (POST)

**File:** src/app/api/evidence/[evidenceId]/validate/route.ts  
**State:** Legacy (withEnforcementFull)  
**Violations:** 1 handler with ~9 violations

**Pattern Analysis:**
```
POST handler:
- Wrapper: withEnforcementFull
- Auth pattern: withAuth({ capability: EVIDENCE_VALIDATE, internalOnly: true })
- Workspace: Manual enforcement via header (x-workspace-id)
- Workspace enforcement: enforceWorkspaceScoping(request, workspaceId)
- Idempotency: Full idempotency pattern (key-based cache)
- Actor identity: session.user.id
- Input validation: Schema-based (validateEvidenceSchema)
- Error handling: Centralized errorToResponse
```

**Design Constraints:**
- Custom policy flag: `internalOnly: true` - semantic meaning unclear
- Manual workspace enforcement (unverified header)
- Idempotency requirement (mutating operation)
- Complex error handling with structured error responses
- Evidence validation is business-critical (blocks private beta per LANE_D blocker)

**Modernization Approach Options:**
1. **CANONICAL_WITH_INTERNAL_FLAG**: withCanonicalEnforcement with requireCapabilities, migrate internal check to capability
2. **CANONICAL_WORKSPACE**: Migrate manual workspace header to ctx.verifiedWorkspaceId
3. **HYBRID**: Keep internalOnly check but move to canonical wrapper
4. **CUSTOM_VALIDATOR**: Keep withAuth pattern if semantic meaning of "internal-only" cannot be expressed

**Risk Level:** MEDIUM-HIGH (manual workspace enforcement, custom policy flag, business-critical operation)

---

### 5. entity (GET/POST)

**File:** src/app/api/entity/route.ts  
**State:** MIXED - GET modernized, POST legacy  
**Violations:** 2 handlers (~18 violations)

**Pattern Analysis:**
```
GET handler (MODERNIZED):
- Wrapper: withCanonicalEnforcement ✓
- Context: ctx.verifiedWorkspaceId
- Workspace: Enforced by wrapper
- Pattern: Canonical-only (simple read)

POST handler (LEGACY):
- Wrapper: withEnforcementFull
- Role resolution: await resolveServerRole()
- Access control: canEdit(role)
- Workspace: None
- State mutation: Yes (creates entity)
- Audit: Logs CREATE event with role
```

**Design Constraints:**
- Handler has mixed modernization state
- GET is canonical-only (good pattern to follow)
- POST needs role-based edit permission
- Entity creation is workspace-agnostic (system-level entities?)
- Audit trail captures role at mutation time

**Modernization Approach Options:**
1. **COMPLETE_MODERNIZATION**: Convert POST to withCanonicalEnforcement + ENTITY_CREATE capability (follow GET pattern)
2. **PARTIAL_WITH_ROLE_GUARD**: Keep role resolution but wrap in canonical context
3. **ANALYZE_WORKSPACE_NEED**: Determine if entities should be workspace-scoped (affects schema)
4. **DEFER_ROLE_MAPPING**: If canEdit role mapping is complex

**Risk Level:** MEDIUM (role-based edit access, workspace scoping unclear)

---

### 6. diagnosis/route (POST)

**File:** src/app/api/diagnosis/route.ts  
**State:** MODERNIZED (withCanonicalEnforcement)  
**Violations:** 0 (handler already migrated)

**Pattern Analysis:**
```
POST handler (MODERNIZED):
- Wrapper: withCanonicalEnforcement ✓
- Context: ctx.verifiedWorkspaceId, ctx.request
- Capabilities: [CAPABILITIES.ENGAGEMENT_CREATE]
- Workspace: Enforced by wrapper
- Idempotency: Full pattern with authContext
- Pattern: Canonical-only (good example)
```

**Note:** This handler is already modernized and shows the target pattern.

**Risk Level:** NONE (already canonical)

---

### 7. diagnosis/archetype (POST)

**File:** src/app/api/diagnosis/archetype/route.ts  
**State:** Legacy (withEnforcementFull)  
**Violations:** 1 handler with ~9 violations

**Pattern Analysis:**
```
POST handler:
- Wrapper: withEnforcementFull
- Auth pattern: withAuth({ capability: DIAGNOSIS_READ, internalOnly: false })
- Workspace: None (workspaceId passed in body)
- Engagement: engagementId passed in body
- Idempotency: Full idempotency pattern
- Actor identity: authContext.session.user.id
- Error handling: Try/catch with structured logging
```

**Design Constraints:**
- Custom policy flag: `internalOnly: false`
- Workspace scoping via request body (not verified)
- Capability is DIAGNOSIS_READ (read-level) but operation is analysis (write-equivalent)
- Archetype analysis is complex business logic
- Engagement ID supplied by client (not verified against workspace)

**Modernization Approach Options:**
1. **CANONICAL_WITH_VERIFIED_ENGAGEMENT**: Use withCanonicalEnforcement + verify engagement belongs to workspace
2. **CUSTOM_POLICY_WRAPPER**: Keep internalOnly flag handling in auth pattern
3. **DEFER**: If archetype analysis has complex permission model
4. **BLOCKED**: If workspace scoping cannot be enforced

**Risk Level:** HIGH (unverified workspace/engagement scoping, capability semantics unclear)

---

### 8. users/[userId]/roles (GET/POST/DELETE)

**File:** src/app/api/users/[userId]/roles/route.ts  
**State:** MIXED - GET modernized, POST/DELETE legacy  
**Violations:** 3 handlers (~27 violations)

**Pattern Analysis:**
```
GET handler (MODERNIZED):
- Wrapper: withCanonicalEnforcement ✓
- Context: ctx.verifiedWorkspaceId
- Capabilities: ['USER_VIEW']
- Pattern: Canonical-only

POST handler (LEGACY):
- Wrapper: withEnforcementFull
- Auth pattern: withAuth({ capability: USER_ASSIGN_ROLE, internalOnly: true })
- Workspace: Manual header enforcement
- Hierarchy: getActorHierarchyLevel(policy) - level-based authorization
- Idempotency: Full pattern
- Actor identity: session.user.id

DELETE handler (LEGACY):
- Wrapper: withEnforcementFull
- Auth pattern: withAuth({ capability: USER_ASSIGN_ROLE, internalOnly: true })
- Workspace: Manual header enforcement
- Hierarchy: getActorHierarchyLevel(policy)
- Pattern: Same as POST
```

**Design Constraints:**
- Hierarchy-based authorization: `getActorHierarchyLevel(policy)` determines what roles can be assigned
- Custom policy flag: `internalOnly: true`
- Manual workspace enforcement (unverified header)
- Role assignment is workspace-scoped
- Cannot assign roles above your hierarchy level (implicit rule)
- POST/DELETE are sensitive operations (role changes)

**Modernization Approach Options:**
1. **HIERARCHY_WITH_CANONICAL**: Express hierarchy levels in verifiedCapabilities (e.g., ROLE_ASSIGN_PEER, ROLE_ASSIGN_JUNIOR)
2. **CUSTOM_HIERARCHY_GUARD**: Keep getActorHierarchyLevel but wrap in canonical context
3. **POLICY_WRAPPER**: Keep internalOnly check and hierarchy check as combined policy
4. **SERVICE_CHANGE**: May require role-hierarchy service redesign (defer to LANE_G)

**Risk Level:** HIGH (hierarchy-based authorization, role mutation, manual workspace enforcement)

---

### 9. users/[userId]/memberships (GET/POST/DELETE)

**File:** src/app/api/users/[userId]/memberships/route.ts  
**State:** MIXED - GET modernized, POST/DELETE legacy  
**Violations:** 3 handlers (~27 violations)

**Pattern Analysis:**
```
GET handler (MODERNIZED):
- Wrapper: withCanonicalEnforcement ✓
- Context: ctx.verifiedWorkspaceId
- Capabilities: ['USER_VIEW']
- Pattern: Canonical-only

POST handler (LEGACY):
- Wrapper: withEnforcementFull
- Auth pattern: withAuth({ capability: ENGAGEMENT_MANAGE_MEMBERS, internalOnly: true })
- Workspace: Manual header enforcement
- Workspace bridge: canonicalizeAuthContext({ session, policy }, workspaceId)
- Idempotency: Full pattern
- Actor identity: session.user.id
- Context conversion: Converts legacy auth to canonical for service call

DELETE handler (LEGACY):
- Wrapper: withEnforcementFull
- Auth pattern: withAuth({ capability: ENGAGEMENT_MANAGE_MEMBERS, internalOnly: true })
- Pattern: Same as POST (DELETE is same method pattern)
```

**Design Constraints:**
- Engagement membership scoping (not just workspace)
- Custom policy flag: `internalOnly: true`
- Manual workspace enforcement
- Bridge pattern: `canonicalizeAuthContext` conversion (interesting hybrid approach)
- Membership is sensitive (can affect engagement decisions)
- Custom policy flag semantic meaning unclear

**Modernization Approach Options:**
1. **BRIDGE_PATTERN_COMPLETE**: Finish conversion to canonical in both POST/DELETE (already started with canonicalizeAuthContext)
2. **HYBRID_PATTERN**: Keep bridge pattern but move to withCanonicalEnforcement instead of withEnforcementFull
3. **CANONICAL_WITH_ENGAGEMENT_SCOPE**: Verify engagement belongs to workspace in canonical wrapper
4. **CUSTOM_POLICY_WRAPPER**: Keep internalOnly check as policy

**Risk Level:** MEDIUM (hybrid pattern in progress, engagement scoping needs verification)

---

## Summary of Patterns Found

| Pattern | Count | Handlers | Risk |
|---------|-------|----------|------|
| Custom role resolution (resolveServerRole) | 4 | scenario, value, override, entity POST | MEDIUM |
| Custom access control (canView/canEdit) | 3 | scenario, value, override | MEDIUM |
| Custom policy wrapper (internalOnly) | 4 | evidence/validate, users/roles, users/memberships, diagnosis/archetype | MEDIUM-HIGH |
| Hierarchy-based auth | 1 | users/roles | HIGH |
| Manual workspace enforcement | 4 | evidence/validate, users/roles, users/memberships, diagnosis/archetype | MEDIUM-HIGH |
| Mixed modernization (partial) | 3 | entity, users/roles, users/memberships | MEDIUM |
| Already modernized | 1 | diagnosis/route | NONE |

---

## Key Findings

1. **No service signature changes required** - All handlers work with existing services
2. **Capability mapping needed** - Custom functions (canView, canEdit) must map to standard capabilities
3. **Workspace enforcement migration** - 4 handlers use manual header-based workspace enforcement
4. **Hierarchy modeling** - users/roles requires expressing hierarchy levels in auth context
5. **Policy flag semantics** - "internalOnly" usage varies; needs definition before modernization
6. **Partial modernization** - 3 handlers show good patterns in some methods (GET) but need POST/DELETE updated
7. **No custom logic blockers** - No handlers appear to require custom auth logic that can't be expressed in canonical wrapper

---

**Status: AUDIT COMPLETE - PATTERNS DOCUMENTED - READY FOR MODERNIZATION APPROACH DEFINITION IN PHASE D**
