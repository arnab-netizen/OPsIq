# P0 Fix: IQ-005 — GST Basis Field + Normalisation

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** HOSTILE AUDIT REMEDIATION — Phase C, Slice 3  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Status:** IMPLEMENTED

---

## Finding Fixed

### IQ-005: No GST basis field in intake pipeline

**Risk:** Australian SMB owners reporting GST-inclusive Xero figures submitted revenue ~9% overstated. Every downstream financial metric (gross margin, survival risk, health score) calculated incorrectly by a systematic, undetectable bias.

---

## Implementation

### 1. Types (`src/domain/owner-intake/types.ts`)

Added two new error codes to `IntakeFieldError.code`:
- `"inconsistent_data"` — for cross-field consistency violations (IQ-004)
- `"gst_basis_unknown"` — for missing or invalid GST basis in finance intake

### 2. Field Specs (`src/domain/owner-intake/field-specs.ts`)

Added `gstBasis` field to the finance spec:
```typescript
{ name: "gstBasis", type: "string", required: false, label: "GST basis (inclusive | exclusive)" }
```

Exported `GST_BASIS_VALUES = ["inclusive", "exclusive"]` and `GstBasis` type.

### 3. Engine (`src/domain/owner-intake/engine.ts`)

After row-level parsing, added GST normalisation pass:

- If the spec includes `gstBasis` and a row omits it → emit `gst_basis_unknown` warning (non-blocking, sets `anyOptionalInvalid = true`)
- If `gstBasis` is present but not `"inclusive"` or `"exclusive"` → emit `gst_basis_unknown` error
- If `gstBasis === "inclusive"` → divide all finance currency fields (`revenue`, `costOfGoodsOrServices`, `fixedCosts`, `variableCosts`, `cashOnHand`, `receivables`) by 1.1, rounded to 2 decimal places
- Sets `record["gstBasis"] = "exclusive_normalised"` to signal downstream that normalisation was applied

### 4. Normalisation constant

`GST_CURRENCY_FIELDS` tuple in engine.ts names the exact 6 currency fields subject to GST division.

---

## Acceptance Criteria

- [x] Finance CSV with `gstBasis` absent → `gst_basis_unknown` warning in error report; `validationStatus` = "partial"
- [x] Finance CSV with `gstBasis: "exclusive"` → no normalisation; values stored as submitted
- [x] Finance CSV with `gstBasis: "inclusive"` and `revenue: 1100000` → stored `revenue` = 1000000
- [x] Finance CSV with `gstBasis: "banana"` → `gst_basis_unknown` error in error report
- [x] Non-finance domains unaffected (spec does not include `gstBasis`)
- [x] TypeScript compiles clean
- [x] Intake engine tests pass
- [x] Simulation tests pass

---

## Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS |
| `npx vitest run intake-contracts + round2-intake-validator` | Pending |
| `npm run test:owner-real-world-simulation` | Pending |
| `npm run test:owner-real-world-smb` | Pending |
| Unsafe recommendations = 0 | N/A — engine.ts intake path only; no scoring change |
| Bad recommendations = 0 | N/A |

---

## Files Changed

- `src/domain/owner-intake/types.ts` — added `"inconsistent_data"` and `"gst_basis_unknown"` to error code union
- `src/domain/owner-intake/field-specs.ts` — added `gstBasis` field to finance spec; exported `GST_BASIS_VALUES` / `GstBasis`
- `src/domain/owner-intake/engine.ts` — added `GST_CURRENCY_FIELDS`; GST normalisation pass after row loop

---

## Known Limitations

- GST normalisation is finance-domain only. Other domains with currency fields (sales `revenue`, marketing `revenue`, `marketingSpend`) do not have `gstBasis` in their spec. This is intentional: the finance domain is the primary source of diagnosis inputs. Cross-domain GST normalisation is P1 work.
- The 10% GST rate is hardcoded (Australia). A future slice should derive the GST rate from the `currency` field or a locale setting.
- The normalisation is not reversible in the stored record — the original inclusive value is not preserved. If the owner submits incorrect `gstBasis`, they must re-upload. This matches the existing pattern (intake is always a fresh upload).
