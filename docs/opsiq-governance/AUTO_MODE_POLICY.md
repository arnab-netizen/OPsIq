# Claude Code Auto-Mode Policy

Status: OWNER-APPROVED
Approved: 2026-10-29
Scope: see §A — a global (all-repo) layer plus a repo-scoped layer for `/Users/apple/OPsIq`.

This policy governs what Claude Code may do **automatically** (without an explicit per-action owner prompt) when operating in auto mode. It does not grant any permission; it only narrows what auto mode may do unprompted. All tool-level and repository-level permissions (`.claude/settings.json`, GitHub rulesets, branch protection) still apply independently.

## A. Scope separation

**Global (account-wide) policy** — conservative, minimal. Applies to any repository, including ones never inspected when this policy was written. No OpsIQ-specific fact (Vercel, Neon, PgBouncer, governance doc paths, ruleset IDs) is promoted into the global layer.

**Repo-scoped policy** — `/Users/apple/OPsIq` only. Everything specific to this project's infrastructure lives here and is not inferred for sibling repositories or anything else under the user's home directory.

## B. GLOBAL POLICY (all repos)

**Hard blocks — never auto-run, no exceptions:**
- `git push --force` to any remote branch
- Any force push (plain or `--force-with-lease`) to `main` or `master`
- Committing `.env*` (except explicit `*.example`/`*.sample`/`*.template`), `.keys/**`, private keys, API tokens, passwords, DB connection strings
- Printing, logging, or echoing a secret *value* (secret names may be referenced)
- Uploading any secret, credential, or confidential material to a public gist/pastebin/snippet service
- Weakening, disabling, or bypassing a security/governance/CI control to force a green result

**Soft blocks — owner approval required:**
- Merging any PR (squash/rebase/merge-commit) — CI green is never sufficient by itself
- Direct push to `main`/`master`
- `git push --force-with-lease` to any branch (see §C for eligibility conditions)
- Any command capable of mutating a non-local database, if target identity is ambiguous → fail closed
- Repository visibility or ruleset/branch-protection changes
- Secret rotation

**Safe by default:** read operations (log/diff/status/fetch/branch/show/ls-tree), typecheck/lint/build/unit-test commands, local disposable-DB tests, ordinary commits/pushes to feature branches, opening/updating draft PRs.

## C. REPO-SCOPED POLICY — `/Users/apple/OPsIq`

**Trust boundary.** Remote `github.com/arnab-netizen/OPsIq` is **PUBLIC** (verified via `gh repo view`). Every push to it is publication. Public visibility does not make confidential material safe to publish.

**Never let auto-mode publish, print, or transmit:** secrets, `.env*`, `.keys/**`, private keys, API tokens, DB URLs, credentials, DB dumps/backups, production exports, customer records, financial data, auth/session data, OAuth tokens, or internal incident evidence containing sensitive values.

**Secrets management.** GitHub Actions secrets and Vercel environment variables are actively used in this repo (confirmed: `secrets.*` referenced across 15+ workflows including `migrate-production.yml`, `scheduled-backup.yml`, `production-db-status.yml`, `smoke-production-dashboard.yml`). Secret *names* may be referenced; secret *values* must never be exposed, under any pretext (debugging, PR body, external paste, logs).

**Production database — identity, not naming.** A Neon endpoint is Production based on which Neon project/branch it resolves to, never on hostname text containing "prod" or "production" — the real hostname may contain neither. Applies to pooled (PgBouncer) endpoints, direct endpoints, primaries, and read replicas, and to any variable (`DATABASE_URL`, `PRODUCTION_DATABASE_URL`, `MIGRATION_DATABASE_URL`, or equivalent) resolving to that project/branch. Resolve the actual target before acting — never decide safety from the command name alone.

**Non-local DB mutation — owner approval required**, including (non-exhaustive): `prisma migrate deploy/reset`, `prisma db push`, `prisma db execute`, raw `psql` DDL/DML, migration/seed scripts against Staging or Production, Neon role/grant/branch/retention changes, schema/DB/user ownership changes, destructive maintenance scripts. **Exception (auto-OK):** a local, loopback-host, disposable database used purely for tests, with zero Staging/Production credentials involved. Ambiguous target → fail closed, require approval. This extends — does not replace — the destructive-operation boundaries already in `CLAUDE.md` (force-push to main, `git reset --hard`, live-DB migrations) by making target-resolution explicit rather than relying on literal command-name matching.

**Production read/export — owner approval required**, even though read-only, including: `pg_dump`, backups, snapshot downloads, bulk/CSV/JSON exports, copying tables to files, customer/financial/session/OAuth-token exports. Read-only ≠ safe when it materializes sensitive data outside the DB.

**Vercel Production — owner approval required** before: `vercel --prod`, invoking a Production deploy hook, promoting/rolling back Production, changing Production aliases/domains/env vars/project settings/runtime config. Preview deployments that cannot affect Production may run automatically.

**GitHub merge/branch.** Owner approval required before: any PR merge, any direct push to `main`, repository visibility changes, ruleset or classic branch-protection changes, deleting active remote branches, changing Production-related workflows.

`main` is actively protected by the repository ruleset **"Protect main"** (id `23054096`, `enforcement: active`, target `~DEFAULT_BRANCH` — verified via `gh api repos/arnab-netizen/OPsIq/rulesets/23054096`), enforcing: `deletion` protection, `non_fast_forward` protection, `pull_request`-only changes (required review-thread resolution: true; allowed merge methods: merge/squash/rebase), a strict `required_status_checks` gate (context `branch-protection`, integration 15368), and `bypass_actors: []` (`current_user_can_bypass: "never"`). The classic GitHub branch-protection REST endpoint (`/branches/main/protection`) returns 404 for this repo — that reflects only that *classic* protection isn't configured, and must **not** be read as `main` being unprotected; rulesets are the active enforcement mechanism here. This auto-mode policy is defense-in-depth layered on top of that ruleset, not a substitute for it, and must not assume GitHub enforcement is absent based on one legacy API's response.

**Force-push distinction:**
- *Hard block:* plain `git push --force`, anywhere; any force push to `main`, in any form.
- *Soft block (`--force-with-lease`):* eligible only when **all** hold — feature branch, not `main`, not shared with another operator (unless explicitly authorized), exact current remote head SHA verified immediately before push, lease pinned to that exact SHA (prefer `--force-with-lease=<ref>:<exact-old-sha>` over a bare lease), rewrite already validated, owner explicitly authorizes. If the remote head moved since verification → stop, do not overwrite, re-verify.

**Exact-SHA governance.** Before any merge, force-with-lease push, deployment, Production-acceptance run, Production DB action, or privileged infra action: re-verify current `main` SHA, PR head SHA, base SHA, and remote branch head. If any moved since a prior approval, that approval is stale — re-authorization required, never silently re-targeted. This formalizes `CLAUDE.md`'s existing exact-SHA merge policy and extends the same discipline to force-with-lease and infra actions.

**Neon/DB infra — owner approval required** for: branch create/delete, compute-setting changes, role/grant/ownership changes, retention/history changes, role rotation, pooled/direct topology changes, read-replica changes, backup/snapshot changes. Metadata-only inspection is auto-OK. Never print DB credentials.

**Backup policy.** Treat backup systems as Production-sensitive. Owner approval required for: schedule changes, retention changes, target changes, backup-credential provisioning, taking/restoring/deleting a Production backup, recovery-credential changes. Never upload Production DB artifacts to GitHub Actions artifacts.

**Customer/business data.** Sensitive classes: customer records, PII, finance records, purchase orders, customer-linked marketing records, owner approvals, compliance records, alert rules, audit logs, session tokens, password hashes, OAuth tokens, any governed Owner Mode data — matching `CLAUDE.md`'s governed-record list (`CustomerRecord`, `PurchaseOrder`, `MarketingCampaign`, `OwnerApprovalRequest`, `AlertRule`, `ComplianceDeadline`). None of it moves to public GitHub, public gist, paste sites, unrelated cloud storage, or third-party debugging tools without explicit approval and an approved trust boundary.

**Public paste/gist — hard block** on automatic upload of OpsIQ-sensitive material to any public gist/paste/snippet/temp-host service. Snippets may be shared only when verified free of secrets, credentials, sensitive business/customer data, or incident evidence.

**Protected infrastructure (owner approval for any mutation):** Production Vercel, Production Neon, IAM, RBAC, networking, production quotas/compute, DB roles, domains/DNS, Production deploy hooks, secrets, repo visibility/rulesets.

**CI behavior.** Auto-OK: inspect CI, read logs, run local tests, run disposable-DB tests, rerun non-destructive jobs. Owner approval required for CI actions that deploy Production, mutate Production DB, rotate secrets, restore backups, send customer communication, or execute financial transactions. Never weaken CI assertions to obtain green — consistent with `CLAUDE.md`'s owner-approval boundaries (no weakening auth/workspace enforcement/DTO redaction to make gates green) and PR cost-control rule 5 (no scope creep in fix commits).

**Claude/ECC usage.** ECC is already installed — do not reinstall, do not modify global ECC config without explicit request, do not duplicate hooks. Auto-mode may freely use installed ECC capabilities (planning, TDD, debugging, code/database/TypeScript/security/adversarial review, build repair) as long as actions stay inside the repo and never trigger a protected external mutation listed above.

**Safe auto-mode actions inside `/Users/apple/OPsIq`:** read files, search code, create/edit feature-branch files, run typecheck/lint/governance-scan/build/unit tests, run local disposable-Postgres tests, install already-declared deps with the existing package manager, inspect PRs/issues/CI, create ordinary feature-branch commits, push ordinary non-force feature-branch commits, open/update draft PR descriptions, run ECC specialist reviews. Still fail closed if a command unexpectedly targets Production or would produce sensitive output.

## D. Final consolidated gate list

**Soft blocks (owner approval):** non-local DB mutation · Production DB read/export that materializes sensitive data · Production Vercel change · Neon config mutation · PR merge · direct push to main · force-with-lease push · secret rotation · backup/restore · repo visibility/ruleset change · Production-related workflow dispatch · customer communication · financial transaction.

**Hard blocks (never automatic):** `git push --force` to any remote · any force push to `main` · committing `.env*`/`.keys/**` · committing private keys/tokens/passwords/DB URLs · committing Production DB dumps/backups · uploading sensitive Production data to public destinations · disabling security/governance controls to pass a task.

## E. Relationship to CLAUDE.md

This auto-mode policy does not supersede `CLAUDE.md`. It adds further automatic-execution restrictions on top of the repository's existing governance (hard rules, PR cost-control policy, destructive-operation boundaries, exact-SHA merge policy, owner-approval boundaries already defined there). Where both apply, follow both. On conflict, fail closed and apply the stricter rule unless the owner explicitly authorizes otherwise.
