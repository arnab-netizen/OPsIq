/**
 * C9 — Assignment resolver (pure).
 *
 * Decides who should do the action and validates authority, workload, proof
 * responsibility, escalation, and owner-only-decision status. Models only
 * business-operational human factors (no diagnosis). The owner is not assigned routine
 * staff work by default; overloaded staff are not given extra non-critical work;
 * compliance/financial tasks escalate to the right expert.
 */

import type { AssignmentDecision } from "@/domain/collective-training/collective-types";

export type TaskKind = "compliance" | "financial" | "operational" | "verification" | "strategic" | "routine";

export interface AssignmentInput {
  taskKind: TaskKind;
  complianceUncertain: boolean;
  ownerOverloaded: boolean;
  staffOverloaded: boolean;
  ownerOnlyDecision?: boolean;
  critical?: boolean;
}

export function resolveAssignment(i: AssignmentInput): AssignmentDecision {
  // Compliance / legal / safety → escalate to the right expert.
  if (i.complianceUncertain || i.taskKind === "compliance") {
    return { who: "legal", authorityOk: true, workloadOk: true,
      proofResponsibility: "expert provides written sign-off", escalation: "verified legal/compliance expert" };
  }
  if (i.taskKind === "financial") {
    return { who: "accountant", authorityOk: true, workloadOk: true,
      proofResponsibility: "accountant reconciles the figures", escalation: "accountant/owner" };
  }
  if (i.ownerOnlyDecision || i.taskKind === "strategic") {
    return { who: "owner", authorityOk: true, workloadOk: !i.ownerOverloaded,
      proofResponsibility: "owner records the decision and evidence", escalation: "advisor" };
  }
  if (i.taskKind === "verification") {
    return { who: "manager", authorityOk: true, workloadOk: true,
      proofResponsibility: "manager verifies and records the outcome", escalation: "owner" };
  }
  // Operational / routine work. Never default routine work to the owner.
  if (i.staffOverloaded && !i.critical) {
    return { who: "manager", authorityOk: true, workloadOk: false,
      proofResponsibility: "manager rebalances workload then assigns", escalation: "owner (rebalance/defer)" };
  }
  return { who: "staff", authorityOk: true, workloadOk: !i.staffOverloaded,
    proofResponsibility: "assignee captures completion evidence", escalation: "manager" };
}
