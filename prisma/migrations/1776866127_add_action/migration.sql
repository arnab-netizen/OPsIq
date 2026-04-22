-- CreateTable Action
CREATE TABLE "actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "engagement_id" UUID NOT NULL,
    "recommendation_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex actions_engagement_id
CREATE INDEX "actions_engagement_id_idx" ON "actions"("engagement_id");

-- CreateIndex actions_recommendation_id
CREATE INDEX "actions_recommendation_id_idx" ON "actions"("recommendation_id");

-- CreateIndex actions_status
CREATE INDEX "actions_status_idx" ON "actions"("status");

-- AddForeignKey actions_engagement_id
ALTER TABLE "actions" ADD CONSTRAINT "actions_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey actions_recommendation_id
ALTER TABLE "actions" ADD CONSTRAINT "actions_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
