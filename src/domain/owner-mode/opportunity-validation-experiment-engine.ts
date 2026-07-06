/**
 * Opportunity Validation Experiment Engine (depth pass) — turns a promoted external-opportunity candidate
 * into the CHEAPEST bounded experiment that would confirm or refute its riskiest assumption, before any
 * money or scale is committed. It is the governed bridge between "this looks worth testing" (PASS 7) and
 * "allocate real capital" (PASS 9): nothing scales until an experiment has actually passed.
 *
 * Pipeline (all pure + deterministic):
 *   promoted candidate
 *   → select the cheapest experiment type that tests the riskiest assumption
 *   → bound it: hard cost cap, owner-time cap, duration, sample-size target
 *   → define a falsifiable success metric + a failure metric + an explicit stop-loss rule
 *   → attach governance: owner approval where material, validation-before-scale note always present
 *   → owner cockpit summary (the single next experiment to run + what a pass/fail means)
 *
 * Hard governance rules:
 * - It NEVER launches, spends, contacts anyone, or scales. It only DESIGNS a bounded experiment.
 * - Every experiment is falsifiable: it has a success threshold AND a failure threshold AND a stop-loss.
 * - No experiment result is ever "ready to scale". Scaling is a separate, validation-gated decision (PASS 9).
 * - Cost caps are reported only when a real estimate is supplied; money is never fabricated.
 * - A candidate whose economics are unknown gets a DATA_COLLECTION_ONLY experiment (collect first, spend never).
 * - Material cash / workload / legal exposure forces owner approval before the experiment may run.
 */

import type {
  ExternalOpportunityCandidate,
  OpportunityType,
  SignalSourceType,
  RiskBand,
  FitBand,
  OppConfidence,
} from "./external-opportunity-intelligence";
import type { ApprovalLevel } from "./process-intelligence";

export type ExperimentType =
  | "CUSTOMER_INTEREST_TEST"
  | "B2B_OUTREACH_TEST"
  | "PRICING_TEST"
  | "LANDING_OR_FORM_TEST"
  | "WHATSAPP_OR_CALL_SCRIPT_TEST"
  | "MANUAL_SURVEY"
  | "SMALL_BATCH_TRIAL"
  | "PARTNERSHIP_TEST"
  | "DATA_COLLECTION_ONLY";

/** Design-time status is always NOT_STARTED; the later lifecycle values are what PASS 9 gates scaling on. */
export type ValidationStatus = "NOT_STARTED" | "RUNNING" | "PASSED" | "FAILED" | "INCONCLUSIVE" | "ABORTED";

/** Why a candidate cannot be turned into a runnable experiment yet (kept explicit, never silently dropped). */
export type NoExperimentReason = "PARKED" | "REJECTED" | "OWNER_DECISION_FIRST" | "NEEDS_CAPABILITY";

export interface ValidationExperimentContext {
  cashProfitRiskActive: boolean; // an active cash/profit risk that should force owner approval on any spend
  capabilityGapPresent: boolean; // OpsIQ lacks a capability required to run/measure this class of experiment
}

/** The bounded experiment plan (design-time). ~24 governed fields — cost/time capped, falsifiable, no-scale. */
export interface ValidationExperiment {
  experimentId: string;
  workspaceId: string;
  opportunityType: OpportunityType;
  signalSourceType: SignalSourceType;
  experimentType: ExperimentType;
  hypothesis: string; // the belief being tested, stated so it can be proven false
  riskiestAssumption: string; // the single assumption whose failure would kill the opportunity
  method: string; // concrete owner-visible steps
  successMetric: string;
  successThreshold: string;
  failureMetric: string;
  failureThreshold: string;
  stopLossRule: string; // when to abort mid-experiment regardless of result
  costCap: number | null; // only when a real estimate is supplied; never fabricated
  ownerTimeCapMinutes: number;
  durationDays: number;
  sampleSizeTarget: number;
  dataToCollect: string[];
  requiresOwnerApproval: boolean;
  approvalLevel: ApprovalLevel;
  validationStatus: ValidationStatus; // NOT_STARTED at design time
  cheaperAlternativeConsidered: string; // proves the cheapest option was chosen
  doNotScaleNote: string; // always present — a passed experiment is not a licence to scale
  confidence: OppConfidence;
  evaluatedAt: string;
}

/** A candidate that could not (yet) become a runnable experiment, with the reason kept for the owner. */
export interface DeferredValidation {
  workspaceId: string;
  opportunityType: OpportunityType;
  signalSourceType: SignalSourceType;
  reason: NoExperimentReason;
  ownerVisibleExplanation: string;
  systemCapabilityRecommendation: string | null;
}

export interface ValidationSummary {
  candidatesConsidered: number;
  experimentsDesigned: number;
  deferred: number;
  dataCollectionOnly: number;
  ownerApprovalRequired: number;
}

export interface OpportunityValidationAnalysis {
  workspaceId: string;
  experiments: ValidationExperiment[];
  topExperiment: ValidationExperiment | null;
  deferred: DeferredValidation[];
  capabilityRecommendations: string[];
  summary: ValidationSummary;
  evaluatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────

function lowerConfidence(c: OppConfidence, floor: OppConfidence): OppConfidence {
  const rank: Record<OppConfidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NEEDS_DATA: 3 };
  return rank[c] >= rank[floor] ? c : floor;
}

/** Deterministic experiment id (no randomness — keeps the loop reproducible + idempotent). */
function experimentIdFor(workspaceId: string, signalSourceType: SignalSourceType, opportunityType: OpportunityType, type: ExperimentType): string {
  return `exp:${workspaceId.slice(0, 8)}:${signalSourceType}:${opportunityType}:${type}`;
}

/**
 * Choose the cheapest experiment that tests the candidate's riskiest assumption. Data gaps collect first
 * (they never justify spend); otherwise the opportunity shape picks the lightest credible probe.
 */
function selectExperimentType(c: ExternalOpportunityCandidate, ctx: ValidationExperimentContext): ExperimentType {
  // Unknown economics or a data-collection next step → collect the missing data before spending anything.
  if (
    c.recommendedNextStep === "COLLECT_COST_DATA" ||
    c.recommendedNextStep === "COLLECT_DATA" ||
    c.recommendedNextStep === "COLLECT_ELIGIBILITY_DATA" ||
    c.recommendedNextStep === "NEEDS_CAPABILITY" ||
    c.missingData.length > 0
  ) {
    return "DATA_COLLECTION_ONLY";
  }
  switch (c.opportunityType) {
    case "B2B_OFFER":
      return "B2B_OUTREACH_TEST";
    case "PRICING_TEST":
      return "PRICING_TEST";
    case "RETENTION_CAMPAIGN":
      return "WHATSAPP_OR_CALL_SCRIPT_TEST";
    case "LOCAL_PARTNERSHIP":
      return "PARTNERSHIP_TEST";
    case "MARKETING_CHANNEL":
      return "LANDING_OR_FORM_TEST";
    case "NEW_SERVICE":
      // A physical service is validated with a tiny real batch when locally feasible, else demand-tested cheaply.
      return c.localFeasibility === "STRONG" ? "SMALL_BATCH_TRIAL" : "CUSTOMER_INTEREST_TEST";
    case "CUSTOMER_SEGMENT":
      return "MANUAL_SURVEY";
    case "OPERATIONS_ADJACENCY":
    case "SUPPLIER_ADVANTAGE":
      return "SMALL_BATCH_TRIAL";
    default:
      return ctx.capabilityGapPresent ? "DATA_COLLECTION_ONLY" : "CUSTOMER_INTEREST_TEST";
  }
}

interface ExperimentShape {
  hypothesis: (c: ExternalOpportunityCandidate) => string;
  method: string;
  successMetric: string;
  successThreshold: string;
  failureMetric: string;
  failureThreshold: string;
  ownerTimeCapMinutes: number;
  durationDays: number;
  sampleSizeTarget: number;
  dataToCollect: string[];
  cheaperAlternativeConsidered: string;
}

/** Per-type experiment templates — cheap, bounded, falsifiable. No fabricated money; caps are time/sample. */
const EXPERIMENT_SHAPES: Record<ExperimentType, ExperimentShape> = {
  CUSTOMER_INTEREST_TEST: {
    hypothesis: (c) => `Enough ${c.targetCustomerSegment} want this that it is worth building: "${c.expectedValueHypothesis}".`,
    method: "Describe the offer to a small set of real target customers (in person / existing channel) and record genuine interest — no build, no ads.",
    successMetric: "target customers expressing concrete interest (asking price / when / how)",
    successThreshold: "at least 3 of ~10 show concrete interest",
    failureMetric: "target customers expressing concrete interest",
    failureThreshold: "0 of ~10 show any concrete interest",
    ownerTimeCapMinutes: 90,
    durationDays: 5,
    sampleSizeTarget: 10,
    dataToCollect: ["who was asked", "concrete-interest yes/no", "objection quoted"],
    cheaperAlternativeConsidered: "A paid ad test was rejected as more expensive than talking to existing customers.",
  },
  B2B_OUTREACH_TEST: {
    hypothesis: (c) => `${c.targetCustomerSegment} businesses have a real, buyable need: "${c.customerPainPoint}".`,
    method: "Contact a short list of target businesses with a plain-language offer and ask for a follow-up meeting — no contract, no discount promise.",
    successMetric: "businesses agreeing to a next-step meeting",
    successThreshold: "at least 2 of ~10 agree to a real next step",
    failureMetric: "businesses agreeing to a next-step meeting",
    failureThreshold: "0 of ~10 respond after two touches",
    ownerTimeCapMinutes: 120,
    durationDays: 7,
    sampleSizeTarget: 10,
    dataToCollect: ["businesses contacted", "responded yes/no", "stated need", "stated budget signal"],
    cheaperAlternativeConsidered: "Building a sales deck first was rejected until at least one business shows interest.",
  },
  PRICING_TEST: {
    hypothesis: (c) => `Customers will accept the tested price for "${c.expectedValueHypothesis}" without material drop-off.`,
    method: "Offer the new price to a small, controlled set of transactions and record acceptance vs. the current price — reversible, no public change.",
    successMetric: "acceptance rate at the tested price",
    successThreshold: "acceptance holds within an acceptable margin of the current price",
    failureMetric: "acceptance rate at the tested price",
    failureThreshold: "acceptance collapses / customers visibly refuse",
    ownerTimeCapMinutes: 60,
    durationDays: 7,
    sampleSizeTarget: 20,
    dataToCollect: ["price offered", "accepted yes/no", "complaint about price yes/no"],
    cheaperAlternativeConsidered: "A blanket price change was rejected as irreversible and risky vs. a small controlled test.",
  },
  LANDING_OR_FORM_TEST: {
    hypothesis: (c) => `${c.targetCustomerSegment} will act on the offer when presented simply: "${c.expectedValueHypothesis}".`,
    method: "Put up a single simple form / message (existing free channel) describing the offer and count genuine sign-ups — no paid traffic required to start.",
    successMetric: "genuine sign-ups / enquiries from real prospects",
    successThreshold: "a small but clear cluster of genuine sign-ups",
    failureMetric: "genuine sign-ups / enquiries",
    failureThreshold: "no genuine sign-ups after reaching the sample",
    ownerTimeCapMinutes: 60,
    durationDays: 7,
    sampleSizeTarget: 30,
    dataToCollect: ["reach", "sign-ups", "which offer wording"],
    cheaperAlternativeConsidered: "A full website build was rejected in favour of one form on an existing channel.",
  },
  WHATSAPP_OR_CALL_SCRIPT_TEST: {
    hypothesis: (c) => `A direct message/call to ${c.targetCustomerSegment} recovers or converts them: "${c.expectedValueHypothesis}".`,
    method: "Contact a small list of relevant existing customers with a short, honest script (e.g. a retention or re-engagement offer) and record real responses — no mass blast.",
    successMetric: "positive responses / re-engagements",
    successThreshold: "a meaningful share respond positively",
    failureMetric: "positive responses / re-engagements",
    failureThreshold: "near-zero response or negative reaction",
    ownerTimeCapMinutes: 60,
    durationDays: 5,
    sampleSizeTarget: 15,
    dataToCollect: ["customers contacted", "responded positive/negative/none", "quoted reason"],
    cheaperAlternativeConsidered: "A paid re-engagement campaign was rejected until a hand-run script shows any signal.",
  },
  MANUAL_SURVEY: {
    hypothesis: (c) => `${c.targetCustomerSegment} confirm the assumed need when asked directly: "${c.customerPainPoint}".`,
    method: "Ask a short, honest set of questions to real target customers (in person / existing channel) and record answers — no incentives that bias the result.",
    successMetric: "respondents confirming the assumed need unprompted",
    successThreshold: "a clear majority confirm the need",
    failureMetric: "respondents confirming the assumed need",
    failureThreshold: "most do not recognise the need",
    ownerTimeCapMinutes: 75,
    durationDays: 5,
    sampleSizeTarget: 12,
    dataToCollect: ["respondents", "need confirmed yes/no", "what they do today instead"],
    cheaperAlternativeConsidered: "A paid market-research panel was rejected in favour of asking existing customers.",
  },
  SMALL_BATCH_TRIAL: {
    hypothesis: (c) => `The business can actually deliver "${c.expectedValueHypothesis}" at acceptable quality and effort on a tiny scale.`,
    method: "Deliver the new service/offer for a very small number of real orders and measure quality, effort and cost — strictly capped volume, fully reversible.",
    successMetric: "batch delivered at acceptable quality within effort/cost expectation",
    successThreshold: "the small batch is delivered acceptably without straining operations",
    failureMetric: "quality failures / effort or cost overrun on the batch",
    failureThreshold: "quality fails or effort/cost blows past expectation",
    ownerTimeCapMinutes: 120,
    durationDays: 10,
    sampleSizeTarget: 5,
    dataToCollect: ["orders delivered", "quality outcome", "actual effort", "actual cost inputs"],
    cheaperAlternativeConsidered: "A full launch was rejected in favour of a strictly capped trial batch.",
  },
  PARTNERSHIP_TEST: {
    hypothesis: (c) => `A local partner will actually collaborate on "${c.expectedValueHypothesis}" on fair terms.`,
    method: "Have one honest conversation with a candidate partner to gauge real willingness and rough terms — no binding commitment, no exclusivity promise.",
    successMetric: "partner agreeing to a concrete small trial together",
    successThreshold: "at least one partner agrees to a concrete small trial",
    failureMetric: "partner willingness",
    failureThreshold: "no partner shows real willingness",
    ownerTimeCapMinutes: 90,
    durationDays: 10,
    sampleSizeTarget: 3,
    dataToCollect: ["partners approached", "willing yes/no", "rough terms discussed"],
    cheaperAlternativeConsidered: "Drafting a partnership contract first was rejected until a partner shows willingness.",
  },
  DATA_COLLECTION_ONLY: {
    hypothesis: (c) => `The missing facts needed to judge "${c.expectedValueHypothesis}" can be gathered cheaply before any spend.`,
    method: "Gather the specific missing facts (economics, eligibility, demand evidence) from existing records and free sources — no spend, no launch — then re-evaluate.",
    successMetric: "missing data points captured",
    successThreshold: "the listed missing data is captured well enough to re-evaluate",
    failureMetric: "missing data points captured",
    failureThreshold: "the data cannot be obtained cheaply — escalate to owner review",
    ownerTimeCapMinutes: 45,
    durationDays: 5,
    sampleSizeTarget: 1,
    dataToCollect: ["unit economics", "eligibility / constraints", "demand evidence"],
    cheaperAlternativeConsidered: "Running a paid experiment now was rejected until the basic facts are known.",
  },
};

// ── Core: design one experiment ──────────────────────────────────────────────────────────────────────────

/**
 * Turn one promoted candidate into a bounded experiment — or defer it with an explicit reason. Pure.
 * Returns a `DeferredValidation` (never a fabricated experiment) when the candidate should not be tested yet.
 */
export function designValidationExperiment(
  candidate: ExternalOpportunityCandidate,
  ctx: ValidationExperimentContext,
  evaluatedAt: string,
): ValidationExperiment | DeferredValidation {
  // Parked / rejected candidates are never turned into experiments — surfaced honestly instead.
  if (candidate.recommendedNextStep === "PARK") {
    return {
      workspaceId: candidate.workspaceId,
      opportunityType: candidate.opportunityType,
      signalSourceType: candidate.signalSourceType,
      reason: "PARKED",
      ownerVisibleExplanation: "Parked opportunity — not worth an experiment until a stronger signal appears.",
      systemCapabilityRecommendation: null,
    };
  }
  if (candidate.recommendedNextStep === "REJECT") {
    return {
      workspaceId: candidate.workspaceId,
      opportunityType: candidate.opportunityType,
      signalSourceType: candidate.signalSourceType,
      reason: "REJECTED",
      ownerVisibleExplanation: "Rejected opportunity — no experiment.",
      systemCapabilityRecommendation: null,
    };
  }
  // An owner-review candidate driven by material cash/legal risk needs an owner decision before any experiment.
  if (candidate.recommendedNextStep === "OWNER_REVIEW" && (candidate.cashRisk === "HIGH" || candidate.legalOrComplianceRisk === "HIGH" || candidate.legalOrComplianceRisk === "UNKNOWN")) {
    return {
      workspaceId: candidate.workspaceId,
      opportunityType: candidate.opportunityType,
      signalSourceType: candidate.signalSourceType,
      reason: "OWNER_DECISION_FIRST",
      ownerVisibleExplanation: "Material cash or legal exposure — the owner must decide before any experiment is designed or run.",
      systemCapabilityRecommendation: candidate.systemCapabilityRecommendation,
    };
  }

  const experimentType = selectExperimentType(candidate, ctx);
  const shape = EXPERIMENT_SHAPES[experimentType];

  // Confidence in the DESIGN inherits the candidate and is lowered by missing data (never inflated).
  let confidence = candidate.confidence;
  if (candidate.missingData.length > 0) confidence = lowerConfidence(confidence, "LOW");

  // Owner approval when the experiment touches money/workload/legal exposure or an active cash risk.
  const materialSpend = candidate.validationCostEstimate != null && candidate.validationCostEstimate > 0 && experimentType !== "DATA_COLLECTION_ONLY";
  const requiresOwnerApproval =
    candidate.approvalLevel === "OWNER" ||
    candidate.cashRisk === "HIGH" ||
    candidate.ownerWorkloadRisk === "HIGH" ||
    candidate.legalOrComplianceRisk === "HIGH" ||
    ctx.cashProfitRiskActive ||
    materialSpend;
  const approvalLevel: ApprovalLevel = requiresOwnerApproval ? "OWNER" : "MANAGER";

  // Cost cap: only a real supplied estimate is ever shown; DATA_COLLECTION_ONLY spends nothing.
  const costCap = experimentType === "DATA_COLLECTION_ONLY" ? 0 : candidate.validationCostEstimate;

  const stopLossRule =
    experimentType === "DATA_COLLECTION_ONLY"
      ? `Stop if the data cannot be gathered within ${shape.ownerTimeCapMinutes} minutes of owner time — escalate to owner review instead of spending.`
      : `Abort immediately if owner time exceeds ${shape.ownerTimeCapMinutes} minutes${costCap != null ? `, spend approaches the ${costCap} cap,` : ""} or the failure threshold is hit — do not "give it more time".`;

  return {
    experimentId: experimentIdFor(candidate.workspaceId, candidate.signalSourceType, candidate.opportunityType, experimentType),
    workspaceId: candidate.workspaceId,
    opportunityType: candidate.opportunityType,
    signalSourceType: candidate.signalSourceType,
    experimentType,
    hypothesis: shape.hypothesis(candidate),
    riskiestAssumption:
      experimentType === "DATA_COLLECTION_ONLY"
        ? "That the opportunity can even be judged without the missing facts — it cannot, so gather them first."
        : `That real ${candidate.targetCustomerSegment} will act on this, not just that it sounds good.`,
    method: shape.method,
    successMetric: shape.successMetric,
    successThreshold: shape.successThreshold,
    failureMetric: shape.failureMetric,
    failureThreshold: shape.failureThreshold,
    stopLossRule,
    costCap,
    ownerTimeCapMinutes: shape.ownerTimeCapMinutes,
    durationDays: shape.durationDays,
    sampleSizeTarget: shape.sampleSizeTarget,
    dataToCollect: candidate.missingData.length > 0 ? Array.from(new Set([...shape.dataToCollect, ...candidate.missingData])) : shape.dataToCollect,
    requiresOwnerApproval,
    approvalLevel,
    validationStatus: "NOT_STARTED",
    cheaperAlternativeConsidered: shape.cheaperAlternativeConsidered,
    doNotScaleNote: "A passing result validates the assumption only — it is not permission to scale. Scaling is a separate, capital-allocated decision.",
    confidence,
    evaluatedAt,
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────────────────────────────────

function isExperiment(x: ValidationExperiment | DeferredValidation): x is ValidationExperiment {
  return "experimentType" in x;
}

// Cheaper / more decisive experiments first; DATA_COLLECTION_ONLY sinks below runnable probes.
const EXPERIMENT_TYPE_RANK: Record<ExperimentType, number> = {
  WHATSAPP_OR_CALL_SCRIPT_TEST: 0,
  B2B_OUTREACH_TEST: 1,
  CUSTOMER_INTEREST_TEST: 2,
  MANUAL_SURVEY: 3,
  PRICING_TEST: 4,
  LANDING_OR_FORM_TEST: 5,
  PARTNERSHIP_TEST: 6,
  SMALL_BATCH_TRIAL: 7,
  DATA_COLLECTION_ONLY: 8,
};
const CONFIDENCE_RANK: Record<OppConfidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NEEDS_DATA: 3 };

/**
 * Design a bounded validation experiment for each promoted candidate (or defer it with a reason). Pure +
 * deterministic. The owner cockpit sees only the single top experiment to run next; the rest are retained.
 */
export function buildOpportunityValidationPlan(
  candidates: ExternalOpportunityCandidate[],
  ctx: ValidationExperimentContext,
  workspaceId: string,
  evaluatedAt: string,
): OpportunityValidationAnalysis {
  const experiments: ValidationExperiment[] = [];
  const deferred: DeferredValidation[] = [];
  for (const c of candidates) {
    const out = designValidationExperiment(c, ctx, evaluatedAt);
    if (isExperiment(out)) experiments.push(out);
    else deferred.push(out);
  }

  experiments.sort(
    (a, b) =>
      Number(a.requiresOwnerApproval) - Number(b.requiresOwnerApproval) ||
      EXPERIMENT_TYPE_RANK[a.experimentType] - EXPERIMENT_TYPE_RANK[b.experimentType] ||
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
  );

  const capabilityRecommendations = Array.from(
    new Set(deferred.map((d) => d.systemCapabilityRecommendation).filter((r): r is string => r !== null)),
  );

  const summary: ValidationSummary = {
    candidatesConsidered: candidates.length,
    experimentsDesigned: experiments.length,
    deferred: deferred.length,
    dataCollectionOnly: experiments.filter((e) => e.experimentType === "DATA_COLLECTION_ONLY").length,
    ownerApprovalRequired: experiments.filter((e) => e.requiresOwnerApproval).length,
  };

  return {
    workspaceId,
    experiments,
    topExperiment: experiments[0] ?? null,
    deferred,
    capabilityRecommendations,
    summary,
    evaluatedAt,
  };
}

// Re-export shared bands so downstream (PASS 9 portfolio) can consume validation status without a second import.
export type { RiskBand, FitBand };
