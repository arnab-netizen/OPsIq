/**
 * PHASE F4: RUNTIME SHADOW READ ENFORCER
 *
 * CRITICAL SECURITY GATE
 *
 * Detects and blocks auth reads after snapshot finalization.
 * Throws immediately on violation.
 * Captures full context for debugging.
 *
 * Lifecycle:
 * REQUEST_ENTRY → SNAPSHOT_CREATED → AUTH_FINALIZED → HANDLER_EXECUTION → REQUEST_COMPLETE
 *
 * FORBIDDEN after AUTH_FINALIZED:
 * - getSession()
 * - requireSession()
 * - withAuth()
 * - getPolicyContext()
 * - Any auth read outside allowlist
 */

/**
 * Request lifecycle tracking
 */
export enum RequestLifecycleStage {
  REQUEST_ENTRY = "REQUEST_ENTRY",
  SNAPSHOT_CREATED = "SNAPSHOT_CREATED",
  AUTH_FINALIZED = "AUTH_FINALIZED",
  HANDLER_EXECUTING = "HANDLER_EXECUTING",
  REQUEST_COMPLETE = "REQUEST_COMPLETE",
}

/**
 * Allowlisted functions permitted to read auth
 */
const AUTH_READ_ALLOWLIST = [
  // Canonical sources only
  "src/lib/canonical-route-enforcement.ts",
  "src/lib/canonical-auth-facts.ts",
  "src/lib/canonical-verified-session.ts",
  "src/lib/canonical-execution-trace.ts",
  "src/services/auth.ts:getSessionFact",
  "src/services/auth.ts:getPolicyContextFact",
  "src/services/auth.ts:getSession",
  "src/services/auth.ts:getPolicyContext",
];

/**
 * Global enforcer instance (one per request)
 */
let globalEnforcer: RuntimeShadowReadEnforcer | null = null;

/**
 * Request context tracked by enforcer
 */
interface RequestContext {
  correlationId: string;
  requestId: string;
  traceId: string;
  route: string;
  lifecycleStage: RequestLifecycleStage;
  snapshotFinalized: boolean;
}

/**
 * Shadow read violation details
 */
export interface ShadowReadViolation {
  timestamp: Date;
  correlationId: string;
  requestId: string;
  traceId: string;
  route: string;
  lifecycleStage: RequestLifecycleStage;
  caller: string;
  stack: string;
  attemptedFunction: string;
  message: string;
}

/**
 * Runtime Shadow Read Enforcer
 *
 * Tracks request lifecycle and enforces snapshot exclusivity.
 * Throws on any auth read after snapshot is finalized.
 */
export class RuntimeShadowReadEnforcer {
  private context: RequestContext;
  private violations: ShadowReadViolation[] = [];

  constructor(context: Partial<RequestContext>) {
    this.context = {
      correlationId: context.correlationId || "unknown",
      requestId: context.requestId || "unknown",
      traceId: context.traceId || "unknown",
      route: context.route || "unknown",
      lifecycleStage: RequestLifecycleStage.REQUEST_ENTRY,
      snapshotFinalized: false,
    };

    // Register as global enforcer
    globalEnforcer = this;
  }

  /**
   * Update lifecycle stage
   */
  public setLifecycleStage(stage: RequestLifecycleStage): void {
    this.context.lifecycleStage = stage;

    if (stage === RequestLifecycleStage.AUTH_FINALIZED) {
      this.context.snapshotFinalized = true;
    }
  }

  /**
   * Check if auth read is allowed
   * Throws immediately if violation detected
   */
  public checkAuthReadAllowed(caller: string, functionName: string): void {
    // Only enforce after snapshot finalized
    if (!this.context.snapshotFinalized) {
      return;
    }

    // Check if caller is allowlisted
    const isAllowed = AUTH_READ_ALLOWLIST.some((allowlisted) => {
      const [file, func] = allowlisted.split(":");
      if (func) {
        // Function-level allowlist
        return caller.includes(file) && functionName.includes(func);
      }
      // File-level allowlist
      return caller.includes(file);
    });

    if (!isAllowed) {
      const violation: ShadowReadViolation = {
        timestamp: new Date(),
        correlationId: this.context.correlationId,
        requestId: this.context.requestId,
        traceId: this.context.traceId,
        route: this.context.route,
        lifecycleStage: this.context.lifecycleStage,
        caller,
        stack: new Error().stack || "unknown",
        attemptedFunction: functionName,
        message: `SHADOW_AUTH_READ_DETECTED: ${functionName}() called after snapshot finalized`,
      };

      this.violations.push(violation);

      throw new Error(
        `SHADOW_AUTH_READ_DETECTED

Function: ${functionName}
Caller: ${caller}
Route: ${this.context.route}
Correlation ID: ${this.context.correlationId}

ERROR:
Auth read attempted AFTER snapshot finalized.
Snapshot must be exclusive auth source for entire request.

LIFECYCLE:
Request enters → Snapshot created → Auth finalized → Handler executes

VIOLATION:
Handler or helper attempted auth re-fetch after snapshot finalized.
This breaks snapshot exclusivity and violates request reality semantics.

SOLUTION:
Use snapshot from context: ctx.verifiedSessionSnapshot
Do not call: getSession(), requireSession(), withAuth(), getPolicyContext()

ENFORCEMENT:
This is a runtime gate. Requests with shadow reads FAIL immediately.
`
      );
    }
  }

  /**
   * Get violations for this request
   */
  public getViolations(): ShadowReadViolation[] {
    return this.violations;
  }

  /**
   * Clear enforcer (at request end)
   */
  public clear(): void {
    if (globalEnforcer === this) {
      globalEnforcer = null;
    }
  }
}

/**
 * Get current enforcer instance
 */
export function getEnforcer(): RuntimeShadowReadEnforcer | null {
  return globalEnforcer;
}

/**
 * Intercept function calls to check for shadow reads
 * Call this in getSession(), requireSession(), withAuth(), etc.
 */
export function checkShadowRead(functionName: string): void {
  if (!globalEnforcer) {
    return; // No enforcer active
  }

  // Get caller from stack
  const stack = new Error().stack || "";
  const caller = extractCallerFromStack(stack);

  globalEnforcer.checkAuthReadAllowed(caller, functionName);
}

/**
 * Extract caller file from stack trace
 */
function extractCallerFromStack(stack: string): string {
  const lines = stack.split("\n");
  // Skip first 2-3 lines (Error, this function, caller's caller)
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("at ")) {
      // Extract file path
      const match = line.match(/\(([^)]+)\)/);
      if (match) {
        return match[1];
      }
      const fileMatch = line.match(/at (.+):/);
      if (fileMatch) {
        return fileMatch[1];
      }
    }
  }
  return "unknown";
}

/**
 * Create and initialize enforcer for wrapper
 */
export function initializeEnforcerForRequest(
  correlationId: string,
  requestId: string,
  traceId: string,
  route: string
): RuntimeShadowReadEnforcer {
  const enforcer = new RuntimeShadowReadEnforcer({
    correlationId,
    requestId,
    traceId,
    route,
  });

  return enforcer;
}

/**
 * Violation report
 */
export interface ShadowReadReport {
  timestamp: string;
  totalViolations: number;
  violations: ShadowReadViolation[];
}

/**
 * Generate violation report
 */
export function generateViolationReport(
  enforcer: RuntimeShadowReadEnforcer
): ShadowReadReport {
  return {
    timestamp: new Date().toISOString(),
    totalViolations: enforcer.getViolations().length,
    violations: enforcer.getViolations(),
  };
}
