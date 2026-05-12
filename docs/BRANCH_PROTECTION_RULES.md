# Branch Protection Rules for OpsIQ

## Overview
Branch protection ensures code quality and prevents broken deployments by enforcing checks before merging to main.

## Configuration for `main` Branch

### 1. Require Status Checks to Pass Before Merging
- ✓ **CI - Build & Test** (build-and-test job)
  - Ensures npm ci, TypeScript, Prisma validation, build, and tests all pass
  - Times out after 30 minutes
  - Required for all commits
- ✓ **CI - Lint** (lint job)
  - Runs code linter (npm run lint)
  - May pass with warnings; does not block merge (continue-on-error: true)

### 2. Require Pull Request Reviews Before Merging
- **Minimum 1 review approval** (can be automated via CODEOWNERS)
- Dismiss stale pull request approvals when new commits are pushed

### 3. Require Branches to Be Up to Date Before Merging
- All PRs must be rebased on latest main before merge
- Prevents merge conflicts and ensures all checks run on final state

### 4. Restrict Who Can Push to Matching Branches
- Only allow force pushes from administrators
- Prevent accidental force pushes from CI/CD workflows

### 5. Additional Security
- ✓ Require signed commits (optional, enforced in Anthropic org settings)
- ✓ Require status checks to pass before merging (see above)
- ✓ Require PR reviews (see above)

## How to Enable via GitHub UI

1. Navigate to: **Settings** → **Branches** → **Add rule**
2. Branch name pattern: `main`
3. Enable:
   - "Require a pull request before merging" (1 approval)
   - "Require status checks to pass before merging"
     - Select: `build-and-test`, `lint`
   - "Require branches to be up to date before merging"
   - "Require a code owner review" (if CODEOWNERS exists)
   - "Include administrators" (admins must follow rules too)

## How to Enable via GitHub API

```bash
curl -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/arnab-netizen/OPsIq/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": ["build-and-test", "lint"]
    },
    "required_pull_request_reviews": {
      "required_approving_review_count": 1,
      "dismiss_stale_reviews": true
    },
    "enforce_admins": true,
    "allow_force_pushes": false,
    "allow_deletions": false,
    "required_linear_history": false
  }'
```

## CI/CD Workflow Status

### Build & Test Job
- Runs on: Ubuntu latest, Node 18.x
- Database: PostgreSQL 15 (in-container service)
- Steps:
  1. Checkout code
  2. Setup Node.js with npm cache
  3. Install dependencies (`npm ci`)
  4. TypeScript type check (`npx tsc --noEmit`)
  5. Prisma schema validation (`npx prisma validate`)
  6. Build project (`npm run build`)
  7. Run tests (`npm test`)
  8. Upload coverage (if available)

### Lint Job
- Runs on: Ubuntu latest, Node 18.x
- Steps:
  1. Checkout code
  2. Setup Node.js with npm cache
  3. Install dependencies (`npm ci`)
  4. Run linter (`npm run lint`) - non-blocking

## Deployment Gate

PRs can be merged only if:
1. All status checks pass (build-and-test, lint)
2. At least 1 review approval received
3. Branch is up to date with main
4. No blocking GitHub status checks failed

## Troubleshooting

### Build Fails in CI but Passes Locally
- Ensure `.env.test` is properly configured
- Verify `DATABASE_URL` is set in CI environment
- Check Node.js version matches (18.x)
- Clear npm cache: `npm ci --no-cache`

### PR Can't Merge Even Though Checks Passed
- Refresh the branch to ensure latest checks ran
- Verify 1 approval is present
- Check if branch is up to date with main

### Test Flakiness
- Watch test output in GitHub Actions
- Check for timing-sensitive or concurrent test issues
- See `.github/workflows/ci.yml` for test configuration

## Auto-Deployment

### Staging Deployment (on merge to main)
See: `.github/workflows/deploy-staging.yml`
- Automatically deploys to staging after successful CI
- Triggers after PR merge to main

### Production Deployment
Manual trigger only:
```bash
gh workflow run deploy-production.yml --ref main
```
- Requires explicit approval
- Runs full integration tests before deployment
