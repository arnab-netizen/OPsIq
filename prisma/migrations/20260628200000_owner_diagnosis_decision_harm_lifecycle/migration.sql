-- GAP-DB-01 — migrate the owner diagnosis/input/recommendation/decision/benefit/
-- action/evidence/harm/causal/learning lifecycle block. These models were declared in
-- schema.prisma but never migrated; owner_input_quality_assessments is actively read by
-- the recommendation promotion gate. Additive, idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "owner_input_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "submitted_by" UUID NOT NULL,
    "input_period" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "raw_json" JSONB NOT NULL,
    "hash_checksum" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_input_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_input_quality_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "input_record_id" UUID NOT NULL,
    "quality_status" TEXT NOT NULL,
    "overall_score" INTEGER NOT NULL,
    "missing_fields" JSONB NOT NULL,
    "conflict_flags" JSONB NOT NULL,
    "stale_fields" JSONB NOT NULL,
    "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessed_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_input_quality_assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_data_provenance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "input_record_id" UUID NOT NULL,
    "field_name" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_owner" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "period_covered" TEXT NOT NULL,
    "freshness" TEXT NOT NULL,
    "original_filename" TEXT,
    "hash_checksum" VARCHAR(64),
    "parsed_by" TEXT NOT NULL,
    "manual_edits" BOOLEAN NOT NULL DEFAULT false,
    "derived_metric" BOOLEAN NOT NULL DEFAULT false,
    "lineage_to_diagnosis" BOOLEAN NOT NULL DEFAULT false,
    "lineage_to_recommendation" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_data_provenance_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_missing_data_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "input_record_id" UUID NOT NULL,
    "field_name" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "blocks_strong_recommendation" BOOLEAN NOT NULL DEFAULT false,
    "blocks_high_risk_action" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_missing_data_flags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_diagnosis_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "input_record_id" UUID,
    "diagnosis_status" TEXT NOT NULL,
    "evidence_for" JSONB NOT NULL,
    "evidence_against" JSONB NOT NULL,
    "missing_data" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "confidence_score" INTEGER NOT NULL,
    "confidence_reason" TEXT NOT NULL,
    "risk_flags" JSONB NOT NULL,
    "what_would_change_this" TEXT NOT NULL,
    "superseded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_diagnosis_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_recommendations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "diagnosisId" TEXT,
    "recommendationText" TEXT NOT NULL,
    "recommendationType" TEXT NOT NULL,
    "priorityRank" INTEGER NOT NULL DEFAULT 0,
    "expectedOutcomeSummary" TEXT NOT NULL,
    "targetMetricName" TEXT,
    "baselineValue" DOUBLE PRECISION,
    "targetValue" DOUBLE PRECISION,
    "targetDirection" TEXT,
    "measurementWindowDays" INTEGER,
    "deadlineAt" TIMESTAMP(3),
    "confidenceScore" INTEGER NOT NULL,
    "confidenceReason" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_recommendation_evidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "evidenceText" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_recommendation_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_recommendation_assumptions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "assumptionText" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_recommendation_assumptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_recommendation_constraints" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "constraintText" TEXT NOT NULL,
    "constraintType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_recommendation_constraints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_recommendation_verifications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "evidenceSupporting" TEXT,
    "evidenceContradicting" TEXT,
    "missingData" TEXT,
    "assumptionsMade" TEXT,
    "whatWouldMakeThisWrong" TEXT,
    "rivalConsultantArgument" TEXT,
    "hasFailedBefore" BOOLEAN NOT NULL DEFAULT false,
    "pastFailureContext" TEXT,
    "violatesOwnerConstraints" BOOLEAN NOT NULL DEFAULT false,
    "constraintViolationDetail" TEXT,
    "fitsWithinCashRunway" BOOLEAN NOT NULL DEFAULT true,
    "downsideIfWrong" TEXT,
    "stopLossCondition" TEXT,
    "saferTestAvailable" TEXT,
    "verifiedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_recommendation_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_overreliance_acknowledgements" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "keyAssumptionAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "mainDownsideAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "stopConditionAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "evidenceLimitAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "ownerIsDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "owner_overreliance_acknowledgements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_decisions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "decisionStatus" TEXT NOT NULL DEFAULT 'needs_more_data',
    "decisionReason" TEXT NOT NULL,
    "modifiedDescription" TEXT,
    "deferredUntil" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_decision_rights" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "decisionOwner" TEXT NOT NULL,
    "executionOwner" TEXT,
    "reviewOwner" TEXT,
    "benefitOwner" TEXT,
    "riskOwner" TEXT,
    "approvalRequiredBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_decision_rights_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_benefits" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "actionId" TEXT,
    "expectedBusinessBenefit" TEXT NOT NULL,
    "benefitType" TEXT NOT NULL,
    "baseline" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "targetUnit" TEXT,
    "benefitOwner" TEXT NOT NULL,
    "realizationDate" TIMESTAMP(3),
    "reviewCadence" TEXT,
    "actualBenefit" DOUBLE PRECISION,
    "benefitStatus" TEXT NOT NULL DEFAULT 'pending',
    "reasonNotRealized" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_benefits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_benefit_reviews" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "benefitId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualValueAtReview" DOUBLE PRECISION,
    "progressStatus" TEXT NOT NULL,
    "reviewNotes" TEXT,
    "reviewedBy" TEXT NOT NULL,

    CONSTRAINT "owner_benefit_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_actions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "ownerDecisionId" TEXT,
    "assignedToRole" TEXT,
    "assignedToUserId" TEXT,
    "actionTitle" TEXT NOT NULL,
    "actionSteps" JSONB NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_action_execution_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "executedByRole" TEXT,
    "executedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "actualStepsTaken" JSONB,
    "plannedStepsCompletedCount" INTEGER NOT NULL DEFAULT 0,
    "plannedStepsTotalCount" INTEGER NOT NULL DEFAULT 0,
    "sampleSizeActual" INTEGER,
    "deadlineMet" BOOLEAN NOT NULL DEFAULT false,
    "proofText" TEXT,
    "proofAttachmentUrl" TEXT,
    "deviationSummary" TEXT,
    "deviationSeverity" TEXT,
    "blockerReason" TEXT,
    "executionComplianceScore" TEXT NOT NULL DEFAULT 'not_executed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_action_execution_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_blockers" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "blockerText" TEXT NOT NULL,
    "blockerType" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_blockers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_evidence_records" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "relatedEntityType" TEXT NOT NULL,
    "relatedEntityId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "evidenceText" TEXT,
    "attachmentUrl" TEXT,
    "originalFilename" TEXT,
    "hashChecksum" TEXT,
    "periodCovered" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_evidence_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_evidence_verifications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "verificationMethod" TEXT NOT NULL,
    "verifierType" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "verificationReason" TEXT NOT NULL,
    "sourceType" TEXT,
    "confidenceLevel" TEXT,
    "conflictNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_evidence_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_validation_criteria" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "actionId" TEXT,
    "metricName" TEXT NOT NULL,
    "baselineValue" DOUBLE PRECISION,
    "targetValue" DOUBLE PRECISION,
    "minimumSampleSize" INTEGER,
    "measurementStartAt" TIMESTAMP(3),
    "measurementEndAt" TIMESTAMP(3),
    "successCondition" TEXT NOT NULL,
    "partialSuccessCondition" TEXT,
    "failureCondition" TEXT,
    "stopCondition" TEXT,
    "escalationCondition" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'standard',
    "isProvisional" BOOLEAN NOT NULL DEFAULT false,
    "reviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_validation_criteria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_harm_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "actionId" TEXT,
    "outcomeId" TEXT,
    "harmCategory" TEXT NOT NULL,
    "harmSeverity" TEXT NOT NULL,
    "harmAmountEstimate" DOUBLE PRECISION,
    "harmMetric" TEXT,
    "harmDescription" TEXT NOT NULL,
    "reversibility" TEXT NOT NULL,
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "incidentReviewFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_harm_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_failure_adjudications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "actionId" TEXT,
    "outcomeId" TEXT,
    "failureClass" TEXT NOT NULL,
    "adjudicationVerdict" TEXT NOT NULL,
    "executionValid" BOOLEAN NOT NULL,
    "evidenceSufficient" BOOLEAN NOT NULL,
    "adjudicationReason" TEXT NOT NULL,
    "learningEligible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_failure_adjudications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_causal_attributions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "actionId" TEXT,
    "outcomeId" TEXT,
    "attributionClass" TEXT NOT NULL,
    "blocksLearning" BOOLEAN NOT NULL,
    "requiresHumanReview" BOOLEAN NOT NULL,
    "hasVerifiedCausalLink" BOOLEAN NOT NULL,
    "isExternallyDominated" BOOLEAN NOT NULL,
    "hasTemporalProximity" BOOLEAN NOT NULL,
    "hasControlledComparison" BOOLEAN NOT NULL,
    "hasOwnerTestimony" BOOLEAN NOT NULL,
    "hasExternalEventDuringPeriod" BOOLEAN NOT NULL,
    "hasConfoundingFactors" BOOLEAN NOT NULL,
    "attributionReason" TEXT NOT NULL,
    "confoundingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_causal_attributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_learning_eligibility_reviews" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actionId" TEXT,
    "recommendationId" TEXT,
    "outcomeId" TEXT,
    "status" TEXT NOT NULL,
    "rejectionReasons" TEXT NOT NULL,
    "requiresHumanReview" BOOLEAN NOT NULL,
    "allowsLearning" BOOLEAN NOT NULL,
    "isTerminalRejection" BOOLEAN NOT NULL,
    "actionWasExecuted" BOOLEAN NOT NULL,
    "executionMateriallyDeviated" BOOLEAN NOT NULL,
    "hasVerifiedEvidence" BOOLEAN NOT NULL,
    "measurementPeriodComplete" BOOLEAN NOT NULL,
    "adjudicationCompleted" BOOLEAN NOT NULL,
    "adjudicationVerdict" TEXT NOT NULL,
    "causalAttributionCompleted" BOOLEAN NOT NULL,
    "causalAttributionClass" TEXT NOT NULL,
    "harmSeverity" TEXT NOT NULL,
    "isOwnerOpinionOnly" BOOLEAN NOT NULL,
    "hasContradictoryEvidence" BOOLEAN NOT NULL,
    "hasPrivacyControls" BOOLEAN NOT NULL,
    "broadImpactScope" BOOLEAN NOT NULL,
    "eligibilityNotes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_learning_eligibility_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_decision_memories" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "recommendationId" TEXT,
    "actionId" TEXT,
    "outcomeId" TEXT,
    "summary" TEXT NOT NULL,
    "contextSnapshot" TEXT NOT NULL,
    "carriesLearningSignal" BOOLEAN NOT NULL,
    "blocksRepetition" BOOLEAN NOT NULL,
    "isRepeatAttempt" BOOLEAN NOT NULL,
    "priorMemoryId" TEXT,
    "changedContextExplanation" TEXT,
    "doNotRepeatReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_decision_memories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_business_state_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "snapshotNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_business_state_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "owner_business_metrics_timeline" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_business_metrics_timeline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_input_records_workspace_id_idx" ON "owner_input_records"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_input_records_workspace_id_input_period_idx" ON "owner_input_records"("workspace_id", "input_period");
CREATE INDEX IF NOT EXISTS "owner_input_records_submitted_by_idx" ON "owner_input_records"("submitted_by");
CREATE INDEX IF NOT EXISTS "owner_input_records_created_at_idx" ON "owner_input_records"("created_at");
CREATE INDEX IF NOT EXISTS "owner_input_quality_assessments_workspace_id_idx" ON "owner_input_quality_assessments"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_input_quality_assessments_input_record_id_idx" ON "owner_input_quality_assessments"("input_record_id");
CREATE INDEX IF NOT EXISTS "owner_input_quality_assessments_quality_status_idx" ON "owner_input_quality_assessments"("quality_status");
CREATE INDEX IF NOT EXISTS "owner_input_quality_assessments_workspace_id_assessed_at_idx" ON "owner_input_quality_assessments"("workspace_id", "assessed_at");
CREATE INDEX IF NOT EXISTS "owner_data_provenance_records_workspace_id_idx" ON "owner_data_provenance_records"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_data_provenance_records_input_record_id_idx" ON "owner_data_provenance_records"("input_record_id");
CREATE INDEX IF NOT EXISTS "owner_data_provenance_records_workspace_id_field_name_idx" ON "owner_data_provenance_records"("workspace_id", "field_name");
CREATE INDEX IF NOT EXISTS "owner_missing_data_flags_workspace_id_idx" ON "owner_missing_data_flags"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_missing_data_flags_input_record_id_idx" ON "owner_missing_data_flags"("input_record_id");
CREATE INDEX IF NOT EXISTS "owner_missing_data_flags_workspace_id_severity_idx" ON "owner_missing_data_flags"("workspace_id", "severity");
CREATE INDEX IF NOT EXISTS "owner_diagnosis_evidence_workspace_id_idx" ON "owner_diagnosis_evidence"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_diagnosis_evidence_workspace_id_business_id_idx" ON "owner_diagnosis_evidence"("workspace_id", "business_id");
CREATE INDEX IF NOT EXISTS "owner_diagnosis_evidence_diagnosis_status_idx" ON "owner_diagnosis_evidence"("diagnosis_status");
CREATE INDEX IF NOT EXISTS "owner_diagnosis_evidence_workspace_id_created_at_idx" ON "owner_diagnosis_evidence"("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "owner_recommendations_workspaceId_idx" ON "owner_recommendations"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_recommendations_businessId_idx" ON "owner_recommendations"("businessId");
CREATE INDEX IF NOT EXISTS "owner_recommendations_status_idx" ON "owner_recommendations"("status");
CREATE INDEX IF NOT EXISTS "owner_recommendation_evidence_workspaceId_idx" ON "owner_recommendation_evidence"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_recommendation_evidence_recommendationId_idx" ON "owner_recommendation_evidence"("recommendationId");
CREATE INDEX IF NOT EXISTS "owner_recommendation_assumptions_workspaceId_idx" ON "owner_recommendation_assumptions"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_recommendation_assumptions_recommendationId_idx" ON "owner_recommendation_assumptions"("recommendationId");
CREATE INDEX IF NOT EXISTS "owner_recommendation_constraints_workspaceId_idx" ON "owner_recommendation_constraints"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_recommendation_constraints_recommendationId_idx" ON "owner_recommendation_constraints"("recommendationId");
CREATE INDEX IF NOT EXISTS "owner_recommendation_verifications_workspaceId_idx" ON "owner_recommendation_verifications"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_recommendation_verifications_recommendationId_idx" ON "owner_recommendation_verifications"("recommendationId");
CREATE INDEX IF NOT EXISTS "owner_overreliance_acknowledgements_workspaceId_idx" ON "owner_overreliance_acknowledgements"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_overreliance_acknowledgements_recommendationId_idx" ON "owner_overreliance_acknowledgements"("recommendationId");
CREATE INDEX IF NOT EXISTS "owner_decisions_workspaceId_idx" ON "owner_decisions"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_decisions_businessId_idx" ON "owner_decisions"("businessId");
CREATE INDEX IF NOT EXISTS "owner_decisions_recommendationId_idx" ON "owner_decisions"("recommendationId");
CREATE UNIQUE INDEX IF NOT EXISTS "owner_decision_rights_decisionId_key" ON "owner_decision_rights"("decisionId");
CREATE INDEX IF NOT EXISTS "owner_decision_rights_workspaceId_idx" ON "owner_decision_rights"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_benefits_workspaceId_idx" ON "owner_benefits"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_benefits_businessId_idx" ON "owner_benefits"("businessId");
CREATE INDEX IF NOT EXISTS "owner_benefits_benefitStatus_idx" ON "owner_benefits"("benefitStatus");
CREATE INDEX IF NOT EXISTS "owner_benefit_reviews_workspaceId_idx" ON "owner_benefit_reviews"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_benefit_reviews_benefitId_idx" ON "owner_benefit_reviews"("benefitId");
CREATE INDEX IF NOT EXISTS "owner_actions_workspaceId_idx" ON "owner_actions"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_actions_businessId_idx" ON "owner_actions"("businessId");
CREATE INDEX IF NOT EXISTS "owner_actions_status_idx" ON "owner_actions"("status");
CREATE INDEX IF NOT EXISTS "owner_action_execution_logs_workspaceId_idx" ON "owner_action_execution_logs"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_action_execution_logs_actionId_idx" ON "owner_action_execution_logs"("actionId");
CREATE INDEX IF NOT EXISTS "owner_blockers_workspaceId_idx" ON "owner_blockers"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_blockers_actionId_idx" ON "owner_blockers"("actionId");
CREATE INDEX IF NOT EXISTS "owner_evidence_records_workspaceId_idx" ON "owner_evidence_records"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_evidence_records_businessId_idx" ON "owner_evidence_records"("businessId");
CREATE INDEX IF NOT EXISTS "owner_evidence_records_relatedEntityId_idx" ON "owner_evidence_records"("relatedEntityId");
CREATE INDEX IF NOT EXISTS "owner_evidence_records_status_idx" ON "owner_evidence_records"("status");
CREATE INDEX IF NOT EXISTS "owner_evidence_verifications_workspaceId_idx" ON "owner_evidence_verifications"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_evidence_verifications_businessId_idx" ON "owner_evidence_verifications"("businessId");
CREATE INDEX IF NOT EXISTS "owner_evidence_verifications_evidenceId_idx" ON "owner_evidence_verifications"("evidenceId");
CREATE INDEX IF NOT EXISTS "owner_evidence_verifications_verificationStatus_idx" ON "owner_evidence_verifications"("verificationStatus");
CREATE INDEX IF NOT EXISTS "owner_validation_criteria_workspaceId_idx" ON "owner_validation_criteria"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_validation_criteria_businessId_idx" ON "owner_validation_criteria"("businessId");
CREATE INDEX IF NOT EXISTS "owner_validation_criteria_recommendationId_idx" ON "owner_validation_criteria"("recommendationId");
CREATE INDEX IF NOT EXISTS "owner_validation_criteria_actionId_idx" ON "owner_validation_criteria"("actionId");
CREATE INDEX IF NOT EXISTS "owner_harm_events_workspaceId_idx" ON "owner_harm_events"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_harm_events_businessId_idx" ON "owner_harm_events"("businessId");
CREATE INDEX IF NOT EXISTS "owner_harm_events_harmSeverity_idx" ON "owner_harm_events"("harmSeverity");
CREATE INDEX IF NOT EXISTS "owner_harm_events_harmCategory_idx" ON "owner_harm_events"("harmCategory");
CREATE INDEX IF NOT EXISTS "owner_failure_adjudications_workspaceId_idx" ON "owner_failure_adjudications"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_failure_adjudications_businessId_idx" ON "owner_failure_adjudications"("businessId");
CREATE INDEX IF NOT EXISTS "owner_failure_adjudications_adjudicationVerdict_idx" ON "owner_failure_adjudications"("adjudicationVerdict");
CREATE INDEX IF NOT EXISTS "owner_causal_attributions_workspaceId_idx" ON "owner_causal_attributions"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_causal_attributions_businessId_idx" ON "owner_causal_attributions"("businessId");
CREATE INDEX IF NOT EXISTS "owner_causal_attributions_attributionClass_idx" ON "owner_causal_attributions"("attributionClass");
CREATE INDEX IF NOT EXISTS "owner_learning_eligibility_reviews_workspaceId_idx" ON "owner_learning_eligibility_reviews"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_learning_eligibility_reviews_businessId_idx" ON "owner_learning_eligibility_reviews"("businessId");
CREATE INDEX IF NOT EXISTS "owner_learning_eligibility_reviews_status_idx" ON "owner_learning_eligibility_reviews"("status");
CREATE INDEX IF NOT EXISTS "owner_learning_eligibility_reviews_allowsLearning_idx" ON "owner_learning_eligibility_reviews"("allowsLearning");
CREATE INDEX IF NOT EXISTS "owner_decision_memories_workspaceId_idx" ON "owner_decision_memories"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_decision_memories_businessId_idx" ON "owner_decision_memories"("businessId");
CREATE INDEX IF NOT EXISTS "owner_decision_memories_category_idx" ON "owner_decision_memories"("category");
CREATE INDEX IF NOT EXISTS "owner_decision_memories_blocksRepetition_idx" ON "owner_decision_memories"("blocksRepetition");
CREATE INDEX IF NOT EXISTS "owner_business_state_snapshots_workspaceId_idx" ON "owner_business_state_snapshots"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_business_state_snapshots_businessId_idx" ON "owner_business_state_snapshots"("businessId");
CREATE INDEX IF NOT EXISTS "owner_business_state_snapshots_periodLabel_idx" ON "owner_business_state_snapshots"("periodLabel");
CREATE INDEX IF NOT EXISTS "owner_business_metrics_timeline_workspaceId_idx" ON "owner_business_metrics_timeline"("workspaceId");
CREATE INDEX IF NOT EXISTS "owner_business_metrics_timeline_businessId_idx" ON "owner_business_metrics_timeline"("businessId");
CREATE INDEX IF NOT EXISTS "owner_business_metrics_timeline_metricName_idx" ON "owner_business_metrics_timeline"("metricName");
CREATE INDEX IF NOT EXISTS "owner_business_metrics_timeline_periodLabel_idx" ON "owner_business_metrics_timeline"("periodLabel");

ALTER TABLE "owner_input_records" ADD CONSTRAINT "owner_input_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_input_quality_assessments" ADD CONSTRAINT "owner_input_quality_assessments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_input_quality_assessments" ADD CONSTRAINT "owner_input_quality_assessments_input_record_id_fkey" FOREIGN KEY ("input_record_id") REFERENCES "owner_input_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_data_provenance_records" ADD CONSTRAINT "owner_data_provenance_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_data_provenance_records" ADD CONSTRAINT "owner_data_provenance_records_input_record_id_fkey" FOREIGN KEY ("input_record_id") REFERENCES "owner_input_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_missing_data_flags" ADD CONSTRAINT "owner_missing_data_flags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_missing_data_flags" ADD CONSTRAINT "owner_missing_data_flags_input_record_id_fkey" FOREIGN KEY ("input_record_id") REFERENCES "owner_input_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_diagnosis_evidence" ADD CONSTRAINT "owner_diagnosis_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_recommendations" ADD CONSTRAINT "owner_recommendations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_recommendation_evidence" ADD CONSTRAINT "owner_recommendation_evidence_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "owner_recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_recommendation_assumptions" ADD CONSTRAINT "owner_recommendation_assumptions_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "owner_recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_recommendation_constraints" ADD CONSTRAINT "owner_recommendation_constraints_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "owner_recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_recommendation_verifications" ADD CONSTRAINT "owner_recommendation_verifications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_overreliance_acknowledgements" ADD CONSTRAINT "owner_overreliance_acknowledgements_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_decisions" ADD CONSTRAINT "owner_decisions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_decision_rights" ADD CONSTRAINT "owner_decision_rights_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "owner_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_benefits" ADD CONSTRAINT "owner_benefits_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_benefit_reviews" ADD CONSTRAINT "owner_benefit_reviews_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "owner_benefits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_actions" ADD CONSTRAINT "owner_actions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_action_execution_logs" ADD CONSTRAINT "owner_action_execution_logs_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "owner_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_blockers" ADD CONSTRAINT "owner_blockers_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "owner_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_evidence_records" ADD CONSTRAINT "owner_evidence_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_evidence_verifications" ADD CONSTRAINT "owner_evidence_verifications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_validation_criteria" ADD CONSTRAINT "owner_validation_criteria_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_harm_events" ADD CONSTRAINT "owner_harm_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_failure_adjudications" ADD CONSTRAINT "owner_failure_adjudications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_causal_attributions" ADD CONSTRAINT "owner_causal_attributions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_learning_eligibility_reviews" ADD CONSTRAINT "owner_learning_eligibility_reviews_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_decision_memories" ADD CONSTRAINT "owner_decision_memories_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_business_state_snapshots" ADD CONSTRAINT "owner_business_state_snapshots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_business_metrics_timeline" ADD CONSTRAINT "owner_business_metrics_timeline_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_business_metrics_timeline" ADD CONSTRAINT "owner_business_metrics_timeline_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "owner_business_state_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
