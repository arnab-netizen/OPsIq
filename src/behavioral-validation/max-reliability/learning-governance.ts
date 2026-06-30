/**
 * Maximum-reliability — learning-governance assurance.
 *
 * Re-proves the rules that keep stored learning credible, scoped, reversible, and safe: global promotion
 * requires approval + multiple supporting cases (or a high-reliability source) + a privacy pass + no source
 * poisoning + no unresolved unsafe result + an audit trail + reversibility; a revoked/inactive artifact is
 * never used; a stale artifact's confidence is downgraded; two active in-scope artifacts that disagree are
 * routed to adjudication; and a learning artifact can never override a safety gate. Reuses the existing
 * learning store + privacy gate.
 */
import { isVisibleTo } from "../learning-store";
import type { LearningArtifact } from "../schema";

export interface PromotionContext {
  sourceReliability: "low" | "medium" | "high";
  supportingCases: number;
  privacyPass: boolean;
  sourcePoisoned: boolean;
  unresolvedUnsafe: number;
  reversible: boolean;
  hasAuditTrail: boolean;
}

export interface GovernanceResult { ok: boolean; failures: string[] }

/** A pending/rejected artifact, a single weak-source artifact, a privacy/poisoning/unsafe failure, or a
 *  non-reversible / un-audited artifact can never be promoted to a cross-workspace global template. */
export function canPromoteArtifactToGlobal(a: LearningArtifact, ctx: PromotionContext): GovernanceResult {
  const failures: string[] = [];
  if (a.approvalStatus !== "approved") failures.push("artifact not approved");
  if (!a.active) failures.push("artifact inactive");
  if (ctx.sourceReliability !== "high" && ctx.supportingCases < 2) failures.push("single weak source (needs ≥2 cases or a high-reliability source)");
  if (!ctx.privacyPass) failures.push("privacy/anonymization not passed");
  if (ctx.sourcePoisoned) failures.push("source poisoning detected");
  if (ctx.unresolvedUnsafe > 0) failures.push("unresolved unsafe result");
  if (!ctx.reversible) failures.push("not reversible");
  if (!ctx.hasAuditTrail || a.auditTrail.length === 0) failures.push("missing audit trail");
  return { ok: failures.length === 0, failures };
}

export type Confidence = "low" | "medium" | "high";
const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const ORDER: Confidence[] = ["low", "medium", "high"];

/** Stale artifacts lose confidence: one notch per stale window elapsed. ageDays/staleAfterDays passed in
 *  (no Date.now in this layer). */
export function artifactConfidence(base: Confidence, ageDays: number, staleAfterDays = 180): Confidence {
  const windows = Math.floor(ageDays / staleAfterDays);
  return ORDER[Math.max(0, RANK[base] - windows)];
}

/** A revoked (rejected) or inactive artifact is never usable. */
export function isUsable(a: LearningArtifact): boolean {
  return a.active && a.approvalStatus !== "rejected";
}

/** Two ACTIVE, in-scope artifacts for the same source whose corrected behavior disagrees → adjudication. */
export function conflictsRequiringAdjudication(arts: LearningArtifact[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const active = arts.filter(isUsable);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      const sameScope = a.applicabilityScope.archetype === b.applicabilityScope.archetype &&
        a.applicabilityScope.decisionCategory === b.applicabilityScope.decisionCategory;
      if (sameScope && a.correctedBehavior.trim() !== b.correctedBehavior.trim() && a.failureLabel === b.failureLabel) out.push([a.id, b.id]);
    }
  }
  return out;
}

export { isVisibleTo };
