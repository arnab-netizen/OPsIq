# Staff Training Assignment Engine — TEST EVIDENCE LEDGER

## Automated tests
| Suite | File | Cases | Result |
|---|---|---|---|
| Domain engine | `src/__tests__/owner-mode/staff-training-assignment-engine.test.ts` | 13 | ✅ 13 passed |
| Component (training panel) | `src/__tests__/components/training-assignments-panel.test.tsx` | 4 | ✅ 4 passed |
| Page (renders training) | `src/__tests__/app/owner-process-intelligence-page.test.tsx` | 2 | ✅ 2 passed |
| Laundry DB simulation | `src/__tests__/execution/staff-training-assignment-simulation.db.test.ts` | 2 | ✅ runs in CI DB-backed lane (LANE_B) |

## Domain coverage (16 required assertions across 13 blocks)
PROOF_QUALITY_BREAKDOWN→PROOF_QUALITY_REVIEW; MANAGER_REVIEW_GAP→MANAGER_REVIEW_QUALITY;
ESCALATION_RESPONSE_BREAKDOWN→ESCALATION_RESPONSE_REVIEW; DELIVERY_HANDOFF_DELAY→DELIVERY_HANDOFF_REVIEW;
checklist SOP draft→CHECKLIST_CHANGE_BRIEFING; DATA_INSUFFICIENT→NEEDS_DATA briefing only (no operator);
cleared→no training; confirmed/require-fresh→training; approval level present; success metric present;
topAssignment real; clean workspace no operator training; workspace scoping; no firing/payroll/discipline;
no fraud/negligence; no hidden score.

## Baseline gates (branch rebased onto latest main)
- `npx tsc --noEmit` → exit 0.
- `npm run governance:scan:strict` → 31 frozen, 0 new.
- `npm run lint:ratchet` → LINT_RATCHET_PASS.

## CI DB proof
The training DB simulation is wired into `db-verification.yml` LANE_B (throwaway postgres:16) and LANE_A
(Neon, opt-in) — the same lane that verified the #130 (260/260) and SOP sims against a real Postgres.
