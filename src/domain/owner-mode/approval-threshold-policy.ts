/**
 * Approval Threshold / Auto-Action Policy Engine (depth pass).
 *
 * Given a set of candidate actions OpsIQ could take (each already derived from real evidence upstream),
 * decides — deterministically and purely — how much human approval each one needs BEFORE it may run:
 * auto-allowed, manager approval, owner approval, never auto-executed, or blocked pending data. It encodes
 * a conservative, governance-first default policy: high-harm / irreversible actions are NEVER auto-executed,
 * material (money / staff / legal / reputation) decisions stay owner-controlled, routine low-risk coaching /
 * minor process tweaks may be delegated to a manager, and only safe, reversible, no-commitment actions
 * (request proof, collapse cleared duplicate alerts, draft a checklist, propose training, open a
 * reassessment, flag an overdue item, collect data, draft-only recommendations) are auto-allowed.
 *
 * It ALSO asks, per decision, whether OpsIQ lacks a capability it would need to ever safely automate or
 * verify the action, and — when so — keeps the human in the loop AND surfaces a concrete
 * systemCapabilityRecommendation (what OpsIQ would have to build first). It never fabricates a money figure,
 * never accuses anyone, and never downgrades a high-harm action just because data is thin.
 *
 * Governance stance (matches OpsIQ rules):
 * - High-harm / irreversible actions (firing, payroll, disciplinary, legal-terms, deleting audit records,
 *   committing contracts/loans, hiding risk, scaling on unvalidated demand, accusing someone) are hard-set
 *   to NEVER_AUTO — OpsIQ never performs them automatically; they require a deliberate human decision.
 * - Material money / legal / reputation / customer-trust decisions require OWNER approval.
 * - Low-confidence + high-impact is escalated to the owner even if the base action was routine.
 * - Missing data yields NEEDS_DATA — EXCEPT a high-harm action, which stays NEVER_AUTO (thin data never
 *   makes a dangerous action safer).
 * - No fraud/negligence/firing/payroll/discipline language in generated prose; no hidden score; no fake money.
 */

import type { ApprovalLevel } from "./process-intelligence";

/** Every candidate action OpsIQ could take, classified for the default policy. */
export type PolicyActionType =
  // Never auto-executed — high-harm / irreversible.
  | "STAFF_TERMINATION"
  | "PAYROLL_CHANGE"
  | "MISCONDUCT_ACCUSATION"
  | "DELETE_AUDIT_RECORD"
  | "CONTRACT_COMMITMENT"
  | "LOAN_COMMITMENT"
  | "SUPPRESS_RISK"
  | "SCALING_ON_UNVALIDATED_DEMAND"
  | "LEGAL_TERMS_CHANGE"
  | "STAFF_DISCIPLINARY_ACTION"
  // Owner approval — material money / legal / reputation.
  | "PRICING_CHANGE"
  | "REFUND_ABOVE_THRESHOLD"
  | "DISCOUNT_GRANT"
  | "B2B_CONTRACT_TERMS"
  | "LARGE_SPEND"
  | "LEGAL_MATTER_REVIEW"
  | "REPUTATION_RESPONSE"
  // Manager approval — routine, low-risk.
  | "ROUTINE_COACHING"
  | "MINOR_PROCESS_CHANGE"
  // Auto-allowed — safe, reversible, no commitment.
  | "REQUEST_MISSING_PROOF"
  | "COLLAPSE_DUPLICATE_CLEARED_ALERTS"
  | "DRAFT_CHECKLIST"
  | "PROPOSE_TRAINING"
  | "OPEN_REASSESSMENT"
  | "FLAG_OVERDUE_ITEM"
  | "COLLECT_DATA"
  | "DRAFT_ONLY_RECOMMENDATION"
  // Unclassified — needs data.
  | "UNKNOWN";

export type RiskCategory =
  | "FINANCIAL"
  | "STAFF"
  | "LEGAL"
  | "REPUTATION"
  | "CUSTOMER_TRUST"
  | "OPERATIONAL"
  | "DATA_INTEGRITY"
  | "NONE"
  | "UNKNOWN";

export type ApprovalDecision =
  | "AUTO_ALLOWED"
  | "MANAGER_APPROVAL_REQUIRED"
  | "OWNER_APPROVAL_REQUIRED"
  | "NEVER_AUTO"
  | "NEEDS_DATA";

export type ImpactLevel = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type PolicyConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";

export type PolicyBasis =
  | "NEVER_AUTO_ACTION"
  | "HIGH_RISK_OWNER_ACTION"
  | "LOW_CONFIDENCE_HIGH_IMPACT_ESCALATION"
  | "CAPABILITY_GAP_HOLD"
  | "ROUTINE_MANAGER_ACTION"
  | "SAFE_AUTOMATABLE_ACTION"
  | "INSUFFICIENT_DATA";

/** Capabilities OpsIQ would need before it could ever safely automate / verify a class of action. */
export type MissingCapabilityType =
  | "VERIFIED_AMOUNT_LEDGER"
  | "REFUND_RECONCILIATION"
  | "PAYROLL_INTEGRATION"
  | "CONTRACT_TERMS_REGISTRY"
  | "LEGAL_REVIEW_WORKFLOW"
  | "IDENTITY_EVIDENCE_CHAIN"
  | "MARGIN_SIMULATION"
  | "SPEND_CONTROL_LEDGER"
  | "AUTOMATED_ROLLBACK"
  | "NONE";

/** A candidate action, already derived from real upstream evidence (never guessed here). */
export interface PolicyActionCandidate {
  actionKey: string;
  actionType: PolicyActionType;
  title: string;
  riskCategory: RiskCategory;
  impactLevel: ImpactLevel;
  confidence: PolicyConfidence;
  evidenceComplete: boolean;
  reversible: boolean;
  supportingEvidenceIds: string[];
  sourceProcessFinding: string | null;
  missingData: string[];
}

export interface ApprovalPolicyInput {
  candidates: PolicyActionCandidate[];
}

/** The per-action policy decision (21-field shape). */
export interface ApprovalPolicyDecision {
  workspaceId: string; // 1
  actionKey: string; // 2
  actionType: PolicyActionType; // 3
  title: string; // 4
  riskCategory: RiskCategory; // 5
  impactLevel: ImpactLevel; // 6
  confidence: PolicyConfidence; // 7
  approvalDecision: ApprovalDecision; // 8
  requiredApprovalLevel: ApprovalLevel | "NONE"; // 9
  autoExecutable: boolean; // 10
  blocked: boolean; // 11 — true only for NEVER_AUTO
  reversible: boolean; // 12
  rationale: string; // 13 — owner-visible, non-accusatory
  riskGuardrail: string; // 14
  policyBasis: PolicyBasis; // 15
  capabilityGap: boolean; // 16
  missingCapabilityType: MissingCapabilityType | null; // 17
  systemCapabilityRecommendation: string | null; // 18
  supportingEvidenceIds: string[]; // 19
  missingData: string[]; // 20
  evaluatedAt: string; // 21
}

export interface ApprovalPolicySummary {
  autoAllowed: number;
  managerRequired: number;
  ownerRequired: number;
  neverAuto: number;
  needsData: number;
}

export interface ApprovalPolicyAnalysis {
  workspaceId: string;
  decisions: ApprovalPolicyDecision[];
  topDecision: ApprovalPolicyDecision | null;
  summary: ApprovalPolicySummary;
  capabilityRecommendations: string[];
  evaluatedAt: string;
}

/** Base decision by action type — the default governance policy. */
const NEVER_AUTO_ACTIONS = new Set<PolicyActionType>([
  "STAFF_TERMINATION", "PAYROLL_CHANGE", "MISCONDUCT_ACCUSATION", "DELETE_AUDIT_RECORD",
  "CONTRACT_COMMITMENT", "LOAN_COMMITMENT", "SUPPRESS_RISK", "SCALING_ON_UNVALIDATED_DEMAND",
  "LEGAL_TERMS_CHANGE", "STAFF_DISCIPLINARY_ACTION",
]);
const OWNER_ACTIONS = new Set<PolicyActionType>([
  "PRICING_CHANGE", "REFUND_ABOVE_THRESHOLD", "DISCOUNT_GRANT", "B2B_CONTRACT_TERMS",
  "LARGE_SPEND", "LEGAL_MATTER_REVIEW", "REPUTATION_RESPONSE",
]);
const MANAGER_ACTIONS = new Set<PolicyActionType>(["ROUTINE_COACHING", "MINOR_PROCESS_CHANGE"]);
const AUTO_ACTIONS = new Set<PolicyActionType>([
  "REQUEST_MISSING_PROOF", "COLLAPSE_DUPLICATE_CLEARED_ALERTS", "DRAFT_CHECKLIST", "PROPOSE_TRAINING",
  "OPEN_REASSESSMENT", "FLAG_OVERDUE_ITEM", "COLLECT_DATA", "DRAFT_ONLY_RECOMMENDATION",
]);

/** Capabilities OpsIQ would need before it could ever verify/automate an action class. */
const CAPABILITY_MAP: Partial<Record<PolicyActionType, { type: MissingCapabilityType; rec: string }>> = {
  REFUND_ABOVE_THRESHOLD: { type: "REFUND_RECONCILIATION", rec: "OpsIQ cannot yet reconcile a refund against a verified transaction ledger. Keep this an owner decision; to ever assist, add a refund-reconciliation capability that ties each refund to a confirmed original charge." },
  LARGE_SPEND: { type: "SPEND_CONTROL_LEDGER", rec: "OpsIQ has no spend-control ledger to validate available funds or budget. Keep this an owner decision; a spend-control ledger would let OpsIQ flag over-budget commitments before they happen." },
  PRICING_CHANGE: { type: "MARGIN_SIMULATION", rec: "OpsIQ cannot simulate the margin impact of a price change. Keep this an owner decision; a margin-simulation capability would let OpsIQ show the profit effect before the owner commits." },
  PAYROLL_CHANGE: { type: "PAYROLL_INTEGRATION", rec: "OpsIQ has no compensation-system integration and must never change what staff are paid. A read-only compensation feed would let OpsIQ surface anomalies for the owner without ever changing anyone's compensation itself." },
  B2B_CONTRACT_TERMS: { type: "CONTRACT_TERMS_REGISTRY", rec: "OpsIQ has no registry of agreed contract terms. Keep terms owner-controlled; a contract-terms registry would let OpsIQ check a proposed change against what was actually agreed." },
  CONTRACT_COMMITMENT: { type: "CONTRACT_TERMS_REGISTRY", rec: "OpsIQ has no registry of contract terms and must never commit the business. A contract-terms registry would let OpsIQ prepare — never sign — a draft for the owner." },
  LEGAL_TERMS_CHANGE: { type: "LEGAL_REVIEW_WORKFLOW", rec: "OpsIQ has no legal-review workflow. Legal terms must never change automatically; a legal-review workflow would route a draft to a qualified human first." },
  LEGAL_MATTER_REVIEW: { type: "LEGAL_REVIEW_WORKFLOW", rec: "OpsIQ has no legal-review workflow. Keep legal matters owner-controlled; a legal-review workflow would let OpsIQ track — not decide — them." },
  MISCONDUCT_ACCUSATION: { type: "IDENTITY_EVIDENCE_CHAIN", rec: "OpsIQ cannot establish intent or a verified evidence chain and must never accuse anyone. It can only surface a neutral pattern for the owner to investigate in person." },
};

const NEVER_AUTO_GUARDRAIL =
  "High-harm or irreversible actions are never auto-executed. OpsIQ prepares context only; the owner decides and acts in person.";
const OWNER_GUARDRAIL =
  "Material money, legal, reputation and customer-trust decisions stay with the owner; OpsIQ recommends but never commits them.";
const MANAGER_GUARDRAIL =
  "Routine, low-risk, reversible work may be delegated to a trusted manager; anything material still returns to the owner.";
const AUTO_GUARDRAIL =
  "This is a safe, reversible, no-commitment action (drafting, flagging, requesting evidence, collecting data); it changes no money, staff, or legal state.";
const NEEDS_DATA_GUARDRAIL =
  "OpsIQ will not act until the missing evidence, impact, risk category, or approval boundary is established.";

const DECISION_RANK: Record<ApprovalDecision, number> = {
  NEVER_AUTO: 0, OWNER_APPROVAL_REQUIRED: 1, NEEDS_DATA: 2, MANAGER_APPROVAL_REQUIRED: 3, AUTO_ALLOWED: 4,
};

function baseDecision(t: PolicyActionType): ApprovalDecision {
  if (NEVER_AUTO_ACTIONS.has(t)) return "NEVER_AUTO";
  if (OWNER_ACTIONS.has(t)) return "OWNER_APPROVAL_REQUIRED";
  if (MANAGER_ACTIONS.has(t)) return "MANAGER_APPROVAL_REQUIRED";
  if (AUTO_ACTIONS.has(t)) return "AUTO_ALLOWED";
  return "NEEDS_DATA"; // UNKNOWN
}

function levelFor(d: ApprovalDecision): ApprovalLevel | "NONE" {
  switch (d) {
    case "OWNER_APPROVAL_REQUIRED":
    case "NEVER_AUTO":
      return "OWNER";
    case "MANAGER_APPROVAL_REQUIRED":
      return "MANAGER";
    case "AUTO_ALLOWED":
      return "STAFF";
    case "NEEDS_DATA":
      return "NONE";
  }
}

function dataUnclear(c: PolicyActionCandidate): boolean {
  return (
    c.actionType === "UNKNOWN" ||
    c.riskCategory === "UNKNOWN" ||
    c.impactLevel === "UNKNOWN" ||
    c.confidence === "NEEDS_DATA" ||
    !c.evidenceComplete
  );
}

function decide(c: PolicyActionCandidate, workspaceId: string, evaluatedAt: string): ApprovalPolicyDecision {
  const base = baseDecision(c.actionType);
  const cap = CAPABILITY_MAP[c.actionType];
  let decision = base;
  let basis: PolicyBasis;
  let rationale: string;
  let guardrail: string;

  if (base === "NEVER_AUTO") {
    // Thin data never makes a high-harm action safer: it stays NEVER_AUTO regardless.
    decision = "NEVER_AUTO";
    basis = "NEVER_AUTO_ACTION";
    guardrail = NEVER_AUTO_GUARDRAIL;
    rationale = "This is a high-harm or irreversible action. OpsIQ never performs it automatically — it must be decided and carried out directly by the owner.";
  } else if (dataUnclear(c)) {
    decision = "NEEDS_DATA";
    basis = "INSUFFICIENT_DATA";
    guardrail = NEEDS_DATA_GUARDRAIL;
    rationale = "OpsIQ cannot yet set an approval boundary for this: the action type, risk category, impact, or supporting evidence is not yet established.";
  } else if ((base === "MANAGER_APPROVAL_REQUIRED" || base === "AUTO_ALLOWED") && c.impactLevel === "HIGH" && c.confidence === "LOW") {
    // Low-confidence + high-impact is escalated to the owner even if the base action was routine.
    decision = "OWNER_APPROVAL_REQUIRED";
    basis = "LOW_CONFIDENCE_HIGH_IMPACT_ESCALATION";
    guardrail = OWNER_GUARDRAIL;
    rationale = "The confidence is low but the potential impact is high, so this is escalated to you rather than handled routinely or automatically.";
  } else if (base === "OWNER_APPROVAL_REQUIRED") {
    decision = "OWNER_APPROVAL_REQUIRED";
    basis = cap ? "CAPABILITY_GAP_HOLD" : "HIGH_RISK_OWNER_ACTION";
    guardrail = OWNER_GUARDRAIL;
    rationale = "This is a material decision (money, legal, reputation or a key customer relationship). OpsIQ recommends, but you approve before anything happens.";
  } else if (base === "MANAGER_APPROVAL_REQUIRED") {
    decision = "MANAGER_APPROVAL_REQUIRED";
    basis = "ROUTINE_MANAGER_ACTION";
    guardrail = MANAGER_GUARDRAIL;
    rationale = "This is routine, low-risk, reversible work. A trusted manager can approve it; anything material still comes back to you.";
  } else {
    decision = "AUTO_ALLOWED";
    basis = "SAFE_AUTOMATABLE_ACTION";
    guardrail = AUTO_GUARDRAIL;
    rationale = "This is a safe, reversible action that commits no money, staff or legal state — OpsIQ can do it without waiting on approval.";
  }

  const level = levelFor(decision);
  const capabilityGap = Boolean(cap) && decision !== "AUTO_ALLOWED";
  return {
    workspaceId,
    actionKey: c.actionKey,
    actionType: c.actionType,
    title: c.title,
    riskCategory: c.riskCategory,
    impactLevel: c.impactLevel,
    confidence: c.confidence,
    approvalDecision: decision,
    requiredApprovalLevel: level,
    autoExecutable: decision === "AUTO_ALLOWED",
    blocked: decision === "NEVER_AUTO",
    reversible: c.reversible,
    rationale,
    riskGuardrail: guardrail,
    policyBasis: basis,
    capabilityGap,
    missingCapabilityType: capabilityGap ? cap!.type : null,
    systemCapabilityRecommendation: capabilityGap ? cap!.rec : null,
    supportingEvidenceIds: c.supportingEvidenceIds,
    missingData: decision === "NEEDS_DATA" ? (c.missingData.length ? c.missingData : ["insufficient linked evidence to set an approval boundary"]) : c.missingData,
    evaluatedAt,
  };
}

/**
 * Build the approval-threshold / auto-action policy. Pure + deterministic. Most-restrictive decision first
 * (NEVER_AUTO → OWNER → NEEDS_DATA → MANAGER → AUTO_ALLOWED); stable for ties.
 */
export function buildApprovalPolicy(
  input: ApprovalPolicyInput,
  workspaceId: string,
  evaluatedAt: string,
): ApprovalPolicyAnalysis {
  const decisions = input.candidates.map((c) => decide(c, workspaceId, evaluatedAt));
  decisions.sort((a, b) => DECISION_RANK[a.approvalDecision] - DECISION_RANK[b.approvalDecision]);

  const summary: ApprovalPolicySummary = {
    autoAllowed: decisions.filter((d) => d.approvalDecision === "AUTO_ALLOWED").length,
    managerRequired: decisions.filter((d) => d.approvalDecision === "MANAGER_APPROVAL_REQUIRED").length,
    ownerRequired: decisions.filter((d) => d.approvalDecision === "OWNER_APPROVAL_REQUIRED").length,
    neverAuto: decisions.filter((d) => d.approvalDecision === "NEVER_AUTO").length,
    needsData: decisions.filter((d) => d.approvalDecision === "NEEDS_DATA").length,
  };
  // One recommendation per missing capability type: the first decision that surfaces a given capability
  // gap owns its wording, so the same missing capability is never recommended twice.
  const seenCapability = new Set<MissingCapabilityType>();
  const capabilityRecommendations: string[] = [];
  for (const d of decisions) {
    if (d.capabilityGap && d.missingCapabilityType && d.systemCapabilityRecommendation && !seenCapability.has(d.missingCapabilityType)) {
      seenCapability.add(d.missingCapabilityType);
      capabilityRecommendations.push(d.systemCapabilityRecommendation);
    }
  }

  return { workspaceId, decisions, topDecision: decisions[0] ?? null, summary, capabilityRecommendations, evaluatedAt };
}
