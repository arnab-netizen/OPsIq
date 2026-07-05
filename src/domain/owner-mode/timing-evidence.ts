/**
 * Completion / Escalation Timing Evidence (depth pass).
 *
 * Produces two risk signals that were previously BLOCKED_BY_DATA because no timing source was
 * persisted:
 *   • SUSPICIOUS_FAST_COMPLETION — a job's proof is submitted implausibly faster than the observed
 *     baseline for that proof type, repeated by the same operator.
 *   • MANAGER_IGNORES_ESCALATION — an assigned manager/owner leaves escalations unacknowledged past
 *     their due time (or acknowledged-but-unresolved past a resolution window), repeatedly.
 *
 * PURE and deterministic. It consumes trusted, server-set timestamps only (Proof.workStartedAt +
 * Proof.submittedAt; Escalation.dueAt / acknowledgedAt / resolvedAt). It NEVER:
 *   • fabricates a completion timestamp or a duration baseline (null timing → TIMING_MISSING; thin
 *     history → BASELINE_MISSING; both fail-visible, never a made-up number),
 *   • infers completion time from user-supplied text,
 *   • accuses fraud / theft / negligence, or
 *   • holds a hidden score (every signal carries its reason codes + the exact evidence refs).
 *
 * A single fast completion or one overdue escalation is a WARNING, not a "pattern": the *_PATTERN
 * statuses require repetition. The duration baseline is DERIVED from the workspace's own observed,
 * accepted completions for the same proof type (baselineSource / baselineConfidence are reported),
 * so it adapts to the real business and is never an invented constant.
 */

export type FastCompletionStatus =
  | "NO_SIGNAL"
  | "TIMING_MISSING"
  | "BASELINE_MISSING"
  | "FAST_COMPLETION_WARNING"
  | "SUSPICIOUS_FAST_COMPLETION_PATTERN"
  | "DATA_INSUFFICIENT";

export type EscalationTimingStatus =
  | "NO_SIGNAL"
  | "ESCALATION_TIMING_MISSING"
  | "NO_MANAGER_ASSIGNMENT"
  | "ESCALATION_ACK_OVERDUE"
  | "ESCALATION_RESOLUTION_OVERDUE"
  | "MANAGER_IGNORES_ESCALATION_PATTERN"
  | "DATA_INSUFFICIENT";

export type TimingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type TimingConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";
export type BaselineConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

/** One concrete, auditable timing measurement backing a signal — never a hidden number. */
export interface TimingEvidenceItem {
  /** The proof id (fast-completion) or escalation id (ignored-escalation) this measurement is from. */
  ref: string;
  /** The trusted measured duration in ms (work→submit, or created→now/ack). Null when not measurable. */
  measuredMs: number | null;
  /** The comparison baseline in ms, when one applies (fast-completion). */
  baselineMs?: number | null;
  note: string;
}

/**
 * The full, owner-visible timing signal. Sixteen governed fields: workspaceId, signalType, status,
 * actorId, actorRole, severity, confidence, reasonCodes, timingEvidence, baselineSource,
 * baselineConfidence, patternCount, supportingProofIds, sourceCompleteness, missingData,
 * ownerExplanation (+ businessImpact / recommendedResponse / ownerActionRequired / evaluatedAt for
 * the owner surface). `supportingProofIds` doubles as the adjudication-suppression key.
 */
export interface TimingSignal {
  workspaceId: string;
  signalType: "SUSPICIOUS_FAST_COMPLETION" | "MANAGER_IGNORES_ESCALATION";
  status: FastCompletionStatus | EscalationTimingStatus;
  actorId: string | null;
  actorRole: string | null;
  severity: TimingSeverity;
  confidence: TimingConfidence;
  reasonCodes: string[];
  timingEvidence: TimingEvidenceItem[];
  /** Where the comparison baseline came from (e.g. observed accepted history), or null when none. */
  baselineSource: string | null;
  baselineConfidence: BaselineConfidence;
  patternCount: number;
  /**
   * The exact ids backing the signal (proof ids for fast-completion; escalation ids for
   * ignored-escalation). Used to fairly adjudication-suppress the signal — clearing exactly these
   * ids suppresses it, and a new backing id re-surfaces it. Empty when the source is not persisted
   * (then the signal is fail-visible and never suppressed).
   */
  supportingProofIds: string[];
  sourceCompleteness: "COMPLETE" | "PARTIAL" | "BLOCKED_BY_DATA";
  missingData: string[];
  ownerExplanation: string;
  businessImpact: string;
  recommendedResponse: string;
  ownerActionRequired: boolean;
  evaluatedAt: string;
}

// ── Fast-completion tuning (conservative, warning-first) ────────────────────────
/** A completion is "fast" only if it took under this fraction of the observed baseline. */
const FAST_RATIO = 0.2;
/** Baselines from fewer accepted samples than this are not trusted → BASELINE_MISSING. */
const MIN_BASELINE_SAMPLES = 3;
/** Repetition needed before a warning becomes a "pattern". */
const FAST_PATTERN_THRESHOLD = 2;
/** Ignore sub-second / non-positive durations (clock artefacts) — never flag them. */
const MIN_MEASURABLE_MS = 1_000;

/** A single proof row's timing fields for the fast-completion evaluator. */
export interface CompletionTimingRow {
  proofId: string;
  submittedByUserId: string | null;
  role?: string | null;
  proofType: string;
  status: string;
  /** Server-trusted work-start time (Proof.workStartedAt). Null on legacy rows. */
  workStartedAt: Date | null;
  /** Server-trusted completion-claim time (Proof.submittedAt). Null until submitted. */
  submittedAt: Date | null;
}

const ACCEPTED_FOR_BASELINE = new Set(["ACCEPTED", "OVERRIDDEN_NOT_VERIFIED"]);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function baselineConfidenceForCount(n: number): BaselineConfidence {
  if (n >= 8) return "HIGH";
  if (n >= 5) return "MEDIUM";
  if (n >= MIN_BASELINE_SAMPLES) return "LOW";
  return "NONE";
}

function measuredDurationMs(row: CompletionTimingRow): number | null {
  if (!row.workStartedAt || !row.submittedAt) return null;
  const ms = row.submittedAt.getTime() - row.workStartedAt.getTime();
  return ms >= MIN_MEASURABLE_MS ? ms : null;
}

export interface FastCompletionInput {
  workspaceId: string;
  rows: CompletionTimingRow[];
  evaluatedAt: string; // ISO
}

/**
 * Evaluate the fast-completion signal. Baseline = median of the workspace's own accepted-proof
 * durations for the SAME proof type (data-derived, never invented). A completion is "fast" only when
 * it beats the baseline by the FAST_RATIO margin AND that baseline is trusted (≥ MIN_BASELINE_SAMPLES).
 */
export function evaluateFastCompletion(input: FastCompletionInput): TimingSignal {
  const base = (status: FastCompletionStatus, extra: Partial<TimingSignal>): TimingSignal => ({
    workspaceId: input.workspaceId, signalType: "SUSPICIOUS_FAST_COMPLETION", status,
    actorId: null, actorRole: null, severity: "LOW", confidence: "NEEDS_DATA", reasonCodes: [],
    timingEvidence: [], baselineSource: null, baselineConfidence: "NONE", patternCount: 0,
    supportingProofIds: [], sourceCompleteness: "BLOCKED_BY_DATA", missingData: [],
    ownerExplanation: "", businessImpact: "", recommendedResponse: "", ownerActionRequired: false,
    evaluatedAt: input.evaluatedAt, ...extra,
  });

  if (input.rows.length === 0) {
    return base("DATA_INSUFFICIENT", {
      reasonCodes: ["NO_PROOF_ROWS"], missingData: ["no proof rows to evaluate completion timing"],
      ownerExplanation: "No proof activity yet — completion speed cannot be judged.",
      businessImpact: "None identified; keep collecting proof events.",
      recommendedResponse: "Accumulate proof submissions with a recorded work-start time.",
    });
  }

  // Trusted measured durations (needs BOTH workStartedAt and submittedAt).
  const measured = input.rows
    .map((r) => ({ row: r, ms: measuredDurationMs(r) }))
    .filter((m): m is { row: CompletionTimingRow; ms: number } => m.ms !== null);

  if (measured.length === 0) {
    return base("TIMING_MISSING", {
      sourceCompleteness: "BLOCKED_BY_DATA", reasonCodes: ["NO_TRUSTED_COMPLETION_TIMING"],
      missingData: ["no proof has both a trusted work-start and submitted time — cannot measure completion duration"],
      ownerExplanation: "OpsIQ cannot yet judge suspiciously fast work because no job has both a recorded start time and a submit time. It will not guess a duration.",
      businessImpact: "Fast-completion gaming stays invisible until work-start timing is captured.",
      recommendedResponse: "Record a work-start time when a job is dispatched so completion speed can be measured against the real baseline.",
    });
  }

  // Per-proof-type baseline from ACCEPTED durations only (an accepted job is a trustworthy sample).
  const acceptedByType = new Map<string, number[]>();
  for (const m of measured) {
    if (ACCEPTED_FOR_BASELINE.has(m.row.status)) {
      const arr = acceptedByType.get(m.row.proofType) ?? [];
      arr.push(m.ms);
      acceptedByType.set(m.row.proofType, arr);
    }
  }
  const baselineByType = new Map<string, { ms: number; n: number }>();
  for (const [type, arr] of acceptedByType) {
    if (arr.length >= MIN_BASELINE_SAMPLES) baselineByType.set(type, { ms: median(arr), n: arr.length });
  }

  if (baselineByType.size === 0) {
    return base("BASELINE_MISSING", {
      sourceCompleteness: "BLOCKED_BY_DATA", confidence: "NEEDS_DATA", reasonCodes: ["NO_TRUSTED_DURATION_BASELINE"],
      missingData: [`fewer than ${MIN_BASELINE_SAMPLES} accepted, timed completions for any proof type — no trusted baseline to compare against`],
      ownerExplanation: "There is completion timing, but not enough accepted history to know how long each job type normally takes. OpsIQ will not invent a baseline.",
      businessImpact: "Fast-completion cannot be judged fairly without a real per-job baseline.",
      recommendedResponse: `Accumulate at least ${MIN_BASELINE_SAMPLES} accepted, timed completions per job type to establish a baseline.`,
    });
  }

  // Flag fast completions against the trusted per-type baseline, attribute to the submitter.
  interface Fast { proofId: string; actorId: string; role?: string | null; ms: number; baselineMs: number; proofType: string }
  const fasts: Fast[] = [];
  for (const m of measured) {
    const b = baselineByType.get(m.row.proofType);
    if (!b || !m.row.submittedByUserId) continue;
    if (m.ms < b.ms * FAST_RATIO) {
      fasts.push({ proofId: m.row.proofId, actorId: m.row.submittedByUserId, role: m.row.role, ms: m.ms, baselineMs: b.ms, proofType: m.row.proofType });
    }
  }

  if (fasts.length === 0) {
    const bestType = [...baselineByType.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    return base("NO_SIGNAL", {
      severity: "LOW", confidence: "MEDIUM", sourceCompleteness: "COMPLETE",
      reasonCodes: ["NO_FAST_COMPLETION_ABOVE_THRESHOLD"], baselineSource: `OBSERVED_ACCEPTED_HISTORY(proofType=${bestType[0]})`,
      baselineConfidence: baselineConfidenceForCount(bestType[1].n),
      ownerExplanation: "No job was completed suspiciously faster than the normal time for its type.",
      businessImpact: "No fast-completion gaming detected in the current data.",
      recommendedResponse: "No action needed; the baseline keeps adapting as more jobs complete.",
    });
  }

  // Group by actor; a single fast job is a warning, repetition is a pattern.
  const byActor = new Map<string, Fast[]>();
  for (const f of fasts) {
    const arr = byActor.get(f.actorId) ?? [];
    arr.push(f);
    byActor.set(f.actorId, arr);
  }
  const [actorId, actorFasts] = [...byActor.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const repeated = actorFasts.length >= FAST_PATTERN_THRESHOLD;
  const evidence: TimingEvidenceItem[] = actorFasts.slice(0, 10).map((f) => ({
    ref: f.proofId, measuredMs: f.ms, baselineMs: f.baselineMs,
    note: `completed in ${Math.round(f.ms / 60000)} min vs baseline ${Math.round(f.baselineMs / 60000)} min (${f.proofType})`,
  }));
  const bMs = actorFasts[0].baselineMs;
  const bType = actorFasts[0].proofType;
  const bMeta = baselineByType.get(bType)!;

  return base(repeated ? "SUSPICIOUS_FAST_COMPLETION_PATTERN" : "FAST_COMPLETION_WARNING", {
    actorId, actorRole: actorFasts[0].role ?? "staff",
    severity: repeated ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
    reasonCodes: [repeated ? "REPEATED_FAST_COMPLETION_BELOW_BASELINE" : "SINGLE_FAST_COMPLETION_WARNING"],
    timingEvidence: evidence, patternCount: actorFasts.length,
    baselineSource: `OBSERVED_ACCEPTED_HISTORY(proofType=${bType}, median=${Math.round(bMs / 60000)}min)`,
    baselineConfidence: baselineConfidenceForCount(bMeta.n),
    supportingProofIds: actorFasts.map((f) => f.proofId),
    sourceCompleteness: "COMPLETE", missingData: [],
    ownerExplanation: repeated
      ? "This operator repeatedly submits proof far faster than the job type normally takes — the work may not actually be getting done in that time. This is not an accusation; it needs owner review."
      : "This operator submitted a job far faster than that job type normally takes — a single warning to review, not yet a pattern.",
    businessImpact: "Implausibly fast completion can mean corners cut or work marked done without being done — surfacing later as complaints or rework.",
    recommendedResponse: repeated
      ? "Owner-review these jobs against their proof; confirm they were genuinely completed before relying on them. Coach or adjust the process; do not accuse without adjudication."
      : "Spot-check this job's proof to confirm the work was genuinely completed in that time.",
    ownerActionRequired: repeated,
  });
}

// ── Escalation-timing tuning ────────────────────────────────────────────────────
/** Resolution windows (minutes) by escalation severity — an acknowledged escalation left unresolved
 *  beyond this is being sat on. Conservative (well beyond the ack SLA). */
const RESOLUTION_WINDOW_MIN: Record<string, number | null> = {
  CRITICAL_OWNER_NOW: 60, HIGH: 240, MEDIUM: 1440, LOW: 4320, INFO: null,
};
/** Repetition needed before ignored escalations become a "pattern". */
const IGNORE_PATTERN_THRESHOLD = 2;

const OPEN_UNACKED = new Set(["OPEN"]);
const ACKED_UNRESOLVED = new Set(["ACKNOWLEDGED", "IN_REVIEW"]);

/** A single escalation row's trusted timing for the ignored-escalation evaluator. */
export interface EscalationTimingRow {
  escalationId: string;
  /** The assigned owner/manager target (id or role). Null → cannot attribute an "ignore". */
  assignedTarget: string | null;
  severity: string;
  status: string;
  createdAt: Date;
  dueAt: Date | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
}

export interface EscalationTimingInput {
  workspaceId: string;
  rows: EscalationTimingRow[];
  nowMs: number;
  evaluatedAt: string; // ISO
}

/**
 * Evaluate the manager-ignores-escalation signal from trusted escalation timing. An escalation is
 * "ack-overdue" when it is still OPEN (never acknowledged) past its dueAt; "resolution-overdue" when
 * acknowledged/in-review but unresolved past the severity resolution window. Repeated ack-overdue
 * escalations against the same assigned target become a pattern. Missing dueAt → TIMING_MISSING;
 * missing assignment → NO_MANAGER_ASSIGNMENT (both fail-visible, never fabricated).
 */
export function evaluateEscalationTiming(input: EscalationTimingInput): TimingSignal {
  const base = (status: EscalationTimingStatus, extra: Partial<TimingSignal>): TimingSignal => ({
    workspaceId: input.workspaceId, signalType: "MANAGER_IGNORES_ESCALATION", status,
    actorId: null, actorRole: null, severity: "LOW", confidence: "NEEDS_DATA", reasonCodes: [],
    timingEvidence: [], baselineSource: null, baselineConfidence: "NONE", patternCount: 0,
    supportingProofIds: [], sourceCompleteness: "BLOCKED_BY_DATA", missingData: [],
    ownerExplanation: "", businessImpact: "", recommendedResponse: "", ownerActionRequired: false,
    evaluatedAt: input.evaluatedAt, ...extra,
  });

  // Only escalations still needing action (unresolved) can be "ignored".
  const openRows = input.rows.filter((r) => r.status !== "RESOLVED" && !r.resolvedAt);
  if (input.rows.length === 0) {
    return base("DATA_INSUFFICIENT", {
      reasonCodes: ["NO_ESCALATIONS"], missingData: ["no escalations to evaluate"],
      ownerExplanation: "No escalations raised — there is nothing for a manager to have ignored.",
      businessImpact: "None identified.",
      recommendedResponse: "No action needed.",
    });
  }
  if (openRows.length === 0) {
    return base("NO_SIGNAL", {
      severity: "LOW", confidence: "MEDIUM", sourceCompleteness: "COMPLETE",
      reasonCodes: ["ALL_ESCALATIONS_RESOLVED"],
      ownerExplanation: "Every raised escalation has been resolved — none are being ignored.",
      businessImpact: "Escalations are being handled.",
      recommendedResponse: "No action needed.",
    });
  }

  // No open escalation carries a dueAt → the ack SLA timing was never persisted.
  if (openRows.every((r) => r.dueAt === null)) {
    return base("ESCALATION_TIMING_MISSING", {
      sourceCompleteness: "BLOCKED_BY_DATA", reasonCodes: ["NO_ESCALATION_DUE_TIMING"],
      missingData: ["open escalations have no due time — cannot tell whether acknowledgement is overdue"],
      ownerExplanation: "OpsIQ cannot yet tell if escalations are being ignored because none carry a response deadline. It will not guess one.",
      businessImpact: "Ignored escalations stay invisible until response timing is captured.",
      recommendedResponse: "Record a response-due time when an escalation is raised so overdue acknowledgement can be measured.",
    });
  }

  const now = input.nowMs;
  const ackOverdue = openRows.filter(
    (r) => OPEN_UNACKED.has(r.status) && !r.acknowledgedAt && r.dueAt !== null && now > r.dueAt.getTime()
  );
  const resolutionOverdue = openRows.filter((r) => {
    if (!ACKED_UNRESOLVED.has(r.status)) return false;
    const windowMin = RESOLUTION_WINDOW_MIN[r.severity] ?? RESOLUTION_WINDOW_MIN.MEDIUM!;
    if (windowMin === null) return false;
    const since = (r.acknowledgedAt ?? r.createdAt).getTime();
    return now - since > windowMin * 60_000;
  });

  // Overdue escalations with no assigned target → cannot fairly attribute an "ignore".
  const overdueUnassigned = [...ackOverdue, ...resolutionOverdue].filter((r) => !r.assignedTarget);
  const attributableAck = ackOverdue.filter((r) => r.assignedTarget);
  const attributableRes = resolutionOverdue.filter((r) => r.assignedTarget);

  if (attributableAck.length === 0 && attributableRes.length === 0) {
    if (overdueUnassigned.length > 0) {
      return base("NO_MANAGER_ASSIGNMENT", {
        sourceCompleteness: "PARTIAL", severity: "MEDIUM", confidence: "LOW",
        reasonCodes: ["OVERDUE_ESCALATION_WITHOUT_ASSIGNED_MANAGER"],
        timingEvidence: overdueUnassigned.slice(0, 10).map((r) => ({
          ref: r.escalationId, measuredMs: r.dueAt ? now - r.dueAt.getTime() : null,
          note: `${r.severity} escalation overdue with no assigned manager`,
        })),
        patternCount: overdueUnassigned.length,
        missingData: ["overdue escalation(s) have no assigned manager/owner — cannot attribute who ignored them"],
        ownerExplanation: "Escalations are overdue but none name a responsible manager, so OpsIQ cannot say who ignored them. Assign an owner/manager to each escalation.",
        businessImpact: "Unassigned escalations fall through the cracks — no one is accountable for the response.",
        recommendedResponse: "Route every escalation to a named manager/owner so accountability is clear.",
        ownerActionRequired: true,
      });
    }
    return base("NO_SIGNAL", {
      severity: "LOW", confidence: "MEDIUM", sourceCompleteness: "COMPLETE",
      reasonCodes: ["NO_OVERDUE_ESCALATION"],
      ownerExplanation: "No escalation is overdue for acknowledgement or resolution — nothing is being ignored.",
      businessImpact: "Escalations are being acknowledged in time.",
      recommendedResponse: "No action needed.",
    });
  }

  // Attribute per assigned target; the worst offender surfaces. Ack-overdue is the stronger "ignore".
  const byTarget = new Map<string, { ack: EscalationTimingRow[]; res: EscalationTimingRow[] }>();
  for (const r of attributableAck) {
    const t = byTarget.get(r.assignedTarget!) ?? { ack: [], res: [] };
    t.ack.push(r); byTarget.set(r.assignedTarget!, t);
  }
  for (const r of attributableRes) {
    const t = byTarget.get(r.assignedTarget!) ?? { ack: [], res: [] };
    t.res.push(r); byTarget.set(r.assignedTarget!, t);
  }
  const [target, t] = [...byTarget.entries()].sort(
    (a, b) => (b[1].ack.length + b[1].res.length) - (a[1].ack.length + a[1].res.length)
  )[0];
  const ignoredCount = t.ack.length;
  const repeated = ignoredCount >= IGNORE_PATTERN_THRESHOLD;
  const primaryAck = t.ack.length > 0;
  const rows = primaryAck ? t.ack : t.res;
  const evidence: TimingEvidenceItem[] = rows.slice(0, 10).map((r) => ({
    ref: r.escalationId,
    measuredMs: primaryAck && r.dueAt ? now - r.dueAt.getTime() : now - (r.acknowledgedAt ?? r.createdAt).getTime(),
    note: primaryAck
      ? `${r.severity} escalation unacknowledged ${Math.round((now - (r.dueAt ?? r.createdAt).getTime()) / 3600000)}h past due`
      : `${r.severity} escalation acknowledged but unresolved for ${Math.round((now - (r.acknowledgedAt ?? r.createdAt).getTime()) / 3600000)}h`,
  }));

  const status: EscalationTimingStatus = repeated
    ? "MANAGER_IGNORES_ESCALATION_PATTERN"
    : primaryAck ? "ESCALATION_ACK_OVERDUE" : "ESCALATION_RESOLUTION_OVERDUE";

  return base(status, {
    actorId: target, actorRole: "manager",
    severity: repeated ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
    reasonCodes: [
      repeated ? "REPEATED_UNACKNOWLEDGED_ESCALATION" : primaryAck ? "ESCALATION_ACKNOWLEDGEMENT_OVERDUE" : "ESCALATION_RESOLUTION_OVERDUE",
    ],
    timingEvidence: evidence,
    patternCount: t.ack.length + t.res.length,
    supportingProofIds: rows.map((r) => r.escalationId),
    sourceCompleteness: "COMPLETE", missingData: [],
    ownerExplanation: repeated
      ? "This manager repeatedly leaves raised escalations unacknowledged past their response deadline — staff blockers are not being answered. This needs owner attention; it is not an accusation."
      : primaryAck
        ? "A raised escalation has gone unacknowledged past its response deadline — a staff blocker is waiting on a manager."
        : "A manager acknowledged an escalation but has not resolved it within the expected window.",
    businessImpact: "Ignored escalations mean staff blockers, complaints, and risks sit unhandled — the exact failures escalations exist to prevent.",
    recommendedResponse: repeated
      ? "Reassign these escalations, set a hard acknowledgement SLA, and review this manager's escalation handling with them directly."
      : primaryAck
        ? "Acknowledge and action this escalation now, or reassign it to someone who can."
        : "Push this acknowledged escalation to resolution or reassign it.",
    ownerActionRequired: repeated,
  });
}

/** Whether a timing signal is an ACTIVE risk (a warning/pattern/overdue) vs an informational/blocked
 *  status. Only active signals are surfaced as gaming signals; blocked ones stay fail-visible context. */
export function isActiveTimingSignal(sig: TimingSignal): boolean {
  return (
    sig.status === "FAST_COMPLETION_WARNING" ||
    sig.status === "SUSPICIOUS_FAST_COMPLETION_PATTERN" ||
    sig.status === "ESCALATION_ACK_OVERDUE" ||
    sig.status === "ESCALATION_RESOLUTION_OVERDUE" ||
    sig.status === "MANAGER_IGNORES_ESCALATION_PATTERN"
  );
}
