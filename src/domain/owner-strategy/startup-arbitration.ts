/**
 * Multi-idea arbitration for startup ideas (Phase 5).
 * Standalone composite scoring — does not delegate to the ObjectiveCandidate engine
 * because startup ideas have a different scoring model (survival × 2, economics, readiness).
 * Pure functions — no I/O.
 */
import type { EconomicClassification, StartupReadinessStatus } from "./startup-lifecycle";

export interface StartupIdeaCandidate {
  ideaId: string;
  name: string;
  industry: string;
  // Readiness (0-100, null = unknown)
  problemEvidenceScore: number | null;
  customerEvidenceScore: number | null;
  wtpEvidenceScore: number | null;
  readinessStatus: StartupReadinessStatus | null;
  // Economics
  economicClassification: EconomicClassification | null;
  breakEvenMonths: number | null;
  cashRunwayMonths: number | null;
  startupCostCents: bigint | null;
  grossMarginBps: number | null;
  // Fit
  ownerFitScore: number | null; // 0-100
  resourceFitScore: number | null; // 0-100
  strategicFitScore: number | null; // 0-100
  // Risk and reversibility
  riskScore: number | null; // 0-100 (higher = more risk)
  reversibilityScore: number | null; // 0-100 (higher = more reversible)
  // Scale and defensibility
  scalabilityScore: number | null; // 0-100
  defensibilityScore: number | null; // 0-100
  // Evidence
  evidenceConfidence: number | null; // 0-100
  // Optional: links to phase 4 opportunity
  linkedOpportunityId: string | null;
}

export interface StartupArbitrationResult {
  recommendedIdeaId: string | null;
  recommendedIdeaName: string | null;
  closestAlternativeId: string | null;
  closestAlternativeName: string | null;
  rejectedIdeaIds: string[];
  rejectionReasons: Record<string, string>;
  unknownInputs: string[];
  ownerConstraints: string[];
  requiredValidation: string[];
  confidence: number;
  whatWouldChangeRanking: string;
}

export function arbitrateStartupIdeas(
  ideas: StartupIdeaCandidate[],
  profile: {
    capitalAvailableCents: bigint | null;
    ownerHoursPerWeek: number | null;
    riskTolerance: "low" | "medium" | "high" | null;
  }
): StartupArbitrationResult {
  if (ideas.length === 0) {
    return {
      recommendedIdeaId: null,
      recommendedIdeaName: null,
      closestAlternativeId: null,
      closestAlternativeName: null,
      rejectedIdeaIds: [],
      rejectionReasons: {},
      unknownInputs: ["no_ideas"],
      ownerConstraints: [],
      requiredValidation: [],
      confidence: 0,
      whatWouldChangeRanking: "Add viable ideas to compare",
    };
  }

  // Filter out hard-rejected ideas
  const advancingIdeas = ideas.filter(
    (i) => i.readinessStatus !== "REJECT" && i.economicClassification !== "UNVIABLE"
  );
  const rejectedIdeas = ideas.filter(
    (i) => i.readinessStatus === "REJECT" || i.economicClassification === "UNVIABLE"
  );

  const rejectionReasons: Record<string, string> = {};
  for (const idea of rejectedIdeas) {
    if (idea.readinessStatus === "REJECT") {
      rejectionReasons[idea.ideaId] = "Hard gate failure in readiness assessment (regulatory blocker or critical risk)";
    } else if (idea.economicClassification === "UNVIABLE") {
      rejectionReasons[idea.ideaId] = "Economic model is not viable — gross contribution is negative or margin is too thin";
    }
  }

  if (advancingIdeas.length === 0) {
    return {
      recommendedIdeaId: null,
      recommendedIdeaName: null,
      closestAlternativeId: null,
      closestAlternativeName: null,
      rejectedIdeaIds: rejectedIdeas.map((i) => i.ideaId),
      rejectionReasons,
      unknownInputs: [],
      ownerConstraints: buildOwnerConstraints(profile),
      requiredValidation: ["All ideas have been rejected — no viable option available"],
      confidence: 0,
      whatWouldChangeRanking: "Identify new ideas or resolve binding constraints on existing ideas",
    };
  }

  const sortedAdvancing = [...advancingIdeas].sort((a, b) => {
    return computeCompositeScore(b) - computeCompositeScore(a);
  });

  const winnerIdea = sortedAdvancing[0];
  const closestAlternative = sortedAdvancing[1] ?? null;

  const loserReasons: Record<string, string> = { ...rejectionReasons };
  for (const idea of advancingIdeas) {
    if (idea.ideaId !== winnerIdea.ideaId) {
      loserReasons[idea.ideaId] = buildLoserReason(idea, winnerIdea);
    }
  }

  const unknownInputs: string[] = [];
  for (const idea of advancingIdeas) {
    if (idea.evidenceConfidence === null || idea.evidenceConfidence < 30) {
      unknownInputs.push(`${idea.name}: low evidence confidence`);
    }
    if (idea.economicClassification === "INSUFFICIENT_EVIDENCE") {
      unknownInputs.push(`${idea.name}: economic model insufficient`);
    }
  }

  const requiredValidation: string[] = [];
  for (const idea of advancingIdeas) {
    if (idea.readinessStatus === "MORE_VALIDATION_REQUIRED") {
      requiredValidation.push(`${idea.name}: requires additional validation before GO decision`);
    }
  }

  const confidence = computeArbitrationConfidence(advancingIdeas, unknownInputs);

  return {
    recommendedIdeaId: winnerIdea.ideaId,
    recommendedIdeaName: winnerIdea.name,
    closestAlternativeId: closestAlternative?.ideaId ?? null,
    closestAlternativeName: closestAlternative?.name ?? null,
    rejectedIdeaIds: Object.keys(loserReasons).filter((id) => id !== winnerIdea.ideaId),
    rejectionReasons: loserReasons,
    unknownInputs,
    ownerConstraints: buildOwnerConstraints(profile),
    requiredValidation,
    confidence,
    whatWouldChangeRanking: buildWhatWouldChange(winnerIdea, closestAlternative),
  };
}

function computeReadinessScore(idea: StartupIdeaCandidate): number {
  const scores = [
    idea.problemEvidenceScore,
    idea.customerEvidenceScore,
    idea.wtpEvidenceScore,
  ].filter((s): s is number => s !== null);
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function computeEconomicScore(idea: StartupIdeaCandidate): number {
  if (idea.economicClassification === null) return 0;
  const scores: Record<EconomicClassification, number> = {
    ECONOMICALLY_VIABLE: 100,
    POTENTIALLY_VIABLE: 70,
    VIABLE_ONLY_IF_ASSUMPTIONS_HOLD: 50,
    INSUFFICIENT_EVIDENCE: 20,
    UNVIABLE: 0,
    CASH_FLOW_UNSAFE: 10,
    RESOURCE_INFEASIBLE: 5,
  };
  return scores[idea.economicClassification] ?? 0;
}

function computeSurvivalScore(idea: StartupIdeaCandidate): number {
  if (idea.cashRunwayMonths === null || idea.breakEvenMonths === null) return 30;
  if (idea.cashRunwayMonths < idea.breakEvenMonths) return 0;
  return Math.min(100, Math.round((idea.cashRunwayMonths / idea.breakEvenMonths) * 50));
}

function computeCompositeScore(idea: StartupIdeaCandidate): number {
  // Survival score weighted 2× — Scenario E: lower-revenue/higher-survival is preferred
  const survival = computeSurvivalScore(idea) * 2.0;
  const economics = computeEconomicScore(idea);
  const readiness = computeReadinessScore(idea);
  const fit = ((idea.ownerFitScore ?? 50) + (idea.resourceFitScore ?? 50)) / 2;
  const evidence = idea.evidenceConfidence ?? 0;
  const risk = idea.riskScore !== null ? 100 - idea.riskScore : 50;
  return (survival + economics + readiness + fit + evidence + risk) / 7;
}

function buildLoserReason(loser: StartupIdeaCandidate, winner: StartupIdeaCandidate): string {
  const loserScore = computeCompositeScore(loser);
  const winnerScore = computeCompositeScore(winner);
  const delta = winnerScore - loserScore;

  if (loser.readinessStatus === "MORE_VALIDATION_REQUIRED") {
    return `${winner.name} is preferred: ${loser.name} requires additional validation before it can be compared fairly`;
  }
  if (loser.economicClassification === "CASH_FLOW_UNSAFE") {
    return `${winner.name} is preferred: ${loser.name} has insufficient cash runway to reach break-even`;
  }
  return `${winner.name} outscores by ${delta.toFixed(0)} points across evidence, economics, owner fit, and survival probability`;
}

function buildOwnerConstraints(profile: {
  capitalAvailableCents: bigint | null;
  ownerHoursPerWeek: number | null;
  riskTolerance: "low" | "medium" | "high" | null;
}): string[] {
  const constraints: string[] = [];
  if (profile.capitalAvailableCents !== null) {
    constraints.push(`Available capital: $${(Number(profile.capitalAvailableCents) / 100).toLocaleString()}`);
  }
  if (profile.ownerHoursPerWeek !== null) {
    constraints.push(`Owner time: ${profile.ownerHoursPerWeek}h/week`);
  }
  if (profile.riskTolerance) {
    constraints.push(`Risk tolerance: ${profile.riskTolerance}`);
  }
  return constraints;
}

function computeArbitrationConfidence(
  ideas: StartupIdeaCandidate[],
  unknownInputs: string[]
): number {
  const avgEvidence =
    ideas.reduce((sum, i) => sum + (i.evidenceConfidence ?? 0), 0) / ideas.length;
  return Math.max(10, Math.round(avgEvidence - unknownInputs.length * 5));
}

function buildWhatWouldChange(
  winner: StartupIdeaCandidate,
  alternative: StartupIdeaCandidate | null
): string {
  if (alternative === null) return "No close alternative — only one viable idea available";
  const winnerSurvival = computeSurvivalScore(winner);
  const altSurvival = computeSurvivalScore(alternative);
  if (altSurvival > winnerSurvival) {
    return `${alternative.name} could become preferred if ${winner.name}'s cash survival risk worsens, or if ${alternative.name}'s evidence improves substantially`;
  }
  return `${alternative.name} could become preferred if its validation evidence strengthens significantly or its economics improve`;
}
