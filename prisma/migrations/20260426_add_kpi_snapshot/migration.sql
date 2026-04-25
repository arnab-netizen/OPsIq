-- CreateTable
CREATE TABLE "kpi_snapshots" (
    "id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" UUID,

    CONSTRAINT "kpi_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kpi_snapshots_kpi_id_idx" ON "kpi_snapshots"("kpi_id");

-- CreateIndex
CREATE INDEX "kpi_snapshots_recorded_at_idx" ON "kpi_snapshots"("recorded_at");

-- AddForeignKey
ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
