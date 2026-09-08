/**
 * Founder Recovery — input validation (Zod).
 *
 * Enforces required reporting period + currency, numeric typing, non-negative
 * values except where negativity is legitimate (profit can be negative), and
 * basic impossibility checks. Used by the API layer; duplicate-period and
 * workspace-ownership are enforced in the service layer.
 */
import { z } from "zod/v4";
import { BUSINESS_TYPES } from "./types";

export const businessCreateSchema = z.object({
  name: z.string().min(1, "Business name is required").max(200),
  businessType: z.enum(BUSINESS_TYPES),
  location: z.string().max(200).optional(),
  currency: z.string().min(1, "Currency is required").max(8),
  operatingModel: z.string().max(200).optional(),
  b2cSupported: z.boolean().optional().default(true),
  b2bSupported: z.boolean().optional().default(false),
  // Honored only when the requesting actor holds SYSTEM_ADMIN — see the POST route handler and
  // ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md. A self-serve owner can send this field but it is
  // silently ignored without that capability, never surfaced as an error (it is not a field an
  // ordinary owner has any legitimate reason to know about).
  isFixtureBusiness: z.boolean().optional(),
});
export type BusinessCreateInput = z.infer<typeof businessCreateSchema>;

export const businessUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  location: z.string().max(200).optional(),
  operatingModel: z.string().max(200).optional(),
  b2cSupported: z.boolean().optional(),
  b2bSupported: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;

/** Non-negative metric (counts, costs, amounts that cannot be negative). */
const nonNeg = z.number().min(0, "Value cannot be negative").optional();
/** Signed metric (profit can be negative). */
const signed = z.number().optional();

export const metricSnapshotSchema = z
  .object({
    periodStart: z.string().min(1, "Reporting period start is required"),
    periodEnd: z.string().min(1, "Reporting period end is required"),
    currency: z.string().min(1, "Currency is required").max(8),

    revenue: nonNeg,
    totalCosts: nonNeg,
    grossProfit: signed,
    netProfit: signed,
    orderCount: nonNeg,
    kgProcessed: nonNeg,
    piecesProcessed: nonNeg,
    b2cRevenue: nonNeg,
    b2bRevenue: nonNeg,
    newCustomers: nonNeg,
    repeatCustomers: nonNeg,
    dormantContacted: nonNeg,
    averageOrderValue: nonNeg,
    discountAmount: nonNeg,
    refundAmount: nonNeg,
    rewashCount: nonNeg,
    complaintCount: nonNeg,
    receivables: nonNeg,
    staffCost: nonNeg,
    rentCost: nonNeg,
    utilitiesCost: nonNeg,
    materialCost: nonNeg,
    deliveryCost: nonNeg,
    marketingSpend: nonNeg,
    campaignConversions: nonNeg,
    averageTurnaroundHours: nonNeg,
    staffProductivity: nonNeg,
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (s) => new Date(s.periodEnd).getTime() >= new Date(s.periodStart).getTime(),
    { message: "periodEnd must be on or after periodStart", path: ["periodEnd"] }
  )
  .refine(
    (s) => !Number.isNaN(new Date(s.periodStart).getTime()) && !Number.isNaN(new Date(s.periodEnd).getTime()),
    { message: "Reporting period must be valid dates", path: ["periodStart"] }
  )
  .refine(
    // Impossibility check: B2B + B2C cannot exceed total revenue (allow small rounding).
    (s) => {
      if (s.revenue === undefined) return true;
      const split = (s.b2bRevenue ?? 0) + (s.b2cRevenue ?? 0);
      return split <= s.revenue * 1.01 + 1;
    },
    { message: "B2B + B2C revenue cannot exceed total revenue", path: ["b2bRevenue"] }
  )
  .refine(
    // Impossibility check: repeat customers cannot exceed orders when both given.
    (s) => {
      if (s.repeatCustomers === undefined || s.orderCount === undefined) return true;
      return s.repeatCustomers <= s.orderCount;
    },
    { message: "Repeat customers cannot exceed order count", path: ["repeatCustomers"] }
  );
export type MetricSnapshotZodInput = z.infer<typeof metricSnapshotSchema>;

/** Critical metrics whose absence weakens diagnosis (flagged, not rejected). */
export const CRITICAL_METRIC_FIELDS = ["revenue", "totalCosts", "orderCount"] as const;

export function missingCriticalMetrics(snapshot: Record<string, unknown>): string[] {
  return CRITICAL_METRIC_FIELDS.filter(
    (f) => snapshot[f] === undefined || snapshot[f] === null
  );
}

/** Stale if the reporting period ended more than `maxAgeDays` ago. */
export function isStaleSnapshot(periodEnd: string, now: Date, maxAgeDays = 45): boolean {
  const end = new Date(periodEnd).getTime();
  if (Number.isNaN(end)) return false;
  const ageDays = (now.getTime() - end) / (1000 * 60 * 60 * 24);
  return ageDays > maxAgeDays;
}
