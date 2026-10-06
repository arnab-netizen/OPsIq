/**
 * Owner outcome sources — loads the AUTHORITATIVE persisted facts for one chain and adapts them with the existing
 * adapters (`domainActionToOutcomeInput` / `processOutcomeToOutcomeInput`). Read-only: it never writes, never
 * re-derives verification semantics (no `verifyOutcome` here) and never changes a source row.
 *
 * Linkage is by persisted primary key / stable task key only. A source that cannot be found inside the caller's
 * workspace AND business is simply absent (the caller reports one uniform "not found").
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  domainActionToOutcomeInput,
  processOutcomeToOutcomeInput,
  type DomainActionRowFacts,
} from "@/domain/owner-spine/owner-outcome-adapters";
import type { OutcomeNewerDiagnosisFact, OwnerOutcomeInput } from "@/domain/owner-spine/owner-outcome-policy";
import type { SystemADomain } from "@/domain/owner-spine/owner-decision-record";
import { directionFromCommitment, type OutcomeLinks } from "@/domain/owner-spine/owner-outcome-spine";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, currentEvidenceWhere } from "@/services/owner-spine/current-diagnosis-cycle";
import { OWNER_DECISION_STALE_EVIDENCE_DAYS } from "@/services/owner-home/owner-decision-candidates";
import { financeEvidenceGaps, cashFlowEvidenceGaps } from "@/services/owner-spine/current-cash-finance-reading";
import { projectCashflowCycleRow } from "@/domain/owner-cashflow/cycle-projection";

export type Row = Record<string, unknown>;
interface Delegate {
  findFirst(args: Record<string, unknown>): Promise<Row | null>;
}
type Db = PrismaClient;

const DAY_MS = 86_400_000;
const SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

interface SystemASpec {
  action: string;
  verification: string;
  cycle: string | null;
  finding: string | null;
  recovery?: true;
}

/** Prisma delegate names per System A domain. Recovery has its own (older) shape; the other seven are uniform. */
export const SYSTEM_A_SPECS: Readonly<Record<SystemADomain, SystemASpec>> = {
  recovery: { action: "recoveryAction", verification: "recoveryVerification", cycle: null, finding: null, recovery: true },
  finance: { action: "ownerFinanceAction", verification: "ownerFinanceVerification", cycle: "ownerFinanceCycle", finding: "ownerFinanceFinding" },
  cashflow: { action: "ownerCashflowAction", verification: "ownerCashflowVerification", cycle: "ownerCashflowCycle", finding: "ownerCashflowFinding" },
  sales: { action: "ownerSalesAction", verification: "ownerSalesVerification", cycle: "ownerSalesCycle", finding: "ownerSalesFinding" },
  operations: { action: "ownerOperationsAction", verification: "ownerOperationsVerification", cycle: "ownerOperationsCycle", finding: "ownerOperationsFinding" },
  sop: { action: "ownerSopAction", verification: "ownerSopVerification", cycle: "ownerSopCycle", finding: "ownerSopFinding" },
  marketing: { action: "ownerMarketingAction", verification: "ownerMarketingVerification", cycle: "ownerMarketingCycle", finding: "ownerMarketingFinding" },
  strategy: { action: "ownerStrategyAction", verification: "ownerStrategyVerification", cycle: "ownerStrategyCycle", finding: "ownerStrategyFinding" },
};

function delegate(db: Db, name: string): Delegate {
  return (db as unknown as Record<string, Delegate>)[name];
}
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const dateOrNull = (v: unknown): Date | null => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : null);

/** The persisted System A action, inside the caller's workspace AND business — or null. */
export async function loadSystemAAction(db: Db, ws: string, biz: string, domain: SystemADomain, actionId: string): Promise<Row | null> {
  return delegate(db, SYSTEM_A_SPECS[domain].action).findFirst({ where: { id: actionId, workspaceId: ws, businessId: biz } });
}

export interface SystemAFacts {
  facts: Omit<DomainActionRowFacts, "now">;
  links: Pick<OutcomeLinks, "systemAActionId" | "systemAVerificationId" | "learningCandidateRef" | "newerDiagnosisDomain" | "newerDiagnosisCycleId" | "newerDiagnosisEvidenceAsOf">;
}

/** Latest persisted verification row for the action (workspace-scoped; business-scoped where the table has the column). */
async function latestVerification(db: Db, ws: string, biz: string, domain: SystemADomain, actionId: string): Promise<Row | null> {
  const spec = SYSTEM_A_SPECS[domain];
  const where: Record<string, unknown> = { actionId, workspaceId: ws };
  if (!spec.recovery) where.businessId = biz;
  return delegate(db, spec.verification).findFirst({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
}

/**
 * The newer-diagnosis fact for an action, or null. Deterministic: the business's CURRENT diagnosis cycle for the
 * action's own domain, produced by a different cycle than the action's, whose evidence period and generation are
 * strictly after the anchor. Persisted sources only; the policy still decides what the fact means.
 */
async function newerDiagnosis(
  db: Db, ws: string, biz: string, domain: SystemADomain, action: Row, anchor: Date | null, now: Date
): Promise<{ fact: OutcomeNewerDiagnosisFact; cycleId: string; evidenceAsOf: Date } | null> {
  const spec = SYSTEM_A_SPECS[domain];
  const findingCode = str(action.findingCode);
  if (!spec.cycle || !spec.finding || !anchor || !findingCode) return null;
  const cycle = await delegate(db, spec.cycle).findFirst({
    where: { workspaceId: ws, businessId: biz, ...currentEvidenceWhere(now) },
    orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
    include: { snapshot: true, findings: { select: { code: true, severity: true } } },
  });
  if (!cycle) return null;
  const cycleId = str(cycle.id);
  const snapshot = (cycle.snapshot ?? null) as Row | null;
  const evidenceAsOf = dateOrNull(snapshot?.periodEnd);
  const generatedAt = dateOrNull(cycle.generatedAt);
  if (!cycleId || cycleId === str(action.cycleId) || !snapshot || !evidenceAsOf || !generatedAt) return null;
  // An amended (superseded) snapshot is not a current reading; evidence and generation must both be after the anchor.
  if (snapshot.supersededById) return null;
  if (evidenceAsOf.getTime() <= anchor.getTime() || generatedAt.getTime() <= anchor.getTime()) return null;

  const findings = (cycle.findings ?? []) as Row[];
  const raised = findings.filter((f) => f.code === findingCode);
  const stillRaised = raised.length > 0;
  let worsened = false;
  if (stillRaised) {
    const original = await delegate(db, spec.finding).findFirst({ where: { cycleId: action.cycleId, code: findingCode, workspaceId: ws, businessId: biz } });
    const was = SEVERITY_RANK[String(original?.severity ?? "").toLowerCase()] ?? 0;
    const is = Math.max(...raised.map((f) => SEVERITY_RANK[String(f.severity ?? "").toLowerCase()] ?? 0));
    worsened = was > 0 && is > was;
  }
  // "Not raised" only means "gone" on complete, current evidence (not stale; no known material gap).
  const fresh = evidenceAsOf.getTime() >= now.getTime() - OWNER_DECISION_STALE_EVIDENCE_DAYS * DAY_MS;
  let complete = true;
  if (domain === "finance") complete = financeEvidenceGaps(findings).length === 0;
  if (domain === "cashflow") complete = cashFlowEvidenceGaps(projectCashflowCycleRow({ ...(cycle as { snapshot: Row; generatedAt: Date }) } as never)).length === 0;
  return { fact: { evidenceAsOf, evidenceCurrent: fresh && complete, stillRaised, worsened }, cycleId, evidenceAsOf };
}

/** System A chain: authoritative action + latest verification → existing adapter input (+ links and newer-diagnosis ref). */
export async function loadSystemAInput(
  db: Db, ws: string, biz: string, domain: SystemADomain, action: Row, now: Date
): Promise<{ input: OwnerOutcomeInput; links: SystemAFacts["links"] }> {
  const spec = SYSTEM_A_SPECS[domain];
  const actionId = String(action.id);
  const v = await latestVerification(db, ws, biz, domain, actionId);
  // Recovery names its verification columns differently; map them onto the adapter's neutral shape (no semantics change).
  const verification = v
    ? spec.recovery
      ? { status: String(v.status), beforeValue: numOrNull(v.baselineValue), afterValue: numOrNull(v.afterValue), baselineSource: null, targetDirection: str(v.direction), targetValue: numOrNull(v.targetValue), verifiedAt: v.verifiedAt, createdAt: v.createdAt }
      : { status: String(v.status), beforeValue: numOrNull(v.beforeValue), afterValue: numOrNull(v.afterValue), baselineSource: str(v.baselineSource), targetDirection: str(v.targetDirection), targetValue: numOrNull(v.targetValue), verifiedAt: v.verifiedAt, createdAt: v.createdAt }
    : null;
  const completedAt = dateOrNull(action.completedAt);
  const afterAt = verification ? dateOrNull(verification.verifiedAt) ?? dateOrNull(verification.createdAt) : null;
  const diag = await newerDiagnosis(db, ws, biz, domain, action, afterAt ?? completedAt, now);
  const input = domainActionToOutcomeInput({
    domain,
    action: {
      id: actionId,
      status: String(action.status),
      completedAt,
      verificationMetric: str(action.verificationMetric),
      metricToMove: str(action.metricToMove),
      expectedTimeframeDays: numOrNull(action.expectedTimeframeDays),
      verificationWindowDays: numOrNull(action.verificationWindowDays),
      targetValue: numOrNull(action.targetValue),
      direction: str(action.direction),
      baselineValue: numOrNull(action.baselineValue),
    },
    verification,
    newerDiagnosis: diag?.fact ?? null,
    externalEvent: false,
    learningGate: null, // Core never runs or fabricates the learning gate.
    now,
  });
  let learningCandidateRef: string | null = null;
  if (domain === "finance" && v) {
    const sig = await delegate(db, "ownerFinanceOutcomeSignal").findFirst({ where: { workspaceId: ws, verificationId: v.id } });
    learningCandidateRef = str(sig?.learningCandidateId);
  }
  return {
    input,
    links: {
      systemAActionId: actionId,
      systemAVerificationId: v ? String(v.id) : null,
      learningCandidateRef,
      newerDiagnosisDomain: diag ? domain : null,
      newerDiagnosisCycleId: diag?.cycleId ?? null,
      newerDiagnosisEvidenceAsOf: diag?.evidenceAsOf ?? null,
    },
  };
}

/** The persisted process task, inside the caller's workspace AND business (business-less tasks are never linkable). */
export async function loadProcessTask(db: Db, ws: string, biz: string, ref: { taskId?: string; taskKey?: string }): Promise<Row | null> {
  if (!ref.taskId && !ref.taskKey) return null;
  return delegate(db, "processExecutionTask").findFirst({
    where: { workspaceId: ws, businessId: biz, ...(ref.taskId ? { id: ref.taskId } : { taskKey: ref.taskKey }) },
  });
}

export interface CommitmentForDirection {
  targetDirection: string | null;
  verificationMetric: string | null;
}

/** System B chain: task + its OwnerActionOutcome → existing adapter input, with direction ONLY from a linked commitment. */
export async function loadSystemBInput(
  db: Db, ws: string, biz: string, task: Row, commitment: CommitmentForDirection | null, now: Date
): Promise<{ input: OwnerOutcomeInput; links: Pick<OutcomeLinks, "processTaskId" | "processTaskKey" | "ownerActionOutcomeId" | "reassessmentEventId" | "learningCandidateRef">; note: string | null }> {
  const outcome = str(task.outcomeId)
    ? await delegate(db, "ownerActionOutcome").findFirst({ where: { id: task.outcomeId, workspaceId: ws, businessId: biz } })
    : null;
  const { direction, note } = directionFromCommitment(commitment, str(task.targetMetricName));

  // `selfVerified` is not a column; the verify path records it on its audit event. Without that fact, independence is
  // never claimed (the verifier is reported as UNKNOWN below, not INDEPENDENT).
  let selfVerified: boolean | null = null;
  if (outcome && outcome.verifiedByActorId) {
    const ev = await delegate(db, "auditEvent").findFirst({
      where: { workspaceId: ws, eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_OUTCOME_VERIFIED, entityType: "process_execution_task", entityId: task.id },
      orderBy: { occurredAt: "desc" },
    });
    const flag = (ev?.payload as Row | null | undefined)?.selfVerified;
    selfVerified = typeof flag === "boolean" ? flag : null;
  }
  const input = processOutcomeToOutcomeInput({
    // The adapter only uses the domain for typing here (process outcomes always use the process learning gate); the
    // spine stores its own honest domain label instead.
    domain: "operations",
    actionId: String(task.taskKey),
    recommendationId: null,
    taskStatus: String(task.status),
    completedAt: task.completedAt,
    outcome: outcome
      ? {
          outcomeStatus: String(outcome.outcomeStatus ?? ""),
          actualMetricName: str(outcome.actualMetricName),
          beforeValue: numOrNull(outcome.beforeValue),
          afterValue: numOrNull(outcome.afterValue),
          measurementPeriodEnd: outcome.measurementPeriodEnd,
          evidenceQuality: str(outcome.evidenceQuality),
          externalEventFlag: outcome.externalEventFlag === true,
          observationWindowDays: numOrNull(outcome.observationWindowDays),
          verificationClassification: str(outcome.verificationClassification),
          verifiedByActorId: str(outcome.verifiedByActorId),
          verifiedAt: outcome.verifiedAt,
          selfVerified: selfVerified === true,
        }
      : { outcomeStatus: "" }, // no outcome recorded yet: an empty status yields NONE provenance, not a narrative result
    task: { targetValue: numOrNull(task.targetValue), verificationWindowDays: numOrNull(task.verificationWindowDays) },
    direction,
    learningGate: null,
    newerDiagnosis: null, // a process task carries no deterministic diagnosis-cycle reference
    now,
  });
  if (outcome && outcome.verifiedByActorId && outcome.verificationClassification && selfVerified === null) input.verifierKind = "UNKNOWN";

  const reassess = outcome
    ? await delegate(db, "ownerReassessmentEvent").findFirst({ where: { workspaceId: ws, businessId: biz, outcomeId: outcome.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    : null;
  return {
    input,
    links: {
      processTaskId: String(task.id),
      processTaskKey: String(task.taskKey),
      ownerActionOutcomeId: outcome ? String(outcome.id) : null,
      reassessmentEventId: reassess ? String(reassess.id) : null,
      learningCandidateRef: str(outcome?.learningCandidateId),
    },
    note,
  };
}
