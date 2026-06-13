/**
 * Owner Strategy & Scenario Planning (Module 8) — API input validation (Zod v4).
 *
 * Validates write-path payloads at the route boundary. Reuses the Module 1
 * action-status vocabulary and the Spine target directions. Revenue/cost changes
 * may be negative (a cost cut or a revenue dip is a valid scenario); other
 * quantities are non-negative (fail closed). Missing data stays missing.
 */
import { z } from "zod/v4";
import { STRATEGY_BUSINESS_MODELS, STRATEGY_RISK_LEVELS } from "./types";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

/** Non-negative optional quantity. */
const nonNeg = z.number().min(0, "Value cannot be negative").optional();
/** Signed optional delta (revenue/cost changes may be negative). */
const signed = z.number().optional();

export const strategySnapshotCreateSchema = z
  .object({
    periodStart: z.string().min(1, "Reporting period start is required"),
    periodEnd: z.string().min(1, "Reporting period end is required"),
    currency: z.string().min(1, "Currency is required").max(8),
    businessModel: z.enum(STRATEGY_BUSINESS_MODELS).optional(),
    industryTemplate: z.string().max(100).optional(),
    optionName: z.string().max(200).optional(),

    currentRevenue: nonNeg,
    expectedRevenueChange: signed,
    costChange: signed,
    investmentRequired: nonNeg,
    timeToImpactMonths: nonNeg,
    riskLevel: z.enum(STRATEGY_RISK_LEVELS).optional(),
    cashAvailable: nonNeg,
    capacityImpactPct: nonNeg,
    staffImpact: signed,
    notes: z.string().max(2000).optional(),
  })
  .refine((s) => new Date(s.periodEnd).getTime() >= new Date(s.periodStart).getTime(), {
    message: "periodEnd must be on or after periodStart",
    path: ["periodEnd"],
  })
  .refine(
    (s) =>
      !Number.isNaN(new Date(s.periodStart).getTime()) &&
      !Number.isNaN(new Date(s.periodEnd).getTime()),
    { message: "Reporting period must be valid dates", path: ["periodStart"] }
  );
export type StrategySnapshotCreateInput = z.infer<typeof strategySnapshotCreateSchema>;

export const runStrategyDiagnosisSchema = z.object({
  snapshotId: z.string().uuid(),
});
export type RunStrategyDiagnosisInput = z.infer<typeof runStrategyDiagnosisSchema>;

export const strategyActionUpdateSchema = z.object({
  status: z.enum(RECOVERY_ACTION_STATUSES).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  completionNotes: z.string().max(2000).optional(),
  completionEvidence: z.array(z.string()).optional(),
});
export type StrategyActionUpdateInput = z.infer<typeof strategyActionUpdateSchema>;

export const strategyVerifySchema = z.object({
  beforeValue: z.number().nullable(),
  afterValue: z.number().nullable(),
  targetDirection: z.enum(["up", "down"]),
  targetValue: z.number().nullable().optional(),
  evidence: z.array(z.string()).optional(),
  disputed: z.boolean().optional(),
});
export type StrategyVerifyInput = z.infer<typeof strategyVerifySchema>;
