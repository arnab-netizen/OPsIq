/**
 * Jarvis 360 gap-closure (G26,G27) — realistic owner-loop seed (laundry archetype).
 *
 * Strict re-audit finding: all owner models were generic/empty with no seed/import path,
 * so no realistic owner loop could start. This provides a validated, archetype-specific
 * seed template (laundry — an equipment-heavy SMB) covering business profile, staff,
 * equipment/capacity, SOP/checklist, process, a sample customer + complaint, finance/
 * margin data, and a sample opportunity. Validated with Zod (source validation), pure
 * (no DB) so it is reusable by service-level loop tests and a future import endpoint.
 */

import { z } from "zod";

const money = z.number().finite().nonnegative();

export const ArchetypeSeedSchema = z.object({
  archetype: z.literal("laundry"),
  business: z.object({
    name: z.string().min(1),
    businessType: z.string().min(1),
    currency: z.string().length(3),
    monthlyRevenue: money,
    costOfGoods: money,
    fixedCosts: money,
    cashOnHand: money,
  }),
  staff: z
    .array(z.object({ role: z.string().min(1), name: z.string().min(1), skills: z.array(z.string()).min(1) }))
    .min(1),
  equipment: z
    .array(
      z.object({
        name: z.string().min(1),
        utilization: z.number().min(0).max(1),
        downtimeState: z.enum(["none", "partial", "down"]),
        maintenanceDueInDays: z.number().int(),
      })
    )
    .min(1),
  sops: z
    .array(z.object({ title: z.string().min(1), steps: z.array(z.string().min(1)).min(1), status: z.enum(["draft", "approved"]) }))
    .min(1),
  processes: z.array(z.object({ name: z.string().min(1), reviewIntervalDays: z.number().int().positive() })).min(1),
  customers: z
    .array(z.object({ name: z.string().min(1), monthlyValue: money }))
    .min(1),
  complaints: z
    .array(z.object({ customer: z.string().min(1), category: z.string().min(1), description: z.string().min(1) }))
    .min(0),
  opportunities: z
    .array(
      z.object({
        title: z.string().min(1),
        estimatedMonthlyRevenue: money,
        estimatedMarginPct: z.number().min(-1).max(1),
        requiresCapacity: z.boolean(),
      })
    )
    .min(1),
});

export type ArchetypeSeed = z.infer<typeof ArchetypeSeedSchema>;

/** Build the laundry archetype seed. Pure + validated; throws on an invalid template. */
export function buildLaundryArchetypeSeed(): ArchetypeSeed {
  const seed: ArchetypeSeed = {
    archetype: "laundry",
    business: {
      name: "Sunrise Laundry & Dry Cleaning",
      businessType: "laundry",
      currency: "USD",
      monthlyRevenue: 42000,
      costOfGoods: 16000,
      fixedCosts: 18000,
      cashOnHand: 9000,
    },
    staff: [
      { role: "owner", name: "Priya", skills: ["operations", "customer_service"] },
      { role: "machine_operator", name: "Marcus", skills: ["washing", "pressing"] },
      { role: "front_desk", name: "Dana", skills: ["intake", "customer_service"] },
    ],
    equipment: [
      { name: "Industrial Washer #1", utilization: 0.92, downtimeState: "none", maintenanceDueInDays: 5 },
      { name: "Industrial Washer #2", utilization: 0.88, downtimeState: "partial", maintenanceDueInDays: -2 },
      { name: "Steam Press", utilization: 0.7, downtimeState: "none", maintenanceDueInDays: 20 },
      { name: "Dryer Bank", utilization: 0.95, downtimeState: "none", maintenanceDueInDays: 10 },
    ],
    sops: [
      { title: "Wash-load handling", steps: ["Sort by fabric", "Set program", "Log load", "Verify before dry"], status: "approved" },
      { title: "Customer intake", steps: ["Tag items", "Record special instructions", "Issue ticket"], status: "draft" },
    ],
    processes: [
      { name: "Daily machine maintenance check", reviewIntervalDays: 7 },
      { name: "Monthly margin review", reviewIntervalDays: 30 },
    ],
    customers: [
      { name: "Grand Hotel (contract)", monthlyValue: 12000 },
      { name: "Walk-in retail", monthlyValue: 8000 },
    ],
    complaints: [
      { customer: "Grand Hotel (contract)", category: "quality", description: "Repeated staining on returned linens." },
    ],
    opportunities: [
      { title: "Second hotel linen contract", estimatedMonthlyRevenue: 10000, estimatedMarginPct: 0.22, requiresCapacity: true },
      { title: "Same-day express service tier", estimatedMonthlyRevenue: 4000, estimatedMarginPct: 0.35, requiresCapacity: false },
    ],
  };
  // Source validation: a malformed template is a hard error, not silent bad data.
  return ArchetypeSeedSchema.parse(seed);
}

/** Validate an externally-provided archetype seed (import path). Throws on invalid input. */
export function validateArchetypeSeed(input: unknown): ArchetypeSeed {
  return ArchetypeSeedSchema.parse(input);
}
