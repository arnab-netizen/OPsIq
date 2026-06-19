-- Phase 35: Controlled Learning Harm Events and Attribution Reviews

CREATE TABLE "controlled_learning_harm_events" (
  "id"              TEXT NOT NULL,
  "workspaceId"     TEXT NOT NULL,
  "candidateId"     TEXT NOT NULL,
  "harmType"        TEXT NOT NULL,
  "severity"        TEXT NOT NULL,
  "detectedBy"      TEXT NOT NULL,
  "detectedAt"      TIMESTAMP(3) NOT NULL,
  "harmDescription" TEXT NOT NULL,
  "mitigated"       BOOLEAN NOT NULL DEFAULT false,
  "mitigatedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "controlled_learning_harm_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "controlled_learning_attribution_reviews" (
  "id"              TEXT NOT NULL,
  "workspaceId"     TEXT NOT NULL,
  "candidateId"     TEXT NOT NULL,
  "harmEventId"     TEXT NOT NULL,
  "reviewedBy"      TEXT NOT NULL,
  "reviewedAt"      TIMESTAMP(3) NOT NULL,
  "verdict"         TEXT NOT NULL,
  "confidenceScore" DOUBLE PRECISION NOT NULL,
  "reviewNotes"     TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "controlled_learning_attribution_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "controlled_learning_harm_events_workspaceId_idx" ON "controlled_learning_harm_events"("workspaceId");
CREATE INDEX "controlled_learning_harm_events_candidateId_idx" ON "controlled_learning_harm_events"("candidateId");
CREATE INDEX "controlled_learning_harm_events_harmType_idx" ON "controlled_learning_harm_events"("harmType");
CREATE INDEX "controlled_learning_harm_events_severity_idx" ON "controlled_learning_harm_events"("severity");

CREATE INDEX "controlled_learning_attribution_reviews_workspaceId_idx" ON "controlled_learning_attribution_reviews"("workspaceId");
CREATE INDEX "controlled_learning_attribution_reviews_candidateId_idx" ON "controlled_learning_attribution_reviews"("candidateId");
CREATE INDEX "controlled_learning_attribution_reviews_harmEventId_idx" ON "controlled_learning_attribution_reviews"("harmEventId");
CREATE INDEX "controlled_learning_attribution_reviews_verdict_idx" ON "controlled_learning_attribution_reviews"("verdict");

ALTER TABLE "controlled_learning_harm_events"
  ADD CONSTRAINT "controlled_learning_harm_events_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "controlled_learning_harm_events"
  ADD CONSTRAINT "controlled_learning_harm_events_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "controlled_learning_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "controlled_learning_attribution_reviews"
  ADD CONSTRAINT "controlled_learning_attribution_reviews_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "controlled_learning_attribution_reviews"
  ADD CONSTRAINT "controlled_learning_attribution_reviews_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "controlled_learning_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "controlled_learning_attribution_reviews"
  ADD CONSTRAINT "controlled_learning_attribution_reviews_harmEventId_fkey"
  FOREIGN KEY ("harmEventId") REFERENCES "controlled_learning_harm_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
