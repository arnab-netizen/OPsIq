/**
 * Slice D (1/2) — whole-business operating plan.
 *
 * Composes the advisor output + cross-domain arbitration + per-case domain health + business stage +
 * growth gates + profitability into ONE integrated operating plan (25 sections), so the owner gets a
 * coherent decision rather than disconnected domain advice.
 */
import { arbitrate, type ArbitrationResult } from "./arbitration";
import { caseDomainHealth, type CaseDomainHealth } from "./domains";
import { evaluateGrowthGates, type GrowthGateResult } from "./growth-gates";
import { profitabilityCheck } from "./profitability";
import { inferBusinessStage, stageAdjustedPriority, type BusinessStage } from "./stages";
import type { AdviceOutput, BehavioralCase } from "../schema";

export interface WholeBusinessPlan {
  businessHealthSummary: string;
  domainHealthTable: CaseDomainHealth[];
  highestPriorityConstraint: string;
  rootCause: string;
  stopDoNotDoList: string[];
  nextBestAction: string;
  plan7Day: string;
  plan30Day: string;
  plan90Day: string;
  financeCashImpact: string;
  marginPricingImpact: string;
  operationsProcessImpact: string;
  staffTrainingImpact: string;
  equipmentCapacityImpact: string;
  customerReputationImpact: string;
  marketingSalesImpact: string;
  complianceBoundary: string;
  ownerApprovalRequired: boolean;
  opsiqPreparedWork: string[];
  delegatedWork: string[];
  proofRequired: string[];
  successMetrics: string[];
  reassessmentTriggers: string[];
  learningUsed: string[];
  ignoreDeferList: string[];
  // engine outputs retained for scoring / surfacing
  stage: BusinessStage;
  arbitration: ArbitrationResult;
  growth: GrowthGateResult;
}

function s(v?: string, fallback = "Not specified."): string {
  return typeof v === "string" && v.trim().length > 0 ? v : fallback;
}

export function buildWholeBusinessPlan(c: BehavioralCase, a: AdviceOutput): WholeBusinessPlan {
  const arb = arbitrate(c);
  const stage = inferBusinessStage(c);
  const growth = evaluateGrowthGates(c, a);
  const profit = profitabilityCheck(c, a);
  const domains = caseDomainHealth(c, a);
  const reds = domains.filter((d) => d.status === "red");

  const stopList = Array.from(new Set([...(a.whatNotToDo ?? []), ...arb.whatNotToDo]));
  const learningUsed = [
    ...(a.learningNotesApplied ?? []),
    ...(a.learningMemoryNote ? [a.learningMemoryNote] : []),
  ];

  return {
    businessHealthSummary: `${c.businessType} (${c.location.cityRegion}) — stage: ${stage.replace(/_/g, " ")}; dominant constraint: ${arb.dominantConstraint}; ${reds.length} domain(s) red. ${profit.violations.length ? "Profitability concerns: " + profit.violations.join("; ") + "." : "No profitability red flags."}`,
    domainHealthTable: domains,
    highestPriorityConstraint: arb.dominantConstraint,
    rootCause: s(a.rootCause),
    stopDoNotDoList: stopList.length ? stopList : ["Do not commit resources before the dominant constraint is resolved."],
    nextBestAction: arb.winningRecommendation,
    plan7Day: `Resolve ${arb.dominantConstraint}: ${arb.winningRecommendation} ${s(a.recommendedNextAction, "")}`.trim(),
    plan30Day: `Stabilise: ${stageAdjustedPriority(c, stage)}; verify the proof and rerun the dominant-constraint check.`,
    plan90Day: growth.scaleAllowed
      ? "Grow the proven, profitable line via capped, proof-gated steps; keep the stop-loss active."
      : `Do not scale yet — gates failing: ${growth.blockedBy.join(", ") || "none"}. Stabilise first, then re-test the growth gates.`,
    financeCashImpact: s(a.cashMarginRisk, s(a.financialImpact)),
    marginPricingImpact: s(a.financialImpact, "Compute contribution margin before any pricing/contract move."),
    operationsProcessImpact: s(a.processSopUpdate),
    staffTrainingImpact: s(a.capacityImpact, "Rebalance shifts; prove the staffing need before adding cost."),
    equipmentCapacityImpact: s(a.capacityImpact, "Confirm reliable capacity before adding load."),
    customerReputationImpact: domains.some((d) => d.domain === "reputation_complaints") ? "Protect quality/reputation before acquisition spend." : "Maintain quality standards.",
    marketingSalesImpact: s(a.marketingOpportunityGuidance, "Market only proven, profitable services."),
    complianceBoundary: s(a.professionalReview, "No compliance grey area flagged for this case."),
    ownerApprovalRequired: arb.ownerApprovalNeeded || a.ownerApprovalNeeded === true,
    opsiqPreparedWork: [
      "Prepare the margin/cash calculation and proof templates.",
      "Draft the checklist/SOP and the reassessment schedule.",
    ],
    delegatedWork: a.processSopUpdate ? [a.processSopUpdate] : ["Assign a named supervisor to own each step with a daily proof report."],
    proofRequired: a.proofRequired ?? [],
    successMetrics: [s(a.expectedOutcome, "Cash, margin and complaint/rework metrics move into the acceptable band.")],
    reassessmentTriggers: a.reassessmentTrigger ? [a.reassessmentTrigger] : [arb.reassessmentDate],
    learningUsed: learningUsed.length ? learningUsed : ["No prior learning applied to this case yet."],
    ignoreDeferList: growth.scaleAllowed ? ["Defer only nice-to-have optimisations."] : ["Defer growth/marketing spend and expansion until the dominant constraint clears."],
    stage,
    arbitration: arb,
    growth,
  };
}
