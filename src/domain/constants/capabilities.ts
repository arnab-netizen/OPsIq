export const CAPABILITIES = {
  // System
  SYSTEM_ADMIN: "system:admin",
  SYSTEM_VIEW_AUDIT: "system:view_audit",

  // Users
  USER_CREATE: "user:create",
  USER_UPDATE: "user:update",
  USER_DEACTIVATE: "user:deactivate",
  USER_VIEW: "user:view",
  USER_ASSIGN_ROLE: "user:assign_role",

  // Leads
  LEAD_CREATE: "lead:create",
  LEAD_UPDATE: "lead:update",
  LEAD_VIEW: "lead:view",

  // Clients
  CLIENT_CREATE: "client:create",
  CLIENT_UPDATE: "client:update",
  CLIENT_VIEW: "client:view",
  CLIENT_ARCHIVE: "client:archive",

  // Engagements (Module 1 required capabilities)
  ENGAGEMENT_CREATE: "engagement:create",
  ENGAGEMENT_UPDATE: "engagement:update",
  ENGAGEMENT_VIEW: "engagement:view",
  ENGAGEMENT_MANAGE_MEMBERS: "engagement:manage_members",
  ENGAGEMENT_CLOSE: "engagement:close",

  // Stages (Module 1 required capabilities)
  STAGE_CREATE: "stage:create",
  STAGE_TRANSITION: "stage:transition",
  STAGE_VIEW: "stage:view",
  STAGE_RESOLVE_SOFT_BLOCKER: "stage:resolve_soft_blocker",

  // Findings (Module 1 required capabilities)
  FINDING_VALIDATE: "finding:validate",

  // Evidence
  EVIDENCE_SUBMIT: "evidence:submit",
  EVIDENCE_VALIDATE: "evidence:validate",
  EVIDENCE_VIEW: "evidence:view",

  // Findings
  FINDING_CREATE: "finding:create",
  FINDING_UPDATE: "finding:update",
  FINDING_VIEW: "finding:view",

  // Recommendations
  RECOMMENDATION_CREATE: "recommendation:create",
  RECOMMENDATION_APPROVE: "recommendation:approve",
  RECOMMENDATION_VIEW: "recommendation:view",

  // Actions
  ACTION_CREATE: "action:create",
  ACTION_UPDATE: "action:update",
  ACTION_VIEW: "action:view",

  // KPIs
  KPI_DEFINE: "kpi:define",
  KPI_RECORD: "kpi:record",
  KPI_VIEW: "kpi:view",

  // Deliverables
  DELIVERABLE_CREATE: "deliverable:create",
  DELIVERABLE_SUBMIT_VERSION: "deliverable:submit_version",
  DELIVERABLE_APPROVE: "deliverable:approve",
  DELIVERABLE_ISSUE: "deliverable:issue",
  DELIVERABLE_VIEW: "deliverable:view",

  // Approvals
  APPROVAL_REQUEST: "approval:request",
  APPROVAL_DECIDE: "approval:decide",

  // Overrides
  OVERRIDE_REQUEST: "override:request",
  OVERRIDE_DECIDE: "override:decide",

  // Business Condition
  CONDITION_ASSESS: "condition:assess",
  CONDITION_VIEW: "condition:view",

  // Intervention
  INTERVENTION_MANAGE: "intervention:manage",
  INTERVENTION_VIEW: "intervention:view",

  // Risk
  RISK_MANAGE: "risk:manage",
  RISK_VIEW: "risk:view",

  // Scope
  SCOPE_MANAGE: "scope:manage",
  SCOPE_VIEW: "scope:view",

  // Review
  REVIEW_MANAGE: "review:manage",
  REVIEW_VIEW: "review:view",

  // Decisions
  DECISION_CREATE: "decision:create",
  DECISION_UPDATE: "decision:update",
  DECISION_ACCEPT: "decision:accept",
  DECISION_REJECT: "decision:reject",
  DECISION_CLOSE: "decision:close",

  // Diagnosis
  DIAGNOSIS_READ: "diagnosis:read",
  DIAGNOSIS_CREATE: "diagnosis:create",

  // Files
  FILE_UPLOAD: "file:upload",
  FILE_VIEW: "file:view",
  FILE_DELETE: "file:delete",

  // Owner Mode
  OWNER_VIEW: "owner:view",
  OWNER_MANAGE: "owner:manage",

  // Approval
  CONSULTING_APPROVE: "consulting:approve",

  // Audit Trail
  AUDIT_VIEW: "audit:view",
  AUDIT_EXPORT: "audit:export",

  // Webhooks
  WEBHOOK_MANAGE: "webhook:manage",
} as const;

export type CapabilityName =
  (typeof CAPABILITIES)[keyof typeof CAPABILITIES];
