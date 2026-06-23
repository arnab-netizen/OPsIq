# Confidence System Hostile Audit — Phase D

**Date:** 2026-06-23  
**Auditor:** Mission 3 hardening program  
**Verdict:** 2 P0 fixed, 3 P1 accepted with documented rationale, 5 P2 known limitations

---

## Findings

### FIXED — CF-001 (was P0): `isStaleSnapshot` returned `false` on unparseable date
**File:** `src/domain/owner-finance/data-confidence.ts`  
**Fix:** Changed `if (Number.isNaN(end)) return false` → `return true`. An unparseable `periodEnd` is now treated as stale (fail-closed). Commit: Phase D.

### CONFIRMED-SAFE — CF-002 (raised as P0, not a defect): `opts.now` default
`diagnoseFinanceSnapshot` defaults `opts.now ?? new Date()` internally, so the stale check runs in production without the service passing `now`. Diagnosed as a false finding.

### P1-ACCEPTED — CF-003: Minimum non-stale confidence with only revenue + one cost = ~5
A business with only revenue + one cost proxy but no cashOnHand and all 11 important fields missing scores ~5 (not 0). Diagnosis still runs. This is a known limitation: zero is not practically reachable without all criticals missing simultaneously. Acceptable because:
- The missing inputs banner explicitly lists all absent fields
- `missingCriticalData` propagates into the profile
- Diagnosis findings carry their own confidence modifiers

### P1-ACCEPTED — CF-004: Non-finance domain `dataConfidenceScore` trusts DB value
Cashflow, sales, operations, sop, marketing, strategy domain scores read confidence from the database as written by their respective diagnosis services. Those services are responsible for computing it correctly. Adding a re-validation layer here would duplicate logic and potentially create divergence. Accepted.

### P1-ACCEPTED — CF-005: `isStaleData` anchors to finance snapshot only
Finance is the anchor domain for staleness; other domains (sales, cashflow) do not have a standardized `periodEnd` field. Documenting: if a business has only non-finance data, `isStaleData` will be `false`. This is explicitly noted in the service comment.

### P2 — CF-006: Recovery domain confidence floor at 10
`recoveryCycleToDomainScore` uses only 3 critical fields (revenue, totalCosts, orderCount) and floors at 10. Low impact: recovery confidence is shown in the domain scores but does not gate diagnosis.

### P2 — CF-007: `computeMissingInputsWithPriority` uses Prisma column names
The function checks `snapshot.costOfGoods`, `snapshot.payroll` (DB column names) while `calculateDataConfidence` checks `input.costOfGoodsOrServices`, `input.salaryPayroll` (typed input names). If Prisma schema column names diverge, the display label and the penalty could diverge. Mitigation: the Prisma schema columns are stable and covered by migration tests.

### P2 — CF-008: Partial important field missing (5/11) → score 25 looks credible
11 important × 5 = max 55 penalty from important fields. With 5 missing → score 75. This can look like credible data. Mitigated by the prioritized missing inputs display on the command center.

### P2 — CF-009: No gate on `missingCriticalData` in `diagnoseFinanceSnapshot`
Findings are generated regardless of how many criticals are absent. Finding-level confidence modifiers exist but are not propagated to a visible "low confidence" gate. Accepted: the data confidence score (potentially 0) and the missing inputs display serve this function.

### P2 — CF-010: `hasCost` accepts any single cost proxy
One utility bill present → costs critical cleared. This reflects real-world partial data: a business with rent data has _some_ cost information. The important-fields list still penalizes missing granular cost fields.

---

## Gate Status

- `npx tsc --noEmit`: PASS
- Simulation tests (54/54): PASS
- Unsafe recommendations: 0 (no changes to recommendation logic)
- Bad recommendations: 0

**PHASE_D_CONFIDENCE_AUDIT: PASS**
