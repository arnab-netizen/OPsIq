/**
 * PHASE A: Raw Auth Facts Layer
 *
 * This module extracts pure authentication/authorization facts from the legacy system.
 * These facts represent raw state (does session exist, is user in workspace, etc.)
 * NOT decisions about HTTP status codes or error types.
 *
 * The canonical wrapper uses these facts to make all semantic decisions:
 * - Error classification (401 vs 403 vs 500)
 * - Status code mapping
 * - Telemetry and tracing
 * - Auth flow control
 *
 * Legacy helpers become pure data providers only (PHASE F).
 */

import type { CapabilityName } from "@/domain/constants/capabilities";
import type { SessionInfo } from "@/services/auth";
import type { PolicyContext } from "@/policies/capability-check";
import { hasCapability, hasInternalAccess } from "@/policies/capability-check";
import { resolveCanonicalCapabilities } from "@/lib/canonical-capability-resolver";
import type { VerifiedWorkspaceId } from "@/lib/workspace-identity";

// ─── Auth Facts: Raw State ──────────────────────────────────────────────────

/** Raw session fact: session exists and is valid, or doesn't exist, or is expired/revoked */
export interface SessionFact {
  exists: boolean;
  valid: boolean;
  session: SessionInfo | null;
  invalidReason?: "expired" | "revoked" | "inactive_user" | "not_found";
}

/** Raw policy fact: policy context exists, or user has no role in workspace */
export interface PolicyFact {
  exists: boolean;
  valid: boolean;
  policy: PolicyContext | null;
  invalidReason?: "no_session" | "no_roles" | "not_found";
}

/** Raw capability fact: user has/lacks capability in given scope */
export interface CapabilityFact {
  granted: boolean;
  capability: CapabilityName;
  scope?: { type: string; id: string };
  reason?: string;
}

/** Raw internal-access fact: user has/lacks internal-only roles */
export interface InternalAccessFact {
  granted: boolean;
  reason?: string;
}

// ─── Auth State: Combined Facts ──────────────────────────────────────────────

/**
 * Complete auth state at a point in time.
 * Represents the raw facts before any decision-making.
 */
export interface AuthState {
  // Timeline: when request started
  timestamp: Date;
  correlationId: string;
  requestId: string;

  // Session layer
  sessionFact: SessionFact;

  // Policy layer (depends on session)
  policyFact: PolicyFact;

  // Capability layer (depends on policy)
  capabilityFacts: Map<CapabilityName, CapabilityFact>;

  // Internal access check
  internalAccessFact: InternalAccessFact;

  // Workspace requirement — VerifiedWorkspaceId means DB membership was proven
  workspaceRequired: boolean;
  workspaceId: VerifiedWorkspaceId | null;
  workspaceValid: boolean;
}

// ─── Auth Decision: Results of evaluating facts ──────────────────────────────

/**
 * HTTP-level decision made by canonical wrapper.
 * Maps from auth facts to HTTP response semantics.
 */
export interface AuthDecision {
  // Allow or reject
  allowed: boolean;

  // HTTP response status code
  statusCode: 200 | 401 | 403 | 429 | 503 | 500;
  message: string;

  // Context available to handler (if allowed)
  context: {
    session: SessionInfo;
    policy: PolicyContext;
    verifiedActorId: string;
    verifiedActorType: "user";
    verifiedWorkspaceId: VerifiedWorkspaceId;
    verifiedCapabilities: Set<string>;
  } | null;

  // Trace for debugging
  trace: AuthDecisionTrace;
}

export interface AuthDecisionTrace {
  decision: "allow" | "reject";
  reason: string;
  checks: Array<{
    check: string;
    result: boolean | string;
    detail?: string;
  }>;
}

// ─── Fact Builders: Extract facts from legacy helpers ────────────────────────

/**
 * Build SessionFact from actual session fetch.
 * No errors thrown - just facts.
 */
export async function buildSessionFact(
  sessionInfo: SessionInfo | null,
  invalidReason?: "expired" | "revoked" | "inactive_user" | "not_found"
): Promise<SessionFact> {
  const exists = sessionInfo !== null;
  const valid = exists && !invalidReason;

  return {
    exists,
    valid,
    session: sessionInfo,
    invalidReason,
  };
}

/**
 * Build PolicyFact from actual policy fetch.
 * No errors thrown - just facts.
 */
export async function buildPolicyFact(
  policyInfo: PolicyContext | null,
  invalidReason?: "no_session" | "no_roles" | "not_found"
): Promise<PolicyFact> {
  const exists = policyInfo !== null;
  const valid = exists && !invalidReason;

  return {
    exists,
    valid,
    policy: policyInfo,
    invalidReason,
  };
}

/**
 * Build CapabilityFact from hasCapability check.
 * Evaluates and records the result.
 */
export function buildCapabilityFact(
  policy: PolicyContext | null,
  capability: CapabilityName,
  scope?: { type: string; id: string }
): CapabilityFact {
  if (!policy) {
    return {
      granted: false,
      capability,
      scope,
      reason: "no_policy",
    };
  }

  const granted = hasCapability(policy, capability, scope);

  return {
    granted,
    capability,
    scope,
    reason: granted ? "role_has_capability" : "role_lacks_capability",
  };
}

/**
 * Build InternalAccessFact from hasInternalAccess check.
 */
export function buildInternalAccessFact(policy: PolicyContext | null): InternalAccessFact {
  if (!policy) {
    return {
      granted: false,
      reason: "no_policy",
    };
  }

  const granted = hasInternalAccess(policy);

  return {
    granted,
    reason: granted ? "has_internal_role" : "only_client_roles",
  };
}

// ─── Auth State Builder: Orchestrate all facts ──────────────────────────────

/**
 * Build complete auth state from facts.
 * This is called by canonical wrapper to gather all raw auth state before decisions.
 *
 * This function:
 * 1. Gathers all facts (session, policy, capabilities)
 * 2. Validates workspace requirement
 * 3. Returns complete state for decision-making
 *
 * No errors thrown - just facts.
 */
// ─── Response Translation: Facts → HTTP ────────────────────────────────────

/**
 * PHASE A STEP A3: Single Error Translation Layer
 *
 * ONLY this layer may translate auth decisions to HTTP responses.
 * ONLY this layer may emit status codes and error semantics.
 * Legacy system must NEVER generate responses.
 *
 * This is the canonical wrapper's exclusive authority:
 * AuthDecision → HTTP Status Code + Message
 */

export interface AuthErrorResponse {
  status: 401 | 403 | 429 | 503 | 500;
  body: {
    error: string;
    correlationId: string;
    detail?: string;
  };
}

/**
 * Translate auth decision to HTTP error response.
 * ONLY called by canonical wrapper when auth fails.
 * ONLY place where HTTP status codes are generated.
 *
 * This gives canonical wrapper absolute authority over:
 * - 401 vs 403 vs 429 vs 503 vs 500 decisions
 * - Error message semantics
 * - HTTP response headers
 */
export function translateAuthDecisionToResponse(
  decision: AuthDecision,
  correlationId: string
): AuthErrorResponse {
  if (decision.allowed) {
    throw new Error("translateAuthDecisionToResponse: decision.allowed must be false");
  }

  const status = decision.statusCode as 401 | 403 | 429 | 503 | 500;

  return {
    status,
    body: {
      error: decision.message,
      correlationId,
      ...(status === 403 && { detail: "Insufficient permissions" }),
      ...(status === 401 && { detail: "Please authenticate" }),
      ...(status === 429 && { detail: "Too many requests" }),
      ...(status === 503 && { detail: "Service temporarily unavailable" }),
      ...(status === 500 && { detail: "Internal server error" }),
    },
  };
}

/**
 * Validate that legacy system does NOT own error generation.
 *
 * This function can be called in tests to ensure legacy helpers
 * are not throwing HTTP-semantic errors anymore.
 *
 * FORBIDDEN legacy behaviors:
 * - throw new UnauthorizedError() → must return fact instead
 * - throw new ForbiddenError() → must return fact instead
 * - generate NextResponse directly → wrapper owns this
 * - emit auth telemetry → wrapper owns this
 */
export function validateLegacySemanticStripdown(context: {
  legacyThrowsErrors: boolean;
  legacyEmitsResponses: boolean;
  legacyEmitsTelemetry: boolean;
  canonicalOwnsDecisions: boolean;
  canonicalOwnsResponses: boolean;
}): boolean {
  if (context.legacyThrowsErrors) {
    console.error(
      "[PHASE A VIOLATION] Legacy system still throws HTTP-semantic errors"
    );
    return false;
  }
  if (context.legacyEmitsResponses) {
    console.error("[PHASE A VIOLATION] Legacy system still emits responses");
    return false;
  }
  if (context.legacyEmitsTelemetry) {
    console.error(
      "[PHASE A VIOLATION] Legacy system still emits auth telemetry"
    );
    return false;
  }
  if (!context.canonicalOwnsDecisions) {
    console.error(
      "[PHASE A VIOLATION] Canonical wrapper does not own auth decisions"
    );
    return false;
  }
  if (!context.canonicalOwnsResponses) {
    console.error("[PHASE A VIOLATION] Canonical wrapper does not own responses");
    return false;
  }
  return true;
}

// ─── Auth State Builder: Orchestrate all facts ──────────────────────────────

/**
 * Build complete auth state from facts.
 * This is called by canonical wrapper to gather all raw auth state before decisions.
 *
 * This function:
 * 1. Gathers all facts (session, policy, capabilities)
 * 2. Validates workspace requirement
 * 3. Returns complete state for decision-making
 *
 * No errors thrown - just facts.
 */
export async function buildAuthState(input: {
  correlationId: string;
  requestId: string;
  workspaceId: VerifiedWorkspaceId | null;
  workspaceRequired: boolean;
  sessionFact: SessionFact;
  policyFact: PolicyFact;
  requiredCapabilities?: CapabilityName[];
}): Promise<AuthState> {
  const capabilityFacts = new Map<CapabilityName, CapabilityFact>();

  if (input.requiredCapabilities && input.policyFact.valid && input.policyFact.policy) {
    for (const cap of input.requiredCapabilities) {
      const fact = buildCapabilityFact(input.policyFact.policy, cap);
      capabilityFacts.set(cap, fact);
    }
  }

  const internalAccessFact = buildInternalAccessFact(
    input.policyFact.valid ? input.policyFact.policy : null
  );

  const workspaceValid =
    !input.workspaceRequired ||
    (input.workspaceId !== null && input.workspaceId.length > 0);

  return {
    timestamp: new Date(),
    correlationId: input.correlationId,
    requestId: input.requestId,
    sessionFact: input.sessionFact,
    policyFact: input.policyFact,
    capabilityFacts,
    internalAccessFact,
    workspaceRequired: input.workspaceRequired,
    workspaceId: input.workspaceId,
    workspaceValid,
  };
}

// ─── Decision Evaluator: Facts → HTTP Response ──────────────────────────────

/**
 * Evaluate auth state and make decision about HTTP response.
 * This is where the canonical wrapper owns all semantic authority.
 */
export function evaluateAuthState(
  state: AuthState,
  options: {
    requireWorkspace?: boolean;
    requireCapabilities?: CapabilityName[];
    requireInternalOnly?: boolean;
  } = {}
): AuthDecision {
  const trace: AuthDecisionTrace = {
    decision: "reject",
    reason: "",
    checks: [],
  };

  // Check 1: Session required
  if (!state.sessionFact.valid) {
    trace.decision = "reject";
    trace.reason = `Session invalid: ${state.sessionFact.invalidReason || "unknown"}`;
    trace.checks.push({
      check: "session_valid",
      result: false,
      detail: state.sessionFact.invalidReason,
    });

    return {
      allowed: false,
      statusCode: 401,
      message: "Unauthorized",
      context: null,
      trace,
    };
  }

  trace.checks.push({
    check: "session_valid",
    result: true,
  });

  // Check 2: Policy context required (if session valid)
  if (!state.policyFact.valid) {
    trace.decision = "reject";
    trace.reason = `Policy invalid: ${state.policyFact.invalidReason || "unknown"}`;
    trace.checks.push({
      check: "policy_valid",
      result: false,
      detail: state.policyFact.invalidReason,
    });

    return {
      allowed: false,
      statusCode: 401,
      message: "Unauthorized",
      context: null,
      trace,
    };
  }

  trace.checks.push({
    check: "policy_valid",
    result: true,
  });

  // Check 3: Workspace requirement (if present)
  if (options.requireWorkspace && !state.workspaceValid) {
    trace.decision = "reject";
    trace.reason = "Workspace required but not provided or invalid";
    trace.checks.push({
      check: "workspace_valid",
      result: false,
    });

    return {
      allowed: false,
      statusCode: 403,
      message: "Workspace required",
      context: null,
      trace,
    };
  }

  if (state.workspaceRequired) {
    trace.checks.push({
      check: "workspace_valid",
      result: state.workspaceValid,
    });
  }

  // Check 4: Capability requirements
  if (options.requireCapabilities && options.requireCapabilities.length > 0) {
    const missingCapabilities = options.requireCapabilities.filter((cap) => {
      const fact = state.capabilityFacts.get(cap);
      return !fact || !fact.granted;
    });

    if (missingCapabilities.length > 0) {
      trace.decision = "reject";
      trace.reason = `Missing capabilities: ${missingCapabilities.join(", ")}`;
      trace.checks.push({
        check: "required_capabilities",
        result: false,
        detail: missingCapabilities.join(", "),
      });

      return {
        allowed: false,
        statusCode: 403,
        message: "Insufficient permissions",
        context: null,
        trace,
      };
    }

    trace.checks.push({
      check: "required_capabilities",
      result: true,
    });
  }

  // Check 5: Internal-only requirement
  if (options.requireInternalOnly && !state.internalAccessFact.granted) {
    trace.decision = "reject";
    trace.reason = "Internal access required";
    trace.checks.push({
      check: "internal_only",
      result: false,
    });

    return {
      allowed: false,
      statusCode: 403,
      message: "Insufficient permissions",
      context: null,
      trace,
    };
  }

  if (options.requireInternalOnly) {
    trace.checks.push({
      check: "internal_only",
      result: true,
    });
  }

  // All checks passed - derive capabilities and build context
  const session = state.sessionFact.session!;
  const policy = state.policyFact.policy!;

  // PHASE B: Use canonical capability resolver to derive complete capability set
  const canonicalCapabilities = resolveCanonicalCapabilities(policy);
  const verifiedCapabilities = new Set<string>();

  // Populate verifiedCapabilities from canonical resolver
  canonicalCapabilities.global.forEach((cap) => {
    verifiedCapabilities.add(cap);
  });

  trace.decision = "allow";
  trace.reason = "All auth checks passed";
  trace.checks.push({
    check: "all_checks_passed",
    result: true,
  });

  return {
    allowed: true,
    statusCode: 200, // Placeholder - will be 200 on successful response
    message: "OK",
    context: {
      session,
      policy,
      verifiedActorId: session.user.id,
      verifiedActorType: "user",
      verifiedWorkspaceId: state.workspaceId!,  // VerifiedWorkspaceId — brand inherited from buildAuthState input
      verifiedCapabilities,
    },
    trace,
  };
}
