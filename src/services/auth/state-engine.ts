/**
 * AUTH STATE ENGINE — Deterministic Auth Evaluation
 *
 * Maps every auth scenario to exact:
 * - HTTP status code
 * - Telemetry classification
 * - Handler allowance
 * - Mutation allowance
 * - Retryability
 *
 * Pure function, no side effects, exhaustive coverage.
 */

import {
  UnauthorizedError,
  ForbiddenError,
  ServiceUnavailableError,
  type InfrastructureErrorCode,
  type AuditClass,
} from "@/infra/errors";

// Auth state enumeration — exhaustive, no gaps
export type AuthState =
  // Layer 1: Identity
  | "NO_CREDENTIALS"
  | "MALFORMED_CREDENTIALS"
  | "SESSION_INVALID"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "SESSION_TAMPERED"
  | "SESSION_VALID"
  // Layer 2: Tenant
  | "WORKSPACE_MISSING_HEADER"
  | "WORKSPACE_MALFORMED_HEADER"
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_MEMBERSHIP_MISSING"
  | "WORKSPACE_MEMBERSHIP_INACTIVE"
  | "WORKSPACE_INACTIVE"
  | "WORKSPACE_VERIFIED"
  // Layer 3: Capability
  | "CAPABILITY_NOT_GRANTED"
  | "CAPABILITY_REVOKED"
  | "CAPABILITY_VERIFIED"
  // Layer 4: Operational
  | "RATE_LIMITED"
  | "REPLAY_DETECTED"
  | "CIRCUIT_OPEN"
  | "REQUEST_SHED"
  | "SYSTEM_DEGRADED"
  // Infrastructure failures
  | "AUTH_BACKEND_UNAVAILABLE"
  | "WORKSPACE_BACKEND_UNAVAILABLE"
  | "CAPABILITY_BACKEND_UNAVAILABLE"
  | "PARTIAL_VERIFICATION";

// Decision output — complete classification
export interface AuthStateDecision {
  state: AuthState;
  httpStatus: number;
  layer: 1 | 2 | 3 | 4 | 5; // 5 = infrastructure
  telemetryClass: string;
  auditClass: AuditClass;
  handlerAllowed: boolean;
  mutationAllowed: boolean;
  retryable: boolean;
  errorFactory: (correlationId?: string) => Error;
}

/**
 * CANONICAL STATE MACHINE — Zero ambiguity
 *
 * Input: AuthState
 * Output: deterministic decision
 */
export function evaluateAuthState(
  state: AuthState,
  correlationId?: string
): AuthStateDecision {
  switch (state) {
    // ====== LAYER 1: IDENTITY AUTHENTICATION ======
    case "NO_CREDENTIALS":
      return {
        state,
        httpStatus: 401,
        layer: 1,
        telemetryClass: "AUTH_INVALID",
        auditClass: "AUTH_FAILED",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new UnauthorizedError(
            "AUTH_MISSING",
            "Authentication required",
            correlationId
          ),
      };

    case "MALFORMED_CREDENTIALS":
      return {
        state,
        httpStatus: 400,
        layer: 1,
        telemetryClass: "VALIDATION_ERROR",
        auditClass: "CLIENT_ERROR",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new UnauthorizedError(
            "AUTH_MALFORMED",
            "Malformed credentials",
            correlationId
          ),
      };

    case "SESSION_INVALID":
      return {
        state,
        httpStatus: 401,
        layer: 1,
        telemetryClass: "AUTH_INVALID",
        auditClass: "AUTH_FAILED",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new UnauthorizedError(
            "AUTH_INVALID",
            "Invalid session",
            correlationId
          ),
      };

    case "SESSION_EXPIRED":
      return {
        state,
        httpStatus: 401,
        layer: 1,
        telemetryClass: "AUTH_EXPIRED",
        auditClass: "AUTH_FAILED",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: true, // Client can refresh and retry
        errorFactory: () =>
          new UnauthorizedError(
            "AUTH_EXPIRED",
            "Session expired",
            correlationId
          ),
      };

    case "SESSION_REVOKED":
      return {
        state,
        httpStatus: 401,
        layer: 1,
        telemetryClass: "AUTH_REVOKED",
        auditClass: "SECURITY_EVENT",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new UnauthorizedError(
            "AUTH_REVOKED",
            "Session revoked",
            correlationId
          ),
      };

    case "SESSION_TAMPERED":
      return {
        state,
        httpStatus: 401,
        layer: 1,
        telemetryClass: "AUTH_TAMPERED",
        auditClass: "SECURITY_EVENT",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new UnauthorizedError(
            "AUTH_TAMPERED",
            "Credentials tampered",
            correlationId
          ),
      };

    case "SESSION_VALID":
      // Not a terminal state — continue to next layer
      return {
        state,
        httpStatus: 200, // Placeholder, should not return this
        layer: 1,
        telemetryClass: "NONE",
        auditClass: "AUTH_FAILED", // Placeholder
        handlerAllowed: true, // Proceed to next layer
        mutationAllowed: false, // Still on auth layer
        retryable: false,
        errorFactory: () => new Error("SESSION_VALID is not terminal"),
      };

    // ====== LAYER 2: TENANT AUTHORIZATION ======
    case "WORKSPACE_MISSING_HEADER":
      return {
        state,
        httpStatus: 400,
        layer: 2,
        telemetryClass: "WORKSPACE_DENIED",
        auditClass: "CLIENT_ERROR",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new ForbiddenError(
            "WORKSPACE_MISSING",
            "Workspace context required",
            correlationId
          ),
      };

    case "WORKSPACE_MALFORMED_HEADER":
      return {
        state,
        httpStatus: 400,
        layer: 2,
        telemetryClass: "WORKSPACE_DENIED",
        auditClass: "CLIENT_ERROR",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new ForbiddenError(
            "WORKSPACE_MALFORMED",
            "Invalid workspace ID format",
            correlationId
          ),
      };

    case "WORKSPACE_NOT_FOUND":
      return {
        state,
        httpStatus: 403,
        layer: 2,
        telemetryClass: "WORKSPACE_NOT_FOUND",
        auditClass: "WORKSPACE_ACCESS_DENIED",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new ForbiddenError(
            "WORKSPACE_NOT_FOUND",
            "Workspace not found or access denied",
            correlationId
          ),
      };

    case "WORKSPACE_MEMBERSHIP_MISSING":
      return {
        state,
        httpStatus: 403,
        layer: 2,
        telemetryClass: "WORKSPACE_DENIED",
        auditClass: "WORKSPACE_ACCESS_DENIED",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new ForbiddenError(
            "WORKSPACE_MEMBERSHIP_MISSING",
            "Not member of this workspace",
            correlationId
          ),
      };

    case "WORKSPACE_MEMBERSHIP_INACTIVE":
      return {
        state,
        httpStatus: 403,
        layer: 2,
        telemetryClass: "WORKSPACE_DENIED",
        auditClass: "WORKSPACE_ACCESS_DENIED",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new ForbiddenError(
            "WORKSPACE_MEMBERSHIP_INACTIVE",
            "Workspace membership inactive",
            correlationId
          ),
      };

    case "WORKSPACE_INACTIVE":
      return {
        state,
        httpStatus: 403,
        layer: 2,
        telemetryClass: "WORKSPACE_DENIED",
        auditClass: "WORKSPACE_ACCESS_DENIED",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new ForbiddenError(
            "WORKSPACE_INACTIVE",
            "Workspace inactive",
            correlationId
          ),
      };

    case "WORKSPACE_VERIFIED":
      return {
        state,
        httpStatus: 200, // Placeholder
        layer: 2,
        telemetryClass: "NONE",
        auditClass: "AUTH_FAILED",
        handlerAllowed: true, // Proceed to next layer
        mutationAllowed: false,
        retryable: false,
        errorFactory: () => new Error("WORKSPACE_VERIFIED is not terminal"),
      };

    // ====== LAYER 3: CAPABILITY AUTHORIZATION ======
    case "CAPABILITY_NOT_GRANTED":
      return {
        state,
        httpStatus: 403,
        layer: 3,
        telemetryClass: "CAPABILITY_DENIED",
        auditClass: "CAPABILITY_DENIED",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new ForbiddenError(
            "CAPABILITY_NOT_GRANTED",
            "Insufficient permissions",
            correlationId
          ),
      };

    case "CAPABILITY_REVOKED":
      return {
        state,
        httpStatus: 403,
        layer: 3,
        telemetryClass: "CAPABILITY_REVOKED",
        auditClass: "CAPABILITY_DENIED",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: false,
        errorFactory: () =>
          new ForbiddenError(
            "CAPABILITY_REVOKED",
            "Capability revoked",
            correlationId
          ),
      };

    case "CAPABILITY_VERIFIED":
      return {
        state,
        httpStatus: 200, // Placeholder
        layer: 3,
        telemetryClass: "NONE",
        auditClass: "AUTH_FAILED",
        handlerAllowed: true, // All auth layers passed
        mutationAllowed: true, // Can now mutate
        retryable: false,
        errorFactory: () => new Error("CAPABILITY_VERIFIED is not terminal"),
      };

    // ====== LAYER 4: OPERATIONAL SAFETY ======
    case "RATE_LIMITED":
      return {
        state,
        httpStatus: 429,
        layer: 4,
        telemetryClass: "RATE_LIMITED",
        auditClass: "RATE_LIMIT_EXCEEDED",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: true,
        errorFactory: () =>
          new ServiceUnavailableError(
            "RATE_LIMITED" as InfrastructureErrorCode,
            "Rate limit exceeded",
            correlationId
          ),
      };

    case "REPLAY_DETECTED":
      return {
        state,
        httpStatus: 200, // Return cached response
        layer: 4,
        telemetryClass: "REPLAY_DETECTED",
        auditClass: "INTERNAL_ERROR",
        handlerAllowed: false, // Use cached response, not handler
        mutationAllowed: false,
        retryable: true,
        errorFactory: () =>
          new ServiceUnavailableError(
            "REPLAY_DETECTED" as InfrastructureErrorCode,
            "Request is duplicate",
            correlationId
          ),
      };

    case "CIRCUIT_OPEN":
      return {
        state,
        httpStatus: 503,
        layer: 4,
        telemetryClass: "CIRCUIT_OPEN",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: true,
        errorFactory: () =>
          new ServiceUnavailableError(
            "CIRCUIT_OPEN",
            "Service temporarily unavailable",
            correlationId
          ),
      };

    case "REQUEST_SHED":
      return {
        state,
        httpStatus: 503,
        layer: 4,
        telemetryClass: "REQUEST_SHED",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: true,
        errorFactory: () =>
          new ServiceUnavailableError(
            "REQUEST_SHED",
            "Service overloaded",
            correlationId
          ),
      };

    case "SYSTEM_DEGRADED":
      return {
        state,
        httpStatus: 503,
        layer: 4,
        telemetryClass: "SYSTEM_DEGRADED",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: true,
        errorFactory: () =>
          new ServiceUnavailableError(
            "SYSTEM_DEGRADED",
            "System health degraded",
            correlationId
          ),
      };

    // ====== LAYER 5: INFRASTRUCTURE FAILURES ======
    case "AUTH_BACKEND_UNAVAILABLE":
      return {
        state,
        httpStatus: 503,
        layer: 5,
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: true,
        errorFactory: () =>
          new ServiceUnavailableError(
            "AUTH_BACKEND_UNAVAILABLE",
            "Auth service unavailable",
            correlationId
          ),
      };

    case "WORKSPACE_BACKEND_UNAVAILABLE":
      return {
        state,
        httpStatus: 503,
        layer: 5,
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE", // Workspace is part of auth
        auditClass: "INFRASTRUCTURE_INCIDENT",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: true,
        errorFactory: () =>
          new ServiceUnavailableError(
            "WORKSPACE_BACKEND_UNAVAILABLE",
            "Workspace service unavailable",
            correlationId
          ),
      };

    case "CAPABILITY_BACKEND_UNAVAILABLE":
      return {
        state,
        httpStatus: 503,
        layer: 5,
        telemetryClass: "CAPABILITY_BACKEND_UNAVAILABLE",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: true,
        errorFactory: () =>
          new ServiceUnavailableError(
            "CAPABILITY_BACKEND_UNAVAILABLE",
            "Capability service unavailable",
            correlationId
          ),
      };

    case "PARTIAL_VERIFICATION":
      return {
        state,
        httpStatus: 503,
        layer: 5,
        telemetryClass: "PARTIAL_VERIFICATION",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        handlerAllowed: false,
        mutationAllowed: false,
        retryable: true,
        errorFactory: () =>
          new ServiceUnavailableError(
            "PARTIAL_VERIFICATION",
            "Partial verification - some layers unavailable",
            correlationId
          ),
      };

    default:
      // Exhaustiveness check — TypeScript compiler will warn if cases missing
      const _exhaustive: never = state;
      return _exhaustive;
  }
}

/**
 * Verify exhaustiveness at runtime (defensive)
 */
export function isExhaustiveState(state: AuthState): boolean {
  return evaluateAuthState(state).state === state;
}
