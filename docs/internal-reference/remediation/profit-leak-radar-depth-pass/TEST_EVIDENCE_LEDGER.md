# Test Evidence Ledger — Profit-Leak Radar

**tsc:** 0 errors. **prisma validate:** valid.

| Suite | Result |
|-------|--------|
| `owner-mode/profit-leak-radar.test.ts` (unit) | 16 pass — every leak type, real-discount-figure (no fabricated saving), missing-margin NEEDS_DATA, CASH_RISK_GROWTH outranks, DATA_INSUFFICIENT, determinism, constraint linkage, opportunity gating |
| `owner-mode/profit-leak-radar-simulation.db.test.ts` (DB) | 3 pass — laundry discount-abuse -> DISCOUNT_LEAK via live now-view with real 5000 figure, owner-gated; deterministic; clean workspace -> DATA_INSUFFICIENT; cross-workspace isolation |
| Broad: owner-guidance + services/owner-guidance + owner-mode + owner-strategy | **91 files / 794 tests pass** |

Full-repo suite not run end-to-end (sharded to affected areas). Browser E2E untouched.

## Reproduce
```
source dbenv.sh
npx tsc --noEmit -p tsconfig.json
npx vitest run src/__tests__/owner-mode/profit-leak-radar.test.ts src/__tests__/owner-mode/profit-leak-radar-simulation.db.test.ts
```
