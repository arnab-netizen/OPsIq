# Diagnosis Route Workspace Scope Matrix — Phase 6J

**As of:** 2026-07-10
**Audit scope:** All `/api/diagnosis/*` POST routes

---

## Auth Model at Phase 6J Entry

`withAuth({ capability: CAPABILITIES.DIAGNOSIS_READ, internalOnly: false })` resolves
against the `"system"` workspace. It confirms:

- Valid session exists
- Caller holds the `DIAGNOSIS_READ` capability

It does **not** bind the session to a specific tenant workspace.

---

## Per-Route Scope Matrix

| Route | workspaceId Source | Pre-6J Validated? | Post-6J Validated? | Validation Method |
|---|---|---|---|---|
| `POST /api/diagnosis/maturity` | `body.workspaceId` | NO | YES | `db.workspaceMembership.findFirst` |
| `POST /api/diagnosis/bottleneck` | `body.workspaceId` | NO | YES | `db.workspaceMembership.findFirst` |
| `POST /api/diagnosis/root-cause` | `body.workspaceId` | NO | YES | `db.workspaceMembership.findFirst` |

---

## Membership Query Parameters

All three routes use the identical query:

```typescript
{
  where: {
    workspaceId: body.workspaceId,   // from request body — untrusted UUID
    userId: authContext.session.user.id,  // from verified session
    isActive: true,
  },
  select: { role: true },
}
```

- `workspaceId` must match `body.workspaceId` (the workspace the caller claims to access)
- `userId` comes from the verified JWT session — cannot be spoofed
- `isActive: true` ensures revoked memberships are rejected

---

## Execution Order (Post-Fix)

```
1. withAuth()              → verify session + DIAGNOSIS_READ capability
2. idempotency-key check   → reject if header missing
3. parseRequestBody()      → validate and parse body (Zod)
4. db.workspaceMembership  → verify caller is active member of body.workspaceId  ← NEW
5. checkIdempotencyKey()   → create/fetch IdempotencyRecord
6. engine.analyze*()       → pure compute
7. recordIdempotencyResponse() → persist result
```

**Critical invariant:** No IdempotencyRecord is created for requests that fail step 4.

---

## Downstream Trust Surface

| Component | Receives workspaceId | Trusted after 6J? |
|---|---|---|
| `maturityEngine.analyzeMaturity` | YES (param) | YES — caller verified |
| `bottleneckEngine.analyzeBottleneck` | YES (param) | YES — caller verified |
| `rootCauseEngine.analyzeRootCause` | YES (param) | YES — caller verified |
| `checkIdempotencyKey` (payload hash) | YES (in payload) | YES — only reached post-verification |
| `recordIdempotencyResponse` (responseBody) | YES (in result) | YES — only reached post-verification |
| `IdempotencyRecord.responseBody` (DB) | YES (stored) | YES — only written post-verification |

---

## Routes Not in Scope (No workspaceId from body)

| Route | workspaceId Source | Note |
|---|---|---|
| Decision routes (Phase 6I) | `ctx.verifiedWorkspaceId` | Uses `withCanonicalEnforcement` — already safe |
| Other analysis routes | N/A | No workspaceId parameter |
