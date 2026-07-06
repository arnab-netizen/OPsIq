# SOP / Training Effectiveness Loop — TEST EVIDENCE LEDGER

## Automated tests
| Suite | File | Cases | Result |
|---|---|---|---|
| Domain engine | `src/__tests__/owner-mode/sop-training-effectiveness-loop.test.ts` | 14 | ✅ 14 passed |
| Component (effectiveness panel) | `src/__tests__/components/effectiveness-panel.test.tsx` | 4 | ✅ 4 passed |
| Page (renders effectiveness) | `src/__tests__/app/owner-process-intelligence-page.test.tsx` | 2 | ✅ 2 passed |
| Laundry DB simulation | `src/__tests__/execution/sop-training-effectiveness-simulation.db.test.ts` | 2 | ✅ runs in CI DB-backed lane (LANE_B) |

## Domain coverage (16 required assertions)
reduced complaints→IMPROVED; same→UNCHANGED; increased→WORSENED; reduced weak proof→IMPROVED; reduced
overdue escalation→IMPROVED; missing baseline→INSUFFICIENT_DATA; window not elapsed→INSUFFICIENT_DATA;
proposal-only not scored as implemented; below-threshold not counted as failure; new evidence carried
through; clean workspace no evaluation; workspace scoping; no fake financial impact; no fraud/negligence
label; no hidden score; ordering (WORSENED/UNCHANGED above IMPROVED, INSUFFICIENT_DATA last).

## Baseline gates
- `npx tsc --noEmit` → exit 0.
- `npm run governance:scan:strict` → 31 frozen, 0 new.
- `npm run lint:ratchet` → LINT_RATCHET_PASS.
- `npm run build` → compiled successfully.

## CI DB proof
The effectiveness DB simulation is wired into `db-verification.yml` LANE_B (throwaway postgres:16) and
LANE_A (Neon, opt-in) — the lane that verified the #130/#131/#132 sims against real Postgres. The CI log
must show `src/__tests__/execution/sop-training-effectiveness-simulation.db.test.ts` executing.
