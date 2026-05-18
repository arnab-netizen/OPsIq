-- Add startup_status table for durable, distributed startup state

CREATE TABLE "startup_status" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "status" TEXT NOT NULL CHECK ("status" IN ('NOT_STARTED', 'STARTING', 'READY', 'FAILED')),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "error" TEXT,
  "version" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL DEFAULT 'unknown',
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One status per instance (latest wins)
CREATE UNIQUE INDEX "startup_status_instance_id_key" ON "startup_status"("instance_id");

-- Index for querying by instance
CREATE INDEX "startup_status_instance_updated_idx" ON "startup_status"("instance_id", "updated_at" DESC);

-- Update trigger to maintain updated_at
CREATE OR REPLACE FUNCTION update_startup_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER startup_status_update_timestamp
  BEFORE UPDATE ON "startup_status"
  FOR EACH ROW
  EXECUTE FUNCTION update_startup_status_timestamp();
