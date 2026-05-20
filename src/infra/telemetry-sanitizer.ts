/**
 * PHASE 4: TELEMETRY SANITIZATION
 *
 * Redact secrets, credentials, and sensitive information from telemetry.
 * MANDATORY. ZERO TOLERANCE FOR LEAKS.
 *
 * Never emit:
 * - raw session IDs
 * - raw JWTs
 * - auth headers
 * - cookies
 * - passwords
 * - API keys
 * - tenant existence hints (workspace IDs in errors)
 * - stack traces to client telemetry
 * - raw error messages
 * - database queries
 * - infrastructure internals
 */

import { classifyOperatorError } from "@/lib/operator-error-governance";

/**
 * Sensitive patterns to redact
 */
const SENSITIVE_PATTERNS = [
  // JWT patterns (eyJ... format)
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // Bearer tokens
  /Bearer\s+[A-Za-z0-9_\-\.]+/gi,
  // API keys (common formats)
  /(api[_-]?key|apikey)\s*[=:]\s*[A-Za-z0-9_\-]+/gi,
  // Passwords
  /(password|passwd|pwd)\s*[=:]\s*[^\s,}]+/gi,
  // Session IDs
  /(session[_-]?id|sessionid)\s*[=:]\s*[A-Za-z0-9_\-]+/gi,
  // Authorization headers
  /(authorization|auth)\s*[=:]\s*[^\s,}]+/gi,
  // Database credentials
  /(db[_-]?password|db[_-]?user|database[_-]?password)\s*[=:]\s*[^\s,}]+/gi,
];

/**
 * Redaction marker
 */
const REDACTED = "[REDACTED]";

/**
 * Redact sensitive strings from a value
 */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    let redacted = value;

    // Apply all sensitive patterns
    for (const pattern of SENSITIVE_PATTERNS) {
      redacted = redacted.replace(pattern, REDACTED);
    }

    return redacted;
  }

  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (value !== null && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // Skip sensitive keys entirely
      if (isSensitiveKey(key)) {
        sanitized[key] = REDACTED;
      } else {
        sanitized[key] = redactSecrets(val);
      }
    }
    return sanitized;
  }

  return value;
}

/**
 * Check if a key name suggests sensitive content
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();

  const sensitiveKeywords = [
    "password",
    "passwd",
    "pwd",
    "secret",
    "token",
    "apikey",
    "api_key",
    "auth",
    "authorization",
    "cookie",
    "session",
    "credential",
    "certificate",
    "private_key",
    "privatekey",
    "db_password",
    "db_user",
    "database_url",
    "connection_string",
    "jwt",
    "bearer",
    "oauth",
    "access_token",
    "refresh_token",
    "signing_key",
  ];

  return sensitiveKeywords.some((keyword) => lowerKey.includes(keyword));
}

/**
 * Redact workspace ID if present (tenant existence)
 * Tenant existence leakage is a security issue
 */
export function redactTenantExistence(value: unknown, redactWorkspaceId: boolean = true): unknown {
  if (!redactWorkspaceId) {
    return value;
  }

  if (typeof value === "string") {
    // If it looks like a UUID or workspace ID, consider redacting
    // UUID format: 8-4-4-4-12 hex digits
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
      return REDACTED;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => redactTenantExistence(v, redactWorkspaceId));
  }

  if (value !== null && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (redactWorkspaceId && key.toLowerCase().includes("workspace")) {
        sanitized[key] = REDACTED;
      } else {
        sanitized[key] = redactTenantExistence(val, redactWorkspaceId);
      }
    }
    return sanitized;
  }

  return value;
}

/**
 * Redact error details from telemetry
 * Raw error messages can leak system internals
 */
export function redactErrorDetails(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: classifyOperatorError(new Error("[ERROR MESSAGE REDACTED]"), { context: "load" }).operatorMessage,
      // Never include stack trace
    };
  }

  if (typeof error === "string") {
    return classifyOperatorError(new Error("[ERROR MESSAGE REDACTED]"), { context: "load" }).operatorMessage;
  }

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    return {
      name: obj.name,
      message: classifyOperatorError(new Error("[ERROR MESSAGE REDACTED]"), { context: "load" }).operatorMessage,
      // Remove stack, code, any internal details
    };
  }

  return classifyOperatorError(new Error("[ERROR REDACTED]"), { context: "load" }).operatorMessage;
}

/**
 * Sanitize full telemetry payload for client consumption
 */
export function sanitizeTelemetryForClient(telemetry: Record<string, unknown>): Record<string, unknown> {
  // Remove sensitive fields entirely
  const sanitized = { ...telemetry };

  // Remove internal fields
  delete sanitized.executionTrace;
  delete sanitized.actorId;
  delete sanitized.sourceIp;

  // Redact workspace existence
  if ("workspaceId" in sanitized) {
    delete sanitized.workspaceId;
  }

  // Redact secrets
  return redactSecrets(sanitized) as Record<string, unknown>;
}

/**
 * Sanitize full telemetry payload for operator/internal use
 */
export function sanitizeTelemetryForOperator(telemetry: Record<string, unknown>): Record<string, unknown> {
  // Operators see more details, but still no raw credentials
  const sanitized = { ...telemetry };

  // Redact secrets but keep execution trace
  return redactSecrets(sanitized) as Record<string, unknown>;
}

/**
 * Validate that telemetry doesn't leak secrets
 * Used in tests and CI
 */
export function validateNoSecretLeakage(telemetryJson: string): { safe: boolean; leaks: string[] } {
  const leaks: string[] = [];

  // Check for common patterns
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(telemetryJson)) {
    leaks.push("JWT detected");
  }

  if (/Bearer\s+[A-Za-z0-9_\-\.]+/i.test(telemetryJson)) {
    leaks.push("Bearer token detected");
  }

  if (/(password|passwd|pwd)\s*[:=]/i.test(telemetryJson)) {
    leaks.push("Password field detected");
  }

  if (/(api[_-]?key|apikey)\s*[:=]/i.test(telemetryJson)) {
    leaks.push("API key detected");
  }

  if (/(session[_-]?id|sessionid)\s*[:=]/i.test(telemetryJson)) {
    leaks.push("Session ID detected");
  }

  return {
    safe: leaks.length === 0,
    leaks,
  };
}
