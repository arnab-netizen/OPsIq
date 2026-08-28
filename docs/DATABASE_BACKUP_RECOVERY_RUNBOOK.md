# Database Backup & Recovery Runbook

**Status:** Draft engineering plan, not yet deployed. Closes the P2 "Backup/recovery
automation" item in `docs/opsiq/status/CURRENT_MAIN_CLOSURE_REGISTER.md`.

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
runbook, and one real, executed restore rehearsal proving the scripts work.

**Explicit gaps, not silently dropped:**
- Confirm actual Neon plan/PITR window against the live console (Section 1.1).
- Encryption-at-rest for backup artifacts beyond GitHub's own storage — owner
  decision, needs a new secret if wanted (Section 4).
- Off-GitHub external storage target (S3/R2/B2/etc.) — owner decision, needs a new
  secret and a new vendor account if wanted (Section 4).
- A rehearsal against the *actual* Prisma schema (171 migrations) rather than the
  representative schema used in this session's sandbox rehearsal — happens
  automatically the first time `restore-rehearsal.yml` runs against a real
  `scheduled-backup.yml` output.
