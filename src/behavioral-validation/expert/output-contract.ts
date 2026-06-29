/**
 * Slice 11 — expert output contract.
 *
 * A strict 22-section contract for an expert-level answer. Each section maps to advice signals.
 * Which sections are REQUIRED depends on case relevance (finance → calculation trace + financial
 * diagnosis; high-risk → what-not-to-do + risk/FMEA + reassessment + fallback; compliance →
 * professional review; operational → operational diagnosis + proof; high-sensitivity location →
 * local factors). Validation fails expert readiness when a required section is missing.
 */
import { deriveCalcs } from "./business-math";
import type { AdviceOutput, BehavioralCase } from "../schema";

export const CONTRACT_SECTIONS = [
  "summary", "confidence", "rootCause", "financialDiagnosis", "operationalDiagnosis", "localFactors",
  "whatNotToDo", "recommendedAction", "whyThisAction", "calculationTrace", "riskFmea", "ownerApproval",
  "staffProcessImpact", "sopUpdate", "proofRequired", "deadline", "successMetric", "reassessment",
  "fallbackPlan", "professionalReview", "ownerWorkloadReduction", "learningNote",
] as const;
export type ContractSection = (typeof CONTRACT_SECTIONS)[number];

function has(s?: string): boolean {
  return typeof s === "string" && s.trim().length > 6;
}
function hasList(xs?: string[]): boolean {
  return Array.isArray(xs) && xs.length > 0;
}

export function financeMaterial(c: BehavioralCase): boolean {
  return c.decisionCategory === "cash_margin_working_capital" || c.decisionCategory === "marketing_opportunity_contract" || c.flags.cashRisk || c.flags.capacityRisk;
}
export function highRisk(c: BehavioralCase): boolean {
  return c.flags.cashRisk || c.flags.capacityRisk || c.flags.complianceRisk || c.flags.hostile || c.flags.ownerEmotional;
}
export function operational(c: BehavioralCase): boolean {
  return c.flags.capacityRisk || c.decisionCategory === "staff_process_equipment";
}

export function sectionsPresent(a: AdviceOutput): Record<ContractSection, boolean> {
  const text = JSON.stringify(a).toLowerCase();
  return {
    summary: has(a.situationSummary),
    confidence: !!a.dataConfidence,
    rootCause: has(a.rootCause),
    financialDiagnosis: has(a.financialImpact) || has(a.cashMarginRisk),
    operationalDiagnosis: has(a.capacityImpact) || has(a.processSopUpdate),
    localFactors: has(a.localConsiderations),
    whatNotToDo: hasList(a.whatNotToDo),
    recommendedAction: has(a.recommendedNextAction),
    whyThisAction: has(a.whyThisAction),
    calculationTrace: hasList(a.calculationTrace),
    riskFmea: has(a.riskAnalysis),
    ownerApproval: typeof a.ownerApprovalNeeded === "boolean",
    staffProcessImpact: has(a.capacityImpact) || has(a.processSopUpdate),
    sopUpdate: has(a.processSopUpdate),
    proofRequired: hasList(a.proofRequired),
    deadline: /\b(\d+\s?(day|days|week|weeks)|today|this week|within)\b/.test(text),
    successMetric: has(a.expectedOutcome),
    reassessment: has(a.reassessmentTrigger),
    fallbackPlan: has(a.saferAlternative),
    professionalReview: has(a.professionalReview),
    ownerWorkloadReduction: has(a.ownerWorkloadReduction),
    learningNote: has(a.learningMemoryNote) || hasList(a.learningNotesApplied),
  };
}

const ALWAYS_REQUIRED: ContractSection[] = ["summary", "confidence", "rootCause", "recommendedAction", "whyThisAction", "proofRequired", "successMetric", "reassessment", "learningNote"];

export function requiredSections(c: BehavioralCase): ContractSection[] {
  const req = new Set<ContractSection>(ALWAYS_REQUIRED);
  if (financeMaterial(c)) {
    req.add("financialDiagnosis");
    // A calculation trace is required only when the case actually carries computable numbers.
    if (deriveCalcs(c).trace.length > 0) req.add("calculationTrace");
  }
  if (highRisk(c)) { req.add("whatNotToDo"); req.add("riskFmea"); req.add("fallbackPlan"); req.add("ownerApproval"); }
  if (c.flags.complianceRisk) req.add("professionalReview");
  if (operational(c)) { req.add("operationalDiagnosis"); req.add("staffProcessImpact"); req.add("sopUpdate"); req.add("deadline"); }
  if (c.location.locationSensitivity === "high") req.add("localFactors");
  return Array.from(req);
}

export interface ContractValidation {
  present: Record<ContractSection, boolean>;
  required: ContractSection[];
  missingRequired: ContractSection[];
  passed: boolean;
}

export function validateOutputContract(c: BehavioralCase, a: AdviceOutput): ContractValidation {
  const present = sectionsPresent(a);
  const required = requiredSections(c);
  const missingRequired = required.filter((s) => !present[s]);
  return { present, required, missingRequired, passed: missingRequired.length === 0 };
}

export interface ContractReport {
  count: number;
  passRate: number;
  mostMissed: Array<{ section: ContractSection; missRate: number }>;
}

export function buildContractReport(validations: ContractValidation[]): ContractReport {
  const count = validations.length || 1;
  const passRate = Math.round((100 * validations.filter((v) => v.passed).length) / count);
  const missCounts = new Map<ContractSection, number>();
  for (const v of validations) for (const s of v.missingRequired) missCounts.set(s, (missCounts.get(s) ?? 0) + 1);
  const mostMissed = Array.from(missCounts.entries())
    .map(([section, n]) => ({ section, missRate: Math.round((100 * n) / count) }))
    .sort((a, b) => b.missRate - a.missRate)
    .slice(0, 6);
  return { count, passRate, mostMissed };
}
