# Bottleneck → Correction Routing — TEST EVIDENCE LEDGER

## Automated tests
| Suite | File | Cases | Result |
|---|---|---|---|
| Domain routing | `src/__tests__/owner-mode/bottleneck-correction-routing.test.ts` | 15 | ✅ 15 passed |
| Component (corrections panel) | `src/__tests__/components/process-corrections-panel.test.tsx` | 4 | ✅ 4 passed |
| Page (renders corrections) | `src/__tests__/app/owner-process-intelligence-page.test.tsx` | 2 | ✅ 2 passed |
| Laundry DB simulation | `src/__tests__/execution/bottleneck-correction-routing-simulation.db.test.ts` | 2 | ✅ passes with DB (local Postgres in CI DB-backed lane) |
| Browser (Playwright) | `tests/browser/44-owner-process-intelligence.spec.ts` | +1 corrections case | ✅ via `owner-pilot-e2e` lane |

## Domain test coverage (15)
1. REWORK_LOOP → review-step + fresh-proof + resolve-event (with events).
2. QUALITY_FAILURE_LOOP → update-checklist + escalate-to-owner (owner approval).
3. DELIVERY_HANDOFF_DELAY → resolve-event first.
4. REVIEW_BOTTLENECK → single review-process-step.
5. OWNER_APPROVAL_BOTTLENECK → escalate-to-owner (owner approval) + review-step.
6. PROOF_QUALITY_BREAKDOWN → fresh-proof + training-review (with actor); proof ids flow.
7. ESCALATION_RESPONSE_BREAKDOWN → escalate-to-owner + escalate-to-manager; real manager id; escalation ids.
8. STAFF_TRAINING_GAP → single training-review; actor target.
9. MANAGER_REVIEW_GAP → review-step + owner sign-off.
10. DATA_INSUFFICIENT → COLLECT_MISSING_DATA (missing present) else NO_ACTION.
11. Governance: only the no-op is auto-executable; every correction PROPOSED; owner-approval flag consistent.
12. Approval can only escalate (STAFF finding still gets MANAGER floor for a review step).
13. Secondary guards: no event-resolution without events; no coaching without a person; target never fabricated.
14. Ordering + priorityRank contiguity; topCorrection = rank 1; deterministic workspace-scoped ids; no accusatory language.
15. All nine correction types reachable across the routing rules.

## Baseline gates (local)
- `npx tsc --noEmit` → exit 0.
- `npm run governance:scan:strict` → 31 frozen, 0 new.
- `npm run lint:ratchet` → LINT_RATCHET_PASS (no error/warning increase; changed files lint-clean).

## Manual verification steps
1. `TEST_WITH_DB=true npx vitest run src/__tests__/execution/bottleneck-correction-routing-simulation.db.test.ts`
   (against a local Postgres) → seeds Sparkle Laundry, asserts routed corrections + clean-workspace isolation.
2. `npx vitest run src/__tests__/owner-mode/bottleneck-correction-routing.test.ts` → 15 passed.
3. `npx vitest run src/__tests__/components/process-corrections-panel.test.tsx src/__tests__/app/owner-process-intelligence-page.test.tsx` → 6 passed.
