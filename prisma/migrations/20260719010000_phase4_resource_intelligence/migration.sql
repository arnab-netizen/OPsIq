-- Phase 4: Resource Intelligence (resource pools + allocations)
-- All additive. No destructive operations.

CREATE TABLE "resource_pools" (
  "id"             UUID      NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   UUID      NOT NULL,
  "resource_type"  TEXT      NOT NULL,
  "label"          TEXT      NOT NULL,
  "total_capacity" DOUBLE PRECISION NOT NULL,
  "unit"           TEXT      NOT NULL,
  "period_start"   TIMESTAMPTZ,
  "period_end"     TIMESTAMPTZ,
  "is_active"      BOOLEAN   NOT NULL DEFAULT true,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "resource_pools_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "resource_pools_workspace_active_idx" ON "resource_pools" ("workspace_id", "is_active");
CREATE INDEX "resource_pools_workspace_type_idx"   ON "resource_pools" ("workspace_id", "resource_type");

-- ─── Resource allocations ─────────────────────────────────────────────────────

CREATE TABLE "resource_allocations" (
  "id"                UUID      NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      UUID      NOT NULL,
  "pool_id"           UUID      NOT NULL,
  "objective_id"      UUID      NOT NULL,
  "allocation_amount" DOUBLE PRECISION NOT NULL,
  "priority"          INTEGER   NOT NULL DEFAULT 50,
  "status"            TEXT      NOT NULL DEFAULT 'ALLOCATED',
  "allocated_by"      UUID      NOT NULL,
  "allocated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "released_at"       TIMESTAMPTZ,

  CONSTRAINT "resource_allocations_pkey"   PRIMARY KEY ("id"),
  CONSTRAINT "ra_pool_fk" FOREIGN KEY ("pool_id") REFERENCES "resource_pools"("id") ON DELETE CASCADE
);

CREATE INDEX "ra_workspace_pool_idx"      ON "resource_allocations" ("workspace_id", "pool_id");
CREATE INDEX "ra_workspace_objective_idx" ON "resource_allocations" ("workspace_id", "objective_id");
CREATE INDEX "ra_workspace_status_idx"    ON "resource_allocations" ("workspace_id", "status");
