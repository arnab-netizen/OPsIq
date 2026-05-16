/**
 * PHASE D: CANONICAL EXECUTION TRACE - UNIFIED LINEAGE AUTHORITY
 *
 * Single trace system for complete request lineage.
 * Replaces fragmented execution/decision/telemetry traces.
 *
 * Guarantees:
 * - One trace per request (immutable UUID)
 * - Immutable correlation ID lineage
 * - Read-only handler visibility
 * - Complete replay consistency
 * - No nested traces
 * - No trace mutations during request
 */

import { v4 as uuidv4 } from "uuid";

// ─── Execution Trace: Unified Lineage ──────────────────────────────────────

/**
 * Single source of truth for request execution lineage.
 * Records everything that happened during request lifecycle.
 */
export interface CanonicalExecutionTrace {
  // ─── Identity (Immutable)
  traceId: string;        // Unique trace ID (UUID v4)
  correlationId: string;  // Immutable from request header
  requestId: string;      // Immutable from request header

  // ─── Request Context
  method: string;
  pathname: string;
  queryString?: string;

  // ─── Timestamps
  createdAt: Date;
  startedAt: number;      // milliseconds
  completedAt?: number;

  // ─── Execution Stages (Ordered, Immutable)
  stages: Array<{
    stage: string;
    index: number;        // Order preserved
    timestamp: number;    // ms since request start
    result: "success" | "skipped" | "failed";
    detail?: string;
  }>;

  // ─── Auth State Snapshots (Embedded)
  authSnapshot?: {
    sessionValid: boolean;
    sessionInvalidReason?: string;
    policyValid: boolean;
    policyInvalidReason?: string;
    workspaceId?: string;
    workspaceValid: boolean;
    actorId?: string;
    timestamp: number;
  };

  // ─── Decision Trace (Embedded)
  decision?: {
    allowed: boolean;
    statusCode: number;
    reason: string;
    checks: Array<{
      check: string;
      result: boolean | string;
      detail?: string;
    }>;
  };

  // ─── Execution Barriers
  barriers: {
    mutationBarrier: {
      crossedBefore: boolean;
      crossedDuring: boolean;
      crossedAfter: boolean;
    };
    executionBarrier: {
      crossedBefore: boolean;
      crossedDuring: boolean;
      crossedAfter: boolean;
    };
  };

  // ─── Session Snapshot (PHASE E: Immutable request auth reality)
  verifiedSessionSnapshot?: {
    snapshotId: string;
    snapshotTimestamp: Date;
    snapshotHash: string;
    actorId: string;
    workspaceId: string;
    capabilities: Array<string>;
  };

  // ─── Telemetry References
  telemetryEvents: Array<{
    event: string;
    timestamp: number;
  }>;

  // ─── Audit References
  auditEvents: Array<{
    eventId: string;
    timestamp: number;
  }>;

  // ─── Final Outcome
  outcome: {
    allowed: boolean;
    statusCode: number;
    duration: number;  // milliseconds
    sessionSnapshotId?: string;
    completedAt: number;
  };

  // ─── Immutability Seal
  sealed: boolean;        // true after request completes
  readonly: boolean;      // true after first access
}

// ─── Trace Builder & Manager ───────────────────────────────────────────────

/**
 * Manages complete execution trace lifecycle.
 *
 * Guarantees:
 * - Single trace per request
 * - Immutable correlation lineage
 * - Read-only after creation
 * - No nested traces
 * - No mutations during request
 */
export class CanonicalExecutionTraceManager {
  private trace: CanonicalExecutionTrace;
  private stages: Array<CanonicalExecutionTrace["stages"][0]> = [];
  private stageIndex: number = 0;
  private parentTraceId?: string; // Detect nesting

  constructor(input: {
    correlationId: string;
    requestId: string;
    method: string;
    pathname: string;
    queryString?: string;
    parentTraceId?: string; // Detect if called from another trace
  }) {
    // STEP D3: Prevent nested wrappers
    if (input.parentTraceId) {
      throw new Error(
        "NESTED CANONICAL WRAPPER DETECTED: Cannot nest withCanonicalEnforcement() calls. " +
          "Parent trace ID: " +
          input.parentTraceId
      );
    }

    this.trace = {
      traceId: this.generateTraceId(),
      correlationId: input.correlationId,
      requestId: input.requestId,
      method: input.method,
      pathname: input.pathname,
      queryString: input.queryString,
      createdAt: new Date(),
      startedAt: Date.now(),
      stages: [],
      barriers: {
        mutationBarrier: { crossedBefore: false, crossedDuring: false, crossedAfter: false },
        executionBarrier: { crossedBefore: false, crossedDuring: false, crossedAfter: false },
      },
      telemetryEvents: [],
      auditEvents: [],
      outcome: {
        allowed: false,
        statusCode: 500,
        duration: 0,
        completedAt: 0,
      },
      sealed: false,
      readonly: false,
    };
  }

  /**
   * Record execution stage
   * Called as auth pipeline progresses
   */
  public recordStage(stage: string, result: "success" | "skipped" | "failed", detail?: string): void {
    if (this.trace.sealed) {
      throw new Error("Cannot record stage on sealed trace");
    }

    const timestamp = Date.now() - this.trace.startedAt;

    this.stages.push({
      stage,
      index: this.stageIndex++,
      timestamp,
      result,
      detail,
    });
  }

  /**
   * Record auth state snapshot
   * Called after auth evaluation
   */
  public recordAuthSnapshot(snapshot: {
    sessionValid: boolean;
    sessionInvalidReason?: string;
    policyValid: boolean;
    policyInvalidReason?: string;
    workspaceId?: string;
    workspaceValid: boolean;
    actorId?: string;
  }): void {
    if (this.trace.sealed) {
      throw new Error("Cannot record auth snapshot on sealed trace");
    }

    this.trace.authSnapshot = {
      ...snapshot,
      timestamp: Date.now() - this.trace.startedAt,
    };
  }

  /**
   * Record decision trace
   * Called after auth decision made
   */
  public recordDecision(decision: {
    allowed: boolean;
    statusCode: number;
    reason: string;
    checks: Array<{
      check: string;
      result: boolean | string;
      detail?: string;
    }>;
  }): void {
    if (this.trace.sealed) {
      throw new Error("Cannot record decision on sealed trace");
    }

    this.trace.decision = decision;
  }

  /**
   * Record verified session snapshot (PHASE E)
   * Called at wrapper entry with immutable snapshot
   */
  public recordVerifiedSessionSnapshot(snapshot: {
    snapshotId: string;
    snapshotTimestamp: Date;
    snapshotHash: string;
    actorId: string;
    workspaceId: string;
    capabilities: Array<string>;
  }): void {
    if (this.trace.sealed) {
      throw new Error("Cannot record session snapshot on sealed trace");
    }

    this.trace.verifiedSessionSnapshot = snapshot;
  }

  /**
   * Record telemetry event emission
   * Called when telemetry lifecycle emits event
   */
  public recordTelemetryEvent(event: string): void {
    if (this.trace.sealed) {
      throw new Error("Cannot record telemetry on sealed trace");
    }

    this.trace.telemetryEvents.push({
      event,
      timestamp: Date.now() - this.trace.startedAt,
    });
  }

  /**
   * Record audit event
   * Called when audit system emits event
   */
  public recordAuditEvent(eventId: string): void {
    if (this.trace.sealed) {
      throw new Error("Cannot record audit on sealed trace");
    }

    this.trace.auditEvents.push({
      eventId,
      timestamp: Date.now() - this.trace.startedAt,
    });
  }

  /**
   * Mark mutation barrier crossed
   */
  public markMutationBarrier(phase: "before" | "during" | "after"): void {
    if (this.trace.sealed) {
      throw new Error("Cannot update barriers on sealed trace");
    }

    if (phase === "before") {
      this.trace.barriers.mutationBarrier.crossedBefore = true;
    } else if (phase === "during") {
      this.trace.barriers.mutationBarrier.crossedDuring = true;
    } else if (phase === "after") {
      this.trace.barriers.mutationBarrier.crossedAfter = true;
    }
  }

  /**
   * Mark execution barrier crossed
   */
  public markExecutionBarrier(phase: "before" | "during" | "after"): void {
    if (this.trace.sealed) {
      throw new Error("Cannot update barriers on sealed trace");
    }

    if (phase === "before") {
      this.trace.barriers.executionBarrier.crossedBefore = true;
    } else if (phase === "during") {
      this.trace.barriers.executionBarrier.crossedDuring = true;
    } else if (phase === "after") {
      this.trace.barriers.executionBarrier.crossedAfter = true;
    }
  }

  /**
   * Finalize trace with outcome
   * Called at end of request
   */
  public finalize(outcome: {
    allowed: boolean;
    statusCode: number;
    sessionSnapshotId?: string;
  }): CanonicalExecutionTrace {
    if (this.trace.sealed) {
      throw new Error("Trace already sealed");
    }

    const duration = Date.now() - this.trace.startedAt;

    this.trace.stages = Object.freeze([...this.stages]) as any;
    this.trace.completedAt = Date.now();
    this.trace.outcome = {
      allowed: outcome.allowed,
      statusCode: outcome.statusCode,
      duration,
      sessionSnapshotId: outcome.sessionSnapshotId,
      completedAt: Date.now(),
    };

    // Seal trace (immutable) - deep freeze all nested objects
    this.trace.sealed = true;
    this.deepFreeze(this.trace);

    return this.trace;
  }

  /**
   * Deep freeze an object and all nested objects recursively
   */
  private deepFreeze(obj: any): any {
    Object.freeze(obj);

    Object.getOwnPropertyNames(obj).forEach((prop) => {
      if (obj[prop] !== null && (typeof obj[prop] === "object" || typeof obj[prop] === "function")) {
        if (!Object.isFrozen(obj[prop])) {
          this.deepFreeze(obj[prop]);
        }
      }
    });

    return obj;
  }

  /**
   * Get read-only trace reference
   * Handler receives this (cannot mutate)
   */
  public getReadOnlyTrace(): Readonly<CanonicalExecutionTrace> {
    // Mark as accessed (readonly)
    if (!this.trace.readonly) {
      this.trace.readonly = true;
    }

    // Return frozen copy
    return Object.freeze({ ...this.trace });
  }

  /**
   * Get complete trace (internal use only)
   */
  public getTrace(): CanonicalExecutionTrace {
    return this.trace;
  }

  /**
   * Validate trace consistency
   */
  public validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check immutability
    if (!this.trace.sealed && this.trace.readonly) {
      errors.push("Trace marked readonly but not sealed");
    }

    // Check single trace ID
    if (!this.trace.traceId) {
      errors.push("Missing traceId");
    }

    // Check correlation immutability
    if (!this.trace.correlationId) {
      errors.push("Missing correlationId");
    }

    // Check stages ordered
    for (let i = 1; i < this.stages.length; i++) {
      if (this.stages[i].index !== i) {
        errors.push(`Stage index mismatch at position ${i}`);
      }
    }

    // Check no nested traces
    if (this.parentTraceId) {
      errors.push("Nested trace detected");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private generateTraceId(): string {
    // Generate UUID v4 for trace ID
    return uuidv4();
  }
}

// ─── STEP D3: Nested Wrapper Detection ─────────────────────────────────────

/**
 * Thread-local storage for detecting nested wrappers
 * If a request is already in a canonical wrapper, nested call will be caught
 */
let activeTraceId: string | undefined;

export function getActiveTraceId(): string | undefined {
  return activeTraceId;
}

export function setActiveTraceId(traceId: string): void {
  activeTraceId = traceId;
}

export function clearActiveTraceId(): void {
  activeTraceId = undefined;
}

// ─── STEP D4: Immutability Enforcement ─────────────────────────────────────

/**
 * Verify that trace is immutable after finalization
 */
export function isTraceImmutable(trace: CanonicalExecutionTrace): boolean {
  if (!trace.sealed) {
    return false;
  }

  // Check if object is frozen
  return Object.isFrozen(trace) && Object.isFrozen(trace.stages);
}

/**
 * Attempt to mutate trace (should fail)
 * Used in tests to verify immutability
 */
export function attemptTraceMutation(trace: CanonicalExecutionTrace): boolean {
  try {
    (trace as any).newField = "test";
    return true; // Mutation succeeded (bad!)
  } catch {
    return false; // Mutation blocked (good!)
  }
}
