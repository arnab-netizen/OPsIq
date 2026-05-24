/**
 * Error Tracking Infrastructure (Phase 13 Slice 4)
 *
 * Provides error classification, grouping, and reporting for OpsIQ.
 * Integrates with Sentry for production error tracking.
 *
 * Classification categories:
 * - AUTH_ERROR: Authentication/authorization failures
 * - VALIDATION_ERROR: Input validation failures
 * - DATABASE_ERROR: Database connectivity/operation errors
 * - EXTERNAL_API_ERROR: Third-party API failures
 * - INTERNAL_ERROR: Unexpected application errors
 * - WORKSPACE_ERROR: Workspace isolation/enforcement violations
 */

import { classifyOperatorError } from "@/lib/operator-error-governance";

export type ErrorClassification =
  | "AUTH_ERROR"
  | "VALIDATION_ERROR"
  | "DATABASE_ERROR"
  | "EXTERNAL_API_ERROR"
  | "INTERNAL_ERROR"
  | "WORKSPACE_ERROR"
  | "UNKNOWN";

export interface ClassifiedError {
  classification: ErrorClassification;
  message: string;
  code?: string;
  statusCode: number;
  context?: Record<string, unknown>;
  timestamp: string;
  traceId?: string;
}

/**
 * Classify an error for tracking and reporting
 */
export function classifyError(
  error: unknown,
  context?: Record<string, unknown>
): ClassifiedError {
  const now = new Date().toISOString();
  const isErrorObject = error instanceof Error;
  const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  // For non-Error objects, preserve the original input as the message
  // For Error objects, use the transformed operator-safe message
  const message = isErrorObject ? governed.operatorMessage : String(error);
  // Use technical details for classification (contains original error message)
  const technicalContext = governed.technicalDetails.toLowerCase();

  // Auth errors
  if (
    technicalContext.includes("unauthorized") ||
    technicalContext.includes("authentication") ||
    technicalContext.includes("eacces")
  ) {
    return {
      classification: "AUTH_ERROR",
      message,
      statusCode: 401,
      context,
      timestamp: now,
      code: "AUTH_001",
    };
  }

  // Authorization errors
  if (
    technicalContext.includes("forbidden") ||
    technicalContext.includes("permission") ||
    technicalContext.includes("capability")
  ) {
    return {
      classification: "AUTH_ERROR",
      message,
      statusCode: 403,
      context,
      timestamp: now,
      code: "AUTH_002",
    };
  }

  // Validation errors
  if (
    technicalContext.includes("validation") ||
    technicalContext.includes("invalid") ||
    technicalContext.includes("required")
  ) {
    return {
      classification: "VALIDATION_ERROR",
      message,
      statusCode: 400,
      context,
      timestamp: now,
      code: "VAL_001",
    };
  }

  // Database errors
  if (
    technicalContext.includes("database") ||
    technicalContext.includes("econnrefused") ||
    technicalContext.includes("etimedout") ||
    technicalContext.includes("connection refused")
  ) {
    return {
      classification: "DATABASE_ERROR",
      message,
      statusCode: 503,
      context,
      timestamp: now,
      code: "DB_001",
    };
  }

  // External API errors
  if (
    technicalContext.includes("http") ||
    technicalContext.includes("fetch") ||
    technicalContext.includes("request timeout")
  ) {
    return {
      classification: "EXTERNAL_API_ERROR",
      message,
      statusCode: 502,
      context,
      timestamp: now,
      code: "API_001",
    };
  }

  // Workspace enforcement errors
  if (
    technicalContext.includes("workspace") ||
    technicalContext.includes("workspace scoping") ||
    technicalContext.includes("tenant") ||
    technicalContext.includes("workspace violation")
  ) {
    return {
      classification: "WORKSPACE_ERROR",
      message,
      statusCode: 403,
      context,
      timestamp: now,
      code: "WS_001",
    };
  }

  // Default to internal error
  return {
    classification: "INTERNAL_ERROR",
    message,
    statusCode: 500,
    context,
    timestamp: now,
    code: "INT_001",
  };
}

/**
 * Format error for logging
 */
export function formatErrorForLog(classified: ClassifiedError): string {
  return JSON.stringify({
    classification: classified.classification,
    code: classified.code,
    message: classified.message,
    statusCode: classified.statusCode,
    timestamp: classified.timestamp,
    context: classified.context,
  });
}

/**
 * Report error to tracking system (Sentry integration)
 * For now, this is a stub that logs to console.
 * In production, integrate with Sentry SDK:
 *
 * ```typescript
 * import * as Sentry from "@sentry/nextjs";
 *
 * export function reportError(classified: ClassifiedError): void {
 *   if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
 *     Sentry.captureException(new Error(classified.message), {
 *       tags: {
 *         classification: classified.classification,
 *         code: classified.code,
 *       },
 *       contexts: {
 *         error: classified.context,
 *       },
 *     });
 *   } else {
 *     console.error(formatErrorForLog(classified));
 *   }
 * }
 * ```
 */
export function reportError(classified: ClassifiedError): void {
  // Production: Send to Sentry (requires @sentry/nextjs and SENTRY_DSN env var)
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    try {
      // Sentry integration (requires: npm install @sentry/nextjs)
      // import * as Sentry from "@sentry/nextjs";
      // Sentry.captureException(...) would be called here
      console.error(`[${classified.classification}] ${classified.message}`);
    } catch {
      console.error(formatErrorForLog(classified));
    }
  } else {
    // Development/staging: Log to console
    console.error(formatErrorForLog(classified));
  }
}

/**
 * Extract error context for tracking
 * Safely extracts request/response context without exposing sensitive data
 */
export function extractErrorContext(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      stack: undefined,
      name: "NonError",
    };
  }

  return {
    message: error.message,
    stack: error.stack?.split("\n").slice(0, 5).join("\n"), // First 5 stack frames
    name: error.name,
  };
}

/**
 * Error tracking configuration
 * Defines error tracking settings for different environments
 */
export const errorTrackingConfig = {
  production: {
    captureRate: 1.0, // Capture 100% of errors
    reportToSentry: true,
    logLevel: "error",
  },
  staging: {
    captureRate: 1.0, // Capture 100% for testing
    reportToSentry: true,
    logLevel: "warn",
  },
  development: {
    captureRate: 0.5, // Capture 50% to reduce noise
    reportToSentry: false,
    logLevel: "info",
  },
};

/**
 * Get error tracking config for current environment
 */
export function getErrorTrackingConfig() {
  const env = process.env.NODE_ENV || "development";
  return (
    errorTrackingConfig[env as keyof typeof errorTrackingConfig] ||
    errorTrackingConfig.development
  );
}
