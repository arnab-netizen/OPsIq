# P1 Fix: MI-001 — Missing Inputs with Priority Tier

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** CREDIBILITY HARDENING — Phase C, Slice 4  
**Status:** IMPLEMENTED

---

## Finding Fixed

### MI-001: Missing inputs not categorised by priority

`missingCriticalFinanceInputs()` returned a flat string array with no classification. Every missing field (revenue vs. refundReworkCost) was displayed identically on the command center, giving no signal about which items were blocking diagnosis vs. reducing accuracy.

---

## Implementation

### 1. `src/domain/owner-finance/data-confidence.ts`

Added:
- `MissingInputPriority = "CRITICAL" | "IMPORTANT"` type
- `MissingInput = { field: string; priority: MissingInputPriority }` interface
- `missingInputPriority(field: string)` — classifies a field name
- `computeMissingInputsWithPriority(snapshot)` — scans a raw snapshot row and returns all missing inputs (critical + important) with priority labels

Priority mapping:
- **CRITICAL**: `revenue`, `costs`, `cashOnHand` — diagnosis is unreliable without these
- **IMPORTANT**: `costOfGoods`, `fixedCosts`, `payroll`, `debtPayments`, `receivables`, `payables`, `ownerWithdrawals`, `orderCount`, `customerCount`, `discountAmount`, `refundReworkCost` — diagnosis is less accurate without these

### 2. `src/services/owner-condition/business-condition.service.ts`

- Added `missingInputsWithPriority: MissingInput[]` to `BusinessConditionResult`
- Calls `computeMissingInputsWithPriority(latestFinanceSnapshot)` using the already-fetched snapshot row — no additional DB query
- Passes through all return paths (no-business, no-data, profile-ready)

### 3. `src/app/(authenticated)/owner/page.tsx`

Replaced the flat "Missing critical data: ..." text with a tagged list:
```
Missing finance inputs:
[CRITICAL] revenue  [CRITICAL] cashOnHand  [IMPORTANT] payroll  ...
Add missing data →
```

CRITICAL items show a destructive badge. IMPORTANT items show a warning badge.

---

## Acceptance Criteria

- [x] `computeMissingInputsWithPriority()` returns CRITICAL for revenue/costs/cashOnHand
- [x] `computeMissingInputsWithPriority()` returns IMPORTANT for 11 supporting fields
- [x] `BusinessConditionResult` exposes `missingInputsWithPriority`
- [x] Command center shows each missing field with CRITICAL/IMPORTANT badge
- [x] No additional DB queries (snapshot already fetched)
- [x] TypeScript compiles clean
- [x] 54/54 simulation tests pass

---

## Files Changed

- `src/domain/owner-finance/data-confidence.ts` — added `MissingInputPriority`, `MissingInput`, `missingInputPriority()`, `computeMissingInputsWithPriority()`
- `src/services/owner-condition/business-condition.service.ts` — added `missingInputsWithPriority` to result; computes from snapshot
- `src/app/(authenticated)/owner/page.tsx` — renders prioritised missing input list with badges
