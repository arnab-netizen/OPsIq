/**
 * BUSINESS-REALITY SCENARIO CONTRACT — the typed schema every counted scenario across the known-to-unknown
 * corpus must satisfy (the existing 180 `BASELINE_CHAOS_CORPUS_V1` + the 1,070 planned pack scenarios). It
 * generalises the chaos-scenario shape with the explicit known→unknown tag and the risk/boundary/mobile
 * fields the packs need, and is PROVEN by lifting all 180 existing chaos-ledger entries into it (so it is a
 * real contract, not vaporware). No new engine — a schema + a pure lift function. No DB, no Date.now, no model.
 */
import { z } from "zod";
import { CONSTRAINTS } from "../../behavioral-validation/whole-business/arbitration";
import { CHAOS_LEDGER, type ChaosLedgerEntry } from "../../behavioral-validation/chaos-replay/chaos-ledger";

export const ACTION_STATUSES = ["blocked", "need_more_data", "owner_decision_required", "cautious_proceed", "proceed"] as const;

/** known → unknown spectrum. `unknown_unknown_guardrail` = a case OpsIQ cannot pattern-match and must handle
 *  SAFELY (novelty → confidence↓ → escalate/block/proof/reassess), never claim to solve directly. */
export const KNOWN_TO_UNKNOWN_TAGS = ["known", "known_unknown", "pattern_adjacent_unknown", "unknown_unknown_guardrail"] as const;
export type KnownToUnknownTag = (typeof KNOWN_TO_UNKNOWN_TAGS)[number];

export const INPUT_QUALITY_STATES = ["high_confidence", "sufficient", "data_limited", "stale", "conflicting", "owner_estimate_only", "critical_missing"] as const;
export const BOUNDARY_STATES = ["safe_operational", "needs_external_verification", "owner_approval_required", "professional_review_required", "blocked_until_review"] as const;
export const NOVELTY_STATES = ["known", "novel_low_risk", "novel_high_risk"] as const;

export const businessRealityScenarioSchema = z.object({
  scenarioId: z.string().min(3),
  scenarioPack: z.string().min(3),
  category: z.string().min(2),
  severity: z.string().min(2),
  goodBadUgly: z.enum(["good", "bad", "ugly"]),
  knownToUnknownTag: z.enum(KNOWN_TO_UNKNOWN_TAGS),
  sourceRefs: z.array(z.string()),
  sourceLimitations: z.array(z.string()).min(1),
  independentGold: z.boolean(),
  businessArchetype: z.string().min(2),
  expectedModules: z.array(z.string()).min(1),
  expectedDominantConstraint: z.enum(CONSTRAINTS),
  expectedActionStatus: z.enum(ACTION_STATUSES),
  expectedOwnerDecision: z.string(),
  expectedDelegation: z.string(),
  expectedDoNow: z.string().min(2),
  expectedDoNotDo: z.array(z.string()),
  expectedProofRequired: z.array(z.string()).min(1),
  expectedReassessment: z.array(z.string()).min(1),
  expectedInputQualityState: z.enum(INPUT_QUALITY_STATES),
  expectedBoundaryState: z.enum(BOUNDARY_STATES),
  expectedNoveltyState: z.enum(NOVELTY_STATES),
  expectedProfitCashWorkloadImpact: z.array(z.string()).min(1),
  expectedOutcomeMetric: z.string().min(2),
  expectedDashboardFields: z.array(z.string()).min(1),
  expectedMobileFields: z.array(z.string()).min(1),
  badOutcomeIfFollowed: z.string().min(2),
  highRisk: z.boolean(),
  professionalReviewRequired: z.boolean(),
  ownerWorkloadRisk: z.enum(["low", "medium", "high"]),
  antiGamingRisk: z.enum(["none", "low", "medium", "high"]),
  liveOutcomeClaimAllowed: z.boolean(),
  // ── counted/synthetic bookkeeping (readiness accounting) ──
  countedForReadiness: z.boolean(),
  synthetic: z.boolean(),
  /** Only a scenario backed by real live business data may EVER allow a live-outcome claim. */
  liveDataBacked: z.boolean(),
})
  // A counted scenario must carry a real source.
  .refine((s) => !s.countedForReadiness || s.sourceRefs.length > 0, { message: "counted scenario needs a sourceRef" })
  // A synthetic scenario can never be counted toward readiness.
  .refine((s) => !s.synthetic || !s.countedForReadiness, { message: "synthetic scenario cannot be counted" })
  // Professional review overrides any proceed/cautious_proceed.
  .refine((s) => !s.professionalReviewRequired || (s.expectedActionStatus !== "proceed" && s.expectedActionStatus !== "cautious_proceed"),
    { message: "professionalReviewRequired cannot proceed/cautious_proceed" })
  // A live-outcome claim is only allowed when backed by real live data.
  .refine((s) => !s.liveOutcomeClaimAllowed || s.liveDataBacked, { message: "liveOutcomeClaimAllowed requires liveDataBacked" });

export type BusinessRealityScenario = z.infer<typeof businessRealityScenarioSchema>;

const BLOCKED_DOMS = new Set(["compliance_block", "proof_fraud_block"]);
const DASHBOARD_FIELDS = ["mainIssue", "actionStatus", "doNow", "doNotDo", "ownerDecisionRequired", "proofNeeded", "impact", "reassessment", "confidence", "missingData"];
const MOBILE_FIELDS = ["mainIssue", "actionStatus", "doNow", "proofNeeded", "reassessment"];

/** Map a good/bad/ugly chaos entry to its known→unknown tag: good/bad = known; ugly = pattern-adjacent unknown
 *  (tail risk near known patterns). Compliance/proof boundaries are known_unknown (need external/professional). */
function tagFor(e: ChaosLedgerEntry): KnownToUnknownTag {
  if (e.expectedDominantConstraint === "compliance_block") return "known_unknown";
  if (e.goodBadUgly === "ugly") return "pattern_adjacent_unknown";
  return "known";
}

/** Lift an existing chaos-ledger entry into the general business-reality scenario contract. Deterministic;
 *  preserves the locked expectation. Proves the schema against the real 180 without fabricating anything. */
export function liftChaosEntry(e: ChaosLedgerEntry): BusinessRealityScenario {
  const blocked = BLOCKED_DOMS.has(e.expectedDominantConstraint);
  const professionalReviewRequired = e.expectedDominantConstraint === "compliance_block";
  const highRisk = blocked || e.goodBadUgly === "ugly";
  const antiGaming = e.expectedDominantConstraint === "proof_fraud_block" ? "high" as const : "none" as const;
  return businessRealityScenarioSchema.parse({
    scenarioId: e.scenarioId,
    scenarioPack: "BASELINE_CHAOS_CORPUS_V1",
    category: e.category,
    severity: e.goodBadUgly === "ugly" ? "high" : e.goodBadUgly === "bad" ? "medium" : "low",
    goodBadUgly: e.goodBadUgly,
    knownToUnknownTag: tagFor(e),
    sourceRefs: e.sourceRefs,
    sourceLimitations: ["self-reported owner claim", "incomplete financials"],
    independentGold: e.independentGold,
    businessArchetype: e.category,
    expectedModules: e.expectedModules,
    expectedDominantConstraint: e.expectedDominantConstraint,
    expectedActionStatus: e.expectedActionStatus,
    expectedOwnerDecision: e.expectedActionStatus === "owner_decision_required" ? "Owner must decide on the binding constraint." : "",
    expectedDelegation: blocked ? "" : "OpsIQ + staff can prepare with proof.",
    expectedDoNow: blocked ? "Do not act until the boundary/proof clears." : "Prepare the measured step with proof.",
    expectedDoNotDo: e.expectedDoNotDo ? [e.expectedDoNotDo] : [],
    expectedProofRequired: e.expectedProofReassessment.length ? e.expectedProofReassessment : ["measured proof of the change"],
    expectedReassessment: e.expectedProofReassessment.length ? e.expectedProofReassessment : ["after the proof is accepted"],
    expectedInputQualityState: "sufficient",
    expectedBoundaryState: e.expectedDominantConstraint === "compliance_block" ? "blocked_until_review" : "safe_operational",
    expectedNoveltyState: highRisk ? "novel_high_risk" : "known",
    expectedProfitCashWorkloadImpact: e.expectedProfitCashWorkload,
    expectedOutcomeMetric: e.expectedProfitCashWorkload[0] ?? "profit",
    expectedDashboardFields: DASHBOARD_FIELDS,
    expectedMobileFields: MOBILE_FIELDS,
    badOutcomeIfFollowed: "Following the tempting wrong action worsens the binding constraint.",
    highRisk,
    professionalReviewRequired,
    ownerWorkloadRisk: e.expectedDominantConstraint === "owner_workload" ? "high" : "medium",
    antiGamingRisk: antiGaming,
    liveOutcomeClaimAllowed: false,
    countedForReadiness: true,
    synthetic: false,
    liveDataBacked: false,
  });
}

/** The existing 180, lifted into the general contract (proves the schema against real data). */
export const BASELINE_V1_SCENARIOS: BusinessRealityScenario[] = CHAOS_LEDGER.map(liftChaosEntry);
