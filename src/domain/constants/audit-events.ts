export const AUDIT_EVENTS = {
  // Auth
  USER_LOGGED_IN: "user.logged_in",
  USER_LOGGED_OUT: "user.logged_out",
  USER_LOGIN_FAILED: "user.login_failed",
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DEACTIVATED: "user.deactivated",
  USER_REACTIVATED: "user.reactivated",

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
  DECISION_EXECUTED: "decision.executed",
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
  OWNER_SELF_EVALUATION_RECORDED: "owner.self_evaluation_recorded",
  OWNER_COMPLIANCE_REVIEW_REQUIRED: "owner.compliance_review_required",
  // Jarvis 360 gap-closure — live owner-loop wiring
  OWNER_TASK_COMPLETION_BLOCKED: "owner.task_completion_blocked",
  OWNER_TASK_COMPLETED: "owner.task_completed",
  OWNER_TASK_OVERRIDE_USED: "owner.task_override_used",
  OWNER_APPROVAL_AUTO_HANDLED: "owner.approval_auto_handled",
  OWNER_ARBITRATION_RESOLVED: "owner.arbitration_resolved",
  OWNER_OPPORTUNITY_DECIDED: "owner.opportunity_decided",

  // Owner-Only Recovery Mode
  OWNER_BUSINESS_CREATED: "owner.business_created",
  OWNER_BUSINESS_UPDATED: "owner.business_updated",
  OWNER_METRIC_SNAPSHOT_RECORDED: "owner.metric_snapshot_recorded",
  RECOVERY_CYCLE_RUN: "owner.recovery_cycle_run",
  RECOVERY_ACTION_UPDATED: "owner.recovery_action_updated",
  RECOVERY_OUTCOME_VERIFIED: "owner.recovery_outcome_verified",

  // Owner Finance (Module 2)
  OWNER_FINANCE_SNAPSHOT_RECORDED: "owner.finance_snapshot_recorded",
  OWNER_FINANCE_DIAGNOSIS_RUN: "owner.finance_diagnosis_run",
  OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE: "owner.finance_diagnosis_low_confidence",
  OWNER_FINANCE_ACTION_UPDATED: "owner.finance_action_updated",
  OWNER_FINANCE_ACTION_COMPLETED: "owner.finance_action_completed",
  OWNER_FINANCE_REASSESSMENT_TRIGGERED: "owner.finance_reassessment_triggered",
  OWNER_FINANCE_OUTCOME_VERIFIED: "owner.finance_outcome_verified",
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
  OWNER_CASHFLOW_OUTCOME_VERIFIED: "owner.cashflow_outcome_verified",

  // Owner Sales (Module 3)
  OWNER_SALES_SNAPSHOT_RECORDED: "owner.sales_snapshot_recorded",
  OWNER_SALES_DIAGNOSIS_RUN: "owner.sales_diagnosis_run",
  OWNER_SALES_ACTION_UPDATED: "owner.sales_action_updated",
  OWNER_SALES_OUTCOME_VERIFIED: "owner.sales_outcome_verified",

  // Owner Operations (Module 4)
  OWNER_OPERATIONS_SNAPSHOT_RECORDED: "owner.operations_snapshot_recorded",
  OWNER_OPERATIONS_DIAGNOSIS_RUN: "owner.operations_diagnosis_run",
  OWNER_OPERATIONS_ACTION_UPDATED: "owner.operations_action_updated",
  OWNER_OPERATIONS_OUTCOME_VERIFIED: "owner.operations_outcome_verified",

  OWNER_SOP_SNAPSHOT_RECORDED: "owner.sop_snapshot_recorded",
  OWNER_SOP_DIAGNOSIS_RUN: "owner.sop_diagnosis_run",
  OWNER_SOP_ACTION_UPDATED: "owner.sop_action_updated",
  OWNER_SOP_OUTCOME_VERIFIED: "owner.sop_outcome_verified",

  OWNER_MARKETING_SNAPSHOT_RECORDED: "owner.marketing_snapshot_recorded",
  OWNER_MARKETING_DIAGNOSIS_RUN: "owner.marketing_diagnosis_run",
  OWNER_MARKETING_ACTION_UPDATED: "owner.marketing_action_updated",
  OWNER_MARKETING_OUTCOME_VERIFIED: "owner.marketing_outcome_verified",

  OWNER_STRATEGY_SNAPSHOT_RECORDED: "owner.strategy_snapshot_recorded",
  OWNER_STRATEGY_DIAGNOSIS_RUN: "owner.strategy_diagnosis_run",
  OWNER_STRATEGY_ACTION_UPDATED: "owner.strategy_action_updated",
  OWNER_STRATEGY_OUTCOME_VERIFIED: "owner.strategy_outcome_verified",

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

  // System
  SYSTEM_HEALTH_CHECK: "system.health_check",
  SYSTEM_ERROR: "system.error",
} as const;

export type AuditEventName =
  (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];
