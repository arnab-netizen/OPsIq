/**
 * Startup arbitration adapter — converts startup ideas into Phase 4 ObjectiveCandidate
 * and delegates to the existing arbitrateObjectives() engine.
 *
 * Pure — no DB, no I/O.
 */
import {
  arbitrateObjectives,
  type ObjectiveCandidate,
  type ObjectiveArbitrationResult,
} from "@/domain/owner-mode/objective-arbitration";

export interface StartupIdeaForArbitration {
  id: string;
  name: string;
  accepted: boolean;
  screeningStatus: string;
  riskAdjustedScore: number | null;
  capitalSufficient: boolean | null;
  monthlyProfit: number | null;
  economicClassification: string | null;  // VIABLE | MARGINAL | UNVIABLE | INSUFFICIENT_DATA | null
  cashRunwayMonths: number | null;
  breakEvenMonths: number | null;
  readinessStatus: string | null;  // READY | CONDITIONALLY_READY | NOT_READY | BLOCKED | null
  hypothesesFailed: number;
  hypothesesTotal: number;
  regulatoryBlocked: boolean;
}

export interface StartupArbitrationResult {
  recommendedIdeaId: string | null;
  recommendedIdeaName: string | null;
  closestAlternativeId: string | null;
  closestAlternativeName: string | null;
  rejectedIds: string[];
  rejectionReasons: Record<string, string[]>;
  unknownInputs: string[];
  bindingConstraints: string[];
  opportunityCost: string | null;
  whatWouldChangeRanking: string;
  rawArbitrationResult: ObjectiveArbitrationResult;
}

/** Convert a startup idea to the Phase 4 ObjectiveCandidate shape for arbitration. */
export function convertIdeaToObjectiveCandidate(idea: StartupIdeaForArbitration): ObjectiveCandidate {
  const unknown: string[] = [];

  if (idea.riskAdjustedScore == null) unknown.push("riskAdjustedScore");
  if (idea.capitalSufficient == null) unknown.push("capitalSufficient");
  if (idea.economicClassification == null) unknown.push("economicClassification");

  // Priority: risk-adjusted score from screening/readiness; neutral default if unknown
  const priorityScore = idea.riskAdjustedScore != null
    ? Math.max(0, Math.min(100, Math.round(idea.riskAdjustedScore)))
    : 50;

  // Progress: use hypothesis confirmation rate as execution-readiness proxy
  const progressPct = idea.hypothesesTotal > 0
    ? Math.round(((idea.hypothesesTotal - idea.hypothesesFailed) / idea.hypothesesTotal) * 100)
    : 50;

  // Resource availability: capital-sufficient = 0.8, insufficient = 0.2, unknown = 0.5
  const resourceAvailabilityRatio =
    idea.capitalSufficient === true ? 0.8 :
    idea.capitalSufficient === false ? 0.2 :
    0.5;

  // Risk score: derive from economic classification + readiness + regulatory
  let riskScore = 50;
  if (idea.economicClassification === "UNVIABLE") riskScore = Math.max(riskScore, 85);
  if (idea.economicClassification === "MARGINAL") riskScore = Math.max(riskScore, 60);
  if (idea.readinessStatus === "BLOCKED" || idea.regulatoryBlocked) riskScore = Math.max(riskScore, 90);
  if (idea.readinessStatus === "NOT_READY") riskScore = Math.max(riskScore, 65);
  if (idea.hypothesesFailed > 0) riskScore = Math.min(100, riskScore + idea.hypothesesFailed * 10);

  // Resource budget used: invert resourceAvailabilityRatio
  const resourceBudgetUsedPct = Math.round((1 - resourceAvailabilityRatio) * 100);

  return {
    objectiveId: idea.id,
    objectiveType: "GROWTH",
    status: "ACTIVE",
    priorityScore,
    progressPct,
    resourceBudgetUsedPct,
    hasBlockingDependencies: idea.regulatoryBlocked || idea.readinessStatus === "BLOCKED",
    linkedGoalAligned: true,
    timeHorizon: "SHORT_TERM",
    deadlineDaysRemaining: idea.breakEvenMonths != null ? idea.breakEvenMonths * 30 : null,
    childCount: 0,
    operationalRisk: riskScore,
    resourceAvailabilityRatio,
    confidence: idea.riskAdjustedScore != null ? 0.7 : 0.4,
    reversible: true,
  };
}

/**
 * Run full arbitration across startup ideas.
 * Prefers lower-revenue / higher-survival ideas over fragile high-revenue ones
 * via the existing 13-dimension arbitration engine.
 */
export function arbitrateStartupIdeas(ideas: StartupIdeaForArbitration[]): StartupArbitrationResult {
  const viableIdeas = ideas.filter(
    (i) =>
      i.screeningStatus !== "REJECTED" &&
      i.economicClassification !== "UNVIABLE" &&
      !i.regulatoryBlocked
  );

  const rejectedIds = ideas
    .filter((i) => i.screeningStatus === "REJECTED" || i.regulatoryBlocked)
    .map((i) => i.id);

  const rejectionReasons: Record<string, string[]> = {};
  for (const idea of ideas) {
    const reasons: string[] = [];
    if (idea.screeningStatus === "REJECTED") reasons.push("FAILED_SCREENING");
    if (idea.regulatoryBlocked) reasons.push("REGULATORY_BLOCKED");
    if (idea.economicClassification === "UNVIABLE") reasons.push("ECONOMICALLY_UNVIABLE");
    if (reasons.length > 0) rejectionReasons[idea.id] = reasons;
  }

  if (viableIdeas.length === 0) {
    return {
      recommendedIdeaId: null,
      recommendedIdeaName: null,
      closestAlternativeId: null,
      closestAlternativeName: null,
      rejectedIds,
      rejectionReasons,
      unknownInputs: ["No viable ideas available for ranking"],
      bindingConstraints: ["ALL_IDEAS_REJECTED_OR_BLOCKED"],
      opportunityCost: null,
      whatWouldChangeRanking: "Provide a viable idea that passes screening and is economically feasible",
      rawArbitrationResult: {
        winnerObjectiveId: null,
        arbitrationResult: { recommended: null, decisions: [] },
        candidates: [],
        dominantConstraint: null,
        resourceConflict: null,
      },
    };
  }

  const candidates = viableIdeas.map(convertIdeaToObjectiveCandidate);
  const arbResult = arbitrateObjectives(candidates);

  const winnerIdea = viableIdeas.find((i) => i.id === arbResult.winnerObjectiveId) ?? null;
  const nonWinnerViable = viableIdeas.filter((i) => i.id !== arbResult.winnerObjectiveId);
  const closestAlt = nonWinnerViable[0] ?? null;

  const unknownInputs: string[] = [];
  for (const idea of viableIdeas) {
    if (idea.riskAdjustedScore == null) unknownInputs.push(`${idea.id}: riskAdjustedScore`);
    if (idea.economicClassification == null) unknownInputs.push(`${idea.id}: economicClassification`);
  }

  const bindingConstraints: string[] = [];
  if (arbResult.dominantConstraint) bindingConstraints.push(arbResult.dominantConstraint);
  if (arbResult.resourceConflict) {
    for (const rc of arbResult.resourceConflict) bindingConstraints.push(rc.reason);
  }

  let opportunityCost: string | null = null;
  if (closestAlt && winnerIdea) {
    opportunityCost = `Choosing ${winnerIdea.name} foregoes ${closestAlt.name}`;
  }

  const whatWouldChangeRanking = unknownInputs.length > 0
    ? `Providing evidence for: ${unknownInputs.map((u) => u.split(":")[1]?.trim()).join(", ")}`
    : closestAlt
    ? `If ${closestAlt.name} showed lower risk or higher capital sufficiency, ranking could reverse`
    : "No alternative exists to change the ranking";

  return {
    recommendedIdeaId: winnerIdea?.id ?? null,
    recommendedIdeaName: winnerIdea?.name ?? null,
    closestAlternativeId: closestAlt?.id ?? null,
    closestAlternativeName: closestAlt?.name ?? null,
    rejectedIds,
    rejectionReasons,
    unknownInputs,
    bindingConstraints,
    opportunityCost,
    whatWouldChangeRanking,
    rawArbitrationResult: arbResult,
  };
}
