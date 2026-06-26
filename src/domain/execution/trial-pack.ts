/**
 * Real owner-data trial preparation pack (Slice 24, pure logic).
 *
 * Accepts incomplete owner data, scores completeness, and produces only SAFE
 * provisional output: confidence is capped by completeness, missing data is
 * listed, and owner approval is ALWAYS required before any execution. Nothing
 * here executes; it prepares a supervised trial.
 */

import { ContextConfidence } from "@/domain/execution/business-context";

export interface TrialPackInput {
  businessProfile?: unknown;
  employees?: unknown[];
  customersOrders?: unknown[];
  pricingBoundary?: unknown;
  capacity?: unknown;
  proofExamples?: unknown[];
  sopInput?: unknown;
  complaintHistory?: unknown[];
  paymentCash?: unknown;
  ownerGoals?: unknown;
  marginTarget?: number | null;
}

const SECTIONS: (keyof TrialPackInput)[] = [
  "businessProfile",
  "employees",
  "customersOrders",
  "pricingBoundary",
  "capacity",
  "proofExamples",
  "sopInput",
  "complaintHistory",
  "paymentCash",
  "ownerGoals",
  "marginTarget",
];

function isPresent(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.length > 0;
  return true;
}

export interface DataCompleteness {
  score: number;
  missingData: string[];
  confidence: ContextConfidence;
}

export function assessDataCompleteness(input: TrialPackInput): DataCompleteness {
  const missing: string[] = [];
  let present = 0;
  for (const s of SECTIONS) {
    if (isPresent(input[s])) present += 1;
    else missing.push(String(s));
  }
  const score = present / SECTIONS.length;
  const confidence =
    score >= 0.8 ? ContextConfidence.HIGH : score >= 0.5 ? ContextConfidence.MEDIUM : ContextConfidence.LOW;
  return { score, missingData: missing, confidence };
}

export interface ProvisionalTrialOutput {
  completenessScore: number;
  missingData: string[];
  confidence: ContextConfidence;
  provisionalRecommendations: string[];
  /** Always true — owner approval is required before any execution. */
  requiresOwnerApproval: true;
  /** True unless data is fully complete: output is provisional/safe only. */
  safeProvisionalOnly: boolean;
}

export function buildProvisionalTrialOutput(input: TrialPackInput): ProvisionalTrialOutput {
  const c = assessDataCompleteness(input);
  const recommendations: string[] = [];
  if (c.missingData.length > 0) {
    recommendations.push(
      `Collect missing data before live execution: ${c.missingData.join(", ")}.`
    );
  }
  recommendations.push(
    "Owner must review and approve every personalized workflow before any employee sees a task."
  );
  return {
    completenessScore: c.score,
    missingData: c.missingData,
    confidence: c.confidence,
    provisionalRecommendations: recommendations,
    requiresOwnerApproval: true,
    safeProvisionalOnly: c.confidence !== ContextConfidence.HIGH || c.score < 1,
  };
}
