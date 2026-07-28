-- Stage 7: Scheduler hardening — additive only.
-- Adds lease_expires_at, idempotency_key, workspace_id to scheduled_tasks.
-- All columns are nullable; safe to add to an existing table with live rows.

ALTER TABLE "scheduled_tasks"
  ADD COLUMN IF NOT EXISTS "lease_expires_at"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "idempotency_key"   TEXT,
  ADD COLUMN IF NOT EXISTS "workspace_id"      UUID;

-- Unique constraint on idempotency_key (sparse — only rows with a key are deduped).
CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_tasks_idempotency_key_key"
  ON "scheduled_tasks" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Support efficient lease-recovery sweep: WHERE status='running' AND lease_expires_at < now()
CREATE INDEX IF NOT EXISTS "scheduled_tasks_lease_expires_at_idx"
  ON "scheduled_tasks" ("lease_expires_at");

-- Support per-workspace task listing
CREATE INDEX IF NOT EXISTS "scheduled_tasks_workspace_id_idx"
  ON "scheduled_tasks" ("workspace_id");
