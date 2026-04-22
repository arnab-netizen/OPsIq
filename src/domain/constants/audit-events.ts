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

  // Evidence
  EVIDENCE_SUBMITTED: "evidence.submitted",
  EVIDENCE_VALIDATED: "evidence.validated",
  EVIDENCE_REJECTED: "evidence.rejected",

  // Finding
  FINDING_CREATED: "finding.created",
  FINDING_UPDATED: "finding.updated",
  FINDING_LINKED: "finding.linked",
  FINDING_EVIDENCE_LINK_BATCH: "finding.evidence_link_batch",

  // Recommendation
  RECOMMENDATION_CREATED: "recommendation.created",
  RECOMMENDATION_APPROVED: "recommendation.approved",
  RECOMMENDATION_SUPERSEDED: "recommendation.superseded",

  // Action Item
  ACTION_CREATED: "action.created",
  ACTION_UPDATED: "action.updated",
  ACTION_STATUS_UPDATED: "action.status_updated",
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
  INTERVENTION_MODE_CHANGED: "intervention.mode_changed",
  INTERVENTION_PHASE_CHANGED: "intervention.phase_changed",

  // Shock Event
  SHOCK_EVENT_RECORDED: "shock.event_recorded",
  SHOCK_EVENT_RESOLVED: "shock.event_resolved",

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

  // Human Factors
  HUMAN_FACTORS_ASSESSED: "human_factors.assessed",
  HUMAN_FACTORS_UPDATED: "human_factors.updated",

  // File/Storage
  FILE_UPLOADED: "file.uploaded",
  FILE_DELETED: "file.deleted",
  FILE_ACCESS_CHANGED: "file.access_changed",

  // System
  SYSTEM_HEALTH_CHECK: "system.health_check",
  SYSTEM_ERROR: "system.error",
} as const;

export type AuditEventName =
  (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];
