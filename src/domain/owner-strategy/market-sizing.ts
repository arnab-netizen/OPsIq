/**
 * Market Sizing Engine (Phase 5).
 * Transparent bounded estimates — ranges not point values.
 * Returns INSUFFICIENT_EVIDENCE_TO_ESTIMATE when evidence below threshold.
 * Pure functions — no I/O.
 */
import type { MarketSizingStatus } from "./startup-lifecycle";

export interface MarketSizingInputs {
  geography: string | null;
  targetCustomerSegment: string | null;
  estimatedSegmentPopulation: number | null; // people or businesses
  estimatedPenetrationRateLow: number | null; // 0-1
  estimatedPenetrationRateMid: number | null; // 0-1
  estimatedPenetrationRateHigh: number | null; // 0-1
  estimatedPricePerUnitCents: bigint | null;
  estimatedPurchaseFrequencyPerYear: number | null;
  ownerCapacityUnitsPerMonth: number | null;
  channelCapacityUnitsPerMonth: number | null;
  geographyPopulationReachable: number | null; // reachable % of segment
  evidenceCount: number; // number of evidence items supporting the estimate
  evidenceQuality: number; // 0-100
}

export interface MarketSizingResult {
  reachableMarketUnits: number | null;
  reachableMarketRevenueCents: bigint | null;
  serviceableUnits: number | null;
  serviceableRevenueCents: bigint | null;
  initialCustomerPool: number | null;
  capacityLimitedRevenueCents: bigint | null;
  channelLimitedRevenueCents: bigint | null;
  geographyLimitedRevenueCents: bigint | null;
  formula: string;
  assumptions: string[];
  confidence: number; // 0-100
  rangeData: { low: number | null; mid: number | null; high: number | null };
  limitingFactor: string;
  sizingStatus: MarketSizingStatus;
  insufficientReason: string | null;
}

const MIN_EVIDENCE_COUNT = 2;
const MIN_EVIDENCE_QUALITY = 30;

export function estimateMarketSize(inputs: MarketSizingInputs): MarketSizingResult {
  const assumptions: string[] = [];
  const insufficientReasons: string[] = [];

  // Gate: minimum evidence
  if (inputs.evidenceCount < MIN_EVIDENCE_COUNT) {
    insufficientReasons.push(`Only ${inputs.evidenceCount} evidence item(s) — minimum ${MIN_EVIDENCE_COUNT} required`);
  }
  if (inputs.evidenceQuality < MIN_EVIDENCE_QUALITY) {
    insufficientReasons.push(`Evidence quality (${inputs.evidenceQuality}/100) below minimum (${MIN_EVIDENCE_QUALITY})`);
  }
  if (inputs.estimatedSegmentPopulation === null) {
    insufficientReasons.push("Target segment population unknown");
  }
  if (inputs.estimatedPricePerUnitCents === null) {
    insufficientReasons.push("Price per unit unknown");
  }

  if (insufficientReasons.length > 0) {
    return {
      reachableMarketUnits: null,
      reachableMarketRevenueCents: null,
      serviceableUnits: null,
      serviceableRevenueCents: null,
      initialCustomerPool: null,
      capacityLimitedRevenueCents: null,
      channelLimitedRevenueCents: null,
      geographyLimitedRevenueCents: null,
      formula: "INSUFFICIENT_EVIDENCE_TO_ESTIMATE",
      assumptions: insufficientReasons,
      confidence: 0,
      rangeData: { low: null, mid: null, high: null },
      limitingFactor: "Insufficient evidence to estimate market size",
      sizingStatus: "INSUFFICIENT_EVIDENCE",
      insufficientReason: insufficientReasons.join("; "),
    };
  }

  const population = inputs.estimatedSegmentPopulation!;
  const pricePerUnitCents = inputs.estimatedPricePerUnitCents!;
  const frequency = inputs.estimatedPurchaseFrequencyPerYear ?? 1;
  const geoReach = inputs.geographyPopulationReachable ?? 1.0; // default: full segment reachable

  // Reachable market: segment × geography reach × frequency
  const reachableMarketUnits = Math.round(population * geoReach * frequency);
  const reachableMarketRevenueCents = BigInt(reachableMarketUnits) * pricePerUnitCents;

  assumptions.push(
    `Segment population: ${population.toLocaleString()} (${inputs.targetCustomerSegment ?? "target customers"} in ${inputs.geography ?? "target geography"})`
  );
  assumptions.push(
    `Geographic reach: ${(geoReach * 100).toFixed(0)}% of segment reachable`
  );
  if (inputs.geographyPopulationReachable === null) {
    assumptions.push("Geographic reach assumed 100% — no evidence provided");
  }

  // Serviceable market: apply penetration rates
  const midPenetration = inputs.estimatedPenetrationRateMid ?? 0.01;
  const lowPenetration = inputs.estimatedPenetrationRateLow ?? midPenetration * 0.5;
  const highPenetration = inputs.estimatedPenetrationRateHigh ?? midPenetration * 2;

  const serviceableUnits = Math.round(reachableMarketUnits * midPenetration);
  const serviceableRevenueCents = BigInt(serviceableUnits) * pricePerUnitCents;

  assumptions.push(
    `Penetration rate: ${(lowPenetration * 100).toFixed(1)}%–${(highPenetration * 100).toFixed(1)}% (mid: ${(midPenetration * 100).toFixed(1)}%)`
  );

  // Initial customer pool (year 1 realistic estimate)
  const initialCustomerPool = Math.round(reachableMarketUnits * lowPenetration);

  // Capacity-limited revenue (per month × 12)
  const capacityLimitedRevenueCents =
    inputs.ownerCapacityUnitsPerMonth !== null
      ? BigInt(Math.round(inputs.ownerCapacityUnitsPerMonth * 12)) * pricePerUnitCents
      : null;

  // Channel-limited revenue
  const channelLimitedRevenueCents =
    inputs.channelCapacityUnitsPerMonth !== null
      ? BigInt(Math.round(inputs.channelCapacityUnitsPerMonth * 12)) * pricePerUnitCents
      : null;

  // Geography-limited: segment within geography
  const geographyLimitedRevenueCents =
    inputs.estimatedSegmentPopulation !== null && inputs.geographyPopulationReachable !== null
      ? BigInt(Math.round(inputs.estimatedSegmentPopulation * inputs.geographyPopulationReachable * frequency)) *
        pricePerUnitCents
      : reachableMarketRevenueCents;

  // Determine limiting factor
  const candidates: Array<{ label: string; value: bigint | null }> = [
    { label: "serviceable market (penetration-limited)", value: serviceableRevenueCents },
    { label: "owner capacity", value: capacityLimitedRevenueCents },
    { label: "channel capacity", value: channelLimitedRevenueCents },
    { label: "geography reach", value: geographyLimitedRevenueCents },
  ].filter((c) => c.value !== null) as Array<{ label: string; value: bigint }>;

  type NonNullCandidate = { label: string; value: bigint };
  const nonNullCandidates = candidates as NonNullCandidate[];
  const lowestCandidate: NonNullCandidate | null = nonNullCandidates.length > 0
    ? nonNullCandidates.reduce((min, c) => (c.value < min.value ? c : min))
    : null;

  const limitingFactor = lowestCandidate
    ? `${lowestCandidate.label} (annual revenue ceiling: $${(Number(lowestCandidate.value) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })})`
    : "penetration rate";

  // Confidence
  const confidence = computeMarketSizingConfidence(inputs);

  // Range (annual revenue in cents)
  const rangeData = {
    low: Math.round(population * geoReach * lowPenetration * frequency * Number(pricePerUnitCents) / 100),
    mid: Math.round(population * geoReach * midPenetration * frequency * Number(pricePerUnitCents) / 100),
    high: Math.round(population * geoReach * highPenetration * frequency * Number(pricePerUnitCents) / 100),
  };

  const formula = buildFormula(inputs, geoReach, midPenetration, frequency);

  return {
    reachableMarketUnits,
    reachableMarketRevenueCents,
    serviceableUnits,
    serviceableRevenueCents,
    initialCustomerPool,
    capacityLimitedRevenueCents,
    channelLimitedRevenueCents,
    geographyLimitedRevenueCents,
    formula,
    assumptions,
    confidence,
    rangeData,
    limitingFactor,
    sizingStatus: "ESTIMATED",
    insufficientReason: null,
  };
}

function computeMarketSizingConfidence(inputs: MarketSizingInputs): number {
  let confidence = inputs.evidenceQuality;
  if (inputs.estimatedPenetrationRateLow === null) confidence -= 20;
  if (inputs.geographyPopulationReachable === null) confidence -= 15;
  if (inputs.estimatedPurchaseFrequencyPerYear === null) confidence -= 10;
  if (inputs.evidenceCount >= 3) confidence += 10;
  return Math.max(5, Math.min(85, confidence)); // cap at 85% — market sizing is inherently uncertain
}

function buildFormula(
  inputs: MarketSizingInputs,
  geoReach: number,
  midPenetration: number,
  frequency: number
): string {
  return (
    `Serviceable Annual Revenue = ` +
    `Segment Population (${(inputs.estimatedSegmentPopulation ?? 0).toLocaleString()}) ` +
    `× Geography Reach (${(geoReach * 100).toFixed(0)}%) ` +
    `× Penetration Rate (${(midPenetration * 100).toFixed(1)}%) ` +
    `× Purchase Frequency (${frequency}/year) ` +
    `× Price Per Unit`
  );
}
