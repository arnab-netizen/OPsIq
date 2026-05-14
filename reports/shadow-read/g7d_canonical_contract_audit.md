# G7D-R-B: CanonicalAuthContext Contract Audit

**Phase**: G7D-R (Reconciliation)
**Timestamp**: 2026-05-14T20:38:00Z
**Classification**: RUNTIME_ENFORCED_HYBRID

## Executive Summary

**CRITICAL FINDING**: CanonicalAuthContext interface was modified during G7D, changing request field from optional to required. This is a contract change that affects ALL handlers using `withCanonicalEnforcement` and should NOT have been bundled with handler migration commits.

---

## Changes to Auth/Context Infrastructure

### 1. CanonicalAuthContext Interface

**File**: `src/lib/canonical-route-enforcement.ts`

**Change**:
```diff
- // Optional: raw NextRequest (not required for service layer)
- request?: NextRequest;
+ // Raw NextRequest (always provided by wrapper)
+ request: NextRequest;
```

**Severity**: HIGH
**Contract Change**: YES
**Wrapper Semantics Changed**: YES
**Handler Assumptions Changed**: YES

**Impact Analysis**:
- **Before**: Handlers could not assume request field exists
  - Required null checks: `ctx.request?.url`
  - Safer for handlers that don't need request
  
- **After**: Handlers can assume request always exists
  - Can use directly: `ctx.request.url`
  - Simplifies handler code
  - But changes contract globally for all canonical handlers

**Justification for Change**: The wrapper (canonical-route-enforcement.ts line 362) always sets request:
```typescript
request: req,  // Always provided
```

**Issue**: While technically correct, this is a contract change that:
1. Affects all ~40+ handlers using withCanonicalEnforcement
2. Changes what handlers can assume about context
3. Should have been decided separately
4. Enables type safety improvement but reduces flexibility

---

### 2. CanonicalAuthContext Changes - Other Fields

**Checked**: Session field
```typescript
session?: SessionInfo;  // Still optional ✓
```

**Checked**: Capability fields
```typescript
verifiedCapabilities: Set<string>;  // Still required ✓
```

**Checked**: Workspace field
```typescript
verifiedWorkspaceId: string;  // Still required ✓
```

**Checked**: Tracing fields
```typescript
traceId?: string;  // Still optional ✓
executionTrace?: Readonly<any>;  // Still optional ✓
```

**Verdict**: Only `request` field was modified. Other fields unchanged.

---

### 3. canonical-route-enforcement.ts Wrapper Changes

**Checked**: Line 362 where context is built
- ✓ No changes to how request is assigned
- ✓ No changes to verification logic
- ✓ No changes to capability verification
- ✓ No changes to workspace validation
- ✓ No changes to session snapshot
- ✓ No changes to enforcement semantics

**Wrapper still enforces**:
- Authentication before handler execution ✓
- Capability checking if required ✓
- Workspace scoping if required ✓
- Shadow-read protection after AUTH_FINALIZED ✓

---

### 4. withCanonicalEnforcement Wrapper Contract

**Checked**: Wrapper exports and options

**No changes detected to**:
- Handler signature: `(ctx: CanonicalAuthContext, params) => Promise<Response>`
- Wrapper options: `{ requireWorkspace, requireCapabilities, requireActorType }`
- Pre-auth execution guarantee
- Failure semantics

**Verdict**: Wrapper enforcement contract unchanged. Only context contract changed.

---

### 5. canonicalizeAuthContext Bridge Function

**File**: `src/lib/auth-guard.ts`

**Status**: No changes to this function in G7D commits.

**Usage**: Added to 4 unrelated handlers (logout, actions, contacts) to fix type compatibility with service-layer changes.

**Verdict**: Bridge function is stable. Addition of calls is for compatibility, not modification of bridge itself.

---

## Service-Layer Auth Context Usage

**Checked**: Do services rely on context field optionality?

### revokeSession (src/services/auth.ts:156)
```typescript
export async function revokeSession(
  sessionId: string,
  authContext: CanonicalAuthContext
)
```
- **Service dependency**: Uses context but doesn't access request field
- **Impact**: No breaking change

### createAction (src/services/action.ts)
- **Service dependency**: Doesn't access request field
- **Impact**: No breaking change

### updateAction, updateContact, etc.
- **Impact**: All use CanonicalAuthContext but don't access request field
- **Verdict**: Request field optionality change doesn't break services

---

## Analysis: Was CanonicalAuthContext Weakened?

**Question**: Does making request non-optional weaken the context?

**Answer**: NO - The context was not weakened. It became MORE specific (non-optional field = more guarantees). However:

1. **Type Safety**: Improved ✓ (handlers can assume request exists)
2. **Flexibility**: Reduced ✗ (handlers can't treat request as absent)
3. **Handler Assumptions**: Changed ✗ (all handlers now assume request exists)
4. **Contract Strictness**: Increased ✓ (clearer guarantees)

**Verdict**: Not a weakening, but a contract strengthening that changes handler assumptions globally.

---

## Silent Defaults Analysis

**Question**: Did this change introduce silent defaults or hidden assumptions?

**Answer**: NO silent defaults introduced. The change makes assumptions explicit:
- Handler must assume request exists
- If handler doesn't need request, it's still non-optional (minor waste)
- No silent fallback or default injection

---

## Wrapper and Service Code Changes

**Checked**: Did G7D modify wrapper enforcement semantics?

**Verdict**: NO
- Shadow-read enforcement: unchanged ✓
- Capability checking: unchanged ✓
- Workspace validation: unchanged ✓
- Request processing: unchanged ✓

---

## Scope Control Verdict

| Aspect | Allowed by G7D | Status |
|--------|---|---|
| Handler migration (GET-only) | YES | ✓ Executed correctly |
| Handler-specific changes | YES | ✓ Only GET handlers |
| Report artifacts | YES | ✓ Valid |
| CanonicalAuthContext field changes | NO | ✗ VIOLATION |
| Wrapper enforcement changes | NO | ✓ No changes |
| Service-layer migration | NO | ✗ Collateral damage |
| any/as any types in changed files | NO | ✓ None found |

---

## Required Decision

**Option A**: Accept request field change as-is
- Pro: Type safety improvement for all handlers
- Pro: Wrapper already always provides request
- Con: Changes global contract for 40+ handlers without explicit review
- Con: Not reversible without handler updates

**Option B**: Revert request field to optional
- Pro: Preserves existing contract
- Pro: Requires explicit decision before global change
- Con: Requires null checks in handlers using ctx.request
- Con: Handlers that already assume request exists will need non-null assertions

**Option C**: Keep request non-optional but treat as separate architectural decision
- Pro: Acknowledges this as a separate change
- Con: Commits already made with this bundled

---

## Recommendation

**CONDITIONAL ACCEPTANCE WITH DOCUMENTATION**

1. **Accept** the request field change as technically correct (wrapper always provides it)
2. **Require** that this be documented as an architectural decision separate from handler migration
3. **Create** a separate commit/PR if this needs to be reverted for any reason
4. **Track** that all handlers now have a stronger guarantee about request availability
5. **Document** in handler migration guidance that ctx.request can be assumed non-null

---

## No Weakening Detected

✓ CanonicalAuthContext was NOT weakened
✓ Wrapper enforcement semantics unchanged
✓ Service layer not affected negatively
✓ No any/as any types introduced
✓ No permission fabrication
✓ No silent defaults or hidden assumptions

---

End of Contract Audit
