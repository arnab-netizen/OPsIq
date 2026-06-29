-- Persistent controlled-learning artifacts for behavioral validation.
CREATE TABLE "behavioral_learning_artifacts" (
    "id" TEXT NOT NULL,
    "source_case_id" TEXT NOT NULL,
    "business_type" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "location_key" TEXT NOT NULL,
    "failure_label" TEXT NOT NULL,
    "original_failed_behavior" TEXT NOT NULL,
    "corrected_behavior" TEXT NOT NULL,
    "scope_archetype" TEXT,
    "scope_decision_category" TEXT,
    "scope_location_key" TEXT,
    "risk_level" TEXT NOT NULL,
    "approval_status" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "privacy_classification" TEXT NOT NULL,
    "workspace_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "superseded_by_version" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TEXT NOT NULL,
    "audit_trail" JSONB NOT NULL,

    CONSTRAINT "behavioral_learning_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "behavioral_learning_artifacts_workspace_id_idx" ON "behavioral_learning_artifacts"("workspace_id");
CREATE INDEX "behavioral_learning_artifacts_archetype_idx" ON "behavioral_learning_artifacts"("archetype");
CREATE INDEX "behavioral_learning_artifacts_approval_status_idx" ON "behavioral_learning_artifacts"("approval_status");
CREATE INDEX "behavioral_learning_artifacts_source_case_id_idx" ON "behavioral_learning_artifacts"("source_case_id");
