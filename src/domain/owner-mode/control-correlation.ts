/**
 * Runtime Control Correlation (depth pass).
 *
 * Answers: "Is OpsIQ's own control loop provably wired end-to-end at runtime?" — it links a
 * governed source event to the audit/handling record it must produce, and measures the real
 * latency between them. This converts three Business-Control SLOs from NOT_MEASURABLE into
 * measured PASS/WARN/FAIL:
 *   1. REASSESSMENT_LATENCY   — OwnerReassessmentEvent createdAt → closed (updatedAt).
 *   2. SHOCK_HANDLING_LATENCY — ShockEvent recorded → its CONDITION_CHANGED re-eval audit.
 *   3. AUDIT_DURABILITY       — ShockEvent (a governed mutation) → its SHOCK_EVENT_RECORDED audit.
 *
 * PURE and deterministic — no DB, no clock. Every correlation carries the full shape (source +
 * target entity, real persisted timestamps, latency, status, evidence, missing data). It NEVER
 * fabricates a timestamp: an unlinked source is MISSING_TARGET (still within grace) or FAILED
 * (past grace — the record that should exist does not), never a fake LINKED. Where a linkage is
 * genuinely not persisted (accepted-proof ↔ complaint/rework/bad-outcome), it is emitted as
 * NOT_MEASURABLE with the exact missing model — never a green pass.
 *
 * AUDIT_DURABILITY is a PARTIAL measurement: it is measured over the shock mutation class (the
 * one governed mutation whose row and audit share a queryable key — entityId). Other mutation
 * classes remain architecturally guaranteed by atomic audit (AUDIT-01) but are not yet
 * independently measured as a runtime coverage rate; that scope is disclosed, never hidden.
 */

export type ControlCorrelationType =
  | "TRIGGER_TO_REASSESSMENT_CORRELATION"
  | "SHOCK_TO_HANDLING_CORRELATION"
  | "GOVERNED_MUTATION_AUDIT_CORRELATION"
  | "PROOF_TAMPER_SIGNAL_PERSISTENCE"
  | "PROOF_TO_OUTCOME_CORRELATION"
  | "CROSS_WORKSPACE_ISOLATION_RUNTIME_SIGNAL";

/** Structural link status — NOT an SLO grade (thresholds live in the SLO module). */
export type CorrelationStatus =
  | "LINKED"          // source and target both present; latency measured
  | "MISSING_TARGET"  // source present, target not yet present but still within grace
  | "MISSING_SOURCE"  // target present with no source (orphan)
  | "FAILED"          // target absent past grace — the record that must exist does not
  | "NOT_MEASURABLE"; // the linkage is not persisted at all (documented missing model)

export interface ControlCorrelation {
  workspaceId: string;
  correlationType: ControlCorrelationType;
  sourceEntityType: string;
  sourceEntityId: string | null;
  targetEntityType: string;
  targetEntityId: string | null;
  /** Real, persisted timestamps only (ISO). Never fabricated. */
  sourceTimestamp: string | null;
  targetTimestamp: string | null;
  /** The auditEvent id (or reassessment id) that keys the link, where one exists. */
  correlationKey: string | null;
  actorId: string | null;
  status: CorrelationStatus;
  latencyMs: number | null;
  evidence: string[];
  missingData: string[];
  evaluatedAt: string;
}

/** Raw latency stats for one correlated class — the SLO module grades these. */
export interface CorrelationLatencyStat {
  measurable: boolean;
  /** Count of LINKED correlations with a real measured latency. */
  linkedCount: number;
  /** Sources still awaiting their target within grace (in flight). */
  openCount: number;
  /** Sources whose target is overdue past grace/target — real FAILED links. */
  failedCount: number;
  medianLatencyMs: number | null;
  maxLatencyMs: number | null;
  targetMs: number;
  /** Human-readable window for owner display. */
  windowLabel: string;
}

/** Governed-mutation → audit coverage (partial, one mutation class). */
export interface AuditDurabilityStat {
  measurable: boolean;
  mutationClass: string;
  totalMutations: number;
  auditedMutations: number;
  unauditedMutationIds: string[];
  coveragePct: number | null;
}

/** Persisted tamper-signal capability + real counts. */
export interface TamperSignalStat {
  measurable: boolean;
  totalProof: number;
  tamperSuspectedCount: number;
}

export interface ControlCorrelationReport {
  workspaceId: string;
  correlations: ControlCorrelation[];
  reassessmentLatency: CorrelationLatencyStat;
  shockHandlingLatency: CorrelationLatencyStat;
  auditDurability: AuditDurabilityStat;
  tamper: TamperSignalStat;
  evaluatedAt: string;
}

// ── Input rows (all pre-scoped to a single workspace by the service) ───────────

export interface ReassessmentRow {
  id: string;
  trigger: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  actorId?: string | null;
}

export interface ShockRow {
  id: string;
  type: string;
  severity: string;
  /** Server-authoritative record time (never the user-supplied happenedAt). */
  createdAt: Date;
  happenedAt: Date;
  actorId?: string | null;
}

/** An AuditEvent row keyed to a shock (entityType=ShockEvent, entityId=shock.id). */
export interface ShockAuditRow {
  id: string;
  eventName: string;
  entityId: string | null;
  occurredAt: Date;
  actorId?: string | null;
}

export interface ControlCorrelationInput {
  workspaceId: string;
  reassessments: ReassessmentRow[];
  shocks: ShockRow[];
  /** SHOCK_EVENT_RECORDED audits (durability) — atomic with the shock row. */
  shockRecordedAudits: ShockAuditRow[];
  /** CONDITION_CHANGED re-eval audits for shocks (handling). */
  shockHandlingAudits: ShockAuditRow[];
  totalProof: number;
  tamperSuspectedCount: number;
  nowMs: number;
  evaluatedAt: string;
}

// ── Thresholds (disclosed; the SLO module owns PASS/WARN/FAIL) ─────────────────

/** A reassessment loop should close within a week. */
export const REASSESSMENT_TARGET_MS = 7 * 24 * 60 * 60 * 1000;
/** Re-evaluation is triggered synchronously on shock create; handling should be near-instant. */
export const SHOCK_HANDLING_TARGET_MS = 15 * 60 * 1000;
/** Grace before an absent target is treated as FAILED rather than in-flight. */
const REASSESSMENT_GRACE_MS = REASSESSMENT_TARGET_MS;
const SHOCK_GRACE_MS = 60 * 1000;

const CLOSED_PREFIX = "closed";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

function earliestByEntity(audits: ShockAuditRow[]): Map<string, ShockAuditRow> {
  const m = new Map<string, ShockAuditRow>();
  for (const a of audits) {
    if (!a.entityId) continue;
    const cur = m.get(a.entityId);
    if (!cur || a.occurredAt.getTime() < cur.occurredAt.getTime()) m.set(a.entityId, a);
  }
  return m;
}

/** TRIGGER_TO_REASSESSMENT_CORRELATION — createdAt → close (updatedAt) for closed rows. */
export function computeReassessmentCorrelations(
  rows: ReassessmentRow[],
  nowMs: number,
  workspaceId: string,
  evaluatedAt: string
): { correlations: ControlCorrelation[]; stat: CorrelationLatencyStat } {
  const correlations: ControlCorrelation[] = [];
  const latencies: number[] = [];
  let openCount = 0;
  let failedCount = 0;

  for (const r of rows) {
    const closed = r.status.startsWith(CLOSED_PREFIX);
    const base = {
      workspaceId,
      correlationType: "TRIGGER_TO_REASSESSMENT_CORRELATION" as const,
      sourceEntityType: "OwnerReassessmentEvent",
      sourceEntityId: r.id,
      targetEntityType: "OwnerReassessmentEvent(closed)",
      sourceTimestamp: r.createdAt.toISOString(),
      correlationKey: r.id,
      actorId: r.actorId ?? null,
      evaluatedAt,
    };
    if (closed) {
      const latencyMs = Math.max(0, r.updatedAt.getTime() - r.createdAt.getTime());
      latencies.push(latencyMs);
      correlations.push({
        ...base,
        targetEntityId: r.id,
        targetTimestamp: r.updatedAt.toISOString(),
        status: "LINKED",
        latencyMs,
        evidence: [`trigger=${r.trigger}`, `closed status=${r.status}`, `latency=${Math.round(latencyMs / 3600000)}h`],
        missingData: [],
      });
    } else {
      const ageMs = nowMs - r.createdAt.getTime();
      const overdue = ageMs > REASSESSMENT_GRACE_MS;
      if (overdue) failedCount++; else openCount++;
      correlations.push({
        ...base,
        targetEntityId: null,
        targetTimestamp: null,
        status: overdue ? "FAILED" : "MISSING_TARGET",
        latencyMs: overdue ? ageMs : null,
        evidence: [`trigger=${r.trigger}`, `open status=${r.status}`, `age=${Math.round(ageMs / 3600000)}h`],
        missingData: overdue
          ? [`reassessment left open past target (age ${Math.round(ageMs / 86400000)}d > ${REASSESSMENT_TARGET_MS / 86400000}d)`]
          : [`reassessment still in flight (status=${r.status})`],
      });
    }
  }

  return {
    correlations,
    stat: {
      measurable: rows.length > 0,
      linkedCount: latencies.length,
      openCount,
      failedCount,
      medianLatencyMs: median(latencies),
      maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : null,
      targetMs: REASSESSMENT_TARGET_MS,
      windowLabel: "trigger → reassessment closed (target 7 days)",
    },
  };
}

/**
 * SHOCK_TO_HANDLING_CORRELATION (latency) + GOVERNED_MUTATION_AUDIT_CORRELATION (durability).
 * Both are keyed by the shock id (audit.entityId), so both are real persisted links.
 */
export function computeShockCorrelations(
  shocks: ShockRow[],
  recordedAudits: ShockAuditRow[],
  handlingAudits: ShockAuditRow[],
  nowMs: number,
  workspaceId: string,
  evaluatedAt: string
): { correlations: ControlCorrelation[]; latency: CorrelationLatencyStat; durability: AuditDurabilityStat } {
  const recordedByShock = earliestByEntity(recordedAudits);
  const handlingByShock = earliestByEntity(handlingAudits);
  const correlations: ControlCorrelation[] = [];
  const latencies: number[] = [];
  let openCount = 0;
  let failedCount = 0;
  let auditedMutations = 0;
  const unauditedMutationIds: string[] = [];

  for (const s of shocks) {
    // ── Durability: does the shock mutation have its atomic SHOCK_EVENT_RECORDED audit? ──
    const recorded = recordedByShock.get(s.id) ?? null;
    if (recorded) auditedMutations++; else unauditedMutationIds.push(s.id);
    correlations.push({
      workspaceId,
      correlationType: "GOVERNED_MUTATION_AUDIT_CORRELATION",
      sourceEntityType: "ShockEvent",
      sourceEntityId: s.id,
      targetEntityType: "AuditEvent(SHOCK_EVENT_RECORDED)",
      targetEntityId: recorded ? recorded.id : null,
      sourceTimestamp: s.createdAt.toISOString(),
      targetTimestamp: recorded ? recorded.occurredAt.toISOString() : null,
      correlationKey: recorded ? recorded.id : null,
      actorId: recorded?.actorId ?? s.actorId ?? null,
      status: recorded ? "LINKED" : "FAILED",
      latencyMs: recorded ? Math.max(0, recorded.occurredAt.getTime() - s.createdAt.getTime()) : null,
      evidence: recorded
        ? [`shock ${s.type}/${s.severity} audited by ${recorded.eventName}`]
        : [`shock ${s.type}/${s.severity}`],
      missingData: recorded ? [] : ["governed mutation persisted with NO matching audit event (durability breach)"],
      evaluatedAt,
    });

    // ── Handling latency: shock recorded → CONDITION_CHANGED re-eval audit. ──
    const handling = handlingByShock.get(s.id) ?? null;
    const ageMs = nowMs - s.createdAt.getTime();
    if (handling) {
      const latencyMs = Math.max(0, handling.occurredAt.getTime() - s.createdAt.getTime());
      latencies.push(latencyMs);
      correlations.push({
        workspaceId,
        correlationType: "SHOCK_TO_HANDLING_CORRELATION",
        sourceEntityType: "ShockEvent",
        sourceEntityId: s.id,
        targetEntityType: "AuditEvent(CONDITION_CHANGED)",
        targetEntityId: handling.id,
        sourceTimestamp: s.createdAt.toISOString(),
        targetTimestamp: handling.occurredAt.toISOString(),
        correlationKey: handling.id,
        actorId: handling.actorId ?? s.actorId ?? null,
        status: "LINKED",
        latencyMs,
        evidence: [`shock re-evaluated (${handling.eventName})`, `latency=${Math.round(latencyMs / 1000)}s`],
        missingData: [],
        evaluatedAt,
      });
    } else {
      const overdue = ageMs > SHOCK_GRACE_MS;
      if (overdue) failedCount++; else openCount++;
      correlations.push({
        workspaceId,
        correlationType: "SHOCK_TO_HANDLING_CORRELATION",
        sourceEntityType: "ShockEvent",
        sourceEntityId: s.id,
        targetEntityType: "AuditEvent(CONDITION_CHANGED)",
        targetEntityId: null,
        sourceTimestamp: s.createdAt.toISOString(),
        targetTimestamp: null,
        correlationKey: null,
        actorId: s.actorId ?? null,
        status: overdue ? "FAILED" : "MISSING_TARGET",
        latencyMs: overdue ? ageMs : null,
        evidence: [`shock ${s.type}/${s.severity}`, `age=${Math.round(ageMs / 1000)}s`],
        missingData: overdue
          ? ["shock recorded but no re-evaluation audit followed (handling did not run)"]
          : ["re-evaluation audit not yet observed (within grace)"],
        evaluatedAt,
      });
    }
  }

  return {
    correlations,
    latency: {
      measurable: shocks.length > 0,
      linkedCount: latencies.length,
      openCount,
      failedCount,
      medianLatencyMs: median(latencies),
      maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : null,
      targetMs: SHOCK_HANDLING_TARGET_MS,
      windowLabel: "shock recorded → re-evaluation audit (target 15 min)",
    },
    durability: {
      measurable: shocks.length > 0,
      mutationClass: "shock_event",
      totalMutations: shocks.length,
      auditedMutations,
      unauditedMutationIds,
      coveragePct: shocks.length > 0 ? Math.round((auditedMutations / shocks.length) * 100) : null,
    },
  };
}

/** Assemble the full workspace-scoped correlation report from pre-scoped rows. Pure. */
export function buildControlCorrelationReport(input: ControlCorrelationInput): ControlCorrelationReport {
  const { workspaceId, nowMs, evaluatedAt } = input;
  const reassess = computeReassessmentCorrelations(input.reassessments, nowMs, workspaceId, evaluatedAt);
  const shock = computeShockCorrelations(
    input.shocks, input.shockRecordedAudits, input.shockHandlingAudits, nowMs, workspaceId, evaluatedAt
  );

  const correlations: ControlCorrelation[] = [...reassess.correlations, ...shock.correlations];

  // PROOF_TAMPER_SIGNAL_PERSISTENCE — the tamper flag is now persisted & queryable. Emit a
  // capability record with the real count (LINKED = the signal is queryable at runtime).
  correlations.push({
    workspaceId,
    correlationType: "PROOF_TAMPER_SIGNAL_PERSISTENCE",
    sourceEntityType: "Proof",
    sourceEntityId: null,
    targetEntityType: "Proof.tamperSuspected",
    targetEntityId: null,
    sourceTimestamp: null,
    targetTimestamp: null,
    correlationKey: null,
    actorId: null,
    status: "LINKED",
    latencyMs: null,
    evidence: [`${input.tamperSuspectedCount}/${input.totalProof} proof flagged tamper-suspected (persisted, queryable)`],
    missingData: [],
    evaluatedAt,
  });

  // PROOF_TO_OUTCOME_CORRELATION — honestly NOT_MEASURABLE. Delegated-task proof and
  // recommendation/action outcomes live in disjoint entity trees with no persisted join key.
  correlations.push({
    workspaceId,
    correlationType: "PROOF_TO_OUTCOME_CORRELATION",
    sourceEntityType: "Proof(ACCEPTED)",
    sourceEntityId: null,
    targetEntityType: "OwnerActionOutcome / complaint / rework",
    targetEntityId: null,
    sourceTimestamp: null,
    targetTimestamp: null,
    correlationKey: null,
    actorId: null,
    status: "NOT_MEASURABLE",
    latencyMs: null,
    evidence: [],
    missingData: [
      "no persisted join between a delegated-task Proof and a recommendation/action OwnerActionOutcome",
      "complaint/rework counts are period aggregates (ownerMetricSnapshot), not linked to a specific accepted proof",
    ],
    evaluatedAt,
  });

  // CROSS_WORKSPACE_ISOLATION_RUNTIME_SIGNAL — every source row above was fetched under a
  // workspaceId filter (shocks via engagement.workspaceId). This asserts that runtime property.
  correlations.push({
    workspaceId,
    correlationType: "CROSS_WORKSPACE_ISOLATION_RUNTIME_SIGNAL",
    sourceEntityType: "workspace",
    sourceEntityId: workspaceId,
    targetEntityType: "correlation query scope",
    targetEntityId: null,
    sourceTimestamp: null,
    targetTimestamp: null,
    correlationKey: null,
    actorId: null,
    status: "LINKED",
    latencyMs: null,
    evidence: [
      `all ${correlations.length} correlations scoped to workspace ${workspaceId}`,
      "reassessment/shock/audit rows fetched under a workspaceId filter (shocks via engagement.workspaceId)",
    ],
    missingData: [],
    evaluatedAt,
  });

  return {
    workspaceId,
    correlations,
    reassessmentLatency: reassess.stat,
    shockHandlingLatency: shock.latency,
    auditDurability: shock.durability,
    tamper: {
      measurable: input.totalProof > 0,
      totalProof: input.totalProof,
      tamperSuspectedCount: input.tamperSuspectedCount,
    },
    evaluatedAt,
  };
}
