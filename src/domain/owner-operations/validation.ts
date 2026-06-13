/**
 * Owner Operations (Module 4) — API input validation (Zod v4).
 *
 * Validates write-path payloads at the route boundary. Reuses the Module 1
 * action-status vocabulary and the Spine target directions. Missing data stays
 * missing (optional fields); negative inputs are rejected (fail closed).
 */
import { z } from "zod/v4";
import { OPERATIONS_BUSINESS_MODELS } from "./types";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

/** Non-negative optional metric/count. */
const nonNeg = z.number().min(0, "Value cannot be negative").optional();

export const operationsSnapshotCreateSchema = z
  .object({
    periodStart: z.string().min(1, "Reporting period start is required"),
    periodEnd: z.string().min(1, "Reporting period end is required"),
    currency: z.string().min(1, "Currency is required").max(8),
    businessModel: z.enum(OPERATIONS_BUSINESS_MODELS).optional(),
    industryTemplate: z.string().max(100).optional(),

    ordersReceived: nonNeg,
    ordersCompleted: nonNeg,
    ordersDelayed: nonNeg,
    reworkCount: nonNeg,
    complaints: nonNeg,
    staffHours: nonNeg,
    machineCapacityUnits: nonNeg,
    idleHours: nonNeg,
    deliveryAttempts: nonNeg,
    deliveryFailures: nonNeg,
    inventoryShortages: nonNeg,
    sopChecks: nonNeg,
    sopMisses: nonNeg,
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
export type OperationsSnapshotCreateInput = z.infer<typeof operationsSnapshotCreateSchema>;

export const runOperationsDiagnosisSchema = z.object({
  snapshotId: z.string().uuid(),
});
export type RunOperationsDiagnosisInput = z.infer<typeof runOperationsDiagnosisSchema>;

export const operationsActionUpdateSchema = z.object({
  status: z.enum(RECOVERY_ACTION_STATUSES).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  completionNotes: z.string().max(2000).optional(),
  completionEvidence: z.array(z.string()).optional(),
});
export type OperationsActionUpdateInput = z.infer<typeof operationsActionUpdateSchema>;

export const operationsVerifySchema = z.object({
  beforeValue: z.number().nullable(),
  afterValue: z.number().nullable(),
  targetDirection: z.enum(["up", "down"]),
  targetValue: z.number().nullable().optional(),
  evidence: z.array(z.string()).optional(),
  disputed: z.boolean().optional(),
});
export type OperationsVerifyInput = z.infer<typeof operationsVerifySchema>;
