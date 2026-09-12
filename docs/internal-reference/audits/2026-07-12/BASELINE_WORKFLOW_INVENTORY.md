# Baseline Workflow Inventory — 2026-07-12

Pre-remediation snapshot of all 75 GitHub Actions workflow files.

## Summary

| Category | Count |
|---|---|
| Total workflows | 75 |
| Scenario pack workflows (PR-triggered) | 11 |
| Cron-scheduled smoke tests | 2 |
| Workflows with push to main | 8 |
| Workflows with push to any claude/** | 9 |
| Workflows with push to any branch (no filter) | 1 |
| Already dispatch-only | 27 |

## Trigger Classification (Pre-Remediation)

### A — Scenario Packs (pull_request: main + workflow_dispatch)
1. chaos-exhaustive.yml — 4 jobs per PR (1 DB + 3 browser shards)
2. customer-vendor-market.yml — 3 jobs per PR (1 DB + 2 browser shards)
3. daily-operations.yml — 4 jobs per PR (1 DB + 3 browser shards)
4. finance-cash.yml — 3 jobs per PR
5. growth-profit-scaling.yml — 3 jobs per PR
6. local-legal-professional-boundary.yml — 3 jobs per PR
7. sequential-simulations.yml — 3 jobs per PR
8. staff-proof-anti-gaming.yml — 3 jobs per PR
9. ugly-tail-risk-crisis.yml — 3 jobs per PR
10. unknown-ood.yml — 3 jobs per PR
11. weekly-management-trend.yml — 3 jobs per PR
**Subtotal: ~34 jobs per PR from scenario packs alone.**

### B — Overlapping Core CI (push + pull_request)
- ci.yml — push(main, feature/**, claude/**) + PR(main) — postgres:16 service, 55-min timeout
- ci-cd-foundations.yml — push(main, develop) + PR(main, develop) + dispatch — build+tsc+prisma
- mvp-readiness.yml — push(main, develop) + PR(main, develop) + dispatch — postgres:16, 30-min timeout

### C — DB Verification with Broad Push Triggers
- db-verification.yml — push(main, claude/**) + PR(main paths) + dispatch
- phase-d-verification.yml — push(main, phase-d**, claude/**) + PR(main paths)
- p2c-db-verification.yml — push(main, p2c-**, claude/**) + PR(main paths)
- p2b-db-verification.yml — push(main paths) + dispatch

### D — Closed Branch Push Triggers (CLOSED BRANCHES)
- b02-s2-integration.yml — push(claude/execution-audit-phase-a-ulmljq) — CLOSED
- b02-s3-db-verification.yml — push(same closed branch) — CLOSED
- b05-s1-db-verification.yml — push(same closed branch) — CLOSED
- b12-business-condition-profile-verification.yml — push(same closed branch) — CLOSED
- phase-1-db-tests.yml — push(claude/fix-actorid-authcontext-BKuip) — CLOSED

### E — DANGEROUS: Push Trigger with No Branch Filter
- b12-s3-db-verification.yml — push(paths only, no branch filter) → fires on EVERY push to any branch

### F — Cron Scheduled
- smoke-production-signup-dashboard.yml — cron: 15 2 * * * (daily)
- smoke-production-diagnosis-dashboard.yml — cron: 45 2 * * * (daily)

### G — Push to Main with Build Cost
- smoke-production-dashboard.yml — push(main) — includes full npm run build
- stripe-simulation.yml — push(main, claude/**) — postgres:15, stripe sim suite

### H — Specific Branch + PR + Dispatch (Semi-targeted)
- owner-pilot-db.yml — push(2 specific claude branches) + PR(main) + dispatch
- owner-pilot-e2e.yml — push(same 2) + PR(main) + dispatch — full browser E2E
- phase-3-slice-2-truth-pass.yml — push(1 specific claude branch) + PR(main paths) + dispatch

### I — Path-triggered, No DB (cheap, keep)
- owner-real-world-simulation.yml
- owner-real-world-smb-cases.yml
- owner-mode-holdout.yml

### J — Already Dispatch-Only (correct, keep)
11 module runtime proof workflows + 9 module migration workflows + manual operational workflows

## Cost Drivers (Pre-Remediation)

| Driver | Estimated Jobs/Month |
|---|---|
| Scenario packs (11 × 34 jobs × ~12 PRs/month) | ~4,500 |
| ci.yml push to claude/** branches (~40 pushes/month) | ~40 |
| cron smoke tests (2 × 30 days) | ~60 |
| smoke-production-dashboard push(main) | ~12 |
| Total estimated | ~4,600+ jobs/month |

At ~$0.008/job-minute × ~10 min average: **$368/month estimated** (consistent with $333.47 overrun).
