# Test Evidence Ledger — Constraint Engine

**tsc:** `npx tsc --noEmit` → 0 errors. **prisma validate:** valid.

| Suite | Result |
|-------|--------|
| `owner-mode/constraint-engine.test.ts` (unit) | 15 pass — every constraint type, CASH-outranks-all, DATA_INSUFFICIENT w/ missing data, determinism, opportunity gating |
| `owner-mode/constraint-engine-simulation.db.test.ts` (DB) | 3 pass — laundry complaints/rework → QUALITY binding constraint via live now-view; deterministic; clean workspace → DATA_INSUFFICIENT; cross-workspace isolation |
| `owner-mode/opportunity-decision-envelope.test.ts` | pass — envelope unchanged behaviour + constraint gating |
| Broad: owner-guidance + services/owner-guidance + owner-mode + owner-strategy | **89 files / 775 tests pass** |

Full-repo suite not run end-to-end this pass (sharded to the affected areas). Browser E2E untouched.

## Reproduce
```
source dbenv.sh
npx tsc --noEmit -p tsconfig.json
npx vitest run src/__tests__/owner-mode/constraint-engine.test.ts src/__tests__/owner-mode/constraint-engine-simulation.db.test.ts
```
