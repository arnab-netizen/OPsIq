/**
 * Failure → adjudication / regression / scoped-learning loop (§13). When the observer/auditor finds a
 * failure, OpsIQ must not ignore it: it opens an adjudication item, records a regression case, and — only
 * if safe — proposes a SCOPED learning candidate (never globally promoted from a single case). Rerunning
 * an affected scenario after a fix preserves the before/after audit, and any unresolved HIGH-RISK failure
 * stays visible and blocks readiness.
 *
 * Pure module: no DB, no Date.now, no AI. It produces governance artifacts; it does not mutate the runtime.
 */
import type { ChaosScenario } from "./chaos-schema";
import type { ChaosAuditResult } from "./chaos-auditor";

export interface ChaosAdjudicationItem {
  scenarioId: string;
  reason: string;
  failureLabels: string[];
  highRisk: boolean;
  status: "open" | "resolved";
}

export interface ChaosRegressionCase {
  scenarioId: string;
  expectedDominantConstraint: string;
  expectedActionStatus: string;
  rerunOnEveryRun: true;
}

export interface ChaosLearningCandidate {
  scenarioId: string;
  note: string;
  scope: "local_only";          // never global-promoted from one case
  globalPromotion: false;
  requiresApproval: true;
}

export interface FailureArtifacts {
  adjudication: ChaosAdjudicationItem;
  regression: ChaosRegressionCase;
  learning: ChaosLearningCandidate | null;
}

export function isHighRiskScenario(s: ChaosScenario): boolean {
  return s.goodBadUgly === "ugly"
    || s.expectedDominantConstraint === "compliance_block"
    || s.expectedDominantConstraint === "proof_fraud_block";
}

/** Build the governance artifacts for a failed audit. Returns null when the audit passed (no failure). */
export function failureToArtifacts(scenario: ChaosScenario, audit: ChaosAuditResult): FailureArtifacts | null {
  if (audit.pass) return null;
  const highRisk = isHighRiskScenario(scenario);
  // Scoped learning is proposed only when the failure is NOT itself an unsafe/fake-confidence safety breach
  // (those must be fixed at the engine, not "learned" around) — and is always local + approval-gated.
  const safeToLearn = !audit.failureLabels.includes("unsafe_output")
    && !audit.failureLabels.includes("fake_high_confidence");
  return {
    adjudication: {
      scenarioId: scenario.scenarioId,
      reason: audit.failureLabels.join(", ") || "audit failed",
      failureLabels: audit.failureLabels,
      highRisk,
      status: "open",
    },
    regression: {
      scenarioId: scenario.scenarioId,
      expectedDominantConstraint: scenario.expectedDominantConstraint,
      expectedActionStatus: scenario.expectedSupervisorActionStatus,
      rerunOnEveryRun: true,
    },
    learning: safeToLearn
      ? {
          scenarioId: scenario.scenarioId,
          note: audit.learningRecommendation ?? scenario.expectedLearningOnFail,
          scope: "local_only",
          globalPromotion: false,
          requiresApproval: true,
        }
      : null,
  };
}

export interface RerunRecord {
  scenarioId: string;
  before: { pass: boolean; failureLabels: string[] };
  after: { pass: boolean; failureLabels: string[] };
  improved: boolean;
}

/** Record a before/after rerun of a fixed scenario (preserves evidence; proves improvement). */
export function recordRerun(scenarioId: string, before: ChaosAuditResult, after: ChaosAuditResult): RerunRecord {
  return {
    scenarioId,
    before: { pass: before.pass, failureLabels: before.failureLabels },
    after: { pass: after.pass, failureLabels: after.failureLabels },
    improved: !before.pass && after.pass,
  };
}

/** Unresolved HIGH-RISK failures block readiness. `resolved` are scenarioIds that re-ran to a pass. */
export function unresolvedHighRiskFailures(
  items: Array<{ scenario: ChaosScenario; audit: ChaosAuditResult }>,
  resolved: Set<string> = new Set(),
): string[] {
  return items
    .filter((i) => isHighRiskScenario(i.scenario) && !i.audit.pass && !resolved.has(i.scenario.scenarioId))
    .map((i) => i.scenario.scenarioId);
}
