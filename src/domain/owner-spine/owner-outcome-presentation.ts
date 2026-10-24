/**
 * Owner outcome timeline — PRESENTATION only (pure, no I/O).
 *
 * Maps the persisted outcome facts (owner_decision_records + owner_outcome_assessments, read through the existing
 * chain read model) to plain owner language and to an ordered list of stages. It adds no business semantics: every
 * conclusion shown here was derived by `assessOwnerOutcome()` and stored by the outcome spine; nothing is recomputed,
 * promoted or softened. Wording is deliberately conservative:
 *   - an improvement after a recommendation is never "it worked" or "it caused";
 *   - a reached target is never "solved" (only the persisted issue resolution says that);
 *   - "possible contribution" is never "caused" or "proven";
 *   - "not assessed" is never "no relationship";
 *   - unknown is never zero.
 */
import type {
  OutcomeCausalAttribution,
  OutcomeExecutionStatus,
  OutcomeIssueResolution,
  OutcomeLearningEligibility,
  OutcomeMeasurementResult,
  OutcomeObservationStatus,
  OutcomeTargetAttainment,
} from "./owner-outcome-policy";
import { parseOwnerCandidateId, type OwnerDecisionState } from "./owner-decision-record";

// ── Wire shapes (the JSON the chain APIs return; dates arrive as ISO strings) ─────────────────────────────────────

export interface OwnerDecisionRecordDto {
  id: string;
  candidateId: string;
  candidateSource: string;
  domain: string;
  decisionState: OwnerDecisionState;
  sequence: number;
  supersedesId: string | null;
  decidedAt: string;
  ownerReason: string | null;
  revisitAt: string | null;
  recommendationSnapshot: Record<string, unknown> | null;
  commitmentDescription: string | null;
  verificationMetric: string | null;
  baselineValue: number | null;
  baselineProvenance: string | null;
  targetDirection: string | null;
  targetValue: number | null;
  observationWindowDays: number | null;
  intendedCompletionAt: string | null;
  expectedMeasurementSource: string | null;
}

export interface OwnerOutcomeAssessmentDto {
  id: string;
  chainKey: string;
  version: number;
  ownerDecisionId: string | null;
  ownerDecisionState: string | null;
  commitmentFidelity: string;
  decisionLinkState: string;
  sourceSystem: string;
  sourceLinkState: string;
  assessedAt: string;
  executionStatus: OutcomeExecutionStatus;
  observationStatus: OutcomeObservationStatus;
  measurementResult: OutcomeMeasurementResult;
  targetAttainment: OutcomeTargetAttainment;
  issueResolution: OutcomeIssueResolution;
  causalAttribution: OutcomeCausalAttribution;
  learningEligibility: OutcomeLearningEligibility;
  verificationStatus: string;
  evidenceQuality: string;
  verifierKind: string;
  independentlyVerified: boolean;
  selfVerified: boolean;
  disputed: boolean;
  externalInterference: boolean;
  measuredAt: string | null;
  verifiedAt: string | null;
  learningBlockers: string[];
  nextVerificationAction: string;
}

export interface OwnerOutcomeChainDto {
  chainKey: string;
  businessId: string;
  decisions: OwnerDecisionRecordDto[];
  currentDecision: OwnerDecisionRecordDto | null;
  commitment: {
    decisionState: string | null;
    recommendationSnapshot: unknown;
    ownerCommitmentDescription: string | null;
    followsRecommendedAction: boolean | null;
  } | null;
  assessments: OwnerOutcomeAssessmentDto[];
  currentAssessment: OwnerOutcomeAssessmentDto | null;
}

// ── Candidate trackability (deterministic: persisted ids only, never text) ───────────────────────────────────────

export type TrackabilityVerdict =
  | { trackable: true; source: "domain_action" | "compliance_item"; domain: string }
  | { trackable: false; reason: string };

/** The classes of canonical candidate id the owner-decision builders emit that have NO persisted, business-attributable row to decide on. */
const UNTRACKABLE_CLASS_REASON: Readonly<Record<string, string>> = {
  business_risk: "Business risk entries are not tied to one business, so they cannot start an outcome trail.",
  survival_reading: "A cash-survival reading is a measurement, not an action you can commit to.",
  evidence_refresh: "A request to refresh your figures is not an action with an outcome to measure.",
  safety_gate: "A safety hold is a rule, not an action with an outcome to measure.",
};
export const UNTRACKABLE_CANDIDATE_CLASSES: readonly string[] = Object.keys(UNTRACKABLE_CLASS_REASON);

export const OUTCOME_TRACKING_UNAVAILABLE_COPY = "Outcome tracking is not available for this recommendation yet.";

/** Decide trackability from the candidate id ONLY, with the same parser the server enforces — never from titles, copy, metrics or time. */
export function candidateTrackability(candidateId: string): TrackabilityVerdict {
  const parsed = parseOwnerCandidateId(candidateId);
  if (parsed) return { trackable: true, source: parsed.source, domain: parsed.domain };
  const cls = candidateId.split(":")[0] ?? "";
  return { trackable: false, reason: UNTRACKABLE_CLASS_REASON[cls] ?? "This recommendation has no persisted action to attach an outcome trail to." };
}

// ── Decision labels (owner language first, persisted state always visible) ───────────────────────────────────────

export interface DecisionLabel { choice: string; state: string; past: string; blurb: string }
export const DECISION_LABELS: Readonly<Record<OwnerDecisionState, DecisionLabel>> = {
  ACCEPTED: { choice: "I'll do this", state: "Accepted", past: "You decided to do this", blurb: "You commit to the action OpsIQ recommended." },
  MODIFIED: { choice: "I'll do something different", state: "Modified", past: "You decided to do something different", blurb: "You commit to your own action instead of the recommended one." },
  DEFERRED: { choice: "Not now", state: "Deferred", past: "You decided to wait", blurb: "You are not committing yet. You can set a date to revisit it." },
  REJECTED: { choice: "I won't do this", state: "Rejected", past: "You decided not to do this", blurb: "You are not doing this. Nothing will be measured for it." },
};
export const DECISION_CHOICE_ORDER: readonly OwnerDecisionState[] = ["ACCEPTED", "MODIFIED", "DEFERRED", "REJECTED"];

/** True when the decision commits the owner to an action (the only states that can carry a contract or be measured). */
export function decisionCommits(state: OwnerDecisionState | string | null | undefined): boolean {
  return state === "ACCEPTED" || state === "MODIFIED";
}

// ── Status presentation ──────────────────────────────────────────────────────────────────────────────────────────

export type StatusTone = "neutral" | "pending" | "good" | "caution" | "bad";
export interface StatusView {
  /** Plain owner wording — the primary text. */
  label: string;
  tone: StatusTone;
  /** The persisted enum value, shown as secondary detail so the underlying truth is never hidden. */
  code: string;
  /** A caveat that must stay visible next to this status (never hover-only). */
  caveat?: string;
}
const s = (code: string, label: string, tone: StatusTone, caveat?: string): StatusView => ({ code, label, tone, ...(caveat ? { caveat } : {}) });

export const EXECUTION_VIEW: Readonly<Record<OutcomeExecutionStatus, StatusView>> = {
  NOT_STARTED: s("NOT_STARTED", "Not started", "pending"),
  IN_PROGRESS: s("IN_PROGRESS", "In progress", "pending"),
  BLOCKED: s("BLOCKED", "Blocked", "caution"),
  COMPLETED: s("COMPLETED", "Completed", "good"),
  CANCELLED: s("CANCELLED", "Cancelled", "neutral"),
};
export const OBSERVATION_VIEW: Readonly<Record<OutcomeObservationStatus, StatusView>> = {
  NOT_STARTED: s("NOT_STARTED", "Not started", "pending"),
  WINDOW_OPEN: s("WINDOW_OPEN", "Waiting for enough time or data", "pending"),
  READY_TO_MEASURE: s("READY_TO_MEASURE", "Ready to measure", "pending"),
  MISSING_AFTER_EVIDENCE: s("MISSING_AFTER_EVIDENCE", "Needs follow-up data", "caution"),
  MEASURED: s("MEASURED", "Measured", "good"),
};
export const IMPROVEMENT_CAVEAT = "A change after you acted does not by itself show that your action made the difference.";
export const MEASUREMENT_VIEW: Readonly<Record<OutcomeMeasurementResult, StatusView>> = {
  IMPROVED: s("IMPROVED", "Improved", "good", IMPROVEMENT_CAVEAT),
  UNCHANGED: s("UNCHANGED", "No material change", "neutral"),
  WORSENED: s("WORSENED", "Worsened", "bad"),
  CHANGED_DIRECTION_UNKNOWN: s("CHANGED_DIRECTION_UNKNOWN", "Changed, but no direction was set to judge it", "caution", "Without a stated direction, OpsIQ cannot say whether the change is better or worse."),
  NOT_MEASURABLE: s("NOT_MEASURABLE", "Not measurable yet", "pending"),
  DISPUTED: s("DISPUTED", "Result disputed", "caution"),
  EXTERNALLY_CONFOUNDED: s("EXTERNALLY_CONFOUNDED", "Outside events affected the result", "caution"),
};
export const TARGET_REACHED_CAVEAT = "Reaching the target does not by itself mean the original problem is resolved.";
export const TARGET_VIEW: Readonly<Record<OutcomeTargetAttainment, StatusView>> = {
  REACHED: s("REACHED", "Target reached", "good", TARGET_REACHED_CAVEAT),
  NOT_REACHED: s("NOT_REACHED", "Target not reached", "caution"),
  NO_TARGET: s("NO_TARGET", "No target was set", "neutral"),
  UNKNOWN: s("UNKNOWN", "Not known yet", "pending"),
};
export const ISSUE_VIEW: Readonly<Record<OutcomeIssueResolution, StatusView>> = {
  RESOLVED: s("RESOLVED", "Resolved in a newer diagnosis", "good"),
  STILL_OPEN: s("STILL_OPEN", "Still open", "caution"),
  WORSENED: s("WORSENED", "Got worse", "bad"),
  NOT_YET_REASSESSED: s("NOT_YET_REASSESSED", "Needs a newer diagnosis", "pending", "OpsIQ only calls an issue resolved after a newer, complete diagnosis shows it."),
  INCONCLUSIVE: s("INCONCLUSIVE", "Inconclusive", "neutral"),
};
export const ATTRIBUTION_CAVEAT = "OpsIQ can say a contribution is possible. It cannot show that your action was the reason for the result.";
export const ATTRIBUTION_VIEW: Readonly<Record<OutcomeCausalAttribution, StatusView>> = {
  NOT_ASSESSED: s("NOT_ASSESSED", "Not assessed", "pending", "Not assessed means OpsIQ has not looked at this yet. It is not a finding either way."),
  PLAUSIBLE: s("PLAUSIBLE", "Possible contribution", "neutral", ATTRIBUTION_CAVEAT),
  CONFOUNDED: s("CONFOUNDED", "Other factors affected the result", "caution"),
  DISPUTED: s("DISPUTED", "Result disputed", "caution"),
  INSUFFICIENT_EVIDENCE: s("INSUFFICIENT_EVIDENCE", "Not enough evidence to say", "pending"),
};
export const LEARNING_VIEW: Readonly<Record<OutcomeLearningEligibility, StatusView>> = {
  ELIGIBLE_CONFIRMED_BY_GATE: s("ELIGIBLE_CONFIRMED_BY_GATE", "OpsIQ's learning check allows learning from this", "good"),
  PENDING_GOVERNANCE: s("PENDING_GOVERNANCE", "Waiting for review before OpsIQ can learn from it", "pending"),
  NOT_ELIGIBLE: s("NOT_ELIGIBLE", "Not eligible to learn from", "neutral"),
  NO_LEARNING_LOOP: s("NO_LEARNING_LOOP", "OpsIQ does not learn from this kind of action", "neutral"),
};

/** Unknown persisted values (a future policy version) are shown verbatim — never mapped to a stronger or friendlier claim. */
function lookup<T extends string>(table: Readonly<Record<T, StatusView>>, code: string): StatusView {
  return (table as Record<string, StatusView>)[code] ?? s(code, code, "neutral");
}
export const executionView = (c: string): StatusView => lookup(EXECUTION_VIEW, c);
export const observationView = (c: string): StatusView => lookup(OBSERVATION_VIEW, c);
export const measurementView = (c: string): StatusView => lookup(MEASUREMENT_VIEW, c);
export const targetView = (c: string): StatusView => lookup(TARGET_VIEW, c);
export const issueView = (c: string): StatusView => lookup(ISSUE_VIEW, c);
export const attributionView = (c: string): StatusView => lookup(ATTRIBUTION_VIEW, c);
export const learningView = (c: string): StatusView => lookup(LEARNING_VIEW, c);

// ── Contract display (unknown ≠ zero; no target ≠ target 0) ───────────────────────────────────────────────────────

export const BASELINE_PROVENANCE_LABEL: Readonly<Record<string, string>> = {
  MEASURED: "measured by OpsIQ",
  OWNER_REPORTED: "reported by you",
  EXTERNAL_SOURCE: "from an outside source",
  UNKNOWN: "source unknown",
};
export const DIRECTION_LABEL: Readonly<Record<string, string>> = { up: "Higher is better", down: "Lower is better", unknown: "Direction not specified" };
export const MEASUREMENT_SOURCE_LABEL: Readonly<Record<string, string>> = {
  AUTHORITATIVE_SNAPSHOT: "an authoritative snapshot",
  SYSTEM_MEASUREMENT: "OpsIQ's own measurement",
  EXTERNAL_RECORD: "an outside record",
  OWNER_ENTERED: "figures you enter",
};

/** `null` is "not set / unknown"; a real 0 is shown as 0. */
export function formatKnownNumber(v: number | null | undefined): string {
  return v === null || v === undefined ? "Not set" : String(v);
}

export interface ContractLine { label: string; value: string }
/** The owner's commitment as recorded, line by line, with unknown shown as unknown. Only meaningful for ACCEPTED / MODIFIED. */
export function contractLines(d: OwnerDecisionRecordDto): ContractLine[] {
  const baseline = d.baselineValue === null
    ? "Not set"
    : `${d.baselineValue}${d.baselineProvenance ? ` (${BASELINE_PROVENANCE_LABEL[d.baselineProvenance] ?? d.baselineProvenance})` : ""}`;
  return [
    { label: "What you will do", value: d.commitmentDescription ?? "Not stated" },
    { label: "What will be measured", value: d.verificationMetric ?? "Not set" },
    { label: "Starting value", value: baseline },
    { label: "Direction", value: DIRECTION_LABEL[d.targetDirection ?? "unknown"] ?? (d.targetDirection ?? "Direction not specified") },
    { label: "Target", value: d.targetValue === null ? "No target set" : String(d.targetValue) },
    { label: "Measure after", value: d.observationWindowDays === null ? "Not set" : `${d.observationWindowDays} days` },
    { label: "Planned finish", value: d.intendedCompletionAt ? d.intendedCompletionAt.slice(0, 10) : "Not set" },
    { label: "Measured from", value: d.expectedMeasurementSource ? (MEASUREMENT_SOURCE_LABEL[d.expectedMeasurementSource] ?? d.expectedMeasurementSource) : "Not set" },
  ];
}

// ── Recommendation snapshot (what OpsIQ originally said) ──────────────────────────────────────────────────────────

export interface RecommendationView { title: string; description: string | null; capturedAt: string | null; domain: string }
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
/** The ORIGINAL recommendation = the snapshot on the FIRST decision of the chain (later records re-snapshot the source row). */
export function originalRecommendation(chain: OwnerOutcomeChainDto): RecommendationView {
  const first = chain.decisions[0] ?? null;
  const snap = (first?.recommendationSnapshot ?? {}) as Record<string, unknown>;
  const fallbackTitle = str(snap.name) ?? str(snap.kind);
  return {
    title: str(snap.title) ?? fallbackTitle ?? "Recommendation (no title was recorded)",
    description: str(snap.description),
    capturedAt: str(snap.capturedAt),
    domain: first?.domain ?? "",
  };
}

// ── Stages ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type StageId = "recommended" | "decided" | "committed" | "execution" | "observation" | "measurement" | "target" | "issue" | "attribution" | "learning";
export type StageState = "reached" | "pending" | "not_applicable";
export interface TimelineStage {
  id: StageId;
  /** The owner's question this stage answers. */
  question: string;
  state: StageState;
  headline: string;
  detail?: string;
  tone: StatusTone;
  code?: string;
  caveat?: string;
}

export interface ChainFreshness {
  /** The current assessment was produced under an earlier decision record than the current one (a changed or amended commitment). */
  assessmentIsStale: boolean;
  /** The decision no longer commits the owner to an action, so no execution or outcome stage applies. */
  stagesNotApplicable: boolean;
}

export function chainFreshness(chain: OwnerOutcomeChainDto): ChainFreshness {
  const d = chain.currentDecision;
  const a = chain.currentAssessment;
  return {
    assessmentIsStale: Boolean(a && d && a.ownerDecisionId !== d.id),
    stagesNotApplicable: Boolean(d && !decisionCommits(d.decisionState)),
  };
}

const PENDING_NOT_CHECKED = "Not checked yet";
/** Shown for every outcome stage when the only assessment on file was recorded under an EARLIER decision record. */
export const NEEDS_NEW_CHECK_COPY = "Needs a new check for your current commitment";

/**
 * The assessment the CURRENT stages may read. An assessment recorded under an earlier decision record (a changed or amended
 * commitment) is HISTORICAL ONLY: it describes what the owner had committed to then, not now, so none of its conclusions may
 * stand in for the current commitment. Returns null in that case (the assessment stays inspectable under History). With no
 * decision on the chain at all there is nothing to be stale against, so the latest assessment is used as-is.
 */
export function currentCommitmentAssessment(chain: OwnerOutcomeChainDto): OwnerOutcomeAssessmentDto | null {
  const a = chain.currentAssessment;
  if (!a) return null;
  const d = chain.currentDecision;
  if (d && a.ownerDecisionId !== d.id) return null;
  return a;
}

function committedStage(chain: OwnerOutcomeChainDto): TimelineStage {
  const d = chain.currentDecision;
  const base = { id: "committed" as const, question: "What exactly did I commit to do?" };
  if (!d) return { ...base, state: "pending", headline: "No decision recorded", tone: "pending" };
  if (d.decisionState === "ACCEPTED") {
    return { ...base, state: "reached", headline: d.commitmentDescription ?? "You agreed to do what OpsIQ recommended", tone: "neutral", code: "AS_RECOMMENDED" };
  }
  if (d.decisionState === "MODIFIED") {
    return {
      ...base, state: "reached", headline: d.commitmentDescription ?? "Your own action", tone: "caution", code: "MODIFIED_BY_OWNER",
      detail: "This is your own action, not the one OpsIQ recommended. Anything measured below relates to your action.",
    };
  }
  if (d.decisionState === "DEFERRED") {
    return { ...base, state: "not_applicable", headline: "No commitment yet", tone: "neutral", code: "NOT_COMMITTED", detail: d.revisitAt ? `You planned to revisit this on ${d.revisitAt.slice(0, 10)}.` : "No revisit date was set." };
  }
  return { ...base, state: "not_applicable", headline: "No commitment — you chose not to do this", tone: "neutral", code: "NOT_COMMITTED" };
}

/** The ordered stages for one chain. Stages not yet reached are intentionally incomplete ("pending"), never filled with a guess. */
export function buildTimelineStages(chain: OwnerOutcomeChainDto): TimelineStage[] {
  const rec = originalRecommendation(chain);
  const d = chain.currentDecision;
  const a = currentCommitmentAssessment(chain); // never an assessment recorded under an earlier decision record
  const fresh = chainFreshness(chain);

  const recommended: TimelineStage = {
    id: "recommended", question: "What did OpsIQ recommend?", state: "reached", headline: rec.title, tone: "neutral",
    ...(rec.description ? { detail: rec.description } : {}),
  };
  const decided: TimelineStage = d
    ? {
        id: "decided", question: "What did I decide?", state: "reached", headline: DECISION_LABELS[d.decisionState]?.past ?? d.decisionState,
        tone: "neutral", code: d.decisionState, ...(d.ownerReason ? { detail: `Your reason: ${d.ownerReason}` } : {}),
      }
    : { id: "decided", question: "What did I decide?", state: "pending", headline: "No decision recorded", tone: "pending" };
  const committed = committedStage(chain);

  const later: Array<[StageId, string, (x: OwnerOutcomeAssessmentDto) => StatusView]> = [
    ["execution", "Has execution started or finished?", (x) => executionView(x.executionStatus)],
    ["observation", "When should we measure it?", (x) => observationView(x.observationStatus)],
    ["measurement", "What happened?", (x) => measurementView(x.measurementResult)],
    ["target", "Did it hit the target?", (x) => targetView(x.targetAttainment)],
    ["issue", "Is the original issue resolved?", (x) => issueView(x.issueResolution)],
    ["attribution", "Did my action contribute?", (x) => attributionView(x.causalAttribution)],
    ["learning", "Can this be learned from?", (x) => learningView(x.learningEligibility)],
  ];
  const question = (id: StageId): string => later.find(([k]) => k === id)?.[1] ?? "";

  const tail: TimelineStage[] = later.map(([id, q, view]) => {
    if (fresh.stagesNotApplicable) {
      return { id, question: q, state: "not_applicable" as const, headline: "Not tracked — no commitment", tone: "neutral" as const };
    }
    if (!a) {
      // An assessment exists but belongs to an earlier decision record: fail closed — no code, caveat or label from it.
      const stale = fresh.assessmentIsStale;
      return { id, question: q, state: "pending" as const, headline: stale ? NEEDS_NEW_CHECK_COPY : PENDING_NOT_CHECKED, tone: stale ? ("caution" as const) : ("pending" as const) };
    }
    const v = view(a);
    return { id, question: question(id), state: "reached" as const, headline: v.label, tone: v.tone, code: v.code, ...(v.caveat ? { caveat: v.caveat } : {}) };
  });
  return [recommended, decided, committed, ...tail];
}

/** How the result was checked — an owner-entered figure is never presented as independently verified. */
export function verificationSummary(a: OwnerOutcomeAssessmentDto): string {
  if (a.independentlyVerified) return "Checked independently";
  if (a.selfVerified) return "Checked by you or your own records — not independent";
  return "Not independently verified";
}

/** A chain has an actionable "check outcome" only while the owner is committed to an action. */
export function canCheckOutcome(chain: OwnerOutcomeChainDto): boolean {
  return decisionCommits(chain.currentDecision?.decisionState);
}

// ── Form → request body (shape conversion only; the server owns every validation rule) ────────────────────────────

export interface ContractFormValues {
  commitmentDescription: string;
  verificationMetric: string;
  baselineValue: string;
  baselineProvenance: string;
  targetDirection: string;
  targetValue: string;
  observationWindowDays: string;
  intendedCompletionDate: string;
  expectedMeasurementSource: string;
}
export const EMPTY_CONTRACT_FORM: ContractFormValues = {
  commitmentDescription: "", verificationMetric: "", baselineValue: "", baselineProvenance: "", targetDirection: "",
  targetValue: "", observationWindowDays: "", intendedCompletionDate: "", expectedMeasurementSource: "",
};

const text = (v: string): string | null => (v.trim() === "" ? null : v.trim());
/**
 * Blank → null (unknown). "0" → 0 (a known zero). A non-numeric entry is passed through as the raw text so the SERVER
 * rejects it with a field error — it is never coerced to NaN (which JSON would silently turn into null = "unknown").
 */
function numberOrNull(v: string): number | string | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

export interface ContractRequestBody {
  commitmentDescription: string | null;
  verificationMetric: string | null;
  baselineValue: number | string | null;
  baselineProvenance: string | null;
  targetDirection: string | null;
  targetValue: number | string | null;
  observationWindowDays: number | string | null;
  intendedCompletionAt: string | null;
  expectedMeasurementSource: string | null;
}

/**
 * Convert form text to the existing contract request shape. Blank means unknown (null); a typed 0 stays 0; direction is
 * sent exactly as chosen (blank → null → the server records "unknown") and never inferred from the metric's wording.
 */
export function contractFormToRequest(f: ContractFormValues): ContractRequestBody {
  return {
    commitmentDescription: text(f.commitmentDescription),
    verificationMetric: text(f.verificationMetric),
    baselineValue: numberOrNull(f.baselineValue),
    baselineProvenance: text(f.baselineProvenance),
    targetDirection: text(f.targetDirection),
    targetValue: numberOrNull(f.targetValue),
    observationWindowDays: numberOrNull(f.observationWindowDays),
    intendedCompletionAt: f.intendedCompletionDate ? `${f.intendedCompletionDate}T00:00:00.000Z` : null,
    expectedMeasurementSource: text(f.expectedMeasurementSource),
  };
}

/** Prefill the amendment form from the current decision (null stays blank; a stored 0 stays "0"). */
export function contractFormFromDecision(d: OwnerDecisionRecordDto | null): ContractFormValues {
  if (!d) return { ...EMPTY_CONTRACT_FORM };
  const n = (v: number | null): string => (v === null ? "" : String(v));
  return {
    commitmentDescription: d.commitmentDescription ?? "", verificationMetric: d.verificationMetric ?? "",
    baselineValue: n(d.baselineValue), baselineProvenance: d.baselineProvenance ?? "",
    targetDirection: d.targetDirection ?? "", targetValue: n(d.targetValue),
    observationWindowDays: n(d.observationWindowDays), intendedCompletionDate: d.intendedCompletionAt ? d.intendedCompletionAt.slice(0, 10) : "",
    expectedMeasurementSource: d.expectedMeasurementSource ?? "",
  };
}

// ── Submit attempts (client double-submit safety) ─────────────────────────────────────────────────────────────────

export interface SubmitAttempt { fingerprint: string; key: string }

/**
 * The idempotency key for a submit: the SAME key for a retry of the SAME payload (double-click, slow-network resend), a NEW
 * key as soon as the payload differs (the server rejects one key reused for different content). Duplicate suppression itself
 * stays on the server (unique keys + request fingerprints) — this never "checks then inserts".
 */
export function attemptFor(previous: SubmitAttempt | null, payload: unknown, newKey: () => string): SubmitAttempt {
  const fingerprint = JSON.stringify(payload);
  return previous && previous.fingerprint === fingerprint ? previous : { fingerprint, key: newKey() };
}

// ── History (append-only; shown newest first, never edited) ───────────────────────────────────────────────────────

export function decisionHistory(chain: OwnerOutcomeChainDto): OwnerDecisionRecordDto[] {
  return [...chain.decisions].sort((a, b) => b.sequence - a.sequence);
}
export function assessmentHistory(chain: OwnerOutcomeChainDto): OwnerOutcomeAssessmentDto[] {
  return [...chain.assessments].sort((a, b) => b.version - a.version);
}

/** The decision sequence an assessment was recorded under (null when it predates any decision link). Used to label history. */
export function assessmentDecisionSequence(chain: OwnerOutcomeChainDto, a: OwnerOutcomeAssessmentDto): number | null {
  return chain.decisions.find((d) => d.id === a.ownerDecisionId)?.sequence ?? null;
}
