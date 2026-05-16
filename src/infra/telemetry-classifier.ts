/**
 * PHASE 4: TELEMETRY CLASSIFIER
 *
 * Deterministic classification of auth errors to telemetry events.
 * Pure function: no side effects.
 * Exhaustive switch enforcement via TypeScript.
 *
 * Every error code maps to exactly one telemetry event.
 * No ambiguous classifications.
 * No unknown telemetry classes.
 */

import {
  type ErrorCode,
  type Layer1ErrorCode,
  type Layer2ErrorCode,
  type Layer3ErrorCode,
  type Layer4ErrorCode,
} from "./errors";
import {
  type TelemetryEventType,
  type TelemetryClass,
  type TelemetrySeverity,
} from "./telemetry-contracts";

/**
 * Classification decision for a specific error
 */
export interface TelemetryClassification {
  eventType: TelemetryEventType;
  telemetryClass: TelemetryClass;
  authLayer: "identity" | "tenant" | "capability" | "operational" | "infra" | "unknown";
  severity: TelemetrySeverity;
  securityRelevant: boolean;
  infrastructureRelevant: boolean;
}

/**
 * Classify Layer 1 (Identity) errors to telemetry
 * Exhaustive. No ambiguous cases.
 */
function classifyLayer1Error(code: Layer1ErrorCode): TelemetryClassification {
  switch (code) {
    case "AUTH_MISSING":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "AUTH_INVALID",
        authLayer: "identity",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "AUTH_MALFORMED":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "AUTH_INVALID",
        authLayer: "identity",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "AUTH_INVALID":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "AUTH_INVALID",
        authLayer: "identity",
        severity: "MEDIUM",
        securityRelevant: true,
        infrastructureRelevant: false,
      };

    case "AUTH_EXPIRED":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "AUTH_EXPIRED",
        authLayer: "identity",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "AUTH_REVOKED":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "AUTH_REVOKED",
        authLayer: "identity",
        severity: "HIGH",
        securityRelevant: true,
        infrastructureRelevant: false,
      };

    case "AUTH_TAMPERED":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "AUTH_TAMPERED",
        authLayer: "identity",
        severity: "CRITICAL",
        securityRelevant: true,
        infrastructureRelevant: false,
      };

    case "AUTH_BACKEND_UNAVAILABLE":
      return {
        eventType: "INFRA_UNAVAILABLE",
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE",
        authLayer: "infra",
        severity: "CRITICAL",
        securityRelevant: false,
        infrastructureRelevant: true,
      };
  }
}

/**
 * Classify Layer 2 (Tenant) errors to telemetry
 * Exhaustive. No ambiguous cases.
 */
function classifyLayer2Error(code: Layer2ErrorCode): TelemetryClassification {
  switch (code) {
    case "WORKSPACE_MISSING":
      return {
        eventType: "WORKSPACE_DENIED",
        telemetryClass: "WORKSPACE_DENIED",
        authLayer: "tenant",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "WORKSPACE_MALFORMED":
      return {
        eventType: "WORKSPACE_DENIED",
        telemetryClass: "WORKSPACE_DENIED",
        authLayer: "tenant",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "WORKSPACE_NOT_FOUND":
      return {
        eventType: "WORKSPACE_DENIED",
        telemetryClass: "WORKSPACE_NOT_FOUND",
        authLayer: "tenant",
        severity: "LOW",
        securityRelevant: false, // Don't escalate workspace enum as security to SOC
        infrastructureRelevant: false,
      };

    case "WORKSPACE_MEMBERSHIP_MISSING":
      return {
        eventType: "WORKSPACE_DENIED",
        telemetryClass: "WORKSPACE_DENIED",
        authLayer: "tenant",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "WORKSPACE_MEMBERSHIP_INACTIVE":
      return {
        eventType: "WORKSPACE_DENIED",
        telemetryClass: "WORKSPACE_DENIED",
        authLayer: "tenant",
        severity: "MEDIUM",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "WORKSPACE_INACTIVE":
      return {
        eventType: "WORKSPACE_DENIED",
        telemetryClass: "WORKSPACE_DENIED",
        authLayer: "tenant",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "WORKSPACE_BACKEND_UNAVAILABLE":
      return {
        eventType: "INFRA_UNAVAILABLE",
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE",
        authLayer: "infra",
        severity: "CRITICAL",
        securityRelevant: false,
        infrastructureRelevant: true,
      };
  }
}

/**
 * Classify Layer 3 (Capability) errors to telemetry
 * Exhaustive. No ambiguous cases.
 */
function classifyLayer3Error(code: Layer3ErrorCode): TelemetryClassification {
  switch (code) {
    case "CAPABILITY_NOT_GRANTED":
      return {
        eventType: "CAPABILITY_DENIED",
        telemetryClass: "CAPABILITY_DENIED",
        authLayer: "capability",
        severity: "MEDIUM",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "CAPABILITY_REVOKED":
      return {
        eventType: "CAPABILITY_DENIED",
        telemetryClass: "CAPABILITY_DENIED",
        authLayer: "capability",
        severity: "HIGH",
        securityRelevant: true,
        infrastructureRelevant: false,
      };

    case "CAPABILITY_BACKEND_UNAVAILABLE":
      return {
        eventType: "INFRA_UNAVAILABLE",
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE",
        authLayer: "infra",
        severity: "CRITICAL",
        securityRelevant: false,
        infrastructureRelevant: true,
      };
  }
}

/**
 * Classify Layer 4 (Operational Safety) errors to telemetry
 * Exhaustive. No ambiguous cases.
 */
function classifyLayer4Error(code: Layer4ErrorCode): TelemetryClassification {
  switch (code) {
    case "RATE_LIMITED":
      return {
        eventType: "RATE_LIMITED",
        telemetryClass: "RATE_LIMITED",
        authLayer: "operational",
        severity: "MEDIUM",
        securityRelevant: true, // DDoS detection
        infrastructureRelevant: false,
      };

    case "REPLAY_DETECTED":
      return {
        eventType: "REPLAY_DETECTED",
        telemetryClass: "REPLAY_DETECTED",
        authLayer: "operational",
        severity: "HIGH",
        securityRelevant: true, // Attack detection
        infrastructureRelevant: false,
      };

    case "CIRCUIT_OPEN":
      return {
        eventType: "CIRCUIT_OPEN",
        telemetryClass: "CIRCUIT_OPEN",
        authLayer: "operational",
        severity: "HIGH",
        securityRelevant: false,
        infrastructureRelevant: true,
      };

    case "REQUEST_SHED":
      return {
        eventType: "REQUEST_SHED",
        telemetryClass: "REQUEST_SHED",
        authLayer: "operational",
        severity: "MEDIUM",
        securityRelevant: false,
        infrastructureRelevant: true,
      };

    case "SYSTEM_DEGRADED":
      return {
        eventType: "SYSTEM_DEGRADED",
        telemetryClass: "SYSTEM_DEGRADED",
        authLayer: "operational",
        severity: "MEDIUM",
        securityRelevant: false,
        infrastructureRelevant: true,
      };

    case "PARTIAL_VERIFICATION":
      return {
        eventType: "PARTIAL_VERIFICATION",
        telemetryClass: "PARTIAL_VERIFICATION",
        authLayer: "operational",
        severity: "HIGH",
        securityRelevant: true,
        infrastructureRelevant: true,
      };
  }
}

/**
 * Classify other errors to telemetry
 */
function classifyOtherError(code: Exclude<ErrorCode, Layer1ErrorCode | Layer2ErrorCode | Layer3ErrorCode | Layer4ErrorCode>): TelemetryClassification {
  switch (code) {
    case "VALIDATION_ERROR":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "VALIDATION_ERROR",
        authLayer: "unknown",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "NOT_FOUND":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "VALIDATION_ERROR",
        authLayer: "unknown",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "CONFLICT":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "VALIDATION_ERROR",
        authLayer: "unknown",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "DUPLICATE_SUBMISSION":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "VALIDATION_ERROR",
        authLayer: "unknown",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "INVALID_STATE_TRANSITION":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "VALIDATION_ERROR",
        authLayer: "unknown",
        severity: "MEDIUM",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "OPTIMISTIC_LOCK_FAILURE":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "VALIDATION_ERROR",
        authLayer: "unknown",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "POLICY_VIOLATION":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "VALIDATION_ERROR",
        authLayer: "unknown",
        severity: "MEDIUM",
        securityRelevant: true,
        infrastructureRelevant: false,
      };

    case "PLAN_LIMIT_EXCEEDED":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "VALIDATION_ERROR",
        authLayer: "unknown",
        severity: "MEDIUM",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "EXTERNAL_SERVICE_ERROR":
      return {
        eventType: "INFRA_UNAVAILABLE",
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE",
        authLayer: "infra",
        severity: "HIGH",
        securityRelevant: false,
        infrastructureRelevant: true,
      };

    case "STORAGE_ERROR":
      return {
        eventType: "INFRA_UNAVAILABLE",
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE",
        authLayer: "infra",
        severity: "CRITICAL",
        securityRelevant: false,
        infrastructureRelevant: true,
      };

    case "SCHEDULER_ERROR":
      return {
        eventType: "INFRA_UNAVAILABLE",
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE",
        authLayer: "infra",
        severity: "HIGH",
        securityRelevant: false,
        infrastructureRelevant: true,
      };

    case "INTERNAL_ERROR":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "INTERNAL_ERROR",
        authLayer: "unknown",
        severity: "CRITICAL",
        securityRelevant: false,
        infrastructureRelevant: false,
      };

    case "BAD_REQUEST":
      return {
        eventType: "AUTH_FAILURE",
        telemetryClass: "VALIDATION_ERROR",
        authLayer: "unknown",
        severity: "LOW",
        securityRelevant: false,
        infrastructureRelevant: false,
      };
  }
}

/**
 * CANONICAL CLASSIFIER
 * Pure function: maps error code to deterministic telemetry classification
 * Exhaustive via TypeScript switch
 */
export function classifyErrorToTelemetry(code: ErrorCode): TelemetryClassification {
  // Layer 1: Identity
  if (
    code === "AUTH_MISSING" ||
    code === "AUTH_MALFORMED" ||
    code === "AUTH_INVALID" ||
    code === "AUTH_EXPIRED" ||
    code === "AUTH_REVOKED" ||
    code === "AUTH_TAMPERED" ||
    code === "AUTH_BACKEND_UNAVAILABLE"
  ) {
    return classifyLayer1Error(code as Layer1ErrorCode);
  }

  // Layer 2: Tenant
  if (
    code === "WORKSPACE_MISSING" ||
    code === "WORKSPACE_MALFORMED" ||
    code === "WORKSPACE_NOT_FOUND" ||
    code === "WORKSPACE_MEMBERSHIP_MISSING" ||
    code === "WORKSPACE_MEMBERSHIP_INACTIVE" ||
    code === "WORKSPACE_INACTIVE" ||
    code === "WORKSPACE_BACKEND_UNAVAILABLE"
  ) {
    return classifyLayer2Error(code as Layer2ErrorCode);
  }

  // Layer 3: Capability
  if (
    code === "CAPABILITY_NOT_GRANTED" ||
    code === "CAPABILITY_REVOKED" ||
    code === "CAPABILITY_BACKEND_UNAVAILABLE"
  ) {
    return classifyLayer3Error(code as Layer3ErrorCode);
  }

  // Layer 4: Operational
  if (
    code === "RATE_LIMITED" ||
    code === "REPLAY_DETECTED" ||
    code === "CIRCUIT_OPEN" ||
    code === "REQUEST_SHED" ||
    code === "SYSTEM_DEGRADED" ||
    code === "PARTIAL_VERIFICATION"
  ) {
    return classifyLayer4Error(code as Layer4ErrorCode);
  }

  // Other
  return classifyOtherError(code as Exclude<ErrorCode, Layer1ErrorCode | Layer2ErrorCode | Layer3ErrorCode | Layer4ErrorCode>);
}

/**
 * Exhaustiveness check: TypeScript ensures all error codes handled
 * If a new error code is added and not handled above, this will fail to compile
 */
const exhaustivenessCheck = (code: ErrorCode): TelemetryClassification => {
  return classifyErrorToTelemetry(code);
};

// Prevent unused variable warning
void exhaustivenessCheck;
