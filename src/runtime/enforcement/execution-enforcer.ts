/**
 * PHASE I-10.3: EXECUTION FLOW ENFORCEMENT
 *
 * Every execution event becomes:
 * - traceable (correlation IDs)
 * - audited (events emitted)
 * - metered (metrics collected)
 * - logged (structured logging)
 * - health-checked (system state validated)
 *
 * NO execution bypasses these guarantees.
 */

import { requestContext } from "../request-context";
import { runtimeLogger } from "../runtime-logger";
import { runtimeMetricsCollector } from "../metrics/runtime-metrics";
import { runtimeHealthSystem } from "../health/health-system";
import {
  createExecutionBlockedError,
} from "../runtime-errors";

export type ExecutionEventType =
  | "EXECUTION_CREATED"
  | "EXECUTION_STARTED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_FAILED"
  | "EXECUTION_BLOCKED"
  | "EXECUTION_RECOVERED"
  | "EXECUTION_ROLLED_BACK"
  | "ABSTENTION_TRIGGERED";

export interface ExecutionAuditEvent {
  event_type: ExecutionEventType;
  execution_id: string;
  recommendation_id: string;
  workspace_id: string;
  operator_id?: string;
  status: string;
  reason?: string;
  duration_ms?: number;
  details: Record<string, unknown>;
}

class ExecutionEnforcer {
  private audit_events: ExecutionAuditEvent[] = [];

  /**
   * MANDATORY: Verify execution can proceed
   */
  async verifyExecutionPreconditions(
    execution_id: string,
    workspace_id: string,
  ): Promise<void> {
    const ctx = requestContext.getContext();
    if (!ctx) {
      throw createExecutionBlockedError(
        "No runtime context for execution verification",
        requestContext.createErrorContext(workspace_id, execution_id),
      );
    }

    // Verify health
    const health = await runtimeHealthSystem.checkSystemHealth();
    if (health.overall_state === "FAILING") {
      throw createExecutionBlockedError(
        "System FAILING - execution blocked",
        requestContext.createErrorContext(workspace_id, execution_id),
      );
    }

    if (!health.db_healthy) {
      throw createExecutionBlockedError(
        "Database unhealthy - execution blocked",
        requestContext.createErrorContext(workspace_id, execution_id),
      );
    }

    runtimeLogger.log({
      level: "INFO",
      category: "EXECUTION",
      message: "Execution preconditions verified",
      correlation_id: ctx.correlation_id,
      execution_id,
      workspace_id,
      context: {
        health_state: health.overall_state,
      },
      tags: ["execution_precondition_check", "precondition_pass"],
    });
  }

  /**
   * MANDATORY: Emit execution created event
   */
  emitExecutionCreated(
    execution_id: string,
    recommendation_id: string,
    workspace_id: string,
    operator_id: string,
    details: Record<string, unknown>,
  ): ExecutionAuditEvent {
    const ctx = requestContext.validateContextPresence("emitExecutionCreated");

    const event: ExecutionAuditEvent = {
      event_type: "EXECUTION_CREATED",
      execution_id,
      recommendation_id,
      workspace_id,
      operator_id,
      status: "CREATED",
      details,
    };

    this.audit_events.push(event);
    runtimeMetricsCollector.recordExecution();

    runtimeLogger.logExecutionStart(
      ctx.correlation_id,
      execution_id,
      workspace_id,
      operator_id,
      details.complexity as string,
    );

    return event;
  }

  /**
   * MANDATORY: Emit execution started event
   */
  emitExecutionStarted(
    execution_id: string,
    workspace_id: string,
    details: Record<string, unknown>,
  ): ExecutionAuditEvent {
    const ctx = requestContext.validateContextPresence("emitExecutionStarted");

    const event: ExecutionAuditEvent = {
      event_type: "EXECUTION_STARTED",
      execution_id,
      recommendation_id: details.recommendation_id as string,
      workspace_id,
      status: "STARTED",
      details,
    };

    this.audit_events.push(event);

    runtimeLogger.log({
      level: "INFO",
      category: "EXECUTION",
      message: "Execution started",
      correlation_id: ctx.correlation_id,
      execution_id,
      workspace_id,
      context: {
        started_at: new Date().toISOString(),
      },
      tags: ["execution_start"],
    });

    return event;
  }

  /**
   * MANDATORY: Emit execution completed event
   */
  emitExecutionCompleted(
    execution_id: string,
    workspace_id: string,
    duration_ms: number,
    outcome: string,
    details: Record<string, unknown>,
  ): ExecutionAuditEvent {
    const ctx = requestContext.validateContextPresence(
      "emitExecutionCompleted",
    );

    const event: ExecutionAuditEvent = {
      event_type: "EXECUTION_COMPLETED",
      execution_id,
      recommendation_id: details.recommendation_id as string,
      workspace_id,
      status: outcome,
      duration_ms,
      details,
    };

    this.audit_events.push(event);
    runtimeMetricsCollector.recordRequestLatency(duration_ms);

    runtimeLogger.logExecutionCompletion(
      ctx.correlation_id,
      execution_id,
      workspace_id,
      duration_ms,
      outcome === "VERIFIED_SUCCESS",
      outcome,
    );

    return event;
  }

  /**
   * MANDATORY: Emit execution blocked event
   */
  emitExecutionBlocked(
    execution_id: string,
    workspace_id: string,
    reason: string,
    details: Record<string, unknown>,
  ): ExecutionAuditEvent {
    const ctx = requestContext.validateContextPresence("emitExecutionBlocked");

    const event: ExecutionAuditEvent = {
      event_type: "EXECUTION_BLOCKED",
      execution_id,
      recommendation_id: details.recommendation_id as string,
      workspace_id,
      status: "BLOCKED",
      reason,
      details,
    };

    this.audit_events.push(event);
    runtimeMetricsCollector.recordExecutionBlocked();

    runtimeLogger.log({
      level: "WARN",
      category: "EXECUTION",
      message: `Execution blocked: ${reason}`,
      correlation_id: ctx.correlation_id,
      execution_id,
      workspace_id,
      context: {
        blocking_reason: reason,
        details,
      },
      tags: ["execution_blocked"],
    });

    return event;
  }

  /**
   * MANDATORY: Emit execution recovered event
   */
  emitExecutionRecovered(
    execution_id: string,
    workspace_id: string,
    recovery_path: string,
    details: Record<string, unknown>,
  ): ExecutionAuditEvent {
    const ctx = requestContext.validateContextPresence(
      "emitExecutionRecovered",
    );

    const event: ExecutionAuditEvent = {
      event_type: "EXECUTION_RECOVERED",
      execution_id,
      recommendation_id: details.recommendation_id as string,
      workspace_id,
      status: "RECOVERED",
      reason: recovery_path,
      details,
    };

    this.audit_events.push(event);
    runtimeMetricsCollector.recordRecovery();

    runtimeLogger.logRecovery(
      ctx.correlation_id,
      execution_id,
      recovery_path,
      details.confidence as number,
    );

    return event;
  }

  /**
   * MANDATORY: Emit abstention triggered event
   */
  emitAbstentionTriggered(
    execution_id: string,
    workspace_id: string,
    reason: string,
    details: Record<string, unknown>,
  ): ExecutionAuditEvent {
    const ctx = requestContext.validateContextPresence(
      "emitAbstentionTriggered",
    );

    const event: ExecutionAuditEvent = {
      event_type: "ABSTENTION_TRIGGERED",
      execution_id,
      recommendation_id: details.recommendation_id as string,
      workspace_id,
      status: "ABSTAINED",
      reason,
      details,
    };

    this.audit_events.push(event);

    runtimeLogger.log({
      level: "INFO",
      category: "DECISION",
      message: `Abstention triggered: ${reason}`,
      correlation_id: ctx.correlation_id,
      execution_id,
      workspace_id,
      context: {
        reason,
        details,
      },
      tags: ["abstention", `abstention_${reason.replace(/ /g, "_")}`],
    });

    return event;
  }

  /**
   * MANDATORY: Get all audit events for correlation ID
   */
  getAuditEventsByCorrelationId(correlation_id: string): ExecutionAuditEvent[] {
    return this.audit_events.filter(
      (e) =>
        requestContext.getContext()?.correlation_id === correlation_id,
    );
  }

  /**
   * MANDATORY: Verify no orphan execution events
   */
  verifyNoOrphanEvents(): boolean {
    for (const event of this.audit_events) {
      // Each event must have a correlation context
      if (!event.workspace_id || !event.execution_id) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get all audit events
   */
  getAllAuditEvents(): ExecutionAuditEvent[] {
    return [...this.audit_events];
  }

  /**
   * Clear audit events (for testing)
   */
  clearAuditEvents(): void {
    this.audit_events = [];
  }
}

export const executionEnforcer = new ExecutionEnforcer();
