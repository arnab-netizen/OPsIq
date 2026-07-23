-- Stage 3 Slice 3.2: Owner Alerting Runtime
-- Adds the Alert model for workspace-scoped, user-targeted in-app alerts.
-- Fixes runtime TypeError: db.alert.create() called on missing Prisma model.
-- All prior data is unaffected (additive only).

CREATE TABLE "alerts" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    UUID        NOT NULL,
  "user_id"         UUID        NOT NULL,
  "type"            TEXT        NOT NULL,
  "channel"         TEXT        NOT NULL DEFAULT 'in_app',
  "message"         TEXT        NOT NULL,
  "entity_type"     TEXT,
  "entity_id"       UUID,
  "severity"        TEXT        NOT NULL DEFAULT 'medium',
  "idempotency_key" TEXT,
  "is_read"         BOOLEAN     NOT NULL DEFAULT FALSE,
  "read_at"         TIMESTAMP(3),
  "resolved_at"     TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "alerts_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "alerts_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "alerts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Deduplication: only one alert per workspace+idempotency_key (NULLs excluded by default in PG UNIQUE)
CREATE UNIQUE INDEX "alert_workspace_idempotency_key"
  ON "alerts"("workspace_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Read-queue scan: workspace + user + unread
CREATE INDEX "alerts_workspace_id_user_id_is_read_idx"
  ON "alerts"("workspace_id", "user_id", "is_read");

-- Time-ordered fetch
CREATE INDEX "alerts_workspace_id_created_at_idx"
  ON "alerts"("workspace_id", "created_at");
