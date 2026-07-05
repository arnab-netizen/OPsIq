# Test Evidence Ledger — Evidence Credibility Graph

**tsc:** 0 errors. **prisma validate:** valid. **governance:scan:strict:** 31 frozen, 0 new (green).

| Suite | Result |
|-------|--------|
| `owner-mode/evidence-credibility-graph.test.ts` (unit) | 12 pass — every signal (incl. reliable-with-caveat + outcome-gap disclosure), thresholds, reason codes, aggregation w/ staleness, determinism, DATA_INSUFFICIENT, gaming/profit/constraint linkage |
| `owner-mode/evidence-credibility-graph-simulation.db.test.ts` (DB) | 4 pass — laundry multi-actor: self-review is top concern via live now-view; unreliable (A) vs reliable-with-caveat (B) operators flagged by name; deterministic; clean workspace → DATA_INSUFFICIENT; cross-workspace isolation |
| Broad: owner-guidance + services/owner-guidance + owner-mode | **75 files / 632 tests pass** |

Also carried the PR #110 CI fix (governance strict scan 0-new). Full-repo suite not run end-to-end
(sharded to affected areas). Browser E2E untouched.

## Reproduce
```
source dbenv.sh
npx tsc --noEmit -p tsconfig.json
npm run governance:scan:strict
npx vitest run src/__tests__/owner-mode/evidence-credibility-graph.test.ts src/__tests__/owner-mode/evidence-credibility-graph-simulation.db.test.ts
```
