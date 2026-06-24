/**
 * Owner Mode Governed AI Copilot — Structured Output Schemas (Phase AI-1/AI-4).
 *
 * Every decision-relevant AI output is schema-validated; invalid output is rejected
 * (never coerced). AI-1 implements only MISSING_QUESTION_GENERATION (LOW_CONTENT);
 * the remaining task schemas land in their own phases.
 */
import { z } from "zod";

/** A single high-value missing-data question (Decision-OS §J / Phase AI-8). */
export const missingQuestionItemSchema = z.object({
  question: z.string().min(8),
  whyItMatters: z.string().min(8),
  confidenceCapAffected: z.boolean(),
  decisionUnlocked: z.string().min(3),
  roughEstimateAcceptable: z.boolean(),
  exampleAnswer: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
});
export type MissingQuestionItem = z.infer<typeof missingQuestionItemSchema>;

/**
 * MISSING_QUESTION_GENERATION output. The model proposes the smallest set of the
 * highest-value questions. It is advisory text only: it can mutate nothing and
 * must not assert business facts or confidence.
 */
export const missingQuestionOutputSchema = z.object({
  taskType: z.literal("MISSING_QUESTION_GENERATION"),
  /** 1..5 questions — prefer the top 3; never overload the owner. */
  questions: z.array(missingQuestionItemSchema).min(1).max(5),
  /** Optional evidence ids the model referenced — validated against the allowed set. */
  citedEvidenceIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type MissingQuestionOutput = z.infer<typeof missingQuestionOutputSchema>;

/** DIAGNOSIS_REVIEW (AI-9): advisory second-opinion. No field can finalize a diagnosis. */
export const diagnosisReviewOutputSchema = z.object({
  taskType: z.literal("DIAGNOSIS_REVIEW"),
  summary: z.string().min(8),
  evidenceUsed: z.array(z.string()).default([]),
  evidenceMissing: z.array(z.string()).default([]),
  counterEvidence: z.array(z.string()).default([]),
  rootCauseChallenge: z.string().min(3),
  alternativeHypotheses: z.array(z.string()).default([]),
  unsafeToConclude: z.boolean(),
  recommendedNextStep: z.string().min(3),
  /** Advisory only — the deterministic service + owner decide. Always true by schema. */
  requiresOwnerApproval: z.literal(true),
  citedEvidenceIds: z.array(z.string()).default([]),
});
export type DiagnosisReviewOutput = z.infer<typeof diagnosisReviewOutputSchema>;

/** OWNER_PROPOSED_ACTION_REDTEAM (AI-10): advisory classification; never an approval. */
export const ownerActionRedTeamOutputSchema = z.object({
  taskType: z.literal("OWNER_PROPOSED_ACTION_REDTEAM"),
  classification: z.enum([
    "APPROVE_SAFE_LOW_RISK",
    "APPROVE_WITH_WARNINGS",
    "CONVERT_TO_EXPERIMENT",
    "NEEDS_MORE_DATA",
    "DEFER",
    "REJECT_TOO_RISKY",
  ]),
  weaknesses: z.array(z.string()).default([]),
  downside: z.string().min(3),
  saferAlternatives: z.array(z.string()).default([]),
  /** The classification is advisory; deterministic services enforce final state. */
  advisoryOnly: z.literal(true),
  citedEvidenceIds: z.array(z.string()).default([]),
});
export type OwnerActionRedTeamOutput = z.infer<typeof ownerActionRedTeamOutputSchema>;

/** OUTCOME_REVIEW (AI-13): AI may flag confounders but MUST NOT decide verification. */
export const outcomeReviewOutputSchema = z.object({
  taskType: z.literal("OUTCOME_REVIEW"),
  observations: z.array(z.string()).default([]),
  confoundersDetected: z.array(z.string()).default([]),
  missingProof: z.array(z.string()).default([]),
  attributionWarning: z.string().optional(),
  /** Advisory ONLY — never a verification decision (deterministic service decides). */
  verificationRecommendation: z.enum(["needs_owner_review", "needs_more_proof", "no_recommendation"]),
  cannotVerifyAlone: z.literal(true),
  citedEvidenceIds: z.array(z.string()).default([]),
});
export type OutcomeReviewOutput = z.infer<typeof outcomeReviewOutputSchema>;

/** Registry mapping a task type to its output schema (extended per phase). */
export const AI_OUTPUT_SCHEMAS = {
  MISSING_QUESTION_GENERATION: missingQuestionOutputSchema,
  DIAGNOSIS_REVIEW: diagnosisReviewOutputSchema,
  OWNER_PROPOSED_ACTION_REDTEAM: ownerActionRedTeamOutputSchema,
  OUTCOME_REVIEW: outcomeReviewOutputSchema,
} as const;

export type ImplementedAiTaskType = keyof typeof AI_OUTPUT_SCHEMAS;
