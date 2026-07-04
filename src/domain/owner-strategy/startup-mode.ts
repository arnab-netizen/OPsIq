/**
 * Owner Strategy — Startup Mode: Validation + Launch Workbench
 * (execution.md Phases 14–15, GAP-008). Pure, deterministic, no I/O.
 *
 * Validation-first: scores each idea via the existing wealth-path + risk-adjusted
 * engines, rejects weak/unaffordable/trap ideas, exposes capital insufficiency,
 * and produces a validation Work Package (via the Phase 7 generator). Launch is
 * only allowed AFTER an idea is validated — planLaunch throws otherwise.
 */

import { clampConfidence } from "@/domain/owner-spine/contracts";
import { classifyWealthPath } from "./wealth-path";
import { scoreRiskAdjustedWealth } from "./risk-adjusted-wealth";
import { generateWorkPackage } from "./work-package";
import { num, lmh } from "./scales";
import type { WealthPathInput } from "./wealth-path.types";
import type { RiskAdjustedWealthInput, ActionKind } from "./risk-adjusted-wealth.types";
import type {
  StartupIntake,
  StartupIdea,
  IdeaEvaluation,
  StartupValidationResult,
  StartupLaunchResult,
} from "./startup-mode.types";

/**
 * Reject any idea whose STRUCTURAL (pre-evidence) score is at/below this floor.
 * We judge on the raw structural score, not the evidence-weighted risk-adjusted
 * score, because unvalidated ideas are inherently low-evidence — that is exactly
 * what the validation step fixes. Screening on evidence here would be circular.
 */
const STRUCTURAL_FLOOR = 35;

function expansionToScalability(s: WealthPathInput): "low" | "medium" | "high" | undefined {
  switch (s.expansionPath) {
    case "multi_unit":
      return "medium";
    case "asset_light_scalable":
    case "product":
    case "marketplace":
      return "high";
    case "none":
    case "local":
      return "low";
    default:
      return undefined;
  }
}

function frequencyToRepeat(s: WealthPathInput): "low" | "medium" | "high" | undefined {
  switch (s.revenueFrequency) {
    case "subscription":
    case "recurring":
      return "high";
    case "occasional":
      return "medium";
    case "one_off":
      return "low";
    default:
      return undefined;
  }
}

/** Map a startup idea to a risk-adjusted-wealth input. Pre-validation evidence is LOW. */
function ideaToRiskInput(idea: StartupIdea): RiskAdjustedWealthInput {
  const s = idea.structural;
  return {
    label: idea.name,
    kind: "new_business" as ActionKind,
    grossMarginPotentialPct: num(s.grossMarginPct),
    netMarginPotentialPct: num(s.netMarginPct),
    scalability: expansionToScalability(s),
    repeatPurchasePotential: frequencyToRepeat(s),
    pricingPower: s.pricingPower ?? undefined,
    differentiationPossibility: s.differentiation ?? undefined,
    capitalRequirement: lmh(s.capitalIntensity),
    downsideRisk: lmh(s.downsideRisk),
    competitionIntensity: undefined,
    timeToFirstRevenueMonths: num(idea.timeToFirstRevenueMonths),
    evidenceStrength: "low", // unvalidated ideas are inherently low-evidence
  };
}

export function evaluateIdea(intake: StartupIntake, idea: StartupIdea): IdeaEvaluation {
  const path = classifyWealthPath(idea.structural);
  const risk = scoreRiskAdjustedWealth(ideaToRiskInput(idea));

  const capital = num(intake.capitalAvailable);
  const survival = num(intake.monthlySurvivalNeed);
  const startupCost = num(idea.estimatedStartupCost) ?? null;
  const rev = num(idea.estimatedMonthlyRevenue);
  const cost = num(idea.estimatedMonthlyCost);
  const monthlyProfit = rev !== undefined && cost !== undefined ? rev - cost : null;

  // Capital sufficiency = cover startup cost AND keep a 3-month survival buffer.
  const buffer = survival !== undefined ? survival * 3 : 0;
  const capitalSufficient =
    capital !== undefined && startupCost !== null ? capital >= startupCost + buffer : null;
  const capitalGap =
    capital !== undefined && startupCost !== null ? Math.max(0, startupCost + buffer - capital) : null;

  const breakEvenMonths =
    startupCost !== null && monthlyProfit !== null && monthlyProfit > 0
      ? Math.ceil(startupCost / monthlyProfit)
      : null;
  const coversSurvival =
    monthlyProfit !== null && survival !== undefined ? monthlyProfit >= survival : null;

  const reasons: string[] = [];
  const warnings: string[] = [];
  let accepted = true;

  if (capitalSufficient === false) {
    accepted = false;
    reasons.push(`Capital insufficient: short by ${capitalGap} (startup cost + 3-month survival buffer).`);
  }
  if (monthlyProfit !== null && monthlyProfit <= 0) {
    accepted = false;
    reasons.push("Weak economics: estimated monthly profit is not positive.");
  }
  if (path.pathType === "trap_business" || path.pathType === "dead_end_business") {
    accepted = false;
    reasons.push(`Structural verdict: ${path.label} — not worth the owner's capital/time.`);
  }
  if (path.pathType === "owner_dependent_job" && intake.fastCashVsScale === "long_term_scale") {
    accepted = false;
    reasons.push("It is an owner-dependent job, but the owner wants a long-term scalable vehicle.");
  }
  if (risk.rawScore <= STRUCTURAL_FLOOR) {
    accepted = false;
    reasons.push(`Weak structural score (${risk.rawScore}) — low probability even after validation.`);
  }

  if (accepted) reasons.push(`Passes screening: structural ${risk.rawScore}, risk-adjusted ${risk.riskAdjustedScore} (low until validated), ${path.label}.`);
  if (coversSurvival === false) warnings.push("Estimated profit does not cover monthly survival need — plan a runway.");
  if (startupCost === null || capital === undefined) warnings.push("Capital or startup cost unknown — sufficiency not fully assessed.");
  if (intake.canSell === false) warnings.push("Owner reports they cannot sell — sales capability is a launch risk.");

  const confidence = clampConfidence((path.confidence + risk.confidence) / 2);

  return {
    name: idea.name,
    industry: idea.industry,
    wealthPathType: path.pathType,
    bmqScore: path.quality.score,
    riskAdjustedScore: risk.riskAdjustedScore,
    startupCost,
    capitalSufficient,
    capitalGap,
    monthlyProfit,
    breakEvenMonths,
    coversSurvival,
    accepted,
    reasons,
    warnings,
    confidence,
  };
}

const VALIDATION_KILL_PIVOT = [
  "Fewer than [N] of interviewed customers show real willingness to pay → pivot the offer or stop.",
  "Unit economics stay negative after pricing tests → stop or re-scope.",
  "Startup cost exceeds available capital + survival buffer → do not launch.",
];

/**
 * Validate a set of candidate ideas. Never authorizes launch; produces a
 * validation-first Work Package for the best idea. Honest about capital gaps.
 */
export function validateStartup(intake: StartupIntake, ideas: StartupIdea[]): StartupValidationResult {
  const evaluations = ideas.map((i) => evaluateIdea(intake, i));
  const shortlist = evaluations
    .filter((e) => e.accepted)
    .sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore || a.name.localeCompare(b.name));
  const rejected = evaluations.filter((e) => !e.accepted);
  const recommended = shortlist[0] ?? null;

  const anyJurisdictionKnown = ideas.some((i) => i.jurisdictionKnown === true) || !!intake.location;
  const complianceConfidence: StartupValidationResult["complianceConfidence"] = intake.location
    ? anyJurisdictionKnown
      ? "low" // location known but requirements not verified → still needs professional review
      : "unknown"
    : "unknown";

  const validationWorkPackage = recommended
    ? generateWorkPackage({
        title: `Validate before launch: ${recommended.name}`,
        problem: `Confirm real demand, willingness to pay, and economics for ${recommended.name} before spending to launch.`,
        actionKind: "startup_validation",
        evidence: recommended.reasons,
        riskLevel: "medium",
        assigneeRole: "owner",
        isSafe: true,
        expectedOutcome: "At least 8 customer interviews with willingness-to-pay evidence; go/pivot/stop decision.",
        measurementWindowDays: 21,
        businessName: recommended.name,
      })
    : null;

  const warnings: string[] = [];
  if (!recommended) warnings.push("No idea passed validation screening — do not launch any; rework economics/capital or gather more ideas.");
  if (recommended && recommended.warnings.length > 0) warnings.push(...recommended.warnings);
  warnings.push("Launch is NOT authorized from validation alone — complete the validation Work Package first.");

  return {
    shortlist,
    rejected,
    recommended,
    validationWorkPackage,
    complianceConfidence,
    killPivotCriteria: VALIDATION_KILL_PIVOT,
    warnings,
    launchAllowed: false,
  };
}

/** Thrown when launch planning is attempted before an idea is validated. */
export class StartupNotValidatedError extends Error {
  readonly code = "STARTUP_NOT_VALIDATED";
  constructor(ideaName: string) {
    super(`Cannot plan launch for "${ideaName}": the idea has not been validated. Complete validation first.`);
    this.name = "StartupNotValidatedError";
  }
}

const LAUNCH_KILL_PIVOT = [
  "No paying customers within the first [30] days → pause and re-validate the offer.",
  "Unit economics negative after launch pricing → raise price or stop.",
  "Owner becomes the sole bottleneck → document SOPs before adding volume.",
];

/**
 * Plan a launch — only for a VALIDATED idea. Produces a launch Work Package and a
 * 30/60/90 plan. Throws StartupNotValidatedError if not validated (no launch
 * before validation, execution.md Phase 15).
 */
export function planLaunch(
  ideaName: string,
  opts: { validated: boolean; jurisdictionKnown?: boolean | null; businessName?: string | null } = { validated: false }
): StartupLaunchResult {
  if (!opts.validated) throw new StartupNotValidatedError(ideaName);

  const launchWorkPackage = generateWorkPackage({
    title: `Launch: ${ideaName}`,
    problem: `Bring the validated ${ideaName} to first paying customers with proof and a review cadence.`,
    actionKind: "startup_launch",
    riskLevel: "high",
    assigneeRole: "owner",
    ownerApprovalRequired: true,
    isSafe: true,
    expectedOutcome: "First paying customers within 30 days; positive unit economics confirmed.",
    measurementWindowDays: 30,
    businessName: opts.businessName ?? ideaName,
  });

  return {
    ideaName,
    launchWorkPackage,
    plan306090: {
      day30: ["Complete legal/compliance + first offer/pricing", "Onboard first customers with the sales script", "Run week-by-week marketing calendar"],
      day60: ["Collect reviews + referrals", "Tighten SOPs for the top-3 repeated tasks", "Review unit economics vs plan"],
      day90: ["Decide continue / adjust pricing / pivot", "Reduce owner bottleneck (delegate/train)", "Set the ongoing review cadence"],
    },
    reviewCadenceDays: 7,
    killPivotCriteria: LAUNCH_KILL_PIVOT,
    complianceReviewRequired: opts.jurisdictionKnown !== true, // unknown jurisdiction → require professional review
  };
}
