/**
 * Owner Strategy & Scenario Planning (Module 8 Slice 3) — deterministic
 * recommendations.
 *
 * Pure: maps Slice 2 scenario `OwnerFinding`s → traceable
 * `StrategyRecommendation`s. Every recommendation carries its source
 * metric/value/threshold, severity, expected impact, confidence, the required
 * owner action, and how to verify it. A finding with no template produces no
 * recommendation (reported as a missing action input by the planner) — nothing is
 * invented.
 */
import type { OwnerFinding, OwnerSeverity } from "@/domain/owner-spine/contracts";
import { clampScore, clampConfidence } from "@/domain/owner-spine/contracts";

export interface StrategyRecommendation {
  recommendationCode: string;
  findingCode: string;
  category: string;
  sourceMetric: string;
  sourceValue: number | null;
  threshold: number | null;
  severity: OwnerSeverity;
  expectedDecisionImpactScore: number; // 0..100
  urgencyScore: number; // 0..100 (carried from the finding)
  confidence: number; // 0..1
  requiredOwnerAction: string;
  verificationMetric: string;
  verificationMethod: string;
  expectedTimeframeDays: number;
  effortScore: number; // 0..100
  ownerRole: string;
  title: string;
  evidence: string[];
}

interface StrategyRecTemplate {
  recommendationCode: string;
  category: string;
  title: string;
  requiredOwnerAction: string;
  verificationMethod: string;
  expectedTimeframeDays: number;
  effortScore: number;
  ownerRole: string;
}

/**
 * Finding code → recommendation template. Categories cover the strategy decision
 * set: drop/re-scope a value-destroying option, compare a better use of capital,
 * cap the downside, stage the payback, secure funding / keep a reserve, de-risk
 * execution, and supply missing inputs. Opportunity findings have NO template: a strong
 * return, fast payback or profitable downside is a reason the option looks promising, not
 * a command. The only "go ahead" step is the GO decision's primary step (action-arbitration.ts).
 */
export const STRATEGY_REC_TEMPLATES: Record<string, StrategyRecTemplate> = {
  STR_NEGATIVE_BASE_CASE: {
    recommendationCode: "STRREC_DROP_OR_RESCOPE",
    category: "drop_or_rescope",
    title: "Change the plan, re-scope it, or drop it",
    requiredOwnerAction:
      "As planned it doesn't add profit. Change the numbers (lower cost, higher price, smaller scale) until it does, or put the money to another use.",
    verificationMethod: "Evaluate an updated scenario; the monthly profit change should be above 0.",
    expectedTimeframeDays: 7,
    effortScore: 25,
    ownerRole: "owner",
  },
  STR_NEGATIVE_ROI: {
    recommendationCode: "STRREC_DROP_OR_RESCOPE",
    category: "drop_or_rescope",
    title: "Change the plan, re-scope it, or drop it",
    requiredOwnerAction:
      "The investment is never earned back. Cut the upfront cost or raise the profit it adds, or put the money to another use.",
    verificationMethod: "Evaluate an updated scenario; the investment should be earned back.",
    expectedTimeframeDays: 7,
    effortScore: 25,
    ownerRole: "owner",
  },
  STR_WEAK_ROI: {
    recommendationCode: "STRREC_COMPARE_ALTERNATIVES",
    category: "compare_alternatives",
    title: "Compare a better use of the cash",
    requiredOwnerAction:
      "The return is low. Compare 1–2 other uses of the same money (what each adds a month and how fast it earns back) before committing to this one.",
    verificationMethod: "Write down the comparison; go ahead only if this option is the best safe choice.",
    expectedTimeframeDays: 14,
    effortScore: 30,
    ownerRole: "owner",
  },
  STR_NEGATIVE_WORST_CASE: {
    recommendationCode: "STRREC_CAP_DOWNSIDE",
    category: "cap_downside",
    title: "Cap the downside before committing",
    requiredOwnerAction:
      "Make a bad month survivable: stage the spend, set an exit trigger, or shrink the commitment until the downside is not a loss.",
    verificationMethod: "Evaluate the staged or smaller plan; the downside should no longer lose money.",
    expectedTimeframeDays: 14,
    effortScore: 35,
    ownerRole: "owner",
  },
  STR_LONG_PAYBACK: {
    recommendationCode: "STRREC_STAGE_PAYBACK",
    category: "stage_payback",
    title: "Shorten or stage the payback",
    requiredOwnerAction:
      "The investment takes a long time to come back. Phase it, negotiate vendor terms, or start smaller so cash returns sooner.",
    verificationMethod: "Evaluate the staged plan; it should earn back within the target time.",
    expectedTimeframeDays: 14,
    effortScore: 35,
    ownerRole: "owner",
  },
  STR_UNAFFORDABLE: {
    recommendationCode: "STRREC_SECURE_FUNDING",
    category: "secure_funding",
    title: "Close the funding gap",
    requiredOwnerAction:
      "The cash you have doesn't cover the investment. Stage the spend to fit your cash, reduce the scope, or secure funding before committing.",
    verificationMethod: "Evaluate an updated scenario with the new cash or amount; there should be no funding gap.",
    expectedTimeframeDays: 21,
    effortScore: 40,
    ownerRole: "owner",
  },
  STR_HIGH_EXECUTION_RISK: {
    recommendationCode: "STRREC_DE_RISK",
    category: "de_risk",
    title: "Run a small pilot first",
    requiredOwnerAction:
      "Run a small pilot or staged rollout with a clear success measure and an exit trigger before committing fully.",
    verificationMethod: "Set the pilot's success measure up front; commit fully only if the pilot meets it.",
    expectedTimeframeDays: 30,
    effortScore: 40,
    ownerRole: "owner",
  },
  STR_INVALID_CURRENCY: {
    recommendationCode: "STRREC_FIX_CURRENCY",
    category: "improve_data_quality",
    title: "Set a valid currency",
    requiredOwnerAction: "Use a valid 3-letter currency code (for example INR) in an updated scenario.",
    verificationMethod: "The next evaluation shows the money figures in that currency.",
    expectedTimeframeDays: 3,
    effortScore: 10,
    ownerRole: "owner",
  },
  STR_MISSING_CRITICAL_DATA: {
    recommendationCode: "STRREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Enter the missing scenario inputs",
    requiredOwnerAction: "Add an updated scenario with the missing inputs (expected revenue change per month, expected cost change per month, upfront investment), then evaluate it.",
    verificationMethod: "The next evaluation calculates the profit effect and affordability.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
  STR_MISSING_CASH: {
    recommendationCode: "STRREC_PROVIDE_CASH",
    category: "improve_data_quality",
    title: "Enter the cash you can put into this",
    requiredOwnerAction:
      "Enter how much cash you can put into this option so affordability and any funding gap can be calculated.",
    verificationMethod: "The next evaluation calculates affordability and any funding gap.",
    expectedTimeframeDays: 3,
    effortScore: 10,
    ownerRole: "owner",
  },
  STR_MISSING_RISK_LEVEL: {
    recommendationCode: "STRREC_SET_RISK_LEVEL",
    category: "improve_data_quality",
    title: "Choose an execution risk level",
    requiredOwnerAction:
      "Choose low, medium or high execution risk so the downside (lower sales than expected) can be calculated.",
    verificationMethod: "The next evaluation calculates the downside.",
    expectedTimeframeDays: 3,
    effortScore: 10,
    ownerRole: "owner",
  },
  STR_LOW_CASH_RESERVE: {
    recommendationCode: "STRREC_KEEP_RESERVE",
    category: "secure_funding",
    title: "Keep a cash reserve",
    requiredOwnerAction:
      "This leaves little or no cash in reserve. Stage the spend or line up a buffer so one bad month doesn't leave you short.",
    verificationMethod: "Evaluate the staged plan or new cash position; more cash should be left in reserve.",
    expectedTimeframeDays: 14,
    effortScore: 30,
    ownerRole: "owner",
  },
};

/** Build a traceable recommendation from a finding, or null if no template. */
export function buildStrategyRecommendation(finding: OwnerFinding): StrategyRecommendation | null {
  const tpl = STRATEGY_REC_TEMPLATES[finding.code];
  if (!tpl) return null;
  return {
    recommendationCode: tpl.recommendationCode,
    findingCode: finding.code,
    category: tpl.category,
    sourceMetric: finding.sourceMetric,
    sourceValue: finding.sourceValue ?? null, // never invented
    threshold: finding.threshold ?? null,
    severity: finding.severity,
    expectedDecisionImpactScore: clampScore(finding.impactScore),
    urgencyScore: clampScore(finding.urgencyScore),
    confidence: clampConfidence(finding.confidence),
    requiredOwnerAction: tpl.requiredOwnerAction,
    verificationMetric: finding.verificationMetric ?? finding.sourceMetric,
    verificationMethod: tpl.verificationMethod,
    expectedTimeframeDays: tpl.expectedTimeframeDays,
    effortScore: clampScore(tpl.effortScore),
    ownerRole: tpl.ownerRole,
    title: tpl.title,
    evidence: finding.evidence,
  };
}

/** Build recommendations for every finding that has a template (in input order). */
export function buildStrategyRecommendations(findings: OwnerFinding[]): StrategyRecommendation[] {
  const recs: StrategyRecommendation[] = [];
  for (const f of findings) {
    const r = buildStrategyRecommendation(f);
    if (r) recs.push(r);
  }
  return recs;
}
