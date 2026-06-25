/**
 * Business Progression Engine foundation (Slice 23, pure logic).
 *
 * Recommends business progression ONLY through evidence gates. Expansion is
 * blocked (fail-closed) when cash is weak, margin is unclear, repeat customers
 * are weak, staff is unstable, the owner is still firefighting, the SOP/manager
 * layer is not working, complaints/rework are rising, capacity is stressed, or
 * profit impact is unverified. Revenue-only growth is never treated as healthy.
 */

export enum ProgressionStage {
  STAGE_0_DATA_NOT_RELIABLE = "STAGE_0_DATA_NOT_RELIABLE",
  STAGE_1_SURVIVAL = "STAGE_1_SURVIVAL",
  STAGE_2_STABILIZATION = "STAGE_2_STABILIZATION",
  STAGE_3_UNIT_ECONOMICS_PROVEN = "STAGE_3_UNIT_ECONOMICS_PROVEN",
  STAGE_4_OPERATIONS_REPEATABLE = "STAGE_4_OPERATIONS_REPEATABLE",
  STAGE_5_GROWTH_EXPERIMENTS = "STAGE_5_GROWTH_EXPERIMENTS",
  STAGE_6_CAPACITY_EXPANSION = "STAGE_6_CAPACITY_EXPANSION",
  STAGE_7_CHANNEL_EXPANSION = "STAGE_7_CHANNEL_EXPANSION",
  STAGE_8_GEOGRAPHY_EXPANSION = "STAGE_8_GEOGRAPHY_EXPANSION",
  STAGE_9_MANAGEMENT_LAYER = "STAGE_9_MANAGEMENT_LAYER",
  STAGE_10_MULTI_UNIT = "STAGE_10_MULTI_UNIT",
}

export enum GrowthClassification {
  HEALTHY_GROWTH = "HEALTHY_GROWTH",
  REVENUE_ONLY_GROWTH = "REVENUE_ONLY_GROWTH",
  MARGIN_NEGATIVE_GROWTH = "MARGIN_NEGATIVE_GROWTH",
  CAPACITY_STRESSED_GROWTH = "CAPACITY_STRESSED_GROWTH",
  OWNER_DEPENDENT_GROWTH = "OWNER_DEPENDENT_GROWTH",
  RISKY_GROWTH = "RISKY_GROWTH",
  UNVERIFIED_GROWTH = "UNVERIFIED_GROWTH",
}

export enum GrowthConfidence {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export interface GrowthSignals {
  cashRunwayWeak: boolean;
  grossMarginClear: boolean;
  marginNegative?: boolean;
  repeatCustomersStrong: boolean;
  staffQualityStable: boolean;
  ownerFirefightingDaily: boolean;
  sopManagerLayerWorking: boolean;
  complaintsOrReworkRising: boolean;
  capacityStressed: boolean;
  profitImpactVerified: boolean;
  revenueGrowing: boolean;
  /** Names of signals that are unknown/unmeasured (lowers confidence). */
  unknownSignals?: string[];
}

export interface GrowthClassificationResult {
  classification: GrowthClassification;
  confidence: GrowthConfidence;
  missingData: string[];
}

export function classifyGrowth(s: GrowthSignals): GrowthClassificationResult {
  const missingData = s.unknownSignals ?? [];
  const confidence =
    missingData.length === 0
      ? GrowthConfidence.HIGH
      : missingData.length <= 2
        ? GrowthConfidence.MEDIUM
        : GrowthConfidence.LOW;

  let classification: GrowthClassification;
  if (!s.profitImpactVerified) {
    classification = GrowthClassification.UNVERIFIED_GROWTH;
  } else if (s.marginNegative) {
    classification = GrowthClassification.MARGIN_NEGATIVE_GROWTH;
  } else if (s.revenueGrowing && !s.grossMarginClear) {
    // Revenue rising without clear margin is NOT healthy growth.
    classification = GrowthClassification.REVENUE_ONLY_GROWTH;
  } else if (s.capacityStressed) {
    classification = GrowthClassification.CAPACITY_STRESSED_GROWTH;
  } else if (s.ownerFirefightingDaily) {
    classification = GrowthClassification.OWNER_DEPENDENT_GROWTH;
  } else if (s.complaintsOrReworkRising) {
    classification = GrowthClassification.RISKY_GROWTH;
  } else {
    classification = GrowthClassification.HEALTHY_GROWTH;
  }

  return { classification, confidence, missingData };
}

export enum ProgressionMove {
  MARKETING_SCALE = "MARKETING_SCALE",
  CAPACITY_EXPANSION = "CAPACITY_EXPANSION",
  SECOND_LOCATION = "SECOND_LOCATION",
  CHANNEL_EXPANSION = "CHANNEL_EXPANSION",
  CONTROLLED_GROWTH_EXPERIMENT = "CONTROLLED_GROWTH_EXPERIMENT",
}

export interface ProgressionDecision {
  allowed: boolean;
  blockedReasons: string[];
  classification: GrowthClassification;
  recommendation: string;
}

/**
 * Evaluate whether a progression/expansion move is permitted. Any failed gate
 * blocks the move (fail-closed). Only a clean signal set permits a controlled
 * growth experiment.
 */
export function evaluateProgressionRecommendation(
  signals: GrowthSignals,
  move: ProgressionMove
): ProgressionDecision {
  const blockedReasons: string[] = [];
  if (signals.cashRunwayWeak) blockedReasons.push("weak_cash_runway");
  if (!signals.grossMarginClear) blockedReasons.push("unclear_gross_margin");
  if (!signals.repeatCustomersStrong) blockedReasons.push("weak_repeat_customers");
  if (!signals.staffQualityStable) blockedReasons.push("unstable_staff_quality");
  if (signals.ownerFirefightingDaily) blockedReasons.push("owner_firefighting_daily");
  if (!signals.sopManagerLayerWorking) blockedReasons.push("sop_manager_layer_not_working");
  if (signals.complaintsOrReworkRising) blockedReasons.push("complaints_or_rework_rising");
  if (signals.capacityStressed) blockedReasons.push("capacity_stressed");
  if (!signals.profitImpactVerified) blockedReasons.push("profit_impact_unverified");

  const { classification } = classifyGrowth(signals);
  const allowed = blockedReasons.length === 0;

  return {
    allowed,
    blockedReasons,
    classification,
    recommendation: allowed
      ? `Controlled growth experiment permitted (${move}); proceed with measured rollout.`
      : `Hold ${move}: resolve blockers before expansion.`,
  };
}
