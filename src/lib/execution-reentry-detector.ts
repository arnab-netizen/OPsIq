/**
 * PHASE D STEP 3.2: EXECUTION REENTRY DETECTOR
 *
 * Detects and prevents:
 * - nested wrapper execution
 * - recursive canonical wrapper calls
 * - duplicate request execution contexts
 * - trace recreation attempts
 * - duplicate lineage roots
 *
 * FAIL FAST on any reentry attempt.
 */

import { CanonicalExecutionTraceManager } from "@/lib/canonical-execution-trace";

export type ReentryClassification =
  | "SAFE"
  | "DUPLICATE_CONTEXT"
  | "RECURSIVE_WRAPPER"
  | "FORKED_LINEAGE"
  | "TRACE_COLLISION";

interface ExecutionContext {
  traceId: string;
  correlationId: string;
  requestId: string;
  timestamp: number;
}

/**
 * Thread-local execution context stack.
 * Detects nested wrapper attempts.
 */
const executionStack: ExecutionContext[] = [];

/**
 * Classify execution attempt
 */
export function classifyExecution(input: {
  traceId: string;
  correlationId: string;
  requestId: string;
}): ReentryClassification {
  // Check for nested wrapper
  if (executionStack.length > 0) {
    const current = executionStack[executionStack.length - 1];

    // Same correlation ID in stack = nested wrapper
    if (current.correlationId === input.correlationId) {
      return "RECURSIVE_WRAPPER";
    }

    // Duplicate trace ID = trace collision
    if (current.traceId === input.traceId) {
      return "TRACE_COLLISION";
    }

    // Duplicate request ID = forked lineage
    if (current.requestId === input.requestId) {
      return "FORKED_LINEAGE";
    }
  }

  // Check for duplicate in entire stack
  for (const context of executionStack) {
    if (context.traceId === input.traceId) {
      return "DUPLICATE_CONTEXT";
    }
  }

  return "SAFE";
}

/**
 * Push execution context
 * Called at wrapper entry
 */
export function pushExecutionContext(input: {
  traceId: string;
  correlationId: string;
  requestId: string;
}): void {
  const classification = classifyExecution(input);

  if (classification !== "SAFE") {
    throw new Error(
      `EXECUTION REENTRY VIOLATION: ${classification}. ` +
        `Cannot nest canonical wrapper execution. ` +
        `Trace ID: ${input.traceId}, Correlation ID: ${input.correlationId}`
    );
  }

  executionStack.push({
    traceId: input.traceId,
    correlationId: input.correlationId,
    requestId: input.requestId,
    timestamp: Date.now(),
  });
}

/**
 * Pop execution context
 * Called at wrapper exit
 */
export function popExecutionContext(traceId: string): void {
  if (executionStack.length === 0) {
    throw new Error("EXECUTION STACK UNDERFLOW: No active execution context");
  }

  const popped = executionStack.pop();

  if (popped?.traceId !== traceId) {
    throw new Error(
      `EXECUTION STACK MISMATCH: Expected trace ${traceId}, got ${popped?.traceId}`
    );
  }
}

/**
 * Get current execution context
 */
export function getCurrentExecutionContext(): ExecutionContext | undefined {
  if (executionStack.length === 0) {
    return undefined;
  }

  return executionStack[executionStack.length - 1];
}

/**
 * Verify no active execution contexts
 */
export function verifyNoActiveContexts(): boolean {
  return executionStack.length === 0;
}

/**
 * Get execution stack depth
 */
export function getExecutionStackDepth(): number {
  return executionStack.length;
}

/**
 * Clear execution stack (for testing only)
 */
export function clearExecutionStack(): void {
  executionStack.length = 0;
}
