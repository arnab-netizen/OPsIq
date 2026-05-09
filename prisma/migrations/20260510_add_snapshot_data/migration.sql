-- Create SnapshotData table for Phase 3 snapshot optimization
-- Snapshots store the aggregate state at a specific event number
-- Used to optimize event replay (avoid replaying entire event stream)
CREATE TABLE IF NOT EXISTS "snapshot_data" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aggregate_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "state" JSONB NOT NULL,
    "last_event_number" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshot_data_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: only one snapshot per aggregate per workspace
CREATE UNIQUE INDEX IF NOT EXISTS "snapshot_data_aggregate_id_aggregate_type_workspace_id_key" ON "snapshot_data"("aggregate_id", "aggregate_type", "workspace_id");

-- Index for workspace-scoped queries
CREATE INDEX IF NOT EXISTS "snapshot_data_workspace_id_created_at_idx" ON "snapshot_data"("workspace_id", "created_at");