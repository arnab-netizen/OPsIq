/**
 * Constraint / Bottleneck Engine (depth pass).
 *
 * Answers the owner's real question: "What is limiting this business MOST right now?"
 * Theory-of-Constraints style — surface the single binding constraint, not a flood.
 *
 * PURE and deterministic. It consumes signals that the Owner Now View already assembles
 * from live, workspace-scoped DB state (cash/finance survival, capacity, staff/owner
 * workload, complaints/rework, churn, supplier, overdue proof) plus a few optional
 * event signals (major client loss, delivery delay, discount/low-margin, startup
 * validation). It fabricates nothing: when the data needed to judge is absent, it
 * returns DATA_INSUFFICIENT with the exact missing data rather than a guess.
 */

export type ConstraintType =
  | "DEMAND" | "CAPACITY" | "CASH" | "STAFF" | "OWNER" | "MANAGER" | "QUALITY"
  | "DELIVERY" | "PRICING" | "CUSTOMER_RETENTION" | "B2B_ACCOUNT" | "EQUIPMENT"
  | "COMPLIANCE_OR_LOCAL_VERIFICATION" | "STARTUP_VALIDATION" | "DATA_INSUFFICIENT";

export type ConstraintSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type ConstraintConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";
export type ConstraintRisk = "LOW" | "MEDIUM" | "HIGH";

export interface ConstraintSignals {
  workspaceId: string;
  /** Cash/finance survival state (e.g. SAFE|WATCH|AT_RISK|CRITICAL|INSOLVENT_RISK). */
  cashState?: string | null;
  financeState?: string | null;
  /** Owner workload budget signals. */
  ownerBottleneckItems?: number;
  ownerDecisionsRequired?: number;
  ownerReviewsRequired?: number;
  ownerOverloaded?: boolean;
  /** Staff execution signals. */
  staffOverloaded?: boolean;
  overdueProofCount?: number;
  weakProofCount?: number;
  /** Capacity / equipment. */
  capacityUtilizationPct?: number; // 0..100
  capacityGrowthSafe?: boolean;
  supplierInventoryRiskScore?: number; // 0..1
  /** Quality. */
  complaintsCount?: number;
  reworkCount?: number;
  /** Retention / accounts. */
  churnRiskScore?: number; // 0..1
  majorClientLoss?: boolean;
  lowMarginB2BAccount?: boolean;
  /** Pricing / margin. */
  marginSafe?: boolean | null;
  discountLeak?: boolean;
  /** Delivery. */
  deliveryDelaySignal?: boolean;
  /** Startup. */
  startupUnvalidated?: boolean;
  localVerificationRequired?: boolean;
  /** Named missing data (from the guidance context), smallest-useful-first. */
  missingCriticalData?: string[];
  evaluatedAt: string; // ISO — passed in (pure fn, no clock)
}

export interface ConstraintFinding {
  workspaceId: string;
  constraintType: ConstraintType;
  domain: string;
  severity: ConstraintSeverity;
  confidence: ConstraintConfidence;
  evidence: string[];
  missingData: string[];
  businessImpact: string;
  ownerExplanation: string;
  recommendedAction: string;
  ownerApprovalRequired: boolean;
  riskLevel: ConstraintRisk;
  cashImpact: string;
  operationalBurden: string;
  successMetric: string;
  stopLoss: string;
  reassessmentTrigger: string;
  /** Internal deterministic ranking score (higher = more binding). */
  bindingScore: number;
  evaluatedAt: string;
}

export interface ConstraintAnalysis {
  topConstraint: ConstraintFinding | null;
  constraints: ConstraintFinding[];
  evaluatedAt: string;
}

const SEVERITY_WEIGHT: Record<ConstraintSeverity, number> = { CRITICAL: 1000, HIGH: 100, MEDIUM: 10, LOW: 1 };
// Tie-break priority: survival first, then owner leverage, then quality/capacity/delivery, etc.
const TYPE_PRIORITY: Record<ConstraintType, number> = {
  CASH: 14, OWNER: 13, QUALITY: 12, CAPACITY: 11, DELIVERY: 10, PRICING: 9, STAFF: 8,
  CUSTOMER_RETENTION: 7, B2B_ACCOUNT: 6, EQUIPMENT: 5, MANAGER: 4, DEMAND: 3,
  COMPLIANCE_OR_LOCAL_VERIFICATION: 2, STARTUP_VALIDATION: 1, DATA_INSUFFICIENT: 0,
};

const UNSAFE_CASH = new Set(["AT_RISK", "CRITICAL", "INSOLVENT_RISK"]);

function score(severity: ConstraintSeverity, type: ConstraintType): number {
  return SEVERITY_WEIGHT[severity] + TYPE_PRIORITY[type];
}

/** Identify constraints from live signals and rank the single binding one. Pure. */
export function identifyConstraints(s: ConstraintSignals): ConstraintAnalysis {
  const at = s.evaluatedAt;
  const ws = s.workspaceId;
  const out: ConstraintFinding[] = [];
  const F = (f: Omit<ConstraintFinding, "workspaceId" | "evaluatedAt" | "bindingScore">): void => {
    out.push({ ...f, workspaceId: ws, evaluatedAt: at, bindingScore: score(f.severity, f.constraintType) });
  };

  // CASH — survival first.
  if (s.cashState && UNSAFE_CASH.has(s.cashState)) {
    const sev: ConstraintSeverity = s.cashState === "INSOLVENT_RISK" || s.cashState === "CRITICAL" ? "CRITICAL" : "HIGH";
    F({
      constraintType: "CASH", domain: "finance", severity: sev, confidence: "HIGH",
      evidence: [`cash/finance survival state = ${s.cashState}`],
      missingData: [], businessImpact: "Cash can run out before other fixes matter — this is the binding survival constraint.",
      ownerExplanation: `Cash is ${s.cashState}. Nothing else should compete for attention until cash cover is restored.`,
      recommendedAction: "Recover the fastest cash (chase overdue receivables), pause discretionary spend, and defer any capital outlay.",
      ownerApprovalRequired: true, riskLevel: "HIGH",
      cashImpact: "Directly protects runway — the highest-value action available now.",
      operationalBurden: "Low-moderate — collections + spend freeze.",
      successMetric: "Cash cover / survival state moves back to WATCH or SAFE within the collection cycle.",
      stopLoss: "If a customer disputes quality during collection, pause that account and route to owner review.",
      reassessmentTrigger: "Re-evaluate the constraint once the cash state improves or a new shock occurs.",
    });
  }

  // OWNER — too many owner-only pending decisions / overdue owner items.
  const ownerPending = (s.ownerDecisionsRequired ?? 0) + (s.ownerReviewsRequired ?? 0);
  if (s.ownerOverloaded || (s.ownerBottleneckItems ?? 0) > 0 || ownerPending >= 5) {
    const sev: ConstraintSeverity = ownerPending >= 10 || (s.ownerBottleneckItems ?? 0) >= 2 ? "HIGH" : "MEDIUM";
    F({
      constraintType: "OWNER", domain: "owner_leverage", severity: sev, confidence: "HIGH",
      evidence: [
        s.ownerOverloaded ? "owner workload over sustainable limit" : "",
        (s.ownerBottleneckItems ?? 0) > 0 ? `${s.ownerBottleneckItems} owner-bottleneck item(s)` : "",
        ownerPending > 0 ? `${ownerPending} owner-only decisions/reviews pending` : "",
      ].filter(Boolean),
      missingData: [],
      businessImpact: "Work is waiting on the owner — throughput and staff progress are capped by owner availability.",
      ownerExplanation: "You are the bottleneck: too much is waiting on your decision/approval. This slows the whole business, not one person.",
      recommendedAction: "Delegate or pre-authorize the routine approvals; keep only high-value/irreversible decisions on the owner queue.",
      ownerApprovalRequired: false, riskLevel: "LOW",
      cashImpact: "Indirect — faster decisions unblock revenue-producing work.",
      operationalBurden: "Low — set delegation rules once.",
      successMetric: "Owner-only pending decisions drop below 5 and no owner item is overdue.",
      stopLoss: "If delegated approvals produce a quality/finance miss, tighten the rule and retrain before re-delegating.",
      reassessmentTrigger: "Re-evaluate if owner pending count rises again or a delegated decision fails.",
    });
  }

  // QUALITY — complaints / rework.
  const complaints = s.complaintsCount ?? 0;
  const rework = s.reworkCount ?? 0;
  if (complaints >= 3 || rework >= 3) {
    const sev: ConstraintSeverity = complaints >= 10 || rework >= 10 ? "HIGH" : "MEDIUM";
    F({
      constraintType: "QUALITY", domain: "quality", severity: sev, confidence: "HIGH",
      evidence: [complaints ? `${complaints} complaints` : "", rework ? `${rework} rework/redo jobs` : ""].filter(Boolean),
      missingData: [],
      businessImpact: "Poor quality drives complaints, rework cost, and churn — growth would amplify the damage.",
      ownerExplanation: "Quality is the current limit: complaints/rework are high, so acquiring more customers now would multiply the problem.",
      recommendedAction: "Find the single most-repeated failure and fix that SOP step; re-check on the next 10 jobs before scaling.",
      ownerApprovalRequired: false, riskLevel: "LOW",
      cashImpact: "Reduces rework cost and refund/complaint-driven revenue loss.",
      operationalBurden: "Moderate — SOP fix + retraining on one step.",
      successMetric: "First-time-right rises and complaint/rework counts fall on the next jobs.",
      stopLoss: "If the same failure recurs after the fix, escalate to a full process redesign.",
      reassessmentTrigger: "Re-evaluate if complaints/rework stay high after the SOP fix.",
    });
  }

  // CAPACITY / EQUIPMENT.
  const util = s.capacityUtilizationPct ?? 0;
  if (util >= 85 || s.capacityGrowthSafe === false) {
    const sev: ConstraintSeverity = util >= 95 ? "HIGH" : "MEDIUM";
    F({
      constraintType: "CAPACITY", domain: "operations", severity: sev, confidence: "HIGH",
      evidence: [`capacity utilization ${Math.round(util)}%`, s.capacityGrowthSafe === false ? "growth-unsafe capacity" : ""].filter(Boolean),
      missingData: [],
      businessImpact: "Throughput is capped — accepting more volume would break delivery and quality.",
      ownerExplanation: "Capacity is the limit: the bottleneck resource is near saturation, so more work would slip delivery.",
      recommendedAction: "Cap intake at safe capacity and schedule the bottleneck resource before accepting new volume.",
      ownerApprovalRequired: false, riskLevel: "MEDIUM",
      cashImpact: "Protects delivery reliability; adding capacity is a capital decision (owner-gated).",
      operationalBurden: "Moderate — scheduling / capacity planning.",
      successMetric: "Intake stays within the bottleneck's safe throughput and backlog does not grow.",
      stopLoss: "If backlog grows, pause intake and add capacity before resuming.",
      reassessmentTrigger: "Re-evaluate if utilization crosses 95% or backlog rises.",
    });
  } else if ((s.supplierInventoryRiskScore ?? 0) >= 0.5) {
    F({
      constraintType: "EQUIPMENT", domain: "operations", severity: (s.supplierInventoryRiskScore ?? 0) >= 0.75 ? "HIGH" : "MEDIUM",
      confidence: "MEDIUM", evidence: [`supplier/inventory risk ${Math.round((s.supplierInventoryRiskScore ?? 0) * 100)}%`],
      missingData: [], businessImpact: "A stockout/equipment gap would break delivery.",
      ownerExplanation: "Supply/equipment reliability is the current risk to keeping delivery running.",
      recommendedAction: "Reorder at-risk items to the order-up-to level and confirm supplier lead times before taking new volume.",
      ownerApprovalRequired: false, riskLevel: "MEDIUM", cashImpact: "Working-capital tied in inventory; avoids lost revenue from stockout.",
      operationalBurden: "Low — reorder + confirm supply.", successMetric: "Stock back above reorder point and supply confirmed.",
      stopLoss: "If a supplier cannot confirm supply, pause growth commitments.", reassessmentTrigger: "Re-evaluate on the next supplier/inventory snapshot.",
    });
  }

  // DELIVERY (only when an explicit delivery-delay signal exists).
  if (s.deliveryDelaySignal) {
    F({
      constraintType: "DELIVERY", domain: "operations", severity: "MEDIUM", confidence: "MEDIUM",
      evidence: ["delivery delay/runner-failure signal"], missingData: [],
      businessImpact: "Late delivery drives complaints and repeat-customer loss.",
      ownerExplanation: "Delivery is the current limit: jobs are done but not delivered on time, which shows up as complaints and churn.",
      recommendedAction: "Fix the slowest delivery step (routing/runner scheduling) and set a same-day cutoff before adding volume.",
      ownerApprovalRequired: false, riskLevel: "MEDIUM", cashImpact: "Protects repeat revenue by keeping delivery promises.",
      operationalBurden: "Moderate — routing/scheduling change.", successMetric: "On-time delivery rate rises and delivery-linked complaints fall.",
      stopLoss: "If delays persist after the fix, cap intake to the delivery capacity.", reassessmentTrigger: "Re-evaluate if delivery complaints continue.",
    });
  }

  // PRICING / MARGIN.
  if (s.marginSafe === false || s.discountLeak || s.lowMarginB2BAccount) {
    F({
      constraintType: "PRICING", domain: "profitability", severity: s.marginSafe === false ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      evidence: [s.marginSafe === false ? "margin below safe level" : "", s.discountLeak ? "discount leakage" : "", s.lowMarginB2BAccount ? "low-margin B2B account" : ""].filter(Boolean),
      missingData: s.marginSafe == null ? ["current gross margin by service/segment"] : [],
      businessImpact: "Work is being done at or below viable margin — effort is not converting to profit.",
      ownerExplanation: "Pricing/margin is the limit: you are busy but thin-margin work is eating the profit.",
      recommendedAction: "Identify the lowest-margin line/account and reprice it or stop discounting it this month.",
      ownerApprovalRequired: true, riskLevel: "MEDIUM", cashImpact: "Directly improves profit per job.",
      operationalBurden: "Low — pricing change on one line.", successMetric: "The loss-making line is repriced/paused and blended margin recovers.",
      stopLoss: "If repricing loses key customers, revisit cost structure instead of price.", reassessmentTrigger: "Re-evaluate margin after the pricing change lands.",
    });
  }

  // STAFF execution.
  if (s.staffOverloaded || (s.overdueProofCount ?? 0) >= 3 || (s.weakProofCount ?? 0) >= 2) {
    F({
      constraintType: "STAFF", domain: "execution", severity: (s.overdueProofCount ?? 0) >= 8 ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      evidence: [s.staffOverloaded ? "staff over sustainable load" : "", (s.overdueProofCount ?? 0) >= 3 ? `${s.overdueProofCount} overdue proofs` : "", (s.weakProofCount ?? 0) >= 2 ? `${s.weakProofCount} weak proofs` : ""].filter(Boolean),
      missingData: [], businessImpact: "Staff execution/verification is lagging — work is not being proven complete, blocking the learning loop.",
      ownerExplanation: "Staff execution is the limit: overdue or weak proof means work either isn't finished or isn't verifiable.",
      recommendedAction: "Re-assign or reduce load on the lagging staff and require proper proof before new assignments.",
      ownerApprovalRequired: false, riskLevel: "LOW", cashImpact: "Indirect — verified completion protects quality and repeat revenue.",
      operationalBurden: "Moderate — reassignment/retraining.", successMetric: "Overdue/weak-proof counts fall and completion is verifiable.",
      stopLoss: "If reassignment fails quality checks, retrain before re-delegating.", reassessmentTrigger: "Re-evaluate if overdue/weak proof persists.",
    });
  }

  // CUSTOMER_RETENTION.
  if ((s.churnRiskScore ?? 0) >= 0.4) {
    F({
      constraintType: "CUSTOMER_RETENTION", domain: "customer", severity: (s.churnRiskScore ?? 0) >= 0.6 ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      evidence: [`churn risk ${Math.round((s.churnRiskScore ?? 0) * 100)}%`], missingData: [],
      businessImpact: "Repeat business is weak — acquisition spend leaks out through the back door.",
      ownerExplanation: "Retention is the limit: customers are not coming back, so growth spend is wasted until this is fixed.",
      recommendedAction: "Run the approved win-back to lapsed customers with a specific reason to return, before scaling acquisition.",
      ownerApprovalRequired: false, riskLevel: "LOW", cashImpact: "Improves lifetime value and lowers acquisition waste.",
      operationalBurden: "Low — targeted win-back message.", successMetric: "A measurable share of lapsed customers rebook within 14 days.",
      stopLoss: "If win-back response is below 5%, change the message/offer before scaling.", reassessmentTrigger: "Re-evaluate retention after the win-back cycle.",
    });
  }

  // B2B_ACCOUNT.
  if (s.majorClientLoss) {
    F({
      constraintType: "B2B_ACCOUNT", domain: "customer", severity: "HIGH", confidence: "HIGH",
      evidence: ["major B2B client loss event"], missingData: [],
      businessImpact: "A major account loss removes concentrated revenue — the near-term constraint is replacing it safely.",
      ownerExplanation: "A major client loss is the current shock: revenue concentration just dropped and must be rebuilt without chasing bad-margin work.",
      recommendedAction: "Prioritize replacing the lost volume with margin-safe accounts; do NOT backfill with below-floor discounted work.",
      ownerApprovalRequired: true, riskLevel: "MEDIUM", cashImpact: "Direct revenue loss; protect margin while replacing it.",
      operationalBurden: "Moderate — sales/account effort.", successMetric: "Lost volume is replaced at or above the margin floor within the recovery window.",
      stopLoss: "Do not accept replacement work below the margin floor to fill capacity.", reassessmentTrigger: "Re-evaluate as replacement accounts are signed.",
    });
  }

  // STARTUP_VALIDATION / COMPLIANCE.
  if (s.startupUnvalidated) {
    F({
      constraintType: "STARTUP_VALIDATION", domain: "startup", severity: "MEDIUM", confidence: "HIGH",
      evidence: ["startup idea not yet validated"], missingData: ["real demand + willingness-to-pay evidence"],
      businessImpact: "Spending to launch before validation risks the capital on an unproven demand assumption.",
      ownerExplanation: "The limit is validation, not launch: prove demand and willingness to pay before committing capital.",
      recommendedAction: "Run the validation experiment (talk to real target customers, confirm they will pay) before any launch spend.",
      ownerApprovalRequired: true, riskLevel: "HIGH", cashImpact: "Protects startup capital from an unvalidated bet.",
      operationalBurden: "Low — validation experiment.", successMetric: "Documented paying-intent from real target customers.",
      stopLoss: "If validation fails, pivot or drop the idea — do not launch.", reassessmentTrigger: "Re-evaluate after the validation experiment result.",
    });
  } else if (s.localVerificationRequired) {
    F({
      constraintType: "COMPLIANCE_OR_LOCAL_VERIFICATION", domain: "compliance", severity: "MEDIUM", confidence: "NEEDS_DATA",
      evidence: ["local compliance/licensing not verified"], missingData: ["verified local licensing/tax/zoning/insurance requirements"],
      businessImpact: "Proceeding without verified local requirements risks fines or forced shutdown.",
      ownerExplanation: "The limit is local verification: local rules are unconfirmed and must be checked before committing.",
      recommendedAction: "Verify local licensing/tax/zoning/insurance with an authoritative local source before proceeding.",
      ownerApprovalRequired: true, riskLevel: "HIGH", cashImpact: "Avoids fines/rework from non-compliance.",
      operationalBurden: "Low — external verification.", successMetric: "Local requirements confirmed by an authoritative source.",
      stopLoss: "Do not commit spend until local requirements are confirmed.", reassessmentTrigger: "Re-evaluate once local verification is obtained.",
    });
  }

  // DATA_INSUFFICIENT — nothing detectable AND key data missing.
  if (out.length === 0) {
    const missing = s.missingCriticalData && s.missingCriticalData.length > 0
      ? s.missingCriticalData
      : ["latest cash position", "latest margin figures", "latest customer + complaint counts"];
    F({
      constraintType: "DATA_INSUFFICIENT", domain: "data", severity: "LOW", confidence: "NEEDS_DATA",
      evidence: ["no binding constraint signal present"], missingData: missing,
      businessImpact: "The current constraint cannot be identified without more data.",
      ownerExplanation: "No clear bottleneck signal yet — OpsIQ needs the listed data before it can name the constraint.",
      recommendedAction: `Provide: ${missing.join("; ")}.`,
      ownerApprovalRequired: false, riskLevel: "LOW", cashImpact: "None until data is available.",
      operationalBurden: "Low — enter the missing data.", successMetric: "The listed data is available and a constraint can be evaluated.",
      stopLoss: "n/a", reassessmentTrigger: "Re-evaluate once the missing data is supplied.",
    });
  }

  out.sort((a, b) => b.bindingScore - a.bindingScore);
  return { topConstraint: out[0] ?? null, constraints: out, evaluatedAt: at };
}

/** Constraint types that make growth/expansion unsafe until relieved (owner-gated). */
export const GROWTH_BLOCKING_CONSTRAINTS: ReadonlySet<ConstraintType> = new Set<ConstraintType>([
  "CASH", "CAPACITY", "QUALITY", "OWNER", "EQUIPMENT", "DELIVERY",
]);
