-- CreateTable
CREATE TABLE "risks" (
    "id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'identified',
    "identified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "identified_by" UUID,
    "assessed_at" TIMESTAMP(3),
    "assessed_by" UUID,
    "mitigation_strategy" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risks_stage_id_idx" ON "risks"("stage_id");

-- CreateIndex
CREATE INDEX "risks_engagement_id_idx" ON "risks"("engagement_id");

-- CreateIndex
CREATE INDEX "risks_status_idx" ON "risks"("status");

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
