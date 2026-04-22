-- CreateTable Recommendation
CREATE TABLE "recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "engagement_id" UUID NOT NULL,
    "finding_id" UUID,
    "shock_event_id" UUID,
    "priority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex recommendations_engagement_id
CREATE INDEX "recommendations_engagement_id_idx" ON "recommendations"("engagement_id");

-- CreateIndex recommendations_priority
CREATE INDEX "recommendations_priority_idx" ON "recommendations"("priority");

-- CreateIndex recommendations_finding_id
CREATE INDEX "recommendations_finding_id_idx" ON "recommendations"("finding_id");

-- CreateIndex recommendations_shock_event_id
CREATE INDEX "recommendations_shock_event_id_idx" ON "recommendations"("shock_event_id");

-- AddForeignKey recommendations_engagement_id
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey recommendations_finding_id
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey recommendations_shock_event_id
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_shock_event_id_fkey" FOREIGN KEY ("shock_event_id") REFERENCES "shock_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
