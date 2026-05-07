-- Phase 3 Slice 1: CanonicalEvent
-- Append-only, immutable event store with deterministic ordering and tenant isolation

CREATE TABLE "canonical_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "event_type" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "event_number" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "actor_id" UUID,
  "actor_type" TEXT,
  "correlation_id" TEXT,
  "caused_by" UUID,
  "is_immutable" BOOLEAN NOT NULL DEFAULT true,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "canonical_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "canonical_events_workspace_id_aggregate_id_event_number_key" UNIQUE ("workspace_id", "aggregate_id", "event_number"),
  CONSTRAINT "canonical_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "canonical_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX "canonical_events_workspace_id_idx" ON "canonical_events"("workspace_id");
CREATE INDEX "canonical_events_workspace_id_aggregate_id_idx" ON "canonical_events"("workspace_id", "aggregate_id");
CREATE INDEX "canonical_events_workspace_id_aggregate_type_idx" ON "canonical_events"("workspace_id", "aggregate_type");
CREATE INDEX "canonical_events_workspace_id_event_type_idx" ON "canonical_events"("workspace_id", "event_type");
CREATE INDEX "canonical_events_idempotency_key_workspace_id_idx" ON "canonical_events"("idempotency_key", "workspace_id");
CREATE INDEX "canonical_events_correlation_id_idx" ON "canonical_events"("correlation_id");
CREATE INDEX "canonical_events_occurred_at_idx" ON "canonical_events"("occurred_at");
