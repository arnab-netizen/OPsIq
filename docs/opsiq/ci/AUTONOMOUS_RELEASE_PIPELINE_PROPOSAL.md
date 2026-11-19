# Autonomous release pipeline: design and the one reviewed change it needs

Status: PROPOSED, not active. The draft workflow is `docs/opsiq/ci/proposed/production-release.yml.draft`
(deliberately outside `.github/workflows/` so it cannot run).

## Why it is not simply committed

`src/__tests__/ci-cd/production-secret-isolation.test.ts` and the exact-host/exact-pending safety tests are
independent governance controls. They reject, by design:
- a reusable (`workflow_call`) workflow that references `OPERATOR_DATABASE_URL`;
- an origin guard that is not the verbatim `workflow_dispatch|schedule` guard;
- changes to the shape of the `migration_name` / `expected_database_host` inputs.

Trying it (session 3) failed 6 of those tests. Editing those tests in the same PR that needs the change would let a
change approve itself, which the remediation directive forbids. So the change must be made and reviewed as its own
privileged-CI PR by someone other than the author, then merged through the normal gates.

## Proposed design (native, no external dispatch)

`push` to main -> `plan` job (no secrets: SHA is still main HEAD, `PRODUCTION_DATABASE_HOST` repo variable set,
`ci.yml` green at that exact SHA, 0 or 1 new migration) -> privileged migrate + `runtime-role-reconcile-gate.mjs` +
Vercel redeploy hook. Emergency manual workflows stay.

Required reviewed changes, in one PR:
1. Add the privileged release job as its own non-reusable workflow (so no secret is referenced from a reusable
   workflow) with the verbatim origin guard extended to permit `push` only on `refs/heads/main`.
2. Update the isolation test's allow-list for that one workflow, and keep every mutation test.
3. Keep `environment: production-operator` until the owner replaces its approval rule with an equivalent reviewed
   control. A main-only branch rule is not an equivalent replacement for independent approval.

One-time repository settings (owner, not automatable by this session):
- Variables: `PRODUCTION_DATABASE_HOST` (bare direct Neon hostname; confirm it matches the production `DATABASE_URL` host).
- Required status check on `main` for the CI workflow, and CODEOWNERS covering `.github/workflows/**`,
  `scripts/release/**`, `scripts/db/**` and the governance tests.

Known limits: more than one new migration per push fails closed (manual workflow); the Vercel deploy hook is not
SHA-pinned (the Vercel build gate re-verifies migrations and grants for whatever it builds).
