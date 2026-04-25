-- CreateTable
CREATE TABLE "kpis" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target" DOUBLE PRECISION,
    "current_value" DOUBLE PRECISION,
    "measurement_date" TIMESTAMP(3),
    "direction" TEXT NOT NULL DEFAULT 'up',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kpis_engagement_id_idx" ON "kpis"("engagement_id");

-- AddForeignKey
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
