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
  /** Since the businessId migration (capacity/workload/proof/standing instruction are now business-scoped
   *  alongside cashflow/finance/compliance/working-capital), EVERY scenario renders distinctly per-business
   *  inside one workspace. Kept as an explicit flag so the browser suite iterates the full set. */
  browserDistinguishable: boolean;
  /** When set, the seed grants a DELIBERATE `owner.safe-action-approved` standing instruction at this risk
   *  class for the scenario business, so a genuinely-safe healthy business resolves to proceed (low) /
   *  cautious_proceed (medium) through the real runtime. Absent on every other scenario (unchanged). */
  safeActionSop?: "low" | "medium";
  /** When set, the seed removes the persisted finance/cash/working-capital rows AFTER seeding, so the
   *  critical-evidence providers report DATA_SOURCE_MISSING and the runtime resolves to need_more_data —
   *  proving (browser-side) that an SOP grant can never fake missing evidence. */
  stripCriticalData?: boolean;
  knobs: ScenarioKnobs;
}

const HEALTHY: ScenarioKnobs = {
  cashInHand: 60000, receivablesOverdue: 0, overdueWcReceivable: false,
  revenue: 320000, costOfGoods: 240000, bottleneckUtilization: 0.6, growthSafe: true,
  complianceExpired: false, proofDuplicate: false, proofUnsubmitted: false, workloadOverloaded: false,
};

/** The 10 representative flows. All are business-scoped → all render distinctly in one workspace. */
export const SCENARIOS: Scenario[] = [
  { id: "cash_crisis", label: "Cash crisis", expectedConstraint: "cash_survival", mobile: true, browserDistinguishable: true,
    knobs: { ...HEALTHY, cashInHand: 0, receivablesOverdue: 80000, overdueWcReceivable: true } },
  { id: "bad_contract", label: "Bad contract / opportunity (below margin)", expectedConstraint: "below_margin", mobile: true, browserDistinguishable: true,
    knobs: { ...HEALTHY, revenue: 200000, costOfGoods: 240000 } },
  { id: "marketing_blocked", label: "Marketing blocked by capacity/quality", expectedConstraint: "capacity_feasibility", mobile: false, browserDistinguishable: true,
    knobs: { ...HEALTHY, bottleneckUtilization: 1.2, growthSafe: false } },
  { id: "owner_overload", label: "Owner workload overload", expectedConstraint: "owner_workload", mobile: true, browserDistinguishable: true,
    knobs: { ...HEALTHY, workloadOverloaded: true } },
  { id: "proof_fraud", label: "Proof / fake completion risk", expectedConstraint: "proof_fraud_block", mobile: false, browserDistinguishable: true,
    knobs: { ...HEALTHY, proofDuplicate: true } },
  { id: "vendor_compliance", label: "Vendor / supplier compliance issue", expectedConstraint: "compliance_block", mobile: true, browserDistinguishable: true,
    knobs: { ...HEALTHY, complianceExpired: true } },
  { id: "delivery_capacity", label: "Delivery / logistics capacity issue", expectedConstraint: "capacity_feasibility", mobile: false, browserDistinguishable: true,
    knobs: { ...HEALTHY, bottleneckUtilization: 1.3, growthSafe: false } },
  { id: "growth_scale", label: "Growth / scale decision (healthy)", expectedConstraint: "profitable_growth", mobile: false, browserDistinguishable: true,
    knobs: { ...HEALTHY } },
  { id: "shutdown_pivot", label: "Shutdown / pivot / stop-loss", expectedConstraint: "cash_survival", mobile: false, browserDistinguishable: true,
    knobs: { ...HEALTHY, cashInHand: 0, receivablesOverdue: 120000, overdueWcReceivable: true } },
  { id: "multi_location_remote", label: "Multi-location / remote-owner control", expectedConstraint: "owner_workload", mobile: true, browserDistinguishable: true,
    knobs: { ...HEALTHY, workloadOverloaded: true } },
];

/**
 * Safe-action SCENARIO PROFILES (§5 action-status spectrum). Both are genuinely healthy businesses whose
 * dominant constraint is `profitable_growth` (no binding risk) — identical to `growth_scale` EXCEPT each
 * carries a DELIBERATE owner `owner.safe-action-approved` standing instruction. That explicit owner grant
 * is what lets the runtime downgrade the otherwise owner-decision disposition: a `low` risk class yields
 * `proceed`; a `medium` risk class yields `cautious_proceed`. Kept OUT of `SCENARIOS` so no existing browser
 * / chaos / DB spec changes; spec 20 + the cautious-proceed DB proof iterate this array explicitly.
 */
export const SAFE_ACTION_SCENARIOS: Scenario[] = [
  { id: "safe_proceed", label: "Safe proceed (healthy + low-risk SOP-approved action)", expectedConstraint: "profitable_growth", mobile: true, browserDistinguishable: true, safeActionSop: "low",
    knobs: { ...HEALTHY } },
  { id: "safe_cautious", label: "Cautious proceed (healthy + medium-risk reversible SOP-approved action)", expectedConstraint: "profitable_growth", mobile: false, browserDistinguishable: true, safeActionSop: "medium",
    knobs: { ...HEALTHY } },
  // Healthy business WITH an SOP grant but its critical finance/cash evidence stripped after seeding →
  // need_more_data. Proves (browser-side) the SOP grant cannot fake missing evidence.
  { id: "safe_needs_data", label: "Need more data (SOP-approved but critical evidence missing)", expectedConstraint: "profitable_growth", mobile: false, browserDistinguishable: true, safeActionSop: "low", stripCriticalData: true,
    knobs: { ...HEALTHY } },
];

/** All 10 flows are business-scoped → render distinctly in the browser within one workspace. */
export const BROWSER_SCENARIOS = SCENARIOS.filter((s) => s.browserDistinguishable);
/** Mobile-viewport subset (≥3; spans cash_survival, below_margin, owner_workload, compliance_block). */
export const MOBILE_SCENARIOS = BROWSER_SCENARIOS.filter((s) => s.mobile);

/** Deterministic business id per scenario (shared by the DB seed + the Playwright spec). */
export function scenarioBusinessId(id: string): string {
  let h = 5381;
  for (const c of `scn-${id}:biz0`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 4); // 4 hex
  return `00000000-0000-4000-8000-${node}62697a30`; // 4 + 8 = 12 hex node

}

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
