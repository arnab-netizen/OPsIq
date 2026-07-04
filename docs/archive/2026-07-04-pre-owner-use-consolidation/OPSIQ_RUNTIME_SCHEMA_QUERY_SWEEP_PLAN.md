# OpsIQ Wave 1 — RUNTIME_SCHEMA_QUERY_SWEEP Plan

> Branch: `claude/runtime-schema-query-sweep`. One PR for the whole wave.
> Purpose: fix schema-invalid Prisma queries that break runtime paths **where the clean relation-scoped fix
> is obvious and requires no schema migration**. Audit + document everything else.

## Root cause
`Action`, `KPI`, and `Finding` have **no `workspaceId` column** — they are workspace-scoped only through their
`engagement` relation (`Engagement.workspaceId`). Many services/routes filter these models by a **flat
`workspaceId`**, which Prisma rejects with `PrismaClientValidationError` at runtime. The correct, migration-free
form is `where: { …, engagement: { workspaceId } }` (already used by ~37 call sites, e.g. `re-evaluation.ts`,
`decision-evidence.service.ts`).

## Scope (this wave)
1. Clean `Action`/`KPI`/`Finding` workspace-scope query fixes (flat `workspaceId` → `engagement: { workspaceId }`).
2. B4 / owner / dashboard / governed runtime read+write paths that hit the same bug, where cleanly fixable.
3. Audit + document every non-clean case (needs schema or domain decision) — no code change for those.

## Explicitly NOT in this wave
Adding columns (`workspaceId`, `Action.priority`, `Action.dueDate`); schema reconciliation; inventing/mapping
`Action.priority`; changing domain semantics; notification honesty (Wave 4); proof-loop (Wave 2); learning-loop
(Wave 3). No masking: no empty-array fallbacks, no swallowed Prisma errors, no 500→false-200.

## Fix patterns (migration-free)
- `findMany`/`findFirst`/`count` with bare `workspaceId` → `engagement: { workspaceId }`.
- `updateMany` with bare `workspaceId` → `engagement: { workspaceId }` (updateMany accepts relation filters).
- `findUnique({ where: { id, workspaceId } })` → `findFirst({ where: { id, engagement: { workspaceId } } })`
  (findUnique cannot take a relation filter; `id` is unique so `findFirst` returns the same single row, now
  workspace-scoped). Same fail-closed semantics: wrong-workspace id → `null` → existing NotFound path.
- Sibling models in the same query that DO have `workspaceId` (`Recommendation`, `BusinessConditionProfile`,
  `Engagement`) are left unchanged.

## Deferred (documented in OPSIQ_SCHEMA_QUERY_MISMATCH_DEFERRED_DECISIONS.md, no code change)
- `escalation.ts:detectHighPriorityOverdueActions` — filters `Action.priority`/`dueDate` (no such columns);
  `Action` has no priority concept → **DOMAIN_DECISION_REQUIRED**.
- `report-generator.ts` action ordering by `dueDate`/`priority` → **DOMAIN_DECISION_REQUIRED**.
- `action.ts` reprioritization writing `Action.priority` → **DOMAIN_DECISION_REQUIRED**.
- CRUD services `user`/`lead`/`client-contact` (`User`/`LeadRecord`/`ClientAccount` lack `workspaceId`) →
  **SCHEMA_DECISION_REQUIRED** (already tracked as BROKEN-SVC-1/2/3).

## Tests (local, Postgres 16; per wave requirements)
For representative fixed paths across read, updateMany, and findUnique→findFirst patterns:
1. previously-throwing site no longer throws;
2. correct workspace rows returned;
3. cross-workspace rows excluded;
4. legitimate empty result → empty (not 500);
5. auth denial still denies (route paths);
6. fixed success path reaches the real service result;
7. no static/empty-array fallback introduced.

## Classification gate
Open PR only at ≥ `CLEAN_QUERY_SWEEP_DB_PROVEN`; prefer `RUNTIME_SCHEMA_QUERY_SWEEP_READY`.
