# Placeholder / Stub Implementation Matrix — Invariant I7

Audit date: 2026-07-12

## Summary

11 findings: 9 FAIL, 2 WARN

## FAIL Findings

### I7-001 — Google Sheets OAuth Service (4 stubs)

**File:** `src/services/external-systems/google-sheets-oauth.service.ts`  
**Severity:** FAIL  
**Classification:** DC-A7.5-I7A (external-service blocked)

| Function | Line | Stub |
|---|---|---|
| `exchangeCodeForTokens` | 134 | `throw new Error("Token exchange not implemented in this service layer")` |
| `extractGoogleSheetData` | 149 | `throw new Error("Sheet data extraction not implemented in this service layer")` |
| `refreshAccessToken` | 271 | `throw new Error("Token refresh not implemented in this service layer")` |
| `revokeGoogleAccess` | 290 | `throw new Error("Token revocation not implemented in this service layer")` |

**Impact:** Google Sheets OAuth integration is completely inoperative. Any code path reaching these functions crashes at runtime. Token refresh means all Google OAuth sessions break on first token expiry.

**Fix blocker:** Requires Google OAuth credentials and external HTTP calls to `accounts.google.com/o/oauth2/token`. Cannot be implemented without external service availability.

---

### I7-002 — Browser Import Audit Trail (1 stub)

**File:** `src/services/external-systems/browser-import.service.ts:370`  
**Severity:** FAIL  
**Classification:** DC-A7.5-I7A

`throw new Error("Not yet implemented - requires DB tables")`

**Impact:** Audit trail retrieval for browser imports unconditionally throws. Workspace isolation verification for imports cannot be performed.

**Fix blocker:** DB tables (referenced in error message) not yet created. DB migration required.

---

### I7-003 — Token Lifecycle Refresh (1 stub)

**File:** `src/services/external-systems/token-lifecycle.service.ts:187`  
**Severity:** FAIL  
**Classification:** DC-A7.5-I7A

`throw new Error(\`Token refresh for provider ${providerId} not implemented in this service layer\`)`

**Impact:** Generic token refresh path is inoperative. This is separate from the Google-specific stub in I7-001 — token refresh is unimplemented at both layers.

**Fix blocker:** Requires provider-specific OAuth token endpoint integration.

---

### I7-004 — Review Cycles Route Returns Empty Array (1 stub)

**File:** `src/app/api/engagements/[engagementId]/review-cycles/route.ts:72`  
**Severity:** FAIL  
**Classification:** DC-A7.5-I7A

```typescript
return { cycles: [], note: "Review cycle history not yet implemented - cycles are generated on-demand" };
```

**Impact:** GET /api/engagements/:id/review-cycles always returns an empty array. Clients can never retrieve review cycle history. Route is a scaffolded placeholder.

**Fix blocker:** Review cycle history schema not persisted. Requires schema addition and DB migration.

---

### I7-005 — Constraint Checks Route Returns Null Stub (1 stub)

**File:** `src/app/api/engagements/[engagementId]/constraint-checks/route.ts:130`  
**Severity:** FAIL  
**Classification:** DC-A7.5-I7A

```typescript
// TODO: Implement persistent constraint check history when schema added
return Response.json({ note: "Constraint check history not yet persisted", lastCheck: null });
```

**Impact:** GET handler returns stub response. No constraint check history is queryable.

**Fix blocker:** Persistence schema not added. DB migration required.

---

### I7-006 — Snapshot Cleanup No-Op (1 stub)

**File:** `src/services/snapshot-engine.ts:119`  
**Severity:** FAIL  
**Classification:** DC-A7.5-I7B

```typescript
logger.info("SnapshotEngine: Cleanup (not yet implemented)", { workspaceId, keepCount });
// TODO: Implement snapshot cleanup logic
```

**Impact:** `cleanupOldSnapshots` silently does nothing. Snapshots accumulate without bound. Storage growth is uncapped.

**Fix blocker:** Design decision required on retention policy and deletion strategy.

---

## WARN Findings

### I7-007 — Redis Cache Silent Fallback

**File:** `src/services/cache/cache-factory.ts:8`  
**Severity:** WARN  
**Classification:** DC-A7.5-I7C

When `CACHE_BACKEND=redis` is configured, the factory silently falls back to in-memory with a `console.warn`. The Redis branch is declared but has no implementation. Multi-instance deployments will have split caches without error.

---

### I7-008 — Error Monitoring Integration TODO

**File:** `src/infra/error-monitoring.ts:167`  
**Severity:** WARN  
**Classification:** DC-A7.5-I7C

`// TODO: Integrate with Sentry/DataDog/CloudWatch`

Error-rate alerts log internally but no alert leaves the process. External monitoring integration is absent.
