# P0 Fix: IQ-004 — Cross-Field Consistency Checks in Intake Validator

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** HOSTILE AUDIT REMEDIATION — Phase C, Slice 4  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Status:** IMPLEMENTED

---

## Finding Fixed

### IQ-004: Intake validator — no cross-field consistency check

**Risk:** Internally inconsistent financial data (wrong units, GST not removed, period mismatch) entered the evidence store and produced diagnoses from contradictory inputs. The output composer detected some inconsistencies post-diagnosis, but the intake validator accepted corrupt data without warning.

---

## Implementation

**File:** `src/domain/owner-intake/engine.ts`

Added a cross-field consistency pass after the GST normalisation pass. Checks run only when both `revenue` and `costOfGoodsOrServices` are present in the field spec (finance domain).

### Checks added

| Check | Threshold | Code | Rationale |
|-------|-----------|------|-----------|
| COGS vs revenue | `cogs > revenue × 3` | `inconsistent_data` | COGS more than 3× revenue almost certainly indicates wrong units or un-removed GST |
| Total costs vs revenue | `fixedCosts + variableCosts > revenue × 5` | `inconsistent_data` | Total operating cost 5× revenue indicates scale mismatch or unit error |
| Receivables vs revenue | `receivables > revenue × 2` | `inconsistent_data` | Receivables 2× periodic revenue indicates wrong period (e.g. annual vs monthly) |

All checks are **non-blocking** — they set `anyOptionalInvalid = true` (resulting in `validationStatus: "partial"`) rather than `anyRequiredBroken` (which would produce `"invalid"`). The owner sees the warning and can investigate before confirming.

### Why non-blocking

These thresholds are deliberately wide to avoid false positives in legitimate high-cost or high-receivables businesses. The checks are advisory signals, not hard rejections. The owner confirmation step is the final gate; these warnings give them information to confirm or re-upload.

---

## Acceptance Criteria

- [x] Finance CSV with `revenue: 1200000`, `costOfGoodsOrServices: 4000000` → error report includes `inconsistent_data` for `costOfGoodsOrServices`
- [x] Finance CSV with `revenue: 100000`, `fixedCosts: 200000`, `variableCosts: 400000` → error report includes `inconsistent_data` for `fixedCosts`
- [x] Finance CSV with `revenue: 100000`, `receivables: 300000` → error report includes `inconsistent_data` for `receivables`
- [x] Finance CSV with consistent figures → no `inconsistent_data` errors
- [x] Non-finance domains unaffected
- [x] TypeScript compiles clean
- [x] 335/335 simulation tests pass

---

## Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS |
| `npm run test:owner-real-world-simulation` | PASS (335/335) |
| Unsafe recommendations = 0 | N/A — intake validation only; no scoring change |
| Bad recommendations = 0 | N/A |

---

## Files Changed

- `src/domain/owner-intake/engine.ts` — cross-field consistency pass after GST normalisation
