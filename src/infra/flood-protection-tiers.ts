/**
 * PHASE 5: AUDIT STRATIFICATION ENGINE
 *
 * Deterministic 3-tier system for audit event classification.
 *
 * TIER 1 — ALWAYS PERSIST
 * Critical state changes and security incidents that must NEVER be dropped:
 * - AUTH_REVOKED (session revoked)
 * - SESSION_TAMPERED (credential manipulation detected)
 * - CAPABILITY_REVOKED (permissions revoked)
 * - WORKSPACE_MEMBERSHIP_REVOKED
 * - SECURITY_INCIDENT_DETECTED (attack detected)
 * - CIRCUIT_OPEN (system degrading)
 * - SYSTEM_DEGRADED
 *
 * TIER 2 — ADAPTIVE SAMPLED
 * High-frequency operational/security events that scale with attack intensity:
 * - AUTH_INVALID (failed credential)
 * - WORKSPACE_DENIED (permission check failed)
 * - CAPABILITY_DENIED (capability check failed)
 * - RATE_LIMITED (rate limit enforced)
 * - REPLAY_DETECTED (replay attack suspected)
 *
 * TIER 3 — METRICS ONLY
 * Noise and client errors that don't need individual audit records:
 * - MALFORMED_HEADER
 * - PARSING_FAILED
 * - INVALID_REQUEST_FORMAT
 * - NORMAL_RETRY
 * - CLIENT_TIMEOUT
 */

import type { AuditEventName } from "@/domain/constants/audit-events";
import type { TelemetryClass } from "@/infra/telemetry-contracts";

/**
 * Audit stratification tier
 */
export type AuditStratificationTier = "TIER_1_ALWAYS_PERSIST" | "TIER_2_ADAPTIVE_SAMPLED" | "TIER_3_METRICS_ONLY";

/**
 * Audit event classification record
 */
export interface AuditEventClassification {
  eventName: AuditEventName | string;
  tier: AuditStratificationTier;
  description: string;
  alwaysSampled: boolean;
  escalatesIncident: boolean;
}

/**
 * Complete audit event taxonomy
 * Maps every possible event to its stratification tier
 */
const AUDIT_TAXONOMY: Record<string, AuditEventClassification> = {
  // TIER 1: ALWAYS PERSIST — Critical state changes
  AUTH_REVOKED: {
    eventName: "AUTH_REVOKED",
    tier: "TIER_1_ALWAYS_PERSIST",
    description: "Session revoked by explicit action",
    alwaysSampled: true,
    escalatesIncident: true,
  },
  SESSION_TAMPERED: {
    eventName: "SESSION_TAMPERED",
    tier: "TIER_1_ALWAYS_PERSIST",
    description: "Credential manipulation detected (replay, token modification)",
    alwaysSampled: true,
    escalatesIncident: true,
  },
  CAPABILITY_REVOKED: {
    eventName: "CAPABILITY_REVOKED",
    tier: "TIER_1_ALWAYS_PERSIST",
    description: "Permission or capability revoked",
    alwaysSampled: true,
    escalatesIncident: true,
  },
  WORKSPACE_MEMBERSHIP_REVOKED: {
    eventName: "WORKSPACE_MEMBERSHIP_REVOKED",
    tier: "TIER_1_ALWAYS_PERSIST",
    description: "User removed from workspace",
    alwaysSampled: true,
    escalatesIncident: true,
  },
  SECURITY_INCIDENT_DETECTED: {
    eventName: "SECURITY_INCIDENT_DETECTED",
    tier: "TIER_1_ALWAYS_PERSIST",
    description: "Attack detected (credential stuffing, replay flood, enumeration)",
    alwaysSampled: true,
    escalatesIncident: true,
  },
  CIRCUIT_OPEN: {
    eventName: "CIRCUIT_OPEN",
    tier: "TIER_1_ALWAYS_PERSIST",
    description: "Circuit breaker opened (system degrading)",
    alwaysSampled: true,
    escalatesIncident: true,
  },
  SYSTEM_DEGRADED: {
    eventName: "SYSTEM_DEGRADED",
    tier: "TIER_1_ALWAYS_PERSIST",
    description: "System health degraded",
    alwaysSampled: true,
    escalatesIncident: true,
  },

  // TIER 2: ADAPTIVE SAMPLED — High-frequency operational/security
  AUTH_INVALID: {
    eventName: "AUTH_INVALID",
    tier: "TIER_2_ADAPTIVE_SAMPLED",
    description: "Invalid credential provided",
    alwaysSampled: false,
    escalatesIncident: false,
  },
  WORKSPACE_DENIED: {
    eventName: "WORKSPACE_DENIED",
    tier: "TIER_2_ADAPTIVE_SAMPLED",
    description: "Workspace access denied (permission check failed)",
    alwaysSampled: false,
    escalatesIncident: false,
  },
  CAPABILITY_DENIED: {
    eventName: "CAPABILITY_DENIED",
    tier: "TIER_2_ADAPTIVE_SAMPLED",
    description: "Capability check failed",
    alwaysSampled: false,
    escalatesIncident: false,
  },
  RATE_LIMITED: {
    eventName: "RATE_LIMITED",
    tier: "TIER_2_ADAPTIVE_SAMPLED",
    description: "Request rate limited",
    alwaysSampled: false,
    escalatesIncident: false,
  },
  REPLAY_DETECTED: {
    eventName: "REPLAY_DETECTED",
    tier: "TIER_2_ADAPTIVE_SAMPLED",
    description: "Replay attack attempt detected",
    alwaysSampled: false,
    escalatesIncident: false,
  },

  // TIER 3: METRICS ONLY — Noise and client errors
  MALFORMED_HEADER: {
    eventName: "MALFORMED_HEADER",
    tier: "TIER_3_METRICS_ONLY",
    description: "Malformed HTTP header (no audit record)",
    alwaysSampled: false,
    escalatesIncident: false,
  },
  PARSING_FAILED: {
    eventName: "PARSING_FAILED",
    tier: "TIER_3_METRICS_ONLY",
    description: "Request parsing failed (no audit record)",
    alwaysSampled: false,
    escalatesIncident: false,
  },
  INVALID_REQUEST_FORMAT: {
    eventName: "INVALID_REQUEST_FORMAT",
    tier: "TIER_3_METRICS_ONLY",
    description: "Invalid request format (no audit record)",
    alwaysSampled: false,
    escalatesIncident: false,
  },
  NORMAL_RETRY: {
    eventName: "NORMAL_RETRY",
    tier: "TIER_3_METRICS_ONLY",
    description: "Normal client retry (no audit record)",
    alwaysSampled: false,
    escalatesIncident: false,
  },
  CLIENT_TIMEOUT: {
    eventName: "CLIENT_TIMEOUT",
    tier: "TIER_3_METRICS_ONLY",
    description: "Client timeout (no audit record)",
    alwaysSampled: false,
    escalatesIncident: false,
  },
};

/**
 * Classify an audit event into stratification tier
 *
 * Returns TIER_3_METRICS_ONLY for unknown events (fail-safe: don't break on new events)
 */
export function classifyAuditEvent(eventName: string): AuditEventClassification {
  return AUDIT_TAXONOMY[eventName] || {
    eventName,
    tier: "TIER_3_METRICS_ONLY",
    description: "Unknown event (defaulting to metrics-only for safety)",
    alwaysSampled: false,
    escalatesIncident: false,
  };
}

/**
 * Determine if event should be persisted to audit table
 *
 * TIER 1: Always persist
 * TIER 2: Persist only if sampled (depends on escalation state)
 * TIER 3: Never persist (metrics only)
 */
export function shouldPersistAuditEvent(
  eventName: string,
  escalationState: "NORMAL" | "ELEVATED" | "HIGH" | "CRITICAL",
  sampleDecision: boolean
): boolean {
  const classification = classifyAuditEvent(eventName);

  if (classification.tier === "TIER_1_ALWAYS_PERSIST") {
    return true;
  }

  if (classification.tier === "TIER_2_ADAPTIVE_SAMPLED") {
    // Persist if sample decision is yes
    return sampleDecision;
  }

  if (classification.tier === "TIER_3_METRICS_ONLY") {
    return false;
  }

  return false;
}

/**
 * Get all TIER_1 events (critical, always-persist)
 */
export function getTier1Events(): AuditEventClassification[] {
  return Object.values(AUDIT_TAXONOMY).filter(
    (e) => e.tier === "TIER_1_ALWAYS_PERSIST"
  );
}

/**
 * Get all TIER_2 events (adaptive-sampled)
 */
export function getTier2Events(): AuditEventClassification[] {
  return Object.values(AUDIT_TAXONOMY).filter(
    (e) => e.tier === "TIER_2_ADAPTIVE_SAMPLED"
  );
}

/**
 * Get all TIER_3 events (metrics-only)
 */
export function getTier3Events(): AuditEventClassification[] {
  return Object.values(AUDIT_TAXONOMY).filter(
    (e) => e.tier === "TIER_3_METRICS_ONLY"
  );
}

/**
 * Verify taxonomy completeness
 * Called at startup to catch missing event classifications
 */
export function verifyAuditTaxonomy(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (getTier1Events().length === 0) {
    errors.push("TIER_1_ALWAYS_PERSIST: No events classified");
  }

  if (getTier2Events().length === 0) {
    errors.push("TIER_2_ADAPTIVE_SAMPLED: No events classified");
  }

  if (getTier3Events().length === 0) {
    errors.push("TIER_3_METRICS_ONLY: No events classified");
  }

  // Verify no duplicate event names
  const eventNames = new Set<string>();
  for (const event of Object.values(AUDIT_TAXONOMY)) {
    if (eventNames.has(event.eventName)) {
      errors.push(`Duplicate event classification: ${event.eventName}`);
    }
    eventNames.add(event.eventName);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
