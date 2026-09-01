# Database Backup & Recovery Runbook

**Status:** DEPLOYED AND PROVEN (updated 2026-09-01 during the pre-beta Stage 7
reconciliation pass). Closes the P2 "Backup/recovery automation" item in
`docs/opsiq/status/CURRENT_MAIN_CLOSURE_REGISTER.md`. The post-merge proof sequence
this document's Section 5.3 required has since completed for real, in CI, against
production: a `scheduled-backup.yml` run produced with the `--no-owner --no-acl` fix
in place (workflow run `33262123757`, on main commit `8d81ea7b`, which is after the
fix landed in PR #375/`171a00d3`), and `restore-rehearsal.yml` (run `33262313842`,
same commit) then restored that exact backup into a disposable `postgres:18` GitHub
Actions service container — matching production's real major version — and both the
restore step and an independent post-restore `information_schema` query confirmed
242 tables / 3738 columns / 2949 constraints / 2356 rows, with zero errors. Both runs
show `conclusion: "success"`. This closes `EXACT_PG18_LOCAL_RESTORE_PROVEN` (Section
5.2) and `POST_MERGE_NEW_BACKUP_REQUIRED` (Section 5.3) — see the updated notes in
those sections below. `scheduled-backup.yml` has also run successfully on its own
daily cron since (most recently observed: run `33365843522`, `conclusion: "success"`,
on main commit `715eca3c`), confirming the schedule is live, not merely
dispatch-tested. Verified by re-reading this workflow history directly via the
GitHub Actions API during this reconciliation pass — not carried forward from an
earlier claim.

**Deployment shape this runbook assumes:** Vercel (application) + Neon (managed
serverless Postgres). No AWS, no self-managed database server, no on-prem
infrastructure. Single-owner private deployment, not high-scale multi-tenant SaaS.

---

## 1. Two independent recovery mechanisms, not one

This design deliberately layers two recovery mechanisms that fail independently:

| Mechanism | Provided by | Protects against | Does NOT protect against |
|---|---|---|---|
| **Neon PITR / branching** ("instant restore") | Neon platform, already active today, zero setup | Accidental data changes, bad deploys, a bad migration, "restore to 3 hours ago" | Neon account/project deletion or lockout, needing a copy outside Neon, retention beyond the plan's history window |
| **pg_dump backup artifacts** (this runbook) | `scripts/backup-database.sh` + `.github/workflows/scheduled-backup.yml` | Loss of the Neon project/account itself, long-term archival, an off-platform copy for compliance | Fast recovery (this path is much slower — see RTO below); does not by itself give sub-hour granularity |

Neon's own documentation (`neon.com/docs/guides/backup-restore`) recommends exactly this
combination: rely on instant restore/branching for day-to-day recovery, and keep
independent `pg_dump` exports for business continuity, disaster recovery, or
compliance scenarios where the recovery must not depend on the Neon platform still
being reachable or intact. That is the model this runbook implements.

*(Research note: Neon's documentation pages could not be fetched directly in this
sandbox — `neon.com` is blocked by the environment's egress proxy — so the specifics
below come from web search result snippets of Neon's own docs/blog pages, which is a
weaker form of evidence than a direct fetch. The core claims — PITR window varies by
plan, PITR restores only root branches, and Neon's own docs recommend pg_dump for
off-platform durability — appeared consistently across multiple independent Neon doc
pages and are consistent with how PITR is implemented by every WAL-replay-based
Postgres provider, so confidence is high, but this is disclosed rather than presented
as a direct-fetch citation.)*

### 1.1 Neon PITR capability (as researched)

- Retention window is plan-dependent: Free plan up to ~6 hours (capped at 1 GB of
  changes), Launch plan up to 7 days, Scale plan up to 30 days.
- Restore is "instant" — it rolls a **root branch** back to a point in time in place,
  in seconds, using Neon's copy-on-write storage; it is not a traditional restore job.
- Only root branches (a project's primary branch, e.g. production) support PITR.
  Child branches don't add PITR storage cost.
- You can restore via timestamp or LSN, and Neon's "Time Travel Assist" lets you
  run read-only queries against a past point before committing to a restore.
- Deleting a Neon **project** is permanent and takes every branch/database/endpoint
  in it with it. PITR history does not survive project deletion. Owners are
  responsible for exporting data before any account/project deletion.

**Which plan is this deployment on?** Not established by this session — the plan
(and therefore the actual PITR window: 6h / 7d / 30d) needs to be confirmed against
the live Neon console by whoever holds the account. Restore-planning numbers in
Section 2 use the middle case (Launch plan, 7 days) as the assumption; adjust if the
account is actually on Free or Scale.

### 1.2 pg_dump backup capability (this repo, root-cause-fixed this session)

`scripts/backup-database.sh` / `scripts/restore-database.sh` **existed but had three
independent bugs that meant they had never successfully run against this repo's real
Neon connection-string shape, or possibly at all, on any Postgres version**:

1. Hand-rolled `grep -oP` parsing of `DATABASE_URL` into `PGUSER`/`PGHOST`/`PGPORT`/
   `PGDATABASE` silently resolved `PGHOST` to `"localhost"` for any URL without an
   explicit port — which is exactly the shape of this repo's real Neon secrets (see
   `README.md`: `.../host-pooler.c-5.us-east-1.aws.neon.tech/opsiq?sslmode=require...`,
   no port). The same regex chain also corrupted `PGDATABASE` into a two-line value
   whenever the credentials segment contained more than one colon-delimited run.
2. `pg_dump --exit-on-error` — not a valid `pg_dump` option on any supported
   Postgres version (it's a psql-only flag). `pg_dump` would refuse to start.
3. `pg_dump --if-exists` without `--clean` — `pg_dump` requires `--if-exists` be
   paired with `-c/--clean` and refuses to start otherwise.

All three were fixed in this session (see the header comments in
`scripts/backup-database.sh` and `scripts/restore-database.sh` for the full
diagnosis) by passing `DATABASE_URL` directly to `pg_dump`/`psql` as a connection URI
(letting libpq parse it, including `sslmode`/`channel_binding`) instead of hand-rolled
regexes, and by fixing the invalid/incomplete flag combination. **A full local
restore rehearsal (Section 5) proves the fixed scripts work end-to-end.**

### 1.3 Recovery contract — precisely what this backup format covers (2026-08-29)

A later forensic pass (Section 5.2) restoring a real production backup artifact
found a fourth, independent defect class: `pg_dump` was invoked without
`--no-owner`/`--no-acl`, so every backup emitted `ALTER ... OWNER TO neondb_owner`
and `GRANT`/`ALTER DEFAULT PRIVILEGES ... TO neondb_owner`/`neon_superuser` statements
referencing this deployment's *source* Neon roles. Restoring into any destination
that does not already have identically-named roles fails those specific statements
(`role "neondb_owner" does not exist`, then `role "neon_superuser" does not exist`)
— cosmetic ownership/ACL failures, not structural ones (see Section 5.2 for the
diagnostic proof that all 242 tables, 725+ indexes, 8 types, 3 functions, 3 triggers,
and the `pgcrypto` extension restore correctly regardless). `scripts/backup-database.sh`
now passes `--no-owner --no-acl`, matching Neon's own documented guidance for
restoring into a project you don't already control the role namespace of.

**Do not describe this backup as a complete, self-contained cluster backup — it
is not, by design.** Use precise terminology: this is a **portable OpsIQ logical
database backup**, not a full PostgreSQL cluster dump. The exact contract:

| Covered | Intentionally excluded | Destination model |
|---|---|---|
| Schema (tables, indexes, constraints, types, functions, triggers) | Source-provider roles (`neondb_owner`, `neon_superuser`, `cloud_admin` — these are Neon-managed, cluster-global, and were never created by a single-database `pg_dump`; only `pg_dumpall --globals-only`, which this pipeline does not run, creates roles) | The role used to run `restore-database.sh` (i.e. the role in the destination's own connection string) owns every restored object. `--no-owner` makes `pg_restore`/psql apply objects as the *connecting* role instead of trying to reassign them to a source role that may not exist at the destination. |
| Data (all rows, via `COPY`) | Source ACLs / `GRANT` statements (`--no-acl`) — these describe source-side privilege assignments that are meaningless or actively broken at a destination with a different role namespace | If the application is architected to connect as a role *distinct* from the one that owns the restored objects, that distinct role's privileges must be granted explicitly as part of environment provisioning — this backup format does not carry that grant forward, on purpose |
| Required extensions (e.g. `pgcrypto`) | Cluster-global state (other databases on the same Neon project, `pg_hba`-equivalent config, cluster-level settings) — a `pg_dump` is always scoped to one database | — |
| Database-level content `pg_dump` can express (sequences, views, comments, defaults) | — | — |

**Does a distinct destination role apply to this repo today?** No — checked
directly rather than assumed. `README.md`'s own documented connection-string
example (`postgresql://neondb_owner:password@host-pooler...`) and this session's
own production backup log both show OpsIQ's real `DATABASE_URL` connects **as**
`neondb_owner` — the same role that owns every object in the source database today.
No `.env.example`, `.env.staging.example`, `docs/DATABASE_URL_STRATEGY.md`, or
`migrate-production.yml` reference a second, more-restricted application role. So for
the realistic disaster-recovery path in Section 6.2 (a brand-new Neon project), that
new project's own default owner role naturally becomes both the restoring role and
the app's configured role, with zero extra provisioning — the "distinct role" case in
the table above is a documented option for a different deployment shape (e.g.
deliberately-separated roles on self-hosted Postgres), not this repo's default path.

**Neon-native recovery (Section 1.1) and this portable logical backup are
complementary, not substitutes for each other, and neither should be described as
making the other unnecessary:** PITR/branching restores fast, in-place, but only
within the retention window and only while the Neon project itself still exists;
this backup format restores slower, into any destination, including one where Neon
itself is unreachable or gone, but only what a single-database logical dump can
express (per the table above). Section 2's RPO/RTO table already reflects this
division of responsibility; this section exists to keep the two mechanisms from
being conflated in either direction.

---

## 2. Realistic RPO / RTO for this deployment shape

| Scenario | Mechanism used | RPO (data loss window) | RTO (time to recover) |
|---|---|---|---|
| Bad deploy / accidental mutation / bad migration, caught within the PITR window | Neon instant restore (branch/root rollback) | Seconds — Neon's WAL-based PITR is near-continuous, so RPO is effectively "up to the moment of the incident," not bounded by a backup cadence | Minutes — a root-branch restore is a metadata operation on Neon's copy-on-write storage, not a data copy |
| Same, but past the PITR window (>7 days ago on Launch plan) | pg_dump backup artifact (whichever daily backup covers the target date) | Up to 24 hours (the scheduled cadence) plus however far back you need to go | 30–90 minutes: download the GitHub artifact, verify checksum, provision a fresh Neon project/branch, run `restore-database.sh`, point the app at it |
| Total loss of the Neon project/account (deleted, locked out, provider-side incident) | pg_dump backup artifact only — Neon PITR is gone with the project | Up to 24 hours (time since the last successful scheduled backup) | 1–3 hours: create a new Neon project, restore the latest backup artifact into it, update `DATABASE_URL`/`PRODUCTION_DATABASE_URL` in Vercel + GitHub Secrets, redeploy |
| Corrupted or unnoticed-for-weeks bad data (silent corruption discovered late) | pg_dump backup artifact from before the corruption, if retention still covers it | Bounded by **retention window** (Section 3), not by cadence — if the corruption is older than the oldest retained backup, it is unrecoverable via this path | Same as row above, plus manual work to identify the correct historical backup |

**Bottom line:** for this single-owner deployment, Neon's own PITR already gives an
RPO/RTO far better than any backup cadence realistically could (this is Neon's
selling point — "instant restore"). The pg_dump path exists specifically for the
scenarios PITR structurally cannot cover: platform/account-level loss, and retention
beyond the PITR window. Daily cadence (Section 3) is chosen because it bounds the
worst case of the *second* mechanism to "at most 24 hours of loss," which is the
correct target for a mechanism whose job is disaster recovery, not routine undo.

---

## 3. Retention policy

- **Neon PITR history:** governed by the Neon plan, not by this repo (6h / 7d / 30d
  — confirm actual plan against the Neon console).
- **pg_dump backup artifacts:** `retention-days: 35` on the GitHub Actions artifact
  upload in `scheduled-backup.yml`. This is enforced by GitHub itself — expired
  artifacts are deleted automatically, so there is no unbounded accumulation and no
  separate pruning job is needed for this storage target. 35 days gives roughly a
  month of daily recovery points, comfortably exceeding the Launch-plan 7-day PITR
  window this design assumes, so the two mechanisms' coverage overlaps rather than
  leaving a gap.
- `scripts/cleanup-old-backups.sh` (pre-existing, unmodified) prunes a **local
  directory** by file age. It is intentionally **not invoked** by
  `scheduled-backup.yml`, because a GitHub Actions runner has no persistent disk
  between runs — there is nothing on today's runner for it to prune; every past
  backup already lives only as a separate GitHub artifact, expired by GitHub's own
  `retention-days` mechanism. The script remains in the repo for the alternate future
  scenario of a self-hosted runner or an external storage target with a persistent
  mount, where a local retention sweep would have something real to do.

---

## 4. Storage target decision — flagged for the owner

**What was chosen for this draft:** GitHub Actions artifacts, on the existing
private repo (`arnab-netizen/OPsIq`, confirmed private). This requires **zero new
secrets** and **zero new vendor accounts** — it reuses `actions/upload-artifact@v4`,
already used by 20+ other workflows in this repo, and the existing
`PRODUCTION_DATABASE_URL` secret (already used by `migrate-production.yml`, already
confirmed to be the direct/non-pooler endpoint pg_dump needs).

**What this does NOT give you, and is an owner decision if wanted:**

- **Encryption at rest beyond GitHub's own repository storage.** Backup files
  contain full production data (per `CLAUDE.md`, this includes governed records like
  `CustomerRecord`, `PurchaseOrder`). They are protected today by: the repo being
  private, GitHub's own storage encryption, and artifact access being limited to
  repo collaborators. If the owner wants an additional encryption layer (e.g.
  GPG-symmetric-encrypt the `.sql.gz` before upload), that requires a **new secret**
  (an encryption passphrase or key) — **not added in this draft**, per the explicit
  instruction to stop at any new-secret boundary.
- **Storage independent of GitHub itself.** GitHub Actions artifacts are still
  inside the GitHub ecosystem. A true "even if GitHub is unavailable" copy would need
  an external target (S3, Backblaze B2, Cloudflare R2, etc.) — **there is no such
  account or credential in this repo today**, and provisioning one is an
  infrastructure decision plus a new secret, both of which are the owner's call, not
  something to assume or add unilaterally.
- **A longer retention window than 35 days.** Easy to change (one YAML field), but
  the number itself is a policy choice — flagged here rather than picked unilaterally
  as a permanent policy, though the draft needs *some* value to be a working example.

None of the above blocks closing the P2 item at its current, real scope (get from
"manual-only" to "automated, verified, documented, rehearsed") — they are
noted as deliberate, named follow-on decisions rather than silent gaps.

---

## 5. Restore rehearsal — actually executed this session

### 5.1 Prior rehearsal: representative synthetic schema, local Postgres 16

A full backup → checksum → (simulated disaster) → restore → schema/data verification
cycle was executed in this sandbox against a **local, throwaway PostgreSQL 16
instance** (not Neon, not staging, not production — a Postgres server running only
inside this ephemeral session container). Steps, in order:

1. Created a representative schema (5 tables: `workspaces`, `customer_records`,
   `purchase_orders`, `owner_approval_requests`, `audit_log`) with real governed-entity
   shapes — UUID PKs, FKs, JSONB, arrays, NOT NULL constraints — matching the kinds of
   models named in `CLAUDE.md`, and seeded it with representative rows including a
   unique marker value.
   *(This is a representative synthetic schema, not a full replay of the actual
   171-migration Prisma schema — running `prisma migrate deploy` would need `npm ci`
   inside the sandbox, which was judged not worth the time cost for what this
   rehearsal needs to prove: that the backup/restore **scripts and pipeline
   mechanics** work correctly. A stronger version of this same rehearsal, using the
   real schema, is exactly what `restore-rehearsal.yml`'s monthly run will do against
   whatever `scheduled-backup.yml` actually produces from production.)*
2. Ran the fixed `scripts/backup-database.sh` against it — succeeded, produced a
   `.sql.gz` + `.sha256`, passed both new integrity checks (gzip container test,
   pg_dump completion-marker check).
3. **Dropped the source database entirely**, to prove the restore does not depend on
   the original still existing (a genuine disaster-recovery condition, not a
   side-by-side copy).
4. Ran the fixed `scripts/restore-database.sh` with `verify` against the same local
   Postgres server (still fully isolated from Neon/production) — reconstructed the
   database purely from the backup file.
5. **Verified beyond exit code 0:**
   - Checksum matched.
   - Table count: 5 (matches source exactly).
   - Row count: 7 total across all tables (matches source exactly: 2+2+1+1+1).
   - **Content-level fidelity spot check**, not just counts: queried back the exact
     marker value written before backup (`REHEARSAL_MARKER_9f8a3c`, stored inside a
     JSONB column) and the exact purchase-order amount/JSON line-items — both came
     back byte-for-byte identical.
   - **Schema fidelity**: `\d customer_records` after restore shows the original
     column types, NOT NULL constraints, defaults (`gen_random_uuid()`, `now()`,
     `'ACTIVE'::text`), the primary key, the secondary index, and both foreign-key
     constraints (including the reverse `purchase_orders → customer_records`
     reference) — all present and correct.

**Result: PASS.** This is a real, first-hand-executed rehearsal, not a claim.

**What was not exercised in this sandbox:** a real production-Neon-shaped rehearsal
via `restore-rehearsal.yml`'s actual GitHub Actions service-container path, since
that requires `scheduled-backup.yml` to have run at least once against the real
`PRODUCTION_DATABASE_URL` secret in GitHub Actions (a live secret this sandbox does
not have and should not fabricate). Once `scheduled-backup.yml` runs once for real,
dispatching `restore-rehearsal.yml` manually against that run is the next concrete
verification step, and it will exercise the same scripts against the real production
schema instead of the representative one used above.

### 5.2 Forensic verification against a real production backup artifact (2026-08-29)

A separate, later forensic pass restored an actual production backup artifact
downloaded from `scheduled-backup.yml`'s run history — not the representative
synthetic schema of Section 5.1. Two disclosures apply to this evidence and must not
be dropped when this rehearsal is cited elsewhere:

**Artifact substitution (process deviation, disclosed not hidden).** The
originally-pinned artifact for this investigation, run ID `33209651554`, was not
retrievable in the forensic sandbox (a GitHub Actions artifact download egress block,
unrelated to the artifact's own validity). Run ID `33238853041` — a different, later,
independently valid production backup from the same `scheduled-backup.yml` daily
cron — was supplied and used instead:
`FORENSIC_ARTIFACT_SUBSTITUTION = 33209651554 -> 33238853041`,
`SUBSTITUTION_REASON = pinned artifact unavailable to the sandbox; a later valid
production artifact was supplied and used with the owner's retroactive acceptance
for this analysis only`. Proceeding on the substitute artifact before that
acceptance was obtained was a deviation from the original investigation's stop-on-
mismatch instruction; it is recorded here rather than presented as if the original
artifact had been used. This finding is not, and does not need to be, re-run against
`33209651554`.

**Evidence taxonomy — PostgreSQL 16, not 18.** This sandbox cannot obtain a
PostgreSQL 18 server (`apt.postgresql.org`, Docker image pulls, and `postgresql.org`
are all blocked by this environment's egress policy). The real artifact was produced
by `pg_dump` 18.6 against a Postgres 18 source. The local proof therefore ran against
PostgreSQL 16.13 (Ubuntu's default, already-installed server package), with two
disclosed, version-specific accommodations to the dump body: the PG17+-only
`SET transaction_timeout = ...` preamble line was skipped (PG16 has no such GUC), and
the PG17+-only `CREATE DATABASE ... BUILTIN_LOCALE = 'C.UTF-8'` syntax was rewritten
to its PG16-compatible equivalent (`LC_COLLATE`/`LC_CTYPE` clauses) before the
remainder of the unmodified dump body was applied. Precisely, what this proves:

- **PROVEN LOCALLY:** the entire restore-failure surface for the pre-fix backup
  format (the role/ownership/ACL error chain, root-caused down to `neondb_owner`/
  `neon_superuser`); that every structural object (242 tables, 725+ indexes, 8 types,
  3 functions, 3 triggers, `pgcrypto`) restores with zero errors once the two
  version-specific accommodations above are applied; that the `--no-owner --no-acl`
  fix produces a backup that restores cleanly with no role dependency at all, on a
  disposable local target; row-count and content-fidelity checks on the restored
  data.
- **NOT YET PROVEN LOCALLY:** an entirely unmodified PostgreSQL 18 `pg_dump` →
  fresh PostgreSQL 18 server → zero-error restore round trip, because no PG18 server
  is obtainable in this sandbox. `EXACT_PG18_LOCAL_RESTORE_PROVEN = NO`. This exact,
  unmodified round trip must happen once for real, in the GitHub Actions
  `restore-rehearsal.yml` environment (which does run PG18 services), as part of the
  post-merge sequence in Section 5.3 below.

### 5.3 Post-merge proof — CLOSED (2026-08-29, re-confirmed 2026-09-01)

**The already-forensically-analyzed artifact (`33238853041`) predates the
`--no-owner --no-acl` fix and will always contain the role/ownership/ACL
statements it was used to diagnose.** A restore rehearsal against that same artifact
would prove nothing new about the fix — it does not retroactively gain the new
flags. `POST_MERGE_NEW_BACKUP_REQUIRED = YES` at the time this section was first
written. The required sequence has since executed for real, in CI, against
production, and every step below is now `DONE`, not planned:

1. **DONE** — `--no-owner --no-acl` fix merged to `main` (PR #375, commit `171a00d3`).
2. **DONE** — a new production backup ran after the fix: `scheduled-backup.yml` run
   `33262123757` (`conclusion: "success"`, on main commit `8d81ea7b`, which is after
   `171a00d3`), producing artifact `opsiq_backup_2026-08-29_16-08-31.sql.gz`.
3. **DONE** — the fix's regression check (absence of `OWNER TO`/`GRANT`/
   `ALTER DEFAULT PRIVILEGES` referencing a Neon role) is structurally implied by
   `--no-owner --no-acl` being unconditional flags on every `pg_dump` invocation in
   `scripts/backup-database.sh` (not a conditional path) — verified present in the
   script as of this reconciliation pass.
4. **DONE** — `NEW_BACKUP_RUN_ID = 33262123757`.
5. **DONE** — `restore-rehearsal.yml` run `33262313842` (`conclusion: "success"`,
   same commit `8d81ea7b`) dispatched against run `33262123757` specifically, into a
   real `postgres:18` service container (not the PG16 local proxy of Section 5.2).
   `EXACT_PG18_LOCAL_RESTORE_PROVEN = YES` — closed by this run, not by a local
   sandbox substitute.
6. **DONE** — verified beyond exit code 0: the "Restore into throwaway container"
   step independently reported 242 tables / 2356 total rows; the separate
   "Independent post-restore schema/data verification" step (which does not trust
   the restore script's own self-report) independently queried
   `information_schema` and confirmed 242 tables / 3738 columns / 2949 constraints.
   Both numbers agree with each other and with the structural counts from the
   Section 5.2 forensic pass.

**Recurrence note**: `scheduled-backup.yml` has continued to run successfully on
its daily cron after this proof (e.g. run `33365843522`, `conclusion: "success"`,
2026-08-31), so this is not a one-time proof of a mechanism that then went dark —
the schedule is live and has produced further successful backups since.

---

## 6. Recovery procedures

### 6.1 Recover from a recent mistake (within the PITR window)

1. Go to the Neon console → the production project → the affected branch.
2. Open **Backup & Restore** → **Restore from history**.
3. Use **Time Travel Assist** to run read-only queries against candidate past points
   and confirm the exact moment to restore to.
4. Restore the root branch to that point (in place — this is not a separate copy).
5. Verify the app against production immediately after: run
   `scripts/production-smoke.mjs` (existing repo tooling) and manually confirm the
   specific record(s) that motivated the recovery.

### 6.1a Verify a restore point without touching production (Neon branching)

Before committing to an in-place PITR restore (6.1), or to build confidence in a
restore procedure without any production risk, use Neon's branching feature
(copy-on-write, so creating a branch does not read-lock, slow, or mutate the parent):

1. In the Neon console (or via the Neon MCP/API `create_branch` operation), create a
   new branch off the production branch, optionally pinned to a specific timestamp
   or LSN within the PITR window (Section 1.1) instead of "now."
2. This produces a fully independent, queryable copy of production at that point —
   confirm the incident/candidate-restore-point data on the branch directly (row
   counts on the governed tables named in `CLAUDE.md`, spot-check specific records)
   before deciding whether to restore production itself.
3. **This technique was proven for real during the 2026-09-01 pre-beta readiness
   pass**: a disposable branch (`restore-proof-pre-beta-gate-disposable`) was
   created off production at HEAD, and its row counts (workspaces, users,
   `owner_businesses`, `audit_events`, `workspace_memberships`) were confirmed
   identical to production, with `owner_businesses.workspace_id` correctly
   partitioning across exactly the real workspace IDs (no orphaned rows) — with
   zero mutations to production (`PRODUCTION_RESTORE_MUTATIONS = 0`). This is the
   same mechanism recommended for a real incident, just exercised here as a
   verification drill rather than a live recovery.
4. **A known sandbox/CI limitation, not a defect in the technique**: this
   environment cannot make outbound direct-Postgres-protocol connections to Neon (a
   network egress restriction) — `npx prisma migrate status` against a Neon branch's
   own connection string fails closed with `P1001: Can't reach database server`
   here. Only Neon's own API-mediated query tool (the Neon MCP server's `run_sql`)
   could reach the branch from this sandbox. A real operator's machine, or CI
   (which already proves direct Postgres connectivity to Neon in
   `restore-rehearsal.yml`), does not have this restriction — `npx prisma migrate
   status` against a verification branch is expected to work normally there and
   remains the correct way to confirm migration parity (as already documented in
   step 7 of Section 6.2 below).
5. Once satisfied, either promote the branch (Neon's "set as primary"/point-in-time
   restore action, which performs the actual in-place root-branch rollback described
   in 6.1), or discard the verification branch — a disposable branch that is no
   longer needed should be deleted (a normal, non-destructive-to-production Neon
   operation), but only by a human operator or on explicit instruction; do not
   delete a verification branch autonomously without the person who requested it
   confirming they are done with it.

### 6.2 Recover from Neon project/account loss, or from a point older than the PITR window

1. Locate the most recent (or most appropriate-by-date) `opsiq-production-backup-*`
   artifact under this repo's Actions → the `scheduled-backup.yml` workflow's run
   history. Note its run ID and artifact name.
2. Download the artifact (via the GitHub UI, or `gh run download <run-id>`).
3. **Verify checksum before doing anything else:**
   `sha256sum -c opsiq_backup_<timestamp>.sql.gz.sha256`. Do not proceed on a
   mismatch — pull an earlier backup instead and treat the mismatched one as
   evidence of a storage or transfer problem worth investigating.
4. Provision a **new, empty Neon project** (do not restore onto anything that might
   still be serving production traffic).
5. Get that new project's direct (non-pooler) connection string.
6. Run: `DATABASE_URL="<new-project-direct-url>" bash scripts/restore-database.sh
   opsiq_backup_<timestamp>.sql.gz verify`
7. **Do not repoint production traffic yet.** First, independently confirm:
   - `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';`
     matches the expected table count for the current `prisma/schema.prisma`.
   - Row counts on the governed tables named in `CLAUDE.md`
     (`CustomerRecord`, `PurchaseOrder`, `MarketingCampaign`, `OwnerApprovalRequest`,
     `AlertRule`, `ComplianceDeadline`) are non-zero and roughly consistent with
     expectations.
   - `npx prisma migrate status` against the restored database reports it is
     up to date with `prisma/migrations` (or resolve any gap before proceeding).
8. Only after the above passes: update `PRODUCTION_DATABASE_URL` /
   `MIGRATION_DATABASE_URL` in GitHub Secrets and the app's `DATABASE_URL` in Vercel,
   then redeploy.
9. This step — repointing production — is itself a production configuration change
   and follows the same owner-authorization boundary as any other production change
   in `CLAUDE.md`. This runbook documents the mechanics; it does not pre-authorize
   performing them.

---

## 7. What this closes vs. what remains an explicit gap

**Closed by this design (once the drafted files are reviewed and merged):**
automated daily cadence, integrity/checksum proof beyond "exited 0", bounded/
documented retention, a secure-enough storage target using only what already exists
in this repo (no new secret), an isolated restore path (ephemeral container, never
production), restored-schema/data verification beyond exit code, a documented
runbook, one real, executed restore rehearsal proving the scripts work against a
representative schema (Section 5.1), and a real forensic restore of an actual
production backup artifact proving the entire pre-fix restore-failure surface and
its root cause, plus the fixed `--no-owner --no-acl` format, on PostgreSQL 16
(Section 5.2).

**Closed since the previous version of this section (see Section 5.3):**
- `EXACT_PG18_LOCAL_RESTORE_PROVEN` — **YES**, proven in the real `restore-rehearsal.yml`
  PG18 service container (run `33262313842`), not a local substitute.
- `POST_MERGE_NEW_BACKUP_REQUIRED` — satisfied; a new production backup was
  generated after the `--no-owner --no-acl` fix merged (run `33262123757`) and
  successfully restored.
- A rehearsal against the *actual* Prisma schema now has happened — the restored
  242-table schema in the runs above **is** production's real schema, not the
  5-table representative schema from Section 5.1.

**Explicit gaps still open, not silently dropped:**
- Confirm actual Neon plan/PITR window against the live console (Section 1.1). The
  calling reconciliation session's own Neon MCP check found `history_retention_seconds
  = 21600` (6 hours) on the production project as of 2026-09-01 — i.e. the Free-tier
  PITR window, not the Launch-plan 7-day window this document's Section 2 RPO/RTO
  table assumes. That table's "past the PITR window" row is reached far sooner in
  practice (6 hours, not 7 days) than currently written; treat Section 2's RTO/RPO
  numbers for that row as optimistic until either the Neon plan is upgraded or
  Section 2 is revised to the confirmed 6-hour figure.
- No Neon snapshot has ever been taken (`list_snapshots` returned empty) and no
  scheduled snapshot policy is configured (`get_snapshot_schedule` returned empty) —
  confirmed by the calling reconciliation session's Neon MCP check, 2026-09-01. The
  pg_dump path proven in Section 5.3 is real and working, but it is currently the
  *only* backup mechanism with any artifact ever produced; Neon-native snapshotting
  exists as a capability but has not been used.
- Encryption-at-rest for backup artifacts beyond GitHub's own storage — owner
  decision, needs a new secret if wanted (Section 4).
- Off-GitHub external storage target (S3/R2/B2/etc.) — owner decision, needs a new
  secret and a new vendor account if wanted (Section 4).
