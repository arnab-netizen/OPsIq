/**
 * Action ASSIGNMENT + PROOF lifecycle — pure owner-execution domain.
 *
 * For a recommended action it resolves WHO owns it (owner / manager / staff / vendor / customer /
 * OpsIQ-prepared), the due timing, the proof required and its type, acceptance criteria, the
 * reassessment metric, the escalation trigger, whether owner approval is required, and whether it can
 * be delegated — so the owner executes less, not more.
 *
 * The proof lifecycle enforces the governance rules: an action is NEVER complete without an accepted
 * proof, a rejected proof keeps the action incomplete, an overdue proof escalates, and reassessment is
 * pending only AFTER a proof is accepted.
 *
 * Pure module. No DB, no Date.now, no AI.
 */
import type { OwnerRole } from "@/domain/owner-mode/owner-onboarding";

export type ResponsibleParty = "owner" | "manager" | "staff" | "vendor" | "customer" | "opsiq";
export type RiskClass = "low" | "medium" | "high" | "critical";
export type ProofType = "photo" | "document" | "receipt" | "metric_screenshot" | "signed_record" | "system_log";

export type ActionKind =
  | "financial_decision"
  | "operations_task"
  | "quality_oversight"
  | "supply_order"
  | "customer_followup"
  | "scheduling"
  | "compliance_filing";

export interface ActionAssignmentInput {
  actionTitle: string;
  kind: ActionKind;
  riskClass: RiskClass;
  ownerRole: OwnerRole;
  /** Action requires someone physically on site. */
  requiresOnSite?: boolean;
  /** Dominant constraint label — drives the reassessment metric. */
  constraintLabel?: string;
  dueInDays: number;
}

export interface ActionAssignment {
  actionTitle: string;
  responsibleParty: ResponsibleParty;
  assistedBy: ResponsibleParty[];
  opsiqPreparedWork: string;
  dueInDays: number;
  proofRequired: boolean;
  proofType: ProofType;
  acceptanceCriteria: string;
  reassessmentMetric: string;
  escalationTrigger: string;
  ownerApprovalRequired: boolean;
  delegatable: boolean;
}

const KIND_PRIMARY: Record<ActionKind, ResponsibleParty> = {
  financial_decision: "owner",
  operations_task: "staff",
  quality_oversight: "manager",
  supply_order: "vendor",
  customer_followup: "customer",
  scheduling: "manager",
  compliance_filing: "owner",
};

const KIND_PROOF: Record<ActionKind, ProofType> = {
  financial_decision: "metric_screenshot",
  operations_task: "photo",
  quality_oversight: "signed_record",
  supply_order: "receipt",
  customer_followup: "system_log",
  scheduling: "document",
  compliance_filing: "document",
};

const KIND_OPSIQ_WORK: Record<ActionKind, string> = {
  financial_decision: "OpsIQ has prepared the numbers, the recommended figure, and the downside if you wait.",
  operations_task: "OpsIQ has prepared a step checklist the staff member can follow without you.",
  quality_oversight: "OpsIQ has prepared the review checklist and the threshold that counts as a pass.",
  supply_order: "OpsIQ has drafted the order quantity and the vendor message.",
  customer_followup: "OpsIQ has drafted the customer message and the follow-up timing.",
  scheduling: "OpsIQ has prepared the rota change and who it affects.",
  compliance_filing: "OpsIQ has prepared the filing checklist and the deadline.",
};

/** Resolve the full assignment for a recommended action. */
export function resolveActionAssignment(input: ActionAssignmentInput): ActionAssignment {
  const { kind, riskClass, ownerRole } = input;
  const remoteish = ownerRole === "remote_owner" || ownerRole === "manager_run";
  const highRisk = riskClass === "high" || riskClass === "critical";

  let responsibleParty = KIND_PRIMARY[kind];
  const assistedBy: ResponsibleParty[] = ["opsiq"];

  // A remote / manager-run owner pushes execution to the manager/staff; the owner keeps approval only.
  if (remoteish && (responsibleParty === "owner") && !(kind === "compliance_filing" && highRisk)) {
    responsibleParty = "manager";
    assistedBy.push("owner");
  }
  // On-site operations need staff; the manager assists/oversees.
  if (responsibleParty === "staff" && remoteish) assistedBy.push("manager");

  const ownerApprovalRequired = highRisk || kind === "financial_decision" || kind === "compliance_filing";

  // Delegatable unless it is a critical on-site action that only the owner can hold.
  const delegatable =
    responsibleParty !== "owner" || (remoteish && !(riskClass === "critical" && Boolean(input.requiresOnSite)));

  const reassessmentMetric = input.constraintLabel
    ? `the metric behind "${input.constraintLabel}" (recheck after proof is accepted)`
    : "the dominant constraint metric (recheck after proof is accepted)";

  const graceDays = highRisk ? 1 : 2;
  const escalationTrigger = `No accepted proof within ${input.dueInDays + graceDays} days → escalate to the owner${remoteish ? " and flag the manager" : ""}.`;

  return {
    actionTitle: input.actionTitle,
    responsibleParty,
    assistedBy: Array.from(new Set(assistedBy)).filter((p) => p !== responsibleParty),
    opsiqPreparedWork: KIND_OPSIQ_WORK[kind],
    dueInDays: input.dueInDays,
    proofRequired: true,
    proofType: KIND_PROOF[kind],
    acceptanceCriteria: `Proof (${KIND_PROOF[kind].replace(/_/g, " ")}) must show "${input.actionTitle}" was done; OpsIQ marks it complete only when the proof is accepted.`,
    reassessmentMetric,
    escalationTrigger,
    ownerApprovalRequired,
    delegatable,
  };
}

// ─── Proof lifecycle ─────────────────────────────────────────────────────────

export type ProofStatus = "required" | "submitted" | "accepted" | "rejected" | "overdue" | "reassessment_pending";

export const PROOF_TRANSITIONS: Readonly<Record<ProofStatus, readonly ProofStatus[]>> = {
  required: ["submitted", "overdue"],
  submitted: ["accepted", "rejected", "overdue"],
  accepted: ["reassessment_pending"],
  rejected: ["submitted", "overdue"], // owner/staff may resubmit
  overdue: ["submitted"], // can still be satisfied after escalation
  reassessment_pending: [],
};

export function isProofTransitionAllowed(from: ProofStatus, to: ProofStatus): boolean {
  return PROOF_TRANSITIONS[from].includes(to);
}

export interface ProofEvaluationInput {
  status: ProofStatus;
  dueInDays: number;
  daysElapsed: number;
  graceDays?: number;
}

export interface ProofEvaluation {
  status: ProofStatus;
  actionComplete: boolean;
  escalated: boolean;
  reassessmentPending: boolean;
  reason: string;
}

/**
 * Evaluate a proof's effective state. An unsatisfied proof past due + grace becomes overdue + escalated.
 * Completion requires an ACCEPTED proof; a rejected proof keeps the action incomplete.
 */
export function evaluateProof(input: ProofEvaluationInput): ProofEvaluation {
  const grace = input.graceDays ?? 2;
  const pastDue = input.daysElapsed > input.dueInDays + grace;

  // Unsatisfied (required/submitted/rejected) and past due → overdue + escalate.
  if (pastDue && (input.status === "required" || input.status === "submitted" || input.status === "rejected")) {
    return {
      status: "overdue",
      actionComplete: false,
      escalated: true,
      reassessmentPending: false,
      reason: "Proof is overdue — escalated to the owner.",
    };
  }

  switch (input.status) {
    case "accepted":
      return { status: "accepted", actionComplete: true, escalated: false, reassessmentPending: true, reason: "Proof accepted — action complete; reassessment pending." };
    case "reassessment_pending":
      return { status: "reassessment_pending", actionComplete: true, escalated: false, reassessmentPending: true, reason: "Reassessment pending after accepted proof." };
    case "rejected":
      return { status: "rejected", actionComplete: false, escalated: false, reassessmentPending: false, reason: "Proof rejected — action stays incomplete until valid proof is accepted." };
    case "submitted":
      return { status: "submitted", actionComplete: false, escalated: false, reassessmentPending: false, reason: "Proof submitted — awaiting review." };
    case "overdue":
      return { status: "overdue", actionComplete: false, escalated: true, reassessmentPending: false, reason: "Proof overdue — escalated to the owner." };
    case "required":
    default:
      return { status: "required", actionComplete: false, escalated: false, reassessmentPending: false, reason: "Proof required before this action counts as done." };
  }
}
