/**
 * Module 32 — Local Home Services / Maintenance Operating Pack (pure domain core).
 *
 * Adds a structured knowledge-pack skeleton for local home-services / maintenance
 * businesses (plumbing, electrical, HVAC, handyman, field maintenance) in the same
 * style as the Slice 22 archetype packs, plus two field-service domain helpers.
 *
 * This module reuses the existing archetype-pack primitives (createArchetypePack,
 * assessPackConfidence, ArchetypeKnowledgePack) rather than redefining them.
 *
 * Pure + deterministic: no Date.now(), no Math.random(), no mutation of inputs.
 */

import {
  createArchetypePack,
  assessPackConfidence,
  type ArchetypeKnowledgePack,
} from "@/domain/execution/archetype-packs";

export { assessPackConfidence };

export const HOME_SERVICES_PACK_SLOTS = [
  "service_area_radius_km",
  "dispatch_and_scheduling_model",
  "emergency_callout_policy",
  "parts_inventory_and_markup",
  "technician_certification_requirements",
  "callback_and_warranty_policy",
  "seasonal_demand_patterns",
  "pricing_model_flat_vs_hourly",
  "first_time_fix_rate_targets",
  "insurance_and_liability_coverage",
  "subcontractor_vs_inhouse_mix",
  "review_and_reputation_channels",
] as const;

export function createHomeServicesPack(): ArchetypeKnowledgePack {
  return createArchetypePack("home_services", HOME_SERVICES_PACK_SLOTS);
}

export type DispatchEfficiencyBand = "EFFICIENT" | "ACCEPTABLE" | "POOR";

export interface DispatchEfficiencyInput {
  jobsCompleted: number;
  jobsScheduled: number;
  avgTravelMinutes: number;
  billableMinutes: number;
}

export interface DispatchEfficiencyResult {
  completionRate: number;
  travelRatio: number;
  efficiencyBand: DispatchEfficiencyBand;
}

/**
 * Assess field-service dispatch efficiency.
 *
 * - completionRate = jobsCompleted / jobsScheduled (0 when nothing scheduled).
 * - travelRatio = avgTravelMinutes / (avgTravelMinutes + billableMinutes), i.e. the
 *   share of technician time spent travelling rather than on billable work
 *   (0 when there is no time at all to attribute).
 *
 * Banding:
 * - POOR when completion is low (< 0.7) or travel dominates (travelRatio > 0.4).
 * - EFFICIENT when completion is strong (>= 0.9) and travel is low (<= 0.25).
 * - ACCEPTABLE otherwise.
 *
 * Guarded against divide-by-zero on both ratios.
 */
export function assessDispatchEfficiency(
  input: DispatchEfficiencyInput
): DispatchEfficiencyResult {
  const jobsCompleted = Math.max(0, input.jobsCompleted);
  const jobsScheduled = Math.max(0, input.jobsScheduled);
  const avgTravelMinutes = Math.max(0, input.avgTravelMinutes);
  const billableMinutes = Math.max(0, input.billableMinutes);

  const completionRate = jobsScheduled === 0 ? 0 : jobsCompleted / jobsScheduled;

  const totalMinutes = avgTravelMinutes + billableMinutes;
  const travelRatio = totalMinutes === 0 ? 0 : avgTravelMinutes / totalMinutes;

  let efficiencyBand: DispatchEfficiencyBand;
  if (completionRate < 0.7 || travelRatio > 0.4) {
    efficiencyBand = "POOR";
  } else if (completionRate >= 0.9 && travelRatio <= 0.25) {
    efficiencyBand = "EFFICIENT";
  } else {
    efficiencyBand = "ACCEPTABLE";
  }

  return { completionRate, travelRatio, efficiencyBand };
}

export interface FirstTimeFixInput {
  firstVisitResolved: number;
  totalJobs: number;
}

/**
 * First-time-fix rate: share of jobs resolved on the first visit.
 * Returns 0 when there are no jobs (divide-by-zero guard).
 */
export function firstTimeFixRate(input: FirstTimeFixInput): number {
  const totalJobs = Math.max(0, input.totalJobs);
  if (totalJobs === 0) {
    return 0;
  }
  const firstVisitResolved = Math.max(0, input.firstVisitResolved);
  return firstVisitResolved / totalJobs;
}
