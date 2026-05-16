/**
 * PHASE I-10.1: GLOBAL REQUEST ENFORCEMENT LAYER
 *
 * Every API request becomes mandatory:
 * - traceable (correlation IDs)
 * - observable (structured logging)
 * - bounded (health gates, backpressure)
 * - fail-closed (errors normalized)
 * - audited (events emitted)
 * - metered (metrics collected)
 *
 * NO request bypasses these guarantees.
 */

import { NextRequest, NextResponse } from "next/server";
import { requestContext } from "../request-context";
import { runtimeLogger } from "../runtime-logger";
import {
  RuntimeError,
  createInfrastructureError,
  createValidationError,
} from "../runtime-errors";
import { runtimeHealthSystem } from "../health/health-system";
import { runtimeMetricsCollector } from "../metrics/runtime-metrics";
import {
  CircuitBreaker,
  RetryBudget,
  RequestShedding,
} from "../resilience/circuit-breaker";
import {
  UnauthorizedError,
  ForbiddenError,
  AppError,
} from "@/infra/errors";

// Global enforcement state
const requestCircuitBreaker = new CircuitBreaker({
  failure_threshold: 50,
  success_threshold: 5,
  timeout_ms: 30000,
  min_requests_before_eval: 10,
  max_concurrent_requests: 1000,
});

const requestShedding = new RequestShedding(5000);

export interface EnforcedRequestContext {
  correlation_id: string;
  request_id: string;
  workspace_id?: string;
  method: string;
  endpoint: string;
  started_at: Date;
}

/**
 * MANDATORY: Enforce all API requests through runtime context
 */
export async function enforceRequest<T>(
  req: NextRequest,
  handler: (ctx: EnforcedRequestContext) => Promise<T>,
  options?: {
    require_workspace_id?: boolean;
    require_execution_id?: boolean;
    bypass_health_check?: boolean;
  },
): Promise<NextResponse> {
  const start = Date.now();
  let enforced_context: EnforcedRequestContext | null = null;
  let correlation_id = "";

  try {
    // 1. MANDATORY: Verify system health (fail-closed)
    if (!options?.bypass_health_check) {
      const health = await runtimeHealthSystem.checkSystemHealth();
      if (health.overall_state === "FAILING") {
        throw createInfrastructureError(
          "System in FAILING state - new requests blocked",
          requestContext.createErrorContext(),
          true,
        );
      }
      if (!health.db_healthy) {
        throw createInfrastructureError(
          "Database unhealthy - requests blocked",
          requestContext.createErrorContext(),
          true,
        );
      }
    }

    // 2. MANDATORY: Request shedding (backpressure)
    if (!requestShedding.canAccept()) {
      throw createInfrastructureError(
        "Request queue full - shedding request",
        requestContext.createErrorContext(),
        true,
      );
    }
    requestShedding.enqueue();

    // 3. MANDATORY: Circuit breaker enforcement
    if (requestCircuitBreaker.getState() === "OPEN") {
      throw createInfrastructureError(
        "Circuit breaker OPEN - requests blocked",
        requestContext.createErrorContext(),
        true,
      );
    }

    // 4. MANDATORY: Create runtime context
    correlation_id = requestContext.generateCorrelationId();
    const workspace_id = req.headers.get("x-workspace-id") || undefined;
    const execution_id = req.headers.get("x-execution-id") || undefined;

    // Validate required context
    if (options?.require_workspace_id && !workspace_id) {
      throw createValidationError(
        "Workspace context required",
        requestContext.createErrorContext(undefined, undefined, undefined),
      );
    }

    if (options?.require_execution_id && !execution_id) {
      throw createValidationError(
        "Execution context required",
        requestContext.createErrorContext(undefined, undefined, undefined),
      );
    }

    enforced_context = {
      correlation_id,
      request_id: requestContext.generateRequestId(),
      workspace_id,
      method: req.method,
      endpoint: req.nextUrl.pathname,
      started_at: new Date(),
    };

    // 5. MANDATORY: Run handler within context
    const result = await requestContext.runWithContext(
      {
        correlation_id,
        request_id: enforced_context.request_id,
        workspace_id,
        execution_id,
        endpoint: enforced_context.endpoint,
        method: enforced_context.method,
        started_at: enforced_context.started_at,
        trace_depth: 0,
      },
      async () => {
        // 6. MANDATORY: Log request start
        runtimeLogger.log({
          level: "INFO",
          category: "EXECUTION",
          message: `API request received: ${enforced_context!.method} ${enforced_context!.endpoint}`,
          correlation_id,
          request_id: enforced_context!.request_id,
          workspace_id,
          context: {
            endpoint: enforced_context!.endpoint,
            method: enforced_context!.method,
          },
          tags: ["api_request", "request_start"],
        });

        return await handler(enforced_context!);
      },
    );

    // 7. MANDATORY: Record success metrics
    const duration_ms = Date.now() - start;
    runtimeMetricsCollector.recordRequestLatency(duration_ms);

    // 8. MANDATORY: Log request completion
    runtimeLogger.log({
      level: "INFO",
      category: "EXECUTION",
      message: "API request completed successfully",
      correlation_id,
      request_id: enforced_context.request_id,
      workspace_id,
      duration_ms,
      context: {
        status: 200,
        duration_ms,
      },
      tags: ["api_request", "request_success"],
    });

    // 9. MANDATORY: Return response with context headers
    return NextResponse.json(result, {
      status: 200,
      headers: {
        "X-Correlation-ID": correlation_id,
        "X-Request-ID": enforced_context.request_id,
      },
    });
  } catch (error) {
    const duration_ms = Date.now() - start;
    runtimeMetricsCollector.recordRequestError();

    // Classify and normalize error
    let normalized_error: RuntimeError;

    // IMPORTANT: Check AppError (auth, validation, etc) BEFORE treating as infrastructure
    if (error instanceof AppError) {
      // AppError includes: UnauthorizedError, ForbiddenError, ValidationError, etc.
      // These should NOT be converted to infrastructure errors
      const status = error.statusCode || 500;
      runtimeLogger.log({
        level: status === 401 || status === 403 ? "INFO" : "WARN",
        category: "FAILURE",
        message: `Application error: ${error.code}`,
        correlation_id: correlation_id || requestContext.generateCorrelationId(),
        context: {
          error_code: error.code,
          error_message: error.message,
          http_status: status,
          endpoint: enforced_context?.endpoint,
          method: enforced_context?.method,
          duration_ms,
        },
        tags: ["app_error", `error_${error.code}`],
      });

      // Return AppError response directly
      return NextResponse.json(error.toJSON(), {
        status,
        headers: {
          "X-Correlation-ID": correlation_id || "unknown",
          "X-Error-Code": error.code,
        },
      });
    }

    if (error instanceof RuntimeError) {
      normalized_error = error;
    } else {
      // Only convert unrecognized errors to infrastructure errors
      normalized_error = createInfrastructureError(
        "Unhandled request error",
        requestContext.createErrorContext(
          enforced_context?.workspace_id,
          undefined,
          undefined,
          enforced_context?.endpoint,
          enforced_context?.method,
        ),
        true,
      );

      // Log the unhandled error for debugging
      runtimeLogger.log({
        level: "CRITICAL",
        category: "FAILURE",
        message: "Unhandled error converted to infrastructure error",
        correlation_id: correlation_id || requestContext.generateCorrelationId(),
        context: {
          error_type: error?.constructor?.name || typeof error,
          error_message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
          endpoint: enforced_context?.endpoint,
          method: enforced_context?.method,
          duration_ms,
        },
        tags: ["unhandled_error", "infrastructure_error"],
      });
    }

    // Log failure with full diagnostic
    runtimeLogger.logFailure(
      correlation_id || requestContext.generateCorrelationId(),
      normalized_error.metadata.classification,
      normalized_error.metadata.severity,
      normalized_error.message,
      normalized_error.metadata.error_code,
      {
        retryable: normalized_error.metadata.retryable,
        is_transient: normalized_error.metadata.is_transient,
        duration_ms,
      },
    );

    // Return error response with correlation ID
    return NextResponse.json(normalized_error.toOperatorSafeJSON(), {
      status: normalized_error.metadata.http_status,
      headers: {
        "X-Correlation-ID": correlation_id || "unknown",
        "X-Error-Code": normalized_error.metadata.error_code,
      },
    });
  } finally {
    // Cleanup
    if (enforced_context) {
      requestShedding.dequeue();
    }
  }
}

/**
 * MANDATORY: Get current enforced context or fail-closed
 */
export function getEnforcedContext(operation: string): EnforcedRequestContext {
  const ctx = requestContext.getContext();
  if (!ctx) {
    throw new Error(
      `Operation "${operation}" requires enforced runtime context - unavailable`,
    );
  }

  return {
    correlation_id: ctx.correlation_id,
    request_id: ctx.request_id,
    workspace_id: ctx.workspace_id,
    method: ctx.method || "UNKNOWN",
    endpoint: ctx.endpoint || "UNKNOWN",
    started_at: ctx.started_at,
  };
}

/**
 * MANDATORY: Verify workspace in enforced context
 */
export function requireWorkspaceInEnforcedContext(operation: string): string {
  const ctx = getEnforcedContext(operation);
  if (!ctx.workspace_id) {
    throw createValidationError(
      `Operation "${operation}" requires workspace context`,
      requestContext.createErrorContext(),
    );
  }
  return ctx.workspace_id;
}

/**
 * Get circuit breaker metrics
 */
export function getRequestCircuitBreakerMetrics() {
  return requestCircuitBreaker.getMetrics();
}

/**
 * Get request shedding status
 */
export function getRequestSheddingStatus() {
  return {
    queue_size: requestShedding.getQueueSize(),
    utilization_percent: requestShedding.getQueueUtilization(),
    can_accept: requestShedding.canAccept(),
  };
}
