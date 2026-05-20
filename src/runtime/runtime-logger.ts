/**
 * PHASE I-2: STRUCTURED AUDIT + EVENT LOGGING
 *
 * Structured JSON logging with request/workspace/execution context.
 * All critical runtime decisions are logged and traceable.
 */

export type LogCategory =
  | "AUTH"
  | "EXECUTION"
  | "DECISION"
  | "FAILURE"
  | "RECOVERY"
  | "RATE_LIMIT"
  | "SECURITY"
  | "DB"
  | "QUEUE"
  | "DEPLOYMENT"
  | "HEALTH"
  | "CONFIG";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";

export interface StructuredLogEntry {
  timestamp: string; // ISO 8601
  level: LogLevel;
  category: LogCategory;
  message: string;
  correlation_id: string;
  request_id?: string;
  workspace_id?: string;
  execution_id?: string;
  operator_id?: string;
  context: Record<string, unknown>;
  error_code?: string;
  error_details?: {
    classification: string;
    retryable: string;
    severity: string;
    is_transient: boolean;
  };
  duration_ms?: number;
  tags: string[];
}

class RuntimeLogger {
  private logs: StructuredLogEntry[] = [];

  log(entry: Omit<StructuredLogEntry, "timestamp">): void {
    const fullEntry: StructuredLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    this.logs.push(fullEntry);
    this.emitToStdout(fullEntry);
  }

  private emitToStdout(entry: StructuredLogEntry): void {
    console.log(JSON.stringify(entry));
  }

  logAuthAttempt(
    correlation_id: string,
    request_id: string,
    actor: string,
    success: boolean,
    reason?: string,
  ): void {
    this.log({
      level: success ? "INFO" : "WARN",
      category: "AUTH",
      message: success ? "Authentication successful" : "Authentication failed",
      correlation_id,
      request_id,
      operator_id: success ? actor : undefined,
      context: {
        actor,
        success,
        reason,
      },
      tags: ["auth_event", success ? "auth_success" : "auth_failure"],
    });
  }

  logExecutionStart(
    correlation_id: string,
    execution_id: string,
    workspace_id: string,
    operator_id: string,
    complexity: string,
  ): void {
    this.log({
      level: "INFO",
      category: "EXECUTION",
      message: "Execution started",
      correlation_id,
      execution_id,
      workspace_id,
      operator_id,
      context: {
        complexity,
        initiated_at: new Date().toISOString(),
      },
      tags: ["execution_start"],
    });
  }

  logExecutionCompletion(
    correlation_id: string,
    execution_id: string,
    workspace_id: string,
    duration_ms: number,
    success: boolean,
    outcome?: string,
  ): void {
    this.log({
      level: success ? "INFO" : "WARN",
      category: "EXECUTION",
      message: success ? "Execution completed" : "Execution failed",
      correlation_id,
      execution_id,
      workspace_id,
      duration_ms,
      context: {
        success,
        outcome,
      },
      tags: ["execution_end", success ? "execution_success" : "execution_failure"],
    });
  }

  logDecisionMade(
    correlation_id: string,
    workspace_id: string,
    recommendation_id: string,
    confidence: number,
  ): void {
    this.log({
      level: "INFO",
      category: "DECISION",
      message: "Decision made",
      correlation_id,
      workspace_id,
      context: {
        recommendation_id,
        decision,
        confidence,
      },
      tags: ["decision_made"],
    });
  }

  logFailure(
    correlation_id: string,
    classification: string,
    severity: string,
    message: string,
    error_code: string,
    context: Record<string, unknown> = {},
  ): void {
    this.log({
      level: severity as LogLevel,
      category: "FAILURE",
      message,
      correlation_id,
      error_code,
      error_details: {
        classification,
        retryable: context.retryable as string,
        severity,
        is_transient: context.is_transient as boolean,
      },
      context: {
        ...context,
      },
      tags: ["failure", `failure_${classification}`],
    });
  }

  logRecovery(
    correlation_id: string,
    execution_id: string,
    recovery_path: string,
    confidence: number,
  ): void {
    this.log({
      level: "INFO",
      category: "RECOVERY",
      message: "Recovery initiated",
      correlation_id,
      execution_id,
      context: {
        recovery_path,
        confidence,
        initiated_at: new Date().toISOString(),
      },
      tags: ["recovery_initiated", `recovery_${recovery_path}`],
    });
  }

  logRateLimitExceeded(
    correlation_id: string,
    request_id: string,
    workspace_id: string,
    tier: string,
    limit: number,
    current: number,
  ): void {
    this.log({
      level: "WARN",
      category: "RATE_LIMIT",
      message: "Rate limit exceeded",
      correlation_id,
      request_id,
      workspace_id,
      context: {
        tier,
        limit,
        current,
        exceeded_by: current - limit,
      },
      tags: ["rate_limit_exceeded"],
    });
  }

  logSecurityEvent(
    correlation_id: string,
    request_id: string,
    workspace_id: string,
    event_type: string,
    severity: "WARN" | "ERROR" | "CRITICAL",
    details: Record<string, unknown>,
  ): void {
    this.log({
      level: severity,
      category: "SECURITY",
      message: `Security event: ${event_type}`,
      correlation_id,
      request_id,
      workspace_id,
      context: details,
      tags: ["security_event", `security_${event_type}`],
    });
  }

  logDBOperation(
    correlation_id: string,
    operation: string,
    table: string,
    duration_ms: number,
    success: boolean,
    error?: string,
  ): void {
    this.log({
      level: success ? "DEBUG" : "WARN",
      category: "DB",
      message: success ? "DB operation completed" : "DB operation failed",
      correlation_id,
      duration_ms,
      context: {
        operation,
        table,
        success,
        error,
      },
      tags: ["db_operation", `db_${operation}`, success ? "db_success" : "db_failure"],
    });
  }

  logQueueJob(
    correlation_id: string,
    job_id: string,
    queue_name: string,
    status: "enqueued" | "processing" | "completed" | "failed" | "dead_letter",
    duration_ms?: number,
    error?: string,
  ): void {
    this.log({
      level: status === "failed" || status === "dead_letter" ? "ERROR" : "INFO",
      category: "QUEUE",
      message: `Queue job ${status}`,
      correlation_id,
      context: {
        job_id,
        queue_name,
        status,
        duration_ms,
        error,
      },
      duration_ms,
      tags: ["queue_job", `queue_${queue_name}`, `job_${status}`],
    });
  }

  logDeployment(
    correlation_id: string,
    deployment_id: string,
    status: "started" | "migrating" | "verifying" | "completed" | "rolled_back",
    details: Record<string, unknown>,
  ): void {
    this.log({
      level: status === "rolled_back" ? "WARN" : "INFO",
      category: "DEPLOYMENT",
      message: `Deployment ${status}`,
      correlation_id,
      context: {
        deployment_id,
        status,
        ...details,
      },
      tags: ["deployment", `deployment_${status}`],
    });
  }

  logHealthCheck(
    correlation_id: string,
    component: string,
    status: "HEALTHY" | "DEGRADED" | "FAILING",
    details: Record<string, unknown>,
  ): void {
    this.log({
      level: status === "FAILING" ? "ERROR" : status === "DEGRADED" ? "WARN" : "DEBUG",
      category: "HEALTH",
      message: `Health check: ${component} ${status}`,
      correlation_id,
      context: {
        component,
        status,
        ...details,
      },
      tags: ["health_check", `health_${component}`, `status_${status}`],
    });
  }

  logConfigValidation(
    correlation_id: string,
    validation_passed: boolean,
    errors: string[],
  ): void {
    this.log({
      level: validation_passed ? "INFO" : "CRITICAL",
      category: "CONFIG",
      message: validation_passed
        ? "Configuration valid"
        : "Configuration invalid - startup blocked",
      correlation_id,
      context: {
        validation_passed,
        error_count: errors.length,
        errors,
      },
      tags: ["config_validation", validation_passed ? "config_valid" : "config_invalid"],
    });
  }

  getLogs(): StructuredLogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  getLogsByCorrelationId(correlation_id: string): StructuredLogEntry[] {
    return this.logs.filter((log) => log.correlation_id === correlation_id);
  }

  getLogsByCategory(category: LogCategory): StructuredLogEntry[] {
    return this.logs.filter((log) => log.category === category);
  }
}

export const runtimeLogger = new RuntimeLogger();
