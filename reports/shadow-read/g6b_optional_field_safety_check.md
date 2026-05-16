# PHASE G6B-0: Optional Field Safety Check

**Generated**: 2026-05-14T12:20:00Z  
**Classification**: RUNTIME_ENFORCED_HYBRID  

---

## FIELD SAFETY ANALYSIS

### Optional Fields Made in G6R

| Field | Type | Usage | Enforcement-Critical? |
|-------|------|-------|----------------------|
| traceId | string | Wrapper initialization, observability | NO |
| executionTrace | Readonly<any> | Telemetry, execution tracing | NO |
| request | NextRequest | Body/header parsing in wrapper | NO |
| correlationId | string | Request tracking, logging | NO |
| requestId | string | Logging, request identification | NO |

### Enforcement-Critical Fields (Remain Required)

| Field | Purpose | Impact if Missing |
|-------|---------|-------------------|
| verifiedActorId | Service auth checks (userId) | Authorization fails (safe) |
| verifiedActor | User identity | Cannot identify actor (safe) |
| verifiedWorkspaceId | Tenant isolation | Cross-workspace access possible (CRITICAL) |
| verifiedCapabilities | Permission enforcement | Cannot check permissions (CRITICAL) |
| verifiedSessionSnapshot | Immutable snapshot requirement | Cannot verify snapshot integrity (CRITICAL) |

---

## SAFETY VERDICT

### Runtime Enforcement Impact

✓ **NO RISK**: Optional fields are **observability and metadata only**
- Not used in authorization decisions
- Not used in tenant isolation
- Not used in permission checks
- Not used in idempotency
- Not used in audit enforcement

### Audit Chain Impact

✓ **NO RISK**: Fields are logged separately from auth enforcement
- Wrapper creates full context before calling handler
- Handler receives either full context (canonical wrapper) or minimal context (legacy with bridge)
- Audit events captured separately

### Production Observability Impact

⚠ **MINOR DEGRADATION** (acceptable):
- Legacy routes using canonicalizeAuthContext() will lack tracing
- Still have: userId, workspace, capabilities, session snapshot
- Observable enough for debugging
- Not a security/enforcement issue

### Tenant Isolation Impact

✓ **NO RISK**: verifiedWorkspaceId remains REQUIRED
- Workspace enforcement not affected
- Bridge enforces workspace check (throws if missing)
- No cross-workspace access possible

### Idempotency Impact

✓ **NO RISK**: Idempotency not tied to optional fields
- Idempotency keys based on request content + user + workspace
- Request field is optional but idempotency logic is in services
- idempotency module doesn't use ctx.request

---

## CONCLUSION

**SAFE TO PROCEED WITH G6B PILOT MIGRATION**

Making the five optional fields optional:
- ✓ Does not weaken enforcement
- ✓ Does not affect audit chain
- ✓ Does not risk tenant isolation
- ✓ Minor observability degradation (acceptable)
- ✓ Enables bridge usage without forcing full wrapper refactor

**Enforcement-critical fields remain required:**
- ✓ verifiedWorkspaceId (tenant isolation)
- ✓ verifiedActorId (user identification)
- ✓ verifiedCapabilities (permission enforcement)
- ✓ verifiedSessionSnapshot (immutability guarantee)

---

## RECOMMENDATION

✓ Proceed with G6B pilot migration
✓ Optional fields are safe to make optional
✓ No runtime enforcement risk identified
✓ No audit chain weakness
✓ No tenant isolation risk
✓ Minor observability trade-off is acceptable

**BLOCKER STATUS**: NONE - Safe to continue
