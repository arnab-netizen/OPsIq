/**
 * Startup Mode lifecycle state machine (Phase 5).
 * Pure functions — no I/O.
 */

export type StartupSessionStatus =
  | "DRAFT"
  | "CONTEXT_CAPTURE"
  | "DISCOVERY"
  | "IDEA_GENERATION"
  | "SCREENING"
  | "VALIDATION_PLANNED"
  | "VALIDATION_IN_PROGRESS"
  | "ECONOMICS_REVIEW"
  | "READINESS_REVIEW"
  | "OWNER_DECISION_REQUIRED"
  | "APPROVED"
  | "MODIFICATION_REQUIRED"
  | "ON_HOLD"
  | "REJECTED"
  | "EXECUTION_PLANNED";

export type StartupEntryPath = "HAVE_IDEA" | "NEED_OPTIONS";

export type StartupScreeningStatus =
  | "PENDING"
  | "ADVANCE"
  | "ADVANCE_WITH_EVIDENCE_GAPS"
  | "VALIDATE_FIRST"
  | "MODIFY"
  | "HOLD"
  | "REJECT";

export type StartupHypothesisType =
  | "PROBLEM_EXISTENCE"
  | "PROBLEM_SEVERITY"
  | "CUSTOMER_SEGMENT"
  | "CUSTOMER_ACCESSIBILITY"
  | "WILLINGNESS_TO_PAY"
  | "SOLUTION_DESIRABILITY"
  | "SOLUTION_FEASIBILITY"
  | "DELIVERY_FEASIBILITY"
  | "ACQUISITION_FEASIBILITY"
  | "UNIT_ECONOMICS"
  | "RETENTION_POTENTIAL"
  | "REGULATORY_VIABILITY";

export type StartupHypothesisResult =
  | "CONFIRMED"
  | "WEAKENED"
  | "REJECTED"
  | "INCONCLUSIVE"
  | "PENDING";

export type EvidenceSourceType =
  | "AUTHORITATIVE_PRIMARY"
  | "OFFICIAL_COMMERCIAL"
  | "VERIFIED_INSTITUTIONAL"
  | "REPUTABLE_SECONDARY"
  | "MARKETPLACE_OBSERVATION"
  | "CUSTOMER_GENERATED"
  | "OWNER_PROVIDED"
  | "SYSTEM_INFERENCE"
  | "UNVERIFIED";

export type EvidenceType =
  | "DESK_RESEARCH"
  | "BEHAVIOURAL_EVIDENCE"
  | "DIRECT_CUSTOMER_EVIDENCE"
  | "TRANSACTIONAL_EVIDENCE";

export type StartupReadinessStatus =
  | "READY_FOR_OWNER_GO_DECISION"
  | "READY_FOR_LIMITED_PILOT"
  | "MODIFICATION_REQUIRED"
  | "MORE_VALIDATION_REQUIRED"
  | "ON_HOLD"
  | "REJECT";

export type StartupOwnerDecisionType =
  | "GO"
  | "MODIFY"
  | "HOLD"
  | "REJECT"
  | "REQUEST_MORE_EVIDENCE";

export type EconomicClassification =
  | "ECONOMICALLY_VIABLE"
  | "POTENTIALLY_VIABLE"
  | "VIABLE_ONLY_IF_ASSUMPTIONS_HOLD"
  | "INSUFFICIENT_EVIDENCE"
  | "UNVIABLE"
  | "CASH_FLOW_UNSAFE"
  | "RESOURCE_INFEASIBLE";

export type MarketSizingStatus = "ESTIMATED" | "INSUFFICIENT_EVIDENCE";

export type ResearchAcquisitionStatus =
  | "PENDING"
  | "ACQUIRED"
  | "FAILED"
  | "REQUIRES_OWNER";

export type AcquisitionMode =
  | "AUTO"
  | "REQUIRES_OWNER_APPROVAL"
  | "HUMAN_ONLY";

// Valid lifecycle transitions — enforced by service layer
const VALID_TRANSITIONS: Record<StartupSessionStatus, StartupSessionStatus[]> =
  {
    DRAFT: ["CONTEXT_CAPTURE"],
    CONTEXT_CAPTURE: ["DISCOVERY", "DRAFT"],
    DISCOVERY: ["IDEA_GENERATION", "CONTEXT_CAPTURE"],
    IDEA_GENERATION: ["SCREENING", "DISCOVERY"],
    SCREENING: ["VALIDATION_PLANNED", "ECONOMICS_REVIEW", "OWNER_DECISION_REQUIRED", "SCREENING"],
    VALIDATION_PLANNED: ["VALIDATION_IN_PROGRESS", "SCREENING"],
    VALIDATION_IN_PROGRESS: ["ECONOMICS_REVIEW", "SCREENING", "VALIDATION_PLANNED"],
    ECONOMICS_REVIEW: ["READINESS_REVIEW", "VALIDATION_IN_PROGRESS", "SCREENING"],
    READINESS_REVIEW: ["OWNER_DECISION_REQUIRED", "ECONOMICS_REVIEW", "MORE_VALIDATION" as StartupSessionStatus],
    OWNER_DECISION_REQUIRED: [
      "APPROVED",
      "MODIFICATION_REQUIRED",
      "ON_HOLD",
      "REJECTED",
    ],
    APPROVED: ["EXECUTION_PLANNED"],
    MODIFICATION_REQUIRED: ["SCREENING", "OWNER_DECISION_REQUIRED"],
    ON_HOLD: ["SCREENING", "REJECTED", "OWNER_DECISION_REQUIRED"],
    REJECTED: [],
    EXECUTION_PLANNED: [],
  };

// Fix: re-add READINESS_REVIEW correctly
(VALID_TRANSITIONS as Record<string, string[]>)["READINESS_REVIEW"] = [
  "OWNER_DECISION_REQUIRED",
  "ECONOMICS_REVIEW",
  "SCREENING",
];

const TERMINAL_STATUSES: ReadonlySet<StartupSessionStatus> = new Set([
  "REJECTED",
  "EXECUTION_PLANNED",
]);

export function assertValidTransition(
  from: StartupSessionStatus,
  to: StartupSessionStatus
): void {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid startup session transition: ${from} → ${to}. Allowed: ${allowed.join(", ") || "none"}`
    );
  }
}

export function isTerminalStatus(status: StartupSessionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function getAllowedTransitions(
  from: StartupSessionStatus
): StartupSessionStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}
