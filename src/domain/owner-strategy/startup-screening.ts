/**
 * Startup Idea Screening Engine (Phase 5).
 * 17-dimension fail-closed deterministic screening.
 * Pure functions — no I/O.
 */
import type { StartupScreeningStatus } from "./startup-lifecycle";

export interface ScreeningProfile {
  capitalAvailableCents: bigint | null;
  monthlySurvivalNeedCents: bigint | null;
  hoursPerWeekAvailable: number | null;
  riskTolerance: "low" | "medium" | "high" | null;
  canSell: boolean | null;
  canOperateDaily: boolean | null;
  location: string | null;
  skills: string[];
  existingAssets: string[];
  ownerExclusions: string[];
  ethicalConstraints: string[];
  debtTolerance: "low" | "medium" | "high" | null;
  regulatoryTolerance: "low" | "medium" | "high" | null;
  preferOnline: boolean | null;
  targetTimeToRevenueDays: number | null;
}

export interface ScreeningIdea {
  name: string;
  industry: string;
  estimatedStartupCostCents: bigint | null;
  estimatedMonthlyRevenueCents: bigint | null;
  estimatedMonthlyCostCents: bigint | null;
  timeToFirstRevenueDays: number | null;
  requiresDailyPresence: boolean | null;
  requiresSalesAbility: boolean | null;
  regulatoryBurden: "low" | "medium" | "high" | null;
  requiredLicences: string[];
  missingLicences: string[];
  customerAccessibilityScore: number | null; // 0-100
  marketEvidenceScore: number | null; // 0-100
  grossMarginBps: number | null; // basis points
  cashCycleRiskScore: number | null; // 0-100
  operationalComplexityScore: number | null; // 0-100
  reversibilityScore: number | null; // 0-100; 100 = fully reversible
  competitiveDefensibilityScore: number | null; // 0-100
  evidenceQualityScore: number | null; // 0-100
  downsideExposureCents: bigint | null;
  requiredCapabilities: string[];
  unavailableCapabilities: string[];
}

export interface ScreeningConstraint {
  dimension: string;
  value: unknown;
  threshold: unknown;
  bindingScore: number; // 0-100
}

export interface ScreeningResult {
  status: StartupScreeningStatus;
  reasons: string[];
  bindingConstraints: ScreeningConstraint[];
  unknownInputs: string[];
  evidenceRequired: string[];
  alternativeConsidered: string | null;
  whatCouldChange: string;
  confidence: number; // 0-100
}

// Hard rejection thresholds
const MIN_GROSS_MARGIN_BPS = 2000; // 20%
const MIN_EVIDENCE_QUALITY = 20;
const MAX_CASH_CYCLE_RISK = 80;
const MAX_OPERATIONAL_COMPLEXITY = 90;

export function screenIdea(
  idea: ScreeningIdea,
  profile: ScreeningProfile
): ScreeningResult {
  const reasons: string[] = [];
  const bindingConstraints: ScreeningConstraint[] = [];
  const unknownInputs: string[] = [];
  const evidenceRequired: string[] = [];
  let hardRejection = false;
  let holdReason: string | null = null;
  let modifyReason: string | null = null;
  let validateFirstReason: string | null = null;
  let evidenceGaps = false;

  // 1. Owner fit — daily presence
  if (idea.requiresDailyPresence === true && profile.canOperateDaily === false) {
    hardRejection = true;
    reasons.push("Requires daily presence but owner cannot operate daily");
    bindingConstraints.push({
      dimension: "owner_daily_presence",
      value: "required",
      threshold: "owner_unavailable",
      bindingScore: 100,
    });
  } else if (idea.requiresDailyPresence === null || profile.canOperateDaily === null) {
    unknownInputs.push("daily_presence_requirement");
    evidenceRequired.push("Confirm whether daily presence is required and owner availability");
  }

  // 2. Owner fit — sales ability
  if (idea.requiresSalesAbility === true && profile.canSell === false) {
    modifyReason = "Idea requires sales but owner cannot sell — consider a sales-led alternative or partner";
    reasons.push("Sales requirement incompatible with owner profile");
    bindingConstraints.push({
      dimension: "owner_sales_ability",
      value: "required",
      threshold: "owner_cannot_sell",
      bindingScore: 80,
    });
  }

  // 3. Capital feasibility
  if (
    idea.estimatedStartupCostCents !== null &&
    profile.capitalAvailableCents !== null
  ) {
    const survivalBuffer =
      (profile.monthlySurvivalNeedCents ?? BigInt(0)) * BigInt(3);
    const requiredCapital = idea.estimatedStartupCostCents + survivalBuffer;
    if (profile.capitalAvailableCents < requiredCapital) {
      const gapCents = requiredCapital - profile.capitalAvailableCents;
      reasons.push(
        `Capital insufficient by ${formatCents(gapCents)} (startup cost + 3-month survival buffer)`
      );
      bindingConstraints.push({
        dimension: "capital_feasibility",
        value: Number(profile.capitalAvailableCents),
        threshold: Number(requiredCapital),
        bindingScore: 95,
      });
      if (gapCents > (profile.capitalAvailableCents * BigInt(2))) {
        hardRejection = true;
      } else {
        modifyReason = modifyReason ?? "Reduce startup cost or identify capital gap solution";
      }
    }
  } else {
    if (idea.estimatedStartupCostCents === null) {
      unknownInputs.push("startup_cost");
      evidenceRequired.push("Obtain startup cost estimate before proceeding");
    }
    if (profile.capitalAvailableCents === null) {
      unknownInputs.push("capital_available");
      evidenceRequired.push("Owner must confirm available capital");
    }
  }

  // 4. Time-to-revenue compatibility
  if (
    idea.timeToFirstRevenueDays !== null &&
    profile.targetTimeToRevenueDays !== null
  ) {
    if (idea.timeToFirstRevenueDays > profile.targetTimeToRevenueDays * 1.5) {
      reasons.push(
        `Time to first revenue (${idea.timeToFirstRevenueDays}d) exceeds owner target by >50%`
      );
      modifyReason = modifyReason ?? "Explore faster-revenue variant of same model";
    }
  } else {
    unknownInputs.push("time_to_first_revenue");
  }

  // 5. Customer accessibility
  if (idea.customerAccessibilityScore !== null) {
    if (idea.customerAccessibilityScore < 30) {
      hardRejection = true;
      reasons.push(
        `Customer accessibility too low (score ${idea.customerAccessibilityScore}/100) — market effectively unreachable`
      );
      bindingConstraints.push({
        dimension: "customer_accessibility",
        value: idea.customerAccessibilityScore,
        threshold: 30,
        bindingScore: 90,
      });
    } else if (idea.customerAccessibilityScore < 50) {
      validateFirstReason = "Customer accessibility is uncertain — validate acquisition channel first";
      evidenceRequired.push("Prove at least one viable customer acquisition channel");
    }
  } else {
    unknownInputs.push("customer_accessibility_score");
    evidenceRequired.push("Assess customer accessibility before advancing");
  }

  // 6. Market evidence
  if (idea.marketEvidenceScore !== null) {
    if (idea.marketEvidenceScore < MIN_EVIDENCE_QUALITY) {
      hardRejection = true;
      reasons.push(
        `Market evidence too weak (score ${idea.marketEvidenceScore}/100) — cannot advance without evidence`
      );
    } else if (idea.marketEvidenceScore < 40) {
      validateFirstReason = validateFirstReason ?? "Market evidence is insufficient — validate demand before economics";
      evidenceGaps = true;
    }
  } else {
    unknownInputs.push("market_evidence");
    evidenceRequired.push("Provide market evidence before advancing");
  }

  // 7. Margin potential
  if (idea.grossMarginBps !== null) {
    if (idea.grossMarginBps < MIN_GROSS_MARGIN_BPS) {
      reasons.push(
        `Gross margin too low (${idea.grossMarginBps / 100}%) — minimum viable margin is 20%`
      );
      bindingConstraints.push({
        dimension: "gross_margin",
        value: idea.grossMarginBps,
        threshold: MIN_GROSS_MARGIN_BPS,
        bindingScore: 85,
      });
      if (idea.grossMarginBps < 500) {
        hardRejection = true;
      } else {
        modifyReason = modifyReason ?? "Improve pricing or reduce variable cost to meet margin threshold";
      }
    }
  } else {
    unknownInputs.push("gross_margin");
    evidenceRequired.push("Estimate gross margin before proceeding");
  }

  // 8. Cash-cycle risk
  if (idea.cashCycleRiskScore !== null) {
    if (idea.cashCycleRiskScore > MAX_CASH_CYCLE_RISK) {
      reasons.push(`Cash-cycle risk critical (score ${idea.cashCycleRiskScore}/100)`);
      holdReason = "High cash-cycle risk — require cash-survival analysis before advancing";
      bindingConstraints.push({
        dimension: "cash_cycle_risk",
        value: idea.cashCycleRiskScore,
        threshold: MAX_CASH_CYCLE_RISK,
        bindingScore: 80,
      });
    }
  } else {
    unknownInputs.push("cash_cycle_risk");
  }

  // 9. Operational complexity
  if (idea.operationalComplexityScore !== null) {
    if (idea.operationalComplexityScore > MAX_OPERATIONAL_COMPLEXITY) {
      hardRejection = true;
      reasons.push(
        `Operational complexity exceeds owner capacity (score ${idea.operationalComplexityScore}/100)`
      );
    }
  }

  // 10. Regulatory burden — missing mandatory licences are a hard blocker
  if (idea.missingLicences.length > 0) {
    hardRejection = true;
    reasons.push(
      `Missing mandatory licence(s): ${idea.missingLicences.join(", ")} — launch blocked`
    );
    bindingConstraints.push({
      dimension: "regulatory_licence",
      value: idea.missingLicences,
      threshold: "all_licences_required",
      bindingScore: 100,
    });
  } else if (idea.regulatoryBurden === null) {
    unknownInputs.push("regulatory_requirements");
    evidenceRequired.push("Verify regulatory requirements and applicable licences");
  } else if (idea.regulatoryBurden === "high") {
    if (profile.regulatoryTolerance === "low") {
      reasons.push("High regulatory burden incompatible with owner's low regulatory tolerance");
      modifyReason = modifyReason ?? "Consider lower-regulation variant or consult a specialist";
    } else {
      evidenceGaps = true;
    }
  }

  // 11. Safety — owner exclusions
  if (
    profile.ownerExclusions.some((exclusion) =>
      idea.industry.toLowerCase().includes(exclusion.toLowerCase()) ||
      idea.name.toLowerCase().includes(exclusion.toLowerCase())
    )
  ) {
    hardRejection = true;
    reasons.push("Idea matches owner exclusion list");
  }

  // 12. Reversibility
  if (idea.reversibilityScore !== null && idea.reversibilityScore < 20) {
    reasons.push(`Low reversibility (score ${idea.reversibilityScore}/100) — high commitment, high risk`);
    if (profile.riskTolerance === "low") {
      holdReason = holdReason ?? "Low reversibility combined with low risk tolerance — hold pending further validation";
    }
  }

  // 13. Competitive defensibility (advisory)
  if (idea.competitiveDefensibilityScore !== null && idea.competitiveDefensibilityScore < 20) {
    reasons.push(`Low competitive defensibility (score ${idea.competitiveDefensibilityScore}/100)`);
    evidenceGaps = true;
  }

  // 14. Unavailable required capabilities
  if (idea.unavailableCapabilities.length > 0) {
    reasons.push(
      `Required capabilities unavailable: ${idea.unavailableCapabilities.join(", ")}`
    );
    bindingConstraints.push({
      dimension: "required_capabilities",
      value: idea.unavailableCapabilities,
      threshold: "all_required",
      bindingScore: 70,
    });
    modifyReason = modifyReason ?? "Acquire missing capabilities or partner before launch";
  }

  // 15. Downside exposure vs available capital
  if (idea.downsideExposureCents !== null && profile.capitalAvailableCents !== null) {
    if (idea.downsideExposureCents > profile.capitalAvailableCents) {
      reasons.push("Downside exposure exceeds available capital — catastrophic loss risk");
      holdReason = holdReason ?? "Downside too large relative to capital — reduce exposure or hold";
    }
  }

  // 16. Evidence quality
  if (idea.evidenceQualityScore !== null && idea.evidenceQualityScore < MIN_EVIDENCE_QUALITY) {
    reasons.push(`Evidence quality too low (score ${idea.evidenceQualityScore}/100)`);
    validateFirstReason = validateFirstReason ?? "Gather stronger evidence before advancing";
  }

  // 17. Scalability (advisory — low score does not block, reduces ranking)
  // Handled by arbitration engine

  // Compute final status
  let status: StartupScreeningStatus;
  if (hardRejection) {
    status = "REJECT";
  } else if (holdReason) {
    status = "HOLD";
  } else if (modifyReason) {
    status = "MODIFY";
  } else if (validateFirstReason) {
    status = "VALIDATE_FIRST";
  } else if (evidenceGaps || unknownInputs.length > 2) {
    status = "ADVANCE_WITH_EVIDENCE_GAPS";
  } else {
    status = "ADVANCE";
  }

  const whatCouldChange = buildWhatCouldChange(status, idea, profile, unknownInputs);
  const confidence = computeScreeningConfidence(unknownInputs, evidenceGaps);

  return {
    status,
    reasons: reasons.length > 0 ? reasons : ["Screening passed all dimensions"],
    bindingConstraints,
    unknownInputs,
    evidenceRequired,
    alternativeConsidered: modifyReason ?? holdReason ?? null,
    whatCouldChange,
    confidence,
  };
}

function formatCents(cents: bigint): string {
  const abs = cents < BigInt(0) ? -cents : cents;
  return `$${(Number(abs) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function buildWhatCouldChange(
  status: StartupScreeningStatus,
  idea: ScreeningIdea,
  profile: ScreeningProfile,
  unknownInputs: string[]
): string {
  if (status === "ADVANCE") return "No blocking factors — proceed to validation planning";
  if (status === "REJECT") {
    return "A hard-blocking factor is present. Resolution would require: eliminating binding constraints or finding a fundamentally different business model.";
  }
  const changes: string[] = [];
  if (unknownInputs.includes("startup_cost")) changes.push("obtaining startup cost estimates");
  if (unknownInputs.includes("capital_available")) changes.push("owner confirming available capital");
  if (unknownInputs.includes("customer_accessibility_score")) changes.push("proving customer acquisition channel");
  if (unknownInputs.includes("regulatory_requirements")) changes.push("verifying regulatory requirements");
  if (unknownInputs.includes("gross_margin")) changes.push("confirming unit economics");
  if (changes.length === 0) changes.push("resolving binding constraints listed above");
  return `Status could improve to ADVANCE by: ${changes.join(", ")}`;
}

function computeScreeningConfidence(
  unknownInputs: string[],
  evidenceGaps: boolean
): number {
  let confidence = 100;
  confidence -= unknownInputs.length * 8;
  if (evidenceGaps) confidence -= 15;
  return Math.max(5, Math.min(100, confidence));
}
