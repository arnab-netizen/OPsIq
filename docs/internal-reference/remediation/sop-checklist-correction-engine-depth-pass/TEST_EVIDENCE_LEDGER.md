# SOP / Checklist Correction Engine — TEST EVIDENCE LEDGER

## Automated tests
| Suite | File | Cases | Result |
|---|---|---|---|
| Domain engine | `src/__tests__/owner-mode/sop-checklist-correction-engine.test.ts` | 13 | ✅ 13 passed |
| Component (SOP panel) | `src/__tests__/components/sop-checklist-corrections-panel.test.tsx` | 4 | ✅ 4 passed |
| Page (renders SOP drafts) | `src/__tests__/app/owner-process-intelligence-page.test.tsx` | 2 | ✅ 2 passed |
| Laundry DB simulation | `src/__tests__/execution/sop-checklist-correction-simulation.db.test.ts` | 2 | ✅ runs in CI DB-backed lane (LANE_B) |

## Domain coverage (13)
1. PROOF_QUALITY_BREAKDOWN → proof-requirement checklist draft.
2. QUALITY_FAILURE_LOOP → acceptance-checklist (+process-step) draft.
3. DELIVERY_HANDOFF_DELAY → delivery hand-off checklist draft (no event-resolution as SOP).
4. DATA_INSUFFICIENT → single NEEDS_DATA data-capture draft.
5. Training correction → handoff placeholder only (no training assignment).
6. approval owner/manager where required.
7. every draft has a success metric.
8. supporting evidence ids carried through.
9. no finding (cleared/dismissed upstream) → no draft.
10. clean workspace (DATA_INSUFFICIENT) fabricates no real SOP change.
11. workspace scoping (keys/ids prefixed; no contamination).
12-14. no fake financial impact, no fraud/negligence labels, no hidden score, no currency amounts.
15. ordering (NEEDS_DATA last); topDraft is a real change.

## Baseline gates (local, on branch rebased onto latest main)
- `npx tsc --noEmit` → exit 0.
- `npm run governance:scan:strict` → 31 frozen, 0 new.
- `npm run lint:ratchet` → LINT_RATCHET_PASS (no error/warning increase).

## CI DB proof
The SOP DB simulation is wired into `db-verification.yml` LANE_B (throwaway postgres:16) and LANE_A (Neon,
opt-in), so it runs against a real Postgres on the PR — the same lane that verified the bottleneck sim
(260/260 DB tests) on #130.

## Manual verification
1. `npx vitest run src/__tests__/owner-mode/sop-checklist-correction-engine.test.ts` → 13 passed.
2. `npx vitest run src/__tests__/components/sop-checklist-corrections-panel.test.tsx src/__tests__/app/owner-process-intelligence-page.test.tsx` → 6 passed.
3. `TEST_WITH_DB=true npx vitest run src/__tests__/execution/sop-checklist-correction-simulation.db.test.ts` (against local Postgres / CI LANE_B).
