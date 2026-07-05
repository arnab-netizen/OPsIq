/**
 * Profit-Leak Radar (depth pass).
 *
 * Answers: "Where is this business losing money, margin, cash, retention, or owner
 * leverage right now?" — and surfaces the single highest-value leak (not a flood),
 * with a specific corrective action, owner-approval where the fix touches price/cash,
 * a success metric, a stop-loss, and a reassessment trigger.
 *
 * PURE and deterministic. It consumes signals the Owner Now View already assembles from
 * live, workspace-scoped DB state (discount amount, revenue, margin, complaints, rework,
 * churn inputs, overdue/weak proof, capacity, owner workload) plus a few optional event
 * signals. It fabricates NOTHING: it never invents margin or ROI. Where a real figure
 * exists (e.g. the period discount amount) it reports that figure and marks the
 * *recoverable* portion as owner judgment; where margin is unknown it returns NEEDS_DATA.
 */

import type { ConstraintType } from "@/domain/owner-mode/constraint-engine";

export type ProfitLeakType =
  | "DISCOUNT_LEAK" | "LOW_MARGIN_B2B" | "REPEAT_CUSTOMER_DECLINE" | "COMPLAINT_REVENUE_RISK"
  | "STAFF_PRODUCTIVITY_DROP" | "DELIVERY_DELAY_COST" | "REWORK_REDO_COST" | "CAPACITY_UNDERUSE"
  | "EQUIPMENT_UNDERUSE" | "OWNER_BOTTLENECK_COST" | "CASH_RISK_GROWTH" | "WEAK_PROOF_REWORK_RISK"
  | "PRICING_UNDERCHARGE" | "CUSTOMER_CHURN_RISK" | "DATA_INSUFFICIENT";

export type LeakSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type LeakConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";
export type LeakRisk = "LOW" | "MEDIUM" | "HIGH";
export type ImpactTier = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";

export interface EstimatedImpact {
  tier: ImpactTier;
  /** Lower/upper bound in currency units when a REAL figure backs it; else undefined. */
  rangeLow?: number;
  rangeHigh?: number;
  /** Honest note — what the number is and is not (never a guaranteed saving). */
  note: string;
}

export interface ProfitLeakSignals {
  workspaceId: string;
  currency?: string;
  revenue?: number | null;
  discountAmount?: number | null;
  discountLeak?: boolean;
  marginPct?: number | null; // 0..1
  marginSafe?: boolean | null;
  lowMarginB2BAccount?: boolean;
  b2bRevenue?: number | null;
  newCustomers?: number | null;
  repeatCustomers?: number | null;
  complaintsCount?: number;
  reworkCount?: number;
  overdueProofCount?: number;
  weakProofCount?: number;
  staffProductivity?: number | null;
  deliveryDelaySignal?: boolean;
  capacityUtilizationPct?: number; // 0..100
  ownerBottleneckItems?: number;
  ownerReviewsRequired?: number;
  ownerDecisionsRequired?: number;
  cashRiskGrowth?: boolean;
  /**
   * Dispute-derived counts (from governed proof disputes) — a disputed accepted proof is a real,
   * attributed rework/complaint/weak-proof signal. No revenue/churn figure is derived from these.
   */
  disputeReworkCount?: number;
  disputeComplaintCount?: number;
  disputeWeakProofCount?: number;
  /** The current binding constraint, to link a leak to it. */
  currentConstraint?: ConstraintType | null;
  missingCriticalData?: string[];
  evaluatedAt: string; // ISO
}

export interface ProfitLeakFinding {
  workspaceId: string;
  leakType: ProfitLeakType;
  domain: string;
  severity: LeakSeverity;
  confidence: LeakConfidence;
  evidence: string[];
  missingData: string[];
  estimatedImpact: EstimatedImpact;
  cashImpact: string;
  marginImpact: string;
  ownerExplanation: string;
  recommendedAction: string;
  ownerApprovalRequired: boolean;
  riskLevel: LeakRisk;
  operationalBurden: string;
  successMetric: string;
  stopLoss: string;
  reassessmentTrigger: string;
  relatedConstraint: ConstraintType | null;
  leakScore: number;
  evaluatedAt: string;
}

export interface ProfitLeakAnalysis {
  topLeak: ProfitLeakFinding | null;
  leaks: ProfitLeakFinding[];
  evaluatedAt: string;
}

const SEVERITY_WEIGHT: Record<LeakSeverity, number> = { CRITICAL: 1000, HIGH: 100, MEDIUM: 10, LOW: 1 };
const IMPACT_WEIGHT: Record<ImpactTier, number> = { HIGH: 30, MEDIUM: 15, LOW: 5, NEEDS_DATA: 0 };
// Direct cash/margin leaks rank above indirect ones on ties.
const TYPE_PRIORITY: Record<ProfitLeakType, number> = {
  CASH_RISK_GROWTH: 15, DISCOUNT_LEAK: 14, PRICING_UNDERCHARGE: 13, LOW_MARGIN_B2B: 12,
  COMPLAINT_REVENUE_RISK: 11, REWORK_REDO_COST: 10, REPEAT_CUSTOMER_DECLINE: 9, CUSTOMER_CHURN_RISK: 8,
  DELIVERY_DELAY_COST: 7, STAFF_PRODUCTIVITY_DROP: 6, WEAK_PROOF_REWORK_RISK: 5,
  OWNER_BOTTLENECK_COST: 4, CAPACITY_UNDERUSE: 3, EQUIPMENT_UNDERUSE: 2, DATA_INSUFFICIENT: 0,
};

function leakScore(sev: LeakSeverity, tier: ImpactTier, type: ProfitLeakType): number {
  return SEVERITY_WEIGHT[sev] + IMPACT_WEIGHT[tier] + TYPE_PRIORITY[type];
}

/** Identify profit leaks from live signals and rank the highest-value one. Pure. */
export function identifyProfitLeaks(s: ProfitLeakSignals): ProfitLeakAnalysis {
  const at = s.evaluatedAt;
  const ws = s.workspaceId;
  const cur = s.currency ?? "";
  const out: ProfitLeakFinding[] = [];
  const F = (f: Omit<ProfitLeakFinding, "workspaceId" | "evaluatedAt" | "leakScore" | "relatedConstraint"> & { relatedConstraint?: ConstraintType | null }): void => {
    out.push({
      ...f, workspaceId: ws, evaluatedAt: at,
      relatedConstraint: f.relatedConstraint ?? null,
      leakScore: leakScore(f.severity, f.estimatedImpact.tier, f.leakType),
    });
  };

  // CASH_RISK_GROWTH — a cash-risky/high-capital growth move in flight. Must be owner-gated.
  if (s.cashRiskGrowth) {
    F({
      leakType: "CASH_RISK_GROWTH", domain: "cash", severity: "HIGH", confidence: "HIGH",
      evidence: ["a cash-risk / high-capital growth action is pending"], missingData: [],
      estimatedImpact: { tier: "HIGH", note: "Potential runway loss if the move underperforms — magnitude depends on the committed capital." },
      cashImpact: "Direct runway exposure — this is the most dangerous leak when it fires.",
      marginImpact: "Indirect — a cash crunch forces discounting/fire-sales later.",
      ownerExplanation: "A growth move is putting cash at risk. Do not commit until it is owner-approved and runway-safe.",
      recommendedAction: "Hold the move; require owner approval and a runway check before any capital is committed.",
      ownerApprovalRequired: true, riskLevel: "HIGH",
      operationalBurden: "Low — owner decision.",
      successMetric: "The move proceeds only after explicit owner approval with runway confirmed safe.",
      stopLoss: "If runway would drop below the safe threshold, do not proceed.",
      reassessmentTrigger: "Re-evaluate if cash state worsens or the move's early results underperform.",
      relatedConstraint: s.currentConstraint === "CASH" ? "CASH" : null,
    });
  }

  // DISCOUNT_LEAK — real discount amount is data; recoverable portion is owner judgment.
  const discount = s.discountAmount ?? null;
  const rev = s.revenue ?? null;
  if (s.discountLeak || (discount != null && rev != null && rev > 0 && discount / rev >= 0.05)) {
    const ratio = discount != null && rev != null && rev > 0 ? discount / rev : null;
    const marginKnown = s.marginPct != null;
    const tier: ImpactTier = discount == null ? (marginKnown ? "MEDIUM" : "NEEDS_DATA")
      : ratio != null && ratio >= 0.15 ? "HIGH" : ratio != null && ratio >= 0.08 ? "MEDIUM" : "LOW";
    F({
      leakType: "DISCOUNT_LEAK", domain: "pricing", severity: tier === "HIGH" ? "HIGH" : "MEDIUM",
      confidence: marginKnown ? "MEDIUM" : "LOW",
      evidence: [discount != null ? `discounts = ${discount} ${cur}${ratio != null ? ` (${Math.round(ratio * 100)}% of revenue)` : ""}` : "risky discounting signal"].filter(Boolean),
      missingData: marginKnown ? [] : ["gross margin % (to size the true profit lost to discounts)"],
      estimatedImpact: discount != null
        ? { tier, rangeLow: 0, rangeHigh: discount, note: `Up to ${discount} ${cur} was discounted this period; the RECOVERABLE portion depends on price elasticity (owner judgment) — not a guaranteed saving.` }
        : { tier, note: "Discounting flagged; size unknown without the discount amount and margin." },
      cashImpact: "Discounts are cash given away at the point of sale.",
      marginImpact: marginKnown ? "Directly compresses margin on discounted work." : "Unknown until margin is provided.",
      ownerExplanation: "Discounting is leaking margin. Tighten who can discount and by how much before it compounds.",
      recommendedAction: "Cap discretionary discounts (owner-approval above a threshold) and reprice the most-discounted line.",
      ownerApprovalRequired: true, riskLevel: "MEDIUM",
      operationalBurden: "Low — set a discount policy.",
      successMetric: "Discount-to-revenue ratio falls next period without losing key volume.",
      stopLoss: "If tightening discounts loses major accounts, revisit price/cost instead of a blanket cap.",
      reassessmentTrigger: "Re-evaluate discount ratio next period.",
      relatedConstraint: s.currentConstraint === "PRICING" ? "PRICING" : null,
    });
  }

  // LOW_MARGIN_B2B — needs margin to size honestly.
  if (s.lowMarginB2BAccount) {
    const marginKnown = s.marginPct != null;
    F({
      leakType: "LOW_MARGIN_B2B", domain: "profitability", severity: "MEDIUM", confidence: marginKnown ? "MEDIUM" : "NEEDS_DATA",
      evidence: ["low-margin B2B account consuming capacity"], missingData: marginKnown ? [] : ["gross margin % for the B2B account"],
      estimatedImpact: marginKnown ? { tier: "MEDIUM", note: "Low-margin volume ties up capacity that higher-margin work could use." } : { tier: "NEEDS_DATA", note: "Provide the account's margin to size the leak." },
      cashImpact: "Capacity spent on thin-margin work displaces better cash conversion.",
      marginImpact: marginKnown ? "Below-target margin on a capacity-consuming account." : "Unknown without account margin.",
      ownerExplanation: "A big B2B account may be busy but barely profitable — it can crowd out better work.",
      recommendedAction: "Reprice the account to the margin floor, or re-allocate its capacity to higher-margin demand.",
      ownerApprovalRequired: true, riskLevel: "MEDIUM", operationalBurden: "Moderate — renegotiation.",
      successMetric: "The account clears the margin floor or its capacity is redeployed to higher-margin work.",
      stopLoss: "If renegotiation risks losing the account, model the capacity freed vs revenue lost before deciding.",
      reassessmentTrigger: "Re-evaluate after the renegotiation or reallocation.",
      relatedConstraint: s.currentConstraint === "PRICING" || s.currentConstraint === "CAPACITY" ? s.currentConstraint : null,
    });
  }

  // COMPLAINT_REVENUE_RISK.
  const complaints = s.complaintsCount ?? 0;
  if (complaints >= 3) {
    F({
      leakType: "COMPLAINT_REVENUE_RISK", domain: "quality", severity: complaints >= 10 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      evidence: [`${complaints} complaints this period`], missingData: [],
      estimatedImpact: { tier: complaints >= 10 ? "HIGH" : "MEDIUM", note: "Complaints predict refunds, rework, and lost repeat revenue — magnitude scales with complaint volume." },
      cashImpact: "Refunds and lost repeat orders reduce cash.",
      marginImpact: "Rework/refunds erode margin on affected jobs.",
      ownerExplanation: "Complaints are leaking future revenue: unhappy customers do not return and warn others.",
      recommendedAction: "Fix the single most-repeated complaint cause in the process and re-check on the next 10 jobs.",
      ownerApprovalRequired: false, riskLevel: "LOW", operationalBurden: "Moderate — SOP fix.",
      successMetric: "Complaint count falls next period and repeat rate holds.",
      stopLoss: "If complaints persist after the fix, escalate to a process redesign.",
      reassessmentTrigger: "Re-evaluate after the SOP fix lands.",
      relatedConstraint: s.currentConstraint === "QUALITY" ? "QUALITY" : null,
    });
  }

  // REWORK_REDO_COST.
  const rework = s.reworkCount ?? 0;
  if (rework >= 3) {
    F({
      leakType: "REWORK_REDO_COST", domain: "quality", severity: rework >= 10 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      evidence: [`${rework} rework/redo jobs this period`], missingData: [],
      estimatedImpact: { tier: rework >= 10 ? "HIGH" : "MEDIUM", note: "Each redo is paid-for work done twice — direct cost of poor quality." },
      cashImpact: "Rework consumes labor/materials already paid once.",
      marginImpact: "Directly erodes margin on redone jobs.",
      ownerExplanation: "Rework is doing paid work twice — a direct, avoidable cost.",
      recommendedAction: "Find the task causing the most rework and fix/add the SOP step so it is right first time.",
      ownerApprovalRequired: false, riskLevel: "LOW", operationalBurden: "Moderate — SOP fix + retrain.",
      successMetric: "First-time-right rises and rework count falls.",
      stopLoss: "If rework persists after the SOP fix, escalate to redesign.",
      reassessmentTrigger: "Re-evaluate after the SOP fix.",
      relatedConstraint: s.currentConstraint === "QUALITY" ? "QUALITY" : null,
    });
  }

  // REPEAT_CUSTOMER_DECLINE / CUSTOMER_CHURN_RISK.
  const newC = s.newCustomers ?? 0;
  const repeatC = s.repeatCustomers ?? 0;
  const churn = newC + repeatC > 0 ? Math.max(0, 1 - repeatC / (newC + repeatC)) : null;
  if (churn != null && churn >= 0.4) {
    F({
      leakType: "REPEAT_CUSTOMER_DECLINE", domain: "customer", severity: churn >= 0.6 ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      evidence: [`repeat share weak (churn risk ${Math.round(churn * 100)}%)`], missingData: [],
      estimatedImpact: { tier: churn >= 0.6 ? "HIGH" : "MEDIUM", note: "Weak repeat business makes every acquisition dollar leak out the back door." },
      cashImpact: "Lower lifetime value; acquisition spend is wasted.",
      marginImpact: "Repeat customers are usually the highest-margin revenue.",
      ownerExplanation: "Customers are not coming back — growth spend leaks unless retention is fixed first.",
      recommendedAction: "Run the approved win-back to lapsed customers before scaling acquisition.",
      ownerApprovalRequired: false, riskLevel: "LOW", operationalBurden: "Low — win-back message.",
      successMetric: "A measurable share of lapsed customers rebook within 14 days.",
      stopLoss: "If win-back response is below 5%, change the offer before scaling.",
      reassessmentTrigger: "Re-evaluate retention after the win-back cycle.",
      relatedConstraint: s.currentConstraint === "CUSTOMER_RETENTION" ? "CUSTOMER_RETENTION" : null,
    });
  }

  // STAFF_PRODUCTIVITY_DROP / WEAK_PROOF_REWORK_RISK.
  if ((s.overdueProofCount ?? 0) >= 3 || (s.weakProofCount ?? 0) >= 2) {
    const weak = (s.weakProofCount ?? 0) >= 2;
    F({
      leakType: weak ? "WEAK_PROOF_REWORK_RISK" : "STAFF_PRODUCTIVITY_DROP", domain: "execution",
      severity: (s.overdueProofCount ?? 0) >= 8 ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      evidence: [(s.overdueProofCount ?? 0) >= 3 ? `${s.overdueProofCount} overdue proofs` : "", weak ? `${s.weakProofCount} weak proofs` : ""].filter(Boolean),
      missingData: [], estimatedImpact: { tier: "MEDIUM", note: weak ? "Weak/unverified proof predicts rework and complaints — a downstream cost." : "Lagging completion delays cash and ties up work-in-progress." },
      cashImpact: "Delayed/unverified completion slows cash and risks redo cost.",
      marginImpact: "Rework from weak proof erodes margin.",
      ownerExplanation: weak ? "Weak proof means work isn't verifiably done right — expect rework and complaints." : "Staff completion is lagging — cash and throughput are held up.",
      recommendedAction: "Require proper proof before new assignments; re-balance load on the lagging staff.",
      ownerApprovalRequired: false, riskLevel: "LOW", operationalBurden: "Moderate — reassignment/retrain.",
      successMetric: "Overdue/weak-proof counts fall and completion is verifiable.",
      stopLoss: "If reassignment fails quality checks, retrain before re-delegating.",
      reassessmentTrigger: "Re-evaluate if overdue/weak proof persists.",
      relatedConstraint: s.currentConstraint === "STAFF" ? "STAFF" : null,
    });
  }

  // DELIVERY_DELAY_COST (explicit signal only).
  if (s.deliveryDelaySignal) {
    F({
      leakType: "DELIVERY_DELAY_COST", domain: "operations", severity: "MEDIUM", confidence: "MEDIUM",
      evidence: ["delivery delay/runner-failure signal"], missingData: [],
      estimatedImpact: { tier: "MEDIUM", note: "Late delivery drives complaints and repeat loss — a retention cost." },
      cashImpact: "Lost repeat revenue from broken delivery promises.", marginImpact: "Indirect via churn.",
      ownerExplanation: "Delivery delays are leaking repeat revenue through complaints.",
      recommendedAction: "Fix the slowest delivery step and set a same-day cutoff before adding volume.",
      ownerApprovalRequired: false, riskLevel: "MEDIUM", operationalBurden: "Moderate — routing change.",
      successMetric: "On-time delivery rises and delivery complaints fall.",
      stopLoss: "If delays persist, cap intake to delivery capacity.", reassessmentTrigger: "Re-evaluate if delivery complaints continue.",
      relatedConstraint: s.currentConstraint === "DELIVERY" ? "DELIVERY" : null,
    });
  }

  // OWNER_BOTTLENECK_COST.
  const ownerPending = (s.ownerDecisionsRequired ?? 0) + (s.ownerReviewsRequired ?? 0);
  if ((s.ownerBottleneckItems ?? 0) > 0 || ownerPending >= 5) {
    F({
      leakType: "OWNER_BOTTLENECK_COST", domain: "owner_leverage", severity: ownerPending >= 10 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      evidence: [(s.ownerBottleneckItems ?? 0) > 0 ? `${s.ownerBottleneckItems} owner-bottleneck item(s)` : "", ownerPending > 0 ? `${ownerPending} owner-only decisions/reviews pending` : ""].filter(Boolean),
      missingData: [], estimatedImpact: { tier: "MEDIUM", note: "Revenue-producing work waits on the owner — an opportunity cost that scales with the queue." },
      cashImpact: "Delayed decisions delay revenue-producing work.", marginImpact: "Indirect.",
      ownerExplanation: "Too much waits on you — the owner queue is itself a profit leak (work stalls).",
      recommendedAction: "Delegate or pre-authorize routine approvals; keep only high-value/irreversible decisions.",
      ownerApprovalRequired: false, riskLevel: "LOW", operationalBurden: "Low — set delegation rules.",
      successMetric: "Owner-only pending decisions drop below 5 and no owner item is overdue.",
      stopLoss: "If a delegated decision fails, tighten the rule and retrain before re-delegating.",
      reassessmentTrigger: "Re-evaluate if the owner queue grows again.",
      relatedConstraint: s.currentConstraint === "OWNER" ? "OWNER" : null,
    });
  }

  // CAPACITY_UNDERUSE (genuinely idle capacity — a revenue leak).
  if (s.capacityUtilizationPct != null && s.capacityUtilizationPct > 0 && s.capacityUtilizationPct < 40) {
    F({
      leakType: "CAPACITY_UNDERUSE", domain: "operations", severity: "MEDIUM", confidence: "MEDIUM",
      evidence: [`capacity utilization only ${Math.round(s.capacityUtilizationPct)}%`], missingData: [],
      estimatedImpact: { tier: "MEDIUM", note: "Idle capacity is fixed cost not converted to revenue — fill it with margin-safe demand." },
      cashImpact: "Fixed costs run whether or not capacity is used.", marginImpact: "Under-absorption raises unit cost.",
      ownerExplanation: "You are paying for capacity you are not using — safe demand generation could convert it.",
      recommendedAction: "Run a margin-safe demand action (retention/local promo) to fill idle capacity — only if quality/cash allow.",
      ownerApprovalRequired: false, riskLevel: "LOW", operationalBurden: "Moderate — demand action.",
      successMetric: "Utilization rises toward a healthy band without breaking margin or quality.",
      stopLoss: "Do not fill capacity with below-floor discounted work.",
      reassessmentTrigger: "Re-evaluate utilization next period.",
      relatedConstraint: null,
    });
  }

  // PRICING_UNDERCHARGE (margin unsafe but not a discount issue → likely underpricing).
  if (s.marginSafe === false && !s.discountLeak) {
    F({
      leakType: "PRICING_UNDERCHARGE", domain: "pricing", severity: "HIGH", confidence: "MEDIUM",
      evidence: ["margin below safe level with no discount signal"], missingData: s.marginPct == null ? ["gross margin by line/segment"] : [],
      estimatedImpact: { tier: "MEDIUM", note: "Thin margin with no discounting points to underpricing on at least one line." },
      cashImpact: "Thin margin means little cash per job.", marginImpact: "Below-target margin directly.",
      ownerExplanation: "Margin is thin but you are not discounting — a line is likely underpriced.",
      recommendedAction: "Identify the lowest-margin line and reprice it to the margin floor this month.",
      ownerApprovalRequired: true, riskLevel: "MEDIUM", operationalBurden: "Low — reprice one line.",
      successMetric: "The underpriced line clears the margin floor and blended margin recovers.",
      stopLoss: "If repricing loses key customers, revisit cost structure instead.",
      reassessmentTrigger: "Re-evaluate margin after the price change.",
      relatedConstraint: s.currentConstraint === "PRICING" ? "PRICING" : null,
    });
  }

  // Dispute-derived leaks — a governed proof dispute is a real, attributed contradiction. Impact is
  // qualitative (NEEDS_DATA): no per-event complaint/rework model exists, so no revenue/redo figure.
  const dRework = s.disputeReworkCount ?? 0;
  const dComplaint = s.disputeComplaintCount ?? 0;
  const dWeakProof = s.disputeWeakProofCount ?? 0;
  if (dRework > 0) {
    F({
      leakType: "REWORK_REDO_COST", domain: "quality", severity: dRework >= 3 ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      evidence: [`${dRework} accepted proof(s) disputed as rework/quality failure`], missingData: ["no per-event rework model — redo cost is qualitative only"],
      estimatedImpact: { tier: "NEEDS_DATA", note: "Redo cost is real but unmeasured — no per-event rework model yet." },
      cashImpact: "Rework consumes paid labour/materials twice.", marginImpact: "Direct margin loss on the redone jobs.",
      ownerExplanation: "Accepted work was disputed and had to be redone — a cost-of-poor-quality leak surfaced by a real dispute.",
      recommendedAction: "Fix the SOP/proof requirement behind the disputed jobs and re-verify recent similar work.",
      ownerApprovalRequired: false, riskLevel: dRework >= 3 ? "HIGH" : "MEDIUM", operationalBurden: "Medium — SOP + proof fix.",
      successMetric: "Disputed-rework rate falls to zero on the next similar jobs.",
      stopLoss: "If rework persists after the fix, escalate to a process redesign.",
      reassessmentTrigger: "Re-evaluate if rework disputes recur.",
      relatedConstraint: "QUALITY",
    });
  }
  if (dComplaint > 0) {
    F({
      leakType: "COMPLAINT_REVENUE_RISK", domain: "customer", severity: dComplaint >= 3 ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      evidence: [`${dComplaint} accepted proof(s) disputed as customer complaints`], missingData: ["no per-event complaint model — revenue/churn impact is not measured"],
      estimatedImpact: { tier: "NEEDS_DATA", note: "Revenue/relationship risk is real but unmeasured — no complaint model to size it." },
      cashImpact: "Complaints risk refunds and lost repeat revenue.", marginImpact: "Recovery effort + possible refunds erode margin.",
      ownerExplanation: "A customer complained about accepted work — revenue/relationship risk, magnitude not yet measured.",
      recommendedAction: "Run customer recovery on the affected job and fix the underlying quality cause.",
      ownerApprovalRequired: true, riskLevel: "HIGH", operationalBurden: "Medium — customer recovery.",
      successMetric: "The affected customer is retained and the cause is corrected.",
      stopLoss: "Do not discount below the viable price to retain the customer.",
      reassessmentTrigger: "Re-evaluate if complaint disputes recur.",
      relatedConstraint: "QUALITY",
    });
  }
  if (dWeakProof > 0) {
    F({
      leakType: "WEAK_PROOF_REWORK_RISK", domain: "evidence", severity: dWeakProof >= 3 ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      evidence: [`${dWeakProof} accepted proof(s) disputed as wrong/insufficient/fake or a review error`], missingData: [],
      estimatedImpact: { tier: "NEEDS_DATA", note: "Weak-proof rework risk is real but unmeasured." },
      cashImpact: "Weak proof hides undone work until it resurfaces as rework/complaints.", marginImpact: "Indirect — drives later rework.",
      ownerExplanation: "Accepted proof was disputed as wrong/insufficient/fake — the proof requirement or reviewer let weak evidence pass.",
      recommendedAction: "Tighten the proof requirement, coach the operator/reviewer, and re-verify recent proof of this type.",
      ownerApprovalRequired: false, riskLevel: dWeakProof >= 3 ? "HIGH" : "MEDIUM", operationalBurden: "Medium — proof + coaching.",
      successMetric: "Weak-proof disputes fall to zero and acceptances hold up.",
      stopLoss: "If fake proof is confirmed, escalate to an anti-gaming review.",
      reassessmentTrigger: "Re-evaluate if weak-proof disputes recur.",
      relatedConstraint: s.currentConstraint === "STAFF" || s.currentConstraint === "MANAGER" ? s.currentConstraint : "STAFF",
    });
  }

  // DATA_INSUFFICIENT.
  if (out.length === 0) {
    const missing = s.missingCriticalData && s.missingCriticalData.length > 0
      ? s.missingCriticalData
      : ["revenue + discount amount", "gross margin %", "customer new/repeat counts", "complaint/rework counts"];
    F({
      leakType: "DATA_INSUFFICIENT", domain: "data", severity: "LOW", confidence: "NEEDS_DATA",
      evidence: ["no profit-leak signal present"], missingData: missing,
      estimatedImpact: { tier: "NEEDS_DATA", note: "Cannot size any leak without the listed data." },
      cashImpact: "Unknown until data is available.", marginImpact: "Unknown until data is available.",
      ownerExplanation: "No clear profit-leak signal yet — OpsIQ needs the listed data before it can point to a leak.",
      recommendedAction: `Provide: ${missing.join("; ")}.`,
      ownerApprovalRequired: false, riskLevel: "LOW", operationalBurden: "Low — enter the missing data.",
      successMetric: "The listed data is available and leaks can be evaluated.",
      stopLoss: "n/a", reassessmentTrigger: "Re-evaluate once the missing data is supplied.",
      relatedConstraint: null,
    });
  }

  out.sort((a, b) => b.leakScore - a.leakScore);
  return { topLeak: out[0] ?? null, leaks: out, evaluatedAt: at };
}

/** Leak types whose fix touches price/cash and must be considered before scaling. */
export const CASH_MARGIN_LEAKS: ReadonlySet<ProfitLeakType> = new Set<ProfitLeakType>([
  "CASH_RISK_GROWTH", "DISCOUNT_LEAK", "PRICING_UNDERCHARGE", "LOW_MARGIN_B2B",
]);
