-- Owner archetype operational metrics (Dynamic Budget archetype-metrics slice).
-- Manual / import-ready operational figures feeding the archetype budget packs
-- through reassessment. NOT a live feed. Workspace-scoped; cascades with the business.

DO $$
BEGIN
  IF to_regclass('public.owner_archetype_metrics') IS NULL THEN
    CREATE TABLE "owner_archetype_metrics" (
      "id" UUID NOT NULL,
      "workspace_id" UUID NOT NULL,
      "business_id" UUID NOT NULL,
      "archetype" TEXT NOT NULL,
      "metric_type" TEXT NOT NULL,
      "metric_date" TIMESTAMP(3) NOT NULL,
      "value" DOUBLE PRECISION NOT NULL,
      "unit" TEXT,
      "source_type" TEXT NOT NULL DEFAULT 'MANUAL',
      "source_ref" TEXT,
      "confidence_state" TEXT NOT NULL DEFAULT 'unverified',
      "created_by" UUID,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "owner_archetype_metrics_pkey" PRIMARY KEY ("id")
    );

    CREATE INDEX "owner_archetype_metrics_workspace_id_idx"
      ON "owner_archetype_metrics" ("workspace_id");
    CREATE INDEX "owner_archetype_metrics_workspace_id_business_id_idx"
      ON "owner_archetype_metrics" ("workspace_id", "business_id");
    CREATE INDEX "owner_archetype_metrics_workspace_id_business_id_archetype_idx"
      ON "owner_archetype_metrics" ("workspace_id", "business_id", "archetype");
    CREATE INDEX "owner_archetype_metrics_metric_type_idx"
      ON "owner_archetype_metrics" ("metric_type");

    ALTER TABLE "owner_archetype_metrics"
      ADD CONSTRAINT "owner_archetype_metrics_business_id_fkey"
      FOREIGN KEY ("business_id") REFERENCES "owner_businesses" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
