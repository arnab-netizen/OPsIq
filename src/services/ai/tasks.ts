/**
 * Owner Mode Governed AI Copilot — task runners (AI-9 / AI-10 / AI-13).
 *
 * Thin wrappers over the generic governed orchestrator. Each declares only its
 * schema + which model-authored fields to scan. All governance (schema validate,
 * guardrails, audit ledger, advisory-only) lives in runGovernedAiTask. None of
 * these can mutate state, finalize a diagnosis, approve an action, or verify an
 * outcome — the deterministic services do that.
 */
import {
  diagnosisReviewOutputSchema,
  ownerActionRedTeamOutputSchema,
  outcomeReviewOutputSchema,
  type DiagnosisReviewOutput,
  type OwnerActionRedTeamOutput,
  type OutcomeReviewOutput,
} from "./schemas";
import { runGovernedAiTask, type AiCopilotResult, type RunTaskOptions } from "./copilot";
import type { AiContext, AiProvider } from "./provider";

/** AI-9: second-opinion review of a deterministic diagnosis. Advisory; cannot finalize. */
export function runDiagnosisReview(
  provider: AiProvider,
  context: AiContext,
  opts: RunTaskOptions = {}
): Promise<AiCopilotResult<DiagnosisReviewOutput>> {
  return runGovernedAiTask(
    provider,
    context,
    diagnosisReviewOutputSchema,
    (o) => ({
      scannableText: [
        o.summary,
        o.rootCauseChallenge,
        o.recommendedNextStep,
        ...o.counterEvidence,
        ...o.alternativeHypotheses,
      ].join("\n"),
      citedEvidenceIds: o.citedEvidenceIds,
    }),
    { promptVersion: "dx-review-v1", schemaVersion: "diagnosisReviewOutput-v1", modelTier: "strong", ...opts }
  );
}

/** AI-10: red-team an owner-proposed action. Classification is ADVISORY, not an approval. */
export function runOwnerActionRedTeam(
  provider: AiProvider,
  context: AiContext,
  opts: RunTaskOptions = {}
): Promise<AiCopilotResult<OwnerActionRedTeamOutput>> {
  return runGovernedAiTask(
    provider,
    context,
    ownerActionRedTeamOutputSchema,
    (o) => ({
      scannableText: [o.downside, ...o.weaknesses, ...o.saferAlternatives].join("\n"),
      citedEvidenceIds: o.citedEvidenceIds,
    }),
    { promptVersion: "action-redteam-v1", schemaVersion: "ownerActionRedTeamOutput-v1", modelTier: "strong", ...opts }
  );
}

/** AI-13: review outcome context + confounders. AI may NOT verify an outcome alone. */
export function runOutcomeReview(
  provider: AiProvider,
  context: AiContext,
  opts: RunTaskOptions = {}
): Promise<AiCopilotResult<OutcomeReviewOutput>> {
  return runGovernedAiTask(
    provider,
    context,
    outcomeReviewOutputSchema,
    (o) => ({
      scannableText: [
        o.attributionWarning ?? "",
        ...o.observations,
        ...o.confoundersDetected,
        ...o.missingProof,
      ].join("\n"),
      citedEvidenceIds: o.citedEvidenceIds,
    }),
    { promptVersion: "outcome-review-v1", schemaVersion: "outcomeReviewOutput-v1", modelTier: "strong", ...opts }
  );
}
