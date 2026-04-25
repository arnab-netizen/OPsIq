-- CreateTable
CREATE TABLE "shock_events" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "happened_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "reported_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shock_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shock_events_engagement_id_idx" ON "shock_events"("engagement_id");

-- CreateIndex
CREATE INDEX "shock_events_type_idx" ON "shock_events"("type");

-- CreateIndex
CREATE INDEX "shock_events_severity_idx" ON "shock_events"("severity");

-- AddForeignKey
ALTER TABLE "shock_events" ADD CONSTRAINT "shock_events_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
