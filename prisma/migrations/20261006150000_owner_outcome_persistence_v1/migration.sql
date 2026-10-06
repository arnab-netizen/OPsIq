-- Owner Outcome Persistence v1 (CORE) — ADDITIVE ONLY.
-- Two new tables; no existing table, column, row or constraint is altered, dropped or backfilled.
-- Preflight: both tables are new, so no unique constraint depends on existing data (nothing to de-duplicate).
-- Legacy System A / System B rows are not given owner decisions; they stay unlinked until assessed explicitly.
-- Both tables are append-only (trigger below): a later diagnosis/assessment never rewrites history.

-- CreateTable
CREATE TABLE "owner_decision_records" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "candidate_source" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "finding_code" TEXT,
    "recommendation_code" TEXT,
    "decision_state" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "supersedes_id" UUID,
    "decided_by_id" UUID NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "owner_reason" TEXT,
    "revisit_at" TIMESTAMP(3),
    "recommendation_snapshot" JSONB NOT NULL,
    "decision_contract_version" TEXT NOT NULL,
    "commitment_description" TEXT,
    "verification_metric" TEXT,
    "baseline_value" DOUBLE PRECISION,
    "baseline_provenance" TEXT,
    "target_direction" TEXT,
    "target_value" DOUBLE PRECISION,
    "observation_window_days" INTEGER,
    "intended_completion_at" TIMESTAMP(3),
    "expected_measurement_source" TEXT,
    "request_fingerprint" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_decision_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_outcome_assessments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "chain_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "previous_assessment_id" UUID,
    "owner_decision_id" UUID,
    "owner_decision_state" TEXT,
    "commitment_fidelity" TEXT NOT NULL,
    "decision_link_state" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "source_link_state" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "canonical_action_id" TEXT NOT NULL,
    "system_a_action_id" UUID,
    "system_a_verification_id" UUID,
    "process_task_id" UUID,
    "process_task_key" TEXT,
    "owner_action_outcome_id" TEXT,
    "reassessment_event_id" TEXT,
    "learning_candidate_ref" TEXT,
    "newer_diagnosis_domain" TEXT,
    "newer_diagnosis_cycle_id" UUID,
    "newer_diagnosis_evidence_as_of" TIMESTAMP(3),
    "policy_version" TEXT NOT NULL,
    "assessed_at" TIMESTAMP(3) NOT NULL,
    "assessed_by_id" UUID,
    "execution_status" TEXT NOT NULL,
    "observation_status" TEXT NOT NULL,
    "measurement_result" TEXT NOT NULL,
    "target_attainment" TEXT NOT NULL,
    "issue_resolution" TEXT NOT NULL,
    "causal_attribution" TEXT NOT NULL,
    "learning_eligibility" TEXT NOT NULL,
    "verification_status" TEXT NOT NULL,
    "evidence_quality" TEXT NOT NULL,
    "verifier_kind" TEXT NOT NULL,
    "independently_verified" BOOLEAN NOT NULL,
    "self_verified" BOOLEAN NOT NULL,
    "disputed" BOOLEAN NOT NULL,
    "external_interference" BOOLEAN NOT NULL,
    "measured_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "learning_blockers" TEXT[],
    "next_verification_action" TEXT NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "assessment_fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_outcome_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owner_decision_records_workspace_id_business_id_candidate_i_idx" ON "owner_decision_records"("workspace_id", "business_id", "candidate_id");

-- CreateIndex
CREATE INDEX "owner_decision_records_workspace_id_business_id_decided_at_idx" ON "owner_decision_records"("workspace_id", "business_id", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "owner_decision_records_candidate_sequence_key" ON "owner_decision_records"("workspace_id", "business_id", "candidate_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "owner_decision_records_ws_idempotency_key" ON "owner_decision_records"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "owner_outcome_assessments_workspace_id_business_id_chain_ke_idx" ON "owner_outcome_assessments"("workspace_id", "business_id", "chain_key");

-- CreateIndex
CREATE INDEX "owner_outcome_assessments_workspace_id_process_task_id_idx" ON "owner_outcome_assessments"("workspace_id", "process_task_id");

-- CreateIndex
CREATE INDEX "owner_outcome_assessments_workspace_id_owner_decision_id_idx" ON "owner_outcome_assessments"("workspace_id", "owner_decision_id");

-- CreateIndex
CREATE UNIQUE INDEX "owner_outcome_assessments_chain_version_key" ON "owner_outcome_assessments"("workspace_id", "chain_key", "version");

-- AddForeignKey
ALTER TABLE "owner_decision_records" ADD CONSTRAINT "owner_decision_records_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_decision_records" ADD CONSTRAINT "owner_decision_records_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "owner_decision_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_outcome_assessments" ADD CONSTRAINT "owner_outcome_assessments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_outcome_assessments" ADD CONSTRAINT "owner_outcome_assessments_owner_decision_id_fkey" FOREIGN KEY ("owner_decision_id") REFERENCES "owner_decision_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_outcome_assessments" ADD CONSTRAINT "owner_outcome_assessments_previous_assessment_id_fkey" FOREIGN KEY ("previous_assessment_id") REFERENCES "owner_outcome_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Integrity checks (enumerations and cross-field rules; the service validates first, the DB is the backstop) ──
ALTER TABLE "owner_decision_records"
  ADD CONSTRAINT "owner_decision_records_state_check" CHECK ("decision_state" IN ('ACCEPTED','REJECTED','DEFERRED','MODIFIED')),
  ADD CONSTRAINT "owner_decision_records_source_check" CHECK ("candidate_source" IN ('domain_action','compliance_item')),
  ADD CONSTRAINT "owner_decision_records_sequence_check" CHECK ("sequence" >= 1),
  ADD CONSTRAINT "owner_decision_records_baseline_prov_check" CHECK ("baseline_provenance" IS NULL OR "baseline_provenance" IN ('MEASURED','OWNER_REPORTED','EXTERNAL_SOURCE','UNKNOWN')),
  ADD CONSTRAINT "owner_decision_records_direction_check" CHECK ("target_direction" IS NULL OR "target_direction" IN ('up','down','unknown')),
  ADD CONSTRAINT "owner_decision_records_window_check" CHECK ("observation_window_days" IS NULL OR "observation_window_days" > 0),
  ADD CONSTRAINT "owner_decision_records_measure_src_check" CHECK ("expected_measurement_source" IS NULL OR "expected_measurement_source" IN ('AUTHORITATIVE_SNAPSHOT','SYSTEM_MEASUREMENT','EXTERNAL_RECORD','OWNER_ENTERED')),
  -- A baseline value is never stored without saying where it came from (UNKNOWN is a legitimate answer; silence is not).
  ADD CONSTRAINT "owner_decision_records_baseline_needs_prov_check" CHECK ("baseline_value" IS NULL OR "baseline_provenance" IS NOT NULL),
  -- REJECTED / DEFERRED carry no execution contract; ACCEPTED / MODIFIED always state a direction (possibly "unknown").
  ADD CONSTRAINT "owner_decision_records_contract_shape_check" CHECK (
    ("decision_state" IN ('ACCEPTED','MODIFIED') AND "target_direction" IS NOT NULL)
    OR ("decision_state" IN ('REJECTED','DEFERRED') AND "target_direction" IS NULL AND "commitment_description" IS NULL
        AND "verification_metric" IS NULL AND "baseline_value" IS NULL AND "baseline_provenance" IS NULL AND "target_value" IS NULL
        AND "observation_window_days" IS NULL AND "intended_completion_at" IS NULL AND "expected_measurement_source" IS NULL)),
  ADD CONSTRAINT "owner_decision_records_modified_needs_commitment_check" CHECK ("decision_state" <> 'MODIFIED' OR "commitment_description" IS NOT NULL),
  ADD CONSTRAINT "owner_decision_records_revisit_check" CHECK ("revisit_at" IS NULL OR "decision_state" = 'DEFERRED');

ALTER TABLE "owner_outcome_assessments"
  ADD CONSTRAINT "owner_outcome_assessments_version_check" CHECK ("version" >= 1 AND (("version" = 1 AND "previous_assessment_id" IS NULL) OR ("version" > 1 AND "previous_assessment_id" IS NOT NULL))),
  ADD CONSTRAINT "owner_outcome_assessments_execution_check" CHECK ("execution_status" IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')),
  ADD CONSTRAINT "owner_outcome_assessments_observation_check" CHECK ("observation_status" IN ('NOT_STARTED','WINDOW_OPEN','READY_TO_MEASURE','MISSING_AFTER_EVIDENCE','MEASURED')),
  ADD CONSTRAINT "owner_outcome_assessments_measurement_check" CHECK ("measurement_result" IN ('IMPROVED','UNCHANGED','WORSENED','CHANGED_DIRECTION_UNKNOWN','NOT_MEASURABLE','DISPUTED','EXTERNALLY_CONFOUNDED')),
  ADD CONSTRAINT "owner_outcome_assessments_target_check" CHECK ("target_attainment" IN ('REACHED','NOT_REACHED','NO_TARGET','UNKNOWN')),
  ADD CONSTRAINT "owner_outcome_assessments_resolution_check" CHECK ("issue_resolution" IN ('RESOLVED','STILL_OPEN','WORSENED','NOT_YET_REASSESSED','INCONCLUSIVE')),
  -- Attribution can never be stronger than PLAUSIBLE: there is deliberately no PROVEN / CAUSED value.
  ADD CONSTRAINT "owner_outcome_assessments_causal_check" CHECK ("causal_attribution" IN ('NOT_ASSESSED','PLAUSIBLE','CONFOUNDED','DISPUTED','INSUFFICIENT_EVIDENCE')),
  ADD CONSTRAINT "owner_outcome_assessments_learning_check" CHECK ("learning_eligibility" IN ('ELIGIBLE_CONFIRMED_BY_GATE','PENDING_GOVERNANCE','NOT_ELIGIBLE','NO_LEARNING_LOOP')),
  ADD CONSTRAINT "owner_outcome_assessments_fidelity_check" CHECK ("commitment_fidelity" IN ('AS_RECOMMENDED','MODIFIED_BY_OWNER','NOT_COMMITTED','NO_DECISION')),
  ADD CONSTRAINT "owner_outcome_assessments_system_check" CHECK ("source_system" IN ('SYSTEM_A','SYSTEM_B','NONE')),
  -- RESOLVED is only ever stored together with the specific newer diagnosis cycle that supports it.
  ADD CONSTRAINT "owner_outcome_assessments_resolved_needs_cycle_check" CHECK ("issue_resolution" <> 'RESOLVED' OR "newer_diagnosis_cycle_id" IS NOT NULL);

-- ── Append-only: history is never rewritten or deleted ──
CREATE OR REPLACE FUNCTION owner_outcome_persistence_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted (write a new decision/assessment version instead)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER owner_decision_records_append_only
  BEFORE UPDATE OR DELETE ON "owner_decision_records"
  FOR EACH ROW EXECUTE FUNCTION owner_outcome_persistence_append_only();

CREATE TRIGGER owner_outcome_assessments_append_only
  BEFORE UPDATE OR DELETE ON "owner_outcome_assessments"
  FOR EACH ROW EXECUTE FUNCTION owner_outcome_persistence_append_only();
