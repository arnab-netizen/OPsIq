-- Jarvis 360 Slice 7 — equipment / capacity / maintenance. Additive (new table).
CREATE TABLE IF NOT EXISTS "owner_equipment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "business_id" UUID,
  "equipment_type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rated_capacity" DOUBLE PRECISION,
  "practical_capacity" DOUBLE PRECISION,
  "unit" TEXT,
  "utilization" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'operational',
  "downtime_state" TEXT NOT NULL DEFAULT 'up',
  "maintenance_due_at" TIMESTAMP(3),
  "operator_skill" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_equipment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "owner_equipment_ws_business_idx" ON "owner_equipment" ("workspace_id","business_id");
