/**
 * Module 41 — Real-Time Change Detection engine (spec section 7, pure domain core).
 *
 * Detects and explains what changed since the owner's last check by comparing two
 * BusinessStateSnapshots. Feeds the command center's "What Changed Since Last Check"
 * panel: each meaningful delta becomes a DetectedChange with a category, a direction,
 * the owning business function, a numbers-specific reason, and an owner-alert flag.
 *
 * Pure + deterministic. No Date.now()/Math.random()/new Date().
 */

import { BusinessFunction } from "./business-function";

export enum ChangeCategory {
  CASH_WORSENED = "CASH_WORSENED",
  CASH_IMPROVED = "CASH_IMPROVED",
  PROFIT_WORSENED = "PROFIT_WORSENED",
  PROFIT_IMPROVED = "PROFIT_IMPROVED",
  COMPLAINTS_INCREASED = "COMPLAINTS_INCREASED",
  COMPLAINTS_DECREASED = "COMPLAINTS_DECREASED",
  REWORK_INCREASED = "REWORK_INCREASED",
  CAPACITY_WORSENED = "CAPACITY_WORSENED",
  STAFF_OVERLOAD_WORSENED = "STAFF_OVERLOAD_WORSENED",
  OWNER_OVERLOAD_WORSENED = "OWNER_OVERLOAD_WORSENED",
  CUSTOMER_CHURN_RISK_INCREASED = "CUSTOMER_CHURN_RISK_INCREASED",
  SUPPLIER_INVENTORY_RISK_INCREASED = "SUPPLIER_INVENTORY_RISK_INCREASED",
  PROOF_OVERDUE = "PROOF_OVERDUE",
  OUTCOME_CHECK_DUE = "OUTCOME_CHECK_DUE",
  GROWTH_READINESS_CHANGED = "GROWTH_READINESS_CHANGED",
}

export type ChangeDirection = "WORSENED" | "IMPROVED" | "NEUTRAL";

/**
 * Comparable point-in-time snapshot of the business condition. All fields are
 * required so that two snapshots are always directly diffable. Scores are 0..1.
 */
export interface BusinessStateSnapshot {
  cashRunwayDays: number;
  netMarginPct: number;
  complaintsCount: number;
  reworkCount: number;
  capacityUtilizationPct: number;
  staffOverloadPct: number;
  ownerLoadPct: number;
  /** 0..1 */
  churnRiskScore: number;
  /** 0..1 */
  supplierInventoryRiskScore: number;
  overdueProofCount: number;
  outcomeChecksDue: number;
  /** e.g. "GROWTH_READY" | "STABILIZE_FIRST". */
  growthReadinessTier: string;
}

export interface DetectedChange {
  category: ChangeCategory;
  direction: ChangeDirection;
  businessFunction: BusinessFunction;
  reason: string;
  ownerAlert: boolean;
}

/** Epsilon for float comparisons so noise below this is treated as "no change". */
const EPSILON = 1e-6;

/** Tier worse-than ordering: STABILIZE_FIRST is worse than GROWTH_READY. */
const TIER_RANK: Record<string, number> = {
  GROWTH_READY: 2,
  STABILIZE_FIRST: 1,
};

/** Numeric tier rank; unknown tiers rank 0 (treated as the worst/unknown). */
function tierRank(tier: string): number {
  return Object.prototype.hasOwnProperty.call(TIER_RANK, tier) ? TIER_RANK[tier] : 0;
}

/** Trim trailing zeros for stable, readable reason strings. */
function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function rose(prev: number, current: number): boolean {
  return current - prev > EPSILON;
}

function fell(prev: number, current: number): boolean {
  return prev - current > EPSILON;
}

/**
 * Compare two snapshots and emit one DetectedChange per meaningful delta.
 * Order follows owner-priority: cash, profit, complaints, quality, capacity,
 * workload, retention, supply, evidence, outcome, growth readiness.
 */
export function detectChanges(
  prev: BusinessStateSnapshot,
  current: BusinessStateSnapshot
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  // Cash runway: fewer days = worse.
  if (fell(prev.cashRunwayDays, current.cashRunwayDays)) {
    changes.push({
      category: ChangeCategory.CASH_WORSENED,
      direction: "WORSENED",
      businessFunction: BusinessFunction.CASH_FLOW,
      reason: `Cash runway fell from ${fmt(prev.cashRunwayDays)} to ${fmt(current.cashRunwayDays)} days.`,
      ownerAlert: true,
    });
  } else if (rose(prev.cashRunwayDays, current.cashRunwayDays)) {
    changes.push({
      category: ChangeCategory.CASH_IMPROVED,
      direction: "IMPROVED",
      businessFunction: BusinessFunction.CASH_FLOW,
      reason: `Cash runway rose from ${fmt(prev.cashRunwayDays)} to ${fmt(current.cashRunwayDays)} days.`,
      ownerAlert: false,
    });
  }

  // Net margin: lower = worse.
  if (fell(prev.netMarginPct, current.netMarginPct)) {
    changes.push({
      category: ChangeCategory.PROFIT_WORSENED,
      direction: "WORSENED",
      businessFunction: BusinessFunction.PROFITABILITY,
      reason: `Net margin fell from ${fmt(prev.netMarginPct)}% to ${fmt(current.netMarginPct)}%.`,
      ownerAlert: true,
    });
  } else if (rose(prev.netMarginPct, current.netMarginPct)) {
    changes.push({
      category: ChangeCategory.PROFIT_IMPROVED,
      direction: "IMPROVED",
      businessFunction: BusinessFunction.PROFITABILITY,
      reason: `Net margin rose from ${fmt(prev.netMarginPct)}% to ${fmt(current.netMarginPct)}%.`,
      ownerAlert: false,
    });
  }

  // Complaints: more = worse.
  if (rose(prev.complaintsCount, current.complaintsCount)) {
    changes.push({
      category: ChangeCategory.COMPLAINTS_INCREASED,
      direction: "WORSENED",
      businessFunction: BusinessFunction.CUSTOMER_COMPLAINTS,
      reason: `Complaints rose from ${fmt(prev.complaintsCount)} to ${fmt(current.complaintsCount)}.`,
      ownerAlert: true,
    });
  } else if (fell(prev.complaintsCount, current.complaintsCount)) {
    changes.push({
      category: ChangeCategory.COMPLAINTS_DECREASED,
      direction: "IMPROVED",
      businessFunction: BusinessFunction.CUSTOMER_COMPLAINTS,
      reason: `Complaints fell from ${fmt(prev.complaintsCount)} to ${fmt(current.complaintsCount)}.`,
      ownerAlert: false,
    });
  }

  // Rework: more = worse.
  if (rose(prev.reworkCount, current.reworkCount)) {
    changes.push({
      category: ChangeCategory.REWORK_INCREASED,
      direction: "WORSENED",
      businessFunction: BusinessFunction.QUALITY,
      reason: `Rework rose from ${fmt(prev.reworkCount)} to ${fmt(current.reworkCount)}.`,
      ownerAlert: false,
    });
  }

  // Capacity utilization: higher utilization past prior = worse (overstretch).
  if (rose(prev.capacityUtilizationPct, current.capacityUtilizationPct)) {
    changes.push({
      category: ChangeCategory.CAPACITY_WORSENED,
      direction: "WORSENED",
      businessFunction: BusinessFunction.CAPACITY,
      reason: `Capacity utilization rose from ${fmt(prev.capacityUtilizationPct)}% to ${fmt(current.capacityUtilizationPct)}%.`,
      ownerAlert: false,
    });
  }

  // Staff overload: more = worse.
  if (rose(prev.staffOverloadPct, current.staffOverloadPct)) {
    changes.push({
      category: ChangeCategory.STAFF_OVERLOAD_WORSENED,
      direction: "WORSENED",
      businessFunction: BusinessFunction.EMPLOYEE_WORKLOAD,
      reason: `Staff overload rose from ${fmt(prev.staffOverloadPct)}% to ${fmt(current.staffOverloadPct)}%.`,
      ownerAlert: true,
    });
  }

  // Owner load: more = worse.
  if (rose(prev.ownerLoadPct, current.ownerLoadPct)) {
    changes.push({
      category: ChangeCategory.OWNER_OVERLOAD_WORSENED,
      direction: "WORSENED",
      businessFunction: BusinessFunction.OWNER_WORKLOAD,
      reason: `Owner load rose from ${fmt(prev.ownerLoadPct)}% to ${fmt(current.ownerLoadPct)}%.`,
      ownerAlert: true,
    });
  }

  // Churn risk: higher = worse.
  if (rose(prev.churnRiskScore, current.churnRiskScore)) {
    changes.push({
      category: ChangeCategory.CUSTOMER_CHURN_RISK_INCREASED,
      direction: "WORSENED",
      businessFunction: BusinessFunction.CUSTOMER_RETENTION,
      reason: `Customer churn risk rose from ${fmt(prev.churnRiskScore)} to ${fmt(current.churnRiskScore)}.`,
      ownerAlert: false,
    });
  }

  // Supplier / inventory risk: higher = worse.
  if (rose(prev.supplierInventoryRiskScore, current.supplierInventoryRiskScore)) {
    changes.push({
      category: ChangeCategory.SUPPLIER_INVENTORY_RISK_INCREASED,
      direction: "WORSENED",
      businessFunction: BusinessFunction.SUPPLIER,
      reason: `Supplier/inventory risk rose from ${fmt(prev.supplierInventoryRiskScore)} to ${fmt(current.supplierInventoryRiskScore)}.`,
      ownerAlert: false,
    });
  }

  // Overdue proof: outstanding now (or increased) = worse.
  if (current.overdueProofCount > 0 && rose(prev.overdueProofCount, current.overdueProofCount)) {
    changes.push({
      category: ChangeCategory.PROOF_OVERDUE,
      direction: "WORSENED",
      businessFunction: BusinessFunction.EVIDENCE_PROOF,
      reason: `Overdue proof items rose from ${fmt(prev.overdueProofCount)} to ${fmt(current.overdueProofCount)}.`,
      ownerAlert: true,
    });
  } else if (current.overdueProofCount > 0 && !rose(prev.overdueProofCount, current.overdueProofCount)) {
    // Still outstanding (unchanged or reduced but not cleared) — surface as a standing alert.
    changes.push({
      category: ChangeCategory.PROOF_OVERDUE,
      direction: "WORSENED",
      businessFunction: BusinessFunction.EVIDENCE_PROOF,
      reason: `${fmt(current.overdueProofCount)} proof item(s) remain overdue.`,
      ownerAlert: true,
    });
  }

  // Outcome checks due: any pending = surface.
  if (current.outcomeChecksDue > 0) {
    changes.push({
      category: ChangeCategory.OUTCOME_CHECK_DUE,
      direction: "NEUTRAL",
      businessFunction: BusinessFunction.OUTCOME_LEARNING,
      reason: `${fmt(current.outcomeChecksDue)} outcome check(s) are due.`,
      ownerAlert: true,
    });
  }

  // Growth readiness tier change.
  if (prev.growthReadinessTier !== current.growthReadinessTier) {
    const prevRank = tierRank(prev.growthReadinessTier);
    const currRank = tierRank(current.growthReadinessTier);
    const worse = currRank < prevRank;
    const better = currRank > prevRank;
    changes.push({
      category: ChangeCategory.GROWTH_READINESS_CHANGED,
      direction: worse ? "WORSENED" : better ? "IMPROVED" : "NEUTRAL",
      businessFunction: BusinessFunction.GROWTH_READINESS,
      reason: `Growth readiness changed from ${prev.growthReadinessTier} to ${current.growthReadinessTier}.`,
      ownerAlert: worse,
    });
  }

  return changes;
}

/** Filter to changes flagged for owner attention. */
export function ownerAlerts(changes: DetectedChange[]): DetectedChange[] {
  return changes.filter((c) => c.ownerAlert === true);
}

/** Filter to changes whose direction is a worsening. */
export function worseningChanges(changes: DetectedChange[]): DetectedChange[] {
  return changes.filter((c) => c.direction === "WORSENED");
}
