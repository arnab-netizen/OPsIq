# Owner Adjudication Browser E2E — TEST EVIDENCE LEDGER

## Commands
```bash
# Static checks
npx prisma validate            # valid (no schema change)
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new
npm run build                  # exit 0

# jsdom adjudication tests (unchanged behaviour after the silent-refresh page fix)
npx vitest run \
  src/__tests__/owner-mode/adjudication-queue.test.ts \
  src/__tests__/components/adjudication-queue.test.tsx \
  src/__tests__/app/owner-adjudication-page.test.tsx

# Browser E2E (real app + real backend, local Postgres)
source ./dbenv.sh
export AUTH_SECRET=e2e-test-auth-secret-not-a-real-secret \
       AUTH_URL=http://localhost:3001 NEXT_PUBLIC_APP_URL=http://localhost:3001 \
       BASE_URL=http://localhost:3001 LOGIN_RATE_LIMIT_MAX_ATTEMPTS=200 PORT=3001
npx tsx scripts/seed-owner-scenarios.ts      # loginable owner + workspace + businesses
npx tsx scripts/seed-e2e-proof-risk.ts       # the self-review finding + owner permission grant
npm run build && PORT=3001 npm run start &   # boot the built app
# (wait for http://localhost:3001/login → 200)
export PLAYWRIGHT_CHROMIUM_PATH=$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1)
CI=1 npx playwright test tests/browser/43-owner-adjudication.spec.ts --project=chromium
```

## Results (this machine)
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid (no schema change) |
| `governance:scan:strict` | 31 frozen, **0 new** |
| `next build` | exit 0 |
| jsdom adjudication (domain + component + page) | **21/21 pass** |
| **Playwright `43-owner-adjudication.spec.ts`** | **5/5 pass** (real app + backend) |

## Browser run evidence
- Login as `test1@staging.local` succeeded; `/owner/adjudication` rendered the queue.
- `GET /api/owner/proof-risk/queue` → HTTP 200 (server log: `Auth decision: ALLOWED`, `statusCode 200`).
- `POST /api/proof-risk/adjudicate` (REQUIRE_FRESH_PROOF) → HTTP 200 (`Handler completed`,
  `statusCode 200`) → "Decision recorded (…)" shown.
- Playwright summary: `5 passed (4.0s)`.

## Failures found + fixed during the run (not hidden)
1. **Permission gap** — the adjudicate route requires `gep:proof_review_low_risk`; the seeded owner
   lacked it → first submit returned a sanitized error. Fixed by granting the permission in the seed
   (the real `UserRoleAssignment` grant path).
2. **Refresh unmount** — the post-submit refresh toggled the page loading state, unmounting the queue
   and wiping the success message. Fixed with a silent refresh (`load(silent)`).
   Both were re-run to green after the fix.

## CI status (honest)
The new spec is wired into the `owner-pilot-e2e` lane (seed + run list). It is **proven locally (5/5)**;
the **CI run will be confirmed on the PR** — this report does not claim a CI pass that hasn't happened.

## Full suite note
Not re-run in full; the changed-area jsdom suites are green and this branch adds no failing file. The
known non-required `stripe-simulation` lane is pre-existing/unrelated.
