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
  intakeExtractOutputSchema,
  diagnosisReviewOutputSchema,
  ownerActionRedTeamOutputSchema,
  operatorChecklistOutputSchema,
  outcomeReviewOutputSchema,
  type IntakeExtractOutput,
  type DiagnosisReviewOutput,
  type OwnerActionRedTeamOutput,
  type OperatorChecklistOutput,
  type OutcomeReviewOutput,
} from "./schemas";
import { runGovernedAiTask, type AiCopilotResult, type RunTaskOptions } from "./copilot";
import type { AiContext, AiProvider } from "./provider";

// JSON shape hints sent to the live model so structured output is schema-valid.
// Shape only — they carry no business data and cannot cross a governance boundary.
const INTAKE_EXTRACT_CONTRACT =
  `{ "taskType": "INTAKE_EXTRACT", "candidateFacts": [ { "field": string, "rawValue": string, ` +
  `"unit": string?, "uncertainty": "stated"|"approximate"|"inferred"|"ambiguous" } ], ` +
  `"unresolvedAmbiguities": string[], "allCandidatesUnverified": true, "citedEvidenceIds": string[] }. ` +
  `Extract only what the note states. Every fact is UNVERIFIED — never assert a value as true or compute a metric.`;

const DIAGNOSIS_REVIEW_CONTRACT =
  `{ "taskType": "DIAGNOSIS_REVIEW", "summary": string, "evidenceUsed": string[], "evidenceMissing": string[], ` +
  `"counterEvidence": string[], "rootCauseChallenge": string, "alternativeHypotheses": string[], ` +
  `"unsafeToConclude": boolean, "recommendedNextStep": string, "requiresOwnerApproval": true, "citedEvidenceIds": string[] }. ` +
  `Advisory second opinion only — you cannot finalize the diagnosis; requiresOwnerApproval must be true.`;

const ACTION_REDTEAM_CONTRACT =
  `{ "taskType": "OWNER_PROPOSED_ACTION_REDTEAM", "classification": ` +
  `"APPROVE_SAFE_LOW_RISK"|"APPROVE_WITH_WARNINGS"|"CONVERT_TO_EXPERIMENT"|"NEEDS_MORE_DATA"|"DEFER"|"REJECT_TOO_RISKY", ` +
  `"weaknesses": string[], "downside": string, "saferAlternatives": string[], "advisoryOnly": true, "citedEvidenceIds": string[] }. ` +
  `The classification is ADVISORY only — it never approves the action; advisoryOnly must be true.`;

const OPERATOR_CHECKLIST_CONTRACT =
  `{ "taskType": "OPERATOR_CHECKLIST", "actionTitle": string, "steps": [ { "step": string, "done": false } ], ` +
  `"cautions": string[], "executionOnly": true, "citedEvidenceIds": string[] }. ` +
  `Execution mechanics ONLY for the already-approved action — no strategy, no diagnosis; executionOnly must be true.`;

const OUTCOME_REVIEW_CONTRACT =
  `{ "taskType": "OUTCOME_REVIEW", "observations": string[], "confoundersDetected": string[], "missingProof": string[], ` +
  `"attributionWarning": string?, "verificationRecommendation": "needs_owner_review"|"needs_more_proof"|"no_recommendation", ` +
  `"cannotVerifyAlone": true, "citedEvidenceIds": string[] }. ` +
  `You may flag confounders but CANNOT verify the outcome; cannotVerifyAlone must be true.`;

/** AI-7: extract CANDIDATE (unverified) facts from a messy owner note. Owner must confirm. */
export function runIntakeExtract(
  provider: AiProvider,
  context: AiContext,
  opts: RunTaskOptions = {}
): Promise<AiCopilotResult<IntakeExtractOutput>> {
  return runGovernedAiTask(
    provider,
    context,
    intakeExtractOutputSchema,
    (o) => ({
      scannableText: [
        ...o.candidateFacts.map((f) => `${f.field}: ${f.rawValue}`),
        ...o.unresolvedAmbiguities,
      ].join("\n"),
      citedEvidenceIds: o.citedEvidenceIds,
    }),
    {
      promptVersion: "intake-extract-v1",
      schemaVersion: "intakeExtractOutput-v1",
      modelTier: "cheap",
      outputContract: INTAKE_EXTRACT_CONTRACT,
      ...opts,
    }
  );
}

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
    { promptVersion: "dx-review-v1", schemaVersion: "diagnosisReviewOutput-v1", modelTier: "strong", outputContract: DIAGNOSIS_REVIEW_CONTRACT, ...opts }
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
    { promptVersion: "action-redteam-v1", schemaVersion: "ownerActionRedTeamOutput-v1", modelTier: "strong", outputContract: ACTION_REDTEAM_CONTRACT, ...opts }
  );
}

/** AI-12: operator checklist for an OWNER-APPROVED action only. Execution mechanics, no strategy. */
export function runOperatorChecklist(
  provider: AiProvider,
  context: AiContext,
  opts: RunTaskOptions = {}
): Promise<AiCopilotResult<OperatorChecklistOutput>> {
  return runGovernedAiTask(
    provider,
    context,
    operatorChecklistOutputSchema,
    (o) => ({
      scannableText: [o.actionTitle, ...o.steps.map((s) => s.step), ...o.cautions].join("\n"),
      citedEvidenceIds: o.citedEvidenceIds,
    }),
    { promptVersion: "operator-checklist-v1", schemaVersion: "operatorChecklistOutput-v1", modelTier: "cheap", outputContract: OPERATOR_CHECKLIST_CONTRACT, ...opts }
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
    { promptVersion: "outcome-review-v1", schemaVersion: "outcomeReviewOutput-v1", modelTier: "strong", outputContract: OUTCOME_REVIEW_CONTRACT, ...opts }
  );
}
