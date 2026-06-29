/**
 * Representative owner-business SCENARIO PROFILES for the browser-representative E2E.
 *
 * Each profile is a set of "knobs" that, when persisted as the full critical-domain row set, makes the
 * production owner-advice runtime resolve a specific dominant constraint (so the command-center whole-
 * business card renders a distinct, faithful plan per flow). The model has 7 blocking constraints, so the
 * 10 flows exercise 7 distinct constraints (some flows faithfully share where the business genuinely binds
 * there). The SAME knobs drive both the mock-DB unit proof and the real DB seed — one source of truth.
 */
import type { Constraint } from "@/behavioral-validation/whole-business/arbitration";
import type { OwnerDomainRows } from "./owner-db-providers";

export interface ScenarioKnobs {
  cashInHand: number;
  receivablesOverdue: number;
  overdueWcReceivable: boolean;
  revenue: number;
  costOfGoods: number;
  bottleneckUtilization: number;
  growthSafe: boolean;
  complianceExpired: boolean;
  proofDuplicate: boolean;
  proofUnsubmitted: boolean;
  workloadOverloaded: boolean;
}

export interface Scenario {
  id: string;
  label: string;
  expectedConstraint: Constraint;
  mobile: boolean;
  knobs: ScenarioKnobs;
}

const HEALTHY: ScenarioKnobs = {
  cashInHand: 60000, receivablesOverdue: 0, overdueWcReceivable: false,
  revenue: 320000, costOfGoods: 240000, bottleneckUtilization: 0.6, growthSafe: true,
  complianceExpired: false, proofDuplicate: false, proofUnsubmitted: false, workloadOverloaded: false,
};

/** The 10 representative flows. */
export const SCENARIOS: Scenario[] = [
  { id: "cash_crisis", label: "Cash crisis", expectedConstraint: "cash_survival", mobile: true,
    knobs: { ...HEALTHY, cashInHand: 0, receivablesOverdue: 80000, overdueWcReceivable: true } },
  { id: "bad_contract", label: "Bad contract / opportunity (below margin)", expectedConstraint: "below_margin", mobile: false,
    knobs: { ...HEALTHY, revenue: 200000, costOfGoods: 240000 } },
  { id: "marketing_blocked", label: "Marketing blocked by capacity/quality", expectedConstraint: "capacity_feasibility", mobile: false,
    knobs: { ...HEALTHY, bottleneckUtilization: 1.2, growthSafe: false } },
  { id: "owner_overload", label: "Owner workload overload", expectedConstraint: "owner_workload", mobile: true,
    knobs: { ...HEALTHY, workloadOverloaded: true } },
  { id: "proof_fraud", label: "Proof / fake completion risk", expectedConstraint: "proof_fraud_block", mobile: false,
    knobs: { ...HEALTHY, proofDuplicate: true } },
  { id: "vendor_compliance", label: "Vendor / supplier compliance issue", expectedConstraint: "compliance_block", mobile: false,
    knobs: { ...HEALTHY, complianceExpired: true } },
  { id: "delivery_capacity", label: "Delivery / logistics capacity issue", expectedConstraint: "capacity_feasibility", mobile: false,
    knobs: { ...HEALTHY, bottleneckUtilization: 1.3, growthSafe: false } },
  { id: "growth_scale", label: "Growth / scale decision (healthy)", expectedConstraint: "profitable_growth", mobile: false,
    knobs: { ...HEALTHY } },
  { id: "shutdown_pivot", label: "Shutdown / pivot / stop-loss", expectedConstraint: "cash_survival", mobile: false,
    knobs: { ...HEALTHY, cashInHand: 0, receivablesOverdue: 120000, overdueWcReceivable: true } },
  { id: "multi_location_remote", label: "Multi-location / remote-owner control", expectedConstraint: "owner_workload", mobile: true,
    knobs: { ...HEALTHY, workloadOverloaded: true } },
];

export const MOBILE_SCENARIOS = SCENARIOS.filter((s) => s.mobile);

/** Build a full OwnerDomainRows bundle from knobs (for the mock-DB unit proof + provider checks). */
export function scenarioRows(k: ScenarioKnobs, ids: { workspaceId: string; businessId: string; now: Date }): OwnerDomainRows {
  const { now } = ids;
  const day = 86_400_000;
  const future = new Date(now.getTime() + 90 * day);
  const past = new Date(now.getTime() - 10 * day);
  return {
    cashflow: { periodEnd: now, cashInHand: k.cashInHand, bankBalance: 0, receivables: 200000, receivablesOverdue: k.receivablesOverdue, payables: 30000 } as OwnerDomainRows["cashflow"],
    finance: { periodEnd: now, revenue: k.revenue, costOfGoods: k.costOfGoods, fixedCosts: 60000, variableCosts: 20000 } as OwnerDomainRows["finance"],
    wcItems: (k.overdueWcReceivable ? [{ kind: "receivable", amount: 80000, dueDate: past, status: "open" }] : [{ kind: "receivable", amount: 40000, dueDate: future, status: "open" }]) as OwnerDomainRows["wcItems"],
    capacity: { bottleneckUtilization: k.bottleneckUtilization, growthSafe: k.growthSafe, safeUtilization: 0.7, createdAt: now, expansionTriggered: false } as OwnerDomainRows["capacity"],
    compliance: [{ expiresAt: k.complianceExpired ? past : future }] as OwnerDomainRows["compliance"],
    proofs: [{ duplicateFlagged: k.proofDuplicate, status: k.proofUnsubmitted ? "REQUIRED" : "ACCEPTED", submittedAt: k.proofUnsubmitted ? null : now }] as OwnerDomainRows["proofs"],
    workload: { dailyLoadPct: k.workloadOverloaded ? 167 : 70, band: k.workloadOverloaded ? "overloaded" : "healthy", ownerOnlyCriticalTasks: k.workloadOverloaded ? 9 : 1, overloaded: k.workloadOverloaded, bottleneckRisk: k.workloadOverloaded, createdAt: now } as OwnerDomainRows["workload"],
    standingCount: 1,
    business: { id: ids.businessId, workspaceId: ids.workspaceId, name: "Scenario Business", businessType: "laundry_dry_cleaning", location: "Kolkata, West Bengal", currency: "INR" } as OwnerDomainRows["business"],
    learningCount: 1,
  };
}
