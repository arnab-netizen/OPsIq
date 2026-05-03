import { db } from "@/lib/db";

/**
 * Timeline event types for decision lifecycle
 */
export enum TimelineEventType {
  CREATED = "created",
  EVALUATED = "evaluated",
  BLOCKED = "blocked",
  APPROVED = "approved",
  OVERRIDDEN = "overridden",
  EXECUTED = "executed",
}

/**
 * Timeline event with full context
 */
export interface TimelineEvent {
  type: TimelineEventType;
  timestamp: Date;
  status: string;
  eventName: string;
  actor?: string;
  details?: Record<string, any>;
  icon: string;
  label: string;
  color: string;
}

/**
 * Build complete decision timeline from audit events
 */
export async function getDecisionTimeline(
  decisionId: string,
  workspaceId: string
): Promise<{
  decisionId: string;
  createdAt: Date;
  currentStatus: string;
  timeline: TimelineEvent[];
  isComplete: boolean;
}> {
  // Fetch decision
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error("Decision not found");
  }

  // Fetch all relevant audit events
  const auditEvents = await db.auditEvent.findMany({
    where: {
      entityId: decisionId,
      workspaceId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // Build timeline events
  const timeline: TimelineEvent[] = [];

  // Add created event
  timeline.push({
    type: TimelineEventType.CREATED,
    timestamp: decision.createdAt,
    status: "pending",
    eventName: "DECISION_CREATED",
    label: "Created",
    icon: "✓",
    color: "blue",
    details: {
      title: decision.problem,
      description: decision.action,
      confidence: decision.confidence,
    },
  });

  // Process audit events
  for (const event of auditEvents) {
    const metadata = event.metadata || {};

    if (event.eventName === "DECISION_EVALUATED") {
      timeline.push({
        type: TimelineEventType.EVALUATED,
        timestamp: event.createdAt,
        status: "evaluated",
        eventName: event.eventName,
        label: "Evaluated",
        icon: "📊",
        color: "purple",
        details: {
          recommendation: metadata.recommendation,
          block_stage: metadata.block_stage,
          block_reason: metadata.block_reason,
        },
      });
    } else if (event.eventName === "DECISION_BLOCKED") {
      timeline.push({
        type: TimelineEventType.BLOCKED,
        timestamp: event.createdAt,
        status: "blocked",
        eventName: event.eventName,
        label: "Blocked",
        icon: "⚠️",
        color: "red",
        details: {
          block_stage: metadata.block_stage,
          block_reason: metadata.block_reason,
        },
      });
    } else if (event.eventName === "DECISION_APPROVED") {
      timeline.push({
        type: TimelineEventType.APPROVED,
        timestamp: event.createdAt,
        status: "approved",
        eventName: event.eventName,
        label: "Approved",
        icon: "✓",
        color: "green",
        details: {
          action: metadata.action,
        },
      });
    } else if (event.eventName === "DECISION_OVERRIDDEN") {
      timeline.push({
        type: TimelineEventType.OVERRIDDEN,
        timestamp: event.createdAt,
        status: "overridden",
        eventName: event.eventName,
        label: "Overridden",
        icon: "→",
        color: "blue",
        details: {
          override_reason: metadata.override_reason,
          action: metadata.action,
        },
      });
    } else if (event.eventName === "DECISION_EXECUTED") {
      timeline.push({
        type: TimelineEventType.EXECUTED,
        timestamp: event.createdAt,
        status: "executed",
        eventName: event.eventName,
        label: "Executed",
        icon: "✓✓",
        color: "purple",
        details: {
          message: metadata.details?.message,
          executedAt: metadata.details?.startedAt,
        },
      });
    }
  }

  // Check if timeline is complete (has created and final status)
  const hasCreated = timeline.some((e) => e.type === TimelineEventType.CREATED);
  const hasFinalEvent = timeline.some((e) =>
    [TimelineEventType.EXECUTED, TimelineEventType.BLOCKED].includes(e.type)
  );
  const isComplete = hasCreated && hasFinalEvent;

  return {
    decisionId,
    createdAt: decision.createdAt,
    currentStatus: decision.status,
    timeline,
    isComplete,
  };
}

/**
 * Get timeline summary - key milestones only
 */
export async function getTimelineSummary(
  decisionId: string,
  workspaceId: string
): Promise<{
  created?: Date;
  evaluated?: Date;
  blocked?: Date;
  approved?: Date;
  overridden?: Date;
  executed?: Date;
  duration?: string;
}> {
  const fullTimeline = await getDecisionTimeline(decisionId, workspaceId);

  const summary: Record<string, Date> = {};

  for (const event of fullTimeline.timeline) {
    if (
      [
        TimelineEventType.CREATED,
        TimelineEventType.EVALUATED,
        TimelineEventType.BLOCKED,
        TimelineEventType.APPROVED,
        TimelineEventType.OVERRIDDEN,
        TimelineEventType.EXECUTED,
      ].includes(event.type)
    ) {
      summary[event.type] = event.timestamp;
    }
  }

  // Calculate duration if created and final
  let duration: string | undefined;
  if (summary.created && (summary.executed || summary.approved || summary.blocked)) {
    const finalTime = summary.executed || summary.approved || summary.blocked;
    const durationMs = finalTime.getTime() - summary.created.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    duration = `${hours}h ${minutes}m`;
  }

  return {
    ...summary,
    duration,
  };
}

/**
 * Check if decision has reached a milestone
 */
export function hasMilestone(
  timeline: TimelineEvent[],
  type: TimelineEventType
): boolean {
  return timeline.some((e) => e.type === type);
}

/**
 * Get time between two milestones
 */
export function getTimeGap(
  timeline: TimelineEvent[],
  from: TimelineEventType,
  to: TimelineEventType
): number | null {
  const fromEvent = timeline.find((e) => e.type === from);
  const toEvent = timeline.find((e) => e.type === to);

  if (!fromEvent || !toEvent) return null;

  return toEvent.timestamp.getTime() - fromEvent.timestamp.getTime();
}

/**
 * Format time gap as human-readable string
 */
export function formatTimeGap(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
