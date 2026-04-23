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

  // Stage
  STAGE_CREATED: "stage.created",
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
  ACTION_COMPLETED: "action.completed",
  ACTION_OVERDUE: "action.overdue",

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

  // Human Factors
  HUMAN_FACTORS_ASSESSED: "human_factors.assessed",
  HUMAN_FACTORS_UPDATED: "human_factors.updated",

  // File/Storage
  FILE_UPLOADED: "file.uploaded",
  FILE_DELETED: "file.deleted",
  FILE_ACCESS_CHANGED: "file.access_changed",

  // Idempotency
  IDEMPOTENCY_REPLAY_DETECTED: "idempotency.replay_detected",

  // System
  SYSTEM_HEALTH_CHECK: "system.health_check",
  SYSTEM_ERROR: "system.error",
} as const;

export type AuditEventName =
  (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];
