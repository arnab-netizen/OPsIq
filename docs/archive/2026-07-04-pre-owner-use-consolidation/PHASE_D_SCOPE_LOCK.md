# Phase D Scope Lock — Enterprise Operability (Product Hunt Launch Track)

**Date:** 2026-06-04
**Status:** SCOPE_LOCKED_BEFORE_IMPLEMENTATION
**Required Before:** Any Phase D / D1 product/test/schema/workflow code changes
**Phase Selected:** Phase D / D1 (execution.md mandatory order)
**Explicitly NOT started:** P2D, admin route implementation, Product Hunt assets

---

## 1. Verified Baseline

| Item | Value |
|------|-------|
| Current branch | `main` |
| Current main HEAD (after reconciliation) | `8fb00116` (Document P2C DB verified business-condition hardening result) |
| origin/main HEAD | `8fb00116` (in sync) |
| Working tree | CLEAN |
| Reconciliation | `git fetch origin` → `git checkout main` → `git reset --hard origin/main` → clean |

**Baseline note:** The prior discovery report used `3fe0364c` as baseline. That was the final **functional** P2C commit. `8fb00116` is the subsequent **docs-only** result commit (it adds `P2C_RESULT_AFTER_BUSINESS_CONDITION_HARDENING.md` on top of `3fe0364c`). `8fb00116` is therefore the correct current HEAD; the difference is the result document, not functional code.

### P2B_DB_VERIFIED evidence

| Item | Value |
|------|-------|
| Classification | `P2B_DB_VERIFIED` |
| Workflow | `26921421588` |
| Functional commit tested | `145e9da0` |
| Result | **42/42 passing** |

### P2C_DB_VERIFIED evidence

| Item | Value |
|------|-------|
| Classification | `P2C_DB_VERIFIED` |
| Result document | `P2C_RESULT_AFTER_BUSINESS_CONDITION_HARDENING.md` |
| Result document commit | `8fb00116` (current HEAD) |
| Final functional commit | `3fe0364c` |
| Final functional workflow | `26945513098` |
| P2C tests | **57/57 passing** |
| P2B regression | **42/42 passing** |

Both prior phases are verified and locked. Phase D must preserve both baselines.

---

## 2. Product Hunt Launch Objective

Product Hunt launch is the current product goal. **Phase D (Enterprise Operability) is the required operability backbone that must land before launch work begins.** We proceed backbone-first: the product must be operable, supportable, and pilot-safe before any public-facing launch polish is started. Product Hunt assets (landing/demo/pricing/onboarding) are explicitly **out of scope** for this phase.

---

## 3. Phase D Definition

Source of truth: `execution.md`.

```
Phase D = Enterprise Operability
```

Purpose (per execution.md PHASE D): provide workspace governance, audit-log querying, team/member visibility, webhook delivery, backup/restore, monitoring/alerting, runbooks, and performance baselines — the operational layer required to run, support, and inspect the product safely in production.

---

## 4. Phase D Mandatory Sequence (verbatim from execution.md)

execution.md defines Phase D as items D1–D7, in this exact order:

| Item | Title (execution.md) | Status (execution.md) |
|------|----------------------|------------------------|
| D1 | Implement Admin Dashboard | BLOCKER |
| D2 | Make Audit Trail Queryable | BLOCKER (dependent on C2 migrations) |
| D3 | Implement Webhook Infrastructure | BLOCKER |
| D4 | Add Backup/Restore Procedure | BLOCKER |
| D5 | Add Monitoring/Alerting | BLOCKER |
| D6 | Create Runbooks | BLOCKER |
| D7 | Establish Performance Baselines | BLOCKER |

(Cross-reference: `NEXT_EXECUTION_QUEUE.md` BLOCKER #9 "Implement Admin Dashboard" lists the same four D1 endpoints, and BLOCKER #10 corresponds to webhook infrastructure.)

D1 is the **first** item and the subject of this scope lock. D2–D7 are **not** scoped here.

---

## 5. D1 Final Scope

execution.md D1 ("Implement Admin Dashboard") requirements:

```
1. GET  /api/admin/workspaces                  (list all workspaces)
2. GET  /api/admin/workspaces/[id]/members     (list users)
3. GET  /api/admin/audit-log                    (queryable audit trail)
4. POST /api/admin/workspaces/[id]/disable      (soft delete)
```

### Discovery: current state of D1 surfaces (read-only inspection)

The D1 route files **already exist as scaffolded stubs** and must be made real. They currently violate the OpsIQ hard rule "No TODOs, placeholders, stubs, or fake implementations."

| File | Current state | D1 work |
|------|---------------|---------|
| `src/app/api/admin/workspaces/route.ts` | STUB — `// TODO: Query from database`; returns empty list | Replace with real workspace-scoped DB query (id, name, slug, createdAt, memberCount) + pagination |
| `src/app/api/admin/workspaces/[id]/members/route.ts` | STUB — `// TODO: Query from database`; returns empty list | Replace with real membership query (userId, role, addedAt) + pagination |
| `src/app/api/admin/workspaces/[id]/disable/route.ts` | STUB — `// TODO: Update database`; returns fake `status: "disabled"`, no DB write, no audit event | Real soft-delete via existing `Workspace.isActive`; emit audit event; idempotent |
| `src/app/api/admin/audit-log/route.ts` | WIRED to `queryAuditTrail`/`getAuditStatistics`, but the service is **mock-backed in-memory** (`MockAuditEventStore` in `src/services/audit-trail.ts`) | D1 confirms the read route exists; the **DB-backed audit query service is D2's responsibility**, not D1 |
| `src/__tests__/api/admin/workspaces.test.ts` | FAKE — ~40 `expect(true).toBe(true)` with TODOs | Replace with real tests (see §10) |

### D1 schema determination — **NO schema change required**

The schema already contains everything D1 needs:
- `Workspace.isActive` (Boolean, default `true`) → soft-delete (disable) reuses this field. No new column.
- `WorkspaceMembership` (workspaceId, userId, role, addedAt, isActive) + indexes `@@index([workspaceId, isActive])` → members listing and per-workspace `memberCount`.
- `Workspace.workspaceMemberships` relation → memberCount aggregation.

Therefore D1 is a **service/route-implementation + test-realization** task, not a schema task.

### D1 boundary with D2

The `audit-log` route is listed in execution.md under both D1 (endpoint existence) and D2 (queryable, DB-backed service). To keep D1 minimal and avoid scope creep, **D1 scope is the workspace-governance endpoints** (workspaces list, members list, disable). Making the audit-trail service DB-backed (replacing `MockAuditEventStore`) is deferred to **D2**. D1 only confirms the audit-log read route's auth/shape; it does not rewrite the audit service.

---

## 6. D1 Product Hunt Relevance

D1 is required before Product Hunt because once strangers use the product, the operator/support team needs:
- **Workspace visibility** — see what workspaces exist (`GET /api/admin/workspaces`) to support and debug real users.
- **Member visibility** — see who is in a workspace (`GET /api/admin/workspaces/[id]/members`) for support and access questions.
- **Audit inspection** — read what happened (`GET /api/admin/audit-log`) for incident response and trust.
- **Containment** — disable an abusive or broken workspace (`POST /api/admin/workspaces/[id]/disable`) without destroying data.

Without these, a public launch is unsupportable and unsafe: there is no admin path to observe, support, or contain real users.

---

## 7. D1 Non-Goals

D1 must **NOT**:
- ❌ Touch P2B decision/operator/outcome routes
- ❌ Touch P2C business-condition / hardening logic
- ❌ Modify recommendation ranking
- ❌ Modify payment/webhook/auth core (unless execution.md explicitly requires it AND it is separately scoped — it does not for D1)
- ❌ Add schema changes or migrations (proven unnecessary in §5; `isActive` already exists)
- ❌ Rewrite the audit-trail service from mock to DB-backed (that is **D2**)
- ❌ Create frontend dashboard UI (execution.md D1 specifies API endpoints, not UI)
- ❌ Start P2D
- ❌ Perform broad governance cleanup of unrelated modules
- ❌ Create Product Hunt landing/demo/pricing/onboarding assets

---

## 8. Allowed Initial D1 Files

Based on source inspection (files already exist as stubs):

**Modify (replace stub with real implementation):**
- ✅ `src/app/api/admin/workspaces/route.ts`
- ✅ `src/app/api/admin/workspaces/[id]/members/route.ts`
- ✅ `src/app/api/admin/workspaces/[id]/disable/route.ts`

**Create (if a dedicated query layer is warranted to keep business logic out of routes):**
- ✅ `src/services/admin/**` (new admin workspace query/service module — none exists today)

**Tests:**
- ✅ `src/__tests__/api/admin/workspaces.test.ts` (replace fake assertions with real ones)
- ✅ `src/__tests__/services/admin/**` (new service-level tests if a service module is created)

**Workflow (only if a coverage gap is proven AND separately authorized):**
- ✅ A dedicated Phase D verification workflow file — **not created in this scope lock** (see §11)

**Read-only reference (do not modify):**
- `src/app/api/admin/audit-log/route.ts`, `src/services/audit-trail.ts` (D2 territory)
- `prisma/schema.prisma` (confirm fields only)

---

## 9. Forbidden Files

D1 must **NOT** modify:
- ❌ `src/__tests__/p2b/**`
- ❌ `src/__tests__/p2c/**`
- ❌ P2B result documents (`P2B_*`)
- ❌ P2C result documents (`P2C_RESULT_*`, `P2C_SCOPE_LOCK.md`)
- ❌ `src/app/api/operator/**`
- ❌ `src/app/api/decisions/**`
- ❌ `src/services/operator/**`
- ❌ `src/services/decisions/**`
- ❌ `src/services/outcome/**`
- ❌ `src/services/recommendation*`
- ❌ `src/services/business-condition.ts`, `src/domain/business-condition/**`
- ❌ `prisma/schema.prisma` (unless a schema change is explicitly proven required and separately authorized — proven NOT required for D1)
- ❌ `prisma/migrations/**` (unless a schema change is authorized)
- ❌ Payment/webhook/auth core files
- ❌ `.github/workflows/ci.yml`, `.github/workflows/p2b-db-verification.yml`, `.github/workflows/p2c-db-verification.yml`

---

## 10. D1 Test Strategy (tests-first, before implementation)

The current `src/__tests__/api/admin/workspaces.test.ts` is fake (`expect(true).toBe(true)`). Per execution.md Rule 2 ("Fake Tests Are Blockers") and Rule 5 ("Never Weaken Tests"), these must be replaced with real assertions. Required tests:

1. **Admin workspaces list test** — `GET /api/admin/workspaces` returns real workspace records (id, name, slug, createdAt, memberCount) from DB.
2. **Admin members list test** — `GET /api/admin/workspaces/[id]/members` returns real membership records (userId, role, addedAt).
3. **Admin audit-log read test** — `GET /api/admin/audit-log` returns a workspace-scoped page (route-shape/auth only; service-level DB query is D2).
4. **Tenant/workspace isolation test** — members/audit reads are scoped to the requested/verified workspace; no cross-workspace leakage.
5. **Unauthorized/forbidden access test** — requests without `SYSTEM_ADMIN` (workspaces/members/disable) and without `AUDIT_VIEW` (audit-log) are rejected fail-closed.
6. **No-write read-only test** — the GET endpoints (`workspaces`, `members`, `audit-log`) perform no DB writes.
7. **Disable governance test** — `POST /api/admin/workspaces/[id]/disable` sets `isActive=false` (soft delete, no hard delete), emits an audit event, and is idempotent under duplicate submission.
8. **Regression protection** — P2B (42/42) and P2C (57/57) suites remain green; no forbidden files touched.

Test style follows the established repo pattern (e.g. P2C `condition-route-hardening.test.ts`): mock `withCanonicalEnforcement` as a pass-through, inject a verified context, and mock DB-touching modules — or run DB-backed in CI per execution.md CI-first verification.

---

## 11. D1 Workflow Coverage Decision

**Finding:** No existing workflow references `src/app/api/admin/**` or admin tests. `ci.yml` runs the general suite (which would pick up the realized admin tests), but there is **no dedicated Phase D database-verification workflow** analogous to `p2b-db-verification.yml` / `p2c-db-verification.yml`.

**Decision:** Do **not** create a workflow in this scope lock. If, during D1 implementation, the admin tests require real-DB verification not reliably covered by `ci.yml`, propose a dedicated **Phase D verification workflow** (`phase-d-db-verification.yml`) that runs the admin/D1 tests plus P2B (42/42) and P2C (57/57) regression on the covered paths — pinned to specific test files, mirroring the P2C workflow. Workflow creation requires separate authorization.

---

## 12. Phase D Acceptance Model (D1)

D1 may be classified verified **only** when ALL hold:
- ✅ D1 tests pass (CI-first verification; DB-backed where required)
- ✅ P2B regression remains **42/42**
- ✅ P2C regression remains **57/57** (or the latest verified count)
- ✅ No forbidden files (§9) touched
- ✅ No new schema/migrations introduced (D1 proven schema-free)
- ✅ All admin route TODOs/stubs replaced with real implementations (no placeholders remain)
- ✅ Disable path emits an audit event and is idempotent (governed mutation rules)
- ✅ `npx tsc --noEmit` and `npm run build` pass

---

## 13. Product Hunt Readiness Ladder

1. **Phase D — Enterprise Operability** ← current backbone work (D1 first)
2. **Deployment readiness** (resolve operational blockers from `PRODUCTION_READINESS_NOW.md`)
3. **Verified stranger-safe customer journey** (one end-to-end path a real outsider can complete safely)
4. **Onboarding / UI / demo / pricing / support polish**
5. **Product Hunt launch**

Each rung must be satisfied before the next. Product Hunt assets are not started until rungs 1–4 are complete.

---

**Scope Lock Created:** 2026-06-04
**Baseline:** `8fb00116` (P2B 42/42 ✓ · P2C 57/57 ✓)
**Phase D Status:** SCOPE_LOCKED_BEFORE_IMPLEMENTATION
**Next Step:** D1 implementation — tests-first, replace admin route stubs with real DB-backed implementations (when authorized)
