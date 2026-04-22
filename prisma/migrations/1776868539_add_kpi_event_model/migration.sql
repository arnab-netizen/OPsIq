-- CreateTable KPIEvent
CREATE TABLE "kpi_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kpi_id" UUID NOT NULL,
    "action_id" UUID,
    "previous_value" DOUBLE PRECISION NOT NULL,
    "new_value" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex kpi_events_kpi_id
CREATE INDEX "kpi_events_kpi_id_idx" ON "kpi_events"("kpi_id");

-- CreateIndex kpi_events_action_id
CREATE INDEX "kpi_events_action_id_idx" ON "kpi_events"("action_id");

-- AddForeignKey kpi_events_kpi_id
ALTER TABLE "kpi_events" ADD CONSTRAINT "kpi_events_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey kpi_events_action_id
ALTER TABLE "kpi_events" ADD CONSTRAINT "kpi_events_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
