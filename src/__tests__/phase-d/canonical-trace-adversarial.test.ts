/**
 * PHASE D STEPS 4-5: CANONICAL TRACE ADVERSARIAL TESTING
 *
 * Comprehensive hostile runtime tests for trace immutability and lineage.
 *
 * TEST GROUPS:
 * 1. Nested wrapper attacks
 * 2. Trace mutation attacks
 * 3. Replay consistency
 * 4. Concurrent lineage isolation
 * 5. Partial verification continuity
 * 6. Finalization enforcement
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CanonicalExecutionTraceManager } from "@/lib/canonical-execution-trace";
import {
  classifyExecution,
  pushExecutionContext,
  popExecutionContext,
  clearExecutionStack,
  getExecutionStackDepth,
  type ReentryClassification,
} from "@/lib/execution-reentry-detector";

describe("PHASE D STEPS 4-5: Canonical Trace Adversarial Testing", () => {
  beforeEach(() => {
    clearExecutionStack();
  });

  afterEach(() => {
    clearExecutionStack();
  });

  // ─── TEST GROUP 1: NESTED WRAPPER ATTACKS ─────────────────────────────────

  describe("TEST GROUP 1: Nested Wrapper Attacks", () => {
    it("Detects recursive wrapper call on same correlation ID", () => {
      const correlationId = "corr-test-123";
      const requestId = "req-test-456";

      const trace1 = new CanonicalExecutionTraceManager({
        correlationId,
        requestId,
        method: "GET",
        pathname: "/api/test",
      });

      pushExecutionContext({
        traceId: trace1.getTrace().traceId,
        correlationId,
        requestId,
      });

      // Try to create second trace with same correlation ID
      const trace2 = new CanonicalExecutionTraceManager({
        correlationId,
        requestId: "req-nested-789",
        method: "GET",
        pathname: "/api/test2",
      });

      const classification = classifyExecution({
        traceId: trace2.getTrace().traceId,
        correlationId,
        requestId: "req-nested-789",
      });

      expect(classification).toBe("RECURSIVE_WRAPPER");
      expect(() => {
        pushExecutionContext({
          traceId: trace2.getTrace().traceId,
          correlationId,
          requestId: "req-nested-789",
        });
      }).toThrow("EXECUTION REENTRY VIOLATION: RECURSIVE_WRAPPER");
    });

    it("Detects trace ID collision", () => {
      const trace1 = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      const traceId = trace1.getTrace().traceId;

      pushExecutionContext({
        traceId,
        correlationId: "corr-1",
        requestId: "req-1",
      });

      // Attempt to push same trace ID
      expect(() => {
        pushExecutionContext({
          traceId,
          correlationId: "corr-2",
          requestId: "req-2",
        });
      }).toThrow("EXECUTION REENTRY VIOLATION: TRACE_COLLISION");
    });

    it("Prevents multiple concurrent wrappers on same request", () => {
      const requestId = "req-same-456";
      const trace1 = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId,
        method: "GET",
        pathname: "/api/test",
      });

      pushExecutionContext({
        traceId: trace1.getTrace().traceId,
        correlationId: "corr-1",
        requestId,
      });

      // Try to push different correlation but same request ID
      const trace2 = new CanonicalExecutionTraceManager({
        correlationId: "corr-2",
        requestId,
        method: "GET",
        pathname: "/api/test2",
      });

      expect(() => {
        pushExecutionContext({
          traceId: trace2.getTrace().traceId,
          correlationId: "corr-2",
          requestId,
        });
      }).toThrow("EXECUTION REENTRY VIOLATION: FORKED_LINEAGE");
    });

    it("Stack depth increases with nesting attempt detection", () => {
      const trace1 = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      expect(getExecutionStackDepth()).toBe(0);

      pushExecutionContext({
        traceId: trace1.getTrace().traceId,
        correlationId: "corr-1",
        requestId: "req-1",
      });

      expect(getExecutionStackDepth()).toBe(1);

      popExecutionContext(trace1.getTrace().traceId);

      expect(getExecutionStackDepth()).toBe(0);
    });
  });

  // ─── TEST GROUP 2: TRACE MUTATION ATTACKS ─────────────────────────────────

  describe("TEST GROUP 2: Trace Mutation Attacks", () => {
    it("Prevents mutation of actor ID after freeze", () => {
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      trace.recordAuthSnapshot({
        sessionValid: true,
        policyValid: true,
        workspaceId: "ws1",
        workspaceValid: true,
        actorId: "actor1",
      });

      trace.finalize({
        allowed: true,
        statusCode: 200,
      });

      const finalTrace = trace.getTrace();

      // Attempt mutation
      expect(() => {
        (finalTrace as any).authSnapshot.actorId = "actor2";
      }).toThrow();
    });

    it("Prevents mutation of workspace ID after freeze", () => {
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      trace.recordAuthSnapshot({
        sessionValid: true,
        policyValid: true,
        workspaceId: "ws1",
        workspaceValid: true,
      });

      trace.finalize({
        allowed: true,
        statusCode: 200,
      });

      const finalTrace = trace.getTrace();

      // Attempt mutation
      expect(() => {
        (finalTrace as any).authSnapshot.workspaceId = "ws2";
      }).toThrow();
    });

    it("Prevents mutation of decision after freeze", () => {
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      trace.recordDecision({
        allowed: false,
        statusCode: 403,
        reason: "Missing capability",
        checks: [],
      });

      trace.finalize({
        allowed: false,
        statusCode: 403,
      });

      const finalTrace = trace.getTrace();

      // Attempt mutation
      expect(() => {
        (finalTrace as any).decision.allowed = true;
      }).toThrow();
    });

    it("Prevents mutation of correlation ID", () => {
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-original",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      trace.finalize({
        allowed: true,
        statusCode: 200,
      });

      const finalTrace = trace.getTrace();

      // Correlation ID is immutable
      expect(finalTrace.correlationId).toBe("corr-original");

      // Attempt mutation
      expect(() => {
        (finalTrace as any).correlationId = "corr-modified";
      }).toThrow();
    });

    it("Prevents mutation of request ID", () => {
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-original",
        method: "GET",
        pathname: "/api/test",
      });

      trace.finalize({
        allowed: true,
        statusCode: 200,
      });

      const finalTrace = trace.getTrace();

      // Request ID is immutable
      expect(finalTrace.requestId).toBe("req-original");

      // Attempt mutation
      expect(() => {
        (finalTrace as any).requestId = "req-modified";
      }).toThrow();
    });
  });

  // ─── TEST GROUP 3: REPLAY CONSISTENCY ──────────────────────────────────────

  describe("TEST GROUP 3: Replay Consistency", () => {
    it("Replayed request produces identical trace shape", () => {
      // Original request
      const trace1 = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      trace1.recordStage("WORKSPACE_EXTRACTED", "success", "ws1");
      trace1.recordStage("FACTS_GATHERED", "success");
      trace1.recordAuthSnapshot({
        sessionValid: true,
        policyValid: true,
        workspaceId: "ws1",
        workspaceValid: true,
        actorId: "user1",
      });
      trace1.recordDecision({
        allowed: true,
        statusCode: 200,
        reason: "Auth passed",
        checks: [],
      });

      const finalTrace1 = trace1.finalize({
        allowed: true,
        statusCode: 200,
      });

      // Replayed request (same correlation ID, new request ID)
      const trace2 = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",  // Same correlation
        requestId: "req-2",       // Different request (replay)
        method: "GET",
        pathname: "/api/test",
      });

      trace2.recordStage("WORKSPACE_EXTRACTED", "success", "ws1");
      trace2.recordStage("FACTS_GATHERED", "success");
      trace2.recordAuthSnapshot({
        sessionValid: true,
        policyValid: true,
        workspaceId: "ws1",
        workspaceValid: true,
        actorId: "user1",
      });
      trace2.recordDecision({
        allowed: true,
        statusCode: 200,
        reason: "Auth passed",
        checks: [],
      });

      const finalTrace2 = trace2.finalize({
        allowed: true,
        statusCode: 200,
      });

      // Same shape (stages match)
      expect(finalTrace1.stages.length).toBe(finalTrace2.stages.length);
      expect(finalTrace1.stages.map((s) => s.stage)).toEqual(finalTrace2.stages.map((s) => s.stage));

      // Same decision
      expect(finalTrace1.decision?.allowed).toBe(finalTrace2.decision?.allowed);
      expect(finalTrace1.decision?.statusCode).toBe(finalTrace2.decision?.statusCode);

      // Different request IDs (expected for replay)
      expect(finalTrace1.requestId).not.toBe(finalTrace2.requestId);

      // Same correlation ID (expected for replay)
      expect(finalTrace1.correlationId).toBe(finalTrace2.correlationId);
    });
  });

  // ─── TEST GROUP 4: CONCURRENT LINEAGE ISOLATION ────────────────────────────

  describe("TEST GROUP 4: Concurrent Lineage Isolation", () => {
    it("Concurrent requests have isolated trace IDs", () => {
      const trace1 = new CanonicalExecutionTraceManager({
        correlationId: "corr-concurrent-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      const trace2 = new CanonicalExecutionTraceManager({
        correlationId: "corr-concurrent-2",
        requestId: "req-2",
        method: "GET",
        pathname: "/api/test",
      });

      // Trace IDs must be different
      expect(trace1.getTrace().traceId).not.toBe(trace2.getTrace().traceId);

      // Correlation IDs must be different
      expect(trace1.getTrace().correlationId).not.toBe(trace2.getTrace().correlationId);

      // Request IDs must be different
      expect(trace1.getTrace().requestId).not.toBe(trace2.getTrace().requestId);
    });

    it("Concurrent requests cannot share mutation state", () => {
      const trace1 = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      const trace2 = new CanonicalExecutionTraceManager({
        correlationId: "corr-2",
        requestId: "req-2",
        method: "GET",
        pathname: "/api/test",
      });

      trace1.recordStage("STAGE_1", "success");
      trace2.recordStage("STAGE_2", "success");

      // Finalize both traces to populate stages
      const final1 = trace1.finalize({ allowed: true, statusCode: 200 });
      const final2 = trace2.finalize({ allowed: true, statusCode: 200 });

      // Each trace has independent stages
      expect(final1.stages.length).toBe(1);
      expect(final2.stages.length).toBe(1);
      expect(final1.stages[0].stage).toBe("STAGE_1");
      expect(final2.stages[0].stage).toBe("STAGE_2");
    });
  });

  // ─── TEST GROUP 5: PARTIAL VERIFICATION CONTINUITY ────────────────────────

  describe("TEST GROUP 5: Partial Verification Continuity", () => {
    it("Failed auth maintains coherent lineage", () => {
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      trace.recordStage("WORKSPACE_EXTRACTED", "success", "ws1");
      trace.recordStage("FACTS_GATHERED", "success");
      trace.recordAuthSnapshot({
        sessionValid: false,
        sessionInvalidReason: "expired",
        policyValid: false,
        workspaceId: "ws1",
        workspaceValid: true,
      });

      // Record failed decision
      trace.recordDecision({
        allowed: false,
        statusCode: 401,
        reason: "Session expired",
        checks: [{ check: "session_valid", result: false }],
      });

      const finalTrace = trace.finalize({
        allowed: false,
        statusCode: 401,
      });

      // Lineage is complete and coherent
      expect(finalTrace.stages.length).toBeGreaterThan(0);
      expect(finalTrace.authSnapshot).toBeDefined();
      expect(finalTrace.decision).toBeDefined();
      expect(finalTrace.outcome.allowed).toBe(false);
    });

    it("Partial execution maintains trace continuity on error", () => {
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      trace.recordStage("STAGE_1", "success");
      trace.recordStage("STAGE_2", "success");

      // Error occurs, but trace is still valid
      const finalTrace = trace.finalize({
        allowed: false,
        statusCode: 500,
      });

      expect(finalTrace.stages.length).toBe(2);
      expect(finalTrace.outcome.statusCode).toBe(500);
      expect(finalTrace.sealed).toBe(true);
    });
  });

  // ─── TEST GROUP 6: FINALIZATION ENFORCEMENT ───────────────────────────────

  describe("TEST GROUP 6: Finalization Enforcement", () => {
    it("Cannot record stage after finalization", () => {
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      trace.finalize({
        allowed: true,
        statusCode: 200,
      });

      // Attempt to record after finalization
      expect(() => {
        trace.recordStage("AFTER_FINALIZE", "success");
      }).toThrow("Cannot record stage on sealed trace");
    });

    it("Cannot record auth snapshot after finalization", () => {
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      trace.finalize({
        allowed: true,
        statusCode: 200,
      });

      // Attempt to record after finalization
      expect(() => {
        trace.recordAuthSnapshot({
          sessionValid: true,
          policyValid: true,
          workspaceId: "ws1",
          workspaceValid: true,
        });
      }).toThrow("Cannot record auth snapshot on sealed trace");
    });

    it("Cannot finalize twice", () => {
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      trace.finalize({
        allowed: true,
        statusCode: 200,
      });

      // Attempt second finalization
      expect(() => {
        trace.finalize({
          allowed: true,
          statusCode: 200,
        });
      }).toThrow("Trace already sealed");
    });

    it("Trace is frozen after finalization", () => {
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-1",
        requestId: "req-1",
        method: "GET",
        pathname: "/api/test",
      });

      const finalTrace = trace.finalize({
        allowed: true,
        statusCode: 200,
      });

      // Object should be frozen (no new properties)
      expect(() => {
        (finalTrace as any).newField = "value";
      }).toThrow();
    });
  });

  // ─── FINAL VALIDATION ──────────────────────────────────────────────────────

  describe("Final Validation: TRUE_TRACE_AUTHORITY", () => {
    it("Complete request lifecycle maintains single lineage", () => {
      // Simulate complete request lifecycle
      const trace = new CanonicalExecutionTraceManager({
        correlationId: "corr-complete",
        requestId: "req-complete",
        method: "POST",
        pathname: "/api/decisions/create",
      });

      // Stage 1: Extract workspace
      trace.recordStage("WORKSPACE_EXTRACTED", "success", "ws-prod");

      // Stage 2: Gather facts
      const sessionFact = {
        sessionValid: true,
        policyValid: true,
        workspaceId: "ws-prod",
        workspaceValid: true,
        actorId: "user-123",
      };
      trace.recordStage("FACTS_GATHERED", "success");
      trace.recordAuthSnapshot(sessionFact);

      // Stage 3: Evaluate
      trace.recordStage("AUTH_EVALUATED", "success");
      trace.recordDecision({
        allowed: true,
        statusCode: 200,
        reason: "All checks passed",
        checks: [
          { check: "session_valid", result: true },
          { check: "policy_valid", result: true },
          { check: "capability_check", result: true },
        ],
      });

      // Stage 4: Execute handler
      trace.recordStage("HANDLER_EXECUTING", "success");
      trace.recordStage("HANDLER_SUCCESS", "success");

      // Finalize
      const finalTrace = trace.finalize({
        allowed: true,
        statusCode: 200,
        sessionSnapshotId: "snap-123",
      });

      // Validate complete, immutable lineage
      expect(finalTrace.sealed).toBe(true);
      expect(finalTrace.stages.length).toBeGreaterThanOrEqual(5);
      expect(finalTrace.authSnapshot).toBeDefined();
      expect(finalTrace.decision).toBeDefined();
      expect(finalTrace.outcome.allowed).toBe(true);

      // Verify immutability
      expect(() => {
        (finalTrace as any).stages = [];
      }).toThrow();
    });
  });
});
