export const GOVERNED_STAGE_STATES = [
  "draft",
  "not_started",
  "active",
  "pending_input",
  "awaiting_client",
  "awaiting_consultant",
  "awaiting_validation",
  "awaiting_approval",
  "blocked",
  "deferred",
  "partially_completed",
  "completed",
  "cancelled",
  "reopened",
  "disputed",
  "provisional_output_only",
  "forced_closure_review",
  "dormant",
] as const;

export type GovernedStageState = (typeof GOVERNED_STAGE_STATES)[number];

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "denied",
  "withdrawn",
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const EVIDENCE_STATUSES = [
  "submitted",
  "under_review",
  "validated",
  "rejected",
  "superseded",
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const ACTION_STATUSES = [
  "draft",
  "assigned",
  "in_progress",
  "blocked",
  "completed",
  "verified",
  "cancelled",
  "overdue",
] as const;

export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const RISK_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export const RISK_STATUSES = [
  "identified",
  "assessed",
  "mitigating",
  "mitigated",
  "accepted",
  "escalated",
  "closed",
] as const;

export type RiskStatus = (typeof RISK_STATUSES)[number];

export const VISIBILITY_LEVELS = [
  "internal",
  "client_visible",
] as const;

export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

export const INTERVENTION_MODES = [
  "recovery",
  "stabilization",
  "growth",
  "shock_response",
  "mixed",
] as const;

export type InterventionMode = (typeof INTERVENTION_MODES)[number];

export const INTERVENTION_PHASES = [
  "assessment",
  "planning",
  "execution",
  "review",
  "handover",
  "closed",
] as const;

export type InterventionPhase = (typeof INTERVENTION_PHASES)[number];

export const BUSINESS_CONDITION_RATINGS = [
  "critical",
  "distressed",
  "challenged",
  "stable",
  "improving",
  "strong",
] as const;

export type BusinessConditionRating =
  (typeof BUSINESS_CONDITION_RATINGS)[number];

export const HUMAN_FACTOR_TYPES = [
  "owner_bottlenecking",
  "follow_through_risk",
  "resistance_to_change",
  "communication_breakdown",
  "morale_fragility",
  "management_capability",
  "key_person_dependency",
  "accountability_weakness",
] as const;

export type HumanFactorType = (typeof HUMAN_FACTOR_TYPES)[number];

export const ENGAGEMENT_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
  "archived",
] as const;

export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

export const LEAD_STATUSES = [
  "new",
  "qualifying",
  "qualified",
  "converted",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CLIENT_ACCOUNT_STATUSES = [
  "active",
  "inactive",
  "archived",
] as const;

export type ClientAccountStatus = (typeof CLIENT_ACCOUNT_STATUSES)[number];

export const SERVICE_TIERS = [
  "standard",
  "premium",
  "enterprise",
] as const;

export type ServiceTier = (typeof SERVICE_TIERS)[number];

export const ENGAGEMENT_MODES = [
  "beginner",
  "expert",
] as const;

export type EngagementMode = (typeof ENGAGEMENT_MODES)[number];

export const HEALTH_STATUSES = [
  "healthy",
  "at_risk",
  "critical",
  "unknown",
] as const;

export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const PRESSURE_LEVELS = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export type PressureLevel = (typeof PRESSURE_LEVELS)[number];

export const MATURITY_LEVELS = [
  "low",
  "medium",
  "high",
] as const;

export type MaturityLevel = (typeof MATURITY_LEVELS)[number];

export const DELIVERABLE_STATUSES = [
  "draft",
  "in_progress",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "superseded",
  "cancelled",
] as const;

export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const SHOCK_EVENT_TYPES = [
  "market_disruption",
  "key_personnel_loss",
  "major_client_loss",
  "regulatory_change",
  "cash_flow_crisis",
  "quality_failure",
  "operational_disruption",
  "competitive_threat",
  "partnership_breakdown",
  "technology_failure",
] as const;

export type ShockEventType = (typeof SHOCK_EVENT_TYPES)[number];

export const EVIDENCE_CATEGORIES = [
  "financial",
  "operational",
  "market",
  "customer",
  "employee",
  "compliance",
  "technical",
  "strategic",
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export const EVIDENCE_SOURCE_TYPES = [
  "document",
  "interview",
  "metric",
  "observation",
  "report",
  "feedback",
  "system_log",
  "external_source",
] as const;

export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export const FINDING_STATUSES = [
  "draft",
  "under_review",
  "validated",
  "superseded",
  "closed",
] as const;

export type FindingStatus = (typeof FINDING_STATUSES)[number];
