/**
 * R2 Request + Mutation Tracing Service
 * End-to-end lifecycle tracing with correlation IDs
 */

import { StructuredLogger } from "./structured-logger";

interface TraceSpan {
  span_id: string;
  parent_span_id?: string;
  operation: string;
  start_time: number;
  end_time?: number;
  duration_ms?: number;
  status: "PENDING" | "SUCCESS" | "FAILED" | "ROLLED_BACK";
  error?: string;
  tags: Record<string, any>;
}

interface RequestTrace {
  correlation_id: string;
  request_id: string;
  workspace_id?: string;
  actor_id?: string;
  route: string;
  method: string;
  start_time: number;
  end_time?: number;
  duration_ms?: number;
  spans: TraceSpan[];
  final_status: "SUCCESS" | "FAILED" | "ROLLED_BACK";
  error_classification?: string;
}

const activeTraces = new Map<string, RequestTrace>();
const completedTraces: RequestTrace[] = [];

export class RequestTracer {
  private correlation_id: string;
  private request_id: string;
  private trace: RequestTrace;
  private currentSpan?: TraceSpan;
  private logger: StructuredLogger;

  constructor(
    correlation_id: string,
    request_id: string,
    route: string,
    method: string,
    logger: StructuredLogger
  ) {
    this.correlation_id = correlation_id;
    this.request_id = request_id;
    this.logger = logger;

    this.trace = {
      correlation_id,
      request_id,
      route,
      method,
      start_time: Date.now(),
      spans: [],
      final_status: "SUCCESS",
    };

    activeTraces.set(correlation_id, this.trace);
  }

  // Start a span (nested operation)
  startSpan(operation: string, tags: Record<string, any> = {}): string {
    const span_id = `span-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const span: TraceSpan = {
      span_id,
      operation,
      start_time: Date.now(),
      status: "PENDING",
      parent_span_id: this.currentSpan?.span_id,
      tags,
    };

    this.trace.spans.push(span);
    this.currentSpan = span;

    this.logger.debug(`Span started: ${operation}`, {
      tags: ["span_start"],
      payload_hash: span_id,
    });

    return span_id;
  }

  // End a span
  endSpan(span_id: string, status: "SUCCESS" | "FAILED" = "SUCCESS"): void {
    const span = this.trace.spans.find((s) => s.span_id === span_id);
    if (!span) return;

    span.end_time = Date.now();
    span.duration_ms = span.end_time - span.start_time;
    span.status = status;

    this.logger.debug(`Span ended: ${span.operation}`, {
      latency_ms: span.duration_ms,
      tags: ["span_end"],
    });

    if (span === this.currentSpan) {
      this.currentSpan = span.parent_span_id
        ? this.trace.spans.find((s) => s.span_id === span.parent_span_id)
        : undefined;
    }
  }

  // Log database operation within span
  logDatabaseOp(operation: string, latency_ms: number, rows?: number): void {
    if (this.currentSpan) {
      this.currentSpan.tags.db_operations = [
        ...(this.currentSpan.tags.db_operations || []),
        { operation, latency_ms, rows },
      ];
    }

    this.logger.logDbQuery(operation, latency_ms, rows);
  }

  // Log mutation within trace
  logMutation(
    type: string,
    idempotency_key: string,
    payload: any,
    start_latency?: number
  ): void {
    const span_id = this.startSpan(`mutation:${type}`, {
      mutation_type: type,
      idempotency_key,
    });

    if (this.currentSpan) {
      this.currentSpan.tags.mutation_type = type;
      this.currentSpan.tags.idempotency_key = idempotency_key;
      if (start_latency) {
        this.currentSpan.tags.check_latency_ms = start_latency;
      }
    }

    this.logger.logMutationStart(type, idempotency_key, payload);
  }

  // Mark mutation complete
  completeMutation(result_hash: string, latency_ms: number): void {
    if (this.currentSpan) {
      this.endSpan(this.currentSpan.span_id, "SUCCESS");
      const latencyField = this.currentSpan.duration_ms || latency_ms;
      this.logger.logMutationComplete(
        this.currentSpan.tags.mutation_type || "unknown",
        latencyField,
        result_hash
      );
    }
  }

  // Mark mutation failed
  failMutation(error: string, classification: string): void {
    if (this.currentSpan) {
      this.currentSpan.status = "FAILED";
      this.currentSpan.error = error;
      this.endSpan(this.currentSpan.span_id, "FAILED");
      this.logger.logMutationFailed(
        this.currentSpan.tags.mutation_type || "unknown",
        error,
        classification
      );
      this.trace.final_status = "FAILED";
      this.trace.error_classification = classification;
    }
  }

  // Mark transaction rollback
  markRollback(reason: string): void {
    if (this.currentSpan) {
      this.currentSpan.status = "ROLLED_BACK";
      this.currentSpan.error = reason;
    }
    this.trace.final_status = "ROLLED_BACK";
    this.logger.info("Transaction rolled back", {
      tags: ["rollback"],
      error_message: reason,
    });
  }

  // Log audit event creation
  logAuditEvent(event_id: string, event_name: string, payload: any): void {
    const span_id = this.startSpan("audit_event", {
      event_id,
      event_name,
    });

    if (this.currentSpan) {
      this.currentSpan.tags.audit_event_id = event_id;
      this.currentSpan.tags.event_name = event_name;
    }

    this.endSpan(span_id, "SUCCESS");
    this.logger.info(`Audit event created: ${event_name}`, {
      audit_event_id: event_id,
      tags: ["audit_creation"],
    });
  }

  // Log idempotency collision
  logIdempotencyCollision(idempotency_key: string, cached_response: any): void {
    this.logger.logIdempotencyCollision(idempotency_key);
    if (this.currentSpan) {
      this.currentSpan.tags.cached_response_returned = true;
      this.currentSpan.tags.collision_detected = true;
    }
  }

  // Log retry
  logRetry(attempt: number, delay_ms: number): void {
    this.logger.info(`Request retry`, {
      retry_count: attempt,
      tags: ["retry"],
    });
  }

  // Complete the trace
  completeTrace(status: "SUCCESS" | "FAILED" = "SUCCESS"): RequestTrace {
    this.trace.end_time = Date.now();
    this.trace.duration_ms = this.trace.end_time - this.trace.start_time;
    this.trace.final_status = status;

    // Move to completed traces
    activeTraces.delete(this.correlation_id);
    completedTraces.push(this.trace);

    // Keep last 1000 traces
    if (completedTraces.length > 1000) {
      completedTraces.shift();
    }

    this.logger.info("Request trace complete", {
      latency_ms: this.trace.duration_ms,
      tags: ["trace_complete"],
    });

    return this.trace;
  }
}

// Export trace history and analysis
export function getTraceHistory(limit: number = 100): RequestTrace[] {
  return completedTraces.slice(-limit);
}

export function getActiveTraces(): RequestTrace[] {
  return Array.from(activeTraces.values());
}

export function getTraceByCorrelationId(correlation_id: string): RequestTrace | undefined {
  return activeTraces.get(correlation_id) ||
    completedTraces.find(t => t.correlation_id === correlation_id);
}

export function getTracesWithError(classification?: string): RequestTrace[] {
  return completedTraces.filter(
    (t) =>
      t.final_status === "FAILED" &&
      (!classification || t.error_classification === classification)
  );
}

export function getSlowRequests(threshold_ms: number = 1000): RequestTrace[] {
  return completedTraces.filter((t) => (t.duration_ms || 0) > threshold_ms);
}

export function getMutationTraces(mutation_type: string): RequestTrace[] {
  return completedTraces.filter((t) =>
    t.spans.some((s) => s.tags.mutation_type === mutation_type)
  );
}

export function getIdempotencyCollisions(): RequestTrace[] {
  return completedTraces.filter((t) =>
    t.spans.some((s) => s.tags.collision_detected)
  );
}

export function getAuditEventTraces(): RequestTrace[] {
  return completedTraces.filter((t) =>
    t.spans.some((s) => s.tags.audit_event_id)
  );
}
