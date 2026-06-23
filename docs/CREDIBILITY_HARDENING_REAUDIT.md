# Credibility Hardening Hostile Re-Audit — Phase H

**Date:** 2026-06-23  
**Scope:** Re-audit all Phase D–G changes for regressions or incomplete fixes

---

## Findings

### FIXED — RA-001 (P2): Near-zero `totalCosts` float could produce garbage `cashDaysOfCosts`
**File:** `src/domain/owner-finance/metrics.ts`  
**Fix:** Changed `costs <= 0` guard to `costs < 1`. Any total cost below 1 currency unit is treated as effectively zero and returns null rather than an astronomically large cash-coverage figure.

### FIXED (documentation) — RA-002 (P2): `FIN_OPP_BREAK_EVEN_RECOVERY` co-fires with `FIN_BELOW_BREAK_EVEN` risk
**File:** `src/domain/owner-finance/opportunity-rules.ts`  
**Fix:** Added explicit comment confirming this is an intentional dual-signal: risk explains WHAT is wrong; opportunity explains HOW to fix it. Not a bug.

### ACCEPTED — RA-003 (P1): `FIN_LOW_ABSOLUTE_CASH` not triggered when period dates are bad
When `periodDays()` returns null due to malformed `periodStart`/`periodEnd`, both `cashRunwayDays` and `cashDaysOfCosts` return null, and neither cash finding fires. This is the correct fail-closed behavior: without knowing the period length, we cannot assess daily cash consumption. The date validation finding (`FIN_INVALID_DATE` or similar) should surface this gap — confirmed: invalid dates produce null metrics, and the data-confidence score is penalized by the stale-date fix (CF-001) which now returns `true` for unparseable dates.

### ACCEPTED — RA-004 (P1): `updateMany` returning `count: 0` due to workspaceId mismatch gives misleading "already confirmed" error
The pre-check `findFirst(where: { id, workspaceId })` throws `NotFoundError` if the workspace doesn't match. By the time `updateMany` runs, workspace ownership is confirmed. The only path to `count === 0` in normal operation is a concurrent confirm — the error message is correct. A bug in the middleware that mutates `workspaceId` between the two DB calls would be a separate defect in the auth layer.

### ACCEPTED — RA-005 (P2): `isStaleSnapshot` signature accepts `string` but `Date` coerces incorrectly
`FinancialSnapshotInput.periodEnd` is typed as `string`, so all direct callers pass a string. TypeScript will catch any future `Date` pass at compile time. No runtime risk in current codebase.

---

## Gate Status

- `npx tsc --noEmit`: PASS
- Simulation tests (54/54): PASS
- No new P0/P1 defects introduced by Phase D–G changes

**PHASE_H_REAUDIT: PASS**
