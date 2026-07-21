/**
 * Market sizing engine — pure domain, no I/O.
 * Returns ranges (low/mid/high), never fabricated point values.
 * Returns INSUFFICIENT_EVIDENCE_TO_ESTIMATE when critical evidence is absent.
 */

export interface MarketSizingInputs {
  /** Source population — total addressable universe */
  sourcePopulationUnits: number | null;
  /** Fraction of population that matches customer profile (0..1) */
  applicabilityRate: number | null;
  /** Fraction of applicable customers reachable via available channels (0..1) */
  reachablePercentage: number | null;
  /** Average purchase frequency per year */
  purchaseFrequencyPerYear: number | null;
  /** Price range in cents */
  priceRangeCents: { low: bigint; high: bigint } | null;
  /** Maximum units owner can deliver per month */
  capacityLimitUnitsPerMonth: number | null;
  /** Channel throughput ceiling (units/month) */
  channelLimitUnitsPerMonth: number | null;
  /** Geography multiplier (1.0 = no restriction) */
  geographyMultiplier: number | null;
  /** Evidence item IDs supporting these assumptions */
  evidenceIds: string[];
  /** Free-text description of the limiting factor */
  limitingFactor: string | null;
  /** Calculation version for reproducibility */
  calculationVersion: string;
}

export type MarketSizingStatus = "ESTIMATED" | "INSUFFICIENT_EVIDENCE_TO_ESTIMATE";

export interface MarketSizingRange {
  low: bigint;
  mid: bigint;
  high: bigint;
}

export interface MarketSizingResult {
  status: MarketSizingStatus;
  missingInputs: string[];
  reachableMarketUnits: number | null;
  reachableMarketRevenueCents: MarketSizingRange | null;
  serviceableUnits: number | null;
  serviceableRevenueCents: MarketSizingRange | null;
  capacityLimitedUnits: number | null;
  capacityLimitedRevenueCents: MarketSizingRange | null;
  limitingFactor: string;
  confidence: number;  // 0-100
  assumptions: string[];
  calculationVersion: string;
  /** Stored inputs for exact reproducibility */
  storedInputs: MarketSizingInputs;
}

const CRITICAL_FIELDS = [
  "sourcePopulationUnits",
  "applicabilityRate",
  "reachablePercentage",
  "purchaseFrequencyPerYear",
  "priceRangeCents",
] as const;

export function estimateMarketSize(inputs: MarketSizingInputs): MarketSizingResult {
  const missing: string[] = [];
  for (const field of CRITICAL_FIELDS) {
    if (inputs[field] == null) missing.push(field);
  }

  if (missing.length > 0) {
    return {
      status: "INSUFFICIENT_EVIDENCE_TO_ESTIMATE",
      missingInputs: missing,
      reachableMarketUnits: null,
      reachableMarketRevenueCents: null,
      serviceableUnits: null,
      serviceableRevenueCents: null,
      capacityLimitedUnits: null,
      capacityLimitedRevenueCents: null,
      limitingFactor: `Insufficient evidence: ${missing.join(", ")}`,
      confidence: 0,
      assumptions: [],
      calculationVersion: inputs.calculationVersion,
      storedInputs: inputs,
    };
  }

  const pop = inputs.sourcePopulationUnits!;
  const appRate = inputs.applicabilityRate!;
  const reachPct = inputs.reachablePercentage!;
  const freq = inputs.purchaseFrequencyPerYear!;
  const price = inputs.priceRangeCents!;
  const geo = inputs.geographyMultiplier ?? 1.0;
  const capLimit = inputs.capacityLimitUnitsPerMonth;
  const chanLimit = inputs.channelLimitUnitsPerMonth;

  const reachableUnits = Math.round(pop * appRate * reachPct * geo);

  // Annual revenue range (low/mid/high assumptions)
  const annualUnitsMid = reachableUnits * freq;
  const annualUnitsLow = Math.round(annualUnitsMid * 0.5);
  const annualUnitsHigh = Math.round(annualUnitsMid * 1.5);

  const priceMid = (price.low + price.high) / BigInt(2);
  const revLow = BigInt(annualUnitsLow) * price.low;
  const revMid = BigInt(annualUnitsMid) * priceMid;
  const revHigh = BigInt(annualUnitsHigh) * price.high;

  // Serviceable: apply channel + capacity limits
  const monthlyCapUnits = capLimit ?? annualUnitsMid / 12;
  const monthlyChanUnits = chanLimit ?? annualUnitsMid / 12;
  const monthlyServiceable = Math.min(monthlyCapUnits, monthlyChanUnits);
  const annualServiceable = Math.round(monthlyServiceable * 12);

  const servRevLow = BigInt(Math.round(annualServiceable * 0.5)) * price.low;
  const servRevMid = BigInt(annualServiceable) * priceMid;
  const servRevHigh = BigInt(Math.round(annualServiceable * 1.5)) * price.high;

  // Capacity-limited
  const capacityLimitedUnits = capLimit != null
    ? Math.min(annualServiceable, capLimit * 12)
    : null;
  const capRevLow = capacityLimitedUnits != null ? BigInt(Math.round(capacityLimitedUnits * 0.5)) * price.low : null;
  const capRevMid = capacityLimitedUnits != null ? BigInt(capacityLimitedUnits) * priceMid : null;
  const capRevHigh = capacityLimitedUnits != null ? BigInt(Math.round(capacityLimitedUnits * 1.5)) * price.high : null;

  // Limiting factor
  let limitingFactor = inputs.limitingFactor ?? "CHANNEL_REACH";
  if (capLimit != null && chanLimit != null) {
    limitingFactor = capLimit < chanLimit ? "CAPACITY" : "CHANNEL_REACH";
  } else if (capLimit != null) {
    limitingFactor = "CAPACITY";
  }

  // Confidence: higher when more evidence and all critical fields known
  let confidence = 50;
  if (inputs.evidenceIds.length >= 3) confidence += 10;
  if (inputs.evidenceIds.length >= 7) confidence += 15;
  if (inputs.geographyMultiplier != null) confidence += 5;
  if (inputs.capacityLimitUnitsPerMonth != null) confidence += 5;
  if (inputs.channelLimitUnitsPerMonth != null) confidence += 5;
  confidence = Math.min(90, confidence);  // never 100 — market sizing always uncertain

  const assumptions = [
    `Source population: ${pop.toLocaleString()} units`,
    `Applicability rate: ${Math.round(appRate * 100)}%`,
    `Reachable percentage: ${Math.round(reachPct * 100)}%`,
    `Purchase frequency: ${freq}/year`,
    `Price range: ${price.low.toString()}–${price.high.toString()} cents`,
  ];
  if (geo !== 1.0) assumptions.push(`Geography multiplier: ${geo}`);

  return {
    status: "ESTIMATED",
    missingInputs: [],
    reachableMarketUnits: reachableUnits,
    reachableMarketRevenueCents: { low: revLow, mid: revMid, high: revHigh },
    serviceableUnits: annualServiceable,
    serviceableRevenueCents: { low: servRevLow, mid: servRevMid, high: servRevHigh },
    capacityLimitedUnits,
    capacityLimitedRevenueCents: capRevLow != null && capRevMid != null && capRevHigh != null
      ? { low: capRevLow, mid: capRevMid, high: capRevHigh }
      : null,
    limitingFactor,
    confidence,
    assumptions,
    calculationVersion: inputs.calculationVersion,
    storedInputs: inputs,
  };
}
