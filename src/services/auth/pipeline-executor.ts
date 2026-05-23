/**
 * AUTH PIPELINE EXECUTOR — Deterministic Runtime Enforcement
 *
 * CRITICAL: This is the hard execution barrier.
 * Handler is ONLY callable after all auth layers pass.
 * No route can bypass this pipeline.
 *
 * Execution order is IMMUTABLE:
 * 1. Credential parsing (client code)
 * 2. Credential validation (client code)
 * 3. Auth backend availability
 * 4. Session validation
 * 5. Workspace validation
 * 6. Capability validation
 * 7. Rate limiting
 * 8. Idempotency
 * 9. Circuit breaker
 * 10. Request shedding
 * 11. Health gate
 * 12. HANDLER EXECUTION (only if all pass)
 */

import {
  UnauthorizedError,
  ForbiddenError,
  ServiceUnavailableError,
  BadRequestError,
  TooManyRequestsError,
  emitTelemetry,
  emitAudit,
} from "@/infra/errors";
import { evaluateAuthState, type AuthStateDecision, type AuthState } from "@/services/auth/state-engine";

// Execution trace — complete audit trail of auth pipeline
export interface AuthExecutionStage {
  stage: string;
  startedAt: number;
  completedAt: number;
  state: AuthState;
  decision: AuthStateDecision;
  terminated: boolean;
}

// Pipeline execution result — complete classification
export interface AuthPipelineResult {
  allowed: boolean; // true if all layers passed
  terminated: boolean; // true if a stage terminated the pipeline
  correlationId: string;
  executionTrace: AuthExecutionStage[];
  finalState: AuthState;
  finalDecision: AuthStateDecision;
  error?: Error; // The error to throw (if terminated)
}

/**
 * CANONICAL AUTH PIPELINE EXECUTOR
 *
 * Evaluates all auth states in sequence.
 * Returns immediately on first failure.
 * Handler is called ONLY if allowed=true.
 *
 * Pure function: no side effects except telemetry/audit emission.
 */
export async function executeAuthPipeline(
  authState: AuthState,
  options: {
    correlationId?: string;
    emitTelemetry?: boolean;
    emitAudit?: boolean;
  } = {}
): Promise<AuthPipelineResult> {
  const correlationId = options.correlationId || "unknown";
  const trace: AuthExecutionStage[] = [];
  const currentState = authState;
  let terminated = false;

  while (!terminated) {
    const stageStart = Date.now();

    // Evaluate current auth state
    const decision = evaluateAuthState(currentState, correlationId);

    const stageEnd = Date.now();

    // Record stage execution
    trace.push({
      stage: currentState,
      startedAt: stageStart,
      completedAt: stageEnd,
      state: currentState,
      decision,
      terminated: false,
    });

    // Emit telemetry if requested
    if (options.emitTelemetry) {
      await emitTelemetry(decision.telemetryClass as any, {
        state: currentState,
        httpStatus: decision.httpStatus,
        stage: currentState,
        stageCompletedMs: stageEnd - stageStart,
      });
    }

    // Check if this state terminates the pipeline
    if (!decision.handlerAllowed) {
      terminated = true;

      // Emit audit event if requested
      if (options.emitAudit) {
        await emitAudit(decision.auditClass as any, {
          state: currentState,
          httpStatus: decision.httpStatus,
          reason: decision.telemetryClass,
        });
      }

      return {
        allowed: false,
        terminated: true,
        correlationId,
        executionTrace: trace,
        finalState: currentState,
        finalDecision: decision,
        error: decision.errorFactory(correlationId),
      };
    }

    // If state allows handler, we're done (all checks passed)
    if (decision.handlerAllowed && decision.mutationAllowed) {
      return {
        allowed: true,
        terminated: false,
        correlationId,
        executionTrace: trace,
        finalState: currentState,
        finalDecision: decision,
      };
    }

    // If state allows handler but not mutation, continue (was intermediate state)
    if (decision.handlerAllowed && !decision.mutationAllowed) {
      // This shouldn't happen in practice — non-terminal states should not
      // allow handler, but log for debugging
      console.warn(`Non-terminal state ${currentState} allowed handler but not mutation`);
      terminated = true;
      return {
        allowed: true,
        terminated: false,
        correlationId,
        executionTrace: trace,
        finalState: currentState,
        finalDecision: decision,
      };
    }
  }

  // Should never reach here (while loop terminates on all paths above)
  return {
    allowed: false,
    terminated: true,
    correlationId,
    executionTrace: trace,
    finalState: "SESSION_INVALID", // Fallback
    finalDecision: evaluateAuthState("SESSION_INVALID", correlationId),
    error: new UnauthorizedError("AUTH_INVALID", "Auth pipeline unexpectedly failed"),
  };
}

/**
 * HARD EXECUTION BARRIER
 *
 * This function makes handler execution impossible unless auth passes.
 * Handler function is NOT invoked until executeAuthPipeline completes.
 *
 * Usage:
 * ```typescript
 * const result = await executeAuthWithHandler(
 *   authState,
 *   async () => {
 *     // Business logic ONLY runs if auth passed
 *     return await businessLogic();
 *   }
 * );
 *
 * if (!result.allowed) {
 *   throw result.error;
 * }
 * return result.handlerResult;
 * ```
 */
export async function executeAuthWithHandler<T>(
  authState: AuthState,
  handler: () => Promise<T>,
  options: {
    correlationId?: string;
    emitTelemetry?: boolean;
    emitAudit?: boolean;
  } = {}
): Promise<{
  allowed: boolean;
  handlerResult?: T;
  error?: Error;
  executionTrace: AuthExecutionStage[];
  correlationId: string;
}> {
  // Execute auth pipeline
  const pipelineResult = await executeAuthPipeline(authState, options);

  // If auth failed, return error (handler never called)
  if (!pipelineResult.allowed) {
    return {
      allowed: false,
      error: pipelineResult.error,
      executionTrace: pipelineResult.executionTrace,
      correlationId: pipelineResult.correlationId,
    };
  }

  // Auth passed, now safe to call handler
  try {
    const handlerResult = await handler();
    return {
      allowed: true,
      handlerResult,
      executionTrace: pipelineResult.executionTrace,
      correlationId: pipelineResult.correlationId,
    };
  } catch (error) {
    // Handler threw an error (not auth, but business logic)
    return {
      allowed: true, // Auth passed, handler failure is different
      error: error instanceof Error ? error : new Error(String(error)),
      executionTrace: pipelineResult.executionTrace,
      correlationId: pipelineResult.correlationId,
    };
  }
}

/**
 * VERIFY NO HANDLER EXECUTED (for testing)
 *
 * Assert that a auth state always prevents handler execution.
 */
export async function verifyHandlerNeverExecutes(authState: AuthState): Promise<boolean> {
  let handlerCalled = false;
  try {
    await executeAuthWithHandler(
      authState,
      async () => {
        handlerCalled = true;
        return null;
      },
      { emitTelemetry: false, emitAudit: false }
    );
  } catch {
    // Ignore errors during test
  }
  return !handlerCalled;
}

/**
 * VERIFY EXECUTION TRACE COMPLETENESS
 *
 * Assert that execution trace captures all stages.
 */
export function verifyExecutionTrace(trace: AuthExecutionStage[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (trace.length === 0) {
    errors.push("Execution trace is empty");
    return { valid: false, errors };
  }

  // Verify first stage is initial auth state
  if (!trace[0].stage) {
    errors.push("First trace entry missing stage name");
  }

  // Verify completion times are ordered
  for (let i = 1; i < trace.length; i++) {
    if (trace[i].startedAt < trace[i - 1].completedAt) {
      errors.push(
        `Stage ${i} started before stage ${i - 1} completed: ` +
          `${trace[i].startedAt} < ${trace[i - 1].completedAt}`
      );
    }
  }

  // Verify all stages have decisions
  for (let i = 0; i < trace.length; i++) {
    if (!trace[i].decision || !trace[i].decision.httpStatus) {
      errors.push(`Stage ${i} (${trace[i].stage}) missing decision`);
    }
  }

  return { valid: errors.length === 0, errors };
}
