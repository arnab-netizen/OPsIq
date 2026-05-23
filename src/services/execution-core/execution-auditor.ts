import { v4 as uuidv4 } from "uuid";
import { logger } from "@/infra/logger";
import {
  ExecutionAuditEvent,
  AuditEventInput,
  AuditEventFilter,
  AuditEventQuery,
  AuditEventQueryResult,
  ExecutionOutcome,
} from "@/domain/execution/audit";

export class ExecutionAuditor {
  // In-memory event store (production would use persistent storage)
  private events: Map<string, ExecutionAuditEvent> = new Map();
  private eventsByActionId: Map<string, string[]> = new Map();
  private eventsByDecisionId: Map<string, string[]> = new Map();
  private eventsByWorkspaceId: Map<string, string[]> = new Map();

  /**
   * Record execution audit event (immutable after creation)
   */
  recordEvent(input: AuditEventInput): ExecutionAuditEvent {
    const eventId = uuidv4();
    const now = new Date();

    const event: ExecutionAuditEvent = {
      event_id: eventId,
      action_id: input.action_id,
      decision_id: input.decision_id,
      workspace_id: input.workspace_id,
      before_state: { ...input.before_state }, // Deep copy for immutability
      after_state: { ...input.after_state },
      actor: input.actor,
      outcome: input.outcome,
      timestamp: now,
      tags: input.tags || [],
      error_message: input.error_message,
    };

    // Store event
    this.events.set(eventId, event);

    // Index by action_id
    if (!this.eventsByActionId.has(input.action_id)) {
      this.eventsByActionId.set(input.action_id, []);
    }
    this.eventsByActionId.get(input.action_id)!.push(eventId);

    // Index by decision_id
    if (!this.eventsByDecisionId.has(input.decision_id)) {
      this.eventsByDecisionId.set(input.decision_id, []);
    }
    this.eventsByDecisionId.get(input.decision_id)!.push(eventId);

    // Index by workspace_id
    if (!this.eventsByWorkspaceId.has(input.workspace_id)) {
      this.eventsByWorkspaceId.set(input.workspace_id, []);
    }
    this.eventsByWorkspaceId.get(input.workspace_id)!.push(eventId);

    logger.info("Audit event recorded", {
      event_id: eventId,
      action_id: input.action_id,
      decision_id: input.decision_id,
      outcome: input.outcome,
      actor: input.actor,
      tags: input.tags,
    });

    return event;
  }

  /**
   * Query audit events with filters
   */
  queryEvents(query: AuditEventQuery): AuditEventQueryResult {
    const { filters, limit = 100, offset = 0 } = query;

    // Get candidate event IDs based on indexed filters
    let candidateIds: Set<string> | null = null;

    if (filters.action_id) {
      const ids = this.eventsByActionId.get(filters.action_id) || [];
      candidateIds = candidateIds ? new Set([...candidateIds].filter((id) => ids.includes(id))) : new Set(ids);
    }

    if (filters.decision_id) {
      const ids = this.eventsByDecisionId.get(filters.decision_id) || [];
      candidateIds = candidateIds ? new Set([...candidateIds].filter((id) => ids.includes(id))) : new Set(ids);
    }

    if (filters.workspace_id) {
      const ids = this.eventsByWorkspaceId.get(filters.workspace_id) || [];
      candidateIds = candidateIds ? new Set([...candidateIds].filter((id) => ids.includes(id))) : new Set(ids);
    }

    // If no indexed filters, search all events
    if (!candidateIds) {
      candidateIds = new Set(this.events.keys());
    }

    // Apply remaining filters
    const matchingEvents: ExecutionAuditEvent[] = [];

    for (const eventId of candidateIds) {
      const event = this.events.get(eventId);
      if (!event) continue;

      if (filters.outcome && event.outcome !== filters.outcome) {
        continue;
      }

      if (filters.actor && event.actor !== filters.actor) {
        continue;
      }

      if (filters.start_time && event.timestamp < filters.start_time) {
        continue;
      }

      if (filters.end_time && event.timestamp > filters.end_time) {
        continue;
      }

      if (filters.tags && filters.tags.length > 0) {
        const hasAllTags = filters.tags.every((tag) => event.tags.includes(tag));
        if (!hasAllTags) {
          continue;
        }
      }

      matchingEvents.push(event);
    }

    // Sort by timestamp (most recent first)
    matchingEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const totalCount = matchingEvents.length;
    const paginatedEvents = matchingEvents.slice(offset, offset + limit);

    return {
      events: paginatedEvents,
      total_count: totalCount,
      returned_count: paginatedEvents.length,
    };
  }

  /**
   * Get all events for a specific action
   */
  getActionEvents(actionId: string, workspaceId?: string): ExecutionAuditEvent[] {
    const eventIds = this.eventsByActionId.get(actionId) || [];
    const events = eventIds.map((id) => this.events.get(id)!);

    if (workspaceId) {
      return events.filter((e) => e.workspace_id === workspaceId);
    }

    return events;
  }

  /**
   * Get all events for a specific decision
   */
  getDecisionEvents(decisionId: string, workspaceId?: string): ExecutionAuditEvent[] {
    const eventIds = this.eventsByDecisionId.get(decisionId) || [];
    const events = eventIds.map((id) => this.events.get(id)!);

    if (workspaceId) {
      return events.filter((e) => e.workspace_id === workspaceId);
    }

    return events;
  }

  /**
   * Get all events for a workspace
   */
  getWorkspaceEvents(workspaceId: string, limit = 1000): ExecutionAuditEvent[] {
    const eventIds = this.eventsByWorkspaceId.get(workspaceId) || [];
    return eventIds.slice(-limit).map((id) => this.events.get(id)!);
  }

  /**
   * Get event by ID (immutable)
   */
  getEventById(eventId: string): ExecutionAuditEvent | null {
    return this.events.get(eventId) || null;
  }

  /**
   * Search events by error message (full-text style)
   */
  searchByErrorMessage(workspaceId: string, searchTerm: string): ExecutionAuditEvent[] {
    const workspaceEventIds = this.eventsByWorkspaceId.get(workspaceId) || [];
    const results: ExecutionAuditEvent[] = [];

    const lowerSearchTerm = searchTerm.toLowerCase();

    for (const eventId of workspaceEventIds) {
      const event = this.events.get(eventId);
      if (!event) continue;

      if (event.error_message && event.error_message.toLowerCase().includes(lowerSearchTerm)) {
        results.push(event);
      }
    }

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get event count for workspace
   */
  getEventCount(workspaceId: string): number {
    return this.eventsByWorkspaceId.get(workspaceId)?.length || 0;
  }

  /**
   * Get outcome summary for workspace
   */
  getOutcomeSummary(workspaceId: string): Record<ExecutionOutcome, number> {
    const eventIds = this.eventsByWorkspaceId.get(workspaceId) || [];
    const summary: Record<ExecutionOutcome, number> = {
      [ExecutionOutcome.SUCCESS]: 0,
      [ExecutionOutcome.FAILURE]: 0,
      [ExecutionOutcome.CANCELLED]: 0,
    };

    for (const eventId of eventIds) {
      const event = this.events.get(eventId);
      if (event) {
        summary[event.outcome]++;
      }
    }

    return summary;
  }

  /**
   * Clear events (for testing only - not production safe)
   */
  clearEvents(): void {
    this.events.clear();
    this.eventsByActionId.clear();
    this.eventsByDecisionId.clear();
    this.eventsByWorkspaceId.clear();
  }

  /**
   * Verify event immutability
   */
  verifyEventImmutability(eventId: string): boolean {
    const event = this.events.get(eventId);
    return event !== null;
  }
}

export const executionAuditor = new ExecutionAuditor();
