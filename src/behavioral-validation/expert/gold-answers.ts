/**
 * Slice 3 — gold-standard expert answers.
 *
 * Each behavioral case carries (here, derived from its authored expert encoding) a typed Gold answer
 * with the 12 expected fields. The seed cases were authored AS expert answers (hiddenRootCause,
 * correctExpertDecision, opsiqShouldBlock, proofRequired, reassessmentTrigger, learningRuleIfFails),
 * so we expose that as a strict Gold contract rather than fabricating new prose. Generated variants
 * inherit the seed's invariants, so they carry at least the minimum gold fields (root cause, blocked
 * action, proof, reassessment).
 *
 * The gold scorer compares OpsIQ's output against gold SEMANTICS — a generic answer that merely
 * mentions business words fails, and a wrong root cause fails even when the action sounds reasonable.
 */
import { z } from "zod";
import type { AdviceOutput, BehavioralCase } from "../schema";

export const GOLD_QUALITY = ["REQUIRED", "STRONG", "PARTIAL", "MISSING"] as const;
export type GoldQuality = (typeof GOLD_QUALITY)[number];

export const goldAnswerSchema = z.object({
  expectedSituationSummary: z.string().min(8),
  expectedRootCause: z.string().min(8),
  expectedUrgentPriority: z.string().min(4),
  expectedWhatNotToDo: z.array(z.string().min(1)).min(1),
  expectedRecommendedAction: z.string().min(8),
  expectedFinancialReasoning: z.string().min(4),
  expectedCashMarginCapacityCheck: z.string().min(4),
  expectedProofRequirement: z.array(z.string().min(1)).min(1),
  expectedReassessmentTrigger: z.string().min(4),
  expectedProfessionalReview: z.string().nullable(),
  expectedOwnerWorkloadReduction: z.string().min(4),
  expectedLearningRule: z.string().min(8),
  qualityLevel: z.enum(GOLD_QUALITY),
});
export type GoldAnswer = z.infer<typeof goldAnswerSchema>;

/** A case is a seed when its id equals its sourceSeedCaseId; variants carry "__" in the id. */
export function isSeedCase(c: BehavioralCase): boolean {
  return c.id === c.sourceSeedCaseId;
}

function urgentPriority(c: BehavioralCase): string {
  if (c.flags.cashRisk) return "Protect cash and margin before any growth or spend commitment.";
  if (c.flags.complianceRisk) return "Close the compliance grey area before proceeding.";
  if (c.flags.capacityRisk) return "Relieve the capacity/quality bottleneck before adding load.";
  if (c.flags.hostile) return "Verify the numbers independently before acting.";
  if (c.flags.missingOrStaleData) return "Reconcile current data before any irreversible action.";
  return "Fix the binding constraint with proof before committing resources.";
}

function financialReasoning(c: BehavioralCase): string {
  const finSay = c.opsiqShouldSay.filter((s) => /cash|margin|cost|price|discount|capital|receivable|payment/i.test(s));
  if (finSay.length) return finSay.join(" ");
  return "Quantify contribution margin and cash impact; revenue alone is not the success measure.";
}

function cashMarginCapacityCheck(c: BehavioralCase): string {
  const parts: string[] = [];
  if (c.flags.cashRisk) parts.push("cash runway and contribution margin must improve, not just revenue");
  if (c.flags.capacityRisk) parts.push("new load must stay within reliable capacity");
  if (parts.length === 0) parts.push("confirm the action improves margin and does not extend the cash-conversion cycle");
  return parts.join("; ");
}

/** Derive the Gold answer for a case from its authored expert encoding. */
export function buildGoldAnswer(c: BehavioralCase): GoldAnswer {
  return {
    expectedSituationSummary: `${c.businessType} — ${c.title}`,
    expectedRootCause: c.hiddenRootCause,
    expectedUrgentPriority: urgentPriority(c),
    expectedWhatNotToDo: c.opsiqShouldBlock,
    expectedRecommendedAction: c.correctExpertDecision,
    expectedFinancialReasoning: financialReasoning(c),
    expectedCashMarginCapacityCheck: cashMarginCapacityCheck(c),
    expectedProofRequirement: c.proofRequired,
    expectedReassessmentTrigger: c.reassessmentTrigger,
    expectedProfessionalReview: c.flags.complianceRisk
      ? "Flag licensing/tax/regulatory grey area for written professional review; no definitive legal/tax advice."
      : null,
    expectedOwnerWorkloadReduction:
      "Delegate routine checks to a named person with a daily exception-only proof report so the owner stops being the bottleneck.",
    expectedLearningRule: c.learningRuleIfFails,
    qualityLevel: isSeedCase(c) ? "REQUIRED" : "PARTIAL",
  };
}

/** The four fields a generated variant must carry to enter expert validation. */
export function hasMinimumGold(g: GoldAnswer): boolean {
  return (
    g.expectedRootCause.trim().length >= 8 &&
    g.expectedWhatNotToDo.length >= 1 &&
    g.expectedProofRequirement.length >= 1 &&
    g.expectedReassessmentTrigger.trim().length >= 4
  );
}

/** A case may enter expert-readiness scoring only with at least minimum gold. */
export function canEnterExpertValidation(c: BehavioralCase): boolean {
  const g = buildGoldAnswer(c);
  if (g.qualityLevel === "MISSING") return false;
  return hasMinimumGold(g);
}

// ─── Gold semantic comparison ───────────────────────────────────────────────────────────────────
const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "your", "their", "are", "not", "but", "you", "should", "must", "before", "after", "than", "then", "when", "which", "while", "more", "less", "any", "may", "can", "owner", "will"]);

function toks(s: string): string[] {
  return Array.from(new Set(s.toLowerCase().replace(/[^a-z0-9%]+/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w))));
}

/** Fraction of gold-field salient tokens present in the candidate text (semantic, not exact). */
export function semanticCoverage(goldText: string, candidate: string): number {
  const want = toks(goldText);
  if (!want.length) return 1;
  const hay = new Set(toks(candidate));
  const hayStr = candidate.toLowerCase();
  let hit = 0;
  for (const w of want) if (hay.has(w) || (w.length >= 6 && hayStr.includes(w.slice(0, 6)))) hit++;
  return hit / want.length;
}

const GENERIC = ["improve operations", "work hard", "do your best", "focus on growth", "stay positive", "be strategic", "leverage synergies", "think big", "it depends", "monitor the situation", "good luck", "everything will be fine"];

export function looksGeneric(a: AdviceOutput): boolean {
  const t = [a.situationSummary, a.rootCause, a.recommendedNextAction, a.whyThisAction].filter(Boolean).join(" ").toLowerCase();
  if (t.trim().length < 40) return true;
  return GENERIC.filter((f) => t.includes(f)).length >= 2 || new Set(toks(t)).size < 10;
}

export interface GoldComparison {
  rootCauseCoverage: number;
  actionCoverage: number;
  whatNotToDoCoverage: number;
  proofCoverage: number;
  reassessmentCoverage: number;
  generic: boolean;
  wrongRootCause: boolean; // diagnosis misses the gold root cause
  matchesGold: boolean; // overall semantic match
}

const ROOT_CAUSE_MIN = 0.3;

export function compareToGold(a: AdviceOutput, gold: GoldAnswer): GoldComparison {
  const rootCauseCoverage = semanticCoverage(gold.expectedRootCause, `${a.rootCause ?? ""} ${a.situationSummary ?? ""} ${a.mostUrgentIssue ?? ""}`);
  const actionCoverage = semanticCoverage(gold.expectedRecommendedAction, `${a.recommendedNextAction ?? ""} ${a.whyThisAction ?? ""}`);
  const whatNotToDoCoverage = avgCoverage(gold.expectedWhatNotToDo, `${(a.whatNotToDo ?? []).join(" ")} ${(a.blockedActions ?? []).join(" ")}`);
  const proofCoverage = avgCoverage(gold.expectedProofRequirement, (a.proofRequired ?? []).join(" "));
  const reassessmentCoverage = semanticCoverage(gold.expectedReassessmentTrigger, a.reassessmentTrigger ?? "");
  const generic = looksGeneric(a);
  const wrongRootCause = rootCauseCoverage < ROOT_CAUSE_MIN || !(a.rootCause && a.rootCause.trim().length >= 8);
  // matchesGold requires the RIGHT diagnosis AND a non-generic, blocking, proof-backed answer.
  const matchesGold =
    !generic &&
    !wrongRootCause &&
    actionCoverage >= 0.2 &&
    whatNotToDoCoverage >= 0.25 &&
    proofCoverage >= 0.25 &&
    reassessmentCoverage >= 0.15;
  return { rootCauseCoverage, actionCoverage, whatNotToDoCoverage, proofCoverage, reassessmentCoverage, generic, wrongRootCause, matchesGold };
}

function avgCoverage(goldList: string[], candidate: string): number {
  if (!goldList.length) return 1;
  const covered = goldList.filter((g) => semanticCoverage(g, candidate) >= 0.34).length;
  return covered / goldList.length;
}
