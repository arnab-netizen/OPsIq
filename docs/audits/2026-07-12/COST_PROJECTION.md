# Cost Projection — 2026-07-12

## Baseline (Pre-Remediation)

| Workflow Category | Trigger | Jobs/Event | Frequency/Month | Minutes/Job | Monthly Cost |
|---|---|---|---|---|---|
| 11 scenario packs | PR(main) | 34 total | 12 PRs | ~25 min avg | ~$82 |
| ci.yml push to feature/claude branches | push | 1 job | ~40 | ~40 min | ~$13 |
| ci-cd-foundations.yml | push+PR | 2-3 jobs | ~50 | ~20 min | ~$20 |
| mvp-readiness.yml | push+PR+dispatch | 4 jobs | ~50 | ~10 min avg | ~$16 |
| db-verification.yml push(main,claude/**) | push | 1 job | ~15 | ~30 min | ~$4 |
| phase-d-verification.yml | push(main,claude/**)+PR | 1 job | ~20 | ~30 min | ~$5 |
| p2c-db-verification.yml | push(main,claude/**)+PR | 1 job | ~15 | ~30 min | ~$4 |
| p2b-db-verification.yml push(main) | push | 1 job | ~12 | ~20 min | ~$2 |
| smoke-production-dashboard push(main) | push | 1 job | ~12 | ~15 min | ~$1.50 |
| stripe-simulation push(main,claude/**) | push | 1 job | ~20 | ~15 min | ~$2.50 |
| Cron smoke tests (×2) | cron daily | 1 job each | 60 total | ~10 min | ~$5 |
| ci.yml PR(main) | PR | 3 jobs | 12 | ~40 min avg | ~$12 |
| **Estimated Total** | | | | | **~$167–$333** |

Note: Actual billing of $333.47 suggests higher frequency or longer runtimes than estimated. Browser shards are especially expensive.

## Post-Remediation Projection

| Workflow | Trigger | Jobs/Event | Frequency/Month | Minutes/Job | Monthly Cost |
|---|---|---|---|---|---|
| ci.yml (PR gate) | PR(main) | 3 | 15 PRs | ~8 min avg | ~$2.88 |
| main-integration.yml | push(main) | 1 | 20 | ~45 min | ~$7.20 |
| db-verification.yml | PR(main paths) | 1 | ~3 (path match) | ~30 min | ~$0.72 |
| owner-real-world-*.yml | path-triggered | 1 each | ~3 | ~5 min | ~$0.24 |
| Manual dispatches (all) | dispatch | varies | ~10 | ~15 min avg | ~$1.20 |
| **Projected Total** | | | | | **~$12.24/month** |

## Cost Reduction

| Metric | Value |
|---|---|
| Baseline spend | $333.47 |
| Projected post-remediation | ~$12.24/month |
| Reduction | ~$321/month (96.3%) |
| Monthly target | $0 routine / max $10 exceptional / hard budget $20 |
| Status | Projection meets hard budget of $20 |

## Risk Factors

1. **main-integration.yml flakiness**: If tests are flaky on main, each re-push costs ~$7. Mitigated by quarantine mechanism.
2. **Dispatch abuse**: No cost controls prevent rapid manual dispatches of expensive workflows. Mitigated by confirmation phrase guards on module proofs.
3. **PR volume spike**: At 30 PRs/month (2×estimate), PR cost doubles to ~$5.76 — still well within budget.
4. **New scenario packs**: Future scenario packs must NOT be added with PR triggers. The ci-governance-check.mjs script enforces this.

## Budget Tracking

Monthly hard budget: **$20**

| Scenario | Projected | vs. Budget |
|---|---|---|
| Normal month (15 PRs, 20 main pushes, 10 dispatches) | ~$12 | 60% of budget |
| Heavy month (30 PRs, 40 main pushes, 20 dispatches) | ~$22 | 110% — triggers alert |
| Scenario pack dispatch day (all 11 packs + chaos) | ~$15 one-time | Expected monthly exceptional |
