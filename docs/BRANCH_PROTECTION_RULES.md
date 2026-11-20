# Branch Protection Rules for OpsIQ

## Overview
Branch protection prevents broken or unverified changes from reaching `main`. The enforced configuration is the repository ruleset **"Protect main"**; this document describes it and how to re-create it. The authoritative CI contract is `.github/workflows/ci.yml` (see its header) and `src/__tests__/ci-cd/workflow-validation.test.ts`.

## Configuration for `main` (ruleset "Protect main")

### 1. Required status check: exactly one, `branch-protection`
- The only required check is the **`branch-protection`** aggregate job of `ci.yml`, supplied by the GitHub Actions app (integration id 15368).
- It fails closed unless `classify`, `build-and-test` and `actionlint` succeeded, and, when the change-risk classifier sets `db_required=true` (DB-runtime and UNKNOWN risk tiers, including every runtime-proof and protected-capability file), `db-verify` also succeeded. A skipped `db-verify` is accepted only when `db_required=false`.
- There is no separate `lint` job. Never add `build-and-test` or `lint` as required contexts: a context that does not report blocks every pull request, and dropping `branch-protection` lets a failed or skipped DB verification merge.

### 2. Pull request reviews
- The ruleset requires **0 approving reviews** (single-owner repository; owner decision recorded in `docs/opsiq/status/OWNER_SETUP_CONSOLIDATED.md`). Independent review of privileged, financial, security and core-persistence changes is performed and recorded in the pull request; it is not a ruleset gate.

### 3. Branch must be up to date
- Strict policy: the pull request head must contain the current `main` tip (up to date) before merge, so the required check ran on the state being merged. Merges are therefore serialized.

### 4. Restrictions
- No bypass actors; force pushes and branch deletion are blocked.

## How to enable via the GitHub API

```bash
curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/arnab-netizen/OPsIq/rulesets \
  -d '{
    "name": "Protect main",
    "target": "branch",
    "enforcement": "active",
    "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
    "bypass_actors": [],
    "rules": [
      { "type": "deletion" },
      { "type": "non_fast_forward" },
      { "type": "pull_request", "parameters": { "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false, "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": false } },
      { "type": "required_status_checks", "parameters": { "strict_required_status_checks_policy": true, "required_status_checks": [ { "context": "branch-protection", "integration_id": 15368 } ] } }
    ]
  }'
```

## CI/CD workflow contract (summary)
- `ci.yml` runs on pull requests only. `classify` maps the changed files to a risk tier (`scripts/ci-risk-classifier.mjs`); `build-and-test` runs the non-DB suite; `db-verify` (PostgreSQL service containers) runs when `db_required=true`; `branch-protection` aggregates them.
- `main-integration.yml` is dispatch-only; release evidence is the verified pull-request CI result for the identical tree.

## Troubleshooting
- **Required check never appears:** the aggregate job is named `branch-protection`; confirm the ruleset requires that name and nothing else.
- **A pull request cannot merge although checks passed:** the branch is behind `main`; update the branch and let the check re-run on the new head.
