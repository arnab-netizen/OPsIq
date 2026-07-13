/**
 * Owner Mode — Capacity Assessment request validation (Zod).
 * Validates a fleet of equipment records for capacity-status analysis.
 * workspaceId is NEVER taken from the body — the route overwrites it from
 * ctx.verifiedWorkspaceId so tenants cannot cross-read.
 */
import { z } from "zod/v4";

const downtimeStateSchema = z.enum(["up", "down"]);
const equipmentStatusSchema = z.enum([
  "operational",
  "out_of_service",
  "maintenance",
  "retired",
]);

const equipmentRecordSchema = z.strictObject({
  /** Unique name or identifier for the equipment (surfaces in bottleneck list). */
  name: z.string().min(1),
  /** Current utilization as a fraction 0–1; null when not yet measured. */
  utilization: z.number().min(0).max(1).nullable(),
  /** Whether the machine is currently running or down. */
  downtimeState: downtimeStateSchema,
  /** ISO-8601 timestamp of the next or overdue maintenance date; null when not scheduled. */
  maintenanceDueAt: z.string().nullable(),
  /** Operational status of the equipment. */
  status: equipmentStatusSchema,
});

export const capacityAssessRequestSchema = z.strictObject({
  /**
   * List of equipment records to assess. Empty list is allowed — a business
   * with no tracked equipment is treated as having safe capacity.
   */
  equipment: z.array(equipmentRecordSchema),
  /**
   * ISO-8601 evaluation timestamp used to determine whether maintenance is overdue.
   * Defaults to "now" in the route when omitted.
   */
  evaluatedAt: z.string().min(1).optional(),
});

export type CapacityAssessRequest = z.infer<typeof capacityAssessRequestSchema>;
