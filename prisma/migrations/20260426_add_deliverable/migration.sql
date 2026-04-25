-- CreateTable
CREATE TABLE "deliverables" (
    "id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMP(3),
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deliverables_stage_id_idx" ON "deliverables"("stage_id");

-- CreateIndex
CREATE INDEX "deliverables_engagement_id_idx" ON "deliverables"("engagement_id");

-- CreateIndex
CREATE INDEX "deliverables_status_idx" ON "deliverables"("status");

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
