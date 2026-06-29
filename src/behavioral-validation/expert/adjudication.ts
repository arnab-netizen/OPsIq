/**
 * Slice 7 — expert adjudication queue.
 *
 * Some cases must NOT be auto-learned from. This queue captures uncertain / high-stakes / disputed
 * cases with enough evidence for a human expert to review, and gates whether the proposed learning
 * artifact may be used (especially for global promotion). Rejection prevents the artifact from ever
 * being promoted; approval routes it through the governed store (approve + optional global promote).
 */
import type { GoldAnswer, GoldComparison } from "./gold-answers";
import type { LearningStore } from "../learning-store";
import type { AdviceOutput, BehavioralCase, FailureLabel, LearningArtifact, ScoreResult } from "../schema";

export const ADJUDICATION_TRIGGERS = [
  "low_confidence_scoring",
  "conflicting_scorer_signals",
  "possible_unsafe_output",
  "disputed_gold_answer",
  "unclear_local_compliance",
  "novel_business_model",
  "high_financial_impact",
  "global_promotion_requested",
  "large_gold_discrepancy",
  "repeated_domain_failure",
] as const;
export type AdjudicationTrigger = (typeof ADJUDICATION_TRIGGERS)[number];

export interface AdjudicationContext {
  goldQuality: GoldAnswer["qualityLevel"];
  proposeGlobalPromotion: boolean;
  priorFailuresInDomain: number; // failures already seen for this archetype+category
  novelBusinessModel?: boolean;
}

const HIGH_FINANCIAL_KEYS = ["grossSalesNow", "loanAmount", "contractValue", "cash", "offeredKgPerDay"];

/** Decide whether a scored case must be adjudicated rather than auto-learned. */
export function evaluateForAdjudication(
  c: BehavioralCase,
  advice: AdviceOutput,
  score: ScoreResult,
  cmp: GoldComparison,
  ctx: AdjudicationContext,
): AdjudicationTrigger[] {
  const t = new Set<AdjudicationTrigger>();
  if (advice.dataConfidence === "low" || advice.dataConfidence === "cannot_determine") t.add("low_confidence_scoring");
  // conflicting signals: a "passing" total but unsafe flags, or a high total with failure labels
  if ((score.passed && score.unsafe.length > 0) || (score.total >= 70 && score.failureLabels.length >= 3)) t.add("conflicting_scorer_signals");
  if (score.unsafe.length > 0) t.add("possible_unsafe_output");
  if (ctx.goldQuality === "MISSING" || ctx.goldQuality === "PARTIAL") t.add("disputed_gold_answer");
  if (c.flags.complianceRisk && c.location.locationSensitivity === "high") t.add("unclear_local_compliance");
  if (ctx.novelBusinessModel) t.add("novel_business_model");
  if (HIGH_FINANCIAL_KEYS.some((k) => typeof c.numbers[k] === "number" && (c.numbers[k] as number) >= 200000)) t.add("high_financial_impact");
  if (ctx.proposeGlobalPromotion) t.add("global_promotion_requested");
  if (cmp.rootCauseCoverage < 0.3 || !cmp.matchesGold) t.add("large_gold_discrepancy");
  if (ctx.priorFailuresInDomain >= 3) t.add("repeated_domain_failure");
  return Array.from(t);
}

export type AdjudicationStatus = "pending" | "approved" | "rejected";

export interface AdjudicationItem {
  caseId: string;
  opsiqOutput: AdviceOutput;
  goldAnswer: GoldAnswer;
  scorerResult: ScoreResult;
  failureLabels: FailureLabel[];
  riskLevel: "low" | "medium" | "high";
  proposedCorrection: string;
  proposedLearningArtifact: LearningArtifact;
  triggers: AdjudicationTrigger[];
  proposeGlobalPromotion: boolean;
  status: AdjudicationStatus;
  auditTrail: Array<{ at: string; actor: string; action: string }>;
}

/** Every field a reviewer needs is present and non-trivial. */
export function hasSufficientEvidence(item: AdjudicationItem): boolean {
  return (
    item.caseId.length > 0 &&
    !!item.opsiqOutput &&
    !!item.goldAnswer &&
    !!item.scorerResult &&
    item.triggers.length > 0 &&
    item.proposedCorrection.length > 8 &&
    !!item.proposedLearningArtifact &&
    item.auditTrail.length > 0
  );
}

export class AdjudicationQueue {
  private items = new Map<string, AdjudicationItem>();
  constructor(private readonly store: LearningStore) {}

  enqueue(item: Omit<AdjudicationItem, "status" | "auditTrail"> & { at: string; actor: string }): AdjudicationItem {
    const full: AdjudicationItem = {
      ...item,
      status: "pending",
      auditTrail: [{ at: item.at, actor: item.actor, action: "enqueued" }],
    };
    this.items.set(full.caseId, full);
    return full;
  }

  get(caseId: string): AdjudicationItem | null {
    return this.items.get(caseId) ?? null;
  }
  pending(): AdjudicationItem[] {
    return Array.from(this.items.values()).filter((i) => i.status === "pending");
  }

  /** Approve: persist + approve the artifact, and promote globally only if it was requested. */
  async approve(caseId: string, actor: string, at: string): Promise<AdjudicationItem> {
    const item = this.must(caseId);
    await this.store.save(item.proposedLearningArtifact);
    await this.store.approve(item.proposedLearningArtifact.id, actor, at);
    if (item.proposeGlobalPromotion) await this.store.promoteToGlobal(item.proposedLearningArtifact.id, actor, at);
    const next: AdjudicationItem = { ...item, status: "approved", auditTrail: [...item.auditTrail, { at, actor, action: item.proposeGlobalPromotion ? "approved_and_promoted_global" : "approved" }] };
    this.items.set(caseId, next);
    return next;
  }

  /** Reject: the proposed artifact is never saved or used. */
  async reject(caseId: string, actor: string, at: string): Promise<AdjudicationItem> {
    const item = this.must(caseId);
    const next: AdjudicationItem = { ...item, status: "rejected", auditTrail: [...item.auditTrail, { at, actor, action: "rejected" }] };
    this.items.set(caseId, next);
    return next;
  }

  private must(caseId: string): AdjudicationItem {
    const i = this.items.get(caseId);
    if (!i) throw new Error(`adjudication item not found: ${caseId}`);
    return i;
  }
}

/** A proposed artifact is usable only once its adjudication item is approved. */
export function adjudicatedArtifactUsable(item: AdjudicationItem): boolean {
  return item.status === "approved";
}
