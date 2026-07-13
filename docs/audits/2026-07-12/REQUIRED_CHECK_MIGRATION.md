# Required Check Migration — 2026-07-12

## Current Required Check

The branch protection required check is almost certainly:

```
CI - Build & Test / branch-protection
```

This maps to: workflow file `ci.yml` → workflow name `CI - Build & Test` → job `branch-protection`.

## Post-Remediation Compatibility

**NO CHANGE REQUIRED.**

The `ci.yml` file was rewritten but preserves:
- Workflow name: `CI - Build & Test` (line 1: `name: CI - Build & Test`)
- Job names: `build-and-test`, `lint`, `branch-protection`
- The `branch-protection` job's `needs: [build-and-test, lint]` dependency
- The `if: github.event_name == 'pull_request'` condition on `branch-protection`

The required check `CI - Build & Test / branch-protection` will continue to be satisfied by every PR to main.

## Why No Admin Action Is Needed

GitHub branch protection matches required checks by the string `{workflow_name} / {job_id}`. Since the workflow name and all job IDs are preserved identically, the required check mapping is unchanged.

## What Changed

The `ci.yml` trigger was narrowed from:
```yaml
on:
  push:
    branches: [main, "feature/**", "claude/**"]
  pull_request:
    branches: [main]
```
to:
```yaml
on:
  pull_request:
    branches: [main]
```

This removes the push trigger entirely from ci.yml. Push to main is now handled by `main-integration.yml`. The `branch-protection` job runs only on `pull_request` events — which was the only meaningful case before (the `if: github.event_name == 'pull_request'` condition prevented it from running on push events anyway).

## New Workflow (main-integration.yml)

`main-integration.yml` is not a required check and does not need branch protection configuration. It runs after merge and its failure would block future PRs only if the operator decides to add it as a required check.

## Recommendation

If in the future operators want main integration failures to block PRs:
1. Add `main-integration.yml / full-suite` as a required status check
2. This would require admin branch protection access

This is not required for the current remediation.
