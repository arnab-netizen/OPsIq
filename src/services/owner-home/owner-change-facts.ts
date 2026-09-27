/**
 * "What changed" facts for the owner decision — gathered READ-ONLY from what was actually persisted
 * when something happened (a new diagnosis snapshot, a completion, a verification, a risk or
 * compliance lifecycle transition, a business added or archived). Nothing is written on read: the
 * owner decision keeps no memory of its own, so it never claims "your main target changed from X to Y"
 * (that cannot be reconstructed truthfully from persisted facts).
 */
import { db } from "@/lib/db";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, CURRENT_RECOVERY_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";
import {
  asDate,
  complianceItemToCandidate,
  CRITICAL_RISK_SEVERITY,
  OPEN_RISK_STATUSES,
  OWNER_DECISION_STALE_EVIDENCE_DAYS,
  toOwnerSeverity,
} from "@/services/owner-home/owner-decision-candidates";
import {
  OWNER_WHAT_CHANGED_WINDOW_DAYS,
  ownerCandidateIssueKey,
  type OwnerChangeFacts,
  type OwnerDecisionEvent,
  type OwnerEvidenceTransition,
  type OwnerRecordIssueFact,
} from "@/domain/owner-spine/owner-decision";
import type { OwnerSeverity } from "@/domain/owner-spine/contracts";
import { ownerLeverKey } from "@/domain/owner-spine/owner-imperatives";

const DAY_MS = 86_400_000;

type SpineDomain = "finance" | "cashflow" | "sales" | "operations" | "sop" | "marketing" | "strategy" | "recovery";

/**
 * Each EVIDENCE domain's cycle model and its current-diagnosis order (Recovery predates the Spine).
 * Strategy is not here: a Strategy evaluation assesses a hypothetical plan the owner is considering, not
 * the running business, so switching or re-evaluating a scenario is never "new figures" and never shows
 * an issue as appeared or resolved (its own completions/verifications still count as work events).
 */
const CYCLE_MODELS: ReadonlyArray<{ domain: SpineDomain; model: string; order: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER | typeof CURRENT_RECOVERY_CYCLE_ORDER }> = [
  { domain: "finance", model: "ownerFinanceCycle", order: CURRENT_DIAGNOSIS_CYCLE_ORDER },
  { domain: "cashflow", model: "ownerCashflowCycle", order: CURRENT_DIAGNOSIS_CYCLE_ORDER },
  { domain: "sales", model: "ownerSalesCycle", order: CURRENT_DIAGNOSIS_CYCLE_ORDER },
  { domain: "operations", model: "ownerOperationsCycle", order: CURRENT_DIAGNOSIS_CYCLE_ORDER },
  { domain: "sop", model: "ownerSopCycle", order: CURRENT_DIAGNOSIS_CYCLE_ORDER },
  { domain: "marketing", model: "ownerMarketingCycle", order: CURRENT_DIAGNOSIS_CYCLE_ORDER },
  { domain: "recovery", model: "recoveryCycle", order: CURRENT_RECOVERY_CYCLE_ORDER },
];

/**
 * Rows arrive through the untyped `db` proxy. These structural types name exactly the columns this
 * module selects and reads.
 */
interface FindingFacts {
  code?: unknown;
  severity?: unknown;
  title?: unknown;
}
interface CycleFactsRow {
  snapshotId: string;
  snapshot?: { createdAt?: unknown; periodEnd?: unknown; supersededById?: unknown } | null;
  findings?: readonly FindingFacts[];
}
/** The two reads this module makes on each evidence cycle model. */
interface CycleModelReader {
  /** When the current evidence was FIRST diagnosed (a later re-diagnosis of it is not a new business state). */
  aggregate(args: {
    where: { workspaceId: string; businessId: string; snapshotId: string };
    _min: { createdAt: true };
  }): Promise<{ _min: { createdAt: Date | null } }>;
  /** The baseline: the current diagnosis of the evidence that was available before the current evidence. */
  findFirst(args: {
    where: { workspaceId: string; businessId: string; snapshotId: { not: string }; createdAt: { lt: Date }; snapshot: { periodEnd: { lte: Date }; supersededById?: null } };
    orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER | typeof CURRENT_RECOVERY_CYCLE_ORDER;
    select: typeof cycleSelect;
  }): Promise<CycleFactsRow | null>;
}
interface AuditFactRow {
  eventName: string;
  entityId: string | null;
  occurredAt: unknown;
  payload: unknown;
}
interface ComplianceFactRow {
  id: string;
  businessId: string | null;
  name?: unknown;
  [column: string]: unknown;
}
interface RiskFactRow {
  id: string;
  title: unknown;
  status: unknown;
  severity: unknown;
  residualRisk: unknown;
}

/** Compliance statuses that close a breach: back in force (active / compliant), or waived. */
const COMPLIANCE_CLEARED_STATUSES: ReadonlySet<string> = new Set(["active", "compliant", "waived"]);

const cycleSelect = {
  snapshotId: true,
  snapshot: { select: { id: true, createdAt: true, periodEnd: true } },
  // Deterministic: when a cycle repeats a code at equal severity, the same row's title is reported every read.
  findings: { select: { code: true, severity: true, title: true }, orderBy: [{ code: "asc" }, { id: "asc" }] },
} as const;

/**
 * One issue per business LEVER where the code belongs to one (ownerLeverKey — e.g. every runway code is
 * `cash_runway`), else per code: a tier change of the same problem (CF_INSOLVENT_RUNWAY → CF_LOW_RUNWAY) is
 * the same issue changing severity, never "resolved" plus "new".
 */
export function issuesOf(domain: SpineDomain, findings: readonly FindingFacts[]): Record<string, { severity: OwnerSeverity | null; title: string }> {
  const out: Record<string, { severity: OwnerSeverity | null; title: string }> = {};
  for (const f of findings) {
    const code = typeof f?.code === "string" ? f.code : "";
    if (!code) continue;
    const lever = ownerLeverKey(code);
    const key = lever ? `${domain}:lever:${lever}` : ownerCandidateIssueKey({ domain, findingCode: code, candidateId: `${domain}:${code}`, source: "domain_action" });
    const severity = toOwnerSeverity(f.severity);
    const prev = out[key];
    // One issue per code: the most severe row wins when a cycle repeats a code.
    if (!prev || (severity && (!prev.severity || rank(severity) > rank(prev.severity)))) {
      out[key] = { severity, title: typeof f.title === "string" && f.title ? f.title : code };
    }
  }
  return out;
}

const SEVERITY_RANK: Record<OwnerSeverity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
function rank(s: OwnerSeverity): number {
  return SEVERITY_RANK[s];
}

/** A domain's current diagnosis as already loaded by the candidate builder. */
export interface CurrentDiagnosisFacts {
  snapshotId: string;
  /** When this diagnosis ran. */
  createdAt?: unknown;
  snapshot?: { createdAt?: unknown; periodEnd?: unknown; supersededById?: unknown } | null;
  findings: readonly FindingFacts[];
}

/**
 * The evidence order of two snapshots: a later evidence PERIOD is newer; the same period captured later
 * is a correction (newer). Back-filled older periods are never "newer" (they describe the past).
 */
function isNewerEvidence(current: { periodEnd: Date | null; createdAt: Date }, previous: { periodEnd: Date | null; createdAt: Date | null }): boolean {
  if (!current.periodEnd || !previous.periodEnd || !previous.createdAt) return false;
  const c = current.periodEnd.getTime();
  const p = previous.periodEnd.getTime();
  return c > p || (c === p && current.createdAt.getTime() > previous.createdAt.getTime());
}

/**
 * One domain's evidence transition, dated by EVIDENCE chronology — never by insertion or re-diagnosis time:
 *   - its time is when the CURRENT evidence (snapshot) was FIRST diagnosed: re-running the engine on the
 *     same figures is not a new business state, so it never re-dates the transition into the window;
 *   - its baseline is the current diagnosis (same shared order) of the evidence that was AVAILABLE before
 *     that — cycles created before the current evidence's first diagnosis, on a different snapshot. A
 *     back-filled older period, entered after the current evidence, is never the baseline (it was not
 *     what the business looked like before the current figures), so it cannot produce a false
 *     appeared / resolved / worsened / improved line.
 * Only causally newer evidence (a later period, or the same period re-captured later) reports changes.
 */
async function evidenceTransition(
  workspaceId: string,
  businessId: string,
  spec: (typeof CYCLE_MODELS)[number],
  current: CurrentDiagnosisFacts | null,
  now: Date
): Promise<OwnerEvidenceTransition | null> {
  if (!current?.snapshotId) return null;
  const currentAt = asDate(current.snapshot?.createdAt);
  if (!currentAt) return null;
  // Only CURRENT EFFECTIVE evidence reports change: figures for a period that has not ended, figures
  // older than the freshness window (stale evidence is not a new business state), and Finance figures the
  // owner has since amended (not the owner's figures any more) report nothing.
  const currentPeriodEnd = asDate(current.snapshot?.periodEnd);
  if (currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()) return null;
  if (currentPeriodEnd && currentPeriodEnd.getTime() < now.getTime() - OWNER_DECISION_STALE_EVIDENCE_DAYS * DAY_MS) return null;
  if (current.snapshot?.supersededById) return null;
  const model = (db as Record<string, CycleModelReader>)[spec.model];
  const first = await model.aggregate({
    where: { workspaceId, businessId, snapshotId: String(current.snapshotId) },
    _min: { createdAt: true },
  });
  const firstDiagnosedAt = asDate(first._min.createdAt) ?? asDate(current.createdAt) ?? currentAt;
  // The baseline is effective evidence too: a Finance version the owner later amended is not what the
  // business looked like (its corrected version is).
  const previous = await model.findFirst({
    where: {
      workspaceId, businessId, snapshotId: { not: String(current.snapshotId) }, createdAt: { lt: firstDiagnosedAt },
      snapshot: { periodEnd: { lte: now }, ...(spec.domain === "finance" ? { supersededById: null } : {}) },
    },
    orderBy: spec.order,
    select: cycleSelect,
  });
  return {
    domain: spec.domain,
    previousEvidenceId: previous?.snapshotId ?? null,
    currentEvidenceId: String(current.snapshotId),
    newerEvidence: previous === null || isNewerEvidence(
      { periodEnd: asDate(current.snapshot?.periodEnd), createdAt: currentAt },
      { periodEnd: asDate(previous.snapshot?.periodEnd), createdAt: asDate(previous.snapshot?.createdAt) }
    ),
    at: firstDiagnosedAt,
    previousIssues: previous ? issuesOf(spec.domain, previous.findings ?? []) : {},
    currentIssues: issuesOf(spec.domain, current.findings ?? []),
    // A diagnosis that could not measure (it raised a missing-critical-data finding) cannot prove that an
    // earlier issue went away: its absence is a data gap, never "resolved".
    resolutionUnproven: (current.findings ?? []).some((f) => typeof f?.code === "string" && /_MISSING_CRITICAL_DATA$/.test(f.code)),
  };
}

export interface OwnerChangeFactsInput {
  workspaceId: string;
  businessId: string;
  now: Date;
  /** Completions and target-reached verifications already read by the candidate builder. */
  events: readonly OwnerDecisionEvent[];
  /** Each spine domain's current diagnosis, as loaded by the candidate builder (null when none). */
  currentDiagnoses: Readonly<Partial<Record<SpineDomain, CurrentDiagnosisFacts | null>>>;
  /** Each diagnosed domain's current evidence period end (for "went out of date in the window"). */
  evidencePeriodEnds: Readonly<Record<string, Date | null>>;
  /** Real (active, non-fixture) businesses of the workspace, with creation time. */
  businesses: ReadonlyArray<{ id: string; createdAt: unknown }>;
  /** Workspace-level records attributable to this business now (exactly one real business). */
  workspaceIssuesAttributable: boolean;
  /** Startup sessions whose risks are QA fixtures (Home's own read-time fixture correction). */
  fixtureTaintedStartupSessionIds: readonly string[];
  /** Open critical workspace-level issues (critical risks + unassigned compliance breaches/hard stops). */
  openWorkspaceCriticalCount: number;
}

/** Gather the facts behind "what changed" (read-only; performs no writes). */
export async function gatherOwnerChangeFacts(input: OwnerChangeFactsInput): Promise<OwnerChangeFacts> {
  const { workspaceId, businessId, now } = input;
  const since = new Date(now.getTime() - OWNER_WHAT_CHANGED_WINDOW_DAYS * DAY_MS);

  const transitions = (await Promise.all(CYCLE_MODELS.map((spec) => evidenceTransition(workspaceId, businessId, spec, input.currentDiagnoses[spec.domain] ?? null, now))))
    .filter((t): t is OwnerEvidenceTransition => t !== null);

  // Record lifecycle transitions come from the records' own audit trail (never inferred from absence).
  const recordEvents: AuditFactRow[] = await db.auditEvent.findMany({
    where: {
      workspaceId,
      occurredAt: { gte: since },
      eventName: {
        in: [
          AUDIT_EVENTS.OWNER_COMPLIANCE_BREACH_RECORDED,
          AUDIT_EVENTS.OWNER_COMPLIANCE_STATUS_CHANGED,
          AUDIT_EVENTS.OWNER_COMPLIANCE_REVIEW_COMPLETED,
          AUDIT_EVENTS.OWNER_BUSINESS_RISK_IDENTIFIED,
          AUDIT_EVENTS.OWNER_BUSINESS_RISK_STATUS_CHANGED,
          AUDIT_EVENTS.OWNER_BUSINESS_RISK_RESOLVED,
          AUDIT_EVENTS.OWNER_BUSINESS_RISK_CLOSED,
          AUDIT_EVENTS.OWNER_BUSINESS_RISK_REVIEW_COMPLETED,
          AUDIT_EVENTS.OWNER_BUSINESS_RISK_ACCEPTED,
          AUDIT_EVENTS.OWNER_BUSINESS_UPDATED,
        ],
      },
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: { eventName: true, entityId: true, occurredAt: true, payload: true },
  });
  // The records those events name, in their CURRENT state: a lifecycle claim ("closed", "no longer
  // critical") is made only while the record still says so now. Workspace-scoped; QA fixture risks
  // (flagged, or linked to a fixture-tainted startup session) never count — same correction Home applies.
  const entityIds = [...new Set(recordEvents.map((e) => e.entityId).filter((id): id is string => typeof id === "string"))];
  const fixtureSessionExclusion = input.fixtureTaintedStartupSessionIds.length > 0
    ? { OR: [{ linkedStartupSessionId: null }, { linkedStartupSessionId: { notIn: [...input.fixtureTaintedStartupSessionIds] } }] }
    : {};
  const [complianceRows, riskRows]: [ComplianceFactRow[], RiskFactRow[]] = entityIds.length === 0
    ? [[], []]
    : await Promise.all([
        db.ownerComplianceItem.findMany({ where: { workspaceId, id: { in: entityIds } } }),
        db.businessRiskEntry.findMany({
          where: { workspaceId, id: { in: entityIds }, isFixtureRecord: false, ...fixtureSessionExclusion },
          select: { id: true, title: true, status: true, severity: true, residualRisk: true },
        }),
      ]);
  const complianceById = new Map<string, ComplianceFactRow>(complianceRows.map((c) => [c.id, c]));
  const riskById = new Map<string, RiskFactRow>(riskRows.map((r) => [r.id, r]));
  const recordIssues: OwnerRecordIssueFact[] = [];
  for (const e of recordEvents) {
    const at = asDate(e.occurredAt);
    if (!at || !e.entityId) continue;
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const item = complianceById.get(e.entityId);
    if (item) {
      // This business's own obligation, or an unassigned one only while it is attributable here.
      if (item.businessId !== businessId && !(item.businessId === null && input.workspaceIssuesAttributable)) continue;
      const key = ownerCandidateIssueKey({ domain: "compliance", findingCode: "COMPLIANCE_BREACH", candidateId: `compliance_item:${item.id}`, source: "compliance_item" });
      const title = String(item.name ?? "compliance obligation");
      if (e.eventName === AUDIT_EVENTS.OWNER_COMPLIANCE_BREACH_RECORDED) recordIssues.push({ key, title, change: "appeared", at });
      else if (
        payload.previousStatus === "breached" &&
        typeof payload.newStatus === "string" && COMPLIANCE_CLEARED_STATUSES.has(payload.newStatus) &&
        typeof item.status === "string" && COMPLIANCE_CLEARED_STATUSES.has(item.status) &&
        complianceItemToCandidate(item, { businessId, workspaceId, now }) === null
      ) {
        // Closed only when the breach was cleared to an in-force or waived obligation, the record still
        // says so, and it raises nothing now (pending evidence/review is remediation, not closure; an
        // expired item cleared to "active" is still a hard stop).
        recordIssues.push({ key, title, change: "closed", at });
      }
      continue;
    }
    const risk = riskById.get(e.entityId);
    if (!risk || !input.workspaceIssuesAttributable) continue;
    const key = ownerCandidateIssueKey({ domain: "risk", findingCode: "RISK", candidateId: `business_risk:${risk.id}`, source: "business_risk" });
    const title = String(risk.title ?? "Recorded risk");
    const recordedCritical = typeof risk.severity === "number" && risk.severity >= CRITICAL_RISK_SEVERITY;
    if (e.eventName === AUDIT_EVENTS.OWNER_BUSINESS_RISK_IDENTIFIED) {
      if (typeof payload.severity === "number" && payload.severity >= CRITICAL_RISK_SEVERITY) recordIssues.push({ key, title, change: "appeared", at });
    } else if (e.eventName === AUDIT_EVENTS.OWNER_BUSINESS_RISK_RESOLVED || e.eventName === AUDIT_EVENTS.OWNER_BUSINESS_RISK_CLOSED) {
      // Closed only while its record is still closed (a reopened risk is open again).
      if (recordedCritical && !OPEN_RISK_STATUSES.has(String(risk.status ?? ""))) recordIssues.push({ key, title, change: "closed", at });
    } else if (e.eventName === AUDIT_EVENTS.OWNER_BUSINESS_RISK_ACCEPTED) {
      // Accepted is a deliberate decision to live with the risk — reported as accepted, never as resolved.
      if (recordedCritical && risk.status === "ACCEPTED") recordIssues.push({ key, title, change: "accepted", at });
    } else {
      // Mitigated below critical — only a proven TRANSITION in this event (status moved to MITIGATING, or
      // its residual risk dropped below critical), and only while the record still says so now.
      const newStatus = typeof payload.newStatus === "string" ? payload.newStatus : typeof payload.status === "string" ? payload.status : null;
      const eventResidual = typeof payload.residualRisk === "number" ? payload.residualRisk : null;
      const previousResidual = typeof payload.previousResidualRisk === "number" ? payload.previousResidualRisk : null;
      const transition = typeof payload.previousStatus === "string" &&
        (payload.previousStatus !== "MITIGATING" || previousResidual === null || previousResidual >= CRITICAL_RISK_SEVERITY);
      if (
        newStatus === "MITIGATING" && transition && eventResidual !== null && eventResidual < CRITICAL_RISK_SEVERITY &&
        recordedCritical && risk.status === "MITIGATING" && typeof risk.residualRisk === "number" && risk.residualRisk < CRITICAL_RISK_SEVERITY
      ) {
        recordIssues.push({ key, title, change: "no_longer_critical", at });
      }
    }
  }

  // Attribution of workspace-level issues changes only when a real business is added or archived. It is
  // judged against who was a real, active business at the START of the window: this business alone then
  // and several now → lost; several then and this one alone now → regained. An archival is proven by the
  // business's own OWNER_BUSINESS_UPDATED event changing `isActive` (never by any later edit).
  let attribution: OwnerChangeFacts["attribution"] = null;
  const archivalEvents = recordEvents.filter((e) =>
    e.eventName === AUDIT_EVENTS.OWNER_BUSINESS_UPDATED && e.entityId !== businessId &&
    (e.payload as { isActiveChange?: { to?: unknown } } | null)?.isActiveChange?.to === false
  );
  const archivedInWindow: Array<{ id: string }> = archivalEvents.length === 0 ? [] : await db.ownerBusiness.findMany({
    where: { workspaceId, isActive: false, isFixtureBusiness: false, id: { in: archivalEvents.map((e) => e.entityId) } },
    select: { id: true },
  });
  const archivedIds = new Set(archivedInWindow.map((b) => String(b.id)));
  const self = input.businesses.find((b) => b.id === businessId);
  const selfAt = self ? asDate(self.createdAt) : null;
  const others = input.businesses.filter((b) => b.id !== businessId).map((b) => asDate(b.createdAt)).filter((d): d is Date => d !== null);
  if (selfAt && !input.workspaceIssuesAttributable && others.length > 0) {
    // Lost: just before the first other current business was added (inside the window), this business
    // existed and no other real business was active (a business archived later still counted then).
    const firstAdded = new Date(Math.min(...others.map((d) => d.getTime())));
    if (firstAdded.getTime() >= since.getTime() && selfAt.getTime() < firstAdded.getTime() && archivedIds.size === 0) {
      attribution = { change: "lost", at: firstAdded, openCriticalCount: input.openWorkspaceCriticalCount };
    }
  } else if (selfAt && input.workspaceIssuesAttributable && archivedIds.size > 0) {
    // Regained: a real business active alongside this one was archived inside the window (proven by its
    // own audited isActive change) and this business already existed then.
    const at = archivalEvents.filter((e) => archivedIds.has(String(e.entityId))).map((e) => asDate(e.occurredAt)).filter((d): d is Date => d !== null);
    const last = at.length > 0 ? new Date(Math.max(...at.map((d) => d.getTime()))) : null;
    if (last && selfAt.getTime() < last.getTime()) attribution = { change: "regained", at: last, openCriticalCount: input.openWorkspaceCriticalCount };
  }

  // Evidence that went out of date inside the window (its period passed the freshness limit).
  const newlyStaleDomains: string[] = [];
  // Same boundary as the candidate builder (stale ⇔ periodEnd < now − window). Strategy evaluates a
  // hypothetical plan, not the running business's figures, so it never "goes out of date" here.
  for (const [domain, periodEnd] of Object.entries(input.evidencePeriodEnds)) {
    if (!periodEnd || domain === "strategy") continue;
    const staleAt = periodEnd.getTime() + OWNER_DECISION_STALE_EVIDENCE_DAYS * DAY_MS;
    if (staleAt >= since.getTime() && staleAt < now.getTime()) newlyStaleDomains.push(domain);
  }

  return { since, transitions, events: input.events, recordIssues, attribution, newlyStaleDomains };
}
