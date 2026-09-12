# Process Intelligence UI — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid (no schema change)
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new
npm run build                  # exit 0 (/owner/process-intelligence in manifest)

# jsdom UI + domain
npx vitest run \
  src/__tests__/components/process-intelligence-panel.test.tsx \
  src/__tests__/app/owner-process-intelligence-page.test.tsx \
  src/__tests__/owner-mode/process-intelligence.test.ts

# Browser (real app + backend)
source ./dbenv.sh
export AUTH_SECRET=e2e-test-auth-secret-not-a-real-secret BASE_URL=http://localhost:3001 \
       LOGIN_RATE_LIMIT_MAX_ATTEMPTS=200 PORT=3001
npx tsx scripts/seed-owner-scenarios.ts
npx tsx scripts/seed-e2e-proof-risk.ts        # adds complaint/rework -> REWORK_LOOP
npm run build && PORT=3001 npm run start &     # boot the built app
export PLAYWRIGHT_CHROMIUM_PATH=$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1)
CI=1 npx playwright test tests/browser/44-owner-process-intelligence.spec.ts --project=chromium
```

## Results (this machine)
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid (no schema change) |
| `governance:scan:strict` | 31 frozen, **0 new** |
| `next build` | exit 0 — `/owner/process-intelligence` in manifest |
| process-intelligence-panel.test.tsx | 5/5 pass |
| owner-process-intelligence-page.test.tsx | 2/2 pass |
| process-intelligence.test.ts (domain regression) | 15/15 pass |
| **44-owner-process-intelligence.spec.ts (Playwright)** | **4/4 pass** (real app + backend) |
| components + app + owner-mode + owner-guidance (regression) | 91 files / 992 tests pass (18 db skipped) |

## Browser run evidence
- Login as `test1@staging.local` → `/owner/process-intelligence` rendered.
- `GET /api/owner/now-view` → `processIntelligence.topFinding = REWORK_LOOP`, `requiredApprovalLevel = MANAGER`,
  2 supporting operational-event ids — a REAL breakdown (not the empty/DATA_INSUFFICIENT state).
- Playwright summary: `4 passed (3.7s)`.

## Required-tests map (§ Pass 1)
1. renders top breakdown → component #1 + Playwright #2.
2. shows affected stage → component #1 (pi-stage).
3. shows recommended correction → component #1 + Playwright #2.
4. shows related profit leak / constraint / SLO → component #2.
5. handles DATA_INSUFFICIENT → component #3.
6. no fraud/negligence labels → component #5 + Playwright #2.
7. no hidden score → component #5.
8. Owner Now View link/section exists → page #1 (back-link) + Playwright #4 (now-view link).
9. next build passes → exit 0.
10. existing Process Intelligence tests still pass → 15/15.

## Full suite note (honest)
Not re-run in full; changed-area suites green, no new failing file. Known non-required `stripe-simulation`
lane pre-existing/unrelated.
