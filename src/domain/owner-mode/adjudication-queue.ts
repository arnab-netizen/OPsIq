/**
 * Owner Adjudication Queue read-model (depth pass).
 *
 * Flattens the proof-risk blocks already produced by the Owner Now View
 * (reused-hash findings, the top anti-gaming signal, the top credibility concern, the active
 * timing-evidence signals, and the existing adjudications) into a concise, owner-facing queue the
 * UI can render and act on — WITHOUT any business logic living in the UI. It only reshapes data the
 * services already computed; it never re-derives a risk, invents an outcome, or accuses anyone.
 *
 * Each item carries exactly what the owner needs to decide fairly: source type, finding type,
 * severity, source completeness, a plain explanation, the supporting-proof count + a few
 * representative refs (not a raw dump), the actor if known, the current adjudication status, the
 * recommended next action, and any missing data. The deterministic `sourceRef` + `proofIds` are the
 * exact payload the canonical `POST /api/proof-risk/adjudicate` route expects, so the UI submits the
 * governed decision through the existing backend — never a UI-only, unaudited mutation.
 */

import { AdjudicationSourceType, AdjudicationOutcome } from "@/domain/execution/proof-risk-adjudication";
import type { GamingSignal } from "@/domain/owner-mode/anti-gaming-analytics";
import type { CredibilityFinding } from "@/domain/owner-mode/evidence-credibility-graph";
import type { TimingSignal } from "@/domain/owner-mode/timing-evidence";
import { isActiveTimingSignal } from "@/domain/owner-mode/timing-evidence";

/** The seven governed outcomes the owner can pick, with plain, non-accusatory labels + effect notes. */
export const ADJUDICATION_OUTCOME_OPTIONS: ReadonlyArray<{
  outcome: AdjudicationOutcome;
  label: string;
  effect: "REDUCES_NOISE" | "KEEPS_ACTIVE" | "INCONCLUSIVE";
  note: string;
}> = [
  { outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE, label: "Dismiss — false positive", effect: "REDUCES_NOISE", note: "Clears these exact proofs from the active queue. A new supporting proof re-surfaces it." },
  { outcome: AdjudicationOutcome.ACCEPT_AS_VALID, label: "Accept as valid", effect: "REDUCES_NOISE", note: "Marks the evidence acceptable; clears these exact proofs. New evidence can re-surface it." },
  { outcome: AdjudicationOutcome.REQUIRE_FRESH_PROOF, label: "Require fresh proof", effect: "KEEPS_ACTIVE", note: "Keeps the risk active until a fresh, independent proof is provided." },
  { outcome: AdjudicationOutcome.CONFIRM_SUSPICIOUS_PATTERN, label: "Confirm — needs owner review", effect: "KEEPS_ACTIVE", note: "Keeps the risk active for owner follow-up. Owner review/adjudication required before any personnel action." },
  { outcome: AdjudicationOutcome.ESCALATE_FOR_TRAINING, label: "Escalate for training", effect: "KEEPS_ACTIVE", note: "Routes to coaching/training; the finding stays visible." },
  { outcome: AdjudicationOutcome.ESCALATE_FOR_OWNER_REVIEW, label: "Escalate for owner review", effect: "KEEPS_ACTIVE", note: "Flags for the owner's direct review. Owner review/adjudication required before any personnel action." },
  { outcome: AdjudicationOutcome.MARK_INCONCLUSIVE_NEEDS_DATA, label: "Mark inconclusive — needs data", effect: "INCONCLUSIVE", note: "Records that there is not enough evidence to decide yet." },
];

export interface AdjudicationQueueItem {
  /** Stable per-item id (sourceType + sourceRef) for UI keying + submit correlation. */
  id: string;
  sourceType: AdjudicationSourceType;
  /** Deterministic reference the adjudication route stores (e.g. `SIGNAL_TYPE:actorId`). */
  sourceRef: string;
  /** The finding/signal type (e.g. SELF_REVIEW_ATTEMPT, REUSED_PROOF, SUSPICIOUS_FAST_COMPLETION). */
  findingType: string;
  /** Plain, owner-facing finding label (no fraud/theft/negligence wording). */
  title: string;
  severity: string;
  /** Whether the per-proof evidence is COMPLETE / PARTIAL / BLOCKED_BY_DATA (fail-visible). */
  sourceCompleteness: "COMPLETE" | "PARTIAL" | "BLOCKED_BY_DATA";
  ownerExplanation: string;
  /** How many proofs back the finding. */
  supportingProofCount: number;
  /** A few representative proof/evidence refs (never the full dump). */
  representativeProofRefs: string[];
  /** All backing proof ids — the adjudication suppression key (sent in the submit payload). */
  proofIds: string[];
  /** The actor (operator/reviewer/manager) if attributable, else null. */
  actorId: string | null;
  actorRole: string | null;
  recommendedAction: string;
  missingData: string[];
  /** The current governed adjudication status for this exact source, if one exists. */
  currentAdjudicationStatus: string | null;
  /** Whether this finding is adjudicable now (has a per-proof suppression key). */
  adjudicable: boolean;
}

export interface AdjudicationQueueSummary {
  totalItems: number;
  adjudicableItems: number;
  blockedByDataItems: number;
  bySourceType: Record<string, number>;
}

/** The Now-View proof-risk blocks this builder consumes (a subset of the full now-view payload). */
export interface AdjudicationQueueInput {
  reusedProofFindings?: { submitterReuse?: Array<{ actorId: string; count: number; proofIds: string[] }> } | null;
  topGamingSignal?: GamingSignal | null;
  topCredibilityConcern?: CredibilityFinding | null;
  timingEvidence?: { fastCompletion: TimingSignal | null; escalationTiming: TimingSignal | null } | null;
  proofRiskAdjudications?: Array<{ sourceType: string; sourceRef: string; status: string }> | null;
}

const MAX_REFS = 5;

/** Build the owner adjudication queue from the now-view proof-risk blocks. Pure + deterministic. */
export function buildAdjudicationQueue(input: AdjudicationQueueInput): {
  items: AdjudicationQueueItem[];
  summary: AdjudicationQueueSummary;
} {
  const items: AdjudicationQueueItem[] = [];
  const seenRefs = new Set<string>();

  // Current adjudication status per (sourceType, sourceRef) — so the owner sees where a decision stands.
  const statusByRef = new Map<string, string>();
  for (const a of input.proofRiskAdjudications ?? []) {
    statusByRef.set(`${a.sourceType}::${a.sourceRef}`, a.status);
  }
  const statusFor = (sourceType: AdjudicationSourceType, sourceRef: string): string | null =>
    statusByRef.get(`${sourceType}::${sourceRef}`) ?? null;

  const add = (item: Omit<AdjudicationQueueItem, "id" | "currentAdjudicationStatus" | "adjudicable">): void => {
    const key = `${item.sourceType}::${item.sourceRef}`;
    if (seenRefs.has(key)) return; // dedupe (e.g. an active timing signal that is also the top gaming signal)
    seenRefs.add(key);
    items.push({
      ...item,
      id: key,
      currentAdjudicationStatus: statusFor(item.sourceType, item.sourceRef),
      adjudicable: item.sourceCompleteness === "COMPLETE" && item.proofIds.length > 0,
    });
  };

  // 1) Reused-hash findings (deterministic cross-task reuse per submitter).
  for (const s of input.reusedProofFindings?.submitterReuse ?? []) {
    if (!s.actorId || s.count < 1) continue;
    add({
      sourceType: AdjudicationSourceType.REUSED_HASH_FINDING,
      sourceRef: `REUSED_HASH:${s.actorId}`,
      findingType: "REUSED_PROOF",
      title: "Possible reused proof",
      severity: "HIGH",
      sourceCompleteness: "COMPLETE",
      ownerExplanation: "The same proof artifact appears on more than one job for this operator. This needs review — it is not an accusation.",
      supportingProofCount: s.proofIds.length,
      representativeProofRefs: s.proofIds.slice(0, MAX_REFS),
      proofIds: s.proofIds,
      actorId: s.actorId,
      actorRole: "staff",
      recommendedAction: "Require a fresh, job-specific proof for each task, or dismiss if the reuse was legitimate.",
      missingData: [],
    });
  }

  // 2) Top anti-gaming signal (includes active timing signals mapped in by the analytics layer).
  const g = input.topGamingSignal;
  if (g && g.signalType !== "DATA_INSUFFICIENT") {
    const proofIds = g.supportingProofIds ?? [];
    add({
      sourceType: AdjudicationSourceType.ANTI_GAMING_SIGNAL,
      sourceRef: `${g.signalType}:${g.actorId ?? "workspace"}`,
      findingType: g.signalType,
      title: titleForGaming(g.signalType),
      severity: g.severity,
      sourceCompleteness: g.sourceCompleteness ?? (proofIds.length > 0 ? "COMPLETE" : "BLOCKED_BY_DATA"),
      ownerExplanation: g.ownerExplanation,
      supportingProofCount: proofIds.length,
      representativeProofRefs: proofIds.slice(0, MAX_REFS),
      proofIds,
      actorId: g.actorId,
      actorRole: g.actorRole,
      recommendedAction: g.recommendedResponse,
      missingData: g.missingData ?? [],
    });
  }

  // 3) Top credibility concern.
  const c = input.topCredibilityConcern;
  if (c && c.signalType !== "DATA_INSUFFICIENT") {
    const proofIds = c.supportingProofIds ?? [];
    add({
      sourceType: AdjudicationSourceType.CREDIBILITY_CONCERN,
      sourceRef: `${c.signalType}:${c.entityId ?? "workspace"}`,
      findingType: c.signalType,
      title: "Review quality concern",
      severity: c.severity,
      sourceCompleteness: c.sourceCompleteness ?? (proofIds.length > 0 ? "COMPLETE" : "BLOCKED_BY_DATA"),
      ownerExplanation: c.ownerExplanation,
      supportingProofCount: proofIds.length,
      representativeProofRefs: proofIds.slice(0, MAX_REFS),
      proofIds,
      actorId: c.entityId,
      actorRole: c.entityType ?? null,
      recommendedAction: c.recommendedResponse,
      missingData: c.missingData ?? [],
    });
  }

  // 4) Active timing-evidence signals (fast-completion / ignores-escalation) — surfaced directly so
  //    they appear even when they are not the single top gaming signal. Deduped by sourceRef.
  for (const t of [input.timingEvidence?.fastCompletion, input.timingEvidence?.escalationTiming]) {
    if (!t || !isActiveTimingSignal(t)) continue;
    const proofIds = t.supportingProofIds ?? [];
    add({
      sourceType: AdjudicationSourceType.ANTI_GAMING_SIGNAL,
      sourceRef: `${t.signalType}:${t.actorId ?? "workspace"}`,
      findingType: t.signalType,
      title: t.signalType === "SUSPICIOUS_FAST_COMPLETION" ? "Timing concern — fast completion" : "Escalation overdue",
      severity: t.severity,
      sourceCompleteness: t.sourceCompleteness,
      ownerExplanation: t.ownerExplanation,
      supportingProofCount: proofIds.length,
      representativeProofRefs: proofIds.slice(0, MAX_REFS),
      proofIds,
      actorId: t.actorId,
      actorRole: t.actorRole,
      recommendedAction: t.recommendedResponse,
      missingData: t.missingData ?? [],
    });
  }

  // Highest severity first (CRITICAL > HIGH > MEDIUM > LOW), stable otherwise.
  const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  items.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));

  const bySourceType: Record<string, number> = {};
  for (const it of items) bySourceType[it.sourceType] = (bySourceType[it.sourceType] ?? 0) + 1;

  return {
    items,
    summary: {
      totalItems: items.length,
      adjudicableItems: items.filter((i) => i.adjudicable).length,
      blockedByDataItems: items.filter((i) => i.sourceCompleteness === "BLOCKED_BY_DATA").length,
      bySourceType,
    },
  };
}

/** Plain, non-accusatory titles for the anti-gaming signal types. */
function titleForGaming(signalType: string): string {
  switch (signalType) {
    case "SELF_REVIEW_ATTEMPT": return "Self-review — separation of duty";
    case "MANAGER_RUBBER_STAMP": return "Weak proof approved";
    case "REUSED_PROOF_PATTERN": return "Possible reused proof";
    case "REPEATED_WEAK_PROOF": return "Repeated weak proof";
    case "REPEATED_REJECTED_PROOF": return "Repeated rejected proof";
    case "SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN": return "Suspected fake/reused proof — needs review";
    case "TAMPER_SUSPECTED_PROOF_PATTERN": return "Tamper-suspected proof — needs review";
    case "MANAGER_ACCEPTED_SUSPICIOUS_PROOF": return "Suspicious proof accepted — review quality";
    case "REVIEW_QUALITY_CONCERN": return "Review quality concern";
    case "WRONG_OR_INSUFFICIENT_PROOF_PATTERN": return "Wrong or insufficient proof";
    case "SUSPICIOUS_FAST_COMPLETION": return "Timing concern — fast completion";
    case "MANAGER_IGNORES_ESCALATION": return "Escalation overdue";
    case "OWNER_REVIEW_BURDEN_CREATED_BY_STAFF": return "High owner-review load";
    case "LATE_COMPLETION_PATTERN": return "Late completion";
    default: return "Needs review";
  }
}
