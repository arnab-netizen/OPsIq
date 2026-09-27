/**
 * Module 41 — Real-Time 360° Owner Guidance orchestrator (pure).
 *
 * The "Owner Now View" / real-time guidance loop. It sits ABOVE the command-and-
 * control modules (M1–M40) and translates their already-computed signals into
 * practical, prioritized owner guidance:
 *   1. classify data quality / cap confidence
 *   2. detect urgent exceptions
 *   3. rank business risks
 *   4. block unsafe / growth-before-gates actions
 *   5. produce top 3 owner actions (uncapped only in emergency)
 *   6. produce actions to avoid
 *   7. surface what changed, missing data, per-function status
 *   8. emit a terminal GuidanceClassification
 *
 * It does NOT re-derive cash/finance/workload/capacity/quality verdicts — those are
 * passed in as a GuidanceContext (populated by the wiring services from the existing
 * gates). Pure + deterministic.
 */

import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import {
  type BusinessIssue,
  IssueCategory,
} from "@/domain/owner-guidance/issue-priority";
import {
  selectNextBestSteps,
  type ActionToAvoid,
  type NextBestSteps,
} from "@/domain/owner-guidance/next-best-step";
import { type DetectedChange, ownerAlerts } from "@/domain/owner-guidance/change-detection";
import {
  BusinessFunction,
  requiresProfessionalReview,
} from "@/domain/owner-guidance/business-function";
import { GuidanceClassification } from "@/domain/owner-guidance/guidance-classification";

export type AreaStatus = "OK" | "WATCH" | "DANGER" | "CRITICAL";

export interface GuidanceContext {
  workspaceId: string;
  businessId: string;
  archetype: string | null;
  /** Overall data confidence from the input-quality / evidence layers. */
  dataConfidence: EvidenceConfidenceLevel;
  /** Named critical data gaps that block safe high-stakes guidance. Smallest-useful first. */
  missingCriticalData: string[];
  /** Pre-classified business issues (from the C&C modules). */
  issues: BusinessIssue[];
  /** Detected changes since last check (from change-detection). */
  changes: DetectedChange[];
  /** Whether the growth/scale gates (M21/M22) currently pass. */
  growthGatePassed: boolean;
  /** Whether cash survival (M4/M5) is safe. */
  cashSafe: boolean;
  staffOverloaded: boolean;
  ownerOverloaded: boolean;
  /** Hard safety block — e.g. a required boundary is missing or guidance is unsafe to show. */
  unsafeToGuide: boolean;
}

export interface OwnerNowView {
  workspaceId: string;
  businessId: string;
  classification: GuidanceClassification;
  /** Top owner actions now — ≤3 unless emergency. */
  topOwnerActions: BusinessIssue[];
  actionsToAvoid: ActionToAvoid[];
  urgentRisks: BusinessIssue[];
  whatChanged: DetectedChange[];
  /** Targeted missing-data requests (smallest useful first), not generic warnings. */
  missingDataRequests: string[];
  confidence: EvidenceConfidenceLevel;
  confidenceCapped: boolean;
  emergency: boolean;
  reasoningSummary: string;
  // Per-function status surface (command-center sections 4–15).
  businessHealth: AreaStatus;
  cashDangerStatus: AreaStatus;
  profitLeakStatus: AreaStatus;
  staffOverloadStatus: AreaStatus;
  ownerOverloadStatus: AreaStatus;
  qualityFailureStatus: AreaStatus;
  customerRetentionStatus: AreaStatus;
  supplierInventoryStatus: AreaStatus;
  capacityStatus: AreaStatus;
  growthReadinessStatus: AreaStatus;
}

const SEVERITY_TO_STATUS: Record<BusinessIssue["severity"], AreaStatus> = {
  LOW: "WATCH",
  MEDIUM: "WATCH",
  HIGH: "DANGER",
  CRITICAL: "CRITICAL",
};

/** Worst status across issues in a category (OK when none). */
function categoryStatus(issues: readonly BusinessIssue[], category: IssueCategory): AreaStatus {
  let worst: AreaStatus = "OK";
  const order: AreaStatus[] = ["OK", "WATCH", "DANGER", "CRITICAL"];
  for (const i of issues) {
    if (i.category === category) {
      const s = SEVERITY_TO_STATUS[i.severity];
      if (order.indexOf(s) > order.indexOf(worst)) worst = s;
    }
  }
  return worst;
}

function maxStatus(a: AreaStatus, b: AreaStatus): AreaStatus {
  const order: AreaStatus[] = ["OK", "WATCH", "DANGER", "CRITICAL"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function isWeak(c: EvidenceConfidenceLevel): boolean {
  return c === EvidenceConfidenceLevel.WEAK || c === EvidenceConfidenceLevel.INSUFFICIENT;
}

/** Functions touched by the active issues, for professional-review detection. */
function activeFunctions(issues: readonly BusinessIssue[]): BusinessFunction[] {
  const set = new Set<BusinessFunction>();
  for (const i of issues) for (const f of i.businessFunction) set.add(f);
  return [...set];
}

/**
 * Run the real-time owner guidance loop and produce the Owner Now View.
 * Enforces the hard rules: growth is removed from top actions until gates pass;
 * confidence is capped on weak/missing data; top actions are limited to 3 unless
 * an emergency exists.
 */
export function buildOwnerNowView(ctx: GuidanceContext): OwnerNowView {
  // HARD RULE: never surface a growth action as a top action before the gates pass.
  const guidableIssues = ctx.growthGatePassed
    ? ctx.issues
    : ctx.issues.filter((i) => i.category !== IssueCategory.GROWTH_OPPORTUNITY);

  const steps: NextBestSteps = selectNextBestSteps(guidableIssues);

  // Inject overload-driven avoidances even when no explicit OVERLOAD issue was
  // classified but the context flags overload (defensive: spec demands overload
  // blocks new work).
  const actionsToAvoid = [...steps.actionsToAvoid];
  if ((ctx.staffOverloaded || ctx.ownerOverloaded)
      && !actionsToAvoid.some((a) => a.id === "avoid_new_tasks_on_overload")) {
    actionsToAvoid.push({
      id: "avoid_new_tasks_on_overload",
      avoid: "Do not assign new non-critical tasks to staff or the owner",
      reason: "staff/owner are already overloaded; more load raises failure risk",
      businessFunction: [BusinessFunction.EMPLOYEE_WORKLOAD, BusinessFunction.OWNER_WORKLOAD],
      triggeredBy: [IssueCategory.OVERLOAD],
    });
  }
  if (!ctx.growthGatePassed) {
    actionsToAvoid.push({
      id: "avoid_growth_before_gates",
      avoid: "Do not scale demand (new acquisition spend, campaign expansion or extra volume) until cash, profit, capacity, workload and quality gates pass",
      reason: "stabilization gates are not yet satisfied; scaling now compounds risk",
      businessFunction: [BusinessFunction.GROWTH_READINESS],
      triggeredBy: [IssueCategory.GROWTH_OPPORTUNITY],
    });
  }

  const urgentRisks = steps.topIssues.filter(
    (i) => i.severity === "CRITICAL" || i.severity === "HIGH"
  );

  // Confidence: cap on weak data or named missing critical data.
  const hasMissingData = ctx.missingCriticalData.length > 0;
  const weak = isWeak(ctx.dataConfidence);
  const confidenceCapped = hasMissingData || weak;
  const confidence = confidenceCapped
    ? (ctx.dataConfidence === EvidenceConfidenceLevel.INSUFFICIENT
        ? EvidenceConfidenceLevel.INSUFFICIENT
        : EvidenceConfidenceLevel.WEAK)
    : ctx.dataConfidence;

  // Per-function status surface.
  const cashDangerStatus = categoryStatus(ctx.issues, IssueCategory.CASH_DANGER);
  const profitLeakStatus = categoryStatus(ctx.issues, IssueCategory.PROFIT_LEAK);
  const overloadStatus = categoryStatus(ctx.issues, IssueCategory.OVERLOAD);
  const staffOverloadStatus = maxStatus(overloadStatus, ctx.staffOverloaded ? "DANGER" : "OK");
  const ownerOverloadStatus = maxStatus(overloadStatus, ctx.ownerOverloaded ? "DANGER" : "OK");
  const serviceStatus = categoryStatus(ctx.issues, IssueCategory.CUSTOMER_SERVICE_FAILURE);
  const capacityStatus = categoryStatus(ctx.issues, IssueCategory.CAPACITY_BOTTLENECK);
  const growthReadinessStatus: AreaStatus = ctx.growthGatePassed ? "OK" : "WATCH";

  const businessHealth = [
    cashDangerStatus,
    serviceStatus,
    staffOverloadStatus,
    ownerOverloadStatus,
    profitLeakStatus,
    capacityStatus,
  ].reduce(maxStatus, "OK" as AreaStatus);

  // Terminal classification (precedence order).
  const classification = classify(ctx, steps, confidenceCapped, weak);

  return {
    workspaceId: ctx.workspaceId,
    businessId: ctx.businessId,
    classification,
    topOwnerActions: steps.topIssues,
    actionsToAvoid,
    urgentRisks,
    whatChanged: ctx.changes,
    missingDataRequests: ctx.missingCriticalData,
    confidence,
    confidenceCapped,
    emergency: steps.emergency,
    reasoningSummary: summarize(ctx, steps, classification),
    businessHealth,
    cashDangerStatus,
    profitLeakStatus,
    staffOverloadStatus,
    ownerOverloadStatus,
    qualityFailureStatus: serviceStatus,
    customerRetentionStatus: serviceStatus,
    supplierInventoryStatus: categoryStatus(ctx.issues, IssueCategory.CAPACITY_BOTTLENECK),
    capacityStatus,
    growthReadinessStatus,
  };
}

/** Owner-alerting changes only, for the "What Changed Since Last Check" highlight. */
export function changeHighlights(view: OwnerNowView): DetectedChange[] {
  return ownerAlerts(view.whatChanged);
}

function classify(
  ctx: GuidanceContext,
  steps: NextBestSteps,
  confidenceCapped: boolean,
  weak: boolean
): GuidanceClassification {
  if (ctx.unsafeToGuide) return GuidanceClassification.GUIDANCE_BLOCKED_UNSAFE;

  // Missing critical data blocks high-stakes guidance.
  if (ctx.missingCriticalData.length > 0 && steps.topIssues.some(
    (i) => i.severity === "CRITICAL" || i.severity === "HIGH"
  )) {
    return GuidanceClassification.GUIDANCE_BLOCKED_MISSING_DATA;
  }

  // Compliance / tax / legal-sensitive functions → professional review.
  if (requiresProfessionalReview(activeFunctions(steps.topIssues))) {
    return GuidanceClassification.GUIDANCE_REQUIRES_PROFESSIONAL_REVIEW;
  }

  // A critical owner-action issue needs an explicit owner decision.
  if (steps.topIssues.some((i) => i.severity === "CRITICAL" && i.requiresOwnerAction)) {
    return GuidanceClassification.GUIDANCE_REQUIRES_OWNER_DECISION;
  }

  if (confidenceCapped || weak) {
    return GuidanceClassification.GUIDANCE_READY_WITH_LOW_CONFIDENCE;
  }
  return GuidanceClassification.GUIDANCE_READY;
}

function summarize(
  ctx: GuidanceContext,
  steps: NextBestSteps,
  classification: GuidanceClassification
): string {
  const top = steps.topIssues[0];
  const lead = top ? `Top operating signal: ${top.headline} (${top.category}).` : "No active operating signals.";
  const cash = ctx.cashSafe ? "" : " Cash survival is unsafe — stabilization before growth.";
  const data = ctx.missingCriticalData.length > 0
    ? ` Missing data capping confidence: ${ctx.missingCriticalData.join("; ")}.`
    : "";
  return `${lead}${cash}${data} Classification: ${classification}.`;
}
