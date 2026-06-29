/**
 * Controlled-learning engine.
 *
 * Turns a scored FAILURE into (a) a persistent correction artifact whose corrected behavior the
 * advisor will read and apply to future in-scope cases, and (b) a regression case that re-tests the
 * corrected behavior. Artifacts are created workspace_private + pending by default: they take effect
 * inside the originating workspace immediately (local controlled learning) but only ever cross into
 * other workspaces after explicit approval + promotion (governance, no leakage).
 *
 * Deterministic: all timestamps are caller-supplied ISO strings (no Date.now in this env).
 */
import { abstractedLocationKey } from "./locations";
import { classifyFailure } from "./failure-classifier";
import {
  learningArtifactSchema,
  type BehavioralCase,
  type FailureLabel,
  type LearningArtifact,
  type ScoreResult,
} from "./schema";
import type { LearningStore } from "./learning-store";

const CORRECTED_BEHAVIOR: Record<FailureLabel, string> = {
  owner_workload_increased: "Always include an owner-workload reduction: delegate routine checks to a named person with a daily exception-only proof report so the owner stops being the bottleneck.",
  bad_cash_advice: "In cash-risk cases, state plainly that revenue growth is not success while cash worsens, and block discretionary spend until margin and quality proof pass.",
  bad_margin_advice: "Require a fully-loaded contribution-margin computation before any pricing or contract decision; never accept work below fully-loaded cost.",
  capacity_ignored: "State the capacity and quality impact, and cap new load to reliable throughput before any growth.",
  weak_marketing_judgment: "Never recommend buying reach while conversion, margin or reputation is weak; fix unit economics first and market only proven, profitable services through the local channel.",
  generic_advice: "Replace generic guidance with case-specific actions grounded in this business's numbers, capacity and local market.",
  bad_opportunity_accepted: "Do not accept an opportunity/contract before cost, margin, capacity and payment-term checks pass; pilot small with proof.",
  compliance_risk_missed: "Flag licensing/tax/regulatory grey areas for written professional review; never give definitive legal or tax certainty.",
  location_reality_missed: "Adapt the advice to local customer, labour and payment reality; do not apply a generic playbook in a high-sensitivity market.",
  no_proof_requirement: "Always require measured proof of the claimed problem and the expected effect before committing resources.",
  no_reassessment_trigger: "Always set an explicit reassessment trigger with a cadence tied to the risk level.",
  wrong_diagnosis: "Re-derive the root cause from the observed mess and numbers before recommending action; separate symptom from cause.",
  symptom_as_root_cause: "Trace the presenting symptom to its structural cause (margin, capacity, data or trust) before acting.",
  repeated_bad_advice: "Check learning memory first and do not repeat a recommendation already recorded as failing without a changed rationale.",
  unsafe_confidence_weak_data: "Lower stated confidence and reconcile current data before any irreversible action when data is stale, missing or conflicting.",
  staff_overload_ignored: "Account for staff overload: rebalance shifts and prove the staffing need before adding work or cost.",
  proof_gaming_risk_missed: "Require independent system or third-party verification when numbers are self-reported; treat unverifiable proof as no proof.",
  vendor_payment_risk_missed: "Check vendor and payment-term risk; long receivables with thin margin starve working capital.",
  working_capital_trap_missed: "Check the cash-conversion cycle and unit economics before accepting volume or expansion; long terms with thin margin are a working-capital trap.",
  owner_emotional_decision_enabled: "Separate emotion from evidence: require proof the emotionally-preferred choice is financially sound and offer a safer cooling-off alternative.",
};

/** Human-factors / generic labels apply across decision categories; others stay category-scoped. */
const CROSS_CATEGORY_LABELS = new Set<FailureLabel>([
  "owner_workload_increased",
  "generic_advice",
  "no_reassessment_trigger",
  "no_proof_requirement",
  "owner_emotional_decision_enabled",
  "wrong_diagnosis",
  "symptom_as_root_cause",
  "repeated_bad_advice",
]);

const LOCATION_SCOPED_LABELS = new Set<FailureLabel>(["location_reality_missed"]);

function riskOf(score: ScoreResult): "low" | "medium" | "high" {
  if (score.unsafe.length > 0 || score.total < 50) return "high";
  if (score.total < 70) return "medium";
  return "low";
}

export interface CorrectionResult {
  artifact: LearningArtifact;
  regressionCase: BehavioralCase;
  primary: FailureLabel;
}

/**
 * Build a correction artifact + regression case from a failed scored case. Does NOT persist —
 * caller saves to a store (so the engine stays pure/testable).
 */
export function deriveCorrection(
  c: BehavioralCase,
  score: ScoreResult,
  opts: { workspaceId: string; actor: string; at: string },
): CorrectionResult | null {
  // Learn from outright failures AND from identified sub-expert weaknesses (failure labels / unsafe),
  // not only from cases that drop below the pass threshold — continuous improvement toward expert.
  const hasWeakness = score.failureLabels.length > 0 || score.unsafe.length > 0;
  if (score.passed && !hasWeakness) return null; // a clean pass has nothing to learn
  const { primary } = classifyFailure(c, score);
  if (!primary) return null;

  const locKey = abstractedLocationKey(c.location);
  const artifact: LearningArtifact = learningArtifactSchema.parse({
    id: `${c.id}::v1`,
    sourceCaseId: c.id,
    businessType: c.businessType,
    archetype: c.archetype,
    locationKey: locKey,
    failureLabel: primary,
    originalFailedBehavior: `Scored ${score.total}/100${score.unsafe.length ? ` with ${score.unsafe.length} unsafe flag(s)` : ""}; failed on ${score.failureLabels.join(", ") || primary}.`,
    correctedBehavior: CORRECTED_BEHAVIOR[primary],
    applicabilityScope: {
      archetype: c.archetype,
      decisionCategory: CROSS_CATEGORY_LABELS.has(primary) ? null : c.decisionCategory,
      locationKey: LOCATION_SCOPED_LABELS.has(primary) ? locKey : null,
    },
    riskLevel: riskOf(score),
    approvalStatus: "pending",
    scope: "local_only",
    privacyClassification: "workspace_private",
    workspaceId: opts.workspaceId,
    version: 1,
    supersededByVersion: null,
    active: true,
    createdAt: opts.at,
    auditTrail: [{ at: opts.at, actor: opts.actor, action: "created_from_failure" }],
  });

  const regressionCase: BehavioralCase = {
    ...c,
    id: `${c.id}__regression`,
    messyFacts: Array.from(new Set([...c.messyFacts, `Regression check for learned correction: ${primary}.`])),
  };

  return { artifact, primary, regressionCase };
}

/** Convenience: derive + persist in one step. Returns null if the case passed (nothing to learn). */
export async function learnFromFailure(
  c: BehavioralCase,
  score: ScoreResult,
  store: LearningStore,
  opts: { workspaceId: string; actor: string; at: string },
): Promise<CorrectionResult | null> {
  const result = deriveCorrection(c, score, opts);
  if (!result) return null;
  await store.save(result.artifact);
  return result;
}
