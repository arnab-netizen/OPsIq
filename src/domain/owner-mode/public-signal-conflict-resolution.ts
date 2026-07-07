/**
 * Public Signal Conflict Resolution (PASS 29).
 *
 * A CONSERVATIVE, DETERMINISTIC layer that consumes ALREADY-INTERPRETED normalized public signals
 * (from public-signal-interpretation.ts) for ONE workspace and produces the SAFEST governed collective
 * decision when those signals conflict, repeat, disagree in recency, or mix trustworthy and adversarial
 * content. It does NOT re-interpret raw text, does NOT make a final factual judgment, and does NOT bypass
 * the governed execution bridge — it outputs a decision package that the bridge then routes and gates.
 *
 * Core stance (matches OpsIQ rules):
 *   - One weak signal can never become a high-confidence conclusion.
 *   - Repeated weak signals produce validation/reassessment, never an accusation.
 *   - An official source can strengthen facts about PUBLISHED requirements, but never proves INTERNAL readiness.
 *   - Public reviews cannot prove internal execution; a positive review cannot close an issue without
 *     executed-correction + outcome evidence.
 *   - A recent negative signal can reopen a "fixed" claim.
 *   - Tender urgency cannot override missing eligibility/cost/capacity; growth cannot override unresolved
 *     quality/cash/capacity; a competitor claim cannot become a verified market fact.
 *   - Unsafe instructions embedded in raw text stay blocked; PII is never carried forward; money/ROI/
 *     win-probability claims are never accepted as fact.
 *   - Duplicate/near-duplicate signals cluster; the owner cockpit shows ONE top collective action, not spam.
 *   - When uncertainty stays high, the decision is conservative (validation / reassessment / owner-review /
 *     missing-data / monitor-only) — never a confident action.
 *
 * Pure + deterministic: no Date.now / Math.random / IO.
 */

import { z } from "zod";
import type { CorrectionType, ProcessCorrection } from "./bottleneck-correction-routing";
import type { ExecutionRoute } from "./process-execution-bridge";
import type {
  ProcessStage, ProcessSeverity, ProcessConfidence, ExpectedImpactType, ApprovalLevel,
} from "./process-intelligence";
import {
  PUBLIC_ARCHETYPES, type PublicArchetype, type NormalizedPublicSignal,
} from "./public-signal-interpretation";

/** Recency marker per signal — deterministic (no clock); the caller supplies it from collectedAt ordering. */
export const RECENCIES = ["RECENT", "OLD", "UNKNOWN"] as const;
export type Recency = (typeof RECENCIES)[number];

/** The conflict classifications required by PASS 29. */
export const CONFLICT_CLASSIFICATIONS = [
  "NO_CONFLICT",
  "SUPPORTING_SIGNALS",
  "CONTRADICTORY_SIGNALS",
  "MIXED_RECENCY",
  "WEAK_SINGLE_SIGNAL",
  "REPEATED_WEAK_SIGNALS",
  "OFFICIAL_SOURCE_CONFLICT",
  "THIRD_PARTY_UNVERIFIED_CONFLICT",
  "MISSING_INTERNAL_DATA",
  "HIGH_RISK_UNRESOLVED",
  "VALIDATION_REQUIRED",
  "MONITOR_ONLY",
  "BLOCK_UNSAFE",
  "UNKNOWN",
] as const;
export type ConflictClassification = (typeof CONFLICT_CLASSIFICATIONS)[number];

/** One interpreted signal plus its recency marker. */
export interface ConflictSignalInput {
  signal: NormalizedPublicSignal;
  recency?: Recency;
}

export interface ResolveConflictInput {
  conflictCaseId: string;
  workspaceArchetype: PublicArchetype;
  signals: ConflictSignalInput[];
}

/** The conservative collective decision package. */
export interface ConflictDecisionPackage {
  conflictCaseId: string;
  workspaceArchetype: PublicArchetype;
  interpretedSignalIds: string[];
  signalCount: number;
  duplicateClustersCollapsed: number;
  conflictClassification: ConflictClassification;
  collectiveSignalSummary: string;
  sourceQualitySummary: string;
  evidenceStrengthSummary: string;
  recencySummary: string;
  missingData: string[];
  recommendedCollectiveDecision: string;
  recommendedCorrectionType: CorrectionType;
  recommendedExecutionRoute: ExecutionRoute;
  ownerApprovalRequired: boolean;
  evidenceRequired: string[];
  validationRequired: boolean;
  reassessmentRequired: boolean;
  blockedUnsafeActions: string[];
  monitorOnlyReason: string | null;
  cockpitSummary: string;
  auditTrace: string[];
}

export const conflictDecisionPackageSchema = z.object({
  conflictCaseId: z.string().min(1),
  workspaceArchetype: z.enum(PUBLIC_ARCHETYPES),
  interpretedSignalIds: z.array(z.string()).min(1),
  signalCount: z.number().int().nonnegative(),
  duplicateClustersCollapsed: z.number().int().nonnegative(),
  conflictClassification: z.enum(CONFLICT_CLASSIFICATIONS),
  collectiveSignalSummary: z.string().min(3),
  sourceQualitySummary: z.string().min(1),
  evidenceStrengthSummary: z.string().min(1),
  recencySummary: z.string().min(1),
  missingData: z.array(z.string()),
  recommendedCollectiveDecision: z.string().min(3),
  recommendedCorrectionType: z.enum([
    "REQUIRE_FRESH_PROOF", "UPDATE_CHECKLIST", "REVIEW_PROCESS_STEP", "ASSIGN_TRAINING_REVIEW",
    "ESCALATE_TO_MANAGER", "ESCALATE_TO_OWNER", "RESOLVE_OPERATIONAL_EVENT", "COLLECT_MISSING_DATA",
    "NO_ACTION_DATA_INSUFFICIENT",
  ]),
  recommendedExecutionRoute: z.enum([
    "CREATE_CORRECTION_TASK", "CREATE_SOP_CHECKLIST_TASK", "CREATE_TRAINING_TASK", "CREATE_REASSESSMENT_TASK",
    "CREATE_EVIDENCE_REQUEST", "CREATE_OWNER_APPROVAL_TASK", "CREATE_MANAGER_TASK", "CREATE_STAFF_TASK",
    "CREATE_MISSING_DATA_TASK", "BLOCK_UNSAFE_ACTION", "MONITOR_ONLY",
  ]),
  ownerApprovalRequired: z.boolean(),
  evidenceRequired: z.array(z.string()),
  validationRequired: z.boolean(),
  reassessmentRequired: z.boolean(),
  blockedUnsafeActions: z.array(z.string()),
  monitorOnlyReason: z.string().nullable(),
  cockpitSummary: z.string().min(3),
  auditTrace: z.array(z.string()).min(1),
})
  // Governance invariants that must always hold, even under a logic bug.
  .refine((p) => p.recommendedExecutionRoute !== "MONITOR_ONLY" || p.monitorOnlyReason !== null, {
    message: "a monitor-only collective route must carry a reason",
  })
  .refine((p) => p.ownerApprovalRequired === (p.recommendedExecutionRoute === "CREATE_OWNER_APPROVAL_TASK"), {
    message: "ownerApprovalRequired must match an owner-approval route exactly (no hidden gate mismatch)",
  })
  .refine((p) => !/[$£€]\s?\d|\b\d+(\.\d+)?\s?%/.test(p.collectiveSignalSummary + p.recommendedCollectiveDecision + p.cockpitSummary), {
    message: "no fabricated currency/percentage may appear in a governed collective summary",
  });

/** route ← correctionType (mirrors the governed bridge; the bridge remains the authority). */
const ROUTE_FOR_CORRECTION: Record<CorrectionType, ExecutionRoute> = {
  REVIEW_PROCESS_STEP: "CREATE_CORRECTION_TASK",
  UPDATE_CHECKLIST: "CREATE_SOP_CHECKLIST_TASK",
  ASSIGN_TRAINING_REVIEW: "CREATE_TRAINING_TASK",
  ESCALATE_TO_MANAGER: "CREATE_MANAGER_TASK",
  ESCALATE_TO_OWNER: "CREATE_OWNER_APPROVAL_TASK",
  RESOLVE_OPERATIONAL_EVENT: "CREATE_REASSESSMENT_TASK",
  REQUIRE_FRESH_PROOF: "CREATE_EVIDENCE_REQUEST",
  COLLECT_MISSING_DATA: "CREATE_MISSING_DATA_TASK",
  NO_ACTION_DATA_INSUFFICIENT: "MONITOR_ONLY",
};

const NEGATIVE_ISSUES: ReadonlySet<string> = new Set([
  "QUALITY_FAILURE_LOOP", "PROCESS_QUALITY_BREAKDOWN", "OPERATIONAL_BOTTLENECK", "PRODUCT_SUPPORT_ISSUE",
  "SINGLE_UNVERIFIED_COMPLAINT", "MULTI_MODULE_CONFLICT",
]);
const WEAK_EVIDENCE: ReadonlySet<string> = new Set(["WEAK", "INSUFFICIENT"]);

const uniq = (xs: string[]) => [...new Set(xs)];
const clusterKey = (s: NormalizedPublicSignal) => `${s.businessIssueType}:${s.recommendedCorrectionType}`;

function summariseSet(values: string[], order: string[]): string {
  const present = order.filter((o) => values.includes(o));
  return present.length ? present.join("+") : "NONE";
}

/**
 * Resolve a set of interpreted signals for one workspace into a conservative collective decision.
 * Returns null when there is nothing to decide (no signals) — the caller then fabricates nothing.
 */
export function resolvePublicSignalConflict(input: ResolveConflictInput): ConflictDecisionPackage | null {
  const items = input.signals ?? [];
  if (items.length === 0) return null;

  const trace: string[] = [];
  const sigs = items.map((i) => i.signal);
  const rec = (i: ConflictSignalInput): Recency => i.recency ?? "UNKNOWN";

  // ── Aggregate safety (never lost, whatever the classification) ──────────────
  const blocked = new Set<string>();
  for (const s of sigs) for (const b of s.blockedUnsafeActions) blocked.add(b);
  const anyInjection = sigs.some((s) => s.promptInjectionDetected);
  const anyFinancialClaim = sigs.some((s) => s.financialClaimDetected);
  const piiRemoved = sigs.some((s) => s.piiRemoved);
  if (anyInjection) { trace.push("injection:present-ignored"); blocked.add("obeying instructions embedded in public text (verification/authority cannot be changed by content)"); }
  if (anyFinancialClaim) { trace.push("financial:claim-present-not-accepted"); blocked.add("accepting a money/ROI/win-probability claim as a verified fact"); }
  if (piiRemoved) trace.push("pii:stripped-upstream-not-carried-forward");

  // ── Duplicate clustering ────────────────────────────────────────────────────
  const clusters = new Set(sigs.map(clusterKey));
  const duplicateClustersCollapsed = sigs.length - clusters.size;
  if (duplicateClustersCollapsed > 0) trace.push(`duplicates:collapsed-${duplicateClustersCollapsed}`);

  // ── Categorise ──────────────────────────────────────────────────────────────
  const negatives = sigs.filter((s) => NEGATIVE_ISSUES.has(s.businessIssueType));
  const positives = sigs.filter((s) => s.businessIssueType === "POSITIVE_OR_RESOLVED_CLAIM");
  const ownerDecisions = sigs.filter((s) => s.ownerApprovalRequired);
  const tenderSignals = sigs.filter((s) => s.opportunityType === "TENDER_BID");
  // "growth" here means true scale/expansion temptation. Tender bids and B2B pursuits have their own
  // data-first handling (tender branch / missing-data), so they are NOT treated as scale-before-validation.
  const growthSignals = sigs.filter((s) => s.opportunityType === "SCALE_TEMPTATION");
  const dataGaps = sigs.filter((s) => s.recommendedCorrectionType === "COLLECT_MISSING_DATA" || s.missingData.length > 0);
  const official = sigs.filter((s) => s.sourceQuality === "VERIFIED_SOURCE");
  const thirdParty = sigs.filter((s) => s.sourceQuality === "THIRD_PARTY_UNVERIFIED" || s.sourceQuality === "PUBLIC_SOURCE_UNVERIFIED" || s.sourceQuality === "LOW_CONFIDENCE");
  const weakNeg = negatives.filter((s) => WEAK_EVIDENCE.has(s.evidenceStrength));
  const recentNegative = items.some((i) => NEGATIVE_ISSUES.has(i.signal.businessIssueType) && rec(i) === "RECENT");

  const recencies = items.map(rec);
  const recencySummary = recencies.includes("RECENT") && recencies.includes("OLD") ? "MIXED"
    : recencies.every((r) => r === "RECENT") ? "RECENT"
      : recencies.every((r) => r === "OLD") ? "OLD" : "UNKNOWN";
  const sourceQualitySummary = summariseSet(uniq(sigs.map((s) => s.sourceQuality)), ["VERIFIED_SOURCE", "PUBLIC_SOURCE_UNVERIFIED", "THIRD_PARTY_UNVERIFIED", "LOW_CONFIDENCE", "UNKNOWN"]);
  const evidenceStrengthSummary = summariseSet(uniq(sigs.map((s) => s.evidenceStrength)), ["STRONG", "MODERATE", "WEAK", "INSUFFICIENT"]);

  const missingData = uniq(sigs.flatMap((s) => s.missingData));

  // ── Deterministic classification (most-conservative precedence) ─────────────
  let classification: ConflictClassification;
  let correctionType: CorrectionType;
  let ownerApprovalRequired = false;
  let validationRequired = false;
  let reassessmentRequired = false;
  let decision: string;

  const meaningful = negatives.length + positives.length + ownerDecisions.length + tenderSignals.length + growthSignals.length + dataGaps.length;

  if (meaningful === 0) {
    // Only adversarial / ambiguous content — nothing actionable, but safety recorded.
    classification = anyInjection || anyFinancialClaim ? "BLOCK_UNSAFE" : "MONITOR_ONLY";
    correctionType = "NO_ACTION_DATA_INSUFFICIENT";
    decision = "No genuine business signal after stripping injection/claims — monitor only; nothing is acted on or accepted as fact.";
    trace.push(`classify:${classification}:no-genuine-signal`);
  } else if (tenderSignals.length > 0) {
    // Tender urgency can never override missing eligibility/cost/capacity, and never auto-submits.
    classification = "MISSING_INTERNAL_DATA";
    correctionType = "COLLECT_MISSING_DATA";
    validationRequired = true;
    blocked.add("tender auto-submit"); blocked.add("auto EMD payment / spend"); blocked.add("auto contract signing");
    decision = "Tender opportunity present, but eligibility/cost/capacity are unproven — collect the required internal data first; the owner decides bid/no-bid; nothing is auto-submitted or spent.";
    trace.push("classify:MISSING_INTERNAL_DATA:tender-gated");
  } else if (growthSignals.length > 0 && (negatives.length > 0 || weakNeg.length > 0 || missingData.length > 0)) {
    // Growth cannot override unresolved quality/cash/capacity — fix/validate first; scale stays owner-gated & blocked-before-proof.
    classification = "HIGH_RISK_UNRESOLVED";
    validationRequired = true;
    blocked.add("scale before validation"); blocked.add("spend before cost/capacity data");
    if (negatives.some((s) => !WEAK_EVIDENCE.has(s.evidenceStrength))) {
      correctionType = "REVIEW_PROCESS_STEP";
      decision = "A growth opportunity coincides with an unresolved quality/capacity risk — fix quality FIRST with proof; do not scale before validation; the scale decision stays owner-gated.";
    } else {
      correctionType = "COLLECT_MISSING_DATA";
      decision = "A growth opportunity coincides with weak/unproven quality/capacity/cost — gather the missing internal data and validate first; do not scale before proof.";
    }
    trace.push("classify:HIGH_RISK_UNRESOLVED:growth-vs-weak");
  } else if (positives.length > 0 && negatives.length > 0) {
    // A positive/resolved claim cannot close a real negative signal without executed-correction + outcome evidence.
    validationRequired = true;
    correctionType = "REQUIRE_FRESH_PROOF";
    if (recentNegative) {
      classification = "MIXED_RECENCY";
      reassessmentRequired = true;
      decision = "A recent negative signal contradicts an older 'resolved' claim — the issue is reopened; verify with fresh executed-correction + outcome evidence before it can be considered fixed.";
      trace.push("classify:MIXED_RECENCY:recent-negative-reopens");
    } else {
      classification = "CONTRADICTORY_SIGNALS";
      decision = "Positive and negative public signals contradict — a good review is not proof; verify with executed-correction + outcome evidence before closing the issue.";
      trace.push("classify:CONTRADICTORY_SIGNALS:positive-cannot-close");
    }
  } else if (positives.length > 0 && negatives.length === 0 && ownerDecisions.length === 0) {
    // A positive/resolved claim ALONE never proves effectiveness — it is recorded, not acted on, and cannot
    // close anything without executed-correction + outcome evidence.
    classification = "MONITOR_ONLY";
    correctionType = "NO_ACTION_DATA_INSUFFICIENT";
    decision = "A positive/resolved public claim with no verified open issue — recorded as an unverified claim, NOT proof of effectiveness; no action is taken and nothing is closed without executed-correction + outcome evidence.";
    trace.push("classify:MONITOR_ONLY:lone-positive-not-proof");
  } else if (ownerDecisions.length > 0) {
    // A material owner decision (pricing/brand/spend/commitment) is present — owner decides, never auto.
    classification = negatives.length > 0 || positives.length > 0 ? "CONTRADICTORY_SIGNALS" : "HIGH_RISK_UNRESOLVED";
    correctionType = "ESCALATE_TO_OWNER";
    ownerApprovalRequired = true;
    decision = "A material decision (pricing/brand/spend/commitment) is in tension with public signals — the owner decides with real internal data; nothing is auto-applied.";
    trace.push("classify:owner-material-decision");
  } else if (official.length > 0 && negatives.length > 0) {
    // Official source strengthens PUBLISHED facts, but public reviews can't prove INTERNAL execution.
    classification = "OFFICIAL_SOURCE_CONFLICT";
    correctionType = "COLLECT_MISSING_DATA";
    validationRequired = true;
    decision = "An official/published source conflicts with a public complaint — the official source proves the published requirement, not internal execution; gather internal verification data before concluding.";
    trace.push("classify:OFFICIAL_SOURCE_CONFLICT");
  } else if (negatives.length >= 2 && weakNeg.length === negatives.length) {
    // Repeated weak signals → a validation/reassessment task, NEVER a final accusation.
    classification = "REPEATED_WEAK_SIGNALS";
    correctionType = "RESOLVE_OPERATIONAL_EVENT";
    validationRequired = true;
    reassessmentRequired = true;
    decision = "Several weak, unverified public complaints repeat — open a reassessment/validation of the pattern with proof; do not treat repetition as a proven or attributable failure.";
    trace.push("classify:REPEATED_WEAK_SIGNALS");
  } else if (negatives.length === 1 && weakNeg.length === 1) {
    // One weak signal cannot become a high-confidence conclusion.
    classification = "WEAK_SINGLE_SIGNAL";
    correctionType = "COLLECT_MISSING_DATA";
    validationRequired = true;
    decision = "A single weak, unverified public signal — validate with internal data before drawing any conclusion; not a systemic finding.";
    trace.push("classify:WEAK_SINGLE_SIGNAL");
  } else if (thirdParty.length > 0 && negatives.length > 0 && official.length === 0) {
    classification = "THIRD_PARTY_UNVERIFIED_CONFLICT";
    correctionType = "COLLECT_MISSING_DATA";
    validationRequired = true;
    decision = "Third-party unverified public signals disagree — treat as signals, not facts; validate with internal data before acting.";
    trace.push("classify:THIRD_PARTY_UNVERIFIED_CONFLICT");
  } else if (negatives.length >= 1) {
    // Consistent, non-weak negative signals → a governed correction (supported when several agree).
    classification = negatives.length >= 2 ? "SUPPORTING_SIGNALS" : "NO_CONFLICT";
    correctionType = "REVIEW_PROCESS_STEP";
    decision = "Consistent public signals point to the same process issue — open a governed correction with proof required before it can be closed.";
    trace.push(`classify:${classification}:consistent-negatives`);
  } else if (dataGaps.length > 0) {
    classification = "MISSING_INTERNAL_DATA";
    correctionType = "COLLECT_MISSING_DATA";
    validationRequired = true;
    decision = "A public opportunity/signal needs internal data that is not public — collect it before any decision.";
    trace.push("classify:MISSING_INTERNAL_DATA:data-first");
  } else {
    classification = "MONITOR_ONLY";
    correctionType = "NO_ACTION_DATA_INSUFFICIENT";
    decision = "No conservative action is warranted yet — monitor until enough verified evidence exists.";
    trace.push("classify:MONITOR_ONLY:default");
  }

  const recommendedExecutionRoute = ROUTE_FOR_CORRECTION[correctionType];
  const monitorOnlyReason = recommendedExecutionRoute === "MONITOR_ONLY"
    ? `Unverified/insufficient public signals: ${missingData.join("; ") || "no safe actionable route yet"}.`
    : null;

  const evidenceRequired = buildEvidenceRequired(correctionType, missingData);
  const collectiveSignalSummary = `${sigs.length} public signal(s) [${sourceQualitySummary} / ${evidenceStrengthSummary} / recency ${recencySummary}] → ${classification}.`;
  const cockpitSummary = decision; // one governed top action; never raw text

  trace.push(`route:${recommendedExecutionRoute}`, `owner-approval:${ownerApprovalRequired}`, `validation:${validationRequired}`, `reassessment:${reassessmentRequired}`);

  return {
    conflictCaseId: input.conflictCaseId,
    workspaceArchetype: input.workspaceArchetype,
    interpretedSignalIds: sigs.map((s) => s.normalizedSignalId),
    signalCount: sigs.length,
    duplicateClustersCollapsed,
    conflictClassification: classification,
    collectiveSignalSummary,
    sourceQualitySummary,
    evidenceStrengthSummary,
    recencySummary,
    missingData,
    recommendedCollectiveDecision: decision,
    recommendedCorrectionType: correctionType,
    recommendedExecutionRoute,
    ownerApprovalRequired,
    evidenceRequired,
    validationRequired,
    reassessmentRequired,
    blockedUnsafeActions: [...blocked],
    monitorOnlyReason,
    cockpitSummary,
    auditTrace: trace,
  };
}

/** Resolve AND validate — invalid/inconsistent output can never enter the governed path. */
export function resolveAndValidateConflict(
  input: ResolveConflictInput,
): { ok: true; decision: ConflictDecisionPackage } | { ok: false; issues: string[] } | { ok: true; decision: null } {
  const decision = resolvePublicSignalConflict(input);
  if (decision === null) return { ok: true, decision: null };
  const parsed = conflictDecisionPackageSchema.safeParse(decision);
  if (parsed.success) return { ok: true, decision };
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  return { ok: false, issues };
}

function buildEvidenceRequired(correctionType: CorrectionType, missingData: string[]): string[] {
  switch (correctionType) {
    case "REVIEW_PROCESS_STEP": return ["evidence the corrected step passes before completion"];
    case "ASSIGN_TRAINING_REVIEW": return ["proof the training was completed"];
    case "RESOLVE_OPERATIONAL_EVENT": return ["reassessment worked through with a verified outcome"];
    case "REQUIRE_FRESH_PROOF": return ["fresh executed-correction + outcome evidence before the issue is accepted as fixed"];
    case "ESCALATE_TO_OWNER": return ["the supporting evidence for the owner decision"];
    case "COLLECT_MISSING_DATA": return missingData.length ? missingData : ["the missing internal data"];
    case "UPDATE_CHECKLIST": return ["the drafted checklist change", "owner approval before adoption"];
    case "ESCALATE_TO_MANAGER": return ["evidence the correction was carried out"];
    case "NO_ACTION_DATA_INSUFFICIENT": return [];
  }
}

/**
 * Map a validated collective decision into a governed ProcessCorrection so it enters the ALREADY-PROVEN
 * execution bridge. The conflict layer proposes ONE collective action; the bridge remains the authority.
 * No fabricated actor/manager ids.
 */
export function conflictDecisionToProcessCorrection(
  pkg: ConflictDecisionPackage,
  workspaceId: string,
  correctionId: string,
  priorityRank = 1,
): ProcessCorrection {
  const requiredApprovalLevel: ApprovalLevel = pkg.ownerApprovalRequired
    ? "OWNER"
    : pkg.recommendedCorrectionType === "COLLECT_MISSING_DATA"
      ? "STAFF"
      : "MANAGER";
  const severity: ProcessSeverity =
    pkg.conflictClassification === "HIGH_RISK_UNRESOLVED" ? "HIGH"
      : pkg.conflictClassification === "WEAK_SINGLE_SIGNAL" || pkg.conflictClassification === "MONITOR_ONLY" || pkg.conflictClassification === "BLOCK_UNSAFE" ? "LOW"
        : "MEDIUM";
  const confidence: ProcessConfidence =
    pkg.evidenceStrengthSummary.startsWith("STRONG") ? "MEDIUM" : "LOW";
  const affectedStage: ProcessStage = pkg.recommendedCorrectionType === "COLLECT_MISSING_DATA" ? "INTAKE" : "DELIVERY";
  const expectedImpactType: ExpectedImpactType = "QUALITY_RISK";

  return {
    workspaceId,
    correctionId,
    sourceFindingType: "REWORK_LOOP",
    correctionType: pkg.recommendedCorrectionType,
    title: pkg.cockpitSummary.slice(0, 80),
    instruction: pkg.recommendedCollectiveDecision,
    rationale: `Conflict-resolved collective decision (${pkg.conflictClassification}) over ${pkg.signalCount} public signal(s) [${pkg.sourceQualitySummary} / ${pkg.evidenceStrengthSummary} / recency ${pkg.recencySummary}] — unverified public signals; validate before acting.`,
    affectedStage,
    targetActorId: null,
    targetManagerId: null,
    severity,
    confidence,
    priorityRank,
    requiredApprovalLevel,
    requiresOwnerApproval: pkg.ownerApprovalRequired,
    autoExecutable: false,
    expectedImpactType,
    supportingProofIds: [],
    supportingOperationalEventIds: [],
    supportingEscalationIds: [],
    supportingAdjudicationIds: [],
    missingData: pkg.recommendedCorrectionType === "COLLECT_MISSING_DATA" ? pkg.missingData : [],
    status: "PROPOSED",
  };
}
