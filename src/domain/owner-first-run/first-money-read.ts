/**
 * Owner first-run — the first-value result contract ("Your first Money read").
 *
 * This is a PRESENTATION mapping over the canonical finance diagnosis (diagnoseFinanceSnapshot +
 * planFinanceActionsFromDiagnosis). It is not a second engine: it picks nothing, scores nothing and
 * invents no numbers — it reshapes the top-ranked finding/action into the eleven answers an owner needs,
 * labels the scope honestly (money only), and carries evidence quality and missing evidence through.
 * Pure.
 */
import { confidenceTierFromScore, type ConfidenceTier } from "@/domain/owner-finance/data-confidence";
import {
  EVIDENCE_QUALITY_EXPLANATION,
  EVIDENCE_QUALITY_LABEL,
  isEstimate,
  type EvidenceQuality,
} from "@/domain/owner-finance/evidence-quality";

export const FIRST_MONEY_READ_HEADING = "Your first Money read";
export const FIRST_MONEY_READ_SCOPE =
  "Based on the financial information you've given OpsIQ, this deserves attention first. It covers your money figures only.";

/**
 * Whole-business claims the first read must never make: it rests on a money snapshot, not on whole-business
 * readiness. Enforced by test against every rendered string.
 */
export const OVERCLAIM_PHRASES = [
  "biggest business problem",
  "biggest problem",
  "your business's problem",
  "main problem in your business",
  "whole business",
  "entire business",
  "root cause",
] as const;

export interface FirstMoneyReadFinding {
  title: string;
  summary: string;
  sourceMetric: string;
  sourceValue?: number | null;
  evidence: readonly string[];
  missingData: readonly string[];
}

export interface FirstMoneyReadAction {
  title: string;
  description: string;
  ownerRole: string;
  expectedTimeframeDays: number;
  verificationMetric: string;
}

export interface FirstMoneyReadInput {
  finding: FirstMoneyReadFinding | null;
  action: FirstMoneyReadAction | null;
  confidenceScore: number;
  evidenceQuality: EvidenceQuality | null;
  /** Critical/important inputs still missing from the snapshot (owner-facing labels). */
  missingEvidence: readonly string[];
}

export type FirstMoneyReadStatus = "READY" | "NO_ATTENTION_FOUND";

export interface FirstMoneyRead {
  status: FirstMoneyReadStatus;
  heading: string;
  scope: string;
  /** 1. What did OpsIQ notice? */
  noticed: string;
  /** 2–3. Supporting metric and its actual value (null when not computable — never invented). */
  evidenceMetric: string | null;
  actualValue: number | null;
  supportingEvidence: string[];
  /** 4. Why it matters. */
  whyItMatters: string;
  /** 5–7. What to do, who owns it, when. */
  recommendedAction: string | null;
  actionDetail: string | null;
  owner: string | null;
  timing: string | null;
  /** 8. What to watch. */
  watchMetric: string | null;
  /** 9. Confidence. */
  confidenceTier: ConfidenceTier;
  confidenceLabel: string;
  /** 10. Missing evidence. */
  missingEvidence: string[];
  /** 11. Estimated evidence. */
  evidenceQuality: EvidenceQuality | null;
  evidenceQualityLabel: string | null;
  evidenceQualityNote: string | null;
  isEstimated: boolean;
}

const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  HIGH: "Fairly confident",
  MEDIUM: "Reasonably confident",
  LOW: "Directional only — treat as a first guide",
  BLOCKED: "Not enough information to rely on this yet",
};

function timingLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Within 1 day";
  return `Within ${days} days`;
}

export function buildFirstMoneyRead(input: FirstMoneyReadInput): FirstMoneyRead {
  const tier = confidenceTierFromScore(input.confidenceScore);
  const quality = input.evidenceQuality;
  const common = {
    heading: FIRST_MONEY_READ_HEADING,
    scope: FIRST_MONEY_READ_SCOPE,
    confidenceTier: tier,
    confidenceLabel: CONFIDENCE_LABEL[tier],
    missingEvidence: [...input.missingEvidence],
    evidenceQuality: quality,
    evidenceQualityLabel: quality ? EVIDENCE_QUALITY_LABEL[quality] : null,
    evidenceQualityNote: quality ? EVIDENCE_QUALITY_EXPLANATION[quality] : null,
    isEstimated: isEstimate(quality),
  };

  if (!input.finding) {
    return {
      ...common,
      status: "NO_ATTENTION_FOUND",
      noticed: "Nothing in the money figures you gave stands out as needing attention right now.",
      evidenceMetric: null,
      actualValue: null,
      supportingEvidence: [],
      whyItMatters:
        "That only reflects the figures provided. Adding more detail can surface issues these figures can't show.",
      recommendedAction: null,
      actionDetail: null,
      owner: null,
      timing: null,
      watchMetric: null,
    };
  }

  const { finding, action } = input;
  return {
    ...common,
    status: "READY",
    noticed: finding.title,
    evidenceMetric: finding.sourceMetric,
    actualValue: finding.sourceValue ?? null,
    supportingEvidence: [...finding.evidence],
    whyItMatters: finding.summary,
    recommendedAction: action?.title ?? null,
    actionDetail: action?.description ?? null,
    owner: action?.ownerRole ?? null,
    timing: action ? timingLabel(action.expectedTimeframeDays) : null,
    watchMetric: action?.verificationMetric ?? null,
  };
}

/** Every owner-visible string in a read, for the overclaim guard. */
export function firstMoneyReadStrings(read: FirstMoneyRead): string[] {
  return [
    read.heading,
    read.scope,
    read.noticed,
    read.whyItMatters,
    read.recommendedAction,
    read.actionDetail,
    read.confidenceLabel,
    read.evidenceQualityNote,
  ].filter((s): s is string => typeof s === "string");
}

export function findOverclaims(strings: readonly string[]): string[] {
  const hits: string[] = [];
  for (const s of strings) {
    const lower = s.toLowerCase();
    for (const p of OVERCLAIM_PHRASES) if (lower.includes(p)) hits.push(p);
  }
  return hits;
}
