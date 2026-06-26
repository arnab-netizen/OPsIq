-- Outcome/learning module — outcome & reassessment persistence (additive, idempotent).
-- These models (OwnerActionOutcome / OwnerReassessmentEvent) existed in schema.prisma
-- without a deploy migration, so their tables were absent on the migrate-deploy lane.
-- This creates them to match Prisma exactly (camelCase columns, FK -> client_accounts).
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS + guarded FK creation. No data change.

CREATE TABLE IF NOT EXISTS "owner_action_outcomes" (
    "id" TEXT NOT NULL,
    "workspaceId" UUID NOT NULL,
    "businessId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "actionId" TEXT,
    "outcomeStatus" TEXT NOT NULL,
    "ownerReportedResult" TEXT,
    "actualMetricName" TEXT,
    "beforeValue" DOUBLE PRECISION,
    "afterValue" DOUBLE PRECISION,
    "absoluteChange" DOUBLE PRECISION,
    "percentageChange" DOUBLE PRECISION,
    "measurementPeriodStart" TIMESTAMP(3),
    "measurementPeriodEnd" TIMESTAMP(3),
    "evidenceQuality" TEXT,
    "externalEventFlag" BOOLEAN NOT NULL DEFAULT false,
    "externalEventDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_action_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_action_outcomes_workspaceId_idx" ON "owner_action_outcomes"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_action_outcomes_businessId_idx" ON "owner_action_outcomes"("businessId");
CREATE INDEX IF NOT EXISTS "owner_action_outcomes_recommendationId_idx" ON "owner_action_outcomes"("recommendationId");
CREATE INDEX IF NOT EXISTS "owner_action_outcomes_actionId_idx" ON "owner_action_outcomes"("actionId");
CREATE INDEX IF NOT EXISTS "owner_action_outcomes_outcomeStatus_idx" ON "owner_action_outcomes"("outcomeStatus");

CREATE TABLE IF NOT EXISTS "owner_reassessment_events" (
    "id" TEXT NOT NULL,
    "workspaceId" UUID NOT NULL,
    "businessId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "actionId" TEXT,
    "outcomeId" TEXT,
    "failureAdjudicationId" TEXT,
    "causalAttributionId" TEXT,
    "harmEventId" TEXT,
    "trigger" TEXT NOT NULL,
    "triggerDescription" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requiresHumanReview" BOOLEAN NOT NULL,
    "reopensDiagnosis" BOOLEAN NOT NULL,
    "assumptionsChecked" BOOLEAN NOT NULL,
    "invalidatedAssumptions" TEXT NOT NULL,
    "proposedCorrectiveActionClass" TEXT,
    "correctiveActionRationale" TEXT,
    "ownerAcknowledged" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_reassessment_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_reassessment_events_workspaceId_idx" ON "owner_reassessment_events"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_reassessment_events_businessId_idx" ON "owner_reassessment_events"("businessId");
CREATE INDEX IF NOT EXISTS "owner_reassessment_events_trigger_idx" ON "owner_reassessment_events"("trigger");
CREATE INDEX IF NOT EXISTS "owner_reassessment_events_status_idx" ON "owner_reassessment_events"("status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owner_action_outcomes_workspaceId_fkey') THEN
    ALTER TABLE "owner_action_outcomes" ADD CONSTRAINT "owner_action_outcomes_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owner_reassessment_events_workspaceId_fkey') THEN
    ALTER TABLE "owner_reassessment_events" ADD CONSTRAINT "owner_reassessment_events_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
