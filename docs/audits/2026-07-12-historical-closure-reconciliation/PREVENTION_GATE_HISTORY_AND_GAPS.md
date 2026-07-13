# Prevention Gate History and Gaps
**Date:** 2026-07-12  
**Purpose:** Document when each prevention gate was created, what it covers, and where coverage gaps remain.

---

## Gate Timeline

| Gate Introduced | In Commit | Initially | Current Count |
|----------------|-----------|-----------|---------------|
| `governance:scan:strict` | Pre-A7.7 (Phase 6B era) | Unknown | In CI |
| `governance:scan:auth` | Pre-A7.7 (Phase 6B era) | Unknown | In CI |
| DC-01 through DC-15 | `9bb463ac` (A7.7 start) | 15 gates | 15 |
| DC-16, DC-17 | `034cab64` (A7.7 Batch 13) | 2 new | 17 |
| DC-18 | `59f7e246` (A7.7 Batch 18) | 1 new | **18 total** |

---

## Gate Detail

### Gates IN CI (enforced on every push)

| Gate | Script | Detected Pattern | Notes |
|------|--------|-----------------|-------|
| `withRequestContext` detection | `governance:scan:auth` | `export const.*= withRequestContext` | STALE: recommends `withEnforcementFull` (now also legacy) |
| `throw new Error("Unauthorized")` detection | `governance:scan:auth` | Raw unauthorized errors | Correct |
| `Response.json(401/403)` detection | `governance:scan:auth` | Direct response auth | Correct |
| `getSession()` in routes | `governance:scan:auth` | Direct session access | Correct |
| TypeScript type safety (DC-12) | `tsc --noEmit` in CI | `WorkspaceAction` union | Correct — catches unregistered permission strings |

### Gates NOT IN CI (local only — `npm run governance:scan:a77`)

| Gate | Pattern Detected | Correct? |
|------|-----------------|---------|
| DC-01 | New x-workspace-id header reads | Correct |
| DC-02 | New callers of context.ts::requireWorkspaceContext | Correct |
| DC-03 | New non-canonical auth wrappers in route files | Correct |
| DC-04 | Client-supplied actor identity fields persisted | Correct |
| DC-05 | Direct db.auditEvent.create outside allowlist | Correct |
| DC-06 | logAuditEvent callers (deleted module) | Correct |
| DC-07-SM | New state-transition maps outside authoritative files | Correct |
| DC-08 | Production stubs returning fabricated success | Correct |
| DC-09 | Route-to-domain business logic imports | Correct |
| DC-10 | Duplicate workspace resolver implementations | Correct |
| DC-11 | New enforceWorkspaceScoping implementations | Correct |
| DC-13 | Duplicate error sanitization exports | Correct |
| DC-14 | New emitAuditEvent re-implementations | Correct |
| DC-15 | proof/review body.requiredPermission reads | Correct |
| DC-16 | asVerifiedWorkspaceId() outside canonical enforcement | Correct |
| DC-17 | claimWorkspaceId + resolveWorkspaceTier in same file | Correct |
| DC-18 | Raw auditError in console.error | Correct |

---

## Stale Gate Problem: auth-governance-scanner.ts

The CI-wired `governance:scan:auth` has a critical staleness issue:

```
Line 33: message: 'withRequestContext is forbidden. Use withEnforcementFull.'
```

`withEnforcementFull` was the canonical auth wrapper during Phases 6A–6E. A7.7 established `withCanonicalEnforcement` as the new canonical standard and classified `withEnforcementFull` as a DC-03 violation (non-canonical wrapper).

**Effect:** CI tells a developer who uses `withRequestContext` to switch to `withEnforcementFull`. That creates a DC-03 violation. The developer is being guided by CI toward a pattern that A7.7 explicitly prohibits.

**Remediation instructions at bottom of scanner (line 133–136):**
```
1. Replace withRequestContext with withEnforcementFull
4. Replace direct getSession() with withAuth()
```

Both instructions are stale. The correct guidance:
1. Replace withRequestContext with `withCanonicalEnforcement`
4. Replace direct getSession() with `withCanonicalEnforcement`

---

## Coverage Gaps (No Gate Exists)

| Gap | Risk | Proposed Gate |
|-----|------|--------------|
| Post-mutation `emitAuditEvent(...).catch()` in write-path handlers | HIGH | DC-19: detect `.catch(` on `emitAuditEvent` in files with `db.*create`/`update`/`delete` calls |
| `withEnforcementFull` in route files | HIGH | Add to DC-03 or `governance:scan:auth` |
| Dead imports of auth/session functions | MEDIUM | Enable `noUnusedLocals` in tsconfig |
| `activation-context.ts::requireWorkspaceContext` as separate session-based resolver | MEDIUM | Add to DC-02 or DC-10 scope |
| Routes added after A7.7 migration without `withCanonicalEnforcement` | HIGH | Add check to `governance:scan:auth` or DC-03 |

---

## Allowlist Integrity

### DC-03 Allowlist (non-canonical route wrappers)

The DC-03 allowlist contains 50+ comment lines of the form:
```
// route-name — MIGRATED to withCanonicalEnforcement in A7.7
```

These are documentation comments, not actual allowlist entries. The only real allowlist entry is:
```
"src/middleware/workspace-enforcement.ts",
```

This is correct. The comment-only entries cannot be exploited — they are not actual file paths in the allowlist array.

### DC-05 Allowlist (direct db.auditEvent.create)

6 approved callers:
- `src/infra/audit.ts` (canonical writer)
- `src/generated/prisma/models/AuditEvent.ts` (generated)
- 4 service files with specific audit requirements

No unauthorized callers found. Allowlist is accurate.

### DC-02 Allowlist (context.ts callers)

Current allowlist contains comment-only entries (all MIGRATED) plus:
- `"src/services/workspace/context.ts"` — the file itself (prevents gate from flagging its own definition)

No unauthorized callers of the session-based `requireWorkspaceContext` remain. Allowlist is accurate.

---

## Recommended Gate Actions

**Priority 1 (before merge):** Wire `governance:scan:a77` into `.github/workflows/ci.yml`
- Add after `governance:scan:auth` step
- `continue-on-error: false`

**Priority 2 (concurrent with merge):** Update `auth-governance-scanner.ts`
- Change remediation text to recommend `withCanonicalEnforcement`
- Add detection of `withEnforcementFull` in routes

**Priority 3 (next build session):** Add DC-19 gate for post-mutation audit fail-open
- Pattern: `emitAuditEvent\([^)]*\)\.catch\(` in files containing `db\.\w+\.(create|update|updateMany|delete)\(`

**Priority 4 (tsconfig):** Enable `noUnusedLocals: true` in tsconfig.json
