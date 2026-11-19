# Standing authorization: runtime-role reconcile as part of an authorized production migration

Owner decision recorded 2026-11-18 (session 5 directive). It resolves the policy question raised in PR #682: typing the
migrate confirmation for `migrate-production.yml` (MAIN mode) also authorizes the deterministic runtime-role reconcile, with no
separate typed phrase.

It does NOT authorize bypassing GitHub permissions, independent review, CODEOWNER approval, protected branches, provider
restrictions, or any exceptional destructive-operation approval. `reconcile-runtime-role.yml` stays as the emergency/manual path.

## Conditions and where each is enforced

| Condition (owner) | Enforcement | Evidence |
|---|---|---|
| Exact production DB identity verified | `opsiq-role-cutover.ts` exact `--expected-host` + the database's own Neon identity must agree with `--target production`; direct (non-pooler) endpoint required | `role-cutover-target.ts`; pooler refusal test in `runtime-role-reconcile-gate.test.ts` |
| Authorized release SHA verified | Checked-out SHA must equal `GITHUB_SHA` before any database step (workflow), and again inside the gate (`STALE_OR_UNPINNED_RELEASE_SHA`) | `migrate-workflow-runtime-role-sequencing.test.ts`, gate tests |
| Runtime role already exists | `ABSENT` blocks at pre-verify, apply (`SKIPPED_ROLE_ABSENT`) and post-verify; production never falls back to a privileged connection | gate tests (Finding A) |
| Permissions derived from the approved schema | `roleTopologyStatements` recomputes grants from `prisma/schema.prisma` every run | `runtime-role.db.test.ts` |
| Excess permissions removed, necessary granted | REVOKE ALL then exact re-grant; post-verify must be PASS + CONFORMING with zero gap/unclassified/owned objects/memberships/PUBLIC grants | gate `[db]` tests: missing and excess grants |
| No role created | Gate always passes `--only-if-present` and no eraser logins, so no `CREATE ROLE` statement is reachable | tool contract, `toolInvocation` test |
| No password changed | The tool never reads, accepts or prints a password | tool header, no `PASSWORD` in workflow step (sequencing test) |
| No ownership transfer, no superuser/DDL | Role attributes normalized to NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS; runtime owns nothing; CREATE revoked on schema/database | verifier checks, gate `runtime_owned_objects=0` |
| No unrelated role modified | Statements touch only the runtime role (attributes, memberships, grants); the existing erasure group receives only its documented grants. Note: this is the existing manifest, not new behaviour | `role-topology.ts` |
| Pre and post verification recorded | Read-only pre-verify and post-verify are both in the job log; the summary records the gate result | workflow summary |
| Read-only verification cannot mutate | Verification runs inside an explicit `BEGIN READ ONLY`, proves the effective mode and a rejected write (SQLSTATE 25006) before any catalog query, never relies on `PGOPTIONS` or URL `options=`; always rolled back | `[db]` read-only tests |
| All automated security and release gates pass | The reconcile runs only after migration and post-migration verification succeed; the redeploy hook requires `RUNTIME_ROLE_RECONCILED=true` | sequencing tests |

## Residual limits

- Applies to `mode: MAIN` only. `PINNED_PREDEPLOY` is unchanged (it runs before the source PR merges).
- Two production-writing workflows share the `migrate-production` concurrency group, so migrations and reconciles never overlap.
- The `production-operator` environment gate is unchanged by this decision.
