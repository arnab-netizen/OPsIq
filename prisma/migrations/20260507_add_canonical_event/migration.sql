-- CreateTable: CanonicalEvent (Append-Only Event Store)
CREATE TABLE "canonical_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aggregate_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "event_number" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "actor_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "causation_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "visibility_scope" TEXT NOT NULL DEFAULT 'internal',
    "sensitivity_classification" TEXT NOT NULL DEFAULT 'standard',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for idempotency key
CREATE UNIQUE INDEX "canonical_events_idempotency_key_workspace_id_key" ON "canonical_events"("idempotency_key", "workspace_id");

-- CreateIndex for aggregate query
CREATE INDEX "canonical_events_aggregate_id_aggregate_type_workspace_id_idx" ON "canonical_events"("aggregate_id", "aggregate_type", "workspace_id");

-- CreateIndex for event type query
CREATE INDEX "canonical_events_workspace_id_event_type_idx" ON "canonical_events"("workspace_id", "event_type");

-- CreateIndex for temporal query
CREATE INDEX "canonical_events_workspace_id_recorded_at_idx" ON "canonical_events"("workspace_id", "recorded_at");

-- CreateIndex for actor query
CREATE INDEX "canonical_events_actor_id_idx" ON "canonical_events"("actor_id");

-- Trigger to prevent UPDATE operations (append-only enforcement)
CREATE OR REPLACE FUNCTION prevent_canonical_event_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'canonical_events is append-only: UPDATE is not allowed on event %', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER canonical_events_prevent_update
BEFORE UPDATE ON "canonical_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_canonical_event_update();

-- Trigger to prevent DELETE operations (append-only enforcement)
CREATE OR REPLACE FUNCTION prevent_canonical_event_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'canonical_events is append-only: DELETE is not allowed on event %', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER canonical_events_prevent_delete
BEFORE DELETE ON "canonical_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_canonical_event_delete();
