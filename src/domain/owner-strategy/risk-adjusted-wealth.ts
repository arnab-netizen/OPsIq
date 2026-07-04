/**
 * Owner Strategy — Risk-Adjusted Wealth Score + Opportunity Cost Review
 * (execution.md Phase 3). Pure, deterministic, no DB, no I/O.
 *
 * Ranks major actions/paths by risk-adjusted probability of wealth. The key
 * behaviour: a confidence weighting derived from evidence strength means an
 * exciting but low-evidence action (e.g. expansion) cannot outrank a boring,
 * high-evidence, high-probability action (e.g. stabilize current operations).
 * Opportunity Cost Review compares a proposed action against realistic
 * alternatives and names the rejected ones and why they lost (Amendment Rule D).
 */

import { clampScore, clampConfidence } from "@/domain/owner-spine/contracts";
import { num, qual, lmh, qualTo100, lmhValue } from "./scales";
import type { LmhLevel } from "./wealth-path.types";
import {
  type ActionKind,
  type RiskAdjustedWealthInput,
  type RiskAdjustedWealthResult,
  type OpportunityCostInput,
  type OpportunityCostResult,
  type RankedActionScore,
} from "./risk-adjusted-wealth.types";

// --- small deterministic scalers ------------------------------------------

function grossMarginScore(g: number): number {
  return g < 20 ? 20 : g < 40 ? 45 : g < 60 ? 65 : g < 75 ? 82 : 95;
}
function netMarginScore(n: number): number {
  return n <= 0 ? 5 : n < 5 ? 25 : n < 10 ? 45 : n < 20 ? 65 : n < 35 ? 82 : 95;
}
/** Longer payback = riskier (0..100 risk). */
function paybackRisk(months: number): number {
  return months <= 6 ? 20 : months <= 12 ? 40 : months <= 24 ? 60 : months <= 36 ? 80 : 90;
}
/** Longer time-to-first-revenue = riskier (0..100 risk). */
function timeToRevenueRisk(months: number): number {
  return months <= 1 ? 15 : months <= 3 ? 35 : months <= 6 ? 55 : months <= 12 ? 75 : 90;
}

interface Acc {
  used: Set<string>;
  missing: Set<string>;
}

function pushUpside(
  acc: Acc,
  parts: number[],
  drivers: { name: string; score: number; positive: boolean }[],
  name: string,
  value: number | undefined,
): void {
  if (value === undefined) {
    acc.missing.add(name);
    return;
  }
  acc.used.add(name);
  parts.push(value);
  drivers.push({ name, score: value, positive: true });
}

function pushRisk(
  acc: Acc,
  parts: number[],
  drivers: { name: string; score: number; positive: boolean }[],
  name: string,
  risk: number | undefined,
): void {
  if (risk === undefined) {
    acc.missing.add(name);
    return;
  }
  acc.used.add(name);
  parts.push(risk);
  drivers.push({ name, score: risk, positive: false });
}

function avg(parts: number[], fallback: number): number {
  return parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : fallback;
}

function evidenceBase(e: LmhLevel | undefined): number {
  return e === "high" ? 0.85 : e === "medium" ? 0.6 : e === "low" ? 0.35 : 0.4;
}

/**
 * Risk-Adjusted Wealth Score for one action/path. rawScore blends upside with
 * safety; the returned riskAdjustedScore is rawScore weighted by confidence so
 * low-evidence bets are discounted. Fully discloses inputs/missing/confidence.
 */
export function scoreRiskAdjustedWealth(input: RiskAdjustedWealthInput): RiskAdjustedWealthResult {
  const acc: Acc = { used: new Set(), missing: new Set() };
  const drivers: { name: string; score: number; positive: boolean }[] = [];

  // Upside (higher = better).
  const upsideParts: number[] = [];
  pushUpside(acc, upsideParts, drivers, "marketDemand", lmh(input.marketDemand) && lmhValue(lmh(input.marketDemand)!));
  {
    const g = num(input.grossMarginPotentialPct);
    pushUpside(acc, upsideParts, drivers, "grossMarginPotentialPct", g === undefined ? undefined : grossMarginScore(g));
  }
  {
    const n = num(input.netMarginPotentialPct);
    pushUpside(acc, upsideParts, drivers, "netMarginPotentialPct", n === undefined ? undefined : netMarginScore(n));
  }
  pushUpside(acc, upsideParts, drivers, "cashConversion", lmh(input.cashConversion) && lmhValue(lmh(input.cashConversion)!));
  pushUpside(acc, upsideParts, drivers, "repeatPurchasePotential", lmh(input.repeatPurchasePotential) && lmhValue(lmh(input.repeatPurchasePotential)!));
  pushUpside(acc, upsideParts, drivers, "pricingPower", qual(input.pricingPower) && qualTo100(qual(input.pricingPower)!));
  pushUpside(acc, upsideParts, drivers, "scalability", lmh(input.scalability) && lmhValue(lmh(input.scalability)!));
  pushUpside(acc, upsideParts, drivers, "exitAssetValue", lmh(input.exitAssetValue) && lmhValue(lmh(input.exitAssetValue)!));
  pushUpside(acc, upsideParts, drivers, "localMarketFit", lmh(input.localMarketFit) && lmhValue(lmh(input.localMarketFit)!));
  const upsideScore = clampScore(avg(upsideParts, 50));

  // Risk (higher = worse). Inverse signals (differentiation, repeatability) reduce risk.
  const riskParts: number[] = [];
  pushRisk(acc, riskParts, drivers, "competitionIntensity", lmh(input.competitionIntensity) && lmhValue(lmh(input.competitionIntensity)!));
  pushRisk(acc, riskParts, drivers, "differentiationPossibility", qual(input.differentiationPossibility) ? 100 - qualTo100(qual(input.differentiationPossibility)!) : undefined);
  pushRisk(acc, riskParts, drivers, "ownerWorkloadDependency", lmh(input.ownerWorkloadDependency) && lmhValue(lmh(input.ownerWorkloadDependency)!));
  pushRisk(acc, riskParts, drivers, "staffProcessRepeatability", lmh(input.staffProcessRepeatability) ? 100 - lmhValue(lmh(input.staffProcessRepeatability)!) : undefined);
  pushRisk(acc, riskParts, drivers, "capitalRequirement", lmh(input.capitalRequirement) && lmhValue(lmh(input.capitalRequirement)!));
  pushRisk(acc, riskParts, drivers, "downsideRisk", lmh(input.downsideRisk) && lmhValue(lmh(input.downsideRisk)!));
  pushRisk(acc, riskParts, drivers, "legalComplianceBurden", lmh(input.legalComplianceBurden) && lmhValue(lmh(input.legalComplianceBurden)!));
  pushRisk(acc, riskParts, drivers, "salesDifficulty", lmh(input.salesDifficulty) && lmhValue(lmh(input.salesDifficulty)!));
  pushRisk(acc, riskParts, drivers, "operationalComplexity", lmh(input.operationalComplexity) && lmhValue(lmh(input.operationalComplexity)!));
  {
    const p = num(input.paybackPeriodMonths);
    pushRisk(acc, riskParts, drivers, "paybackPeriodMonths", p === undefined ? undefined : paybackRisk(p));
  }
  {
    const t = num(input.timeToFirstRevenueMonths);
    pushRisk(acc, riskParts, drivers, "timeToFirstRevenueMonths", t === undefined ? undefined : timeToRevenueRisk(t));
  }
  const riskScore = avg(riskParts, 50);
  const safetyScore = clampScore(100 - riskScore);

  const rawScore = clampScore(0.65 * upsideScore + 0.35 * safetyScore);

  // Evidence + completeness → confidence. evidenceStrength is tracked separately.
  const evidence = lmh(input.evidenceStrength);
  if (evidence !== undefined) acc.used.add("evidenceStrength");
  else acc.missing.add("evidenceStrength");
  const usedCount = acc.used.size;
  const consideredCount = acc.used.size + acc.missing.size;
  const completeness = consideredCount === 0 ? 0 : usedCount / consideredCount;
  const confidence = clampConfidence(0.5 * evidenceBase(evidence) + 0.5 * completeness);
  const provisionalLowConfidence = confidence < 0.5;

  // Confidence weight in [0.4, 1.0] — low-evidence bets are discounted, not zeroed.
  const riskAdjustedScore = clampScore(rawScore * (0.4 + 0.6 * confidence));

  const topPositive = [...drivers].filter((d) => d.positive).sort((a, b) => b.score - a.score)[0];
  const topRisk = [...drivers].filter((d) => !d.positive).sort((a, b) => b.score - a.score)[0];
  const driverStrings: string[] = [];
  if (topPositive) driverStrings.push(`strongest upside: ${topPositive.name} (${topPositive.score})`);
  if (topRisk) driverStrings.push(`largest risk: ${topRisk.name} (${topRisk.score})`);
  if (evidence !== undefined) driverStrings.push(`evidence: ${evidence}`);

  const whatWouldChangeResult: string[] = [];
  if (acc.missing.has("evidenceStrength")) whatWouldChangeResult.push("Provide evidenceStrength — low evidence caps the risk-adjusted score.");
  if (acc.missing.has("netMarginPotentialPct")) whatWouldChangeResult.push("Provide netMarginPotentialPct to firm up expected value.");
  if (acc.missing.has("downsideRisk")) whatWouldChangeResult.push("Provide downsideRisk to firm up the risk penalty.");

  return {
    label: input.label,
    kind: input.kind ?? "other",
    upsideScore,
    safetyScore,
    rawScore,
    confidence,
    provisionalLowConfidence,
    riskAdjustedScore,
    inputsUsed: [...acc.used].sort(),
    missingInputs: [...acc.missing].sort(),
    drivers: driverStrings,
    rubric:
      "rawScore = 0.65·upside + 0.35·safety (safety = 100 − mean risk). " +
      "riskAdjustedScore = rawScore × (0.4 + 0.6·confidence); confidence = " +
      "0.5·evidence + 0.5·input-completeness.",
    whatWouldChangeResult,
  };
}

/** Deterministic ranking: risk-adjusted score desc, then confidence desc, then label. */
function compareScored(a: RiskAdjustedWealthResult, b: RiskAdjustedWealthResult): number {
  if (b.riskAdjustedScore !== a.riskAdjustedScore) return b.riskAdjustedScore - a.riskAdjustedScore;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  return a.label.localeCompare(b.label);
}

function toRanked(r: RiskAdjustedWealthResult): RankedActionScore {
  return {
    label: r.label,
    kind: r.kind,
    riskAdjustedScore: r.riskAdjustedScore,
    confidence: r.confidence,
    provisionalLowConfidence: r.provisionalLowConfidence,
  };
}

const STABILIZING_KINDS: ReadonlySet<ActionKind> = new Set([
  "preserve_cash",
  "reduce_debt",
  "fix_operations",
  "customer_retention",
  "do_nothing",
]);

/**
 * Opportunity Cost Review. Scores the proposed action and every alternative,
 * ranks them, and reports whether a higher-value alternative exists — so a
 * low-value action is never optimized while a higher-value one is ignored.
 */
export function reviewOpportunityCost(input: OpportunityCostInput): OpportunityCostResult {
  const proposed = scoreRiskAdjustedWealth(input.proposed);
  const alternatives = input.alternatives.map(scoreRiskAdjustedWealth);
  const all = [proposed, ...alternatives].sort(compareScored);

  const recommended = all[0];
  const proposedIsBest = recommended.label === proposed.label && recommended.kind === proposed.kind;
  const betterAlternativeExists = !proposedIsBest;

  const rejectedAlternatives = all
    .filter((r) => !(r.label === recommended.label && r.kind === recommended.kind))
    .map((r) => ({
      label: r.label,
      kind: r.kind,
      reason: r.provisionalLowConfidence
        ? `lower risk-adjusted score ${r.riskAdjustedScore} vs ${recommended.riskAdjustedScore}, and low evidence (confidence ${Math.round(r.confidence * 100)}%)`
        : `lower risk-adjusted score ${r.riskAdjustedScore} vs ${recommended.riskAdjustedScore}`,
    }));

  const warnings: string[] = [];
  if (betterAlternativeExists) {
    warnings.push(
      `Proposed "${proposed.label}" ranks below "${recommended.label}" (${proposed.riskAdjustedScore} vs ${recommended.riskAdjustedScore}). Do the higher-value action first.`,
    );
    if (proposed.kind === "expansion" && STABILIZING_KINDS.has(recommended.kind)) {
      warnings.push(`Stabilize first: "${recommended.label}" is a higher-probability use of cash/time than expansion right now.`);
    }
  }
  if (proposed.provisionalLowConfidence) {
    warnings.push(`Proposed action has low evidence (confidence ${Math.round(proposed.confidence * 100)}%) — validate before committing.`);
  }
  if (input.alternatives.length === 0) {
    warnings.push("No alternatives supplied — opportunity cost not truly tested. Compare against preserve-cash / fix-operations at minimum.");
  }

  const verdict = proposedIsBest
    ? `"${proposed.label}" is the highest risk-adjusted use of the owner's cash/time among the options considered.`
    : `A higher-value option exists: "${recommended.label}". "${proposed.label}" should not be prioritized over it.`;

  return {
    proposed,
    ranked: all.map(toRanked),
    recommendedLabel: recommended.label,
    proposedIsBest,
    betterAlternativeExists,
    rejectedAlternatives,
    verdict,
    warnings,
    confidence: recommended.confidence,
  };
}
