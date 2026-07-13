# Final CI Architecture — 2026-07-12

## Target Operating Model

| Event | Workflows | Jobs | Notes |
|---|---|---|---|
| Pull request to main | ci.yml only | 3 (build-and-test, lint, branch-protection) | No postgres, no DB tests, <25 min |
| Push to main | main-integration.yml only | 1 (full-suite) | postgres:16, full DB suite, <55 min |
| Manual deep proof | deep-proof.yml (or individual scenario workflows) | 2+ | Operator-authorized only |
| Module runtime proof | Individual module-N-*-runtime-proof.yml | 1 each | Confirmation phrase guard |
| Module migration | Individual module-N-*-migrate.yml | 1 each | Environment protection + confirmation |
| Production migration | migrate-production.yml | 1 | Environment protection |
| Path-triggered logic | owner-real-world-simulation.yml, owner-real-world-smb-cases.yml, owner-mode-holdout.yml | 1 each | No DB, pure logic, cheap |

## PR Gate (ci.yml)

**Trigger:** `pull_request: branches: [main]` only
**Concurrency:** `cancel-in-progress: true` (saves cost on rapid pushes)

### Jobs

**build-and-test** (timeout: 25 min)
- npm ci
- Governance compliance scan (blocking)
- Auth route governance scan (blocking)
- TypeScript type check (blocking)
- Prisma schema validation (no DB — syntax only)
- Wrapped handlers ratchet (blocking)
- CI workflow governance check (blocking — prevents trigger regressions)
- Non-DB vitest suite (excludes `**/*.db.test.ts` + quarantined files, blocking)

**lint** (timeout: 10 min)
- npm ci
- npm run lint (non-blocking)
- Lint ratchet (blocking)

**branch-protection** (depends on both above)
- Runs only on pull_request (always true now)
- Required check: "CI - Build & Test / branch-protection"

### What's excluded from the PR gate
- DB tests (`**/*.db.test.ts`) — run on push to main in main-integration.yml
- Full npm run build — not needed for test + static checks
- Quarantined files — tracked under FULL_SUITE_TEST_DEBT_RECOVERY
- Browser tests — dispatch-only via deep-proof.yml
- Scenario packs — dispatch-only

## Main Integration (main-integration.yml)

**Trigger:** `push: branches: [main]` only
**Concurrency:** `cancel-in-progress: true`

### Jobs

**full-suite** (timeout: 55 min, postgres:16)
- Configure .env.local for CI postgres
- Governance scans (blocking)
- TypeScript type check (blocking)
- Prisma validate + migrate deploy + generate
- Wrapped handlers ratchet (blocking)
- Full vitest suite including DB tests (quarantine excluded, blocking)
- Quarantine visibility lane (non-blocking)
- Codecov upload

## Branch Protection Compatibility

**Required check:** `CI - Build & Test / branch-protection`

This check is satisfied by the `branch-protection` job in ci.yml, which requires both `build-and-test` and `lint` to succeed. The workflow name `CI - Build & Test` and job names (`build-and-test`, `lint`, `branch-protection`) are preserved exactly from the original ci.yml to avoid any branch protection configuration change.

**No admin action required** to migrate required checks.

## Cost Projection

| Scenario | Jobs/month | Minutes/month | Estimated Cost |
|---|---|---|---|
| PRs (target: 15/month) | 15 × 3 = 45 | ~675 | ~$5.40 |
| Main pushes (target: 20/month) | 20 × 1 = 20 | ~800 | ~$6.40 |
| Manual dispatch (occasional) | ~5/month | ~200 | ~$1.60 |
| Path-triggered (cheap) | ~10/month | ~30 | ~$0.24 |
| **Total** | ~80 | ~1,705 | **~$13.64/month** |

**vs. baseline: $333.47 → ~$14/month = ~96% cost reduction**

## Governance Enforcement

`scripts/ci-governance-check.mjs` runs on every PR and checks:
1. Scenario packs have no `pull_request:` trigger
2. `ci.yml` has no push to `feature/**` or `claude/**`
3. `b12-s3-db-verification.yml` has no push with no branch filter
4. Cron smoke tests have no `cron:` schedule
5. Overlapping core CI workflows have no automatic triggers

Any regression in workflow triggers fails the PR gate immediately.
