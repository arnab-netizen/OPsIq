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

import { AsyncLocalStorage } from "async_hooks";

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
 * Async-local execution context stack.
 * Each request gets its own isolated stack, preventing concurrency issues.
 * Detects nested wrapper attempts within a single request.
 */
const executionStackALS = new AsyncLocalStorage<ExecutionContext[]>();

function getExecutionStack(): ExecutionContext[] {
  let stack = executionStackALS.getStore();
  if (!stack) {
    stack = [];
    executionStackALS.enterWith(stack);
  }
  return stack;
}

/**
 * Run `fn` with its own execution stack. The lazy `enterWith` in getExecutionStack() does NOT isolate concurrent
 * requests that share an async ancestor (it can install one array for every sibling continuation), so two in-flight
 * wrapper calls pushed/popped the same stack and the later pop threw EXECUTION STACK MISMATCH after the handler had
 * already committed. A fresh `run([])` scope per wrapper call isolates them. A call made while a wrapper is already
 * active in this scope (non-empty stack) keeps that stack, so genuine nesting is still detected and refused.
 */
export function runInExecutionScope<T>(fn: () => Promise<T>): Promise<T> {
  const current = executionStackALS.getStore();
  if (current && current.length > 0) return fn();
  return executionStackALS.run([], fn);
}

/**
 * Classify execution attempt
 */
export function classifyExecution(input: {
  traceId: string;
  correlationId: string;
  requestId: string;
}): ReentryClassification {
  const stack = getExecutionStack();

  // Check for nested wrapper
  if (stack.length > 0) {
    const current = stack[stack.length - 1];

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
  for (const context of stack) {
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

  const stack = getExecutionStack();
  stack.push({
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
  const stack = getExecutionStack();

  if (stack.length === 0) {
    throw new Error("EXECUTION STACK UNDERFLOW: No active execution context");
  }

  const popped = stack.pop();

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
  const stack = getExecutionStack();

  if (stack.length === 0) {
    return undefined;
  }

  return stack[stack.length - 1];
}

/**
 * Verify no active execution contexts
 */
export function verifyNoActiveContexts(): boolean {
  const stack = getExecutionStack();
  return stack.length === 0;
}

/**
 * Get execution stack depth
 */
export function getExecutionStackDepth(): number {
  const stack = getExecutionStack();
  return stack.length;
}

/**
 * Clear execution stack (for testing only)
 */
export function clearExecutionStack(): void {
  const stack = getExecutionStack();
  stack.length = 0;
}
