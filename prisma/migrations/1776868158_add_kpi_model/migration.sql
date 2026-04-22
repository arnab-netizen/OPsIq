-- CreateTable KPI
CREATE TABLE "kpis" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "engagement_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "baseline_value" DOUBLE PRECISION NOT NULL,
    "current_value" DOUBLE PRECISION NOT NULL,
    "target_value" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex kpis_engagement_id
CREATE INDEX "kpis_engagement_id_idx" ON "kpis"("engagement_id");

-- CreateIndex kpis_status
CREATE INDEX "kpis_status_idx" ON "kpis"("status");

-- AddForeignKey kpis_engagement_id
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
