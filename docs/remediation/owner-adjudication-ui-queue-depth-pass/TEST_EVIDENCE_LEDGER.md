# Owner Adjudication UI — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid (no schema change)
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new
npm run build                  # exit 0 (new page + route compile)

# UI + read-model tests (jsdom, no DB)
npx vitest run \
  src/__tests__/owner-mode/adjudication-queue.test.ts \
  src/__tests__/components/adjudication-queue.test.tsx \
  src/__tests__/app/owner-adjudication-page.test.tsx

# Changed-area regression
npx vitest run src/__tests__/owner-mode src/__tests__/components src/__tests__/execution
```

## Results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid (no schema change) |
| `governance:scan:strict` | 31 frozen, **0 new** |
| `next build` | exit 0 — `/owner/adjudication` + `/api/owner/proof-risk/queue` in the manifest |
| adjudication-queue.test.ts (domain) | 9/9 pass |
| adjudication-queue.test.tsx (component) | 9/9 pass |
| owner-adjudication-page.test.tsx (page) | 3/3 pass |
| owner-mode + components + execution (regression) | 83 files / 781 tests pass (23 db skipped) |

## Required-tests map (prompt §7)
1. queue renders active reused-proof finding → domain #1 + component #1.
2. queue renders anti-gaming signal with supporting proof count → domain #2 + component #1.
3. queue renders credibility concern → domain #3 + component #1.
4. queue renders timing-evidence signal → domain #4 + component #1.
5. reason required before submit → component #3.
6. DISMISS_FALSE_POSITIVE submits correct payload → component #4 + page #2.
7. REQUIRE_FRESH_PROOF submits correct payload → component #5.
8. successful adjudication updates/refreshes queue → page #2 (second GET fires) + component #6.
9. backend validation/authorization error shown safely → component #7 + page #3.
10. no fraud/theft/negligence label in UI → domain #9 + component #9.
11. no hidden staff score in UI → component #9.
12. owner now-view link/section exists → page #1 (back-link) + the now-view header link.
13. build/tsc passes → `next build` exit 0, `tsc` 0.

Extra: all-seven-outcomes offered (domain #8, component #2); dedupe of timing↔gaming (domain #5);
BLOCKED_BY_DATA fail-visible-but-not-adjudicable (domain #6, component #8); current status attach (domain #7).

## Browser E2E
**NOT run.** Proof is jsdom component + page render/interaction only (no real browser). Browser E2E
status remains **unproven**. Do not claim browser-proven readiness.

## Full suite note (honest)
Full repo not re-run here; the changed-area suites are green and this branch adds no failing file. The
known non-required `stripe-simulation` lane (missing test file) is pre-existing/unrelated. Full-repo
green is claimed only when CI confirms the required checks.
