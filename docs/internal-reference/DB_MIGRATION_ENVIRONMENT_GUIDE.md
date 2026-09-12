# DB Migration Environment Guide

Safe, authoritative guide for applying the Owner Recovery V1 migration (and all
future migrations) from a network-enabled environment. No real secrets appear in
this file. `.env.local` was NOT modified by this guide.

## 1. Current config truth

- `prisma.config.ts` resolves the Prisma CLI datasource URL as:
  `MIGRATION_DATABASE_URL || DATABASE_URL || DATABASE_URL_TEST || <local default>`
  (updated in this task to add `MIGRATION_DATABASE_URL` as the highest-priority
  source; behavior is unchanged when it is unset).
- `schema.prisma` `datasource db` declares only `provider = "postgresql"` — it has
  **no `url` and no `directUrl`**; the URL comes from `prisma.config.ts`.
- `.env.local` (developer-local, gitignored intent; do not commit real values):
  - `DATABASE_URL` = **placeholder** (`REPLACE_POOLED_HOST/REPLACE_DB`) — not usable.
  - `DIRECT_URL` = real Neon credentials, but the host is a **POOLED** endpoint
    (contains `-pooler`) and **Prisma does not read `DIRECT_URL`**.
  - `DATABASE_URL_TEST` = real Neon credentials, also a **POOLED** endpoint.
- Net: there is currently **no true non-pooler direct URL wired into Prisma**, and
  the variable Prisma would read (`DATABASE_URL`) is a placeholder locally.
- The prior migration blocker was **network egress** (this sandbox blocks TCP 5432),
  not missing credentials — but the config issues above must still be fixed so a
  network-enabled run does not accidentally target a placeholder or pooler URL.

## 2. Correct required env variables

| Variable | Purpose | Endpoint type | Where to set |
|---|---|---|---|
| `DATABASE_URL` | App runtime connections | Neon **pooled** (`-pooler`) | deploy/runtime env |
| `MIGRATION_DATABASE_URL` | Prisma CLI migrations only | Neon **direct** (no `-pooler`) | deploy/CI env (migration step) |
| `DATABASE_URL_TEST` | Test database | local or test Neon | CI/test env |
| `DIRECT_URL` | **deprecated/ambiguous** | — | do not rely on; not read by Prisma |

Never commit real values for any of these. `.env.example` carries placeholders only.

## 3. Neon pooled URL vs direct URL

- **Pooled** endpoint: host contains `-pooler` (e.g. `ep-xxxx-pooler.REGION.aws.neon.tech`).
  Routes through Neon's PgBouncer. Ideal for the **app runtime** (many short-lived
  connections). **Not** safe for migrations — transaction-pooling mode breaks
  Prisma's advisory locks and some DDL/session features.
- **Direct** endpoint: host **without** `-pooler` (e.g. `ep-xxxx.REGION.aws.neon.tech`).
  A normal Postgres session. Required for **migrations** (`prisma migrate deploy`).

To get the direct host from a pooler host: remove the `-pooler` segment from the
Neon endpoint hostname (keep the same credentials/db/params).

## 4. Which URL the app runtime should use

`DATABASE_URL` = the **pooled** Neon URL. (`src/lib/db.ts` reads
`DATABASE_URL || TEST_DATABASE_URL` and uses the Neon/pg adapter at runtime.)

## 5. Which URL Prisma migration should use

`MIGRATION_DATABASE_URL` = the **direct (non-pooler)** Neon URL. With the updated
`prisma.config.ts`, the Prisma CLI uses `MIGRATION_DATABASE_URL` first. If you
cannot set it, set `DATABASE_URL` to the direct URL for the migration step only —
but the clean path is `MIGRATION_DATABASE_URL`.

## 6. Safe migration command

From a network-enabled environment with egress to Neon **port 5432**:

```bash
# Set ONLY in the deploy/CI shell — do NOT edit committed files, do NOT echo it.
export MIGRATION_DATABASE_URL="<neon-DIRECT-non-pooler-url>"   # host WITHOUT "-pooler"

npx prisma validate           # sanity: schema valid
npx prisma migrate status     # should list 20260610120000_owner_recovery_mode as pending
npx prisma migrate deploy     # applies it (additive: 6 tables, 8 FKs, 14 indexes)
```

`prisma migrate deploy` is non-destructive: it only applies pending migrations.

## 7. Unsafe commands to avoid

- `npx prisma migrate reset` — drops & recreates the schema (DESTRUCTIVE).
- `npx prisma db push` — bypasses migration history; can drop columns/data.
- Any manual `DROP` / `TRUNCATE` / schema reset.
- Pointing `MIGRATION_DATABASE_URL`/`DATABASE_URL` at a **pooler** host for migration.
- Running migrations against a **placeholder** URL (the current local `DATABASE_URL`).
- Committing any real connection string or secret.

## 8. How to verify the migration applied (read-only)

```sql
-- migration recorded
SELECT migration_name FROM _prisma_migrations
WHERE migration_name = '20260610120000_owner_recovery_mode';

-- six tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('owner_businesses','owner_metric_snapshots','recovery_cycles',
                     'recovery_findings','recovery_actions','recovery_verifications');

-- unique constraint on the snapshot period
SELECT indexname FROM pg_indexes
WHERE tablename='owner_metric_snapshots' AND indexdef ILIKE '%UNIQUE%';

-- foreign keys present (expect 8 across the recovery tables)
SELECT conname FROM pg_constraint
WHERE contype='f' AND conrelid::regclass::text LIKE ANY (ARRAY['owner_%','recovery_%']);
```
Or simply: `npx prisma migrate status` → "Database schema is up to date!".

## 9. How this affects Module 1 (Owner Recovery V1)

- The Owner Recovery V1 code, the migration file
  `prisma/migrations/20260610120000_owner_recovery_mode/migration.sql`, the
  `/owner/recovery` route, and the `/api/owner/recovery/*` APIs are already in HEAD
  (commit `5fc46a0`) and locally runtime-proven.
- The only remaining step to make Module 1 usable on a real DB is applying this
  migration to the real/staging Neon database — which requires (a) a reachable
  network path to Neon:5432 and (b) the **direct** URL via `MIGRATION_DATABASE_URL`.
- This guide + the `prisma.config.ts` change remove the risk of accidentally
  migrating against the placeholder `DATABASE_URL` or a pooler endpoint.

## 10. Final checklist before running migration

- [ ] You are in a network-enabled environment with egress to Neon **:5432**.
- [ ] `MIGRATION_DATABASE_URL` is set to the **direct (non-pooler)** Neon URL.
- [ ] The host in `MIGRATION_DATABASE_URL` does **not** contain `-pooler`.
- [ ] The target DB is the intended **staging/dev** database (not production unless explicitly confirmed safe).
- [ ] `npx prisma validate` passes.
- [ ] `npx prisma migrate status` shows `20260610120000_owner_recovery_mode` pending.
- [ ] You will run **`npx prisma migrate deploy`** (never `reset` / `db push`).
- [ ] No real secret is committed; `.env.local`/deploy secrets stay out of git.
- [ ] After deploy: run the §8 read-only checks (or `migrate status`) to confirm.
