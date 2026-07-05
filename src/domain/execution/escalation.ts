/**
 * Employee blocker / clarification / escalation routing (Slice 9, pure logic).
 *
 * Deterministic, fail-closed routing of employee-raised blockers to the correct
 * authority (owner / manager / supervisor) with a severity and response SLA, plus
 * a resolution rule that forbids silently closing an unresolved escalation. AI may
 * only answer a clarification that is strictly inside the approved boundary;
 * anything outside is escalated, never answered.
 *
 * Persistence (the Prisma Escalation table) is MIGRATION_LANE_PENDING.
 */

export enum BlockerType {
  CUSTOMER_UNAVAILABLE = "customer_unavailable",
  CUSTOMER_COMPLAINT = "customer_complaint",
  DISCOUNT_REQUEST = "discount_request",
  REFUND_REQUEST = "refund_request",
  STAFF_ABSENT = "staff_absent",
  MACHINE_ISSUE = "machine_issue",
  VEHICLE_ISSUE = "vehicle_issue",
  STOCK_ISSUE = "stock_issue",
  PAYMENT_ISSUE = "payment_issue",
  LOST_OR_DAMAGED_ITEM = "lost_or_damaged_item",
  INSTRUCTION_UNCLEAR = "instruction_unclear",
  DEADLINE_UNREALISTIC = "deadline_unrealistic",
  OWNER_APPROVAL_NEEDED = "owner_approval_needed",
  EMPLOYEE_OVERLOADED = "employee_overloaded",
  SITE_HAZARD = "site_hazard",
}

export enum EscalationSeverity {
  INFO = "INFO",
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL_OWNER_NOW = "CRITICAL_OWNER_NOW",
}

export enum EscalationTarget {
  SUPERVISOR = "SUPERVISOR",
  MANAGER = "MANAGER",
  OWNER = "OWNER",
  MANAGER_AND_OWNER = "MANAGER_AND_OWNER",
}

export enum EscalationStatus {
  OPEN = "OPEN",
  ACKNOWLEDGED = "ACKNOWLEDGED",
  IN_REVIEW = "IN_REVIEW",
  RESOLVED = "RESOLVED",
}

export const VALID_ESCALATION_TRANSITIONS: Record<EscalationStatus, EscalationStatus[]> = {
  [EscalationStatus.OPEN]: [EscalationStatus.ACKNOWLEDGED, EscalationStatus.IN_REVIEW, EscalationStatus.RESOLVED],
  [EscalationStatus.ACKNOWLEDGED]: [EscalationStatus.IN_REVIEW, EscalationStatus.RESOLVED],
  [EscalationStatus.IN_REVIEW]: [EscalationStatus.RESOLVED],
  [EscalationStatus.RESOLVED]: [],
};

const SLA_BY_SEVERITY: Record<EscalationSeverity, number | null> = {
  [EscalationSeverity.CRITICAL_OWNER_NOW]: 15,
  [EscalationSeverity.HIGH]: 60,
  [EscalationSeverity.MEDIUM]: 240,
  [EscalationSeverity.LOW]: 1440,
  [EscalationSeverity.INFO]: null,
};

export function responseSlaMinutes(severity: EscalationSeverity): number | null {
  return SLA_BY_SEVERITY[severity];
}

export interface EscalationContext {
  /** A discount/spend/promise exceeds the owner-approved boundary. */
  beyondBoundary?: boolean;
  /** Payment mismatch or complaint judged high-risk. */
  highRisk?: boolean;
  /** A recurring occurrence (e.g. repeated staff absence). */
  repeated?: boolean;
  /** Explicit severity hint for complaints. */
  complaintSeverity?: EscalationSeverity;
}

export interface EscalationRoute {
  target: EscalationTarget;
  severity: EscalationSeverity;
  responseSlaMinutes: number | null;
  requiresOwner: boolean;
}

function route(
  target: EscalationTarget,
  severity: EscalationSeverity
): EscalationRoute {
  return {
    target,
    severity,
    responseSlaMinutes: SLA_BY_SEVERITY[severity],
    requiresOwner:
      target === EscalationTarget.OWNER ||
      target === EscalationTarget.MANAGER_AND_OWNER,
  };
}

/**
 * Deterministic routing policy. Financial, refund, lost/damaged, and safety/legal
 * matters always reach the owner; complaints and payment issues escalate by risk;
 * staff absence routes to a supervisor unless repeated/high-risk.
 */
export function routeEscalation(
  blocker: BlockerType,
  ctx: EscalationContext = {}
): EscalationRoute {
  switch (blocker) {
    case BlockerType.REFUND_REQUEST:
      return route(EscalationTarget.OWNER, EscalationSeverity.HIGH);

    case BlockerType.DISCOUNT_REQUEST:
      // A discount beyond the approved boundary must reach the owner.
      return ctx.beyondBoundary
        ? route(EscalationTarget.OWNER, EscalationSeverity.HIGH)
        : route(EscalationTarget.MANAGER, EscalationSeverity.MEDIUM);

    case BlockerType.LOST_OR_DAMAGED_ITEM:
      return route(EscalationTarget.OWNER, EscalationSeverity.HIGH);

    case BlockerType.SITE_HAZARD:
      return route(EscalationTarget.OWNER, EscalationSeverity.CRITICAL_OWNER_NOW);

    case BlockerType.PAYMENT_ISSUE:
      return ctx.highRisk
        ? route(EscalationTarget.MANAGER_AND_OWNER, EscalationSeverity.HIGH)
        : route(EscalationTarget.MANAGER, EscalationSeverity.MEDIUM);

    case BlockerType.CUSTOMER_COMPLAINT: {
      const sev = ctx.complaintSeverity ?? EscalationSeverity.MEDIUM;
      const ownerLevel =
        sev === EscalationSeverity.HIGH || sev === EscalationSeverity.CRITICAL_OWNER_NOW;
      return ownerLevel
        ? route(EscalationTarget.OWNER, sev)
        : route(EscalationTarget.MANAGER, sev);
    }

    case BlockerType.STAFF_ABSENT:
      return ctx.repeated || ctx.highRisk
        ? route(EscalationTarget.OWNER, EscalationSeverity.HIGH)
        : route(EscalationTarget.SUPERVISOR, EscalationSeverity.MEDIUM);

    case BlockerType.OWNER_APPROVAL_NEEDED:
      return route(EscalationTarget.OWNER, EscalationSeverity.HIGH);

    case BlockerType.MACHINE_ISSUE:
    case BlockerType.VEHICLE_ISSUE:
    case BlockerType.STOCK_ISSUE:
    case BlockerType.EMPLOYEE_OVERLOADED:
    case BlockerType.DEADLINE_UNREALISTIC:
      return route(EscalationTarget.MANAGER, EscalationSeverity.MEDIUM);

    case BlockerType.CUSTOMER_UNAVAILABLE:
    case BlockerType.INSTRUCTION_UNCLEAR:
      return route(EscalationTarget.MANAGER, EscalationSeverity.LOW);

    default:
      // Fail closed: unknown blockers go to the owner.
      return route(EscalationTarget.OWNER, EscalationSeverity.HIGH);
  }
}

/** An escalation surfaces on the owner dashboard if it targets the owner or is severe. */
export function appearsInOwnerDashboard(route: EscalationRoute): boolean {
  return (
    route.requiresOwner ||
    route.severity === EscalationSeverity.CRITICAL_OWNER_NOW ||
    route.severity === EscalationSeverity.HIGH
  );
}

export interface AcknowledgementDecision {
  allowed: boolean;
  /** True when the escalation is already acknowledged/resolved — the action is an idempotent no-op. */
  alreadyAcknowledged: boolean;
  reason: string;
}

/**
 * An escalation may be ACKNOWLEDGED only from OPEN, by a named acknowledger. Acknowledging an already
 * acknowledged/in-review/resolved escalation is an idempotent no-op (not an error), so a double-submit
 * never fails and never overwrites the original acknowledgement time.
 */
export function planEscalationAcknowledgement(
  from: EscalationStatus,
  acknowledgedBy: string | null | undefined
): AcknowledgementDecision {
  if (!acknowledgedBy) {
    return { allowed: false, alreadyAcknowledged: false, reason: "An acknowledger is required to acknowledge an escalation." };
  }
  if (from !== EscalationStatus.OPEN) {
    // ACKNOWLEDGED / IN_REVIEW / RESOLVED are all "already handled" — idempotent success, no mutation.
    return { allowed: false, alreadyAcknowledged: true, reason: `Escalation already ${from.toLowerCase()}.` };
  }
  return { allowed: true, alreadyAcknowledged: false, reason: "ok" };
}

export interface ResolutionDecision {
  allowed: boolean;
  reason: string;
}

/**
 * An escalation may only be RESOLVED with a non-empty resolution note and a
 * resolver — it can never be silently closed.
 */
export function planEscalationResolution(
  from: EscalationStatus,
  resolutionNote: string | null | undefined,
  resolvedBy: string | null | undefined
): ResolutionDecision {
  if (!VALID_ESCALATION_TRANSITIONS[from].includes(EscalationStatus.RESOLVED)) {
    return { allowed: false, reason: `Cannot resolve from ${from}.` };
  }
  if (!resolutionNote || resolutionNote.trim().length === 0) {
    return { allowed: false, reason: "A resolution note is required to close an escalation." };
  }
  if (!resolvedBy) {
    return { allowed: false, reason: "A resolver is required to close an escalation." };
  }
  return { allowed: true, reason: "ok" };
}

/**
 * Whether an employee clarification can be answered directly (strictly inside the
 * approved boundary) or must be escalated. Fail-closed: anything not clearly inside
 * is escalated, never answered (AI must not answer outside the boundary).
 */
export function classifyClarification(insideBoundary: boolean): {
  answerable: boolean;
  action: "ANSWER" | "ESCALATE";
} {
  return insideBoundary
    ? { answerable: true, action: "ANSWER" }
    : { answerable: false, action: "ESCALATE" };
}
