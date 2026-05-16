/**
 * PHASE I-3: REQUEST CORRELATION + TRACE CONTEXT
 *
 * Async-safe request context propagation.
 * Single execution path traceable end-to-end through:
 * - API requests
 * - Queue workers
 * - Async operations
 */

import { AsyncLocalStorage } from "async_hooks";

export interface RequestTraceContext {
  correlation_id: string;
  request_id: string;
  workspace_id?: string;
  execution_id?: string;
  operator_id?: string;
  user_agent?: string;
  endpoint?: string;
  method?: string;
  started_at: Date;
  trace_depth: number;
}

class RequestContextManager {
  private asyncLocalStorage = new AsyncLocalStorage<RequestTraceContext>();

  generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  createContext(
    workspace_id?: string,
    execution_id?: string,
    operator_id?: string,
    endpoint?: string,
    method?: string,
    user_agent?: string,
    correlation_id?: string,
  ): RequestTraceContext {
    return {
      correlation_id: correlation_id || this.generateCorrelationId(),
      request_id: this.generateRequestId(),
      workspace_id,
      execution_id,
      operator_id,
      user_agent,
      endpoint,
      method,
      started_at: new Date(),
      trace_depth: 0,
    };
  }

  async runWithContext<T>(context: RequestTraceContext, fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.asyncLocalStorage.run(context, async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  getContext(): RequestTraceContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  getCurrentCorrelationId(): string {
    const ctx = this.getContext();
    if (!ctx) {
      return this.generateCorrelationId();
    }
    return ctx.correlation_id;
  }

  getCurrentRequestId(): string {
    const ctx = this.getContext();
    if (!ctx) {
      return this.generateRequestId();
    }
    return ctx.request_id;
  }

  getCurrentWorkspaceId(): string | undefined {
    return this.getContext()?.workspace_id;
  }

  getCurrentExecutionId(): string | undefined {
    return this.getContext()?.execution_id;
  }

  getCurrentOperatorId(): string | undefined {
    return this.getContext()?.operator_id;
  }

  extendContextForNestedOperation<T>(
    operation_name: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const currentCtx = this.getContext();
    if (!currentCtx) {
      throw new Error(
        `Cannot extend context for nested operation "${operation_name}" - no active context`,
      );
    }

    const extendedCtx: RequestTraceContext = {
      ...currentCtx,
      trace_depth: currentCtx.trace_depth + 1,
      request_id: `${currentCtx.request_id}_${operation_name}`,
    };

    return this.runWithContext(extendedCtx, fn);
  }

  extendContextForQueueWorker<T>(
    job_id: string,
    queue_name: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const currentCtx = this.getContext();
    const extendedCtx: RequestTraceContext = {
      correlation_id: currentCtx?.correlation_id || this.generateCorrelationId(),
      request_id: `worker_${queue_name}_${job_id}`,
      workspace_id: currentCtx?.workspace_id,
      execution_id: currentCtx?.execution_id,
      operator_id: currentCtx?.operator_id,
      endpoint: `queue:${queue_name}`,
      method: "QUEUE_WORKER",
      started_at: new Date(),
      trace_depth: (currentCtx?.trace_depth || 0) + 1,
    };

    return this.runWithContext(extendedCtx, fn);
  }

  getCurrentTraceHierarchy(): string {
    const ctx = this.getContext();
    if (!ctx) {
      return "no_context";
    }
    const depth = Array(ctx.trace_depth).fill("  ").join("");
    return `${depth}${ctx.request_id} (correlation: ${ctx.correlation_id})`;
  }

  validateContextPresence(operation_name: string): RequestTraceContext {
    const ctx = this.getContext();
    if (!ctx) {
      throw new Error(
        `Operation "${operation_name}" requires active request context. Context must be initialized.`,
      );
    }
    return ctx;
  }

  validateWorkspaceContext(operation_name: string): RequestTraceContext {
    const ctx = this.validateContextPresence(operation_name);
    if (!ctx.workspace_id) {
      throw new Error(
        `Operation "${operation_name}" requires workspace context. workspace_id must be set.`,
      );
    }
    return ctx;
  }

  validateExecutionContext(operation_name: string): RequestTraceContext {
    const ctx = this.validateContextPresence(operation_name);
    if (!ctx.execution_id) {
      throw new Error(
        `Operation "${operation_name}" requires execution context. execution_id must be set.`,
      );
    }
    return ctx;
  }

  createErrorContext(
    workspace_id?: string,
    execution_id?: string,
    operator_id?: string,
    endpoint?: string,
    method?: string,
  ) {
    const ctx = this.getContext();
    return {
      correlation_id: ctx?.correlation_id || this.generateCorrelationId(),
      request_id: ctx?.request_id || this.generateRequestId(),
      workspace_id: workspace_id || ctx?.workspace_id,
      execution_id: execution_id || ctx?.execution_id,
      operator_id: operator_id || ctx?.operator_id,
      user_agent: ctx?.user_agent,
      endpoint: endpoint || ctx?.endpoint,
      timestamp: new Date(),
    };
  }
}

export const requestContext = new RequestContextManager();
