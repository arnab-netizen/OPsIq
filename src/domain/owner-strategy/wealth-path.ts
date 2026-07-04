/**
 * Owner Strategy (Module 8) — Wealth Path Classifier + Business Model Quality
 * Score (execution.md Phase 2). Pure, deterministic, no DB, no I/O.
 *
 * This is the "cheat code" differentiator: it judges whether a business is
 * structurally worth the owner's time, cash, and risk, and classifies it into
 * the required wealth taxonomy — including the uncomfortable verdicts
 * (owner-job, dead-end, trap). It is allowed to recommend stabilize, validate,
 * pivot, pause, sell, exit, stop investing, or redirect (Amendment Rule K).
 *
 * Honesty rules (Amendment Rules A & D):
 *   - Missing inputs are listed, never invented.
 *   - Every score exposes inputs used, missing inputs, assumptions, confidence,
 *     data source, rubric, and what evidence would change the result.
 *   - When based mainly on defaults/missing data, the result is flagged
 *     PROVISIONAL_LOW_CONFIDENCE and blocks high-risk execution downstream.
 *
 * Not a duplicate: `collective-training/stage-classifier.ts` classifies the
 * current operating *condition* (survival → mature-optimization); this module
 * classifies the structural *wealth vehicle*, a different question.
 */

import { clampScore, clampConfidence } from "@/domain/owner-spine/contracts";
import {
  type WealthPathInput,
  type WealthPathResult,
  type WealthPathType,
  type BusinessModelQualityResult,
  type BmqDimensionScore,
  type BmqTier,
  type StrategicOption,
  type QualLevel,
  type LmhLevel,
} from "./wealth-path.types";

// ---------------------------------------------------------------------------
// Presence + scale helpers (mirrors owner-strategy/data-confidence.ts)
// ---------------------------------------------------------------------------

/** A finite, present number (missing/NaN/Infinity → not present). */
function num(x: number | undefined | null): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function bool(x: boolean | undefined | null): boolean | undefined {
  return typeof x === "boolean" ? x : undefined;
}

function qual(x: QualLevel | undefined | null): QualLevel | undefined {
  return x === "none" || x === "weak" || x === "moderate" || x === "strong" ? x : undefined;
}

function lmh(x: LmhLevel | undefined | null): LmhLevel | undefined {
  return x === "low" || x === "medium" || x === "high" ? x : undefined;
}

/** none=0 weak=33 moderate=67 strong=100 */
function qualTo100(q: QualLevel): number {
  return { none: 0, weak: 33, moderate: 67, strong: 100 }[q];
}

function qualRank(q: QualLevel | undefined): number {
  return q === undefined ? -1 : { none: 0, weak: 1, moderate: 2, strong: 3 }[q];
}

/** Safety score for a "lower is safer" risk level (low=90 medium=55 high=20). */
function lmhSafety(l: LmhLevel): number {
  return { low: 90, medium: 55, high: 20 }[l];
}

function lmhRank(l: LmhLevel | undefined): number {
  return l === undefined ? -1 : { low: 0, medium: 1, high: 2 }[l];
}

// ---------------------------------------------------------------------------
// Business Model Quality — dimension scorers
// ---------------------------------------------------------------------------

interface DimAccum {
  used: Set<string>;
  missing: Set<string>;
  assumptions: string[];
}

function dimMargin(input: WealthPathInput, acc: DimAccum): BmqDimensionScore {
  const gross = num(input.grossMarginPct);
  const net = num(input.netMarginPct);
  const netScore = (n: number) =>
    n <= 0 ? 5 : n < 5 ? 25 : n < 10 ? 45 : n < 20 ? 65 : n < 35 ? 82 : 95;
  const grossScore = (g: number) =>
    g < 20 ? 20 : g < 40 ? 45 : g < 60 ? 65 : g < 75 ? 82 : 95;

  let score: number;
  let basis: string;
  if (net !== undefined && gross !== undefined) {
    acc.used.add("netMarginPct").add("grossMarginPct");
    score = Math.round(0.65 * netScore(net) + 0.35 * grossScore(gross));
    basis = `net ${net}% + gross ${gross}%`;
  } else if (net !== undefined) {
    acc.used.add("netMarginPct");
    acc.missing.add("grossMarginPct");
    score = netScore(net);
    basis = `net ${net}% only`;
  } else if (gross !== undefined) {
    acc.used.add("grossMarginPct");
    acc.missing.add("netMarginPct");
    score = grossScore(gross);
    basis = `gross ${gross}% only`;
  } else {
    acc.missing.add("netMarginPct").add("grossMarginPct");
    acc.assumptions.push("margins unknown → neutral 50");
    score = 50;
    basis = "no margin data (default 50)";
  }
  return { dimension: "margin_quality", score, weight: 0.2, basis };
}

function dimDurability(input: WealthPathInput, acc: DimAccum): BmqDimensionScore {
  const freq = input.revenueFrequency;
  const repeat = num(input.repeatCustomerPct);
  const freqScore =
    freq === "subscription" ? 90 : freq === "recurring" ? 70 : freq === "occasional" ? 40 : freq === "one_off" ? 20 : undefined;
  const repeatScore = (r: number) => (r >= 60 ? 90 : r >= 40 ? 70 : r >= 20 ? 50 : r > 0 ? 35 : 20);

  const parts: number[] = [];
  const bases: string[] = [];
  if (freqScore !== undefined) {
    acc.used.add("revenueFrequency");
    parts.push(freqScore);
    bases.push(`frequency ${freq}`);
  } else acc.missing.add("revenueFrequency");
  if (repeat !== undefined) {
    acc.used.add("repeatCustomerPct");
    parts.push(repeatScore(repeat));
    bases.push(`repeat ${repeat}%`);
  } else acc.missing.add("repeatCustomerPct");

  let score = 50;
  if (parts.length > 0) score = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  else acc.assumptions.push("revenue durability unknown → neutral 50");
  return {
    dimension: "revenue_durability",
    score,
    weight: 0.15,
    basis: bases.length ? bases.join(" + ") : "no durability data (default 50)",
  };
}

function dimPricingAcq(input: WealthPathInput, acc: DimAccum): BmqDimensionScore {
  const pricing = qual(input.pricingPower);
  const acq = lmh(input.customerAcquisitionDifficulty);
  const parts: number[] = [];
  const bases: string[] = [];
  if (pricing !== undefined) {
    acc.used.add("pricingPower");
    parts.push(qualTo100(pricing));
    bases.push(`pricing ${pricing}`);
  } else acc.missing.add("pricingPower");
  if (acq !== undefined) {
    acc.used.add("customerAcquisitionDifficulty");
    parts.push(acq === "low" ? 90 : acq === "medium" ? 55 : 25);
    bases.push(`acquisition ${acq}`);
  } else acc.missing.add("customerAcquisitionDifficulty");

  let score = 50;
  if (parts.length > 0) score = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  else acc.assumptions.push("pricing/acquisition unknown → neutral 50");
  return {
    dimension: "pricing_and_acquisition",
    score,
    weight: 0.12,
    basis: bases.length ? bases.join(" + ") : "no pricing/acquisition data (default 50)",
  };
}

function dimMoat(input: WealthPathInput, acc: DimAccum): BmqDimensionScore {
  const diff = qual(input.differentiation);
  const moat = qual(input.competitiveMoat);
  const parts: number[] = [];
  const bases: string[] = [];
  if (diff !== undefined) {
    acc.used.add("differentiation");
    parts.push(qualTo100(diff));
    bases.push(`differentiation ${diff}`);
  } else acc.missing.add("differentiation");
  if (moat !== undefined) {
    acc.used.add("competitiveMoat");
    parts.push(qualTo100(moat));
    bases.push(`moat ${moat}`);
  } else acc.missing.add("competitiveMoat");

  let score = 50;
  if (parts.length > 0) score = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  else acc.assumptions.push("differentiation/moat unknown → neutral 50");
  return {
    dimension: "differentiation_and_moat",
    score,
    weight: 0.13,
    basis: bases.length ? bases.join(" + ") : "no moat data (default 50)",
  };
}

function dimOwnerIndependence(input: WealthPathInput, acc: DimAccum): BmqDimensionScore {
  const staffRuns = bool(input.staffCanRunWithoutOwner);
  const ownerOperator = bool(input.ownerIsPrimaryOperator);
  const hours = num(input.ownerHoursPerWeek);
  const bases: string[] = [];
  let score = 50;
  let anyInput = false;

  if (staffRuns !== undefined) {
    acc.used.add("staffCanRunWithoutOwner");
    score = staffRuns ? 82 : 28;
    bases.push(`staff can run without owner: ${staffRuns}`);
    anyInput = true;
  } else acc.missing.add("staffCanRunWithoutOwner");

  if (ownerOperator !== undefined) {
    acc.used.add("ownerIsPrimaryOperator");
    if (ownerOperator) {
      score = Math.min(score, 32);
      bases.push("owner is primary operator");
    } else {
      score = Math.max(score, 70);
      bases.push("owner not primary operator");
    }
    anyInput = true;
  } else acc.missing.add("ownerIsPrimaryOperator");

  if (hours !== undefined) {
    acc.used.add("ownerHoursPerWeek");
    if (hours > 60) score -= 15;
    else if (hours > 45) score -= 8;
    else if (hours <= 25) score += 10;
    bases.push(`owner ${hours} h/wk`);
    anyInput = true;
  } else acc.missing.add("ownerHoursPerWeek");

  if (!anyInput) acc.assumptions.push("owner dependency unknown → neutral 50");
  return {
    dimension: "owner_independence",
    score: clampScore(score),
    weight: 0.15,
    basis: bases.length ? bases.join("; ") : "no owner-dependency data (default 50)",
  };
}

function dimScalability(input: WealthPathInput, acc: DimAccum): BmqDimensionScore {
  const path = input.expansionPath;
  const map: Record<string, number> = {
    none: 15,
    local: 35,
    multi_unit: 70,
    asset_light_scalable: 88,
    product: 92,
    marketplace: 90,
  };
  let score: number;
  let basis: string;
  if (path && path in map) {
    acc.used.add("expansionPath");
    score = map[path];
    basis = `expansion path ${path}`;
  } else {
    acc.missing.add("expansionPath");
    acc.assumptions.push("expansion path unknown → below-neutral 45 (scalability unproven)");
    score = 45;
    basis = "no expansion-path data (default 45)";
  }
  return { dimension: "scalability", score, weight: 0.15, basis };
}

function dimRiskCapital(input: WealthPathInput, acc: DimAccum): BmqDimensionScore {
  const fields: [string, LmhLevel | undefined][] = [
    ["capitalIntensity", lmh(input.capitalIntensity)],
    ["workingCapitalPressure", lmh(input.workingCapitalPressure)],
    ["downsideRisk", lmh(input.downsideRisk)],
    ["regulatoryBurden", lmh(input.regulatoryBurden)],
  ];
  const parts: number[] = [];
  const bases: string[] = [];
  for (const [name, val] of fields) {
    if (val !== undefined) {
      acc.used.add(name);
      parts.push(lmhSafety(val));
      bases.push(`${name} ${val}`);
    } else acc.missing.add(name);
  }
  let score = 50;
  if (parts.length > 0) score = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  else acc.assumptions.push("risk/capital profile unknown → neutral 50");
  return {
    dimension: "risk_and_capital_safety",
    score,
    weight: 0.1,
    basis: bases.length ? bases.join(", ") : "no risk/capital data (default 50)",
  };
}

function tierFor(score: number): BmqTier {
  if (score < 40) return "weak";
  if (score < 65) return "moderate";
  if (score < 85) return "strong";
  return "exceptional";
}

/**
 * Business Model Quality Score (execution.md Phase 2). Weighted deterministic
 * rubric over 7 structural dimensions (weights sum to 1.0). Fully discloses
 * inputs, missing data, assumptions, confidence, and what would change it.
 */
export function scoreBusinessModelQuality(input: WealthPathInput): BusinessModelQualityResult {
  const acc: DimAccum = { used: new Set(), missing: new Set(), assumptions: [] };
  const dimensions = [
    dimMargin(input, acc),
    dimDurability(input, acc),
    dimPricingAcq(input, acc),
    dimMoat(input, acc),
    dimOwnerIndependence(input, acc),
    dimScalability(input, acc),
    dimRiskCapital(input, acc),
  ];

  const score = clampScore(dimensions.reduce((s, d) => s + d.score * d.weight, 0));

  // Confidence = fraction of considered structural fields actually supplied.
  const usedCount = acc.used.size;
  const consideredCount = acc.used.size + acc.missing.size;
  const confidence = clampConfidence(consideredCount === 0 ? 0 : usedCount / consideredCount);
  const provisionalLowConfidence = confidence < 0.5;

  const whatWouldChangeResult: string[] = [];
  for (const f of ["netMarginPct", "expansionPath", "differentiation", "competitiveMoat"]) {
    if (acc.missing.has(f)) whatWouldChangeResult.push(`Provide ${f} to firm up the quality score.`);
  }

  return {
    score,
    tier: tierFor(score),
    dimensions,
    inputsUsed: [...acc.used].sort(),
    missingInputs: [...acc.missing].sort(),
    assumptions: acc.assumptions,
    confidence,
    provisionalLowConfidence,
    dataSource: "owner_reported_structural_signals",
    rubric:
      "Weighted 0-100 over margin(0.20), durability(0.15), pricing/acquisition(0.12), " +
      "moat(0.13), owner-independence(0.15), scalability(0.15), risk/capital(0.10).",
    whatWouldChangeResult,
  };
}

// ---------------------------------------------------------------------------
// Wealth Path classification
// ---------------------------------------------------------------------------

const OPTIONS_BY_PATH: Record<WealthPathType, StrategicOption[]> = {
  trap_business: ["stabilize", "pivot", "exit", "stop_investing", "redirect"],
  dead_end_business: ["pivot", "sell", "exit", "cashflow_only", "redirect"],
  owner_dependent_job: ["stabilize", "redirect", "sell", "pivot"],
  survival_cashflow_business: ["stabilize", "validate", "cashflow_only", "continue"],
  local_profit_business: ["continue", "stabilize", "validate"],
  multi_unit_scalable_business: ["validate", "stabilize", "continue"],
  asset_light_scalable_service: ["validate", "continue", "stabilize"],
  technology_product_business: ["validate", "continue", "stabilize"],
  marketplace_aggregator_business: ["validate", "continue", "stabilize"],
  strategic_stepping_stone: ["continue", "validate", "redirect"],
};

const LABELS: Record<WealthPathType, string> = {
  trap_business: "Trap business",
  dead_end_business: "Dead-end business",
  owner_dependent_job: "Owner-dependent job (disguised as a business)",
  survival_cashflow_business: "Survival cashflow business",
  local_profit_business: "Local profit business",
  multi_unit_scalable_business: "Multi-unit scalable business",
  asset_light_scalable_service: "Asset-light scalable service",
  technology_product_business: "Technology/product business",
  marketplace_aggregator_business: "Marketplace/aggregator business",
  strategic_stepping_stone: "Strategic stepping-stone",
};

const BAD_PATHS: ReadonlySet<WealthPathType> = new Set([
  "trap_business",
  "dead_end_business",
  "owner_dependent_job",
]);

/** Classification-critical inputs — without ≥3 of these, classification is provisional. */
const CRITICAL_FIELDS: (keyof WealthPathInput)[] = [
  "netMarginPct",
  "expansionPath",
  "ownerIsPrimaryOperator",
  "staffCanRunWithoutOwner",
  "differentiation",
  "competitiveMoat",
];

function presentCriticalCount(input: WealthPathInput): number {
  let n = 0;
  if (num(input.netMarginPct) !== undefined) n++;
  if (input.expansionPath && input.expansionPath.length > 0) n++;
  if (bool(input.ownerIsPrimaryOperator) !== undefined) n++;
  if (bool(input.staffCanRunWithoutOwner) !== undefined) n++;
  if (qual(input.differentiation) !== undefined) n++;
  if (qual(input.competitiveMoat) !== undefined) n++;
  return n;
}

interface Decision {
  pathType: WealthPathType;
  rationale: string;
  evidence: string[];
}

function decidePath(input: WealthPathInput, bmqScore: number): Decision {
  const net = num(input.netMarginPct);
  const runway = num(input.cashRunwayMonths);
  const path = input.expansionPath;
  const diffR = qualRank(qual(input.differentiation));
  const moatR = qualRank(qual(input.competitiveMoat));
  const declining = bool(input.trendDeclining) === true;
  const ownerOperator = bool(input.ownerIsPrimaryOperator);
  const staffRuns = bool(input.staffCanRunWithoutOwner);
  const capHigh = lmhRank(lmh(input.capitalIntensity)) === 2;
  const wcHigh = lmhRank(lmh(input.workingCapitalPressure)) === 2;
  const downHigh = lmhRank(lmh(input.downsideRisk)) === 2;
  const noPath = !path || path === "none";
  const ev: string[] = [];

  // 1. Trap: poor/negative return AND a live cash/risk sink. Bleeds money and risk.
  const marginTrap = net !== undefined && net <= 2;
  const negativeSink = net !== undefined && net < 0 && (capHigh || wcHigh);
  if ((marginTrap && (downHigh || capHigh || wcHigh) && bmqScore < 45) || negativeSink) {
    if (net !== undefined) ev.push(`net margin ${net}%`);
    if (capHigh) ev.push("high capital intensity");
    if (wcHigh) ev.push("high working-capital pressure");
    if (downHigh) ev.push("high downside risk");
    ev.push(`business-model quality ${bmqScore}/100`);
    return {
      pathType: "trap_business",
      rationale:
        "Structurally consumes cash and risk with poor or negative return. Adding capital deepens the hole; a pivot or exit protects the owner.",
      evidence: ev,
    };
  }

  // 2. Dead-end: declining, no expansion path, no moat/differentiation.
  if (declining && noPath && diffR <= 1 && moatR <= 1) {
    ev.push("trend declining", "no expansion path", "weak/none differentiation and moat");
    return {
      pathType: "dead_end_business",
      rationale:
        "Declining with no expansion path and no defensible edge — structurally going nowhere. Plan pivot/sell/exit rather than pour in growth capital.",
      evidence: ev,
    };
  }

  // 3. Owner-dependent job: runs on the owner; income stops if the owner stops.
  if (ownerOperator === true && staffRuns === false) {
    ev.push("owner is primary operator", "cannot run without owner");
    const hrs = num(input.ownerHoursPerWeek);
    if (hrs !== undefined) ev.push(`owner ${hrs} h/wk`);
    return {
      pathType: "owner_dependent_job",
      rationale:
        "This is a job disguised as a business: it depends on the owner's own labour and stops earning if the owner stops. Reduce owner dependency before treating it as a wealth vehicle.",
      evidence: ev,
    };
  }

  // 4. Positive structural classification by expansion path.
  if (path === "marketplace") {
    ev.push("marketplace/aggregator expansion path", `quality ${bmqScore}/100`);
    return { pathType: "marketplace_aggregator_business", rationale: "Marketplace/aggregator model with network-driven scale potential.", evidence: ev };
  }
  if (path === "product") {
    ev.push("product expansion path", `quality ${bmqScore}/100`);
    return { pathType: "technology_product_business", rationale: "Technology/product model with productized, repeatable scale potential.", evidence: ev };
  }
  if (path === "asset_light_scalable") {
    ev.push("asset-light scalable path", `quality ${bmqScore}/100`);
    return { pathType: "asset_light_scalable_service", rationale: "Asset-light service that can scale without proportional capital.", evidence: ev };
  }
  if (path === "multi_unit") {
    ev.push("multi-unit expansion path", `quality ${bmqScore}/100`);
    return { pathType: "multi_unit_scalable_business", rationale: "Repeatable unit that can scale across locations once the unit is proven.", evidence: ev };
  }

  // 5. Strategic stepping-stone: limited now, but a strong strategic asset (moat/skill/brand).
  if (noPath || path === "local") {
    if (moatR >= 3 || (diffR >= 2 && moatR >= 2)) {
      ev.push("strong strategic edge (moat/differentiation)", "limited direct expansion path");
      return {
        pathType: "strategic_stepping_stone",
        rationale:
          "Limited as a standalone wealth vehicle, but a strong strategic asset (edge/brand/skill) that can springboard to a bigger path.",
        evidence: ev,
      };
    }
  }

  // 6. Local profit business: profitable, owner not the bottleneck, limited scalability.
  if (net !== undefined && net > 5 && ownerOperator !== true) {
    ev.push(`net margin ${net}%`, "owner not primary bottleneck", "limited scalability");
    return {
      pathType: "local_profit_business",
      rationale: "Solid local profit generator with limited structural scalability. A good cashflow/wealth base, not a high-ceiling scale vehicle.",
      evidence: ev,
    };
  }

  // 7. Fallback: survival cashflow business (thin/short/unknown but not clearly a trap).
  if (runway !== undefined && runway < 3) ev.push(`cash runway ${runway} months`);
  if (net !== undefined) ev.push(`net margin ${net}%`);
  ev.push(`quality ${bmqScore}/100`);
  return {
    pathType: "survival_cashflow_business",
    rationale:
      "Generates cashflow to survive but is not (yet) a structural wealth vehicle. Stabilize and validate before investing to grow.",
    evidence: ev,
  };
}

function buildWarnings(input: WealthPathInput, pathType: WealthPathType, provisional: boolean, confPct: number, missingCritical: string[]): string[] {
  const w: string[] = [];
  const net = num(input.netMarginPct);
  if (net !== undefined && net <= 0) w.push("Business is not currently profitable (net margin ≤ 0).");
  if (pathType === "owner_dependent_job") w.push("Runs on the owner — income stops if the owner stops. Do not scale before reducing owner dependency.");
  if (pathType === "trap_business") w.push("Structurally a cash/risk trap — do not invest more without a pivot or exit plan.");
  if (pathType === "dead_end_business") w.push("Declining with no path or moat — treat as cashflow-only and plan pivot/sell/exit.");
  const runway = num(input.cashRunwayMonths);
  if (runway !== undefined && runway < 3) w.push(`Cash runway under 3 months (${runway}) — survival first.`);
  if (provisional) {
    w.push(
      `Structural data is thin (confidence ${confPct}%). Treat this classification as provisional and gather: ${missingCritical.join(", ") || "more structural inputs"}.`,
    );
  }
  return w;
}

/**
 * Classify the business into the required wealth taxonomy and attach the
 * Business Model Quality score, evidence, missing data, confidence, allowed
 * strategic options, and warnings. Deterministic; honest about missing data.
 */
export function classifyWealthPath(input: WealthPathInput): WealthPathResult {
  const quality = scoreBusinessModelQuality(input);
  const decision = decidePath(input, quality.score);

  const criticalPresent = presentCriticalCount(input);
  const criticalFraction = criticalPresent / CRITICAL_FIELDS.length;
  const confidence = clampConfidence((quality.confidence + criticalFraction) / 2);
  const provisional = confidence < 0.5 || criticalPresent < 3;

  const missingCritical = CRITICAL_FIELDS.filter((f) => {
    if (f === "netMarginPct") return num(input.netMarginPct) === undefined;
    if (f === "expansionPath") return !input.expansionPath || input.expansionPath.length === 0;
    if (f === "differentiation") return qual(input.differentiation) === undefined;
    if (f === "competitiveMoat") return qual(input.competitiveMoat) === undefined;
    return bool(input[f] as boolean | undefined | null) === undefined;
  }).map(String);

  const confPct = Math.round(confidence * 100);
  const warnings = buildWarnings(input, decision.pathType, provisional, confPct, missingCritical);

  // Provisional classifications and bad-path verdicts must not drive high-risk
  // (e.g. scaling / large capital) execution downstream.
  const blocksHighRiskExecution = provisional || BAD_PATHS.has(decision.pathType);

  let strategicOptions = [...OPTIONS_BY_PATH[decision.pathType]];
  if (provisional) {
    // Do not greenlight "continue" on thin data; ensure "validate" is offered first.
    strategicOptions = strategicOptions.filter((o) => o !== "continue");
    if (!strategicOptions.includes("validate")) strategicOptions.unshift("validate");
    if (!strategicOptions.includes("stabilize")) strategicOptions.push("stabilize");
  }

  const whatWouldChangeResult = [...quality.whatWouldChangeResult];
  if (missingCritical.length > 0) {
    whatWouldChangeResult.push(`Supplying ${missingCritical.join(", ")} could change the wealth-path verdict.`);
  }
  if (bool(input.demandValidated) === undefined) {
    whatWouldChangeResult.push("Confirm demandValidated to distinguish stepping-stone/local-profit from dead-end.");
  }

  return {
    pathType: decision.pathType,
    label: LABELS[decision.pathType],
    rationale: decision.rationale,
    quality,
    evidence: decision.evidence,
    missingInputs: quality.missingInputs,
    confidence,
    provisionalLowConfidence: provisional,
    strategicOptions,
    warnings,
    blocksHighRiskExecution,
    whatWouldChangeResult,
  };
}
