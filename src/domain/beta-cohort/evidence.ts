/**
 * Controlled Beta Cohort evidence model — PURE (no I/O).
 *
 * Two kinds of fact are kept strictly apart:
 *   - AUTOMATIC facts: things the product itself observed (signup, verification, first read viewed, a product
 *     decision, a correction, a return visit). Derived live from existing sources by the service; never stored here.
 *   - EVIDENCE: what a human established (understanding, trust, real-world action, outcome, severity). Entered by an
 *     operator as append-only ledger entries. NOTHING in this module infers evidence from telemetry: a page view
 *     is never "understood", an in-product "accept" is never "action done", a click is never "outcome".
 *
 * UNKNOWN is a first-class state and the default for every evidence field. It is never coerced to NO/0/false.
 */
import { z } from "zod/v4";

export const DAY_MS = 86_400_000;
export const T7_DAYS = 7;
/** Minimum genuine owners for the expansion gate to be able to open (the first 3–5 owners are not statistics). */
export const MIN_REAL_OWNERS_FOR_GATE = 3;

export const COHORT_KINDS = ["REAL_OWNER", "QA_MECHANICS"] as const;
export type CohortKind = (typeof COHORT_KINDS)[number];

export const TRI_STATES = ["YES", "PARTIAL", "NO", "UNKNOWN"] as const;
export type TriState = (typeof TRI_STATES)[number];

export const YES_NO_UNKNOWN = ["YES", "NO", "UNKNOWN"] as const;
export type YesNoUnknown = (typeof YES_NO_UNKNOWN)[number];

export const REAL_WORLD_ACTIONS = ["DONE", "NOT_DONE", "UNKNOWN"] as const;
export type RealWorldAction = (typeof REAL_WORLD_ACTIONS)[number];

export const OUTCOMES = ["PROVED", "PARTIAL", "FAILED", "UNKNOWN"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const SEVERITIES = ["P0", "P1", "P2", "NONE"] as const;
export type Severity = (typeof SEVERITIES)[number];
const ISSUE_SEVERITIES = ["P0", "P1", "P2"] as const;

export const ISSUE_CATEGORIES = [
  "COMPREHENSION", "TRUST", "BAD_RECOMMENDATION", "CORRECTION_FAILURE", "OWNER_VISIBLE_ERROR",
  "WORKFLOW_FRICTION", "FALSE_CONFIDENCE", "MISSING_CONTEXT", "ACCESS_OR_SIGNUP", "OTHER",
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

/** Causality is never inferred. NOT_ESTABLISHED is the default and the honest answer unless something says otherwise. */
export const CAUSAL_BASES = ["NOT_ESTABLISHED", "CORRELATION_ONLY", "CAUSAL_EVIDENCE"] as const;
export type CausalBasis = (typeof CAUSAL_BASES)[number];

/** Who is the source of the statement: the owner said it, or an operator observed it. */
export const EVIDENCE_SOURCES = ["OWNER_STATED", "OPERATOR_OBSERVED"] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

// ─── Free-text hygiene ──────────────────────────────────────────────────────

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_LIKE = /\bhttps?:\/\/\S+/gi;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;

/**
 * Operator-entered free text is bounded, stripped of control characters and has emails, URLs and token-like strings
 * redacted before it is stored. This does NOT make it safe to type financial figures — the operating procedure says
 * not to; this only removes the obvious secrets/identifiers that must never be persisted by accident.
 */
export function sanitiseCohortText(raw: string, max: number): string {
  const cleaned = raw
    .replace(CONTROL_CHARS, " ")
    .replace(URL_LIKE, "[redacted-url]")
    .replace(EMAIL, "[redacted-email]")
    .replace(LONG_TOKEN, "[redacted-token]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

const text = (max: number) => z.string().transform((v) => sanitiseCohortText(v, max)).pipe(z.string().min(1).max(max));

// ─── Inputs ─────────────────────────────────────────────────────────────────

export const cohortIdSchema = z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/, "Cohort id like CB1");
export const ownerCodeSchema = z.string().regex(/^[A-Z][A-Z0-9]{1,11}-\d{3}$/, "Owner code like CB1-001");
const idempotencyKeySchema = z.string().trim().min(8).max(100);

export const assignmentInputSchema = z
  .strictObject({
    betaRequestId: z.uuid(),
    cohortId: cohortIdSchema,
    ownerCode: ownerCodeSchema,
    kind: z.enum(COHORT_KINDS),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine((v) => v.ownerCode.startsWith(`${v.cohortId}-`), { message: "ownerCode must start with the cohort id", path: ["ownerCode"] });
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;

const observedAt = z.iso.datetime().optional();

const observationEntrySchema = z
  .strictObject({
    entryType: z.literal("OBSERVATION"),
    source: z.enum(EVIDENCE_SOURCES),
    observedAt,
    understanding: z.enum(TRI_STATES).optional(),
    trust: z.enum(TRI_STATES).optional(),
    wouldTakeAction: z.enum(YES_NO_UNKNOWN).optional(),
    realWorldAction: z.enum(REAL_WORLD_ACTIONS).optional(),
    actionTakenOn: z.iso.date().optional(),
    whatLooksWrong: text(500).optional(),
    ownerFeedback: text(1000).optional(),
  })
  .refine(
    (v) =>
      v.understanding !== undefined || v.trust !== undefined || v.wouldTakeAction !== undefined ||
      v.realWorldAction !== undefined || v.whatLooksWrong !== undefined || v.ownerFeedback !== undefined,
    { message: "An observation must record at least one fact" },
  )
  .refine((v) => v.realWorldAction !== "DONE" || v.actionTakenOn !== undefined, {
    message: "actionTakenOn (the date the owner says they acted) is required when the action is DONE", path: ["actionTakenOn"],
  })
  .refine((v) => v.actionTakenOn === undefined || v.realWorldAction === "DONE", {
    message: "actionTakenOn is only valid together with realWorldAction DONE", path: ["actionTakenOn"],
  });

const issueEntrySchema = z.strictObject({
  entryType: z.literal("ISSUE"),
  severity: z.enum(ISSUE_SEVERITIES),
  category: z.enum(ISSUE_CATEGORIES),
  summary: text(500),
  /** True when the issue stops the owner trusting or understanding a finding. Open P2 trust blockers keep the gate CLOSED. */
  trustBlocker: z.boolean().default(false),
});

const issueResolutionEntrySchema = z.strictObject({
  entryType: z.literal("ISSUE_RESOLUTION"),
  /** The ledger entry id (audit event id) of the ISSUE being resolved. */
  issueId: z.uuid(),
  resolutionNote: text(500),
});

const followUpEntrySchema = z
  .strictObject({
    entryType: z.literal("FOLLOW_UP_T7"),
    source: z.enum(EVIDENCE_SOURCES),
    observedAt,
    actionTaken: z.enum(REAL_WORLD_ACTIONS),
    recommendationStillRelevant: z.enum(YES_NO_UNKNOWN),
    measurableSignalChanged: z.enum(YES_NO_UNKNOWN),
    signalNote: text(500).optional(),
    ownerUsefulness: z.enum(TRI_STATES),
    shouldChangeConclusion: z.enum(YES_NO_UNKNOWN),
    outcome: z.enum(OUTCOMES),
    causalBasis: z.enum(CAUSAL_BASES).default("NOT_ESTABLISHED"),
    notes: text(1000).optional(),
  })
  .refine((v) => v.measurableSignalChanged !== "YES" || v.signalNote !== undefined, {
    message: "Describe the measurable signal that changed", path: ["signalNote"],
  })
  .refine((v) => (v.outcome !== "PROVED" && v.outcome !== "PARTIAL") || v.actionTaken === "DONE", {
    message: "PROVED/PARTIAL requires that the action was actually taken", path: ["outcome"],
  })
  .refine((v) => v.outcome !== "PROVED" || (v.measurableSignalChanged === "YES" && v.causalBasis !== "NOT_ESTABLISHED"), {
    message: "PROVED requires a measurable signal change AND a stated causal basis (at least CORRELATION_ONLY); otherwise record PARTIAL or UNKNOWN", path: ["outcome"],
  })
  .refine((v) => v.causalBasis !== "CAUSAL_EVIDENCE" || v.notes !== undefined, {
    message: "CAUSAL_EVIDENCE requires notes explaining what rules out other explanations", path: ["notes"],
  });

export const evidenceEntrySchema = z.discriminatedUnion("entryType", [
  observationEntrySchema, issueEntrySchema, issueResolutionEntrySchema, followUpEntrySchema,
]);
export type EvidenceEntry = z.infer<typeof evidenceEntrySchema>;

export const evidenceInputSchema = z.strictObject({
  betaRequestId: z.uuid(),
  idempotencyKey: idempotencyKeySchema,
  entry: evidenceEntrySchema,
});
export type EvidenceInput = z.infer<typeof evidenceInputSchema>;

/** The stored envelope (audit event payload). Versioned so the shape can evolve without rewriting history. */
export const STORED_SCHEMA_VERSION = 1;
export const storedAssignmentSchema = z.object({
  schemaVersion: z.literal(STORED_SCHEMA_VERSION),
  cohortId: cohortIdSchema,
  ownerCode: ownerCodeSchema,
  kind: z.enum(COHORT_KINDS),
  idempotencyKey: idempotencyKeySchema,
  requestFingerprint: z.string().length(64),
});
export const storedEvidenceSchema = z.object({
  schemaVersion: z.literal(STORED_SCHEMA_VERSION),
  cohortId: cohortIdSchema,
  ownerCode: ownerCodeSchema,
  idempotencyKey: idempotencyKeySchema,
  requestFingerprint: z.string().length(64),
  entry: evidenceEntrySchema,
});

// ─── Automatic (observed) facts ─────────────────────────────────────────────

/**
 * What the product itself observed. Timestamps are first-occurrence; every value is `null` when not observed — never
 * guessed. NOTE the vocabulary: these are OBSERVATIONS, not evidence of understanding, trust or real-world action.
 */
export interface CohortAutomaticFacts {
  invitedAt: Date | null;
  signupAt: Date | null;
  emailVerifiedAt: Date | null;
  passwordSetAt: Date | null;
  firstRunStartedAt: Date | null;
  firstEvidenceSavedAt: Date | null;
  /** First finding exists (first diagnosis completed). */
  firstFindingAt: Date | null;
  /** The owner was shown the first read — this is the OBQ completion point (OBQ_COMPLETE = a first read exists and was shown). */
  firstResultViewedAt: Date | null;
  firstFindingCode: string | null;
  firstRecommendationCode: string | null;
  /** 0..1 as stored by the diagnosis; null when there is no recommendation. */
  firstRecommendationConfidence: number | null;
  latestRecommendationCode: string | null;
  evidenceCorrectionCount: number;
  firstCorrectionAt: Date | null;
  /** True only when a correction exists AND the top recommendation code differs from the first one; null when not applicable. */
  recommendationChangedAfterCorrection: boolean | null;
  /** In-product decision (a click). It is NOT proof that the owner did anything in the world. */
  productDecision: { state: string; decidedAt: Date } | null;
  /** In-product usefulness rating (USEFUL | PARTLY_USEFUL | NOT_USEFUL). It is NOT understanding and NOT trust. */
  productFeedback: { rating: string | null; reason: string | null; at: Date } | null;
  /** The owner's own in-product outcome report. Self-reported; not independently verified. */
  ownerReportedOutcome: { status: string; at: Date } | null;
  firstReturnVisitAt: Date | null;
  returnVisitCount: number;
  /** The linked business is a fixture/QA business: never counted as cohort evidence. */
  isFixtureBusiness: boolean;
  /** True once an account was found for the invited address. */
  accountFound: boolean;
}

export function emptyAutomaticFacts(invitedAt: Date | null): CohortAutomaticFacts {
  return {
    invitedAt, signupAt: null, emailVerifiedAt: null, passwordSetAt: null, firstRunStartedAt: null,
    firstEvidenceSavedAt: null, firstFindingAt: null, firstResultViewedAt: null, firstFindingCode: null,
    firstRecommendationCode: null, firstRecommendationConfidence: null, latestRecommendationCode: null,
    evidenceCorrectionCount: 0, firstCorrectionAt: null, recommendationChangedAfterCorrection: null,
    productDecision: null, productFeedback: null, ownerReportedOutcome: null, firstReturnVisitAt: null,
    returnVisitCount: 0, isFixtureBusiness: false, accountFound: false,
  };
}

// ─── Ledger reduction ───────────────────────────────────────────────────────

export interface LedgerEntry {
  /** Audit event id; stable reference for ISSUE_RESOLUTION. */
  id: string;
  recordedAt: Date;
  actorId: string | null;
  entry: EvidenceEntry;
}

export interface OpenIssue {
  id: string;
  recordedAt: Date;
  severity: (typeof ISSUE_SEVERITIES)[number];
  category: IssueCategory;
  summary: string;
  trustBlocker: boolean;
}

export interface FollowUpRecord {
  completedAt: Date;
  actionTaken: RealWorldAction;
  recommendationStillRelevant: YesNoUnknown;
  measurableSignalChanged: YesNoUnknown;
  signalNote: string | null;
  ownerUsefulness: TriState;
  shouldChangeConclusion: YesNoUnknown;
  outcome: Outcome;
  causalBasis: CausalBasis;
  source: EvidenceSource;
}

export interface LedgerState {
  understanding: TriState;
  understandingAt: Date | null;
  trust: TriState;
  trustAt: Date | null;
  wouldTakeAction: YesNoUnknown;
  realWorldAction: RealWorldAction;
  actionTakenOn: string | null;
  t7DueAt: Date | null;
  whatLooksWrong: string | null;
  ownerFeedback: string | null;
  followUp: FollowUpRecord | null;
  /** UNKNOWN until a T+7 follow-up says otherwise. */
  outcome: Outcome;
  openIssues: OpenIssue[];
  /** Worst OPEN issue severity; NONE when there is none. */
  severity: Severity;
  openP2TrustBlockers: number;
  entryCount: number;
}

function compareEntries(a: LedgerEntry, b: LedgerEntry): number {
  const d = a.recordedAt.getTime() - b.recordedAt.getTime();
  return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The moment a statement was true: operator-stated observation time (never later than it was recorded), else recording time. */
function effectiveTime(e: LedgerEntry): Date {
  const stated = "observedAt" in e.entry && e.entry.observedAt ? new Date(e.entry.observedAt) : null;
  if (stated && stated.getTime() <= e.recordedAt.getTime()) return stated;
  return e.recordedAt;
}

const SEVERITY_RANK: Record<Severity, number> = { NONE: 0, P2: 1, P1: 2, P0: 3 };

export function reduceLedger(entries: readonly LedgerEntry[]): LedgerState {
  const ordered = [...entries].sort(compareEntries);
  const state: LedgerState = {
    understanding: "UNKNOWN", understandingAt: null, trust: "UNKNOWN", trustAt: null, wouldTakeAction: "UNKNOWN",
    realWorldAction: "UNKNOWN", actionTakenOn: null, t7DueAt: null, whatLooksWrong: null, ownerFeedback: null,
    followUp: null, outcome: "UNKNOWN", openIssues: [], severity: "NONE", openP2TrustBlockers: 0, entryCount: ordered.length,
  };
  const issues = new Map<string, OpenIssue>();
  for (const e of ordered) {
    const x = e.entry;
    if (x.entryType === "OBSERVATION") {
      const at = effectiveTime(e);
      if (x.understanding !== undefined) { state.understanding = x.understanding; state.understandingAt = at; }
      if (x.trust !== undefined) { state.trust = x.trust; state.trustAt = at; }
      if (x.wouldTakeAction !== undefined) state.wouldTakeAction = x.wouldTakeAction;
      if (x.realWorldAction !== undefined) {
        state.realWorldAction = x.realWorldAction;
        if (x.realWorldAction === "DONE" && x.actionTakenOn) {
          state.actionTakenOn = x.actionTakenOn;
          state.t7DueAt = new Date(new Date(`${x.actionTakenOn}T00:00:00.000Z`).getTime() + T7_DAYS * DAY_MS);
        } else {
          state.actionTakenOn = null;
          state.t7DueAt = null;
        }
      }
      if (x.whatLooksWrong !== undefined) state.whatLooksWrong = x.whatLooksWrong;
      if (x.ownerFeedback !== undefined) state.ownerFeedback = x.ownerFeedback;
    } else if (x.entryType === "ISSUE") {
      issues.set(e.id, { id: e.id, recordedAt: e.recordedAt, severity: x.severity, category: x.category, summary: x.summary, trustBlocker: x.trustBlocker });
    } else if (x.entryType === "ISSUE_RESOLUTION") {
      issues.delete(x.issueId);
    } else {
      state.followUp = {
        completedAt: effectiveTime(e), actionTaken: x.actionTaken, recommendationStillRelevant: x.recommendationStillRelevant,
        measurableSignalChanged: x.measurableSignalChanged, signalNote: x.signalNote ?? null, ownerUsefulness: x.ownerUsefulness,
        shouldChangeConclusion: x.shouldChangeConclusion, outcome: x.outcome, causalBasis: x.causalBasis, source: x.source,
      };
      state.outcome = x.outcome;
      // A follow-up that reports the action was done/not done is also the best statement of the action itself.
      if (x.actionTaken !== "UNKNOWN") state.realWorldAction = x.actionTaken;
    }
  }
  state.openIssues = [...issues.values()].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.recordedAt.getTime() - b.recordedAt.getTime());
  for (const i of state.openIssues) if (SEVERITY_RANK[i.severity] > SEVERITY_RANK[state.severity]) state.severity = i.severity;
  state.openP2TrustBlockers = state.openIssues.filter((i) => i.severity === "P2" && i.trustBlocker).length;
  return state;
}

// ─── Time to first trusted value ────────────────────────────────────────────

/**
 * TIME_TO_FIRST_TRUSTED_VALUE — exact definition (CB1):
 *
 *   Measured from the owner's verified-email moment (falling back to password set, then first-run start, because those
 *   are the earliest authenticated-entry instrumentation we have) to the first moment at which ALL of these hold:
 *     1. a concrete finding/recommendation exists (first diagnosis completed);
 *     2. the owner was shown it, i.e. had the opportunity to correct the evidence (first result viewed);
 *     3. the owner indicated they UNDERSTAND it — understanding = YES (PARTIAL does not count);
 *     4. the owner has not rejected it as obviously wrong — trust is not NO (UNKNOWN is "not rejected", and is reported
 *        as such: this is a floor, not proof of trust).
 *   The moment is max(statement time, finding time, viewed time). It is NOT "dashboard loaded".
 *
 * `stillHolds` reports whether the CURRENT ledger state still satisfies 3 and 4 (trust may be withdrawn later).
 */
export interface FirstTrustedValue {
  reachedAt: Date;
  secondsFromVerification: number | null;
  startedFrom: "EMAIL_VERIFIED" | "PASSWORD_SET" | "FIRST_RUN_STARTED" | null;
  stillHolds: boolean;
  trustWasExplicit: boolean;
}

export function computeFirstTrustedValue(facts: CohortAutomaticFacts, entries: readonly LedgerEntry[]): FirstTrustedValue | null {
  if (!facts.firstFindingAt || !facts.firstResultViewedAt) return null;
  const ordered = [...entries].sort(compareEntries);
  let understanding: TriState = "UNKNOWN";
  let trust: TriState = "UNKNOWN";
  let reached: { at: Date; trustExplicit: boolean } | null = null;
  for (const e of ordered) {
    if (e.entry.entryType !== "OBSERVATION") continue;
    if (e.entry.understanding !== undefined) understanding = e.entry.understanding;
    if (e.entry.trust !== undefined) trust = e.entry.trust;
    if (!reached && understanding === "YES" && trust !== "NO") {
      const stated = effectiveTime(e).getTime();
      reached = { at: new Date(Math.max(stated, facts.firstFindingAt.getTime(), facts.firstResultViewedAt.getTime())), trustExplicit: trust === "YES" || trust === "PARTIAL" };
    }
  }
  if (!reached) return null;
  const start: Array<[Date | null, FirstTrustedValue["startedFrom"]]> = [
    [facts.emailVerifiedAt, "EMAIL_VERIFIED"], [facts.passwordSetAt, "PASSWORD_SET"], [facts.firstRunStartedAt, "FIRST_RUN_STARTED"],
  ];
  const from = start.find(([d]) => d !== null) ?? [null, null];
  const seconds = from[0] ? Math.max(0, Math.round((reached.at.getTime() - from[0].getTime()) / 1000)) : null;
  return {
    reachedAt: reached.at, secondsFromVerification: seconds, startedFrom: from[1],
    stillHolds: understanding === "YES" && trust !== "NO", trustWasExplicit: reached.trustExplicit,
  };
}

// ─── Per-owner view ─────────────────────────────────────────────────────────

export interface CohortAssignment {
  betaRequestId: string;
  cohortId: string;
  ownerCode: string;
  kind: CohortKind;
  assignedAt: Date;
}

export type JourneyStage =
  | "INVITED" | "SIGNED_UP" | "VERIFIED" | "FIRST_FINDING" | "OBQ_COMPLETE" | "UNDERSTOOD" | "DECIDED" | "ACTED" | "RETURNED" | "T7_DONE";

export interface CohortOwnerView {
  assignment: CohortAssignment;
  automatic: CohortAutomaticFacts;
  evidence: LedgerState;
  firstTrustedValue: FirstTrustedValue | null;
  /** Furthest observed/evidenced milestone (a navigation aid, not a score). */
  stage: JourneyStage;
  t7: { dueAt: Date | null; status: "NOT_SCHEDULED" | "NOT_DUE" | "DUE" | "OVERDUE" | "COMPLETED" };
  nextOperatorStep: string;
  /** False for QA mechanics checks and fixture businesses: they are shown but never counted. */
  countedInGate: boolean;
}

function t7Status(evidence: LedgerState, now: Date): CohortOwnerView["t7"] {
  if (evidence.followUp) return { dueAt: evidence.t7DueAt, status: "COMPLETED" };
  if (!evidence.t7DueAt) return { dueAt: null, status: "NOT_SCHEDULED" };
  const t = now.getTime();
  const due = evidence.t7DueAt.getTime();
  if (t < due) return { dueAt: evidence.t7DueAt, status: "NOT_DUE" };
  return { dueAt: evidence.t7DueAt, status: t - due > 2 * DAY_MS ? "OVERDUE" : "DUE" };
}

function stageOf(a: CohortAutomaticFacts, e: LedgerState): JourneyStage {
  if (e.followUp) return "T7_DONE";
  if (a.firstReturnVisitAt) return "RETURNED";
  if (e.realWorldAction === "DONE") return "ACTED";
  if (a.productDecision) return "DECIDED";
  if (e.understanding === "YES") return "UNDERSTOOD";
  if (a.firstResultViewedAt) return "OBQ_COMPLETE";
  if (a.firstFindingAt) return "FIRST_FINDING";
  if (a.emailVerifiedAt) return "VERIFIED";
  if (a.signupAt) return "SIGNED_UP";
  return "INVITED";
}

function nextStep(a: CohortAutomaticFacts, e: LedgerState, t7: CohortOwnerView["t7"]): string {
  const worst = e.openIssues[0];
  if (worst && (worst.severity === "P0" || worst.severity === "P1")) return `Resolve open ${worst.severity} issue before any further owner contact`;
  if (!a.signupAt) return "Waiting for signup (invited, no account yet)";
  if (!a.emailVerifiedAt) return "Signed up but not verified — check the verification email / resend";
  if (!a.firstResultViewedAt) return "Has not reached the first read — look for a blocker and offer help";
  if (e.understanding === "UNKNOWN") return "Ask: do you understand what OpsIQ is telling you? Then record understanding";
  if (e.trust === "UNKNOWN") return "Ask: is this accurate enough to act on? What looks wrong? Then record trust";
  if (!a.productDecision && e.wouldTakeAction === "UNKNOWN") return "Ask: would you take the recommended action? Then record the answer";
  if (e.realWorldAction === "UNKNOWN") return "Ask later: did you actually take the action? Record done/not done (with the date)";
  if (t7.status === "NOT_DUE" && t7.dueAt) return `T+7 follow-up due ${t7.dueAt.toISOString().slice(0, 10)}`;
  if (t7.status === "DUE") return "T+7 follow-up is due now";
  if (t7.status === "OVERDUE") return "T+7 follow-up is OVERDUE";
  if (e.followUp && e.outcome === "UNKNOWN") return "Follow-up recorded with unknown outcome — gather the missing evidence or accept UNKNOWN";
  return "No operator action needed — keep observing";
}

export function buildOwnerView(input: {
  assignment: CohortAssignment;
  automatic: CohortAutomaticFacts;
  entries: readonly LedgerEntry[];
  now: Date;
}): CohortOwnerView {
  const evidence = reduceLedger(input.entries);
  const t7 = t7Status(evidence, input.now);
  return {
    assignment: input.assignment,
    automatic: input.automatic,
    evidence,
    firstTrustedValue: computeFirstTrustedValue(input.automatic, input.entries),
    stage: stageOf(input.automatic, evidence),
    t7,
    nextOperatorStep: nextStep(input.automatic, evidence, t7),
    countedInGate: input.assignment.kind === "REAL_OWNER" && !input.automatic.isFixtureBusiness && input.automatic.accountFound,
  };
}

// ─── Expansion gate ─────────────────────────────────────────────────────────

export type CriterionStatus = "PROVEN" | "OBSERVED" | "NOT_YET";

export interface ExpansionGate {
  /** Always CLOSED unless EVERY criterion holds on genuine-owner evidence. Starts (and with zero owners stays) CLOSED. */
  gate: "OPEN" | "CLOSED";
  realOwnersCounted: number;
  required: number;
  p0Open: number;
  p1Open: number;
  p2TrustBlockersOpen: number;
  criteria: {
    REAL_OWNER_SIGNUP: CriterionStatus;
    REAL_OWNER_OBQ: CriterionStatus;
    REAL_OWNER_FIRST_VALUE: CriterionStatus;
    REAL_OWNER_UNDERSTANDING: CriterionStatus;
    REAL_OWNER_ACTION: CriterionStatus;
    RETURN_USAGE: CriterionStatus;
  };
  counts: { signedUp: number; obqComplete: number; firstValue: number; understood: number; actionDone: number; returned: number };
  unmet: string[];
}

export function evaluateExpansionGate(views: readonly CohortOwnerView[], required = MIN_REAL_OWNERS_FOR_GATE): ExpansionGate {
  const counted = views.filter((v) => v.countedInGate);
  const open = counted.flatMap((v) => v.evidence.openIssues);
  const p0Open = open.filter((i) => i.severity === "P0").length;
  const p1Open = open.filter((i) => i.severity === "P1").length;
  const p2TrustBlockersOpen = open.filter((i) => i.severity === "P2" && i.trustBlocker).length;
  const counts = {
    signedUp: counted.filter((v) => v.automatic.signupAt).length,
    obqComplete: counted.filter((v) => v.automatic.firstResultViewedAt).length,
    firstValue: counted.filter((v) => v.firstTrustedValue?.stillHolds).length,
    understood: counted.filter((v) => v.evidence.understanding === "YES").length,
    actionDone: counted.filter((v) => v.evidence.realWorldAction === "DONE").length,
    returned: counted.filter((v) => v.automatic.firstReturnVisitAt).length,
  };
  const proven = (n: number): CriterionStatus => (n >= required ? "PROVEN" : "NOT_YET");
  const criteria = {
    REAL_OWNER_SIGNUP: proven(counts.signedUp),
    REAL_OWNER_OBQ: proven(counts.obqComplete),
    REAL_OWNER_FIRST_VALUE: proven(counts.firstValue),
    REAL_OWNER_UNDERSTANDING: proven(counts.understood),
    REAL_OWNER_ACTION: (counts.actionDone >= 1 ? "OBSERVED" : "NOT_YET") as CriterionStatus,
    RETURN_USAGE: (counts.returned >= 1 ? "OBSERVED" : "NOT_YET") as CriterionStatus,
  };
  const unmet: string[] = [];
  if (counted.length < required) unmet.push(`Fewer than ${required} genuine owners counted (${counted.length})`);
  if (p0Open > 0) unmet.push(`${p0Open} open P0`);
  if (p1Open > 0) unmet.push(`${p1Open} open P1`);
  if (p2TrustBlockersOpen > 0) unmet.push(`${p2TrustBlockersOpen} open P2 trust blocker(s)`);
  for (const [k, v] of Object.entries(criteria)) if (v === "NOT_YET") unmet.push(`${k} not yet met`);
  return {
    gate: unmet.length === 0 ? "OPEN" : "CLOSED",
    realOwnersCounted: counted.length, required, p0Open, p1Open, p2TrustBlockersOpen, criteria, counts, unmet,
  };
}
