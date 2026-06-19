# Aggregate Locks Failed Migration Forensic Report

**Generated:** 2026-06-19
**Branch:** `claude/cool-ptolemy-dxrpm7`
**Migration under investigation:** `20260511_add_aggregate_locks`
**Prisma error:** P3009
**CI run investigated:** `27798653064` (Migrate Neon Test Database workflow)

---

## Classification

**B — Migration partially executed: all schema objects exist, `_prisma_migrations` row has `failed_at` set**

---

## Root Cause

A ghost migration (`1778679447_add_aggregate_locks`) was created via an out-of-band Prisma CLI session on 2026-05-13. This ghost migration ran all three SQL statements in `20260511_add_aggregate_locks/migration.sql` before the tracked migration was ever deployed:

1. `CREATE TABLE IF NOT EXISTS aggregate_locks (...)` — table created
2. `CREATE INDEX IF NOT EXISTS idx_aggregate_locks_workspace ON aggregate_locks(workspace_id)` — index created
3. `ALTER TABLE canonical_events ADD CONSTRAINT unique_event_number_per_aggregate UNIQUE (...)` — constraint created

On 2026-05-21 at 21:08:27 UTC, the `migrate-neon-test.yml` workflow ran `prisma migrate deploy`. Statements 1 and 2 were no-ops (IF NOT EXISTS guards). Statement 3 (`ADD CONSTRAINT`) has no idempotency guard — it failed immediately with "constraint already exists". Prisma recorded `failed_at` in `_prisma_migrations` for this migration row.

`prisma migrate status` displays this migration as "last common migration" without surfacing the `failed_at` flag. `prisma migrate deploy` checks `failed_at` and throws P3009, blocking all 22 pending migrations from being applied.

---

## Evidence

**CI log (run 27798653064), exact error:**
```
Error: P3009

migrate found failed migrations in the target database, new migrations will not be applied.
The `20260511_add_aggregate_locks` migration started at 2026-05-21 21:08:27.539789 UTC failed
```

**Migration SQL (prisma/migrations/20260511_add_aggregate_locks/migration.sql):**
```sql
CREATE TABLE IF NOT EXISTS aggregate_locks (      -- statement 1: IF NOT EXISTS, safe no-op
  aggregate_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  workspace_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (aggregate_id, aggregate_type, workspace_id)
);
CREATE INDEX IF NOT EXISTS idx_aggregate_locks_workspace ON aggregate_locks(workspace_id);  -- statement 2: IF NOT EXISTS, safe no-op
ALTER TABLE canonical_events                      -- statement 3: NOT idempotent — FAILED
ADD CONSTRAINT unique_event_number_per_aggregate
UNIQUE (aggregate_id, aggregate_type, workspace_id, event_number);
```

**Schema state in DB (confirmed via ghost migration):**
- `aggregate_locks` table: EXISTS
- `idx_aggregate_locks_workspace` index: EXISTS
- `unique_event_number_per_aggregate` constraint on `canonical_events`: EXISTS

All schema objects from this migration are present and correct in the database. The migration's intended state IS fully applied. Only the `_prisma_migrations` metadata row is incorrect (has `failed_at` set instead of `finished_at`).

---

## Migration Status

| Object | Status in DB |
|---|---|
| `aggregate_locks` table | ✅ EXISTS (created by ghost migration 2026-05-13) |
| `idx_aggregate_locks_workspace` index | ✅ EXISTS (created by ghost migration 2026-05-13) |
| `unique_event_number_per_aggregate` constraint | ✅ EXISTS (created by ghost migration 2026-05-13) |
| `_prisma_migrations` row for `20260511_add_aggregate_locks` | ❌ `failed_at` set (should be `finished_at`) |
| Pending migrations blocked by P3009 | 22 migrations (none applied since 2026-05-21) |

---

## Safe Resolution

**`prisma migrate resolve --applied`**

This command updates only the `_prisma_migrations` metadata row — it sets `finished_at` and clears `failed_at` for the named migration. It does not execute any SQL, does not touch schema, does not modify data.

This is correct because all schema objects the migration was meant to create already exist in the database. Marking it as applied is an accurate description of the actual database state.

**Why NOT `--rolled-back`:** Using `--rolled-back` would mark the migration as rolled back and instruct `migrate deploy` to attempt running it again. Re-running statement 3 (`ADD CONSTRAINT`) would fail again with "constraint already exists" — same P3009 would recur.

---

## Exact Command

```bash
npx prisma migrate resolve --applied 20260511_add_aggregate_locks
```

**Environment requirements:**
- Must use `MIGRATION_DATABASE_URL` (direct Neon URL, not pooler, not the `TEST_DATABASE_URL` placeholder)
- Must be run against the Neon TEST database — same database targeted by `migrate-neon-test.yml`
- Safe to run from GitHub Actions workflow or a local machine with the correct direct URL

**Recommended execution path:** Add a new gated `workflow_dispatch` workflow `.github/workflows/resolve-failed-migration.yml` that accepts the migration name as input and runs `npx prisma migrate resolve --applied <name>`, subject to the same four safety gates as `migrate-neon-test.yml`. Alternatively, run from a local machine with `MIGRATION_DATABASE_URL` set to the Neon direct (non-pooler) URL.

---

## Risk

**LOW**

- `prisma migrate resolve --applied` modifies only one row in `_prisma_migrations` (the Prisma internal tracking table)
- No application schema tables are touched
- No application data is modified
- The operation is the intended recovery path for this exact P3009 scenario, documented in the Prisma migration guide
- If run against the wrong database by mistake: only `_prisma_migrations` metadata is affected; can be corrected by setting `failed_at` back or by running `--rolled-back` to revert the resolve

---

## Can `migrate deploy` Continue Afterwards

**YES**

After `prisma migrate resolve --applied 20260511_add_aggregate_locks` succeeds:
- `_prisma_migrations` will show the migration as applied (no `failed_at`)
- `prisma migrate deploy` will no longer throw P3009
- The 22 pending migrations will be applied in order
- Re-triggering `migrate-neon-test.yml` will complete without the P3009 error
- After all 22 migrations apply, re-trigger LANE_A (`DB Verification` workflow, `use_neon_secrets=true`) to confirm 174/174 tests pass

---

## Recommended Resolution Sequence

1. **Run `prisma migrate resolve --applied 20260511_add_aggregate_locks`** (from GitHub Actions or local machine with direct Neon URL)
2. **Re-trigger `migrate-neon-test.yml`** (`confirm_test_db_only=yes`) — `migrate deploy` will apply 22 pending migrations
3. **Re-trigger LANE_A** (`DB Verification`, `use_neon_secrets=true`) — confirm all tests pass
4. **Phase 29 DB slice** can proceed once LANE_A is verified (`controlled_learning_candidates` schema + service)

---

## What NOT To Do

| Action | Why Forbidden |
|---|---|
| `prisma migrate resolve --rolled-back 20260511_add_aggregate_locks` | Would re-run the migration; statement 3 (`ADD CONSTRAINT`) would fail again |
| `prisma migrate reset` | Destroys all data — forbidden |
| `prisma db push` | Bypasses migration history — forbidden |
| Manual SQL: `UPDATE _prisma_migrations SET failed_at = NULL ...` | Fragile, unaudited; use Prisma CLI instead |
| Deleting the migration folder | Does not fix `_prisma_migrations`; causes drift |
| Ignoring P3009 | Blocks all 22 pending migrations indefinitely |
