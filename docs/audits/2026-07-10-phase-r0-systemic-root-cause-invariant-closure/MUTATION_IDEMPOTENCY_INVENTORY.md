# Phase R0 — Mutation Idempotency Inventory

**Date:** 2026-07-10
**Scope:** All POST/PUT/PATCH routes that create or mutate governed records

---

## Status Legend

- `ENFORCED` — idempotency-key header required + `checkIdempotencyKey` used
- `USES_WRAPPER` — `withIdempotency` higher-order wrapper applied
- `NO_GUARD` — no idempotency enforcement (may be acceptable for non-governed or pre-auth routes)
- `FIXED_R0` — was `NO_GUARD`, now `ENFORCED` after Phase R0

---

## Routes With Idempotency Enforcement

| Route | Method | Pattern | Notes |
|---|---|---|---|
| POST /api/owner/budget/spend | POST | ENFORCED | FIXED_R0 (D3-01) |
| POST /api/actions | POST | USES_WRAPPER | withIdempotency |
| POST /api/auth/login | POST | ENFORCED | pre-auth idempotency |
| POST /api/admin/workspaces/[id]/disable | POST | ENFORCED | |
| POST /api/clients/[clientId]/contacts | POST | ENFORCED | |
| POST /api/clients/[clientId] | POST | ENFORCED | |
| POST /api/clients | POST | ENFORCED | |
| POST /api/decisions/[decisionId]/accept | POST | ENFORCED | |
| POST /api/decisions/[decisionId]/close | POST | ENFORCED | |
| POST /api/decisions/[decisionId]/execute | POST | ENFORCED | |
| POST /api/decisions/[decisionId]/fail | POST | ENFORCED | |
| POST /api/decisions/[decisionId]/record-outcome | POST | ENFORCED | |
| POST /api/decisions/[decisionId]/reject | POST | ENFORCED | |
| POST /api/decisions/[decisionId]/verify | POST | ENFORCED | |
| POST /api/decisions/create | POST | ENFORCED | |
| POST /api/decisions/intake | POST | ENFORCED | |
| POST /api/deliverables | POST | USES_WRAPPER | withIdempotency |
| POST /api/diagnosis/bottleneck | POST | ENFORCED | |
| POST /api/diagnosis/maturity | POST | ENFORCED | |
| POST /api/diagnosis/root-cause | POST | ENFORCED | |
| POST /api/engagements/[id]/acknowledge | POST | ENFORCED | |
| POST /api/engagements/[id]/condition | POST | ENFORCED | |
| PUT /api/engagements/[id]/intervention-state | PUT | ENFORCED | |
| POST /api/engagements/[id]/recommendations/rerank | POST | ENFORCED | |
| POST /api/engagements/[id]/route | PATCH | ENFORCED | |
| POST /api/engagements/[id]/shock-events | POST | ENFORCED | |
| POST /api/engagements | POST | ENFORCED | |
| POST /api/evidence-bundles/[id]/items | POST | ENFORCED | |
| POST /api/evidence-bundles | POST | ENFORCED | |
| POST /api/evidence/[id]/validate | POST | ENFORCED | |
| POST /api/evidence | POST | ENFORCED | |
| POST /api/execute | POST | ENFORCED | |
| POST /api/findings/[id]/evidence | POST | ENFORCED | |
| POST /api/findings | POST | ENFORCED | |
| POST /api/growth/acquisition-metrics | POST | ENFORCED | |
| POST /api/growth/sales-pipeline | POST | ENFORCED | |
| POST /api/growth/unit-economics | POST | ENFORCED | |
| POST /api/leads/[id] | POST | ENFORCED | |
| POST /api/leads | POST | ENFORCED | |
| POST /api/operator | POST | ENFORCED | |
| POST /api/opsiq/consulting-engine/run | POST | ENFORCED | |
| POST /api/recommendations | POST | ENFORCED | |
| POST /api/users/[id]/memberships | POST | ENFORCED | |
| POST /api/users/[id]/roles | POST | ENFORCED | |
| POST /api/users/[id] | POST | ENFORCED | |
| POST /api/users | POST | USES_WRAPPER | withIdempotency |

---

## Routes With No Idempotency Guard (NO_GUARD) — Assessed

The following governed-mutation routes have no idempotency guard. Each entry
includes an assessment of whether this is acceptable.

| Route | Method | Mutation | Assessment |
|---|---|---|---|
| POST /api/auth/signup | POST | create user+workspace+membership | ACCEPTABLE — pre-auth; email uniqueness constraint prevents duplicates |
| POST /api/onboarding/invite | POST | create user+membership | LOW_RISK — email uniqueness and membership uniqueness constraints prevent duplicates |
| POST /api/billing/upgrade | POST | create/update billingAccount | NOTED — financial mutation; Stripe handles payment idempotency externally; local guard optional |
| POST /api/run | POST | create decision result chain | LOW_RISK — has `isDuplicateRequest` guard |
| POST /api/owner/*/businesses/[id]/diagnoses | POST | create diagnosis cycle | NOTED — diagnosis per-cycle uniqueness constraint limits impact |
| POST /api/owner/*/businesses/[id]/snapshots | POST | create snapshot | NOTED — period uniqueness constraint on most snapshot models |
| POST /api/owner/learning-* | POST | create learning records | NOTED — learning records are append-only, duplication is recoverable |
| POST /api/complaint-rework | POST | create complaint/rework | NOTED — append-only operational record |
| POST /api/escalation | POST | create escalation | NOTED — append-only |
| POST /api/owner/arbitrate | POST | create arbitration record | NOTED — append-only |

---

## D3-01 Fix Detail

**Before:** `POST /api/owner/budget/spend` called `recordSpendEntry` directly with no idempotency check.

**After:**
```typescript
const idempotencyKey = ctx.request!.headers.get("idempotency-key");
if (!idempotencyKey) throw new BadRequestError("idempotency-key header required");
// ... parseRequestBody ...
const idempotencyCheck = await checkIdempotencyKey({ idempotencyKey, operationName: "recordSpendEntry", ... });
if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) return idempotencyCheck.cachedResponse.body;
// ... try/catch with recordIdempotencyResponse / recordIdempotencyError
```

**Test file:** `src/__tests__/api/budget-spend-idempotency-r0.test.ts` (5 tests)
