-- Phase 32: Privacy Controls, Consent Records, and Retention Policies
-- for the controlled learning system

CREATE TABLE "controlled_learning_privacy_controls" (
    "id"            TEXT NOT NULL,
    "workspaceId"   TEXT NOT NULL,
    "candidateId"   TEXT NOT NULL,
    "controlType"   TEXT NOT NULL,
    "appliedBy"     TEXT NOT NULL,
    "appliedAt"     TIMESTAMP(3) NOT NULL,
    "reason"        TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controlled_learning_privacy_controls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "controlled_learning_consent_records" (
    "id"            TEXT NOT NULL,
    "workspaceId"   TEXT NOT NULL,
    "candidateId"   TEXT NOT NULL,
    "consentGiven"  BOOLEAN NOT NULL,
    "consentBy"     TEXT NOT NULL,
    "consentAt"     TIMESTAMP(3) NOT NULL,
    "consentScope"  TEXT NOT NULL,
    "consentNotes"  TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controlled_learning_consent_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "controlled_learning_retention_policies" (
    "id"            TEXT NOT NULL,
    "workspaceId"   TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "appliedBy"     TEXT NOT NULL,
    "appliedAt"     TIMESTAMP(3) NOT NULL,
    "policyNotes"   TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controlled_learning_retention_policies_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one retention policy per workspace
CREATE UNIQUE INDEX "controlled_learning_retention_policies_workspaceId_key"
    ON "controlled_learning_retention_policies"("workspaceId");

-- Indexes for privacy controls
CREATE INDEX "controlled_learning_privacy_controls_workspaceId_idx"
    ON "controlled_learning_privacy_controls"("workspaceId");
CREATE INDEX "controlled_learning_privacy_controls_candidateId_idx"
    ON "controlled_learning_privacy_controls"("candidateId");
CREATE INDEX "controlled_learning_privacy_controls_controlType_idx"
    ON "controlled_learning_privacy_controls"("controlType");

-- Indexes for consent records
CREATE INDEX "controlled_learning_consent_records_workspaceId_idx"
    ON "controlled_learning_consent_records"("workspaceId");
CREATE INDEX "controlled_learning_consent_records_candidateId_idx"
    ON "controlled_learning_consent_records"("candidateId");

-- Indexes for retention policies
CREATE INDEX "controlled_learning_retention_policies_workspaceId_idx"
    ON "controlled_learning_retention_policies"("workspaceId");

-- Foreign keys: privacy controls
ALTER TABLE "controlled_learning_privacy_controls"
    ADD CONSTRAINT "controlled_learning_privacy_controls_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "controlled_learning_privacy_controls"
    ADD CONSTRAINT "controlled_learning_privacy_controls_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "controlled_learning_candidates"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys: consent records
ALTER TABLE "controlled_learning_consent_records"
    ADD CONSTRAINT "controlled_learning_consent_records_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "controlled_learning_consent_records"
    ADD CONSTRAINT "controlled_learning_consent_records_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "controlled_learning_candidates"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys: retention policies
ALTER TABLE "controlled_learning_retention_policies"
    ADD CONSTRAINT "controlled_learning_retention_policies_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
