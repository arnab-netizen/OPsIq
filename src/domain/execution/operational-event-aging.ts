/**
 * Operational-event resolution + aging — PURE domain rules.
 *
 * Makes complaint/rework events time-sensitive and business-actionable. It owns:
 *   - the minimal status vocabulary (OPEN | IN_REVIEW | RESOLVED | DISMISSED | DUPLICATE);
 *   - the allowed status-transition FSM (fail-closed: a resolution/dismissal requires a note, a
 *     dismissal requires a reason — no silent dismissal of a severe event);
 *   - severity-scaled aging thresholds (age is computed from the server-trusted createdAt only);
 *   - the owner-facing aging summary (open / overdue counts, the top unresolved event, an
 *     escalation/reassessment trigger for overdue-severe events).
 *
 * It fabricates nothing: an event's age is real elapsed time; a resolved/dismissed/duplicate event
 * stops driving live risk (it is no longer "active"). Historical linkage/integrity facts are graded
 * elsewhere — this module governs the live, unresolved-risk view.
 */

export enum OperationalEventStatus {
  OPEN = "OPEN",
  IN_REVIEW = "IN_REVIEW",
  RESOLVED = "RESOLVED",
  DISMISSED = "DISMISSED",
  DUPLICATE = "DUPLICATE",
}

export type EventSeverityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Statuses where the event is still live and drives current business risk. */
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set<string>([
  OperationalEventStatus.OPEN,
  OperationalEventStatus.IN_REVIEW,
]);
/** Terminal statuses — the event no longer drives current risk. */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set<string>([
  OperationalEventStatus.RESOLVED,
  OperationalEventStatus.DISMISSED,
  OperationalEventStatus.DUPLICATE,
]);

export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}
export function isValidStatus(status: unknown): status is OperationalEventStatus {
  return typeof status === "string" && (Object.values(OperationalEventStatus) as string[]).includes(status);
}

const H = 60 * 60 * 1000;
/**
 * Severity-scaled resolution SLA (ms). An active event older than its threshold is OVERDUE. Tuned
 * for an owner-run laundry/dry-cleaning business where a severe complaint must be handled same-day.
 */
export const OVERDUE_THRESHOLD_MS: Record<EventSeverityLevel, number> = {
  CRITICAL: 24 * H, // same day
  HIGH: 48 * H,     // 2 days
  MEDIUM: 120 * H,  // 5 days
  LOW: 240 * H,     // 10 days
};

const SEV_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const HIGH_SEVERITY: ReadonlySet<string> = new Set<string>(["HIGH", "CRITICAL"]);

function thresholdFor(severity: string): number {
  return OVERDUE_THRESHOLD_MS[(severity as EventSeverityLevel)] ?? OVERDUE_THRESHOLD_MS.MEDIUM;
}

// ── status-change validation ──────────────────────────────────────────────────

export interface StatusChangeRequest {
  currentStatus: string;
  targetStatus: unknown;
  severity: string;
  /** Free-text resolution note (required for RESOLVED / DISMISSED / DUPLICATE). */
  note?: unknown;
  /** Reason (required for DISMISSED — never silently drop a complaint/rework). */
  reason?: unknown;
}
export interface StatusChangePlan {
  targetStatus: OperationalEventStatus;
  resolutionNote: string | null;
  reason: string | null;
  outcome: string | null;
  isTerminal: boolean;
}
export type StatusChangeValidation = { ok: true; plan: StatusChangePlan } | { ok: false; reason: string };

const MIN_NOTE = 3;

const OUTCOME_BY_STATUS: Partial<Record<OperationalEventStatus, string>> = {
  [OperationalEventStatus.RESOLVED]: "RESOLVED_FIXED",
  [OperationalEventStatus.DISMISSED]: "DISMISSED_NOT_VALID",
  [OperationalEventStatus.DUPLICATE]: "DUPLICATE",
};

/**
 * Validate a status transition, fail-closed. Allowed transitions:
 *   OPEN      → IN_REVIEW | RESOLVED | DISMISSED | DUPLICATE
 *   IN_REVIEW → RESOLVED | DISMISSED | DUPLICATE | OPEN
 * A terminal status (RESOLVED/DISMISSED/DUPLICATE) cannot transition further (the caller treats a
 * same-status request as idempotent, handled in the service, not here). RESOLVED/DISMISSED/DUPLICATE
 * require a note; DISMISSED additionally requires a reason.
 */
export function planStatusChange(req: StatusChangeRequest): StatusChangeValidation {
  if (!isValidStatus(req.targetStatus)) {
    return { ok: false, reason: "targetStatus must be OPEN, IN_REVIEW, RESOLVED, DISMISSED, or DUPLICATE." };
  }
  const target = req.targetStatus;

  if (isTerminalStatus(req.currentStatus)) {
    return { ok: false, reason: `Event is already ${req.currentStatus}; a terminal event cannot be re-transitioned.` };
  }
  if (target === OperationalEventStatus.OPEN && req.currentStatus !== OperationalEventStatus.IN_REVIEW) {
    return { ok: false, reason: "Only an in-review event can be reopened to OPEN." };
  }

  const isTerminal = isTerminalStatus(target);
  let resolutionNote: string | null = null;
  let reason: string | null = null;

  if (isTerminal) {
    const note = typeof req.note === "string" ? req.note.trim() : "";
    if (note.length < MIN_NOTE) {
      return { ok: false, reason: `A resolution note is required to mark an event ${target}.` };
    }
    resolutionNote = note;
    if (target === OperationalEventStatus.DISMISSED) {
      const r = typeof req.reason === "string" ? req.reason.trim() : "";
      if (r.length < MIN_NOTE) {
        return { ok: false, reason: "A dismissal reason is required — a complaint/rework is never silently dropped." };
      }
      reason = r;
    }
  }

  return {
    ok: true,
    plan: { targetStatus: target, resolutionNote, reason, outcome: OUTCOME_BY_STATUS[target] ?? null, isTerminal },
  };
}

// ── aging analysis ─────────────────────────────────────────────────────────────

/** A persisted operational-event row, minimal fields needed for aging. */
export interface AgingEventRow {
  id: string;
  eventType: string;
  category: string;
  severity: string;
  status: string;
  relatedProofId: string | null;
  relatedActionId: string | null;
  description: string;
  createdAt: Date;    // server-trusted
  resolvedAt: Date | null;
  updatedAt: Date;
}

export interface AgedEvent {
  eventId: string;
  eventType: string;
  category: string;
  severity: string;
  status: string;
  active: boolean;
  relatedProofId: string | null;
  relatedActionId: string | null;
  /** Elapsed time since the event was recorded (server-trusted). */
  ageMs: number;
  /** Elapsed unresolved time — same as ageMs while active; frozen at resolution otherwise. */
  unresolvedAgeMs: number;
  overdue: boolean;
  thresholdMs: number;
  ownerRisk: string;
  recommendedAction: string;
  escalationTrigger: string | null;
}

export interface OperationalEventAgingSummary {
  workspaceId: string;
  openCount: number;
  inReviewCount: number;
  activeCount: number;
  overdueCount: number;
  overdueSevereCount: number;
  resolvedCount: number;
  dismissedCount: number;
  duplicateCount: number;
  /** The single highest-priority active event (overdue+severity, then oldest). */
  topActiveEvent: AgedEvent | null;
  /** Any overdue-severe active event triggers escalation/reassessment. */
  escalationTriggered: boolean;
  recommendedAction: string;
  events: AgedEvent[];
  evaluatedAt: string;
}

function riskFor(active: boolean, overdue: boolean, severity: string, ageDays: number): string {
  if (!active) return "Event is closed — no live risk.";
  if (overdue) {
    return HIGH_SEVERITY.has(severity)
      ? `Overdue ${severity} event (${ageDays}d unresolved) — active, escalating business risk.`
      : `Overdue ${severity} event (${ageDays}d unresolved) — needs attention.`;
  }
  return `Open ${severity} event (${ageDays}d) — within the resolution window.`;
}

/** Rank an active aged event: overdue first, then severity, then oldest. Higher = more urgent. */
function urgencyScore(e: AgedEvent): number {
  return (e.overdue ? 1_000_000 : 0) + (SEV_RANK[e.severity] ?? 0) * 100_000 + Math.min(99_999, Math.round(e.ageMs / 60_000));
}

/** Build the owner-facing aging summary for a workspace's operational events. Pure. */
export function buildOperationalEventAging(
  workspaceId: string,
  events: AgingEventRow[],
  nowMs: number,
  evaluatedAt: string
): OperationalEventAgingSummary {
  const aged: AgedEvent[] = events.map((e) => {
    const active = isActiveStatus(e.status);
    const createdMs = e.createdAt.getTime();
    const ageMs = Math.max(0, nowMs - createdMs);
    const endMs = active ? nowMs : (e.resolvedAt ? e.resolvedAt.getTime() : e.updatedAt.getTime());
    const unresolvedAgeMs = Math.max(0, endMs - createdMs);
    const thresholdMs = thresholdFor(e.severity);
    const overdue = active && unresolvedAgeMs > thresholdMs;
    const ageDays = Math.floor(ageMs / (24 * H));
    const isComplaint = e.eventType === "COMPLAINT";
    return {
      eventId: e.id, eventType: e.eventType, category: e.category, severity: e.severity, status: e.status, active,
      relatedProofId: e.relatedProofId, relatedActionId: e.relatedActionId,
      ageMs, unresolvedAgeMs, overdue, thresholdMs,
      ownerRisk: riskFor(active, overdue, e.severity, ageDays),
      recommendedAction: !active
        ? "No action — the event is closed."
        : overdue
          ? `Resolve or dismiss this overdue ${isComplaint ? "complaint" : "rework"} now (it is past its ${Math.round(thresholdMs / (24 * H))}-day window); record a resolution note.`
          : `Work the ${isComplaint ? "complaint" : "rework"} to resolution before it ages past its window.`,
      escalationTrigger: overdue && HIGH_SEVERITY.has(e.severity)
        ? "overdue severe operational event — route to owner reassessment"
        : null,
    };
  });

  const active = aged.filter((e) => e.active);
  const overdue = active.filter((e) => e.overdue);
  const overdueSevere = overdue.filter((e) => HIGH_SEVERITY.has(e.severity));
  const byStatus = (s: string): number => aged.filter((e) => e.status === s).length;

  const topActiveEvent = active.length > 0
    ? [...active].sort((a, b) => urgencyScore(b) - urgencyScore(a))[0]
    : null;

  const escalationTriggered = overdueSevere.length > 0;
  const recommendedAction = escalationTriggered
    ? `Escalate: ${overdueSevere.length} overdue severe operational event(s) need owner attention and reassessment.`
    : overdue.length > 0
      ? `Clear ${overdue.length} overdue operational event(s) before they compound.`
      : active.length > 0
        ? `${active.length} operational event(s) open and within window — keep them moving to resolution.`
        : "No open operational events.";

  return {
    workspaceId,
    openCount: byStatus(OperationalEventStatus.OPEN),
    inReviewCount: byStatus(OperationalEventStatus.IN_REVIEW),
    activeCount: active.length,
    overdueCount: overdue.length,
    overdueSevereCount: overdueSevere.length,
    resolvedCount: byStatus(OperationalEventStatus.RESOLVED),
    dismissedCount: byStatus(OperationalEventStatus.DISMISSED),
    duplicateCount: byStatus(OperationalEventStatus.DUPLICATE),
    topActiveEvent, escalationTriggered, recommendedAction,
    events: aged, evaluatedAt,
  };
}
