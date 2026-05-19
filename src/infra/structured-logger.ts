/**
 * R2 Structured Logging Service
 * Production-grade JSON logging with correlation IDs and secret redaction
 */

import { NextRequest } from "next/server";

interface LogContext {
  request_id: string;
  correlation_id: string;
  workspace_id?: string;
  actor_id?: string;
  route?: string;
  method?: string;
  timestamp?: string;
  readiness_state?: string;
}

interface LogEntry {
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";
  category: string;
  message: string;
  correlation_id: string;
  request_id: string;
  workspace_id?: string;
  actor_id?: string;
  route?: string;
  method?: string;
  latency_ms?: number;
  status_code?: number;
  readiness_state?: string;
  mutation_type?: string;
  idempotency_key?: string;
  error_code?: string;
  error_message?: string;
  error_classification?: string;
  db_latency_ms?: number;
  retry_count?: number;
  payload_hash?: string;
  audit_event_id?: string;
  timestamp: string;
  tags?: string[];
}

// Global metrics for tracking
const metrics = {
  requests: new Map<string, { start: number; method: string; route: string }>(),
  errors: [] as LogEntry[],
  readinessTransitions: [] as { from: string; to: string; timestamp: string }[],
  idempotencyCollisions: [] as { key: string; collision_count: number }[],
  dbLatencies: [] as number[],
  requestLatencies: [] as number[],
};

// Secret patterns to redact
const SECRET_PATTERNS = [
  /password["\s:=]+([^\s",}]+)/gi,
  /authorization["\s:=]+([^\s",}]+)/gi,
  /token["\s:=]+([^\s",}]+)/gi,
  /secret["\s:=]+([^\s",}]+)/gi,
  /api[_-]key["\s:=]+([^\s",}]+)/gi,
];

function redactSecrets(value: any): any {
  if (typeof value !== "string") return value;

  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match, secret) => {
      return match.replace(secret, "[REDACTED]");
    });
  }
  return redacted;
}

function serializePayload(payload: any): string {
  try {
    const serialized = JSON.stringify(payload);
    return redactSecrets(serialized);
  } catch {
    return "[SERIALIZATION_ERROR]";
  }
}

function payloadHash(payload: any): string {
  try {
    const crypto = require("crypto");
    const serialized = JSON.stringify(payload);
    return crypto
      .createHash("sha256")
      .update(serialized)
      .digest("hex")
      .slice(0, 8);
  } catch {
    return "HASH_ERROR";
  }
}

export class StructuredLogger {
  private context: LogContext;

  constructor(context: LogContext) {
    this.context = context;
  }

  private createEntry(
    level: LogEntry["level"],
    category: string,
    message: string,
    extra?: Partial<LogEntry>
  ): LogEntry {
    const entry: LogEntry = {
      level,
      category,
      message,
      correlation_id: this.context.correlation_id,
      request_id: this.context.request_id,
      workspace_id: this.context.workspace_id,
      actor_id: this.context.actor_id,
      route: this.context.route,
      method: this.context.method,
      readiness_state: this.context.readiness_state,
      timestamp: new Date().toISOString(),
      ...extra,
    };

    return entry;
  }

  private emit(entry: LogEntry): void {
    // Output as JSON (machine-parseable)
    console.log(JSON.stringify(entry));

    // Track errors for metrics
    if (entry.level === "ERROR" || entry.level === "CRITICAL") {
      metrics.errors.push(entry);
      // Keep last 1000 errors
      if (metrics.errors.length > 1000) {
        metrics.errors.shift();
      }
    }

    // Track latencies
    if (entry.latency_ms) {
      metrics.requestLatencies.push(entry.latency_ms);
      if (metrics.requestLatencies.length > 10000) {
        metrics.requestLatencies.shift();
      }
    }

    if (entry.db_latency_ms) {
      metrics.dbLatencies.push(entry.db_latency_ms);
      if (metrics.dbLatencies.length > 10000) {
        metrics.dbLatencies.shift();
      }
    }
  }

  debug(message: string, extra?: Partial<LogEntry>): void {
    this.emit(this.createEntry("DEBUG", "APP", message, extra));
  }

  info(message: string, extra?: Partial<LogEntry>): void {
    this.emit(this.createEntry("INFO", "APP", message, extra));
  }

  warn(message: string, extra?: Partial<LogEntry>): void {
    this.emit(this.createEntry("WARN", "APP", message, extra));
  }

  error(
    message: string,
    error?: Error | string,
    extra?: Partial<LogEntry>
  ): void {
    const errorMessage =
      typeof error === "string" ? error : error?.message || "Unknown error";
    this.emit(
      this.createEntry("ERROR", "APP", message, {
        error_message: errorMessage,
        ...extra,
      })
    );
  }

  critical(message: string, extra?: Partial<LogEntry>): void {
    this.emit(this.createEntry("CRITICAL", "INFRASTRUCTURE", message, extra));
  }

  // Mutation-specific logging
  logMutationStart(
    mutation_type: string,
    idempotency_key: string,
    payload: any
  ): void {
    this.emit(
      this.createEntry("INFO", "MUTATION", `Mutation starting: ${mutation_type}`, {
        mutation_type,
        idempotency_key,
        payload_hash: payloadHash(payload),
        tags: ["mutation_start"],
      })
    );
  }

  logMutationComplete(
    mutation_type: string,
    latency_ms: number,
    result_hash: string
  ): void {
    this.emit(
      this.createEntry("INFO", "MUTATION", `Mutation completed: ${mutation_type}`, {
        mutation_type,
        latency_ms,
        payload_hash: result_hash,
        tags: ["mutation_complete"],
      })
    );
  }

  logMutationFailed(
    mutation_type: string,
    error: string,
    classification: string
  ): void {
    this.emit(
      this.createEntry(
        "ERROR",
        "MUTATION",
        `Mutation failed: ${mutation_type}`,
        {
          mutation_type,
          error_message: error,
          error_classification: classification,
          tags: ["mutation_failed"],
        }
      )
    );
  }

  // Database timing
  logDbQuery(query: string, latency_ms: number, rows_affected?: number): void {
    this.emit(
      this.createEntry("DEBUG", "DATABASE", `Query executed`, {
        db_latency_ms: latency_ms,
        payload_hash: query.slice(0, 20), // Query preview
        tags: ["db_query"],
      })
    );
  }

  // Readiness transitions
  static logReadinessTransition(from: string, to: string): void {
    const entry: LogEntry = {
      level: "INFO",
      category: "READINESS",
      message: `Readiness state transition: ${from} → ${to}`,
      correlation_id: "SYSTEM",
      request_id: "STARTUP",
      readiness_state: to,
      timestamp: new Date().toISOString(),
      tags: ["readiness_transition"],
    };

    console.log(JSON.stringify(entry));
    metrics.readinessTransitions.push({
      from,
      to,
      timestamp: new Date().toISOString(),
    });
  }

  // Idempotency collision
  logIdempotencyCollision(idempotency_key: string): void {
    this.emit(
      this.createEntry("DEBUG", "IDEMPOTENCY", `Idempotency collision detected`, {
        idempotency_key,
        tags: ["idempotency_collision"],
      })
    );

    // Track collision metrics
    const existing = metrics.idempotencyCollisions.find(
      (c) => c.key === idempotency_key
    );
    if (existing) {
      existing.collision_count++;
    } else {
      metrics.idempotencyCollisions.push({
        key: idempotency_key,
        collision_count: 1,
      });
    }
  }
}

// Export metrics for observability endpoints
export function getMetrics() {
  return {
    requests: metrics.requests.size,
    total_errors: metrics.errors.length,
    recent_errors: metrics.errors.slice(-10),
    readiness_transitions: metrics.readinessTransitions.slice(-20),
    idempotency_collisions: metrics.idempotencyCollisions,
    avg_request_latency:
      metrics.requestLatencies.length > 0
        ? Math.round(
            metrics.requestLatencies.reduce((a, b) => a + b, 0) /
              metrics.requestLatencies.length
          )
        : 0,
    p95_request_latency:
      metrics.requestLatencies.length > 0
        ? metrics.requestLatencies.sort((a, b) => a - b)[
            Math.floor(metrics.requestLatencies.length * 0.95)
          ]
        : 0,
    avg_db_latency:
      metrics.dbLatencies.length > 0
        ? Math.round(
            metrics.dbLatencies.reduce((a, b) => a + b, 0) /
              metrics.dbLatencies.length
          )
        : 0,
    p95_db_latency:
      metrics.dbLatencies.length > 0
        ? metrics.dbLatencies.sort((a, b) => a - b)[
            Math.floor(metrics.dbLatencies.length * 0.95)
          ]
        : 0,
  };
}

// Track active requests
export function trackRequestStart(
  request_id: string,
  method: string,
  route: string
): void {
  metrics.requests.set(request_id, {
    start: Date.now(),
    method,
    route,
  });
}

export function trackRequestEnd(request_id: string): number {
  const tracked = metrics.requests.get(request_id);
  if (tracked) {
    const duration = Date.now() - tracked.start;
    metrics.requests.delete(request_id);
    return duration;
  }
  return 0;
}

export function getActiveRequests(): number {
  return metrics.requests.size;
}
