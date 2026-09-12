# Remote Validation Log — 2026-07-12

## Budget

Maximum allowed remote GitHub workflow executions: **2**
Used: **0** (as of this writing — PR not yet opened)

## Planned Validation Runs

### Run 1 — PR Gate Validation (ci.yml)

**Intent:** Open a PR from `claude/github-workflows-audit-9t5jdp` to `main`. This triggers `ci.yml` and validates:
- Governance scans pass on the remediated codebase
- tsc passes
- prisma validate passes
- CI governance check (`node scripts/ci-governance-check.mjs`) passes against the remediated workflows
- Non-DB vitest suite passes (no regressions)
- Lint ratchet passes
- branch-protection job reports green

**Expected outcome:** GREEN

**Risk factors:**
- ci-governance-check.mjs is new and might have a false positive — reviewable from logs
- Non-DB vitest may surface a pre-existing flaky test — quarantine mechanism handles this

### Run 2 — Reserved for Rerun if Run 1 Fails

If Run 1 fails due to a genuine regression introduced by this change (not a pre-existing flaky test), Run 2 is used for the fix.

If Run 1 passes on first attempt, Run 2 is not used.

## Execution Log

| Run | Date | Workflow | SHA | Result | Notes |
|---|---|---|---|---|---|
| — | — | — | — | — | Not yet executed |

*This table will be updated manually after the PR is opened and CI runs.*

## What Run 1 Does NOT Validate

- Full DB test suite — validated on push to main via main-integration.yml (post-merge)
- Browser scenario packs — dispatch-only, not triggered by PR
- Module runtime proofs — dispatch-only
- Production smoke tests — dispatch-only

These are validated through the normal post-merge flow on main.
