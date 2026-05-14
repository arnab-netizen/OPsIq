/**
 * PHASE F: AUTH OWNERSHIP ALLOWLIST
 *
 * CRITICAL SECURITY GATE
 *
 * Only CANONICAL sources may read auth state.
 * All other reads are SHADOW READS and must be eliminated.
 *
 * This list defines the ONE AND ONLY way auth is accessed in the request pipeline.
 *
 * Violation = Snapshot non-exclusive = Build fails
 */

/**
 * ALLOWLIST: Functions permitted to read auth
 *
 * These are the ONLY functions allowed to read auth state directly.
 * Everything else must use snapshot from context.
 */
export const AUTH_READ_ALLOWLIST = {
  // ─── CANONICAL: Wrapper orchestration ───────────────────────────────────
  CANONICAL_WRAPPER: {
    file: "src/lib/canonical-route-enforcement.ts",
    functions: ["withCanonicalEnforcement"],
    rationale: "Entry point - creates and owns snapshot",
  },

  // ─── CANONICAL: Snapshot builders ───────────────────────────────────────
  SNAPSHOT_BUILDER: {
    file: "src/lib/canonical-verified-session.ts",
    functions: ["CanonicalVerifiedSessionBuilder.constructor"],
    rationale: "Captures single auth snapshot at wrapper entry",
  },

  TRACE_MANAGER: {
    file: "src/lib/canonical-execution-trace.ts",
    functions: ["CanonicalExecutionTraceManager.recordVerifiedSessionSnapshot"],
    rationale: "Owns and records snapshot in trace",
  },

  // ─── CANONICAL: Wrapper support (Phase A facts system) ──────────────────
  AUTH_FACTS: {
    file: "src/lib/canonical-auth-facts.ts",
    functions: ["buildAuthState", "evaluateAuthState"],
    rationale: "PHASE A facts system - used by wrapper only",
  },

  SESSION_FACT: {
    file: "src/services/auth.ts",
    functions: ["getSessionFact"],
    rationale: "Facts provider for wrapper",
  },

  POLICY_FACT: {
    file: "src/services/auth.ts",
    functions: ["getPolicyContextFact"],
    rationale: "Facts provider for wrapper",
  },

  // ─── CANONICAL: Data providers (read-only, no decisions) ─────────────────
  SESSION_DATA_PROVIDER: {
    file: "src/services/auth.ts",
    functions: ["getSession"],
    rationale: "Pure data provider - no semantic decisions",
  },

  POLICY_DATA_PROVIDER: {
    file: "src/services/auth.ts",
    functions: ["getPolicyContext"],
    rationale: "Pure data provider - no semantic decisions",
  },

  // ─── NOT ALLOWED (must be eliminated) ───────────────────────────────────
  FORBIDDEN_READS: [
    {
      pattern: "requireSession",
      file: "src/lib/auth-guard.ts",
      type: "LEGACY_THROWING",
      replacedBy: "ctx.verifiedSessionSnapshot",
      impact: "Routes must use snapshot, not throw",
    },
    {
      pattern: "requirePolicyContext",
      file: "src/lib/auth-guard.ts",
      type: "LEGACY_THROWING",
      replacedBy: "ctx.verifiedSessionSnapshot",
      impact: "Routes must use snapshot, not throw",
    },
    {
      pattern: "withAuth",
      file: "src/lib/auth-guard.ts",
      type: "SHADOW_WRAPPER",
      replacedBy: "ctx.verifiedSessionSnapshot",
      impact: "Routes MUST NOT call withAuth() - use snapshot",
    },
    {
      pattern: "requireAuthForCapability",
      file: "src/lib/auth-guard.ts",
      type: "SHADOW_WRAPPER",
      replacedBy: "ctx.verifiedCapabilities",
      impact: "Routes MUST NOT call - capability check done at wrapper",
    },
    {
      pattern: "getServerAuthContext",
      file: "src/lib/auth-guard.ts",
      type: "SHADOW_READ",
      replacedBy: "ctx.verifiedSessionSnapshot",
      impact: "Routes MUST NOT call - helpers must accept snapshot param",
    },
  ],
};

/**
 * Verification: Check if a function is allowed to read auth
 */
export function isAuthReadAllowed(functionName: string, filePath: string): boolean {
  // Check canonical sources
  const allowed = Object.values(AUTH_READ_ALLOWLIST).some((allowlist) => {
    if (!Array.isArray(allowlist) && 'functions' in allowlist) {
      // It's a canonical entry
      return (
        allowlist.functions?.includes(functionName) &&
        filePath.includes(allowlist.file.replace("src/", ""))
      );
    }
    return false;
  });

  // Check forbidden
  const forbidden = AUTH_READ_ALLOWLIST.FORBIDDEN_READS.some(
    (entry) => functionName.includes(entry.pattern)
  );

  return allowed && !forbidden;
}

/**
 * Get replacement for forbidden auth read
 */
export function getAuthReadReplacement(functionName: string): string | null {
  const forbidden = AUTH_READ_ALLOWLIST.FORBIDDEN_READS.find(
    (entry) => functionName.includes(entry.pattern)
  );

  return forbidden?.replacedBy || null;
}

/**
 * Classification: Is this read allowed?
 */
export enum AuthReadClassification {
  CANONICAL = "CANONICAL", // Allowed
  LEGACY = "LEGACY", // Deprecated but harmless
  SHADOW_READ = "SHADOW_READ", // Forbidden
  DUPLICATE = "DUPLICATE", // Redundant call
  RECURSIVE = "RECURSIVE", // Nested auth read
}

export function classifyAuthRead(
  functionName: string,
  filePath: string
): AuthReadClassification {
  // Check if canonical
  if (isAuthReadAllowed(functionName, filePath)) {
    return AuthReadClassification.CANONICAL;
  }

  // Check if forbidden
  if (functionName.includes("withAuth") || functionName.includes("requireAuth")) {
    return AuthReadClassification.SHADOW_READ;
  }

  if (
    functionName.includes("getServerAuthContext") ||
    functionName.includes("requireSession")
  ) {
    return AuthReadClassification.LEGACY;
  }

  return AuthReadClassification.SHADOW_READ;
}

/**
 * Build enforcement error message
 */
export function buildAuthReadEnforcementError(
  functionName: string,
  filePath: string,
  lineNumber: number
): string {
  const replacement = getAuthReadReplacement(functionName);
  const classification = classifyAuthRead(functionName, filePath);

  return `
SNAPSHOT_EXCLUSIVE_VIOLATION: Shadow auth read detected

File: ${filePath}:${lineNumber}
Function: ${functionName}()
Classification: ${classification}

REASON:
Canonical wrapper has already created immutable auth snapshot.
Route must use snapshot from context, not re-fetch auth.

ERROR:
This function is NOT in AUTH_READ_ALLOWLIST.
Auth reads outside canonical wrapper violate snapshot exclusivity.

SOLUTION:
Replace with: ${replacement}

ENFORCEMENT:
This is a build-time gate. Build will fail if shadow reads exist.
See: .claude/global_auth_read_inventory.md
See: src/lib/auth-ownership-allowlist.ts
`;
}

export default AUTH_READ_ALLOWLIST;
