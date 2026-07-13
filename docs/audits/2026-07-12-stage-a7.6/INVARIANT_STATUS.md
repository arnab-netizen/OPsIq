# A7.6 Invariant Status

**Audit date:** 2026-07-12  
**Branch:** `claude/phase-6f-governance-findings-5gkiec`

---

## Invariant Definitions and Status

| # | Invariant | Status | Evidence |
|---|-----------|--------|---------|
| I1 | Every workspace-scoped operation uses `ctx.verifiedWorkspaceId` exclusively | PARTIALLY CLOSED | 12 fixed; 14 deferred behind I12 migration |
| I2 | All critical mutations are idempotent or replay-protected | NOT VIOLATED in canonical routes | No new violations found |
| I3 | Every material mutation emits an audit event via `emitAuditEvent` | DEFERRED (I16) | 20+ direct bypass sites documented |
| I4 | Governed records use CAS locking for concurrent updates | NOT VIOLATED in canonical routes | Existing CAS patterns intact |
| I5 | All protected actions enforce capability checks server-side | CLOSED | DC-A7.6-I5-DC06: 4 missing permission strings added; WorkspaceAction union type prevents regression |
| I6 | No duplicate business logic in independent locations | DEFERRED (I13) | 9 state machines documented |
| I7 | No stub or fake implementations in production paths | NOT VIOLATED | No stubs found in canonical routes |
| I8 | Tests do not pass by asserting incorrect values | NOT VIOLATED | No new test integrity issues found |
| I9 | No dead code or unreachable exports in critical modules | NOT INVESTIGATED | Deferred to dedicated dead-code pass |
| I10 | No circular dependency chains in domain layer | NOT INVESTIGATED | Deferred to dedicated dependency pass |
| I11 | No duplicate implementations of the same service | DEFERRED (I20) | 3 requireWorkspaceContext impls documented |
| I12 | Single canonical auth pattern in all production routes | DEFERRED | 79 non-canonical routes documented |
| I13 | Single canonical state machine per entity type | DEFERRED | 9 implementations documented |
| I14 | No duplicate workflow definitions | NOT INVESTIGATED | Deferred |
| I15 | No duplicate validation schemas for the same input | NOT INVESTIGATED | Deferred |
| I16 | Single canonical audit writing function | DEFERRED | 2 writers + 20+ direct bypasses documented |
| I17 | Single canonical recommendation engine | NOT INVESTIGATED | Deferred |
| I18 | Single canonical diagnosis logic per entity | NOT INVESTIGATED | Deferred |
| I19 | Single canonical opportunity scoring function | NOT INVESTIGATED | Deferred |
| I20 | Single canonical workspace resolution function | DEFERRED | 3 competing implementations, root cause identified |

---

## Invariants Fully Closed This Phase

| # | Evidence |
|---|---------|
| I1 (partial) | All `withCanonicalEnforcement` routes now use `ctx.verifiedWorkspaceId` for workspace and `ctx.verifiedActorId` for actor — I1C 100% closed, I1A/B partially closed |
| I5 | DC-A7.6-I5-DC06: 4 missing permission strings (`execute`, `record_outcome`, `fail_decision`, `verify_outcome`) added to `hasPermission()` in `workspace-enforcement.ts`. `WorkspaceAction` union type added as compile-time prevention. 4 permanently-inaccessible decision routes restored. |

---

## Invariants Pending Investigation (Not Violated, Not Audited)

I9, I10, I14, I15, I17, I18, I19 were not fully audited in this phase. No evidence of violations was found in the routes examined, but a systematic scan was not performed. These are deferred to a dedicated pass.

---

## Deferred Invariant Work

**I3 / I16 (Audit integrity):**  
Requires mapping all 20+ direct `db.auditEvent.create` callers and migrating each to `emitAuditEvent`. Estimated 20+ service files, 40+ call sites. Separate PR required.

**I6 / I13 (State machine deduplication):**  
Requires designing a unified `StateTransitionRegistry` interface and migrating all 9 implementations. Domain-layer refactor, estimated 9 files.

**I11 / I20 (Workspace resolution deduplication):**  
Requires completing I12 migration first (so no `withAuth` routes remain that need context.ts), then deleting context.ts. Cannot be done without first migrating 79 routes.

**I12 (Auth pattern unification):**  
39 `enforceWorkspaceScoping` + 40+ `withAuth` routes need migration to `withCanonicalEnforcement`. Each requires capability analysis. Estimated 80 files, requires full regression test.
