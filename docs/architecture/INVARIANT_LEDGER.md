# OpsIQ Architectural Invariant Ledger

**Last updated:** 2026-07-12 (Stage A7.6)  
**Purpose:** Single source of truth for all architectural invariants. Every invariant must have a status, evidence, and a permanent prevention mechanism.

---

## Invariant Index

| # | Invariant | Domain | Status | Last Audited |
|---|-----------|--------|--------|-------------|
| I1 | Workspace-scoped operations use only `ctx.verifiedWorkspaceId` | Auth / Isolation | PARTIALLY CLOSED | 2026-07-12 |
| I2 | Critical mutations are idempotent or replay-protected | Data integrity | NOT VIOLATED | 2026-07-12 |
| I3 | All material mutations emit audit events via `emitAuditEvent` | Audit | DEFERRED | 2026-07-12 |
| I4 | Governed records use CAS locking for concurrent updates | Data integrity | NOT VIOLATED | 2026-07-12 |
| I5 | All protected actions enforce capability checks server-side | Auth | CLOSED (DC-A7.6-I5-DC06) | 2026-07-12 |
| I6 | No duplicate business logic in independent locations | Architecture | DEFERRED (I13) | 2026-07-12 |
| I7 | No stub or fake implementations in production paths | Quality | NOT VIOLATED | 2026-07-12 |
| I8 | Tests do not pass by asserting incorrect values | Testing | NOT VIOLATED | 2026-07-12 |
| I9 | No dead code or unreachable exports in critical modules | Quality | NOT AUDITED | — |
| I10 | No circular dependency chains in domain layer | Architecture | NOT AUDITED | — |
| I11 | No duplicate service implementations | Architecture | DEFERRED (I20) | 2026-07-12 |
| I12 | Single canonical auth pattern in all production routes | Auth | DEFERRED | 2026-07-12 |
| I13 | Single canonical state machine per entity type | Architecture | DEFERRED | 2026-07-12 |
| I14 | No duplicate workflow definitions | Architecture | NOT AUDITED | — |
| I15 | No duplicate validation schemas for the same input | Architecture | NOT AUDITED | — |
| I16 | Single canonical audit writing function | Audit | DEFERRED | 2026-07-12 |
| I17 | Single canonical recommendation engine | Architecture | NOT AUDITED | — |
| I18 | Single canonical diagnosis logic per entity | Architecture | NOT AUDITED | — |
| I19 | Single canonical opportunity scoring function | Architecture | NOT AUDITED | — |
| I20 | Single canonical workspace resolution function | Auth / Isolation | DEFERRED | 2026-07-12 |

---

## I1 — Workspace Isolation

**Rule:** Every workspace-scoped operation must obtain the workspace ID exclusively from `ctx.verifiedWorkspaceId` (for routes using `withCanonicalEnforcement`) or from a verified DB-backed resolver (for non-canonical routes). Actor identity must come exclusively from `ctx.verifiedActorId`.

**Violation patterns:**
- I1A: `ctx.request!.headers.get("x-workspace-id") || ""` — forgeable HTTP header
- I1B: `requireWorkspaceContext()` from `src/services/workspace/context.ts` — returns `session.user.id`, not workspace ID
- I1C: `body.rejectedBy` / `body.approvedBy` / similar actor fields in Zod schemas

**Status:** PARTIALLY CLOSED  
- I1A: 3/12 fixed (remaining 9 blocked behind I12 migration)
- I1B: 2/7 fixed (remaining 5 blocked behind I12 + I20)
- I1C: 7/7 CLOSED

**Prevention:** ESLint rule blocking `headers.get("x-workspace-id")` in files importing `withCanonicalEnforcement`. PR checklist item. See DC-A7.6-I1 in DEFECT_CLASS_MATRIX.md.

---

## I3 — Audit Integrity

**Rule:** All material mutations must emit an audit event via `emitAuditEvent` from `src/infra/audit.ts`. Direct `db.auditEvent.create` calls and use of `logAuditEvent` from `audit-log.ts` are prohibited.

**Status:** DEFERRED  
20+ direct bypass sites found. Two competing audit writers active. See DC-A7.6-I16.

**Prevention:** ESLint no-restricted-syntax on `auditEvent.create`. Delete `logAuditEvent`.

---

## I5 — Capability Enforcement

**Rule:** All protected actions must enforce capability checks server-side. Capability strings passed to `hasPermission()` must exist in the permission map — unregistered strings silently return `false` for all roles, making actions permanently inaccessible.

**Status:** CLOSED (DC-A7.6-I5-DC06)  
- Added `execute`, `record_outcome`, `fail_decision`, `verify_outcome` to permission map in `src/middleware/workspace-enforcement.ts`
- Introduced `WorkspaceAction` TypeScript union type — future callers with unregistered strings fail at compile time
- 4 decision routes restored: execute, record-outcome, fail, verify

**Prevention:** `WorkspaceAction` union type in `workspace-enforcement.ts`. TypeScript compiler enforces exhaustiveness.

---

## I12 — Auth Pattern Uniformity

**Rule:** All production routes must use `withCanonicalEnforcement`. `enforceWorkspaceScoping` and `withAuth`/`withEnforcementFull` are deprecated.

**Status:** DEFERRED  
274 canonical / 39 enforceWorkspaceScoping / 40+ withAuth. Migration required.

**Prevention:** ESLint no-restricted-imports. `@deprecated` JSDoc on legacy wrappers.

---

## I13 — State Machine Centralization

**Rule:** All entity state transition logic must be defined in `src/domain/state-machine-registry.ts`. No local `ALLOWED_TRANSITIONS`, `canTransitionTo`, or `validTransitions` constants outside that file.

**Status:** DEFERRED  
9 independent implementations found across 9 files.

**Prevention:** ESLint rule. Central registry file (not yet created).

---

## I16 — Audit Write Centralization

**Rule:** `emitAuditEvent` (hash-chained) is the only permitted audit write path. `logAuditEvent` and direct Prisma calls to `auditEvent` table are prohibited.

**Status:** DEFERRED  
2 competing writers. 20+ direct bypasses.

**Prevention:** Delete `logAuditEvent`. ESLint rule blocking `auditEvent.create` outside `src/infra/audit.ts`.

---

## I20 — Workspace Resolution Centralization

**Rule:** Workspace ID resolution must use either `ctx.verifiedWorkspaceId` (canonical routes) or `resolveWorkspaceMembership` from `src/services/workspace/activation-context.ts` (non-canonical). `requireWorkspaceContext` from `src/services/workspace/context.ts` is prohibited (it returns `session.user.id`).

**Status:** DEFERRED  
`context.ts::requireWorkspaceContext` is actively used by 7 production callers. It must be deleted after all callers migrate.

**Prevention:** Add `@deprecated` to `context.ts` immediately. Rename `activation-context.ts` function to avoid name collision after context.ts is deleted.

---

## Audit History

| Stage | Date | Invariants Audited | Fixed | Deferred |
|-------|------|-------------------|-------|---------|
| A7.5 | 2026-07-11 | I1–I10 | I1 (partial), I3 (partial) | I3, I6–I10 |
| A7.6 | 2026-07-12 | I1–I20 | I1C (7/7), I1A (3/12), I1B (2/7) | I3, I6, I9–I20 |
