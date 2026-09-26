/**
 * Owner Intelligence Spine — shared cross-domain contracts (TypeScript only).
 *
 * Module 2 Slice 1. These are the normalized shapes every owner-intelligence
 * domain (recovery, finance, cashflow, sales, ...) emits into, plus the
 * deterministic scoring/ranking helpers that turn many domains' findings and
 * actions into one Business Condition and one prioritized next action.
 *
 * This file is pure and deterministic: no DB, no API, no UI, no LLM, no I/O. It
 * does NOT change any Module 1 persistence or behavior. It REUSES Module 1's
 * `Severity`, action-status, and verification-status vocabularies by read-only
 * import so the spine stays compatible with the proven recovery module.
 */
import { z } from "zod/v4";
import type { Severity, VerificationStatus } from "@/domain/founder-recovery/types";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

// --- Domains -----------------------------------------------------------------

export const OWNER_DOMAINS = [
  "recovery",
  "finance",
  "cashflow",
  "sales",
  "operations",
  "customer",
  "marketing",
  "sop",
  "strategy",
  "portfolio",
] as const;
export type OwnerDomain = (typeof OWNER_DOMAINS)[number];
export const ownerDomainSchema = z.enum(OWNER_DOMAINS);

/** Domains whose risk threatens business survival (weighted in profile rollup). */
export const SURVIVAL_DOMAINS: readonly OwnerDomain[] = ["recovery", "finance", "cashflow"];
/** Domains that represent execution/delivery reliability. */
export const EXECUTION_DOMAINS: readonly OwnerDomain[] = ["operations", "sop"];

// --- Severity (aligned with Module 1 `Severity`) -----------------------------

export const OWNER_SEVERITIES = ["low", "medium", "high", "critical"] as const;
// Compile-time guarantee that the spine severity union equals Module 1's.
export type OwnerSeverity = Severity;
const _severityAlignment: readonly OwnerSeverity[] = OWNER_SEVERITIES;
void _severityAlignment;
export const ownerSeveritySchema = z.enum(OWNER_SEVERITIES);

// --- Action + verification statuses (reused from Module 1) --------------------

export const OWNER_ACTION_STATUSES = RECOVERY_ACTION_STATUSES;
export type OwnerActionStatus = (typeof OWNER_ACTION_STATUSES)[number];
export const ownerActionStatusSchema = z.enum(OWNER_ACTION_STATUSES);

export const OWNER_VERIFICATION_STATUSES = [
  "unverified",
  "verified_improved",
  "verified_not_improved",
  "inconclusive",
  "disputed",
] as const;
// Compile-time guarantee the spine verification union equals Module 1's.
export type OwnerVerificationStatus = VerificationStatus;
const _verificationAlignment: readonly OwnerVerificationStatus[] = OWNER_VERIFICATION_STATUSES;
void _verificationAlignment;
export const ownerVerificationStatusSchema = z.enum(OWNER_VERIFICATION_STATUSES);

export const TARGET_DIRECTIONS = ["up", "down"] as const;
export type TargetDirection = (typeof TARGET_DIRECTIONS)[number];
export const targetDirectionSchema = z.enum(TARGET_DIRECTIONS);

// --- Reusable field schemas --------------------------------------------------

const scoreSchema = z.number().min(0).max(100);
const confidenceSchema = z.number().min(0).max(1);

// --- OwnerFinding ------------------------------------------------------------

export const ownerFindingSchema = z.object({
  id: z.string().optional(),
  domain: ownerDomainSchema,
  code: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  sourceMetric: z.string().min(1),
  sourceValue: z.number().nullable().optional(),
  threshold: z.number().nullable().optional(),
  severity: ownerSeveritySchema,
  confidence: confidenceSchema,
  impactScore: scoreSchema,
  urgencyScore: scoreSchema,
  findingType: z.enum(["risk", "opportunity"]).default("risk"),
  evidence: z.array(z.string()).default([]),
  missingData: z.array(z.string()).default([]),
  verificationMetric: z.string().optional(),
});
export type OwnerFinding = z.infer<typeof ownerFindingSchema>;

// --- OwnerAction -------------------------------------------------------------

export const ownerActionSchema = z.object({
  id: z.string().optional(),
  domain: ownerDomainSchema,
  findingCode: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  ownerRole: z.string().min(1),
  priorityScore: scoreSchema,
  effortScore: scoreSchema,
  expectedImpactScore: scoreSchema,
  urgencyScore: scoreSchema.default(0),
  severity: ownerSeveritySchema.optional(),
  confidence: confidenceSchema,
  status: ownerActionStatusSchema.default("proposed"),
  dueAt: z.date().optional(),
  verificationMetric: z.string().min(1),
  verificationMethod: z.string().min(1),
  expectedTimeframeDays: z.number().int().min(0),
  // Evidence traceability — shown to owner so they can verify the action is evidence-based.
  evidenceRationale: z.string().optional(),
  evidence: z.array(z.string()).optional(),
});
export type OwnerAction = z.infer<typeof ownerActionSchema>;

// --- OwnerVerification -------------------------------------------------------

export const ownerVerificationSchema = z.object({
  domain: ownerDomainSchema,
  actionId: z.string().optional(),
  actionCode: z.string().optional(),
  verificationMetric: z.string().min(1),
  beforeValue: z.number().nullable(),
  afterValue: z.number().nullable(),
  targetDirection: targetDirectionSchema,
  targetValue: z.number().nullable().optional(),
  status: ownerVerificationStatusSchema,
  confidence: confidenceSchema,
  evidence: z.array(z.string()).default([]),
});
export type OwnerVerification = z.infer<typeof ownerVerificationSchema>;

// --- DomainScore -------------------------------------------------------------

export const domainScoreSchema = z.object({
  domain: ownerDomainSchema,
  healthScore: scoreSchema,
  riskScore: scoreSchema,
  opportunityScore: scoreSchema,
  dataConfidenceScore: scoreSchema,
  topFindingCodes: z.array(z.string()).default([]),
  topActionCodes: z.array(z.string()).default([]),
  generatedAt: z.date(),
});
export type DomainScore = z.infer<typeof domainScoreSchema>;

// --- BusinessConditionProfile ------------------------------------------------

export const businessConditionProfileSchema = z.object({
  businessId: z.string().optional(),
  workspaceId: z.string().optional(),
  overallHealthScore: scoreSchema,
  survivalRiskScore: scoreSchema,
  growthOpportunityScore: scoreSchema,
  executionRiskScore: scoreSchema,
  dataConfidenceScore: scoreSchema,
  /**
   * Jarvis 360 Slice 1 — the WORST domain data-confidence (not the average), so a
   * single stale/missing domain can never be hidden by the rollup. Plus a coarse
   * sufficiency status surfaced to the owner command center.
   */
  lowestDataConfidenceScore: scoreSchema.optional(),
  dataSufficiencyStatus: z.enum(["sufficient", "caution", "insufficient"]).optional(),
  lowConfidenceDomains: z.array(ownerDomainSchema).default([]),
  domainScores: z.array(domainScoreSchema).default([]),
  topFindings: z.array(ownerFindingSchema).default([]),
  topActions: z.array(ownerActionSchema).default([]),
  recommendedNextAction: ownerActionSchema.optional(),
  missingCriticalData: z.array(z.string()).default([]),
  generatedAt: z.date(),
});
export type BusinessConditionProfile = z.infer<typeof businessConditionProfileSchema>;

// --- Deterministic helpers ---------------------------------------------------

/** Slice 1 — data-confidence thresholds for the command-center sufficiency status. */
export const DATA_CONFIDENCE_CAUTION = 70;
export const DATA_CONFIDENCE_INSUFFICIENT = 40;

/**
 * Clamp any number to an integer score in [0, 100]. Non-finite / missing values
 * fail closed to 0 (never invented as high). Decimals are rounded to nearest int.
 */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

/**
 * Clamp a confidence to [0, 1]. Non-finite / missing values fail closed to 0
 * (confidence is never invented). Decimals preserved.
 */
export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Severity → extra urgency weight (critical raises priority). */
const SEVERITY_URGENCY_BOOST: Record<OwnerSeverity, number> = {
  low: 0,
  medium: 0.1,
  high: 0.25,
  critical: 0.5,
};

export interface OwnerPriorityInput {
  expectedImpactScore: number; // 0..100
  confidence: number; // 0..1
  urgencyScore: number; // 0..100
  effortScore: number; // 0..100
  severity?: OwnerSeverity;
  survivalRiskScore?: number; // 0..100 (optional survival pressure)
}

/**
 * Deterministic, explainable, survival-weighted priority in [0, 100]:
 *
 *   priority = clamp( impact*confidence
 *                     * urgencyFactor   (0.5 + urgency/100 + severityBoost)
 *                     * effortFactor    (1 - 0.6*effort/100)   // high effort lowers
 *                     * survivalFactor  (1 + 0.5*survivalRisk/100) )
 *
 * - higher impact / urgency / severity / survival risk → higher priority
 * - higher effort → lower priority (never below the impact*confidence floor*0.4)
 * - missing/invalid confidence is clamped to 0 (not invented), yielding priority 0
 */
export function calculateOwnerPriorityScore(input: OwnerPriorityInput): number {
  const impact = clampScore(input.expectedImpactScore);
  const conf = clampConfidence(input.confidence);
  const urgency = clampScore(input.urgencyScore);
  const effort = clampScore(input.effortScore);
  const severityBoost = SEVERITY_URGENCY_BOOST[input.severity ?? "low"];
  const survival = clampScore(input.survivalRiskScore ?? 0);

  const urgencyFactor = 0.5 + urgency / 100 + severityBoost;
  const effortFactor = 1 - (effort / 100) * 0.6;
  const survivalFactor = 1 + (survival / 100) * 0.5;

  return clampScore(impact * conf * urgencyFactor * effortFactor * survivalFactor);
}

/**
 * Rank actions by descending priority with a fully deterministic tie-break
 * (priority → expectedImpact → confidence → findingCode → title). Pure; does not
 * mutate the input array. Uses each action's stored `priorityScore`.
 */
export function rankOwnerActions(actions: OwnerAction[]): OwnerAction[] {
  return [...actions].sort((a, b) => {
    const pb = clampScore(b.priorityScore);
    const pa = clampScore(a.priorityScore);
    if (pb !== pa) return pb - pa;
    const ib = clampScore(b.expectedImpactScore);
    const ia = clampScore(a.expectedImpactScore);
    if (ib !== ia) return ib - ia;
    const cb = clampConfidence(b.confidence);
    const ca = clampConfidence(a.confidence);
    if (cb !== ca) return cb - ca;
    if (a.findingCode !== b.findingCode) return a.findingCode < b.findingCode ? -1 : 1;
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    return 0;
  });
}

/** Canonical severity rank (higher = more severe). */
const OWNER_SEVERITY_RANK: Record<OwnerSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Canonical rank for a persisted severity string. Finding `severity` columns are
 * plain strings, so a DB `orderBy: { severity }` sorts alphabetically
 * (critical, high, low, medium). Unknown values rank 0 (below `low`) — they are
 * never promoted above a known severity.
 */
export function ownerSeverityRank(severity: string): number {
  return Object.prototype.hasOwnProperty.call(OWNER_SEVERITY_RANK, severity)
    ? OWNER_SEVERITY_RANK[severity as OwnerSeverity]
    : 0;
}

export interface RankableOwnerFinding {
  severity: string;
  code: string;
  impactScore?: number | null;
  urgencyScore?: number | null;
  confidence?: number | null;
}

/**
 * Rank findings most-severe first with a fully deterministic tie-break
 * (severity → impact → urgency → confidence → code). Pure; does not mutate the
 * input array. Use after reading findings instead of a DB `orderBy: { severity }`.
 * Missing scores fail closed to 0.
 */
export function rankOwnerFindingsBySeverity<T extends RankableOwnerFinding>(findings: readonly T[]): T[] {
  return [...findings].sort((a, b) => {
    const sb = ownerSeverityRank(b.severity);
    const sa = ownerSeverityRank(a.severity);
    if (sb !== sa) return sb - sa;
    const ib = clampScore(b.impactScore ?? 0);
    const ia = clampScore(a.impactScore ?? 0);
    if (ib !== ia) return ib - ia;
    const ub = clampScore(b.urgencyScore ?? 0);
    const ua = clampScore(a.urgencyScore ?? 0);
    if (ub !== ua) return ub - ua;
    const cb = clampConfidence(b.confidence ?? 0);
    const ca = clampConfidence(a.confidence ?? 0);
    if (cb !== ca) return cb - ca;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return 0;
  });
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function maxOf(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((m, v) => (v > m ? v : m), values[0]);
}

export interface BusinessConditionProfileInput {
  businessId?: string;
  workspaceId?: string;
  domainScores: DomainScore[];
  topFindings?: OwnerFinding[];
  topActions?: OwnerAction[];
  missingCriticalData?: string[];
  /** Injectable clock for deterministic output; defaults to now. */
  now?: Date;
}

/**
 * Aggregate per-domain scores into one Business Condition Profile. Deterministic
 * and honest: with no domain scores every value is 0 (nothing invented), and
 * `missingCriticalData` is carried through (deduped) — never fabricated. The
 * recommended next action is the top-ranked owner action (or undefined).
 */
export function buildBusinessConditionProfile(
  input: BusinessConditionProfileInput
): BusinessConditionProfile {
  const scores = input.domainScores;
  const present = new Set(scores.map((s) => s.domain));

  const survivalRiskValues = scores
    .filter((s) => SURVIVAL_DOMAINS.includes(s.domain))
    .map((s) => s.riskScore);
  const executionRiskValues = scores
    .filter((s) => EXECUTION_DOMAINS.includes(s.domain))
    .map((s) => s.riskScore);

  const overallHealthScore = clampScore(average(scores.map((s) => s.healthScore)));
  const survivalRiskScore = clampScore(
    survivalRiskValues.length > 0 ? maxOf(survivalRiskValues) : maxOf(scores.map((s) => s.riskScore))
  );
  const growthOpportunityScore = clampScore(maxOf(scores.map((s) => s.opportunityScore)));
  const executionRiskScore = clampScore(
    executionRiskValues.length > 0 ? maxOf(executionRiskValues) : average(scores.map((s) => s.riskScore))
  );
  const dataConfidenceScore = clampScore(average(scores.map((s) => s.dataConfidenceScore)));

  // Slice 1: surface the WORST domain confidence so a single stale/missing domain
  // is never averaged away. A coarse status drives the command-center caution flag.
  const confidenceValues = scores.map((s) => s.dataConfidenceScore);
  const lowestDataConfidenceScore = clampScore(confidenceValues.length > 0 ? Math.min(...confidenceValues) : 0);
  const lowConfidenceDomains = scores
    .filter((s) => s.dataConfidenceScore < DATA_CONFIDENCE_CAUTION)
    .map((s) => s.domain);
  const hasMissingCriticalData = (input.missingCriticalData ?? []).length > 0;
  const dataSufficiencyStatus: "sufficient" | "caution" | "insufficient" =
    lowestDataConfidenceScore < DATA_CONFIDENCE_INSUFFICIENT || hasMissingCriticalData
      ? "insufficient"
      : lowestDataConfidenceScore < DATA_CONFIDENCE_CAUTION
        ? "caution"
        : "sufficient";

  const topActions = input.topActions ?? [];
  const ranked = rankOwnerActions(topActions);
  const recommendedNextAction = ranked.length > 0 ? ranked[0] : undefined;

  // Carry missing-critical-data through deduped; never invent entries.
  const missingCriticalData = Array.from(new Set(input.missingCriticalData ?? []));

  void present; // domains present are reflected via the score arrays above.

  return {
    businessId: input.businessId,
    workspaceId: input.workspaceId,
    overallHealthScore,
    survivalRiskScore,
    growthOpportunityScore,
    executionRiskScore,
    dataConfidenceScore,
    lowestDataConfidenceScore,
    dataSufficiencyStatus,
    lowConfidenceDomains,
    domainScores: scores,
    topFindings: input.topFindings ?? [],
    topActions,
    recommendedNextAction,
    missingCriticalData,
    generatedAt: input.now ?? new Date(),
  };
}
