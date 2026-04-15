-- CreateEnum
CREATE TYPE "shock_event_types" AS ENUM ('KEY_EMPLOYEE_LOSS', 'MAJOR_CLIENT_LOSS', 'PAYROLL_PRESSURE', 'MARGIN_COLLAPSE', 'SUPPLIER_FAILURE', 'SERVICE_BREAKDOWN', 'COMPLIANCE_ISSUE', 'REPUTATION_DAMAGE', 'INTERNAL_CONFLICT', 'OWNER_WITHDRAWAL', 'EXECUTION_STALL');

-- CreateEnum
CREATE TYPE "shock_event_severities" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "shock_events" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "type" "shock_event_types" NOT NULL,
    "severity" "shock_event_severities" NOT NULL,
    "happened_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shock_events_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "shock_events" ADD CONSTRAINT "shock_events_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "shock_events_engagement_id_idx" ON "shock_events"("engagement_id");

-- CreateIndex
CREATE INDEX "shock_events_happened_at_idx" ON "shock_events"("happened_at");
