# Workflow Disposition Ledger — 2026-07-12

All 75 pre-remediation workflows + 4 new workflows = 79 total post-remediation.

## Legend

| Code | Meaning |
|---|---|
| MODIFIED_TRIGGER | Trigger changed; job content unchanged |
| REWRITTEN | File content substantially changed |
| NEW | New file created |
| RETAINED_AS_IS | No changes made |

---

## Modified Files (36 total)

### Scenario Packs — PR trigger removed, dispatch-only retained

| File | Change | Pre-state | Post-state |
|---|---|---|---|
| chaos-exhaustive.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |
| customer-vendor-market.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |
| daily-operations.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |
| finance-cash.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |
| growth-profit-scaling.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |
| local-legal-professional-boundary.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |
| sequential-simulations.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |
| staff-proof-anti-gaming.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |
| ugly-tail-risk-crisis.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |
| unknown-ood.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |
| weekly-management-trend.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |
| corpus-final-audit.yml | MODIFIED_TRIGGER | PR(main) + dispatch | dispatch-only |

### Core CI — consolidated to non-overlapping

| File | Change | Pre-state | Post-state |
|---|---|---|---|
| ci.yml | REWRITTEN | push(main,feature/**,claude/**) + PR(main), postgres:16, 55min | PR(main)-only, no DB, 25min |
| ci-cd-foundations.yml | MODIFIED_TRIGGER | push(main,develop) + PR(main,develop) + dispatch | dispatch-only |
| mvp-readiness.yml | MODIFIED_TRIGGER | push(main,develop) + PR(main,develop) + dispatch | dispatch-only |

### DB Verification — push triggers removed

| File | Change | Pre-state | Post-state |
|---|---|---|---|
| db-verification.yml | MODIFIED_TRIGGER | push(main,claude/**) + PR(main paths) + dispatch | PR(main paths) + dispatch |
| phase-d-verification.yml | MODIFIED_TRIGGER | push(main,phase-d**,claude/**) + PR(main paths) | dispatch-only |
| p2c-db-verification.yml | MODIFIED_TRIGGER | push(main,p2c-**,claude/**) + PR(main paths) | dispatch-only |
| p2b-db-verification.yml | MODIFIED_TRIGGER | push(main paths) + dispatch | dispatch-only |

### Owner Pilot — PR trigger removed, specific branch retained

| File | Change | Pre-state | Post-state |
|---|---|---|---|
| owner-pilot-db.yml | MODIFIED_TRIGGER | push(2 branches) + PR(main) + dispatch | push(2 branches) + dispatch |
| owner-pilot-e2e.yml | MODIFIED_TRIGGER | push(2 branches) + PR(main) + dispatch | push(2 branches) + dispatch |
| phase-3-slice-2-truth-pass.yml | MODIFIED_TRIGGER | push(1 branch) + PR(main paths) + dispatch | push(1 branch) + dispatch |

### Smoke Tests — push/cron removed

| File | Change | Pre-state | Post-state |
|---|---|---|---|
| smoke-production-dashboard.yml | MODIFIED_TRIGGER | push(main) + dispatch | dispatch-only |
| smoke-production-signup-dashboard.yml | MODIFIED_TRIGGER | dispatch + cron(daily) | dispatch-only |
| smoke-production-diagnosis-dashboard.yml | MODIFIED_TRIGGER | dispatch + cron(daily) | dispatch-only |
| stripe-simulation.yml | MODIFIED_TRIGGER | push(main,claude/**) + dispatch | dispatch-only |

### Closed-Branch Push Triggers Removed

| File | Change | Pre-state | Post-state |
|---|---|---|---|
| b02-s2-integration.yml | MODIFIED_TRIGGER | dispatch + push(closed branch) | dispatch-only |
| b02-s3-db-verification.yml | MODIFIED_TRIGGER | dispatch + push(closed branch) | dispatch-only |
| b05-s1-db-verification.yml | MODIFIED_TRIGGER | dispatch + push(closed branch) | dispatch-only |
| b12-business-condition-profile-verification.yml | MODIFIED_TRIGGER | dispatch + push(closed branch) | dispatch-only |
| phase-1-db-tests.yml | MODIFIED_TRIGGER | dispatch + push(closed branch) | dispatch-only |
| b12-s3-db-verification.yml | MODIFIED_TRIGGER | push(no branch filter!) | dispatch-only |

---

## New Files (4 created + 1 script)

| File | Type | Purpose |
|---|---|---|
| .github/workflows/main-integration.yml | NEW | Full suite on push(main) — replaces ci.yml push-to-main |
| .github/workflows/deep-proof.yml | NEW | Consolidated dispatch entry for scenario/browser/corpus proof |
| .github/workflows/module-runtime-proof.yml | NEW | Consolidated dispatch entry for module runtime proofs |
| .github/workflows/module-migrate.yml | NEW | Consolidated dispatch entry for module migrations |
| scripts/ci-governance-check.mjs | NEW | Enforces workflow trigger policy on every PR |

---

## Retained As-Is (39 workflows)

All module runtime proof workflows (11), all module migration workflows (9),
all manual operational workflows, and path-triggered pure-logic workflows:

- module-1-owner-recovery-runtime-proof.yml through module-12-owner-home-runtime-proof.yml
- module-1-owner-recovery-migrate.yml through module-10-data-intake-migrate.yml
- migrate-production.yml, migrate-staging.yml, migrate-neon-test.yml
- reset-staging-db.yml, resolve-failed-migration.yml, seed-staging.yml
- deploy-staging.yml, smoke-production-login.yml, ai-live-smoke.yml
- manual-runtime-validation.yml, lane-b-db-test.yml
- b13-db-verification.yml, b14-db-verification.yml, b15-db-verification.yml
- b16-s1-db-verification.yml, b24-s2-db-verification.yml
- owner-real-world-simulation.yml, owner-real-world-smb-cases.yml, owner-mode-holdout.yml
- owner-baseline.yml, owner-e2e.yml, db-blocker-proof.yml, corpus-final-audit.yml (dispatch-only post-edit)
