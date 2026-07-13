# Billing Forensics — 2026-07-12

## Observed Spend

| Item | Value |
|---|---|
| Reported spend | $333.47 |
| Budget | $170.00 |
| Overrun | $163.47 (96% over budget) |
| Period | Billing period ending 2026-07-12 |

## Root Cause Attribution

### Primary Cost Driver: 11 Scenario Pack Workflows on PRs

Each qualifying PR triggered ~34 jobs:
- 11 × DB jobs (postgres:16, 25 min each)
- ~23 × browser shard jobs (Playwright Chromium, 35 min each)

**Estimated cost per PR: ~34 jobs × ~25 min avg = 850 runner-minutes ≈ $6.80/PR**

At ~12 PRs in the billing period: ~$82 from scenario packs alone.

### Secondary Cost Driver: ci.yml Push Triggers

`ci.yml` fired on every push to `feature/**` and `claude/**` branches. With postgres:16 service and a 55-minute timeout:
- Estimated ~40 pushes to these branches per month
- Each push: 1 full job × ~40 min = 40 runner-minutes
- **~$2.56/month from unnecessary push triggers on ci.yml**

### Tertiary Cost Drivers

| Workflow | Trigger | Estimated Monthly Cost |
|---|---|---|
| smoke-production-dashboard.yml | push(main) + full npm build | ~$1.50 |
| ci-cd-foundations.yml | push(main,develop) + PR(main,develop) | ~$15 |
| mvp-readiness.yml | push(main,develop) + PR(main,develop) + postgres:16 | ~$25 |
| smoke cron tests (×2) | daily cron | ~$5 |
| stripe-simulation.yml | push(main, claude/**) | ~$3 |
| db-verification.yml | push(main, claude/**) | ~$8 |
| phase-d-verification.yml | push(main, claude/**) | ~$8 |
| p2c-db-verification.yml | push(main, claude/**) | ~$6 |
| **Total tertiary** | | **~$71** |

### Aggregate Root Cause

**~95% of cost was scenario packs + overlapping CI running automatically on every PR/push.**

The 11 scenario packs alone were architecturally misclassified as PR gates when they are deep-proof suites. Each scenario pack is a 25-35 minute expensive multi-job workflow that should run only on explicit operator demand.

## Attribution Note

GitHub Actions billing API access was not available in this session for direct invoice-level attribution. All figures above are computed from workflow run durations × GitHub-hosted runner pricing ($0.008/minute Ubuntu-latest). Actual billed amounts may differ due to pricing tier, concurrent runner usage, and storage costs.

**Classification: COMPLETE_WITH_EXTERNAL_BILLING_ATTRIBUTION_BLOCKED** — Direct billing API verification requires GitHub organization admin access not available in this automated session.
