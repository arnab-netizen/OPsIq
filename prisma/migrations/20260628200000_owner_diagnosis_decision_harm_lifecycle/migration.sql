-- GAP-DB-01 — migrate the actively-used owner input-quality chain.
-- owner_input_quality_assessments is read by the recommendation promotion gate; it FK-depends
-- on owner_input_records. Both use uuid workspace scoping. The remaining ~26 declared-but-
-- never-migrated owner decision/harm models had text/uuid FK type mismatches (never functional)
-- and zero code usage; they are removed from schema.prisma in the same change.

CREATE TABLE IF NOT EXISTS "owner_input_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "submitted_by" UUID NOT NULL,
    "input_period" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "raw_json" JSONB NOT NULL,
    "hash_checksum" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_input_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_input_quality_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "input_record_id" UUID NOT NULL,
    "quality_status" TEXT NOT NULL,
    "overall_score" INTEGER NOT NULL,
    "missing_fields" JSONB NOT NULL,
    "conflict_flags" JSONB NOT NULL,
    "stale_fields" JSONB NOT NULL,
    "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessed_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_input_quality_assessments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_input_records_workspace_id_idx" ON "owner_input_records"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_input_records_workspace_id_input_period_idx" ON "owner_input_records"("workspace_id", "input_period");
CREATE INDEX IF NOT EXISTS "owner_input_records_submitted_by_idx" ON "owner_input_records"("submitted_by");
CREATE INDEX IF NOT EXISTS "owner_input_records_created_at_idx" ON "owner_input_records"("created_at");
CREATE INDEX IF NOT EXISTS "owner_input_quality_assessments_workspace_id_idx" ON "owner_input_quality_assessments"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_input_quality_assessments_input_record_id_idx" ON "owner_input_quality_assessments"("input_record_id");
CREATE INDEX IF NOT EXISTS "owner_input_quality_assessments_quality_status_idx" ON "owner_input_quality_assessments"("quality_status");
CREATE INDEX IF NOT EXISTS "owner_input_quality_assessments_workspace_id_assessed_at_idx" ON "owner_input_quality_assessments"("workspace_id", "assessed_at");

ALTER TABLE "owner_input_records" ADD CONSTRAINT "owner_input_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_input_quality_assessments" ADD CONSTRAINT "owner_input_quality_assessments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_input_quality_assessments" ADD CONSTRAINT "owner_input_quality_assessments_input_record_id_fkey" FOREIGN KEY ("input_record_id") REFERENCES "owner_input_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
