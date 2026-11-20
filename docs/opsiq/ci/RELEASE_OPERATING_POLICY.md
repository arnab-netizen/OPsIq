# Release operating policy (effective 2026-11-20)

## What is automatic (no routine owner action)
Ordinary changes that do not touch the production database schema: a pull request must pass the required `branch-protection` check on its exact head (which contains the current main tip), is merged, and Vercel's git integration builds and deploys main. The build-time release gate (`scripts/release/production-migration-gate.mjs`) refuses any production build whose committed migrations are not applied or whose runtime role lacks grants, so production keeps serving the last good build instead of serving code that expects a missing column.

## What still needs one human approval (deliberately)
Any production database mutation: `Migrate Production Database` (modes MAIN, PINNED_PREDEPLOY, MAIN_BATCH) and the runtime-role reconcile run in the `production-operator` environment, which requires a human approval. An independent security review found the scheduled release pipeline proposed in the rejected draft (#685) is not equivalent to that approval, so it is NOT activated. The pipeline is therefore automatic for schema-neutral releases and human-approved for schema-changing releases. It must not be described as fully autonomous.

## Frozen operating mode
Development is frozen. A schema-changing release is an exception that requires: an exception ticket, an independent review of the migration, a manifest (`.claude/production-migration-batches/`) merged by pull request, and one dispatch approved on `production-operator`. Release-blocking defects found in production are the only trigger for exception engineering; non-blocking improvements are deferred.

## Equivalent-mechanism status
The batch mode reduces the human step to one approval per recovery and verifies everything else by machine (exact SHA, host, manifest checksums, additive-only SQL, ledger anchor, recovery point, post-verification, runtime-role reconcile). Whether a machine-only equivalent of the approval can ever be accepted remains an owner decision gated on a main-ruleset change (second-identity approval, CODEOWNERS, main-only environment, protected release branch); until then the approval stays.
