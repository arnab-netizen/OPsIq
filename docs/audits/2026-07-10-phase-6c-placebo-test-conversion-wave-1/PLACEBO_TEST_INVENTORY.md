# Phase 6C Wave 1 — decisions placebo-test inventory

**Date:** 2026-07-10
**File:** `src/__tests__/api/decisions.test.ts`
**Starting state:** ~78 test cases, **0 real assertions** — every case was `expect(true).toBe(true)`, an empty
`TODO_A2_FAKE_TEST_QUARANTINED` body, or a workspace-id `.toMatch` on a constant. The file imported no route
handler or service (only `AuthContext` type + `AUDIT_EVENTS`/`ROLES` constants) and mocked audit/event/re-eval.
The file's own footer claimed "IMPLEMENTED: 15 critical invariant tests" — false; all 15 were vacuous.

## Real routes vs. placebo test names

| Placebo describe block | Real route on `046430b` | Disposition |
|---|---|---|
| `GET /api/decisions/list` | `src/app/api/decisions/list/route.ts` (exists; `db.operatorItem.findMany`) | **CONVERT_NOW** (query isolation + DTO + status filter) |
| `POST /api/decisions/create` | `src/app/api/decisions/create/route.ts` → `createDecision` service (exists) | **CONVERT_NOW** (service create + validation) — **exposed a real defect, see below** |
| `GET /api/decisions/[id]` | `src/app/api/decisions/[decisionId]/route.ts` (exists) | DEFER (route-wrapper HTTP auth harness; isolation proven via list) |
| `POST /api/decisions/[id]/approve` | **does not exist** (real transitions: `accept`, `reject`, `close`, `execute`, `verify`, `fail`, `evaluate`, `record-outcome`) | **OBSOLETE_NEEDS_PROOF** — test names describe a non-existent route |
| `POST /api/decisions/[id]/block` | **does not exist** | **OBSOLETE_NEEDS_PROOF** |
| Decision Status Lifecycle / Audit Trail / Isolation & Authorization | mixed / service-internal / route-wrapper | DEFER (state-machine + audit belong to Phase 6D; route-wrapper auth needs HTTP harness) |

## Decisions per test category

| Category | Count (approx) | Decision | Reason |
|---|---|---|---|
| create input validation (title/type/impact/confidence/workspace) | 5 | **CONVERT_NOW** | `createDecision` validates before any DB call → real DB-free assertions |
| create success + workspace scoping + creator + pending state | 3 | **CONVERT_NOW** | provable via real DB; **uncovered the raw-500 defect** |
| list workspace isolation + DTO + status filter | 3 | **CONVERT_NOW** | provable via the exact route query against real DB |
| get-detail / route-wrapper 401/403 / missing-header 400 | ~10 | DEFER | route-level HTTP auth needs a NextRequest/canonical-context harness the repo lacks (its own `operator-route.real.test.ts` `it.skip`s this). Not faked. |
| approve/block state machine (non-existent routes) | ~24 | OBSOLETE_NEEDS_PROOF | routes don't exist; converting would assert against nothing |
| audit-trail emission | ~8 | DEFER → Phase 6D | audit/idempotency governance is explicitly out of Wave 1 scope |

## DB requirement per converted test

| Converted test | DB requirement | Expected result |
|---|---|---|
| rejects empty title / type / non-positive impact / bad confidence / missing workspace | **no DB** (validation throws pre-DB) | throws with specific message |
| createDecision persists pending workspace-scoped decision | **real DB** | 201-equivalent: row with status=pending, correct workspace, createdByUserId |
| list returns only requesting workspace's decisions | **real DB** | isolation holds, no cross-workspace leak, real DTO, no raw 500 |
| list status filter | **real DB** | only matching status returned |

## Product defect uncovered (create path)

Converting `POST /api/decisions/create` proved `createDecision` **raw-500'd on every call** — see FINAL_REPORT.md
§"Product defect". Fixed minimally in `src/services/decisions/decision-creation-service.ts` and proven by the
converted `[db]` create test. No overlap with Phase 6A/F1 (findings), which is a separate surface.

## Remaining placebo markers (not converted in Wave 1)

The OBSOLETE (approve/block, ~24) and DEFER (route-wrapper auth + audit, ~18) cases are **not** converted here
and are **not** claimed as done. They remain for: (a) a route-test HTTP harness (route-wrapper auth), (b) Phase
6D (audit/idempotency/state-machine governance), and (c) a route-existence reconciliation (approve/block vs
accept/reject). Wave 1 does not delete, skip, or fake them; it replaces the provable subset with real coverage.
