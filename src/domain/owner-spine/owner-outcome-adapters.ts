/**
 * Read-only adapters that normalise the two existing outcome loops into `OwnerOutcomeInput`:
 *
 *   System A — per-domain action + verification rows (founder-recovery, finance, cashflow, sales,
 *              operations, marketing, SOP, strategy). One shared `verifyOutcome`; the owner types the
 *              after-value; no verifier column except Recovery.
 *   System B — `OwnerActionOutcome` + `ProcessExecutionTask` (separation of duty, windows, reassessment).
 *
 * They are adapters, not replacements: nothing is persisted and no persisted value is reinterpreted beyond
 * stating its provenance honestly (a System A after-value is always OWNER_ENTERED — no code path records a
 * measured after-value for it).
 */
import type {
  OutcomeAfterProvenance,
  OutcomeDirection,
  OutcomeLearningGateResult,
  OutcomeBaselineProvenance,
  OutcomeEvidenceQuality,
  OutcomeExecutionStatus,
  OutcomeLearningLoop,
  OutcomeNewerDiagnosisFact,
  OutcomeVerifierKind,
  OwnerOutcomeInput,
} from "./owner-outcome-policy";
import type { OwnerDomain } from "./contracts";

const WINDOW_FALLBACK_NONE = null;

function executionStatusOf(status: string): OutcomeExecutionStatus {
  switch (status) {
    case "completed":
    case "COMPLETED":
    case "OUTCOME_RECORDED":
    case "OUTCOME_DISPUTED":
    case "OUTCOME_VERIFIED":
      return "COMPLETED";
    case "in_progress":
    case "IN_PROGRESS":
      return "IN_PROGRESS";
    case "blocked":
    case "BLOCKED":
      return "BLOCKED";
    case "cancelled":
    case "CANCELLED":
    case "REJECTED":
      return "CANCELLED";
    default:
      return "NOT_STARTED";
  }
}

function asDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Direction is taken only from a recorded "up"/"down"; anything else is "unknown" (never defaulted to "up"). */
function directionOf(v: unknown): OutcomeDirection {
  return v === "up" || v === "down" ? v : "unknown";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Only Finance feeds a learning loop from System A (the learning bridge). */
export function learningLoopForDomain(domain: OwnerDomain | "customer"): OutcomeLearningLoop {
  return domain === "finance" ? "FINANCE_BRIDGE" : "NONE";
}

export interface DomainActionRowFacts {
  domain: OwnerDomain;
  action: {
    id: string;
    status: string;
    completedAt?: unknown;
    verificationMetric?: string | null;
    metricToMove?: string | null;
    expectedTimeframeDays?: number | null;
    verificationWindowDays?: number | null;
    targetValue?: number | null;
    direction?: string | null;
    baselineValue?: number | null;
  };
  /** Latest verification row for the action, if any. */
  verification?: {
    status: string;
    beforeValue?: number | null;
    afterValue?: number | null;
    baselineSource?: string | null;
    targetDirection?: string | null;
    targetValue?: number | null;
    verifiedAt?: unknown;
    createdAt?: unknown;
  } | null;
  newerDiagnosis?: OutcomeNewerDiagnosisFact | null;
  externalEvent?: boolean;
  learningGate?: OutcomeLearningGateResult | null;
  now: Date;
}

/** System A → canonical input. */
export function domainActionToOutcomeInput(f: DomainActionRowFacts): OwnerOutcomeInput {
  const v = f.verification ?? null;
  const direction = directionOf(v?.targetDirection ?? f.action.direction);
  const baselineProvenance: OutcomeBaselineProvenance =
    v?.baselineSource === "MEASURED" ? "MEASURED" : v?.baselineSource === "OWNER_REPORTED" ? "OWNER_REPORTED" : num(f.action.baselineValue) !== null && !v ? "MEASURED" : "UNKNOWN";
  const baselineValue = v ? num(v.beforeValue) : num(f.action.baselineValue);
  const afterValue = v ? num(v.afterValue) : null;
  const afterProvenance: OutcomeAfterProvenance = afterValue === null ? "NONE" : "OWNER_ENTERED";
  const verifiedAt = v ? asDate(v.verifiedAt) ?? asDate(v.createdAt) : null;
  // Recovery persists a `verifiedBy` id and the other domains none, but no domain records whether that
  // person differs from whoever did the work, so identity is UNKNOWN — never presented as independent.
  const verifierKind: OutcomeVerifierKind = v ? "UNKNOWN" : "NONE";
  return {
    domain: f.domain,
    actionId: f.action.id,
    executionStatus: executionStatusOf(f.action.status),
    completedAt: asDate(f.action.completedAt),
    verificationMetric: f.action.verificationMetric ?? f.action.metricToMove ?? null,
    baselineValue,
    baselineProvenance,
    afterValue,
    afterProvenance,
    afterMeasuredAt: afterValue === null ? null : verifiedAt,
    direction,
    targetValue: v ? num(v.targetValue) : num(f.action.targetValue),
    windowDays: f.action.verificationWindowDays ?? f.action.expectedTimeframeDays ?? WINDOW_FALLBACK_NONE,
    disputed: v?.status === "disputed",
    externalEvent: f.externalEvent === true,
    verifierKind,
    verificationAttempted: v !== null,
    verifiedAt,
    causalAssessment: null,
    newerDiagnosis: f.newerDiagnosis ?? null,
    learningLoop: learningLoopForDomain(f.domain),
    learningGate: f.learningGate ?? null,
    now: f.now,
  };
}

export interface ProcessOutcomeRowFacts {
  domain: OwnerDomain;
  actionId: string;
  recommendationId?: string | null;
  taskStatus: string;
  completedAt?: unknown;
  outcome: {
    outcomeStatus: string;
    actualMetricName?: string | null;
    beforeValue?: number | null;
    afterValue?: number | null;
    measurementPeriodEnd?: unknown;
    evidenceQuality?: string | null;
    externalEventFlag?: boolean | null;
    observationWindowDays?: number | null;
    verificationClassification?: string | null;
    verifiedByActorId?: string | null;
    verifiedAt?: unknown;
    selfVerified?: boolean;
  };
  task?: { targetValue?: number | null; verificationWindowDays?: number | null } | null;
  /** Recorded target direction. ProcessExecutionTask / OwnerActionOutcome persist none today, so callers pass undefined. */
  direction?: "up" | "down" | null;
  learningGate?: OutcomeLearningGateResult | null;
  newerDiagnosis?: OutcomeNewerDiagnosisFact | null;
  now: Date;
}

const QUALITIES: readonly string[] = ["strong", "moderate", "weak", "anecdotal", "none"];

/** System B → canonical input. An owner-reported "worked" with no numbers stays NARRATIVE_ONLY. */
export function processOutcomeToOutcomeInput(f: ProcessOutcomeRowFacts): OwnerOutcomeInput {
  const o = f.outcome;
  const before = num(o.beforeValue);
  const after = num(o.afterValue);
  const quality = o.evidenceQuality && QUALITIES.includes(o.evidenceQuality) ? (o.evidenceQuality as OutcomeEvidenceQuality) : null;
  const verified = !!o.verificationClassification && !!o.verifiedByActorId;
  const verifierKind: OutcomeVerifierKind = !verified ? "NONE" : o.selfVerified ? "SELF" : "INDEPENDENT";
  const periodEnd = asDate(o.measurementPeriodEnd);
  const window = o.observationWindowDays ?? f.task?.verificationWindowDays ?? null;
  return {
    domain: f.domain,
    actionId: f.actionId,
    recommendationId: f.recommendationId ?? null,
    executionStatus: executionStatusOf(f.taskStatus),
    completedAt: asDate(f.completedAt),
    verificationMetric: o.actualMetricName ?? null,
    baselineValue: before,
    // Task-flow baselines are typed by the recorder; nothing marks them measured.
    baselineProvenance: before === null ? "UNKNOWN" : "OWNER_REPORTED",
    afterValue: after,
    afterProvenance: after === null ? (o.outcomeStatus ? "NARRATIVE_ONLY" : "NONE") : "OWNER_ENTERED",
    afterMeasuredAt: periodEnd,
    direction: directionOf(f.direction),
    targetValue: num(f.task?.targetValue),
    windowDays: window,
    disputed: f.taskStatus === "OUTCOME_DISPUTED",
    externalEvent: o.externalEventFlag === true || o.outcomeStatus === "external_event_interference",
    verifierKind,
    verificationAttempted: !!o.verificationClassification,
    verifiedAt: asDate(o.verifiedAt),
    causalAssessment: null,
    newerDiagnosis: f.newerDiagnosis ?? null,
    learningLoop: "PROCESS_EXECUTION_GATE",
    learningGate: f.learningGate ?? null,
    recordedEvidenceQuality: quality,
    now: f.now,
  };
}
