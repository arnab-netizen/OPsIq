/**
 * Owner Connectors & Data Intake (Module 10) — per-target-domain field specs.
 *
 * Maps an intake `targetDomain` to the canonical columns the engine validates +
 * normalizes against. Field names match each domain's snapshot input so a confirmed
 * intake can later map cleanly onto a domain snapshot (that mapping is a future
 * slice — this registry only drives validation/normalization here). v1 covers the
 * period-snapshot domains with confidently-known field sets; cashflow + strategy
 * intake specs are deferred (stated as a known limitation, not invented).
 */
import type { IntakeFieldSpec } from "./types";

export const INTAKE_TARGET_DOMAINS = ["finance", "sales", "operations", "sop", "marketing"] as const;
export type IntakeTargetDomain = (typeof INTAKE_TARGET_DOMAINS)[number];

const PERIOD: IntakeFieldSpec[] = [
  { name: "periodStart", type: "date", required: true, label: "Period start" },
  { name: "periodEnd", type: "date", required: true, label: "Period end" },
  { name: "currency", type: "string", required: true, label: "Currency" },
];

/** Non-negative numeric/currency column helper. */
function n(name: string, type: "number" | "currency" = "number"): IntakeFieldSpec {
  return { name, type, nonNegative: true };
}

/** Valid GST basis values for finance intake. */
export const GST_BASIS_VALUES = ["inclusive", "exclusive"] as const;
export type GstBasis = (typeof GST_BASIS_VALUES)[number];

export const INTAKE_FIELD_SPECS: Record<IntakeTargetDomain, IntakeFieldSpec[]> = {
  finance: [
    ...PERIOD,
    { name: "gstBasis", type: "string", required: false, label: "GST basis (inclusive | exclusive)" },
    n("revenue", "currency"),
    n("costOfGoodsOrServices", "currency"),
    n("fixedCosts", "currency"),
    n("variableCosts", "currency"),
    { ...n("cashOnHand", "currency"), label: "Cash in hand (not the bank)" },
    n("receivables", "currency"),
  ],
  sales: [
    ...PERIOD,
    n("leads"),
    n("qualifiedLeads"),
    n("orders"),
    n("revenue", "currency"),
    n("averageOrderValue", "currency"),
    n("newCustomers"),
    n("repeatCustomers"),
    n("lostCustomers"),
    n("complaints"),
    n("discountAmount", "currency"),
    n("refundAmount", "currency"),
  ],
  operations: [
    ...PERIOD,
    n("ordersReceived"),
    n("ordersCompleted"),
    n("ordersDelayed"),
    n("reworkCount"),
    n("complaints"),
    n("staffHours"),
    n("machineCapacityUnits"),
    n("idleHours"),
    n("deliveryAttempts"),
    n("deliveryFailures"),
    n("inventoryShortages"),
    n("sopChecks"),
    n("sopMisses"),
  ],
  sop: [
    ...PERIOD,
    n("actionsAssigned"),
    n("actionsCompleted"),
    n("actionsVerified"),
    n("actionsOverdue"),
    n("actionsDisputed"),
    n("actionsReassigned"),
    n("repeatedFailures"),
    n("proofRequired"),
    n("proofProvided"),
    n("recurringProcesses"),
    n("documentedSops"),
  ],
  marketing: [
    ...PERIOD,
    n("marketingSpend", "currency"),
    n("revenue", "currency"),
    n("leads"),
    n("inquiries"),
    n("orders"),
    n("newCustomers"),
    n("paidLeads"),
    n("organicLeads"),
    n("campaignsRun"),
    n("campaignsWithFollowup"),
    n("contentPosted"),
    n("couponsRedeemed"),
    n("referrals"),
    n("walkIns"),
  ],
};

/** Resolve the field spec for a target domain, or null when unsupported. */
export function fieldSpecForDomain(domain: string): IntakeFieldSpec[] | null {
  return (INTAKE_FIELD_SPECS as Record<string, IntakeFieldSpec[]>)[domain] ?? null;
}
