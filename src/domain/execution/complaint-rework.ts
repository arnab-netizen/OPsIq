/**
 * Minimal per-event Complaint / Rework model — PURE domain rules.
 *
 * A single event type (COMPLAINT | REWORK) captures the real operational event that contradicted
 * accepted work, so the business impact of bad accepted proof becomes measurable. This module owns
 * the deterministic rules: the conservative category vocabulary, request validation (category +
 * description REQUIRED — fail closed), and the mapping from a category to the Profit-Leak +
 * Constraint drivers it should feed.
 *
 * It is NOT a CRM/ticketing/refund/customer-profile model. It invents no financial figure — impact
 * is carried only when a real amount is supplied (impactConfidence MEASURED/ESTIMATED), else
 * NEEDS_DATA.
 */

import type { ProfitLeakType } from "@/domain/owner-mode/profit-leak-radar";
import type { ConstraintType } from "@/domain/owner-mode/constraint-engine";

export enum OperationalEventType { COMPLAINT = "COMPLAINT", REWORK = "REWORK" }

export enum ComplaintCategory {
  QUALITY_COMPLAINT = "QUALITY_COMPLAINT",
  DELIVERY_COMPLAINT = "DELIVERY_COMPLAINT",
  DAMAGE_OR_LOSS = "DAMAGE_OR_LOSS",
  WRONG_ITEM = "WRONG_ITEM",
  LATE_SERVICE = "LATE_SERVICE",
  BILLING_OR_PRICING = "BILLING_OR_PRICING",
  CUSTOMER_DISSATISFACTION = "CUSTOMER_DISSATISFACTION",
  OTHER = "OTHER",
}
export enum ReworkCategory {
  REWASH = "REWASH",
  REDO_PRESSING = "REDO_PRESSING",
  REDELIVERY = "REDELIVERY",
  REPAIR_OR_CORRECTION = "REPAIR_OR_CORRECTION",
  CUSTOMER_RETURN = "CUSTOMER_RETURN",
  QUALITY_RECHECK = "QUALITY_RECHECK",
  OTHER = "OTHER",
}

export type EventSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ImpactConfidence = "MEASURED" | "ESTIMATED" | "NEEDS_DATA";

/** Category → business-risk drivers. */
interface RiskMap { profitLeakType: ProfitLeakType; constraintType: ConstraintType | null }

const COMPLAINT_RISK: Record<ComplaintCategory, RiskMap> = {
  [ComplaintCategory.QUALITY_COMPLAINT]: { profitLeakType: "COMPLAINT_REVENUE_RISK", constraintType: "QUALITY" },
  [ComplaintCategory.DELIVERY_COMPLAINT]: { profitLeakType: "COMPLAINT_REVENUE_RISK", constraintType: "DELIVERY" },
  [ComplaintCategory.DAMAGE_OR_LOSS]: { profitLeakType: "COMPLAINT_REVENUE_RISK", constraintType: "QUALITY" },
  [ComplaintCategory.WRONG_ITEM]: { profitLeakType: "COMPLAINT_REVENUE_RISK", constraintType: "QUALITY" },
  [ComplaintCategory.LATE_SERVICE]: { profitLeakType: "COMPLAINT_REVENUE_RISK", constraintType: "DELIVERY" },
  [ComplaintCategory.BILLING_OR_PRICING]: { profitLeakType: "COMPLAINT_REVENUE_RISK", constraintType: "PRICING" },
  [ComplaintCategory.CUSTOMER_DISSATISFACTION]: { profitLeakType: "COMPLAINT_REVENUE_RISK", constraintType: "QUALITY" },
  [ComplaintCategory.OTHER]: { profitLeakType: "COMPLAINT_REVENUE_RISK", constraintType: null },
};
const REWORK_RISK: Record<ReworkCategory, RiskMap> = {
  [ReworkCategory.REWASH]: { profitLeakType: "REWORK_REDO_COST", constraintType: "QUALITY" },
  [ReworkCategory.REDO_PRESSING]: { profitLeakType: "REWORK_REDO_COST", constraintType: "QUALITY" },
  [ReworkCategory.REDELIVERY]: { profitLeakType: "REWORK_REDO_COST", constraintType: "DELIVERY" },
  [ReworkCategory.REPAIR_OR_CORRECTION]: { profitLeakType: "REWORK_REDO_COST", constraintType: "QUALITY" },
  [ReworkCategory.CUSTOMER_RETURN]: { profitLeakType: "REWORK_REDO_COST", constraintType: "QUALITY" },
  [ReworkCategory.QUALITY_RECHECK]: { profitLeakType: "REWORK_REDO_COST", constraintType: "QUALITY" },
  [ReworkCategory.OTHER]: { profitLeakType: "REWORK_REDO_COST", constraintType: null },
};

export function isComplaintCategory(v: unknown): v is ComplaintCategory {
  return typeof v === "string" && (Object.values(ComplaintCategory) as string[]).includes(v);
}
export function isReworkCategory(v: unknown): v is ReworkCategory {
  return typeof v === "string" && (Object.values(ReworkCategory) as string[]).includes(v);
}

/** The risk drivers a valid (eventType, category) pair maps to. */
export function riskForEvent(eventType: string, category: string): RiskMap | null {
  if (eventType === OperationalEventType.COMPLAINT && isComplaintCategory(category)) return COMPLAINT_RISK[category];
  if (eventType === OperationalEventType.REWORK && isReworkCategory(category)) return REWORK_RISK[category];
  return null;
}

export interface RecordEventRequest {
  eventType: unknown;
  category: unknown;
  description: unknown;
  severity?: unknown;
  source?: unknown;
  estimatedImpactAmount?: unknown;
  impactCurrency?: unknown;
}

export interface RecordEventPlan {
  eventType: OperationalEventType;
  category: string;
  description: string;
  severity: EventSeverity;
  source: string;
  estimatedImpactAmount: number | null;
  impactCurrency: string | null;
  impactConfidence: ImpactConfidence;
}

export type RecordEventValidation = { ok: true; plan: RecordEventPlan } | { ok: false; reason: string };

const SEVERITIES = new Set<EventSeverity>(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const SOURCES = new Set(["owner", "manager", "staff", "customer_reported", "system"]);
const MIN_DESC = 3;

/** Validate a record request. Fails closed on a missing category or blank description. */
export function planRecordEvent(req: RecordEventRequest): RecordEventValidation {
  const eventType = req.eventType === OperationalEventType.COMPLAINT ? OperationalEventType.COMPLAINT
    : req.eventType === OperationalEventType.REWORK ? OperationalEventType.REWORK : null;
  if (!eventType) return { ok: false, reason: "eventType must be COMPLAINT or REWORK." };

  const category = typeof req.category === "string" ? req.category : "";
  const valid = eventType === OperationalEventType.COMPLAINT ? isComplaintCategory(category) : isReworkCategory(category);
  if (!valid) return { ok: false, reason: `A valid ${eventType.toLowerCase()} category is required.` };

  if (typeof req.description !== "string" || req.description.trim().length < MIN_DESC) {
    return { ok: false, reason: "A description is required." };
  }
  const severity: EventSeverity = SEVERITIES.has(req.severity as EventSeverity) ? (req.severity as EventSeverity) : "MEDIUM";
  const source = typeof req.source === "string" && SOURCES.has(req.source) ? req.source : "owner";

  // Impact: only carried when a real, positive amount is supplied — never fabricated.
  let estimatedImpactAmount: number | null = null;
  let impactCurrency: string | null = null;
  let impactConfidence: ImpactConfidence = "NEEDS_DATA";
  if (typeof req.estimatedImpactAmount === "number" && Number.isFinite(req.estimatedImpactAmount) && req.estimatedImpactAmount > 0) {
    estimatedImpactAmount = req.estimatedImpactAmount;
    impactCurrency = typeof req.impactCurrency === "string" && req.impactCurrency.trim() ? req.impactCurrency.trim() : "USD";
    impactConfidence = "ESTIMATED";
  }

  return {
    ok: true,
    plan: { eventType, category, description: req.description.trim(), severity, source, estimatedImpactAmount, impactCurrency, impactConfidence },
  };
}

// ── Proof ↔ complaint/rework linkage analysis ────────────────────────────────

/** A persisted OperationalEvent row linked (or linkable) to a proof. */
export interface OperationalEventRow {
  id: string;
  eventType: string;
  relatedProofId: string | null;
  relatedActionId: string | null;
  category: string;
  severity: string;
  status: string;
  source: string;
  description: string;
  occurredAt: Date | null;
  createdAt: Date;
  estimatedImpactAmount: number | null;
  impactConfidence: string;
}
/** The accepted-proof facts needed to attribute a linked event. */
export interface LinkedProofRow { id: string; status: string; submittedByUserId: string | null }

export interface ProofEventLink {
  workspaceId: string;
  eventType: string;
  eventId: string;
  relatedProofId: string | null;
  relatedActionId: string | null;
  category: string;
  severity: string;
  status: string;
  occurredAt: string | null;   // user-reported (may be null); untrusted for SLO timing
  createdAt: string;           // server-trusted
  source: string;
  description: string;
  impactAmount: number | null;
  impactConfidence: string;
  profitLeakType: ProfitLeakType | null;
  constraintType: ConstraintType | null;
  linkStatus: "LINKED" | "MISSING_PROOF";
  proofWasAccepted: boolean;
  submittedByUserId: string | null;
  missingData: string[];
  ownerExplanation: string;
  recommendedAction: string;
  reassessmentTrigger: string;
  evaluatedAt: string;
}

export interface ComplaintReworkAnalysis {
  workspaceId: string;
  links: ProofEventLink[];
  submitterComplaints: Array<{ actorId: string; count: number }>;
  submitterReworks: Array<{ actorId: string; count: number }>;
  aggregates: {
    complaintLinkedCount: number;
    reworkLinkedCount: number;
    qualityCount: number;
    deliveryCount: number;
    pricingCount: number;
    measuredComplaintImpact: number | null; // sum of real amounts, null if none measured
    measuredReworkImpact: number | null;
  };
  /** proof→complaint / proof→rework are measurable once ≥1 linked event to an accepted proof exists. */
  measurement: { proofComplaintMeasurable: boolean; proofReworkMeasurable: boolean };
  topLink: ProofEventLink | null;
  evaluatedAt: string;
}

const SEV_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

/** Build the proof↔complaint/rework linkage analysis from persisted events + their proofs. Pure. */
export function buildComplaintReworkAnalysis(
  workspaceId: string,
  events: OperationalEventRow[],
  proofs: LinkedProofRow[],
  evaluatedAt: string
): ComplaintReworkAnalysis {
  const proofById = new Map(proofs.map((p) => [p.id, p]));
  const links: ProofEventLink[] = [];
  const subComplaint = new Map<string, number>();
  const subRework = new Map<string, number>();
  const agg = {
    complaintLinkedCount: 0, reworkLinkedCount: 0, qualityCount: 0, deliveryCount: 0, pricingCount: 0,
    measuredComplaintImpact: null as number | null, measuredReworkImpact: null as number | null,
  };

  for (const e of events) {
    const risk = riskForEvent(e.eventType, e.category);
    const proof = e.relatedProofId ? proofById.get(e.relatedProofId) ?? null : null;
    const linkStatus: "LINKED" | "MISSING_PROOF" = e.relatedProofId && proof ? "LINKED" : "MISSING_PROOF";
    const proofWasAccepted = !!proof && (proof.status === "ACCEPTED" || proof.status === "DISPUTED" || proof.status === "OVERRIDDEN_NOT_VERIFIED");
    const isComplaint = e.eventType === OperationalEventType.COMPLAINT;
    const measured = e.estimatedImpactAmount != null && e.estimatedImpactAmount > 0 ? e.estimatedImpactAmount : null;

    if (linkStatus === "LINKED" && proofWasAccepted) {
      if (isComplaint) {
        agg.complaintLinkedCount++;
        if (measured != null) agg.measuredComplaintImpact = (agg.measuredComplaintImpact ?? 0) + measured;
        if (proof?.submittedByUserId) subComplaint.set(proof.submittedByUserId, (subComplaint.get(proof.submittedByUserId) ?? 0) + 1);
      } else {
        agg.reworkLinkedCount++;
        if (measured != null) agg.measuredReworkImpact = (agg.measuredReworkImpact ?? 0) + measured;
        if (proof?.submittedByUserId) subRework.set(proof.submittedByUserId, (subRework.get(proof.submittedByUserId) ?? 0) + 1);
      }
      if (risk?.constraintType === "QUALITY") agg.qualityCount++;
      else if (risk?.constraintType === "DELIVERY") agg.deliveryCount++;
      else if (risk?.constraintType === "PRICING") agg.pricingCount++;
    }

    links.push({
      workspaceId, eventType: e.eventType, eventId: e.id, relatedProofId: e.relatedProofId, relatedActionId: e.relatedActionId,
      category: e.category, severity: e.severity, status: e.status,
      occurredAt: e.occurredAt ? e.occurredAt.toISOString() : null, createdAt: e.createdAt.toISOString(),
      source: e.source, description: e.description,
      impactAmount: measured, impactConfidence: measured != null ? (e.impactConfidence || "ESTIMATED") : "NEEDS_DATA",
      profitLeakType: risk?.profitLeakType ?? null, constraintType: risk?.constraintType ?? null,
      linkStatus, proofWasAccepted, submittedByUserId: proof?.submittedByUserId ?? null,
      missingData: measured != null ? [] : ["no measured financial impact — impact is qualitative (NEEDS_DATA)"],
      ownerExplanation: linkStatus === "LINKED"
        ? `A ${isComplaint ? "complaint" : "rework"} (${e.category}) is linked to ${proofWasAccepted ? "an accepted" : "a"} proof — the accepted work was contradicted by a real ${isComplaint ? "customer complaint" : "redo"}.`
        : `A ${isComplaint ? "complaint" : "rework"} (${e.category}) has no valid linked proof in this workspace.`,
      recommendedAction: isComplaint ? "Run customer recovery and fix the quality cause behind the complaint." : "Correct the SOP/proof behind the redo and re-verify similar recent jobs.",
      reassessmentTrigger: "re-evaluate if the linked accepted proof's outcome must be reopened",
      evaluatedAt,
    });
  }

  const linkedLinks = links.filter((l) => l.linkStatus === "LINKED" && l.proofWasAccepted);
  const ranked = [...linkedLinks].sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0));
  return {
    workspaceId, links,
    submitterComplaints: [...subComplaint.entries()].map(([actorId, count]) => ({ actorId, count })),
    submitterReworks: [...subRework.entries()].map(([actorId, count]) => ({ actorId, count })),
    aggregates: agg,
    measurement: { proofComplaintMeasurable: agg.complaintLinkedCount > 0, proofReworkMeasurable: agg.reworkLinkedCount > 0 },
    topLink: ranked[0] ?? null,
    evaluatedAt,
  };
}
