/**
 * Maximum-reliability — FMEA / failure-mode assurance.
 *
 * Every HIGH-IMPACT recommendation must carry failure-mode thinking before it is allowed to proceed:
 * failure mode, cause, severity, likelihood, detectability, risk priority (RPN), mitigation, proof, stop
 * condition, reassessment metric, owner-approval requirement, and a professional-review requirement where
 * the action is compliance/tax/legal/insurance/financial-commitment sensitive. The gate blocks or escalates
 * when an FMEA is missing or the residual risk is high. Pure functions — no scorer is weakened.
 */

export const HIGH_IMPACT_ACTIONS = [
  "hire", "fire", "staff_cut", "marketing_spend", "discount", "accept_contract", "loan_emi",
  "equipment_purchase", "branch_expansion", "supplier_switch", "compliance_action", "shutdown_pivot",
  "cyber_payment_response", "owner_override", "pricing_change", "delivery_expansion",
  "payment_term_change", "multi_location_scaling",
] as const;
export type HighImpactAction = (typeof HIGH_IMPACT_ACTIONS)[number];

const HI = new Set<string>(HIGH_IMPACT_ACTIONS);
export function isHighImpact(action: string): action is HighImpactAction {
  return HI.has(action);
}

/** Actions that touch legal/tax/compliance/insurance or a hard financial commitment require a professional
 *  review boundary (OpsIQ must not give definitive certainty itself). */
const PROFESSIONAL_REVIEW_ACTIONS = new Set<string>([
  "compliance_action", "loan_emi", "accept_contract", "owner_override", "cyber_payment_response", "shutdown_pivot",
]);

export interface FmeaInput {
  action: HighImpactAction | string;
  failureMode: string;
  cause: string;
  severity: number;       // 1..10 (10 = catastrophic)
  likelihood: number;     // 1..10 (10 = almost certain)
  detectability: number;  // 1..10 (10 = cannot detect before harm)
  mitigation: string;
  proofRequired: string[];
  stopCondition: string;
  reassessmentMetric: string;
}

export interface FmeaEntry extends FmeaInput {
  rpn: number;                       // severity * likelihood * detectability (1..1000)
  ownerApprovalRequired: boolean;
  professionalReviewRequired: boolean;
  /** Recommended disposition once the residual risk is weighed. */
  disposition: "proceed" | "proceed_with_controls" | "escalate_to_owner" | "block";
}

const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n)));
export const RPN_ESCALATE = 200; // high residual risk → owner escalation
export const RPN_BLOCK = 400;    // severe residual risk → block until mitigated

/** Compute the FMEA entry. RPN drives disposition; high severity + low detectability (hard to catch in
 *  time) escalates even at moderate RPN. Owner approval is required for any escalation/block. */
export function assessFmea(input: FmeaInput): FmeaEntry {
  const severity = clamp(input.severity), likelihood = clamp(input.likelihood), detectability = clamp(input.detectability);
  const rpn = severity * likelihood * detectability;
  const hardToCatch = severity >= 8 && detectability >= 7; // severe AND we cannot detect it in time
  let disposition: FmeaEntry["disposition"] = "proceed_with_controls";
  if (rpn >= RPN_BLOCK || (hardToCatch && rpn >= RPN_ESCALATE)) disposition = "block";
  else if (rpn >= RPN_ESCALATE || hardToCatch) disposition = "escalate_to_owner";
  const ownerApprovalRequired = disposition === "escalate_to_owner" || disposition === "block" || input.action === "owner_override";
  const professionalReviewRequired = PROFESSIONAL_REVIEW_ACTIONS.has(input.action);
  return { ...input, severity, likelihood, detectability, rpn, ownerApprovalRequired, professionalReviewRequired, disposition };
}

export interface FmeaGateResult {
  ok: boolean;
  failures: string[];
  escalate: boolean;
  entry?: FmeaEntry;
}

/** A high-impact action may only proceed with a complete, low-residual-risk FMEA. */
export function requireFmea(action: string, fmea?: FmeaInput, opts: { ownerApprovalGranted?: boolean; ownerOverrideAudit?: { reason: string; actor: string } } = {}): FmeaGateResult {
  const failures: string[] = [];
  if (!isHighImpact(action)) return { ok: true, failures, escalate: false };
  if (!fmea) return { ok: false, failures: ["high-impact action without FMEA"], escalate: false };

  const entry = assessFmea(fmea);
  if (!entry.stopCondition || entry.stopCondition.trim().length < 4) failures.push("missing stop condition");
  if (entry.proofRequired.length === 0) failures.push("missing proof requirement");
  if (!entry.reassessmentMetric || entry.reassessmentMetric.trim().length < 4) failures.push("missing reassessment metric");
  if (!entry.mitigation || entry.mitigation.trim().length < 4) failures.push("missing mitigation");
  if (entry.ownerApprovalRequired && !opts.ownerApprovalGranted) failures.push("owner approval required but not granted");
  if (action === "owner_override") {
    const a = opts.ownerOverrideAudit;
    if (!a || !a.reason || a.reason.trim().length < 8 || !a.actor) failures.push("owner override requires a recorded reason + actor (audit)");
    if (!entry.mitigation) failures.push("owner override requires a risk note");
  }
  if (entry.disposition === "block") failures.push(`residual risk too high (RPN ${entry.rpn}) — blocked until mitigated`);
  return { ok: failures.length === 0, failures, escalate: entry.disposition === "escalate_to_owner" || entry.disposition === "block", entry };
}

/** FMEA changes the final decision when residual risk is high: a naive "proceed" is overridden. */
export function fmeaAdjustedDisposition(proposed: "proceed" | "block", fmea: FmeaInput): FmeaEntry["disposition"] {
  if (proposed === "block") return "block";
  return assessFmea(fmea).disposition;
}
