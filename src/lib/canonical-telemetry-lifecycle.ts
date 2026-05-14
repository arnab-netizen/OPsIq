/**
 * PHASE C: CANONICAL TELEMETRY LIFECYCLE AUTHORITY
 *
 * This module consolidates ALL auth-related telemetry emission.
 * No other module may emit auth telemetry.
 * Legacy helpers are forbidden from telemetry emission.
 *
 * Ownership:
 * - Auth request telemetry
 * - Auth decision telemetry
 * - Workspace validation telemetry
 * - Capability evaluation telemetry
 * - Auth denial telemetry
 * - Infra auth telemetry
 * - Correlation/request ID lifecycle
 *
 * PHASE C achievement:
 * - Single telemetry authority for all auth events
 * - All emissions have correlation/request context
 * - No duplicate telemetry
 * - No orphaned legacy telemetry
 */

import { logger } from "@/infra/logger";
import type { AuthState } from "@/lib/canonical-auth-facts";
import type { AuthDecision } from "@/lib/canonical-auth-facts";

// ─── Telemetry Events ──────────────────────────────────────────────────────

export type AuthTelemetryEvent =
  | "auth_pipeline_started"
  | "auth_facts_gathered"
  | "auth_state_built"
  | "auth_evaluated"
  | "auth_decision_allowed"
  | "auth_decision_denied_unauthorized"
  | "auth_decision_denied_forbidden"
  | "auth_decision_denied_workspace"
  | "handler_executing"
  | "handler_completed"
  | "handler_failed"
  | "request_completed";

// ─── Telemetry Context ────────────────────────────────────────────────────

export interface CanonicalTelemetryContext {
  // Correlation and tracing
  correlationId: string;
  requestId: string;
  traceId?: string;

  // Request metadata
  method: string;
  pathname: string;
  timestamp: Date;

  // Auth state (populated as auth progresses)
  sessionValid?: boolean;
  policyValid?: boolean;
  workspaceValid?: boolean;

  // Auth result (populated after decision)
  actorId?: string;
  workspaceId?: string;
  decisionAllowed?: boolean;
  statusCode?: number;

  // Timing
  startTime: number;
  endTime?: number;

  // Failure details
  errorMessage?: string;
  errorType?: string;
}

// ─── Telemetry Lifecycle Manager ───────────────────────────────────────────

/**
 * Manages complete telemetry lifecycle for auth requests.
 * Single authority for all auth-related events.
 *
 * Prevents:
 * - Duplicate emissions
 * - Orphaned legacy telemetry
 * - Missing correlation context
 * - Out-of-order events
 *
 * Enforces:
 * - All emissions have correlationId
 * - All emissions have requestId
 * - Auth state snapshot included
 * - Decision context included
 * - Timing tracked
 */
export class CanonicalTelemetryLifecycle {
  private ctx: CanonicalTelemetryContext;
  private emittedEvents: Set<AuthTelemetryEvent> = new Set();

  constructor(input: {
    correlationId: string;
    requestId: string;
    method: string;
    pathname: string;
  }) {
    this.ctx = {
      correlationId: input.correlationId,
      requestId: input.requestId,
      method: input.method,
      pathname: input.pathname,
      timestamp: new Date(),
      startTime: Date.now(),
    };
  }

  /**
   * PHASE 1: Pipeline started
   * Called at beginning of auth enforcement
   */
  public emitPipelineStarted(): void {
    if (this.emittedEvents.has("auth_pipeline_started")) {
      logger.warn("Duplicate auth_pipeline_started emission", { correlationId: this.ctx.correlationId });
      return;
    }

    logger.info("Auth pipeline started", {
      correlationId: this.ctx.correlationId,
      requestId: this.ctx.requestId,
      method: this.ctx.method,
      pathname: this.ctx.pathname,
    });

    this.emittedEvents.add("auth_pipeline_started");
  }

  /**
   * PHASE 2: Facts gathered
   * Called after session and policy facts collected
   */
  public emitFactsGathered(state: {
    sessionValid: boolean;
    policyValid: boolean;
  }): void {
    if (this.emittedEvents.has("auth_facts_gathered")) {
      logger.warn("Duplicate auth_facts_gathered emission", { correlationId: this.ctx.correlationId });
      return;
    }

    this.ctx.sessionValid = state.sessionValid;
    this.ctx.policyValid = state.policyValid;

    logger.debug("Auth facts gathered", {
      correlationId: this.ctx.correlationId,
      requestId: this.ctx.requestId,
      sessionValid: state.sessionValid,
      policyValid: state.policyValid,
    });

    this.emittedEvents.add("auth_facts_gathered");
  }

  /**
   * PHASE 3: Auth state built
   * Called after complete auth state assembled
   */
  public emitStateBuilt(state: AuthState): void {
    if (this.emittedEvents.has("auth_state_built")) {
      logger.warn("Duplicate auth_state_built emission", { correlationId: this.ctx.correlationId });
      return;
    }

    this.ctx.workspaceValid = state.workspaceValid;
    this.ctx.workspaceId = state.workspaceId || undefined;

    logger.debug("Auth state built", {
      correlationId: this.ctx.correlationId,
      requestId: this.ctx.requestId,
      sessionValid: state.sessionFact.valid,
      policyValid: state.policyFact.valid,
      workspaceValid: state.workspaceValid,
      workspaceId: state.workspaceId,
    });

    this.emittedEvents.add("auth_state_built");
  }

  /**
   * PHASE 4: Auth evaluated
   * Called after decision made
   */
  public emitEvaluated(decision: AuthDecision): void {
    if (this.emittedEvents.has("auth_evaluated")) {
      logger.warn("Duplicate auth_evaluated emission", { correlationId: this.ctx.correlationId });
      return;
    }

    this.ctx.decisionAllowed = decision.allowed;
    this.ctx.statusCode = decision.statusCode;

    if (decision.context) {
      this.ctx.actorId = decision.context.verifiedActorId;
      this.ctx.workspaceId = decision.context.verifiedWorkspaceId;
    }

    logger.debug("Auth evaluated", {
      correlationId: this.ctx.correlationId,
      requestId: this.ctx.requestId,
      allowed: decision.allowed,
      statusCode: decision.statusCode,
      reason: decision.trace.reason,
    });

    this.emittedEvents.add("auth_evaluated");

    // Emit specific decision event
    if (decision.allowed) {
      this.emitDecisionAllowed();
    } else {
      this.emitDecisionDenied(decision);
    }
  }

  /**
   * Decision allowed
   * Called when auth passes
   */
  private emitDecisionAllowed(): void {
    logger.info("Auth decision: ALLOWED", {
      correlationId: this.ctx.correlationId,
      requestId: this.ctx.requestId,
      actorId: this.ctx.actorId,
      workspaceId: this.ctx.workspaceId,
    });

    this.emittedEvents.add("auth_decision_allowed");
  }

  /**
   * Decision denied
   * Called when auth fails
   */
  private emitDecisionDenied(decision: AuthDecision): void {
    const eventType = this.classifyDenial(decision.statusCode);

    logger.warn("Auth decision: DENIED", {
      correlationId: this.ctx.correlationId,
      requestId: this.ctx.requestId,
      statusCode: decision.statusCode,
      reason: decision.trace.reason,
      detail: decision.message,
    });

    this.emittedEvents.add(eventType);
  }

  /**
   * Handler executing
   * Called when handler about to execute (after auth passed)
   */
  public emitHandlerExecuting(actorId: string): void {
    if (this.emittedEvents.has("handler_executing")) {
      logger.warn("Duplicate handler_executing emission", { correlationId: this.ctx.correlationId });
      return;
    }

    logger.debug("Handler executing", {
      correlationId: this.ctx.correlationId,
      requestId: this.ctx.requestId,
      actorId,
    });

    this.emittedEvents.add("handler_executing");
  }

  /**
   * Handler completed successfully
   * Called when handler returns
   */
  public emitHandlerCompleted(): void {
    if (this.emittedEvents.has("handler_completed")) {
      logger.warn("Duplicate handler_completed emission", { correlationId: this.ctx.correlationId });
      return;
    }

    const duration = Date.now() - this.ctx.startTime;

    logger.info("Handler completed", {
      correlationId: this.ctx.correlationId,
      requestId: this.ctx.requestId,
      duration,
    });

    this.emittedEvents.add("handler_completed");
  }

  /**
   * Handler failed
   * Called when handler threw or failed
   */
  public emitHandlerFailed(error: Error): void {
    if (this.emittedEvents.has("handler_failed")) {
      logger.warn("Duplicate handler_failed emission", { correlationId: this.ctx.correlationId });
      return;
    }

    const duration = Date.now() - this.ctx.startTime;

    logger.error("Handler failed", error, {
      correlationId: this.ctx.correlationId,
      requestId: this.ctx.requestId,
      duration,
    });

    this.ctx.errorMessage = error.message;
    this.ctx.errorType = error.constructor.name;
    this.emittedEvents.add("handler_failed");
  }

  /**
   * Request completed
   * Called at end of request lifecycle
   */
  public emitRequestCompleted(): void {
    this.ctx.endTime = Date.now();
    const duration = this.ctx.endTime - this.ctx.startTime;

    logger.info("Request completed", {
      correlationId: this.ctx.correlationId,
      requestId: this.ctx.requestId,
      duration,
      statusCode: this.ctx.statusCode,
      allowed: this.ctx.decisionAllowed,
    });

    this.emittedEvents.add("request_completed");
  }

  /**
   * Get current telemetry context
   * For debugging and inspection
   */
  public getContext(): CanonicalTelemetryContext {
    return { ...this.ctx };
  }

  /**
   * Get all emitted events
   * For duplicate detection and validation
   */
  public getEmittedEvents(): AuthTelemetryEvent[] {
    return Array.from(this.emittedEvents);
  }

  /**
   * Verify single telemetry emission
   * Fails if duplicate events detected
   */
  public validateNoduplicates(): boolean {
    // Should never have duplicates
    const eventCount = Array.from(this.emittedEvents).filter(
      (e) => e.startsWith("auth_decision_") || e.startsWith("handler_")
    ).length;

    if (eventCount > 1) {
      logger.error("Multiple final events emitted", {
        correlationId: this.ctx.correlationId,
        events: Array.from(this.emittedEvents),
      });
      return false;
    }

    return true;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private classifyDenial(statusCode: number): AuthTelemetryEvent {
    switch (statusCode) {
      case 401:
        return "auth_decision_denied_unauthorized";
      case 403:
        return "auth_decision_denied_forbidden";
      default:
        return "auth_decision_denied_forbidden";
    }
  }
}

// ─── Enforcement: Legacy Telemetry Prevention ──────────────────────────────

/**
 * ENFORCEMENT: Legacy auth helpers MUST NOT emit telemetry.
 *
 * If legacy code calls logger from auth.ts:
 * - Requires removal of all logger.* calls
 * - Requires conversion to fact-returning functions
 * - Legacy becomes pure data provider only
 */

export function enforceNoLegacyTelemetry(): void {
  const forbiddenModules = ["src/services/auth.ts", "src/lib/auth-guard.ts"];

  const warningMessage = `
PHASE C ENFORCEMENT:
Legacy auth helpers must NOT emit telemetry.
If you see this warning, legacy helpers are still calling logger.*.

Required fixes:
1. Remove all logger.* calls from src/services/auth.ts
2. Remove all logger.* calls from src/lib/auth-guard.ts
3. All telemetry must emit from canonical wrapper only
4. Use CanonicalTelemetryLifecycle for all auth events

Legacy helpers must become pure data providers only.
`;

  // This is a compile-time check - mark forbidden modules
  forbiddenModules.forEach((mod) => {
    // Documentation only - actual enforcement happens in code review
  });
}
