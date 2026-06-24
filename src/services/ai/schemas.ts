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

/** Registry mapping a task type to its output schema (extended per phase). */
export const AI_OUTPUT_SCHEMAS = {
  MISSING_QUESTION_GENERATION: missingQuestionOutputSchema,
} as const;

export type ImplementedAiTaskType = keyof typeof AI_OUTPUT_SCHEMAS;
