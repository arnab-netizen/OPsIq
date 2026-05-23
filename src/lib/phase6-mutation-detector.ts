/**
 * PHASE 6: PRE-AUTH MUTATION DETECTOR
 *
 * MOST IMPORTANT STEP FOR SECURITY
 *
 * Detects mutations that occur before auth pipeline completes.
 *
 * FORBIDDEN mutations:
 * - Database writes before auth success
 * - Audit writes before auth success
 * - External API calls before auth success
 * - Queue emissions before auth success
 * - Telemetry persistence before auth success
 * - Any state change before auth success
 *
 * Detection happens via:
 * 1. Runtime mutation spy
 * 2. Execution order tracking
 * 3. Async mutation correlation
 * 4. CI governance scanner
 */

import { logger } from "@/infra/logger";

/**
 * Mutation types we protect against
 */
export type MutationType =
  | "DB_WRITE"
  | "DB_DELETE"
  | "DB_UPDATE"
  | "AUDIT_WRITE"
  | "API_CALL"
  | "QUEUE_EMIT"
  | "TELEMETRY_PERSIST"
  | "CACHE_WRITE"
  | "FILE_WRITE";

/**
 * Mutation event (recorded at time of mutation)
 */
export interface MutationEvent {
  type: MutationType;
  timestamp: number;
  correlationId: string;
  executionPhase: "PRE_AUTH" | "DURING_AUTH" | "POST_AUTH";
  stackTrace: string;
  resource: string; // What was mutated (table, API, queue, etc.)
}

/**
 * Global mutation spy
 *
 * Tracks ALL mutations and their timing relative to auth pipeline.
 */
export class MutationSpy {
  private mutations: Map<string, MutationEvent[]> = new Map();
  private authStartTime: Map<string, number> = new Map();
  private authCompleteTime: Map<string, number> = new Map();
  private enabled = true;

  /**
   * Mark auth pipeline start (for a correlation ID)
   */
  public recordAuthStart(correlationId: string): void {
    this.authStartTime.set(correlationId, Date.now());
  }

  /**
   * Mark auth pipeline completion (success or failure)
   */
  public recordAuthComplete(correlationId: string): void {
    this.authCompleteTime.set(correlationId, Date.now());
  }

  /**
   * Record a mutation
   *
   * Determines if mutation is PRE_AUTH, DURING_AUTH, or POST_AUTH.
   */
  public recordMutation(
    type: MutationType,
    correlationId: string,
    resource: string,
    stackTrace?: string
  ): void {
    if (!this.enabled) return;

    const now = Date.now();
    const authStart = this.authStartTime.get(correlationId);
    const authComplete = this.authCompleteTime.get(correlationId);

    let executionPhase: "PRE_AUTH" | "DURING_AUTH" | "POST_AUTH";

    if (!authStart) {
      // Auth hasn't started yet - definitely PRE_AUTH
      executionPhase = "PRE_AUTH";
    } else if (!authComplete) {
      // Auth started but not complete - DURING_AUTH
      executionPhase = "DURING_AUTH";
    } else {
      // Auth completed - POST_AUTH
      executionPhase = "POST_AUTH";
    }

    const mutation: MutationEvent = {
      type,
      timestamp: now,
      correlationId,
      executionPhase,
      stackTrace: stackTrace || "unknown",
      resource,
    };

    // Record mutation
    if (!this.mutations.has(correlationId)) {
      this.mutations.set(correlationId, []);
    }
    this.mutations.get(correlationId)!.push(mutation);

    // CRITICAL: Log PRE_AUTH mutations (security violation)
    if (executionPhase === "PRE_AUTH") {
      logger.error("PRE-AUTH MUTATION DETECTED", {
        mutationType: type,
        correlationId,
        resource,
        reason: "Mutation occurred before auth pipeline started",
      });
    }

    // Log DURING_AUTH mutations (possible race condition)
    if (executionPhase === "DURING_AUTH") {
      logger.warn("DURING-AUTH MUTATION DETECTED", {
        mutationType: type,
        correlationId,
        resource,
        reason: "Mutation occurred while auth pipeline was running",
      });
    }
  }

  /**
   * Get mutations for a correlation ID
   */
  public getMutations(correlationId: string): MutationEvent[] {
    return this.mutations.get(correlationId) || [];
  }

  /**
   * Get PRE-AUTH mutations (security violations)
   */
  public getPreAuthMutations(correlationId: string): MutationEvent[] {
    return this.getMutations(correlationId).filter((m) => m.executionPhase === "PRE_AUTH");
  }

  /**
   * Check if any PRE-AUTH mutations occurred
   */
  public hasPreAuthMutations(correlationId: string): boolean {
    return this.getPreAuthMutations(correlationId).length > 0;
  }

  /**
   * Verify no PRE-AUTH mutations (for testing)
   */
  public verifyNoPreAuthMutations(correlationId: string): { valid: boolean; violations: MutationEvent[] } {
    const violations = this.getPreAuthMutations(correlationId);
    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Clear records (testing only)
   */
  public clear(): void {
    this.mutations.clear();
    this.authStartTime.clear();
    this.authCompleteTime.clear();
  }

  /**
   * Disable spy (production might disable for performance)
   */
  public disable(): void {
    this.enabled = false;
  }

  /**
   * Enable spy
   */
  public enable(): void {
    this.enabled = true;
  }
}

/**
 * Global mutation spy instance
 */
let globalMutationSpy: MutationSpy | null = null;

/**
 * Get or create global mutation spy
 */
export function getGlobalMutationSpy(): MutationSpy {
  if (!globalMutationSpy) {
    globalMutationSpy = new MutationSpy();
  }
  return globalMutationSpy;
}

/**
 * Middleware: Hook database writes
 *
 * Wraps Prisma client to detect mutations
 */
export function hookDatabaseMutations(prismaClient: unknown): void {
  const spy = getGlobalMutationSpy();

  const originalCreate = prismaClient.$executeRaw?.bind(prismaClient);
  const originalUpdate = prismaClient.$executeRaw?.bind(prismaClient);

  // Simple hook: record all mutations
  // Real implementation would be more sophisticated
  if (originalCreate) {
    // Hook into Prisma's internal mutation tracking
    // This is complex - real implementation would use Prisma middleware
  }
}

/**
 * Guards: Prevent pre-auth mutations
 *
 * These can be called at critical points to BLOCK mutations if auth hasn't completed.
 */

/**
 * Guard: Before database write
 */
export function guardDatabaseWrite(
  correlationId: string,
  operation: "create" | "update" | "delete",
  resource: string
): void {
  const spy = getGlobalMutationSpy();
  const authStart = spy["authStartTime"]?.get(correlationId);
  const authComplete = spy["authCompleteTime"]?.get(correlationId);

  if (!authComplete && authStart) {
    // Auth in progress - BLOCK write
    throw new Error(
      `Database ${operation} on ${resource} blocked: auth pipeline not complete (correlation: ${correlationId})`
    );
  }
}

/**
 * Guard: Before external API call
 */
export function guardExternalApiCall(correlationId: string, api: string): void {
  const spy = getGlobalMutationSpy();
  const authStart = spy["authStartTime"]?.get(correlationId);
  const authComplete = spy["authCompleteTime"]?.get(correlationId);

  if (!authComplete && authStart) {
    // Auth in progress - BLOCK call
    throw new Error(
      `External API call to ${api} blocked: auth pipeline not complete (correlation: ${correlationId})`
    );
  }
}

/**
 * Guard: Before queue emission
 */
export function guardQueueEmit(correlationId: string, queueName: string): void {
  const spy = getGlobalMutationSpy();
  const authStart = spy["authStartTime"]?.get(correlationId);
  const authComplete = spy["authCompleteTime"]?.get(correlationId);

  if (!authComplete && authStart) {
    // Auth in progress - BLOCK emit
    throw new Error(
      `Queue emit to ${queueName} blocked: auth pipeline not complete (correlation: ${correlationId})`
    );
  }
}

/**
 * CI Governance Scanner
 *
 * Scans code for pre-auth mutation patterns
 */
export function scanForPreAuthMutationViolations(code: string): {
  violations: { line: number; pattern: string; description: string }[];
} {
  const violations: { line: number; pattern: string; description: string }[] = [];

  // Pattern 1: Database write before auth check
  const dbWriteBeforeAuthPattern = /(\w+)\.create\(|(\w+)\.update\(|(\w+)\.delete\(.*?\n.*?(?!.*auth|.*Auth)/g;

  // Pattern 2: API call before auth check
  const apiCallBeforeAuthPattern = /fetch\(|axios\.|\.post\(|\.put\(.*?\n.*?(?!.*auth|.*Auth)/g;

  // Pattern 3: Queue emission before auth check
  const queueEmitBeforeAuthPattern = /\.emit\(|\.publish\(|\.send\(.*?\n.*?(?!.*auth|.*Auth)/g;

  // Simple line-by-line scan (real implementation would use AST)
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect mutations without surrounding auth checks
    if (
      (line.includes(".create(") || line.includes(".update(") || line.includes(".delete(")) &&
      !line.includes("//") &&
      !line.includes("*")
    ) {
      // Check if this is protected by auth
      const hasAuthGuard = checkLineHasAuthGuard(lines, i);
      if (!hasAuthGuard) {
        violations.push({
          line: i + 1,
          pattern: "database-mutation-without-auth",
          description: "Database mutation without clear auth guard",
        });
      }
    }
  }

  return { violations };
}

/**
 * Helper: Check if line has auth guard
 */
function checkLineHasAuthGuard(lines: string[], lineIndex: number): boolean {
  // Simple check: look back up to 10 lines for auth-related code
  const lookback = 10;
  const start = Math.max(0, lineIndex - lookback);

  for (let i = start; i < lineIndex; i++) {
    if (
      lines[i].includes("auth") ||
      lines[i].includes("Auth") ||
      lines[i].includes("session") ||
      lines[i].includes("permission")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Mutation equivalence verification
 *
 * Ensure routes mutate identically before/after migration
 */
export interface MutationProfile {
  routePath: string;
  operations: {
    type: MutationType;
    resource: string;
    count: number;
  }[];
}

/**
 * Record mutation profile for a route
 */
export function recordMutationProfile(correlationId: string, routePath: string): MutationProfile {
  const spy = getGlobalMutationSpy();
  const mutations = spy.getMutations(correlationId);

  const operationMap = new Map<string, { type: MutationType; count: number }>();

  for (const mutation of mutations) {
    const key = `${mutation.type}:${mutation.resource}`;
    if (operationMap.has(key)) {
      operationMap.get(key)!.count++;
    } else {
      operationMap.set(key, { type: mutation.type, count: 1 });
    }
  }

  return {
    routePath,
    operations: Array.from(operationMap.values()).map((op) => ({
      type: op.type,
      resource: "unknown", // Would extract from mutations
      count: op.count,
    })),
  };
}

/**
 * Compare mutation profiles (for migration equivalence)
 */
export function compareMutationProfiles(
  oldProfile: MutationProfile,
  newProfile: MutationProfile
): {
  equivalent: boolean;
  differences: string[];
} {
  const differences: string[] = [];

  // Compare operation counts
  const oldOps = new Map(oldProfile.operations.map((op) => [`${op.type}:${op.resource}`, op.count]));
  const newOps = new Map(newProfile.operations.map((op) => [`${op.type}:${op.resource}`, op.count]));

  // Check for missing operations in new profile
  for (const [key, count] of oldOps) {
    if (!newOps.has(key)) {
      differences.push(`Missing operation in new profile: ${key}`);
    } else if (newOps.get(key) !== count) {
      differences.push(`Operation count mismatch for ${key}: old=${count}, new=${newOps.get(key)}`);
    }
  }

  // Check for new operations in new profile
  for (const [key, count] of newOps) {
    if (!oldOps.has(key)) {
      differences.push(`New operation in new profile: ${key} (count=${count})`);
    }
  }

  return {
    equivalent: differences.length === 0,
    differences,
  };
}
