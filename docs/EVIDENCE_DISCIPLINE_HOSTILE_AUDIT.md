# Evidence Discipline Hostile Audit — Phase E

**Date:** 2026-06-23  
**Verdict:** 3 P1 fixed, 1 P2 fixed, 2 P2 accepted

---

## Findings

### FIXED — ED-001 (P1): FIN_OPP_MARGIN_IMPROVEMENT fired on negative-margin businesses
**Files:** `src/domain/owner-finance/opportunity-rules.ts`  
**Fix:** Added `m.netMarginPct >= 0` guard. A business with negative margin already gets `FIN_NEGATIVE_NET_MARGIN` (risk critical) and `FIN_OPP_BREAK_EVEN_RECOVERY`. Adding a low-urgency "room to improve" on the same metric is contradictory triage.

### FIXED — ED-002 (P1): FIN_OPP_RECEIVABLES_COLLECTION fired on any positive receivables
**Files:** `src/domain/owner-finance/opportunity-rules.ts`  
**Fix:** Added threshold gate: `receivablesPressurePct > t.highReceivablesPressurePct / 2`. Normal net-30 receivables do not constitute a collection problem.

### FIXED — ED-003 (P1): FIN_OPP_LEAKAGE_REDUCTION fired on any non-zero leakage
**Files:** `src/domain/owner-finance/opportunity-rules.ts`  
**Fix:** Added `costLeakageRatioPct >= 2` threshold. Sub-2% leakage is within normal operating tolerance.

### FIXED — ED-004 (P2): No cash risk when profitable but cash-starved
**Files:** `src/domain/owner-finance/types.ts`, `src/domain/owner-finance/metrics.ts`, `src/domain/owner-finance/risk-rules.ts`  
**Fix:** Added `cashDaysOfCosts` metric (cash / daily total cost, profitability-independent). Added `FIN_LOW_ABSOLUTE_CASH` risk finding when `cashDaysOfCosts < 14` and `cashRunwayDays` did not already fire (avoids duplicate). Severity: critical when < 7 days, high otherwise.

### ACCEPTED — ED-005 (P2): FIN_OPP_DATA_QUALITY fires on virtually every snapshot
Every snapshot with at least one missing important field triggers this. Accepted: the finding is genuinely actionable (supply missing data), has low urgency (20), and the evidence string lists which criticals are missing when any are absent.

### ACCEPTED — ED-006 (P2): Non-finance domain `evidenceRationale` static strings
Cashflow, sales, operations, sop, marketing, strategy findings have static evidence strings derived from their own domain rule files. Those are outside the finance-domain scope of this audit.

---

## Gate Status

- `npx tsc --noEmit`: PASS
- Simulation tests (54/54): PASS
- Unsafe recommendations: 0
- Bad recommendations: eliminated 3 false-positive opportunity findings

**PHASE_E_EVIDENCE_AUDIT: PASS**
