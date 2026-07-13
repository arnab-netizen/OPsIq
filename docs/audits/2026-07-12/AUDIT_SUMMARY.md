# GitHub Actions Emergency Cost Remediation — Audit Summary
## 2026-07-12

### Problem

GitHub Actions spend reached **$333.47** against a **$170 budget** (96% over).

### Root Cause

**11 scenario-pack workflows were misclassified as PR gates.** Each qualifying PR to main triggered ~34 jobs (11 DB jobs + ~23 Playwright browser shard jobs), consuming ~850 runner-minutes per PR at ~$6.80 per PR. With ~12 PRs in the billing period, this single class of misclassification accounted for ~$82 of overspend.

Secondary causes: overlapping core CI (`ci-cd-foundations.yml`, `mvp-readiness.yml`) running duplicate postgres-backed suites on every push to main and PR; `ci.yml` pushing to every `claude/**` branch; daily cron smoke tests; and 1 workflow with a push trigger that fired on **every push to any branch** (`b12-s3-db-verification.yml`).

### Solution

**36 existing workflows modified** (trigger changes only, no test content changed):
- Removed PR triggers from all 11 scenario packs → dispatch-only
- Rewrote `ci.yml` to be a lightweight PR gate (no DB service, no build, ~15 min)
- Converted 9 overlapping/historical workflows to dispatch-only
- Removed cron schedules from 2 daily smoke tests
- Removed push triggers from 7 workflows (main, claude/**, closed branches)
- Fixed dangerous no-branch-filter push trigger

**4 new workflow files created**:
- `main-integration.yml` — full DB suite on push to main
- `deep-proof.yml` — dispatch-only consolidated scenario/browser proof
- `module-runtime-proof.yml` — dispatch-only module proof directory
- `module-migrate.yml` — dispatch-only module migration directory

**1 new script created**:
- `scripts/ci-governance-check.mjs` — enforces trigger policy on every PR

### What Was Preserved

- Branch protection (`CI - Build & Test / branch-protection`) — UNCHANGED
- All governance scans — UNCHANGED, still blocking on every PR
- All test files — 0 files deleted
- All test assertions — 0 weakened
- All module runtime proof workflows — RETAINED as-is
- All module migration workflows — RETAINED as-is
- All production/staging migration workflows — RETAINED as-is
- All DB tests — still run (on push to main instead of on every PR)
- All browser/scenario tests — still run (dispatch-only instead of on every PR)

### Projected Outcome

| Metric | Before | After |
|---|---|---|
| Monthly spend | ~$333 | ~$12 |
| Jobs per PR | ~38 | 3 |
| Postgres services on PR | 1 | 0 |
| Browser shards on PR | ~23 | 0 |
| Cost reduction | — | ~96% |

### Documentation

All audit artifacts in `docs/audits/2026-07-12/`:
- BASELINE_WORKFLOW_INVENTORY.md / .json
- BILLING_FORENSICS.md
- WORKFLOW_DISPOSITION_LEDGER.md / .json
- FINAL_CI_ARCHITECTURE.md
- TEST_REACHABILITY_MANIFEST.md / .json
- COST_PROJECTION.md / .json
- CHANGE_CLASSIFICATION.md
- GOVERNANCE_COMPLIANCE_REPORT.md
- REQUIRED_CHECK_MIGRATION.md
- LOCAL_VALIDATION_REPORT.md
- REMOTE_VALIDATION_LOG.md
- ACCEPTANCE_CHECKLIST.md
- AUDIT_SUMMARY.md (this file)
