# Test Evidence Ledger — Anti-Gaming Analytics

**tsc:** 0 errors. **prisma validate:** valid.

| Suite | Result |
|-------|--------|
| `owner-mode/anti-gaming-analytics.test.ts` (unit) | 12 pass — every detectable pattern, threshold honesty (1 event != pattern), reason codes / no hidden score, proof-event aggregation, determinism, DATA_INSUFFICIENT, constraint/profit-leak linkage |
| `owner-mode/anti-gaming-analytics-simulation.db.test.ts` (DB) | 4 pass — laundry multi-actor (owner+manager+2 operators): self-review is top signal via live now-view; weak/reused operator flagged by name; deterministic; clean workspace -> DATA_INSUFFICIENT; cross-workspace isolation |
| Broad: owner-guidance + services/owner-guidance + owner-mode + owner-strategy | **93 files / 810 tests pass** |

Full-repo suite not run end-to-end (sharded to affected areas). Browser E2E untouched.

## Reproduce
```
source dbenv.sh
npx tsc --noEmit -p tsconfig.json
npx vitest run src/__tests__/owner-mode/anti-gaming-analytics.test.ts src/__tests__/owner-mode/anti-gaming-analytics-simulation.db.test.ts
```
