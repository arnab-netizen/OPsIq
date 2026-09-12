# Smoke - Production Dashboard: Failure Classification
**Phase 6H Wave 1 — 2026-07-10**

## Status

The `Smoke - Production Dashboard` workflow (`.github/workflows/smoke-production-dashboard.yml`)
is a **known non-required failure** on every push to `main`. It does NOT block the protected
branch (Step 15 `CI - Build & Test` is the blocking gate). This document classifies the failure
modes so the red is never confused with a regression introduced by this phase.

---

## Failure Mode 1 — DEPLOYMENT_COMMIT_MISMATCH (most common)

**Root cause:** The smoke workflow runs immediately on `push` to `main`. It polls
`/api/internal/build-info` every 10 s for up to 300 s (30 attempts) waiting for Vercel to
deploy the new commit. If the Vercel deployment takes longer than 300 s, the script exits with
`DEPLOYMENT_COMMIT_MISMATCH`.

**Script path (`scripts/smoke-production-dashboard.ts`):**
```typescript
if (deployedCommit !== targetCommit) {
  process.exit(1);  // DEPLOYMENT_COMMIT_MISMATCH
}
```

**Workflow path (`.github/workflows/smoke-production-dashboard.yml`):**
```yaml
- name: Wait for Vercel deployment
  if: github.event_name == 'push'
  run: |
    # 30 retries × 10s = 300s max wait
    for i in $(seq 1 $MAX_RETRIES); do
      DEPLOYED_COMMIT=$(curl .../build-info | jq '.commit')
      if [ "$DEPLOYED_COMMIT" = "$TARGET_COMMIT" ]; then exit 0; fi
      sleep $RETRY_INTERVAL
    done
    exit 1  # Timeout waiting for Vercel deployment
```

**Why not fixed here:** Requires either (a) increasing the polling window, (b) using a Vercel
webhook to trigger smoke only after deployment confirms, or (c) running smoke on
`workflow_run` completion event — all require workflow restructuring outside Wave 1 scope.

---

## Failure Mode 2 — MISSING_OPSIQ_DIAGNOSTIC_KEY_IN_GITHUB_ACTIONS_ENV

**Root cause:** The smoke script authenticates against protected endpoints using the
`OPSIQ_DIAGNOSTIC_KEY` secret. If the secret is absent from the GitHub Actions environment
(not set, expired, or the workflow runs in a fork context where secrets are not exposed),
the script exits early.

**Script path:**
```typescript
const diagnosticKey = process.env.OPSIQ_DIAGNOSTIC_KEY;
if (!diagnosticKey) {
  process.exit(1);  // MISSING_OPSIQ_DIAGNOSTIC_KEY_IN_GITHUB_ACTIONS_ENV
}
```

**Why not fixed here:** Requires a secrets management operation (adding/rotating the GitHub
Actions secret `OPSIQ_DIAGNOSTIC_KEY`). This is an infrastructure/ops action and **must not be
treated as approval to run any production migration.**

---

## Failure Mode 3 — ENDPOINT_NOT_READY (migration-gated)

**Root cause:** The smoke script hits `/api/internal/engagements-route-proof` and other
endpoints that may require DB schema state (applied migrations) to be present in the production
Vercel Postgres instance. If the production DB is behind the schema at the tested commit, these
endpoints return 500 or 404.

**Why not fixed here:** Requires running `prisma migrate deploy` against the production DB,
which is explicitly prohibited in this session until the user provides the phrase:
`"I approve running the production migration."` (not received).

---

## Non-Regression Confirmation

All three failure modes are:
- Pre-existing on `main` SHA `89b44217` (Phase 6G merge)
- Structural/environmental, not code defects introduced by Phase 6H Wave 1
- Not in the blocking CI lane (`CI - Build & Test` step 15)

Phase 6H Wave 1 changes (`decisions/intake/route.ts`, `operator/route.ts`) are not exercised
by the smoke production dashboard. The smoke dashboard targets production Vercel endpoints;
Phase 6H changes affect route-level audit behavior testable only via unit/integration tests.

---

## Recommendation

Track as a separate issue with labels `smoke-dashboard`, `non-blocking-red`. Resolution path
options ranked by effort:
1. Use `workflow_run` trigger keyed off the Vercel deployment event (cleanest)
2. Increase polling window to 600 s (quick mitigation, not a root fix)
3. Migrate to Vercel Deployment Protection + webhook notification (most robust)
