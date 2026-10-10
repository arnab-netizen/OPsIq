export const AUDIT_EVENTS = {
  // Auth
  USER_LOGGED_IN: "user.logged_in",
  USER_LOGGED_OUT: "user.logged_out",
  USER_LOGIN_FAILED: "user.login_failed",
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  WORKSPACE_CREATED: "workspace.created",
  USER_DEACTIVATED: "user.deactivated",
  USER_REACTIVATED: "user.reactivated",
  PASSWORD_RESET_REQUESTED: "user.password_reset_requested",
  PASSWORD_RESET_COMPLETED: "user.password_reset_completed",

  // Roles
  ROLE_ASSIGNED: "role.assigned",
  ROLE_REVOKED: "role.revoked",

  // Session
  SESSION_CREATED: "session.created",
  SESSION_EXPIRED: "session.expired",
  SESSION_REVOKED: "session.revoked",

  // Lead
  LEAD_CREATED: "lead.created",
  LEAD_UPDATED: "lead.updated",
  LEAD_LINKED_TO_ENGAGEMENT: "lead.linked_to_engagement",

  // Client
  CLIENT_ACCOUNT_CREATED: "client_account.created",
  CLIENT_ACCOUNT_UPDATED: "client_account.updated",
  CLIENT_ACCOUNT_ARCHIVED: "client_account.archived",
  CLIENT_CONTACT_CREATED: "client_contact.created",
  CLIENT_CONTACT_UPDATED: "client_contact.updated",
  CLIENT_CONTACT_DEACTIVATED: "client_contact.deactivated",

  // Legacy aliases (Module 0 forward declarations)
  CLIENT_CREATED: "client.created",
  CLIENT_UPDATED: "client.updated",
  CLIENT_ARCHIVED: "client.archived",

  // Engagement Membership
  ENGAGEMENT_MEMBER_ADDED: "engagement.member_added",
  ENGAGEMENT_MEMBER_REMOVED: "engagement.member_removed",

  // Engagement
  ENGAGEMENT_CREATED: "engagement.created",
  ENGAGEMENT_UPDATED: "engagement.updated",
  ENGAGEMENT_STAGE_CHANGED: "engagement.stage_changed",
  ENGAGEMENT_COMPLETED: "engagement.completed",
  ENGAGEMENT_CANCELLED: "engagement.cancelled",
  ENGAGEMENT_BLOCKED: "engagement.blocked",
  ENGAGEMENT_UNBLOCKED: "engagement.unblocked",

  // Stage
  STAGE_CREATED: "stage.created",
  STAGE_UPDATED: "stage.updated",
  STAGE_TRANSITIONED: "stage.transitioned",
  STAGE_BLOCKED: "stage.blocked",
  STAGE_UNBLOCKED: "stage.unblocked",

  // Evidence (legacy names, superseded by EVIDENCE_ITEM_*)
  EVIDENCE_SUBMITTED: "evidence.submitted",
  EVIDENCE_VALIDATED: "evidence.validated",
  EVIDENCE_REJECTED: "evidence.rejected",
  EVIDENCE_BUNDLE_CREATED: "evidence_bundle.created",
  EVIDENCE_BUNDLE_UPDATED: "evidence_bundle.updated",
  EVIDENCE_BUNDLE_ITEM_ADDED: "evidence_bundle.evidence_added",
  EVIDENCE_BUNDLE_ITEM_REMOVED: "evidence_bundle.evidence_removed",

  // Finding
  FINDING_CREATED: "finding.created",
  FINDING_UPDATED: "finding.updated",
  FINDING_STATUS_CHANGED: "finding.status_changed",
  FINDING_ARCHIVED: "finding.archived",
  FINDING_LINKED: "finding.linked",

  // Recommendation
  RECOMMENDATION_CREATED: "recommendation.created",
  RECOMMENDATION_UPDATED: "recommendation.updated",
  RECOMMENDATION_STATUS_CHANGED: "recommendation.status_changed",
  RECOMMENDATION_ARCHIVED: "recommendation.archived",
  RECOMMENDATION_APPROVED: "recommendation.approved",
  RECOMMENDATION_SUPERSEDED: "recommendation.superseded",

  // Action Item
  ACTION_CREATED: "action.created",
  ACTION_UPDATED: "action.updated",
  ACTION_STARTED: "action.started",
  ACTION_COMPLETED: "action.completed",
  ACTION_OVERDUE: "action.overdue",
  ACTION_PRIORITY_ESCALATED: "action.priority_escalated",

  // Execution Commitment
  EXECUTION_ACKNOWLEDGED: "execution.acknowledged",
  DECISION_EXECUTION_STARTED: "decision.execution_started",
  DECISION_EXECUTION_SUCCESS: "decision.execution_success",
  DECISION_EXECUTION_FAILED: "decision.execution_failed",

  // Decision Lifecycle
  DECISION_SUBMITTED: "decision.submitted",
  DECISION_APPROVED: "decision.approved",
  DECISION_ACCEPTED: "decision.accepted",
  DECISION_REJECTED: "decision.rejected",
  DECISION_BLOCKED: "decision.blocked",
  DECISION_OVERRIDDEN: "decision.overridden",
  DECISION_EXECUTED: "decision.executed",
  DECISION_STATUS_CHANGED: "decision.status_changed",
  DECISION_CANCELLED: "decision.cancelled",
  DECISION_FAILED: "decision.failed",
  DECISION_CLOSED: "decision.closed",
  OUTCOME_RECORDED: "outcome.recorded",
  OUTCOME_VERIFIED: "outcome.verified",
  DECISION_IMPACT_PROJECTED: "decision.impact_projected",
  DECISION_IMPACT_REALIZED: "decision.impact_realized",
  DECISION_ROI_RECORDED: "decision.roi_recorded",

  // Operator Item (Decision Queue)
  OPERATOR_ITEM_CREATED: "operator_item.created",
  OPERATOR_ITEM_UPDATED: "operator_item.updated",
  OPERATOR_ITEM_OVERRIDDEN: "operator_item.overridden",
  OPERATOR_ITEM_BLOCKED: "operator_item.blocked",
  OPERATOR_QUEUE_VIEWED: "operator.queue_viewed",

  // KPI
  KPI_DEFINED: "kpi.defined",
  KPI_SNAPSHOT_RECORDED: "kpi.snapshot_recorded",
  KPI_DETERIORATED: "kpi.deteriorated",

  // Deliverable
  DELIVERABLE_CREATED: "deliverable.created",
  DELIVERABLE_VERSION_SUBMITTED: "deliverable.version_submitted",
  DELIVERABLE_APPROVED: "deliverable.approved",
  DELIVERABLE_REJECTED: "deliverable.rejected",
  DELIVERABLE_GENERATED: "deliverable.generated",

  // Approval
  APPROVAL_REQUESTED: "approval.requested",
  APPROVAL_GRANTED: "approval.granted",
  APPROVAL_DENIED: "approval.denied",

  // Override
  OVERRIDE_REQUESTED: "override.requested",
  OVERRIDE_APPROVED: "override.approved",
  OVERRIDE_DENIED: "override.denied",

  // Business Condition
  CONDITION_ASSESSED: "condition.assessed",
  CONDITION_CHANGED: "condition.changed",

  // Diagnosis
  DIAGNOSIS_COMPLETED: "diagnosis.completed",

  // Intervention
  INTERVENTION_STATE_INITIALIZED: "intervention.state_initialized",
  INTERVENTION_MODE_CHANGED: "intervention.mode_changed",
  INTERVENTION_PHASE_CHANGED: "intervention.phase_changed",

  // Shock Event
  SHOCK_EVENT_RECORDED: "shock.event_recorded",
  SHOCK_EVENT_UPDATED: "shock.event_updated",
  SHOCK_EVENT_RESOLVED: "shock.event_resolved",

  // Evidence (new item/file events)
  EVIDENCE_ITEM_CREATED: "evidence.item_created",
  EVIDENCE_ITEM_UPDATED: "evidence.item_updated",
  EVIDENCE_FILE_UPLOADED: "evidence.file_uploaded",

  // Finding (additional events)
  FINDING_VALIDATED: "finding.validated",
  FINDING_DISPUTED: "finding.disputed",
  FINDING_SUPERSEDED: "finding.superseded",
  FINDING_EVIDENCE_LINKED: "finding.evidence_linked",
  FINDING_EVIDENCE_UNLINKED: "finding.evidence_unlinked",

  // Risk
  RISK_IDENTIFIED: "risk.identified",
  RISK_UPDATED: "risk.updated",
  RISK_MITIGATED: "risk.mitigated",

  // Scope
  SCOPE_VERSION_CREATED: "scope.version_created",
  SCOPE_CHANGE_REQUESTED: "scope.change_requested",
  SCOPE_CHANGE_APPROVED: "scope.change_approved",

  // Review
  REVIEW_CYCLE_STARTED: "review.cycle_started",
  REVIEW_CYCLE_COMPLETED: "review.cycle_completed",
  REVIEW_DUE_FLAGGED: "review.due_flagged",

  // Escalation
  ESCALATION_ALERT_HIGH_PRIORITY_OVERDUE: "escalation.high_priority_overdue",
  ESCALATION_ALERT_KPI_DETERIORATION_PATTERN: "escalation.kpi_deterioration_pattern",

  // Execution Certainty
  EXECUTION_CERTAINTY_WARNING: "execution_certainty.warning",
  EXECUTION_CERTAINTY_OVERRIDE: "execution_certainty.override",

  // Human Factors
  HUMAN_FACTORS_ASSESSED: "human_factors.assessed",
  HUMAN_FACTORS_UPDATED: "human_factors.updated",

  // File/Storage
  FILE_UPLOADED: "file.uploaded",
  FILE_DELETED: "file.deleted",
  FILE_ACCESS_CHANGED: "file.access_changed",

  // Idempotency
  IDEMPOTENCY_REPLAY_DETECTED: "idempotency.replay_detected",

  // Alert
  ALERT_CREATED: "alert.created",
  ALERT_UPDATED: "alert.updated",
  ALERT_EMAIL_DELIVERED: "alert.email_delivered",
  ALERT_EMAIL_FAILED: "alert.email_failed",
  ALERT_EMAIL_RETRY: "alert.email_retry",
  ALERT_EMAIL_PERMANENTLY_FAILED: "alert.email_permanently_failed",

  // Notification (P0-01: truthful channel delivery)
  NOTIFICATION_SENT: "notification.sent",

  // Webhook (D3 / P0-02: audit field-name fix)
  WEBHOOK_CREATED: "webhook.created",
  WEBHOOK_DELETED: "webhook.deleted",

  // Learning
  LEARNING_RECORDED: "learning.recorded",

  // Experiment
  EXPERIMENT_CREATED: "experiment.created",
  EXPERIMENT_APPROVED: "experiment.approved",
  EXPERIMENT_STARTED: "experiment.started",
  EXPERIMENT_PROGRESS_UPDATED: "experiment.progress_updated",
  EXPERIMENT_RESULT_RECORDED: "experiment.result_recorded",
  EXPERIMENT_LEARNING_RECORDED: "experiment.learning_recorded",

  // Billing/Subscription
  SUBSCRIPTION_ACTIVATED: "subscription.activated",
  WEBHOOK_RETRY_THRESHOLD_EXCEEDED: "webhook.retry_threshold_exceeded",

  // Owner Mode
  OWNER_DASHBOARD_VIEWED: "owner.dashboard_viewed",
  OWNER_CONFIG_UPDATED: "owner.config_updated",

  // Jarvis 360 — owner safety-gate governance (Slice 0)
  OWNER_GATE_OPT_OUT_RECORDED: "owner.gate_opt_out_recorded",
  OWNER_GATE_OPT_OUT_CLEARED: "owner.gate_opt_out_cleared",
  OWNER_GATE_PROMOTION_BLOCKED: "owner.gate_promotion_blocked",
  /** A gate could not assess an owner action (e.g. unknown margin) and did not block it: recorded, never silent. */
  OWNER_GATE_ASSESSMENT_ABSTAINED: "owner.gate_assessment_abstained",
  // Jarvis 360 Slice 4 — owner load reduction / approval memory
  OWNER_APPROVAL_MEMORY_RECORDED: "owner.approval_memory_recorded",
  OWNER_APPROVAL_MEMORY_REUSED: "owner.approval_memory_reused",
  OWNER_STANDING_INSTRUCTION_RECORDED: "owner.standing_instruction_recorded",
  OWNER_ATTENTION_EVENT_RECORDED: "owner.attention_event_recorded",
  // Jarvis 360 Slice 5–8 — SOP/process/training/equipment lifecycle
  OWNER_SOP_DOC_CREATED: "owner.sop_doc_created",
  OWNER_SOP_DOC_APPROVED: "owner.sop_doc_approved",
  OWNER_SOP_DOC_REVISED: "owner.sop_doc_revised",
  OWNER_SOP_DOC_RETIRED: "owner.sop_doc_retired",
  OWNER_TRAINING_RECOMMENDED: "owner.training_recommended",
  OWNER_TRAINING_COMPLETED: "owner.training_completed",
  OWNER_EQUIPMENT_RECORDED: "owner.equipment_recorded",
  OWNER_PROCESS_REVIEW_TRIGGERED: "owner.process_review_triggered",
  // Jarvis 360 Slice 12–14 — memory / self-eval / compliance
  OWNER_DO_NOT_REPEAT_BLOCKED: "owner.do_not_repeat_blocked",
  OWNER_DO_NOT_REPEAT_RECORDED: "owner.do_not_repeat_recorded",
  OWNER_DO_NOT_REPEAT_CONTEXT_CHANGED: "owner.do_not_repeat_context_changed",
  OWNER_SELF_EVALUATION_RECORDED: "owner.self_evaluation_recorded",
  OWNER_COMPLIANCE_REVIEW_REQUIRED: "owner.compliance_review_required",
  // Jarvis 360 gap-closure — live owner-loop wiring
  OWNER_TASK_COMPLETION_BLOCKED: "owner.task_completion_blocked",
  OWNER_TASK_COMPLETED: "owner.task_completed",
  OWNER_TASK_OVERRIDE_USED: "owner.task_override_used",
  OWNER_APPROVAL_AUTO_HANDLED: "owner.approval_auto_handled",
  OWNER_ARBITRATION_RESOLVED: "owner.arbitration_resolved",
  OWNER_OPPORTUNITY_DECIDED: "owner.opportunity_decided",
  OWNER_OPPORTUNITY_SIGNAL_SUBMITTED: "owner.opportunity_signal_submitted",
  OWNER_OPPORTUNITY_VALIDATION_OUTCOME_RECORDED: "owner.opportunity_validation_outcome_recorded",
  OWNER_OPPORTUNITY_EXECUTION_TASK_UPDATED: "owner.opportunity_execution_task_updated",
  OWNER_PROCESS_EXECUTION_TASK_UPSERTED: "owner.process_execution_task_upserted",
  OWNER_PROCESS_EXECUTION_TASK_COMPLETED: "owner.process_execution_task_completed",
  OWNER_PROCESS_EXECUTION_TASK_TRANSITIONED: "owner.process_execution_task_transitioned",

  // Owner-Only Recovery Mode
  OWNER_BUSINESS_CREATED: "owner.business_created",
  OWNER_BUSINESS_UPDATED: "owner.business_updated",
  OWNER_METRIC_SNAPSHOT_RECORDED: "owner.metric_snapshot_recorded",
  RECOVERY_CYCLE_RUN: "owner.recovery_cycle_run",
  RECOVERY_ACTION_UPDATED: "owner.recovery_action_updated",
  RECOVERY_ACTION_COMPLETED: "owner.recovery_action_completed",
  RECOVERY_REASSESSMENT_TRIGGERED: "owner.recovery_reassessment_triggered",
  RECOVERY_OUTCOME_VERIFIED: "owner.recovery_outcome_verified",
  RECOVERY_VERIFICATION_REASSESSMENT_TRIGGERED: "owner.recovery_verification_reassessment_triggered",

  // Canonical owner decision (Owner Intelligence Spine) — recorded when the owner's main target,
  // critical-issue set, confidence or funding gap materially changes; also the decision memory the
  // resolver compares against for "what changed" (independent of which owner page was visited).
  OWNER_DECISION_CHANGED: "owner.decision_changed",

  // Owner Finance (Module 2)
  OWNER_FINANCE_SNAPSHOT_RECORDED: "owner.finance_snapshot_recorded",
  OWNER_FINANCE_SNAPSHOT_AMENDED: "owner.finance_snapshot_amended",
  OWNER_FINANCE_DIAGNOSIS_RUN: "owner.finance_diagnosis_run",
  OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE: "owner.finance_diagnosis_low_confidence",
  OWNER_FINANCE_ACTION_UPDATED: "owner.finance_action_updated",
  OWNER_FINANCE_ACTION_COMPLETED: "owner.finance_action_completed",
  OWNER_FINANCE_REASSESSMENT_TRIGGERED: "owner.finance_reassessment_triggered",
  OWNER_FINANCE_OUTCOME_VERIFIED: "owner.finance_outcome_verified",
  // Finance closed-loop learning — outcome signal recorded for effectiveness tracking
  OWNER_FINANCE_LEARNING_SIGNAL_RECORDED: "owner.finance_learning_signal_recorded",
  OWNER_FINANCE_LEARNING_SIGNAL_SKIPPED: "owner.finance_learning_signal_skipped",
  OWNER_FINANCE_EFFECTIVENESS_APPLIED: "owner.finance_effectiveness_applied",
  // Owner reassessment lifecycle — created by the reassessment-event creation service when a
  // supported trigger occurs (bad outcome / accepted-proof contradiction).
  OWNER_REASSESSMENT_CREATED: "owner.reassessment_created",

  // Owner Budget (Dynamic Budget, Capital Allocation & Profit Governance)
  OWNER_BUDGET_PERIOD_CREATED: "owner.budget_period_created",
  OWNER_BUDGET_LINE_CHANGED: "owner.budget_line_changed",
  OWNER_BUDGET_SPEND_RECORDED: "owner.budget_spend_recorded",
  OWNER_BUDGET_SPEND_BLOCKED: "owner.budget_spend_blocked",
  OWNER_BUDGET_SPEND_PROOF_UPDATED: "owner.budget_spend_proof_updated",
  OWNER_BUDGET_REASSESSED: "owner.budget_reassessed",
  OWNER_BUDGET_OVERRIDE_RECORDED: "owner.budget_override_recorded",
  OWNER_BUDGET_AUTHORITY_CHANGED: "owner.budget_authority_changed",
  OWNER_BUDGET_VENDOR_CREATED: "owner.budget_vendor_created",
  OWNER_BUDGET_VENDOR_BANK_VERIFIED: "owner.budget_vendor_bank_verified",
  OWNER_BUDGET_INITIATIVE_CLOSED: "owner.budget_initiative_closed",
  OWNER_BUDGET_ACTION_CREATED: "owner.budget_action_created",
  OWNER_BUDGET_ACTION_LINKED: "owner.budget_action_linked",
  OWNER_BUDGET_ACTION_UPDATED: "owner.budget_action_updated",
  OWNER_BUDGET_WORKING_CAPITAL_ITEM_RECORDED: "owner.budget_working_capital_item_recorded",
  OWNER_BUDGET_ARCHETYPE_METRIC_RECORDED: "owner.budget_archetype_metric_recorded",
  OWNER_BUDGET_SIGNAL_ROUTED: "owner.budget_signal_routed",
  OWNER_BUDGET_CROSS_MODULE_REASSESSMENT_TRIGGERED: "owner.budget_cross_module_reassessment_triggered",

  // Owner Cashflow (Module 5)
  OWNER_CASHFLOW_SNAPSHOT_RECORDED: "owner.cashflow_snapshot_recorded",
  OWNER_CASHFLOW_DIAGNOSIS_RUN: "owner.cashflow_diagnosis_run",
  OWNER_CASHFLOW_ACTION_UPDATED: "owner.cashflow_action_updated",
  OWNER_CASHFLOW_ACTION_COMPLETED: "owner.cashflow_action_completed",
  OWNER_CASHFLOW_REASSESSMENT_TRIGGERED: "owner.cashflow_reassessment_triggered",
  OWNER_CASHFLOW_OUTCOME_VERIFIED: "owner.cashflow_outcome_verified",
  OWNER_CASHFLOW_VERIFICATION_REASSESSMENT_TRIGGERED: "owner.cashflow_verification_reassessment_triggered",

  // Owner Sales (Module 3)
  OWNER_SALES_SNAPSHOT_RECORDED: "owner.sales_snapshot_recorded",
  OWNER_SALES_DIAGNOSIS_RUN: "owner.sales_diagnosis_run",
  OWNER_SALES_ACTION_UPDATED: "owner.sales_action_updated",
  OWNER_SALES_ACTION_COMPLETED: "owner.sales_action_completed",
  OWNER_SALES_REASSESSMENT_TRIGGERED: "owner.sales_reassessment_triggered",
  OWNER_SALES_OUTCOME_VERIFIED: "owner.sales_outcome_verified",
  OWNER_SALES_VERIFICATION_REASSESSMENT_TRIGGERED: "owner.sales_verification_reassessment_triggered",

  // Owner Operations (Module 4)
  OWNER_OPERATIONS_SNAPSHOT_RECORDED: "owner.operations_snapshot_recorded",
  OWNER_OPERATIONS_DIAGNOSIS_RUN: "owner.operations_diagnosis_run",
  OWNER_OPERATIONS_ACTION_UPDATED: "owner.operations_action_updated",
  OWNER_OPERATIONS_ACTION_COMPLETED: "owner.operations_action_completed",
  OWNER_OPERATIONS_REASSESSMENT_TRIGGERED: "owner.operations_reassessment_triggered",
  OWNER_OPERATIONS_OUTCOME_VERIFIED: "owner.operations_outcome_verified",
  OWNER_OPERATIONS_VERIFICATION_REASSESSMENT_TRIGGERED: "owner.operations_verification_reassessment_triggered",

  OWNER_SOP_SNAPSHOT_RECORDED: "owner.sop_snapshot_recorded",
  OWNER_SOP_DIAGNOSIS_RUN: "owner.sop_diagnosis_run",
  OWNER_SOP_ACTION_UPDATED: "owner.sop_action_updated",
  OWNER_SOP_ACTION_COMPLETED: "owner.sop_action_completed",
  OWNER_SOP_REASSESSMENT_TRIGGERED: "owner.sop_reassessment_triggered",
  OWNER_SOP_OUTCOME_VERIFIED: "owner.sop_outcome_verified",
  OWNER_SOP_VERIFICATION_REASSESSMENT_TRIGGERED: "owner.sop_verification_reassessment_triggered",

  OWNER_MARKETING_SNAPSHOT_RECORDED: "owner.marketing_snapshot_recorded",
  OWNER_MARKETING_DIAGNOSIS_RUN: "owner.marketing_diagnosis_run",
  OWNER_MARKETING_ACTION_UPDATED: "owner.marketing_action_updated",
  OWNER_MARKETING_ACTION_COMPLETED: "owner.marketing_action_completed",
  OWNER_MARKETING_REASSESSMENT_TRIGGERED: "owner.marketing_reassessment_triggered",
  OWNER_MARKETING_OUTCOME_VERIFIED: "owner.marketing_outcome_verified",
  OWNER_MARKETING_VERIFICATION_REASSESSMENT_TRIGGERED: "owner.marketing_verification_reassessment_triggered",

  OWNER_STRATEGY_SNAPSHOT_RECORDED: "owner.strategy_snapshot_recorded",
  OWNER_STRATEGY_DIAGNOSIS_RUN: "owner.strategy_diagnosis_run",
  OWNER_STRATEGY_ACTION_UPDATED: "owner.strategy_action_updated",
  OWNER_STRATEGY_ACTION_COMPLETED: "owner.strategy_action_completed",
  OWNER_STRATEGY_REASSESSMENT_TRIGGERED: "owner.strategy_reassessment_triggered",
  OWNER_STRATEGY_OUTCOME_VERIFIED: "owner.strategy_outcome_verified",
  OWNER_STRATEGY_VERIFICATION_REASSESSMENT_TRIGGERED: "owner.strategy_verification_reassessment_triggered",

  // Finance domain — verification-triggered reassessment (separate from action-completion trigger)
  OWNER_FINANCE_VERIFICATION_REASSESSMENT_TRIGGERED: "owner.finance_verification_reassessment_triggered",

  OWNER_DATA_INTAKE_RECORDED: "owner.data_intake_recorded",
  OWNER_DATA_INTAKE_CONFIRMED: "owner.data_intake_confirmed",

  // Fact Review (B05)
  FACT_REVIEW_APPROVED: "fact.review_approved",
  FACT_REVIEW_CORRECTED: "fact.review_corrected",
  FACT_REVIEW_REJECTED: "fact.review_rejected",
  FACT_REVIEW_MARKED_UNKNOWN: "fact.review_marked_unknown",
  FACT_REVIEW_UNDONE: "fact.review_undone",

  // Governed AI Copilot (advisory-only; one event per accepted/rejected AI call)
  AI_CALL_RECORDED: "ai.call_recorded",

  // Approved Execution Boundary v2 (owner-approved guided-execution envelope)
  EXECUTION_BOUNDARY_CREATED: "execution.boundary_created",
  EXECUTION_BOUNDARY_SUPERSEDED: "execution.boundary_superseded",
  EXECUTION_BOUNDARY_VALIDATION_BLOCKED: "execution.boundary_validation_blocked",

  // Employee/manager account lifecycle (Owner Mode guided execution, Slice 3)
  EMPLOYEE_SUSPENDED: "employee.suspended",
  EMPLOYEE_REACTIVATED: "employee.reactivated",
  EMPLOYEE_OFFBOARDED: "employee.offboarded",
  EMPLOYEE_SESSIONS_REVOKED: "employee.sessions_revoked",

  // Explicit guided-execution permission grants (Slice 4)
  PERMISSION_GRANTED: "permission.granted",
  PERMISSION_REVOKED: "permission.revoked",

  // Delegated task / work-order state machine (Slice 7)
  TASK_ASSIGNED: "task.assigned",
  TASK_STATUS_CHANGED: "task.status_changed",

  // Proof requirement / submission / review (Slice 8)
  PROOF_SUBMITTED: "proof.submitted",
  PROOF_REVIEWED: "proof.reviewed",
  // Governed dispute of a previously-accepted proof (owner/authorized reviewer). Carries the full
  // dispute record (category, reason, source, reassessment link) as the persisted dispute event.
  PROOF_DISPUTED: "proof.disputed",
  // Per-event operational complaint/rework (minimal model) — governed creation + proof linkage.
  OPERATIONAL_EVENT_RECORDED: "operational_event.recorded",
  OPERATIONAL_EVENT_LINKED: "operational_event.linked",
  // Governed status transition of an operational event (OPEN→IN_REVIEW→RESOLVED/DISMISSED/DUPLICATE).
  OPERATIONAL_EVENT_STATUS_CHANGED: "operational_event.status_changed",
  // Governed owner/reviewer adjudication of a flagged proof-risk finding (reused/fake/suspicious).
  PROOF_RISK_ADJUDICATED: "proof_risk.adjudicated",

  // Employee blocker / escalation (Slice 9)
  ESCALATION_RAISED: "escalation.raised",
  ESCALATION_ACKNOWLEDGED: "escalation.acknowledged",
  ESCALATION_RESOLVED: "escalation.resolved",

  // Employee guidance generation (Slice 10 — durable AI-guidance ledger at call site)
  EMPLOYEE_GUIDANCE_GENERATED: "employee_guidance.generated",
  EMPLOYEE_GUIDANCE_BLOCKED: "employee_guidance.blocked",

  // AI proof precheck (Slice 11 — advisory only; never final-accepts)
  AI_PROOF_PRECHECK_RECORDED: "ai_proof_precheck.recorded",

  // Customer communication control (Slice 20)
  CUSTOMER_MESSAGE_SENT: "customer_message.sent",
  CUSTOMER_MESSAGE_BLOCKED: "customer_message.blocked",

  // Personalized SOP / workflow engine (Slice 16)
  SOP_VERSION_APPROVED: "sop.version_approved",

  // Owner Vendor / Procurement Risk (Module #14)
  OWNER_VENDOR_RISK_ASSESSED: "owner.vendor_risk_assessed",
  OWNER_VENDOR_APPROVED: "owner.vendor_approved",
  OWNER_VENDOR_SUSPENDED: "owner.vendor_suspended",
  OWNER_VENDOR_CONTRACT_RECORDED: "owner.vendor_contract_recorded",
  OWNER_VENDOR_DELIVERY_RECORDED: "owner.vendor_delivery_recorded",

  // Phase 4: Waste / Leakage Detection
  WASTE_LEAKAGE_DETECTED: "owner.waste_leakage_detected",
  WASTE_LEAKAGE_CONFIRMED: "owner.waste_leakage_confirmed",
  WASTE_LEAKAGE_DISMISSED: "owner.waste_leakage_dismissed",
  WASTE_LEAKAGE_RECOVERY_VERIFIED: "owner.waste_leakage_recovery_verified",

  // Phase 5: Owner Goal + Trajectory Engine
  OWNER_GOAL_CREATED: "owner.goal_created",
  OWNER_GOAL_ACHIEVED: "owner.goal_achieved",
  /** A goal was REVISED because a successor replaced it (payload names old/new goal, scopes and reason). */
  OWNER_GOAL_REVISED: "owner.goal_revised",

  // Phase 6: Google Sheets Spreadsheet Allowlist
  SPREADSHEET_ALLOWLIST_ADDED: "external.spreadsheet_allowlist_added",
  SPREADSHEET_ALLOWLIST_REVOKED: "external.spreadsheet_allowlist_revoked",

  // Phase 7: Governed Operating Policy Registry
  OPERATING_POLICY_CREATED: "governance.operating_policy_created",
  OPERATING_POLICY_UPDATED: "governance.operating_policy_updated",
  OPERATING_POLICY_OVERRIDE_CREATED: "governance.operating_policy_override_created",
  OPERATING_POLICY_OVERRIDE_REVOKED: "governance.operating_policy_override_revoked",

  // Owner Progress / Review (Workflow 7 — businessId-scoped, no engagementId required)
  OWNER_BUSINESS_REVIEW_GENERATED: "owner.business_review_generated",

  // Owner Tender / Application Pack (Module A5)
  OWNER_TENDER_APPLICATION_PACK_GENERATED: "owner.tender_application_pack_generated",

  // Decision engine — auth / permission failures
  AUTH_FAILED: "auth.failed",
  PERMISSION_DENIED: "auth.permission_denied",

  // Decision engine — input and dependency validation
  INPUT_VALIDATION_FAILED: "validation.input_failed",
  DEPENDENCY_VALIDATION_BLOCKED: "validation.dependency_blocked",

  // Decision engine — control layer
  DECISION_GATE_BLOCKED: "decision.gate_blocked",
  HIGH_IMPACT_APPROVAL_GRANTED: "decision.high_impact_approval_granted",
  HIGH_IMPACT_APPROVAL_DENIED: "decision.high_impact_approval_denied",
  GUARDRAILS_BLOCKED: "decision.guardrails_blocked",
  RUN_APPROVED: "run.approved",

  // Decision lifecycle
  DECISION_INTAKE: "decision.intake",
  DECISION_EVALUATED: "decision.evaluated",

  // Operator item lifecycle
  OPERATOR_ITEM_COMPLETED: "operator_item.completed",

  // Entity management
  ENTITY_CREATED: "entity.created",

  // Analytics / observability reads
  VALUE_VIEWED: "analytics.value_viewed",
  MYDAY_VIEWED: "operator.myday_viewed",
  GOVERNANCE_METRICS_ACCESSED: "governance.metrics_accessed",
  GOVERNANCE_ALERTS_ACCESSED: "governance.alerts_accessed",
  CONTROL_EFFECTIVENESS_ACCESSED: "metrics.control_effectiveness_accessed",
  DECISION_LATENCY_ACCESSED: "metrics.decision_latency_accessed",
  OBSERVABILITY_SUMMARY_ACCESSED: "observability.summary_accessed",
  SCENARIO_ANALYZED: "scenario.analyzed",
  CALIBRATION_VIEWED: "calibration.viewed",

  // System
  SYSTEM_HEALTH_CHECK: "system.health_check",
  SYSTEM_ERROR: "system.error",

  // Owner action outcome tracking (Capability 5 — Measure outcomes)
  OWNER_ACTION_OUTCOME_RECORDED: "owner.action_outcome_recorded",

  // Growth: retention cohort persistence (replaces BUILT_VOLATILE in-memory Map)
  RETENTION_COHORT_RECORDED: "growth.retention_cohort_recorded",
  ACQUISITION_METRICS_RECORDED: "growth.acquisition_metrics_recorded",
  PRICE_TIER_CREATED: "growth.price_tier_created",
  PRICE_TIER_APPROVED: "growth.price_tier_approved",
  PRICE_TIER_SUPERSEDED: "growth.price_tier_superseded",
  SALES_DEAL_RECORDED: "growth.sales_deal_recorded",
  SALES_DEAL_STAGE_UPDATED: "growth.sales_deal_stage_updated",
  REVENUE_STREAM_CREATED: "growth.revenue_stream_created",

  // Phase 3 — Owner Execution and Outcome Closure Engine
  OWNER_PROCESS_EXECUTION_TASK_ACKNOWLEDGED: "owner.process_execution_task_acknowledged",
  OWNER_PROCESS_EXECUTION_TASK_PROGRESS_RECORDED: "owner.process_execution_task_progress_recorded",
  OWNER_PROCESS_EXECUTION_OUTCOME_RECORDED: "owner.process_execution_outcome_recorded",
  OWNER_PROCESS_EXECUTION_OUTCOME_VERIFIED: "owner.process_execution_outcome_verified",
  OWNER_PROCESS_EXECUTION_OUTCOME_DISPUTED: "owner.process_execution_outcome_disputed",
  OWNER_PROCESS_EXECUTION_OUTCOME_REOPENED: "owner.process_execution_outcome_reopened",
  OWNER_PROCESS_EXECUTION_REASSESSMENT_TRIGGERED: "owner.process_execution_reassessment_triggered",
  OWNER_PROCESS_EXECUTION_LEARNING_CANDIDATE_CREATED: "owner.process_execution_learning_candidate_created",

  // Private deployment
  PRIVATE_MODE_ENTITLEMENT_ACTIVE: "private_mode.entitlement_active",
  PRIVATE_OWNER_SEED_EXECUTED: "private_mode.owner_seed_executed",

  // Phase 4 — Owner Business Operating System
  OWNER_OBJECTIVE_CREATED: "owner.objective_created",
  OWNER_OBJECTIVE_UPDATED: "owner.objective_updated",
  OWNER_OBJECTIVE_ACHIEVED: "owner.objective_achieved",
  OWNER_OBJECTIVE_ABANDONED: "owner.objective_abandoned",
  OWNER_GOAL_ARBITRATION_RECORDED: "owner.goal_arbitration_recorded",
  OWNER_RESOURCE_POOL_CREATED: "owner.resource_pool_created",
  OWNER_RESOURCE_ALLOCATED: "owner.resource_allocated",
  OWNER_RESOURCE_RELEASED: "owner.resource_released",
  OWNER_BUSINESS_RISK_IDENTIFIED: "owner.business_risk_identified",
  OWNER_BUSINESS_RISK_STATUS_CHANGED: "owner.business_risk_status_changed",
  /** A risk's recorded fields were edited without a status change (old → new values in the payload). */
  OWNER_BUSINESS_RISK_UPDATED: "owner.business_risk_updated",
  OWNER_BUSINESS_RISK_RESOLVED: "owner.business_risk_resolved",
  OWNER_BUSINESS_RISK_REVIEW_COMPLETED: "owner.business_risk_review_completed",
  OWNER_BUSINESS_RISK_ACCEPTED: "owner.business_risk_accepted",
  OWNER_BUSINESS_RISK_CLOSED: "owner.business_risk_closed",
  OWNER_RISK_TASK_LINKED: "owner.risk_task_linked",
  OWNER_COMPLIANCE_STATUS_CHANGED: "owner.compliance_status_changed",
  OWNER_COMPLIANCE_REVIEW_COMPLETED: "owner.compliance_review_completed",
  OWNER_COMPLIANCE_BREACH_RECORDED: "owner.compliance_breach_recorded",
  OWNER_COMPLIANCE_TASK_LINKED: "owner.compliance_task_linked",
  OWNER_COMPLIANCE_BUSINESS_ASSIGNED: "owner.compliance_business_assigned",
  OWNER_KPI_OWNERSHIP_ASSIGNED: "owner.kpi_ownership_assigned",
  OWNER_KPI_REVIEWED: "owner.kpi_reviewed",
  OWNER_DECISION_CONFIDENCE_RECORDED: "owner.decision_confidence_recorded",
  OWNER_CONSTRAINT_IDENTIFIED: "owner.constraint_identified",
  OWNER_CONSTRAINT_RESOLVED: "owner.constraint_resolved",
  OWNER_CONSTRAINT_ACCEPTED: "owner.constraint_accepted",
  OWNER_EXPLAINABILITY_RECORD_CREATED: "owner.explainability_record_created",
  OWNER_OPERATING_MEMORY_UPDATED: "owner.operating_memory_updated",
  OWNER_COST_ATTRIBUTED_TO_OBJECTIVE: "owner.cost_attributed_to_objective",

  // Phase 4 deepening — arbitration override + memory versioning
  OWNER_ARBITRATION_OVERRIDDEN: "owner.arbitration_overridden",
  OWNER_OPERATING_MEMORY_VERSIONED: "owner.operating_memory_versioned",
  OWNER_KPI_BASELINE_SET: "owner.kpi_baseline_set",

  // Phase 5 — Startup Mode
  STARTUP_SESSION_CREATED: "startup.session_created",
  STARTUP_SESSION_STATUS_CHANGED: "startup.session_status_changed",
  STARTUP_PROFILE_UPDATED: "startup.profile_updated",
  STARTUP_IDEA_ADDED: "startup.idea_added",
  STARTUP_IDEA_SCREENED: "startup.idea_screened",
  STARTUP_HYPOTHESIS_GENERATED: "startup.hypothesis_generated",
  STARTUP_EVIDENCE_RECORDED: "startup.evidence_recorded",
  STARTUP_BUSINESS_MODEL_BUILT: "startup.business_model_built",
  STARTUP_ECONOMIC_MODEL_BUILT: "startup.economic_model_built",
  STARTUP_READINESS_ASSESSED: "startup.readiness_assessed",
  STARTUP_SYSTEM_RECOMMENDATION_CREATED: "startup.system_recommendation_created",
  STARTUP_OWNER_DECISION_RECORDED: "startup.owner_decision_recorded",
  STARTUP_EXECUTION_BLUEPRINT_CREATED: "startup.execution_blueprint_created",
  STARTUP_RESEARCH_PLAN_BUILT: "startup.research_plan_built",
  STARTUP_RESEARCH_ACQUIRED: "startup.research_acquired",
  STARTUP_HYPOTHESIS_RESULT_RECORDED: "startup.hypothesis_result_recorded",
  STARTUP_OPERATING_MEMORY_WRITTEN: "startup.operating_memory_written",
  STARTUP_VALIDATION_PLAN_CREATED: "startup.validation_plan_created",
  STARTUP_MARKET_SIZING_BUILT: "startup.market_sizing_built",
  STARTUP_ARBITRATION_RUN: "startup.arbitration_run",
  STARTUP_EXPLANATION_BUILT: "startup.explanation_built",
  STARTUP_IDEAS_GENERATED: "startup.ideas_generated",
  STARTUP_BLUEPRINT_SUPERSEDED: "startup.blueprint_superseded",
  STARTUP_EXECUTION_PLAN_CREATED: "startup.execution_plan_created",
  STARTUP_IDEA_REVISED: "startup.idea_revised",
  STARTUP_EVIDENCE_CONFLICT_DETECTED: "startup.evidence_conflict_detected",
  STARTUP_EXECUTION_AUTHORIZATION_DENIED: "startup.execution_authorization_denied",
  STARTUP_APPROVAL_BECAME_STALE: "startup.approval_became_stale",
  STARTUP_EXECUTION_PLAN_SUPERSEDED: "startup.execution_plan_superseded",
  STARTUP_SESSION_HANDED_OFF_TO_BUSINESS: "startup.session_handed_off_to_business",
  STARTUP_INITIATIVE_OUTCOME_CLOSED: "startup.initiative_outcome_closed",
  // Bundle 3.9 — Process Intelligence and SOP Management
  SOP_TRAINING_ASSIGNED: "sop.training_assigned",
  SOP_TRAINING_COMPLETED: "sop.training_completed",
  SOP_NONCOMPLIANCE_ALERT_CREATED: "sop.noncompliance_alert_created",
  SOP_COMPLIANCE_REASSESSMENT_TRIGGERED: "sop.compliance_reassessment_triggered",

  // Bundle 3.8 — Owner Onboarding and Archetype Seeding
  ONBOARDING_STARTED: "onboarding.started",
  ONBOARDING_COMPLETED: "onboarding.completed",
  ONBOARDING_RE_TRIGGERED: "onboarding.re_triggered",

  // Bundle 3.7 — Approval Resolution and Evidence Chain
  APPROVAL_CREATED: "approval.created",
  APPROVAL_EVIDENCE_SUBMITTED: "approval.evidence_submitted",
  APPROVAL_DECIDED: "approval.decided",
  APPROVAL_APPEAL_INITIATED: "approval.appeal_initiated",
  APPROVAL_ACTION_RESCOPED: "approval.action_rescoped",

  // Bundle 3.6 — Owner Action Assignment and Outcome Tracking
  OWNER_ACTION_ASSIGNED: "owner.action_assigned",
  OWNER_ACTION_REASSIGNED: "owner.action_reassigned",
  OWNER_ACTION_OUTCOME_CLOSED: "owner.action_outcome_closed",
  OWNER_ACTION_STALL_DETECTED: "owner.action_stall_detected",
  OWNER_ACTION_APPROVAL_GRANTED: "owner.action_approval_granted",

  // Owner Outcome Persistence v1 — decision/commitment record and canonical outcome spine
  OWNER_DECISION_RECORDED: "owner.decision_recorded",
  OWNER_OUTCOME_CONTRACT_RECORDED: "owner.outcome_contract_recorded",
  OWNER_OUTCOME_SOURCE_LINKED: "owner.outcome_source_linked",
  OWNER_OUTCOME_ASSESSMENT_RECORDED: "owner.outcome_assessment_recorded",

  // QuickBooks Online — business-scoped connection persistence (identifiers/metadata only; never tokens, codes or state)
  QBO_AUTHORIZATION_STARTED: "qbo.authorization_started",
  QBO_AUTHORIZATION_COMPLETED: "qbo.authorization_completed",
  QBO_TOKENS_ROTATED: "qbo.tokens_rotated",
  QBO_REAUTHORIZATION_REQUIRED: "qbo.reauthorization_required",
  QBO_CONNECTION_DISCONNECTED: "qbo.connection_disconnected",
  QBO_REALM_BINDING_CONFLICT: "qbo.realm_binding_conflict",
  QBO_AUTHORIZATION_DENIED: "qbo.authorization_denied",
  QBO_AUTHORIZATION_FAILED: "qbo.authorization_failed",
  // QuickBooks Online — READ-ONLY synchronization (counts, codes and identifiers only; never tokens or provider payloads)
  QBO_SYNC_STARTED: "qbo.sync_started",
  QBO_SYNC_COMPLETED: "qbo.sync_completed",
  QBO_SYNC_CONTINUED: "qbo.sync_continued",
  QBO_SYNC_FAILED: "qbo.sync_failed",
  QBO_SYNC_LEASE_RECOVERED: "qbo.sync_lease_recovered",
  QBO_WEBHOOK_HINT_RECORDED: "qbo.webhook_hint_recorded",

  // Bundle 3.5 — Customer Complaint and Service Recovery
  COMPLAINT_CREATED: "complaint.created",
  COMPLAINT_TRIAGED: "complaint.triaged",
  COMPLAINT_RECOVERY_ACTION_ADDED: "complaint.recovery_action_added",
  COMPLAINT_RESOLVED: "complaint.resolved",
  COMPLAINT_CLOSED: "complaint.closed",
  COMPLAINT_SLA_BREACHED: "complaint.sla_breached",
  COMPLAINT_REOPENED: "complaint.reopened",
  // Bundle 4.2 — Owner Business Condition Profile
  OWNER_BCP_CREATED: "owner_bcp.created",
  OWNER_BCP_EVALUATED: "owner_bcp.evaluated",

  // Bundle 5.1 — Integration Fabric
  CONNECTOR_REGISTERED: "connector.registered",
  CONNECTOR_DISCONNECTED: "connector.disconnected",
  CONNECTOR_TOKEN_REFRESHED: "connector.token_refreshed",
  CONNECTOR_REFRESH_FAILED: "connector.refresh_failed",
  INTEGRATION_EVENT_INGESTED: "integration_event.ingested",
  INTEGRATION_EVENT_BCP_TRIGGERED: "integration_event.bcp_triggered",
  INTEGRATION_EVENT_BCP_TRIGGER_FAILED: "integration_event.bcp_trigger_failed",

  // Stage 3B — Customer Records
  OWNER_CUSTOMER_CREATED: "owner.customer_created",
  OWNER_CUSTOMER_UPDATED: "owner.customer_updated",

  // Stage 3C — Inventory and Procurement
  OWNER_STOCK_ITEM_CREATED: "owner.stock_item_created",
  OWNER_STOCK_ITEM_UPDATED: "owner.stock_item_updated",
  OWNER_PURCHASE_ORDER_CREATED: "owner.purchase_order_created",
  OWNER_PURCHASE_ORDER_STATUS_CHANGED: "owner.purchase_order_status_changed",

  // Stage 3D — Marketing Campaigns
  OWNER_MARKETING_CAMPAIGN_CREATED: "owner.marketing_campaign_created",
  OWNER_MARKETING_CAMPAIGN_UPDATED: "owner.marketing_campaign_updated",

  // Bundle 6 — Consulting Mode
  CONSULTING_ENGAGEMENT_CREATED: "consulting.engagement_created",
  CONSULTING_PHASE_ADVANCED: "consulting.phase_advanced",
  CONSULTING_FINDING_CREATED: "consulting.finding_created",
  CONSULTING_RECOMMENDATION_GENERATED: "consulting.recommendation_generated",
  CONSULTING_ACTION_ASSIGNED: "consulting.action_assigned",
  CONSULTING_ENGAGEMENT_CLOSED: "consulting.engagement_closed",
  CONSULTING_HEALTH_UPDATED: "consulting.health_updated",
  CONSULTING_DIMENSION_UPDATED: "consulting.dimension_updated",
  CONSULTING_ENGAGEMENT_EXPORTED: "consulting.engagement_exported",

  // P0-08 — Canonical scheduled-task lifecycle
  SCHEDULED_TASK_ENQUEUED: "scheduled_task.enqueued",
  SCHEDULED_TASK_CLAIMED: "scheduled_task.claimed",
  SCHEDULED_TASK_LEASE_RECLAIMED: "scheduled_task.lease_reclaimed",
  SCHEDULED_TASK_STARTED: "scheduled_task.started",
  SCHEDULED_TASK_SUCCEEDED: "scheduled_task.succeeded",
  SCHEDULED_TASK_PARTIAL_FAILURE: "scheduled_task.partial_failure",
  SCHEDULED_TASK_RETRY_SCHEDULED: "scheduled_task.retry_scheduled",
  SCHEDULED_TASK_FAILED: "scheduled_task.failed",
  SCHEDULED_TASK_DEAD_LETTERED: "scheduled_task.dead_lettered",

  // Open beta
  SIGNUP_REFUSED_BETA_DISABLED: "signup.refused_beta_disabled",
  SIGNUP_REFUSED_BETA_CAP: "signup.refused_beta_cap",
  EMAIL_VERIFICATION_REQUESTED: "user.email_verification_requested",
  EMAIL_VERIFICATION_RESENT: "user.email_verification_resent",
  EMAIL_VERIFIED: "user.email_verified",
  POLICY_ACCEPTED: "user.policy_accepted",
  PLATFORM_FEEDBACK_SUBMITTED: "platform_feedback.submitted",
  PRIVACY_REQUEST_CREATED: "privacy_request.created",

  // Controlled-beta homepage capture
  BETA_REQUEST_CREATED: "beta_request.created",
  BETA_REQUEST_DUPLICATE_SUBMITTED: "beta_request.duplicate_submitted",
  BETA_REQUEST_MARKED_INVITED: "beta_request.marked_invited",
  BETA_REQUEST_REVOKED: "beta_request.revoked",
  BETA_REQUEST_REJECTED: "beta_request.rejected",
  BETA_REQUEST_REOPENED: "beta_request.reopened",

  // Administration V1 — beta operating control plane
  PLATFORM_SETTINGS_INITIALIZED: "platform_settings.initialized",
  PLATFORM_ADMISSION_MODE_CHANGED: "platform_settings.admission_mode_changed",
  PLATFORM_CAPACITY_CHANGED: "platform_settings.capacity_changed",
  PLATFORM_CAPACITY_ALERT_SENT: "platform_settings.capacity_alert_sent",
  CUSTOMER_VERIFICATION_RESENT: "customer.verification_resent",
} as const;

export type AuditEventName =
  (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];
