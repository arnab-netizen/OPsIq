/**
 * Public real-world case schema. A `PublicCase` wraps a fully-valid `BehavioralCase` (so it flows
 * through the EXISTING validated scorer / production runtime / domain matrix / collective scorer with
 * zero weakening) and adds the real-world-training metadata: source lineage, business stage, dominant
 * constraint, gold skeleton, split, domain materiality, and browser/holdout/runtime eligibility.
 */
import { z } from "zod";
import { behavioralCaseSchema } from "../schema";
import { CONSTRAINTS } from "../whole-business/arbitration";

export const REAL_FLAGS = ["real", "synthetic", "variant"] as const;
export const BUSINESS_STAGES = ["startup", "early", "established", "growth", "scaling", "distressed", "turnaround", "winding_down"] as const;
export const SPLITS = ["training", "validation", "holdout", "adversarial", "regression", "production_runtime", "browser_representative"] as const;
export const SEVERITIES = ["best_case", "good_fragile", "normal", "bad_management", "ugly_spiral", "fraud", "extreme"] as const;

export const goldSkeletonSchema = z.object({
  rootCause: z.string().min(8),
  dominantConstraint: z.enum(CONSTRAINTS),
  whatNotToDo: z.array(z.string().min(4)).min(1),
  nextBestAction: z.string().min(8),
  proofRequired: z.array(z.string().min(3)).min(1),
  reassessment: z.string().min(6),
  stopLoss: z.string().min(6).optional(),
});
export type GoldSkeleton = z.infer<typeof goldSkeletonSchema>;

export const publicCaseMetaSchema = z.object({
  caseId: z.string().min(3),
  realFlag: z.enum(REAL_FLAGS),
  sourceRef: z.string().regex(/^SRC-[A-Z0-9-]+$/).optional(),
  lineageParentId: z.string().optional(),
  patternId: z.string().min(2), // sourced-pattern lineage (every case links to a pattern)
  businessCategory: z.string().min(2),
  businessStage: z.enum(BUSINESS_STAGES),
  severity: z.enum(SEVERITIES),
  dominantConstraint: z.enum(CONSTRAINTS),
  domains: z.array(z.string().min(2)).min(1), // domains that MATERIALLY affect the decision
  crossDomainConflicts: z.array(z.string()).default([]),
  businessMathRequired: z.boolean(),
  stopLossCondition: z.string().optional(),
  plan7Day: z.string().min(6),
  plan30Day: z.string().min(6),
  plan90Day: z.string().min(6),
  goldSkeleton: goldSkeletonSchema,
  scoringLabels: z.array(z.string()).default([]),
  collective: z.boolean().default(false), // ≥2 domains materially conflict → whole-business arbitration
  multiTurn: z.array(z.object({ owner: z.string().min(4), opsiq: z.string().min(4) })).optional(),
  learningExpected: z.string().optional(),
  regressionTrigger: z.string().optional(),
  privacyNote: z.string().min(4),
  productionRuntimeEligible: z.boolean(),
  browserRepresentative: z.boolean(),
  holdoutProtected: z.boolean(),
  split: z.enum(SPLITS),
}).refine((m) => m.realFlag !== "real" || m.sourceRef !== undefined, { message: "real cases need a sourceRef" })
  .refine((m) => m.realFlag !== "variant" || m.lineageParentId !== undefined, { message: "variants need a lineageParentId" });

export type PublicCaseMeta = z.infer<typeof publicCaseMetaSchema>;

export const publicCaseSchema = z.object({
  case: behavioralCaseSchema,
  meta: publicCaseMetaSchema,
});
export type PublicCase = z.infer<typeof publicCaseSchema>;

/** Stable signature used by the shallow-duplicate detector. */
export function caseSignature(pc: PublicCase): string {
  const c = pc.case;
  const numsig = Object.entries(c.numbers)
    .map(([k, v]) => `${k}:${typeof v === "number" ? Math.round(v / 1000) : v}`)
    .sort()
    .join(",");
  return [c.businessType, pc.meta.dominantConstraint, pc.meta.severity, numsig, c.correctExpertDecision.slice(0, 24)].join("|");
}

/** The axes a synthetic variant must materially change (≥3) vs its lineage parent. */
export function materialAxes(pc: PublicCase): Record<string, string> {
  const c = pc.case;
  return {
    category: pc.meta.businessCategory,
    location: c.location.cityRegion,
    stage: pc.meta.businessStage,
    cash: String(c.numbers.cash ?? "na"),
    margin: String(c.numbers.grossSalesNow ?? c.numbers.consideredRate ?? "na"),
    capacity: String(c.numbers.reliableKgPerDay ?? c.numbers.offeredKgPerDay ?? "na"),
    dominant: pc.meta.dominantConstraint,
    tempting: c.temptingBadDecision.slice(0, 18),
    correct: c.correctExpertDecision.slice(0, 18),
    ownerGoal: c.ownerGoal.slice(0, 18),
  };
}

/** Count materially-different axes between two cases. */
export function materialChangeCount(a: PublicCase, b: PublicCase): number {
  const ax = materialAxes(a);
  const bx = materialAxes(b);
  return Object.keys(ax).filter((k) => ax[k] !== bx[k]).length;
}
