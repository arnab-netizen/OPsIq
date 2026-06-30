/**
 * OpsIQ SUPERVISOR SUMMARY — a pure derivation over the EXISTING runtime whole-business-plan view.
 *
 * It adds NO new advice and NO model: it composes the already-computed runtime fields (dominant
 * constraint, next best action, do-not-do, proof, reassessment, owner/delegate split, prepared work,
 * profit/cash/workload/quality impact, confidence, missing data, success metrics, growth gate) into:
 *   - an explicit assumption ledger (known facts / assumptions / missing data / confidence + reason /
 *     what would change the recommendation), with inferred facts always marked;
 *   - an explicit owner action status (proceed / cautious_proceed / owner_decision_required /
 *     need_more_data / blocked) that can never read as "proceed" when it is not;
 *   - a profit/cash/workload/capacity/quality impact block (surfaced, where relevant);
 *   - an operating cadence (now / today / this week / reassessment / KPI watch / stop-loss / next review);
 *   - the top priorities (≤3 unless emergency).
 *
 * Hard guarantees (tested): confidence is never "high" while a critical domain is missing; blocked /
 * need_more_data never present as proceed; a below-margin / unsafe recommendation is not "proceed" and
 * carries a do-not-do; assumptions are always marked as estimates.
 *
 * Pure module. No DB, no Date.now, no AI.
 */
import type { Confidence } from "@/services/owner-mode/owner-domain-ingestion";
import { decideActionStatus, type SafeActionSignals } from "./action-status-policy";

export type OwnerActionStatus =
  | "proceed"
  | "cautious_proceed"
  | "owner_decision_required"
  | "need_more_data"
  | "blocked";

/** Constraints that make the situation an EMERGENCY (survival/legal/fraud) — allows >3 priorities. */
const EMERGENCY_CONSTRAINTS = new Set(["compliance_block", "proof_fraud_block", "cash_survival"]);
/** Constraints whose recommendation is financially high-risk → owner decision + stop-loss. */
const HIGH_RISK_FINANCIAL = new Set(["cash_survival", "below_margin", "profitable_growth", "efficiency_scaling"]);

export interface SupervisorInput {
  found: boolean;
  dominantConstraint: string;
  topPriorityLabel: string;
  nextBestAction: string;
  rootCause: string;
  doNotDo: string[];
  proofRequired: string[];
  reassessmentTriggers: string[];
  successMetrics: string[];
  redDomains: string[];
  ownerApprovalRequired: boolean;
  ownerOffload: string;
  delegatedWork: string[];
  opsiqPreparedWork: string[];
  growthScaleAllowed: boolean;
  growthBlockedBy: string[];
  overallConfidence: Confidence;
  criticalDomainsAllReal: boolean;
  dataSourceMissing: string[];
  realProviderDomains: string[];
  assessedDomains: string[];
  unsafeCount: number;
  impact: {
    financeCash: string;
    marginPricing: string;
    equipmentCapacity: string;
    staffWorkload: string;
    customerQuality: string;
  };
  ownerWorkloadOffload: string;
  plan7Day: string;
  plan30Day: string;
  /**
   * OPTIONAL safe-action signals. Present ONLY when the runtime has classified the recommended action as
   * genuinely safe (low/medium risk, reversible, within an approved SOP/standing instruction, evidence
   * sufficient, no material cash/staff/customer/compliance risk). When absent (the default for every
   * existing caller), the disposition stays conservative and identical to before this field existed.
   */
  safeAction?: SafeActionSignals;
}

export interface AssumptionLedger {
  knownFacts: string[];
  /** Owner-estimated / inferred domains — ALWAYS marked as estimates, never as verified facts. */
  assumptions: string[];
  assumptionsAreMarked: boolean;
  missingData: string[];
  confidence: Confidence;
  confidenceReason: string;
  whatWouldChange: string;
}

export interface ImpactStatement {
  dimension: "profit_margin" | "cash" | "owner_workload" | "staff_capacity" | "customer_quality";
  label: string;
  statement: string;
  relevant: boolean;
}

export interface OperatingCadence {
  now: string;
  today: string;
  thisWeek: string;
  reassessmentTrigger: string;
  kpiWatch: string;
  stopLoss: string;
  nextReview: string;
}

export interface SupervisorPriority {
  severity: "critical" | "high" | "medium";
  whatIsWrong: string;
  doNext: string;
}

export interface SupervisorSummary {
  found: boolean;
  emergency: boolean;
  mainIssue: string;
  whyItMatters: string;
  doNow: string;
  doNotDo: string[];
  ownerDecisionRequired: string | null;
  delegateToStaff: string[];
  opsiqPreparedWork: string[];
  proofNeeded: string[];
  ledger: AssumptionLedger;
  confidence: Confidence;
  actionStatus: OwnerActionStatus;
  /** Convenience flag — true only when the status genuinely permits proceeding. */
  canProceed: boolean;
  impact: ImpactStatement[];
  cadence: OperatingCadence;
  topPriorities: SupervisorPriority[];
}

const CONF_ORDER: Record<Confidence, number> = { none: 0, low: 1, medium: 2, high: 3 };
const CONSTRAINT_WHY: Record<string, string> = {
  compliance_block: "A legal / licensing / tax exposure can shut the business down — it outranks everything else.",
  proof_fraud_block: "Unverifiable or gamed numbers would corrupt every downstream decision.",
  cash_survival: "Running out of cash ends the business before any other problem matters.",
  below_margin: "Work that loses money on every unit drains the business the more you sell.",
  capacity_feasibility: "Taking on more than you can reliably deliver breaks quality and SLAs.",
  customer_quality: "A quality / reputation problem destroys demand faster than marketing can replace it.",
  owner_workload: "An overloaded owner becomes the bottleneck and the single point of failure.",
  profitable_growth: "Growth is only safe once the business is stable and profitable per unit.",
  efficiency_scaling: "Scaling inefficiency multiplies cost faster than revenue.",
  optimization: "Fine-tuning within safe bounds — lowest urgency.",
};

function nonDefault(s: string): boolean {
  const t = (s ?? "").trim().toLowerCase();
  return t.length > 0 && t !== "—" && t !== "not specified." && t !== "not specified";
}

/** Profile-relative, mirrors the live gate: a missing relevant critical forces low — never high. */
function deriveConfidence(input: SupervisorInput): { confidence: Confidence; reason: string } {
  if (!input.criticalDomainsAllReal) {
    return {
      confidence: input.overallConfidence === "none" ? "none" : "low",
      reason: input.dataSourceMissing.length > 0
        ? `Critical data is missing real records (${input.dataSourceMissing.slice(0, 3).join(", ")}), so confidence is capped low.`
        : "A critical domain is not backed by real data, so confidence is capped low.",
    };
  }
  if (input.overallConfidence === "high") {
    return { confidence: "high", reason: "All critical domains are backed by real, fresh records." };
  }
  return {
    confidence: input.overallConfidence,
    reason: "Critical domains are real but some recommended data is missing or stale, so confidence is held to " + input.overallConfidence + ".",
  };
}

/**
 * Delegates to the canonical action-status policy. Behaviour-preserving: when `input.safeAction` is absent
 * (every existing caller), the supplied signals reproduce the original conservative ladder exactly —
 * blocked (unsafe / compliance / proof) → need_more_data (missing critical data / no confidence) →
 * owner_decision_required (owner approval or high-risk-financial) → cautious_proceed (confidence low/medium)
 * → proceed. A genuinely-safe action may downgrade an owner-decision to cautious_proceed / proceed, but can
 * NEVER override blocked or need_more_data.
 */
function deriveActionStatus(input: SupervisorInput, confidence: Confidence): OwnerActionStatus {
  return decideActionStatus({
    unsafe: input.unsafeCount > 0,
    complianceOrProofBoundaryWithoutReview: input.dominantConstraint === "compliance_block" || input.dominantConstraint === "proof_fraud_block",
    disputedOrFakeProof: false,
    badContractHighRisk: false,
    cashHardBlock: false,
    staffOrCustomerSafetyRisk: false,
    highRiskActionWithMissingData: false,
    likelyBadOutcomeIfFollowed: false,
    criticalDataMissing: !input.criticalDomainsAllReal,
    confidenceNone: confidence === "none",
    materialAssumptions: false,
    weakOrOneSidedSource: false,
    confidenceBelowThreshold: false,
    highImpactInsufficientEvidence: false,
    financiallyMaterial: false,
    changesStaffingPayroll: false,
    changesPricingMaterially: false,
    b2bContractTerms: false,
    brandComplianceLegalBoundary: false,
    reversibleButMaterial: false,
    ownerApprovalRequiredByStandingInstruction: input.ownerApprovalRequired,
    highRiskFinancialConstraint: HIGH_RISK_FINANCIAL.has(input.dominantConstraint),
    safeAction: input.safeAction,
    confidence,
  }).status;
}

function buildLedger(input: SupervisorInput, confidence: Confidence, reason: string): AssumptionLedger {
  const real = new Set(input.realProviderDomains);
  const missing = new Set(input.dataSourceMissing);
  // Assumed = assessed domains that are neither real-backed nor explicitly missing → owner estimates.
  const assumedDomains = input.assessedDomains.filter((d) => !real.has(d) && !missing.has(d));
  const assumptions = assumedDomains.map((d) => `Assumed (owner estimate, not a verified record): ${d.replace(/_/g, " ")}.`);

  const whatWouldChange = missing.size > 0
    ? `Supplying real records for ${input.dataSourceMissing.slice(0, 2).join(", ")} would change this recommendation.`
    : input.proofRequired.length > 0
      ? `A failed or rejected proof (${input.proofRequired[0]}) would change this recommendation.`
      : "New critical evidence, a KPI breach, or a shock event would change this recommendation.";

  return {
    knownFacts: input.realProviderDomains.map((d) => `Verified from real records: ${d.replace(/_/g, " ")}.`),
    assumptions,
    assumptionsAreMarked: assumptions.every((a) => /assumed|estimate/i.test(a)),
    missingData: input.dataSourceMissing.slice(),
    confidence,
    confidenceReason: reason,
    whatWouldChange,
  };
}

function buildImpact(input: SupervisorInput): ImpactStatement[] {
  const out: ImpactStatement[] = [
    { dimension: "profit_margin", label: "Profit / margin", statement: input.impact.marginPricing, relevant: nonDefault(input.impact.marginPricing) },
    { dimension: "cash", label: "Cash", statement: input.impact.financeCash, relevant: nonDefault(input.impact.financeCash) },
    { dimension: "owner_workload", label: "Owner workload", statement: input.ownerWorkloadOffload, relevant: nonDefault(input.ownerWorkloadOffload) },
    { dimension: "staff_capacity", label: "Staff / capacity", statement: nonDefault(input.impact.equipmentCapacity) ? input.impact.equipmentCapacity : input.impact.staffWorkload, relevant: nonDefault(input.impact.equipmentCapacity) || nonDefault(input.impact.staffWorkload) },
    { dimension: "customer_quality", label: "Customer / quality", statement: input.impact.customerQuality, relevant: nonDefault(input.impact.customerQuality) },
  ];
  return out;
}

function buildCadence(input: SupervisorInput, status: OwnerActionStatus): OperatingCadence {
  const risky = HIGH_RISK_FINANCIAL.has(input.dominantConstraint) || input.dominantConstraint === "capacity_feasibility";
  const stopLoss = status === "blocked"
    ? "Do not act — this is blocked until the gate clears."
    : risky
      ? (input.growthBlockedBy.length > 0
          ? `Stop and reassess if any of these worsen: ${input.growthBlockedBy.slice(0, 2).join(", ")}.`
          : "Stop and reassess if cash, margin, or capacity moves the wrong way.")
      : "—";
  return {
    now: status === "need_more_data"
      ? "Enter the missing critical data before acting."
      : input.nextBestAction,
    today: input.ownerOffload && nonDefault(input.ownerOffload) ? `Brief your manager/staff: ${input.ownerOffload}` : "Set up the proof and owner-decision for the next action.",
    thisWeek: nonDefault(input.plan7Day) ? input.plan7Day : "Stabilise the dominant constraint and verify the proof.",
    reassessmentTrigger: input.reassessmentTriggers[0] ?? "After the action's proof is accepted.",
    kpiWatch: input.successMetrics[0] ?? "The metric behind the dominant constraint.",
    stopLoss,
    nextReview: input.reassessmentTriggers[0] ?? "After proof is accepted.",
  };
}

function buildPriorities(input: SupervisorInput, emergency: boolean, status: OwnerActionStatus): SupervisorPriority[] {
  const out: SupervisorPriority[] = [];
  if (status === "need_more_data") {
    out.push({ severity: "critical", whatIsWrong: "Key business data is missing, so OpsIQ can't fully trust the diagnosis.", doNext: `Add real records for ${input.dataSourceMissing.slice(0, 2).join(", ") || "the missing critical inputs"}.` });
  }
  out.push({ severity: emergency ? "critical" : "high", whatIsWrong: `Biggest constraint: ${input.topPriorityLabel}.`, doNext: input.nextBestAction });
  if (input.doNotDo.length > 0) {
    out.push({ severity: "high", whatIsWrong: `Stop: ${input.doNotDo[0]}`, doNext: "Hold this until the constraint above clears." });
  }
  if (emergency && input.redDomains.some((d) => /cash|margin|finance|working/i.test(d))) {
    out.push({ severity: "critical", whatIsWrong: "A cash / margin domain is in the red.", doNext: input.nextBestAction });
  }
  const cap = emergency ? 5 : 3;
  return out.slice(0, cap);
}

export function buildSupervisorSummary(input: SupervisorInput): SupervisorSummary {
  if (!input.found) {
    return {
      found: false, emergency: false,
      mainIssue: "No business data yet.", whyItMatters: "OpsIQ needs your business data before it can supervise anything.",
      doNow: "Add your business data to begin.", doNotDo: [], ownerDecisionRequired: null,
      delegateToStaff: [], opsiqPreparedWork: [], proofNeeded: [],
      ledger: { knownFacts: [], assumptions: [], assumptionsAreMarked: true, missingData: [], confidence: "none", confidenceReason: "No data supplied.", whatWouldChange: "Supplying business data." },
      confidence: "none", actionStatus: "need_more_data", canProceed: false, impact: [],
      cadence: { now: "Add business data.", today: "—", thisWeek: "—", reassessmentTrigger: "—", kpiWatch: "—", stopLoss: "—", nextReview: "—" },
      topPriorities: [],
    };
  }

  const emergency = EMERGENCY_CONSTRAINTS.has(input.dominantConstraint) || input.unsafeCount > 0;
  const { confidence, reason } = deriveConfidence(input);
  const actionStatus = deriveActionStatus(input, confidence);
  const ledger = buildLedger(input, confidence, reason);
  const impact = buildImpact(input);
  const cadence = buildCadence(input, actionStatus);
  const topPriorities = buildPriorities(input, emergency, actionStatus);

  return {
    found: true,
    emergency,
    mainIssue: `${input.topPriorityLabel}${nonDefault(input.rootCause) ? ` — root cause: ${input.rootCause}` : ""}`,
    whyItMatters: CONSTRAINT_WHY[input.dominantConstraint] ?? "This is the single thing most holding the business back.",
    doNow: actionStatus === "need_more_data" ? "Enter the missing critical data before acting." : input.nextBestAction,
    doNotDo: input.doNotDo,
    ownerDecisionRequired: input.ownerApprovalRequired || actionStatus === "owner_decision_required"
      ? `Owner approval required before: ${input.nextBestAction}`
      : null,
    delegateToStaff: input.delegatedWork,
    opsiqPreparedWork: input.opsiqPreparedWork,
    proofNeeded: input.proofRequired,
    ledger,
    confidence,
    actionStatus,
    canProceed: actionStatus === "proceed" || actionStatus === "cautious_proceed",
    impact,
    cadence,
    topPriorities,
  };
}

export { CONF_ORDER };
