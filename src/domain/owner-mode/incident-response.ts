/**
 * Incident Response and Circuit Breakers — Phase 27
 *
 * Defines what happens when OpsIQ harms, leaks, or misleads.
 * Circuit breakers are always triggered by human operators — never autonomously by AI.
 */

import { assertWorkspaceScopedQuery } from "./security-rules";

// ─── Incident Classes ─────────────────────────────────────────────────────────

export type IncidentClass =
  | "harmful_recommendation"
  | "privacy_leak"
  | "cross_tenant_exposure"
  | "learning_gate_bypass"
  | "wrong_high_confidence_advice"
  | "dashboard_misreporting"
  | "evidence_verification_bypass"
  | "db_migration_data_loss"
  | "prompt_injection_success"
  | "security_gate_failure";

export type IncidentSeverity = "critical" | "high" | "medium" | "low";

export type IncidentStatus = "open" | "contained" | "resolved" | "closed";

export type CircuitBreakerState = "open" | "half_open" | "closed";

// ─── Incident Event ───────────────────────────────────────────────────────────

export interface OwnerIncidentEvent {
  incidentId: string;
  severity: IncidentSeverity;
  trigger: IncidentClass;
  detectedAt: string;
  affectedWorkspaceId: string;
  affectedBusinessId: string;
  containmentStep: string;
  featureFlagShutdown: boolean;
  rollbackStep: string;
  ownerNotificationRequired: boolean;
  postIncidentReviewRequired: boolean;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

export interface OwnerCircuitBreaker {
  breakerId: string;
  workspaceId: string;
  capabilityHalted: string;
  trigger: IncidentClass;
  state: CircuitBreakerState;
  tripReason: string;
  trippedAt: string;
  trippedByUserId: string;
  resolvedAt?: string;
  resolvedByUserId?: string;
  createdAt: string;
}

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateIncidentInput {
  incidentId: string;
  severity: IncidentSeverity;
  trigger: IncidentClass;
  detectedAt: string;
  affectedWorkspaceId: string;
  affectedBusinessId: string;
  containmentStep: string;
  featureFlagShutdown: boolean;
  rollbackStep: string;
  ownerNotificationRequired: boolean;
  postIncidentReviewRequired: boolean;
  createdAt: string;
}

export interface TripCircuitBreakerInput {
  breakerId: string;
  workspaceId: string;
  capabilityHalted: string;
  trigger: IncidentClass;
  tripReason: string;
  trippedAt: string;
  trippedByUserId: string;
  createdAt: string;
}

export interface ResolveCircuitBreakerInput {
  breakerId: string;
  workspaceId: string;
  resolvedAt: string;
  resolvedByUserId: string;
}

export interface UpdateIncidentStatusInput {
  incidentId: string;
  workspaceId: string;
  status: IncidentStatus;
  updatedAt: string;
}

// ─── Severity Rules ───────────────────────────────────────────────────────────

// INCIDENT-RULE-1: these classes always mandate circuit breaker + owner notification
const ALWAYS_CIRCUIT_BREAKER: ReadonlySet<IncidentClass> = new Set([
  "cross_tenant_exposure",
  "learning_gate_bypass",
  "prompt_injection_success",
  "evidence_verification_bypass",
  "db_migration_data_loss",
  "security_gate_failure",
]);

// INCIDENT-RULE-2: these severities mandate post-incident review
const REVIEW_REQUIRED_SEVERITIES: ReadonlySet<IncidentSeverity> = new Set([
  "critical",
  "high",
]);

// INCIDENT-RULE-3: high/critical harm and specific classes always require owner notification
const ALWAYS_NOTIFY_OWNER_CLASSES: ReadonlySet<IncidentClass> = new Set([
  "harmful_recommendation",
  "privacy_leak",
  "cross_tenant_exposure",
  "evidence_verification_bypass",
  "db_migration_data_loss",
  "prompt_injection_success",
]);

export function incidentRequiresCircuitBreaker(incident: OwnerIncidentEvent): boolean {
  return (
    ALWAYS_CIRCUIT_BREAKER.has(incident.trigger) ||
    incident.severity === "critical" ||
    incident.severity === "high"
  );
}

export function incidentRequiresOwnerNotification(incident: OwnerIncidentEvent): boolean {
  return (
    incident.ownerNotificationRequired ||
    ALWAYS_NOTIFY_OWNER_CLASSES.has(incident.trigger) ||
    incident.severity === "critical" ||
    incident.severity === "high"
  );
}

export function incidentRequiresPostIncidentReview(incident: OwnerIncidentEvent): boolean {
  return (
    incident.postIncidentReviewRequired ||
    REVIEW_REQUIRED_SEVERITIES.has(incident.severity) ||
    incident.featureFlagShutdown
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateCreateIncidentInput(input: CreateIncidentInput): string[] {
  assertWorkspaceScopedQuery({ workspaceId: input.affectedWorkspaceId });
  const errors: string[] = [];
  if (!input.incidentId || input.incidentId.trim().length === 0) {
    errors.push("incidentId is required");
  }
  if (!input.detectedAt || input.detectedAt.trim().length === 0) {
    errors.push("detectedAt is required");
  }
  if (!input.affectedBusinessId || input.affectedBusinessId.trim().length === 0) {
    errors.push("affectedBusinessId is required");
  }
  if (!input.containmentStep || input.containmentStep.trim().length === 0) {
    errors.push("containmentStep is required (INCIDENT-RULE-1)");
  }
  if (!input.rollbackStep || input.rollbackStep.trim().length === 0) {
    errors.push("rollbackStep is required (document 'none' with reason if not applicable)");
  }
  if (!input.createdAt || input.createdAt.trim().length === 0) {
    errors.push("createdAt is required");
  }
  return errors;
}

export function validateTripCircuitBreakerInput(input: TripCircuitBreakerInput): string[] {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const errors: string[] = [];
  if (!input.breakerId || input.breakerId.trim().length === 0) {
    errors.push("breakerId is required");
  }
  if (!input.capabilityHalted || input.capabilityHalted.trim().length === 0) {
    errors.push("capabilityHalted is required");
  }
  if (!input.tripReason || input.tripReason.trim().length === 0) {
    errors.push("tripReason is required");
  }
  if (!input.trippedAt || input.trippedAt.trim().length === 0) {
    errors.push("trippedAt is required");
  }
  if (!input.trippedByUserId || input.trippedByUserId.trim().length === 0) {
    errors.push("trippedByUserId is required — circuit breakers require human operator (INCIDENT-RULE-AI-NOT-AUTONOMOUS)");
  }
  return errors;
}

// ─── Incident Factory ─────────────────────────────────────────────────────────

export function createIncident(input: CreateIncidentInput): OwnerIncidentEvent {
  const errors = validateCreateIncidentInput(input);
  if (errors.length > 0) {
    throw new Error(`Invalid incident input: ${errors.join("; ")}`);
  }
  return {
    incidentId: input.incidentId,
    severity: input.severity,
    trigger: input.trigger,
    detectedAt: input.detectedAt,
    affectedWorkspaceId: input.affectedWorkspaceId,
    affectedBusinessId: input.affectedBusinessId,
    containmentStep: input.containmentStep,
    featureFlagShutdown: input.featureFlagShutdown,
    rollbackStep: input.rollbackStep,
    ownerNotificationRequired: input.ownerNotificationRequired,
    postIncidentReviewRequired: input.postIncidentReviewRequired,
    status: "open",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function updateIncidentStatus(
  incident: OwnerIncidentEvent,
  input: UpdateIncidentStatusInput
): OwnerIncidentEvent {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  if (incident.affectedWorkspaceId !== input.workspaceId) {
    throw new Error(
      `Access denied: incident belongs to workspace "${incident.affectedWorkspaceId}", ` +
      `not "${input.workspaceId}"`
    );
  }
  if (!input.updatedAt || input.updatedAt.trim().length === 0) {
    throw new Error("updatedAt is required");
  }
  return {
    ...incident,
    status: input.status,
    updatedAt: input.updatedAt,
  };
}

// ─── Circuit Breaker Factory ──────────────────────────────────────────────────

export function tripCircuitBreaker(input: TripCircuitBreakerInput): OwnerCircuitBreaker {
  const errors = validateTripCircuitBreakerInput(input);
  if (errors.length > 0) {
    throw new Error(`Invalid circuit breaker input: ${errors.join("; ")}`);
  }
  return {
    breakerId: input.breakerId,
    workspaceId: input.workspaceId,
    capabilityHalted: input.capabilityHalted,
    trigger: input.trigger,
    state: "open",
    tripReason: input.tripReason,
    trippedAt: input.trippedAt,
    trippedByUserId: input.trippedByUserId,
    createdAt: input.createdAt,
  };
}

export function resolveCircuitBreaker(
  breaker: OwnerCircuitBreaker,
  input: ResolveCircuitBreakerInput
): OwnerCircuitBreaker {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  if (breaker.workspaceId !== input.workspaceId) {
    throw new Error(
      `Access denied: breaker belongs to workspace "${breaker.workspaceId}", ` +
      `not "${input.workspaceId}"`
    );
  }
  if (!input.resolvedByUserId || input.resolvedByUserId.trim().length === 0) {
    throw new Error(
      "resolvedByUserId is required — circuit breaker resolution requires human operator"
    );
  }
  if (!input.resolvedAt || input.resolvedAt.trim().length === 0) {
    throw new Error("resolvedAt is required");
  }
  return {
    ...breaker,
    state: "closed",
    resolvedAt: input.resolvedAt,
    resolvedByUserId: input.resolvedByUserId,
  };
}

export function setCircuitBreakerHalfOpen(
  breaker: OwnerCircuitBreaker,
  operatorUserId: string
): OwnerCircuitBreaker {
  if (!operatorUserId || operatorUserId.trim().length === 0) {
    throw new Error("operatorUserId is required to transition to half_open");
  }
  if (breaker.state !== "open") {
    throw new Error(`Cannot set half_open: breaker is currently "${breaker.state}"`);
  }
  return { ...breaker, state: "half_open" };
}

// ─── Rollback Path Documentation ─────────────────────────────────────────────

export interface RollbackPath {
  incidentClass: IncidentClass;
  rollbackSteps: string[];
  requiresHumanApproval: boolean;
  resumptionGate: string;
}

export const ROLLBACK_PATHS: ReadonlyArray<RollbackPath> = [
  {
    incidentClass: "harmful_recommendation",
    rollbackSteps: [
      "Halt new recommendations for affected workspace",
      "Trigger reassessment workflow for affected cycle",
      "Notify affected owner",
      "Schedule post-incident review",
    ],
    requiresHumanApproval: true,
    resumptionGate: "PIR completed and root cause fixed",
  },
  {
    incidentClass: "cross_tenant_exposure",
    rollbackSteps: [
      "Halt all cross-workspace query paths (platform-wide)",
      "Audit what data was accessed",
      "Notify both affected workspace owners",
      "Emergency platform review",
    ],
    requiresHumanApproval: true,
    resumptionGate: "Root cause in audit-traceable fix; platform-wide sign-off",
  },
  {
    incidentClass: "learning_gate_bypass",
    rollbackSteps: [
      "Remove or quarantine the bypassed learning record",
      "Halt learning eligibility processing",
      "Audit recent learning records for same bypass pattern",
      "Fix the gate",
    ],
    requiresHumanApproval: true,
    resumptionGate: "Gate fixed and verified; PIR completed",
  },
  {
    incidentClass: "evidence_verification_bypass",
    rollbackSteps: [
      "Revert evidence verification status to unverified",
      "Halt evidence verification workflow",
      "Audit all recent verifications for same bypass",
      "Notify affected owner to re-verify",
    ],
    requiresHumanApproval: true,
    resumptionGate: "Bypass fix verified; owner re-verified evidence",
  },
  {
    incidentClass: "db_migration_data_loss",
    rollbackSteps: [
      "Stop all write operations (platform-wide)",
      "Assess scope of data loss",
      "Initiate backup restore if confirmed",
      "Notify all affected workspace owners",
    ],
    requiresHumanApproval: true,
    resumptionGate: "Data integrity confirmed; engineering sign-off",
  },
  {
    incidentClass: "prompt_injection_success",
    rollbackSteps: [
      "Halt AI advisory generation",
      "Audit AI outputs since earliest possible injection point",
      "Notify affected owners if recommendations may be compromised",
      "Fix input sanitization",
    ],
    requiresHumanApproval: true,
    resumptionGate: "Sanitization fix deployed; targeted security tests pass",
  },
  {
    incidentClass: "security_gate_failure",
    rollbackSteps: [
      "Halt affected operation type",
      "Audit all operations of same type since gate failure window",
      "Notify affected owners",
      "Fix the gate; verify with security tests",
    ],
    requiresHumanApproval: true,
    resumptionGate: "Gate fixed; security tests pass; PIR completed",
  },
  {
    incidentClass: "privacy_leak",
    rollbackSteps: [
      "Halt capability that caused the leak",
      "Assess regulatory notification requirements",
      "Log data type, exposure window, recipient",
      "Notify affected owner within SLA",
    ],
    requiresHumanApproval: true,
    resumptionGate: "Root cause fixed; regulatory obligations assessed; PIR completed",
  },
  {
    incidentClass: "wrong_high_confidence_advice",
    rollbackSteps: [
      "If outcome was harmful: escalate to harmful_recommendation path",
      "Audit similar advice from same model/prompt version",
      "Suspend high-confidence advice (≥80) until root cause is clear",
    ],
    requiresHumanApproval: true,
    resumptionGate: "Root cause fixed; model/prompt version updated or validated",
  },
  {
    incidentClass: "dashboard_misreporting",
    rollbackSteps: [
      "Identify stage or metric displayed incorrectly",
      "If owner decision made: escalate to wrong_high_confidence_advice or harmful_recommendation",
      "Halt dashboard updates until display bug is fixed",
      "Notify owner if material decision was made on incorrect data",
    ],
    requiresHumanApproval: false,
    resumptionGate: "Display bug fixed; no owner decisions based on incorrect data pending review",
  },
];

export function getRollbackPath(incidentClass: IncidentClass): RollbackPath | undefined {
  return ROLLBACK_PATHS.find((p) => p.incidentClass === incidentClass);
}
