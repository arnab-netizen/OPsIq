/**
 * Maximum-reliability — source-quality + source-validity assurance.
 *
 * Scores every register source for reliability/completeness/PII/poisoning/promotion-eligibility and enforces
 * the credibility rules: a low-reliability source cannot create global learning on its own, inferred facts
 * and synthetic extensions must be distinctly marked (never double-claimed as directly-supported), a source
 * reference must be a real register ID in the canonical format (hallucinated IDs fail), and PII / long copied
 * text fail. Reuses the existing source register + privacy gates — nothing is weakened.
 */
import { SOURCE_REGISTER, findPII, hasLongCopiedText, type SourceRecord } from "../public-cases/source-register";

const ID_RE = /^SRC-[A-Z0-9-]+$/;

export interface SourceQuality {
  id: string;
  type: string;
  reliability: "low" | "medium" | "high";
  completeness: "low" | "medium" | "high";
  geography: string;
  businessCategory: string;
  factsSupported: number;
  factsInferred: number;
  factsSynthetic: number;
  piiRisk: boolean;
  longTextRisk: boolean;
  markingErrors: string[];
  /** A single source may seed global learning only if it is high-reliability AND clean (no PII/long text). */
  globalPromotionEligible: boolean;
  /** Learning confidence is capped by source reliability. */
  learningConfidenceCap: "low" | "medium" | "high";
}

/** Inferred / synthetically-varied facts must be distinct from directly-supported facts (no double-claim). */
export function markingErrors(rec: SourceRecord): string[] {
  const errs: string[] = [];
  const used = new Set(rec.factsUsed);
  for (const f of rec.factsInferred) if (used.has(f)) errs.push(`fact double-claimed as inferred + directly-supported: "${f.slice(0, 40)}"`);
  for (const f of rec.factsSyntheticallyVaried) if (used.has(f)) errs.push(`fact double-claimed as synthetic + directly-supported: "${f.slice(0, 40)}"`);
  return errs;
}

export function scoreSource(rec: SourceRecord): SourceQuality {
  const blob = [rec.title, rec.citation ?? "", ...rec.factsUsed, ...rec.factsInferred, ...rec.factsSyntheticallyVaried].join("  ");
  const piiRisk = findPII(blob).length > 0;
  const longTextRisk = [...rec.factsUsed, ...rec.factsInferred, ...rec.factsSyntheticallyVaried, rec.title].some(hasLongCopiedText);
  const mErrs = markingErrors(rec);
  return {
    id: rec.id, type: rec.type, reliability: rec.reliability, completeness: rec.completeness,
    geography: rec.geography, businessCategory: rec.businessCategory,
    factsSupported: rec.factsUsed.length, factsInferred: rec.factsInferred.length, factsSynthetic: rec.factsSyntheticallyVaried.length,
    piiRisk, longTextRisk, markingErrors: mErrs,
    globalPromotionEligible: rec.reliability === "high" && !piiRisk && !longTextRisk && mErrs.length === 0,
    learningConfidenceCap: rec.reliability,
  };
}

/** True iff `id` is a real register source in the canonical format. Hallucinated / malformed ids → false. */
export function validateSourceRef(id: string, register: SourceRecord[] = SOURCE_REGISTER): boolean {
  if (!ID_RE.test(id)) return false;
  return register.some((r) => r.id === id);
}

/** A single source can seed global learning only when it is high-reliability and clean. */
export function canGloballyPromote(rec: SourceRecord): boolean {
  return scoreSource(rec).globalPromotionEligible;
}

export interface ReliabilitySummary { total: number; byReliability: Record<string, number>; globalEligible: number; piiOrLongText: number }

export function sourceRegisterReliabilitySummary(register: SourceRecord[] = SOURCE_REGISTER): ReliabilitySummary {
  const byReliability: Record<string, number> = { low: 0, medium: 0, high: 0 };
  let globalEligible = 0, piiOrLongText = 0;
  for (const r of register) {
    const q = scoreSource(r);
    byReliability[q.reliability]++;
    if (q.globalPromotionEligible) globalEligible++;
    if (q.piiRisk || q.longTextRisk) piiOrLongText++;
  }
  return { total: register.length, byReliability, globalEligible, piiOrLongText };
}
