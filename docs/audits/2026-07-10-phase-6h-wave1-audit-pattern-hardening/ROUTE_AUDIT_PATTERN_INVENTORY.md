# Route-Level logAuditEvent Audit Pattern Inventory
**Phase 6H Wave 1 — 2026-07-10**

## Scope

Audit of all route files that call `logAuditEvent` (legacy `src/services/audit/audit-log.ts`).
`emitAuditEvent` (`src/infra/audit.ts`) routes are out of scope — those already use the
hash-chained atomic emitter.

`logAuditEvent` internally catches and re-throws errors (`catch(e) { throw e; }`).
Route-level `.catch()` blocks therefore **swallow** the re-thrown error — silencing audit
failures on governed mutation paths. Routes calling `await logAuditEvent(...)` without
`.catch()` are already fail-closed at the route level.

---

## Classification Key

| Code | Meaning |
|------|---------|
| `FIX_NOW` | Governed mutation path; route-level `.catch()` swallows audit errors. Fixed in this wave. |
| `FALSE_POSITIVE` | Route calls `await logAuditEvent(...)` without `.catch()`; already fail-closed. No change needed. |
| `CONFIRMED_LOW / DEFER` | Read-only / monitoring path; best-effort audit is explicitly acceptable; `.catch()` intentional. |
| `DEFER_WITH_REASON` | Governed mutation but has a co-located separate defect that must be resolved first. |
| `DEFERRED_NEEDS_HARNESS` | Core engine; too complex for Wave 1; success path already fail-closed. |

---

## Route Inventory (14 files)

### 1. `src/app/api/decisions/intake/route.ts`

| Field | Value |
|-------|-------|
| Method | POST |
| Auth pattern | `withEnforcementFull` + `withAuth` (legacy) |
| Mutation | `db.operatorItem.create(...)` — persists pending decision |
| Audit call | `await logAuditEvent({...}).catch((e) => console.error(...))` |
| **Classification** | **FIX_NOW — FIXED in Phase 6H Wave 1** |
| Fix applied | Removed `.catch()` block; audit failure now propagates (fail-closed) |

### 2. `src/app/api/operator/route.ts` (POST)

| Field | Value |
|-------|-------|
| Method | POST |
| Auth pattern | `withCanonicalEnforcement` |
| Mutation | `updateItem(id, updatePayload, workspaceId)` — status transition with calibration, approval, outcome delta |
| Audit call | `await logAuditEvent({...}).catch((e) => logger.error(...))` — misleading comment said "fail-closed" but `.catch()` swallowed the error |
| **Classification** | **FIX_NOW — FIXED in Phase 6H Wave 1** |
| Fix applied | Removed `.catch()` block; added explicit `workspaceId` field; audit failure now propagates |

### 3. `src/app/api/operator/myday/route.ts`

| Field | Value |
|-------|-------|
| Method | GET |
| Auth pattern | `withCanonicalEnforcement` |
| Mutation | None — read-only `getMyDayItems()` |
| Audit call | `await logAuditEvent({...})` — **no `.catch()`** |
| **Classification** | **FALSE_POSITIVE** — already fail-closed; no change needed |

### 4. `src/app/api/calibration/route.ts`

| Field | Value |
|-------|-------|
| Method | GET |
| Auth pattern | `withEnforcement` (basic) |
| Mutation | None — read-only `computeCalibration(items)` from in-memory store |
| Audit call | `await logAuditEvent({...})` — **no `.catch()`** |
| **Classification** | **FALSE_POSITIVE** — already fail-closed; no change needed |

### 5. `src/app/api/entity/route.ts` (POST)

| Field | Value |
|-------|-------|
| Method | POST |
| Auth pattern | `withCanonicalEnforcement` |
| Mutation | `createEntity(entity)` — in-memory store only (no DB persistence) |
| Audit call | `await logAuditEvent({...})` — **no `.catch()`**; code comment explicitly says "fail-closed if audit fails" |
| **Classification** | **FALSE_POSITIVE** — already fail-closed; no change needed |

### 6. `src/app/api/governance/metrics/route.ts`

| Field | Value |
|-------|-------|
| Method | GET |
| Auth pattern | `withEnforcementFull` + `withAuth` (legacy) |
| Mutation | None — `calculateGovernanceMetrics(...)` read-only |
| Audit call | `.catch()` present; comment: "Log but don't fail on audit error - observability only" |
| **Classification** | **CONFIRMED_LOW / DEFER** — monitoring read-only; best-effort audit is appropriate |

### 7. `src/app/api/governance/alerts/route.ts`

| Field | Value |
|-------|-------|
| Method | GET |
| Auth pattern | `withCanonicalEnforcement` |
| Mutation | None — evaluates governance alerts |
| Audit call | `.catch()` present; comment: "Log but don't fail on audit error - observability only" |
| **Classification** | **CONFIRMED_LOW / DEFER** — monitoring read-only; best-effort audit is appropriate |

### 8. `src/app/api/metrics/control-effectiveness/route.ts`

| Field | Value |
|-------|-------|
| Method | GET |
| Auth pattern | `withEnforcementFull` + `withAuth` (legacy); `withAuth()` called twice (separate defect) |
| Mutation | None — queries DB for decisions, computes metrics |
| Audit call | `.catch()` present; comment: "Log but don't fail on audit error - observability only" |
| **Classification** | **CONFIRMED_LOW / DEFER** — monitoring read-only; best-effort audit is appropriate |

### 9. `src/app/api/metrics/decision-latency/route.ts`

| Field | Value |
|-------|-------|
| Method | GET |
| Auth pattern | `withEnforcementFull` + `withAuth` (legacy); `withAuth()` called twice (separate defect) |
| Mutation | None — queries DB for decisions, computes latency metrics |
| Audit call | `.catch()` present; comment: "Log but don't fail on audit error - observability only" |
| **Classification** | **CONFIRMED_LOW / DEFER** — monitoring read-only; best-effort audit is appropriate |

### 10. `src/app/api/observability/summary/route.ts`

| Field | Value |
|-------|-------|
| Method | GET |
| Auth pattern | `withCanonicalEnforcement` |
| Mutation | None — `getObservabilitySummary()` read-only |
| Audit call | `.catch()` present; comment: "Log but don't fail on audit error - observability only" |
| **Classification** | **CONFIRMED_LOW / DEFER** — monitoring read-only; best-effort audit is appropriate |

### 11. `src/app/api/value/route.ts`

| Field | Value |
|-------|-------|
| Method | GET |
| Auth pattern | `withCanonicalEnforcement` |
| Mutation | None — `calculateValue(items)` from in-memory store |
| Audit call | `.catch()` present; comment: "Log but don't fail on audit error - observability only" |
| **Classification** | **CONFIRMED_LOW / DEFER** — monitoring read-only; best-effort audit is appropriate |

### 12. `src/app/api/scenario/route.ts`

| Field | Value |
|-------|-------|
| Method | POST |
| Auth pattern | `withCanonicalEnforcement` |
| Mutation | None — `runScenario(...)` pure function, no DB persistence |
| Audit call | `.catch()` present; entityId uses `randomUUID()` (no DB entity created) |
| **Classification** | **CONFIRMED_LOW / DEFER** — analysis-only, no DB mutation |

### 13. `src/app/api/decisions/[decisionId]/evaluate/route.ts`

| Field | Value |
|-------|-------|
| Method | POST |
| Auth pattern | `withEnforcementFull` + `withAuth` (legacy) |
| Mutation | `db.operatorItem.update(...)` — governed update |
| Audit call | `.catch()` present — swallows audit errors |
| Additional defect | Hardcoded `fetch("http://localhost:3000/api/run", ...)` — would fail in non-localhost environments |
| **Classification** | **DEFER_WITH_REASON** — governed mutation but hardcoded localhost defect must be resolved in a dedicated fix before audio pattern can be safely changed; touching both in Wave 1 is too risky |

### 14. `src/app/api/run/route.ts`

| Field | Value |
|-------|-------|
| Method | POST |
| Auth pattern | `withEnforcementFull` + `withAuth` (legacy) |
| Mutation | Core decision engine — multiple paths, multiple audit events |
| Audit calls | Mixed: error paths (AUTH_FAILED, PERMISSION_DENIED, INPUT_VALIDATION_FAILED, etc.) use `.catch()` — intentionally best-effort for rejected/blocked decisions. Success path (`RUN_APPROVED`) explicitly re-throws the audit error: `.catch((e) => { logger.error(...); throw e; })` — already fail-closed on the governed success path |
| **Classification** | **DEFERRED_NEEDS_HARNESS** — complex ~1100-line engine; success path already fail-closed; error-path audits are best-effort for non-executed decisions; Wave 1 scope does not warrant the risk |

---

## Summary

| Classification | Count | Routes |
|----------------|-------|--------|
| FIX_NOW — Fixed | 2 | `decisions/intake`, `operator` POST |
| FALSE_POSITIVE | 3 | `operator/myday`, `calibration`, `entity` POST |
| CONFIRMED_LOW / DEFER | 7 | `governance/metrics`, `governance/alerts`, `metrics/control-effectiveness`, `metrics/decision-latency`, `observability/summary`, `value`, `scenario` |
| DEFER_WITH_REASON | 1 | `decisions/[decisionId]/evaluate` |
| DEFERRED_NEEDS_HARNESS | 1 | `run/route.ts` |
| **Total** | **14** | |
