/**
 * AUTH STATE MACHINE PHASE 3: Pipeline Executor Tests
 *
 * CRITICAL TESTS: Verify hard execution barrier
 * - Handler NEVER executes on failed auth
 * - Handler executes ONLY after all auth passes
 * - Execution order is deterministic
 * - Trace is complete
 * - No mutations before auth completion
 */

import {
  executeAuthPipeline,
  executeAuthWithHandler,
  verifyHandlerNeverExecutes,
  verifyExecutionTrace,
  type AuthState,
} from "@/services/auth/pipeline-executor";

describe("PHASE 3: Auth Pipeline Executor", () => {
  describe("Execution Barrier: Handler Never Executes on Failed Auth", () => {
    const failureStates: AuthState[] = [
      "NO_CREDENTIALS",
      "MALFORMED_CREDENTIALS",
      "SESSION_INVALID",
      "SESSION_REVOKED",
      "SESSION_TAMPERED",
      "WORKSPACE_NOT_FOUND",
      "WORKSPACE_MEMBERSHIP_MISSING",
      "WORKSPACE_MEMBERSHIP_INACTIVE",
      "WORKSPACE_INACTIVE",
      "CAPABILITY_NOT_GRANTED",
      "CAPABILITY_REVOKED",
      "RATE_LIMITED",
      "CIRCUIT_OPEN",
      "REQUEST_SHED",
      "SYSTEM_DEGRADED",
      "AUTH_BACKEND_UNAVAILABLE",
      "WORKSPACE_BACKEND_UNAVAILABLE",
      "CAPABILITY_BACKEND_UNAVAILABLE",
      "PARTIAL_VERIFICATION",
    ];

    for (const state of failureStates) {
      it(`${state}: handler never executes`, async () => {
        let handlerCalled = false;

        const result = await executeAuthWithHandler(state, async () => {
          handlerCalled = true;
          return "success";
        });

        expect(handlerCalled).toBe(false);
        expect(result.allowed).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.handlerResult).toBeUndefined();
      });
    }
  });

  describe("Handler Execution: Handler Executes When Auth Passes", () => {
    const successStates: AuthState[] = [
      "SESSION_VALID",
      "WORKSPACE_VERIFIED",
      "CAPABILITY_VERIFIED",
    ];

    for (const state of successStates) {
      it(`${state}: handler executes and returns result`, async () => {
        let handlerCalled = false;
        const expectedResult = `result_${state}`;

        const result = await executeAuthWithHandler(state, async () => {
          handlerCalled = true;
          return expectedResult;
        });

        expect(handlerCalled).toBe(true);
        expect(result.allowed).toBe(true);
        expect(result.handlerResult).toBe(expectedResult);
        expect(result.error).toBeUndefined();
      });
    }
  });

  describe("Execution Order: Pipeline Executes in Correct Sequence", () => {
    it("NO_CREDENTIALS state first in trace", async () => {
      const result = await executeAuthPipeline("NO_CREDENTIALS");

      expect(result.executionTrace.length).toBeGreaterThan(0);
      expect(result.executionTrace[0].state).toBe("NO_CREDENTIALS");
    });

    it("Execution order is deterministic: same state same order", async () => {
      const result1 = await executeAuthPipeline("SESSION_INVALID");
      const result2 = await executeAuthPipeline("SESSION_INVALID");

      // First stage should be the same
      expect(result1.executionTrace[0].state).toBe(result2.executionTrace[0].state);
      expect(result1.executionTrace[0].decision.httpStatus).toBe(
        result2.executionTrace[0].decision.httpStatus
      );
    });

    it("Each stage completed before next stage started", async () => {
      const result = await executeAuthPipeline("SESSION_INVALID");

      for (let i = 1; i < result.executionTrace.length; i++) {
        const prevStage = result.executionTrace[i - 1];
        const currentStage = result.executionTrace[i];

        expect(currentStage.startedAt).toBeGreaterThanOrEqual(prevStage.completedAt);
      }
    });
  });

  describe("Execution Trace: Complete and Verifiable", () => {
    it("Trace contains all executed stages", async () => {
      const result = await executeAuthPipeline("SESSION_INVALID");

      expect(result.executionTrace.length).toBeGreaterThan(0);
      expect(result.executionTrace[0].stage).toBeDefined();
      expect(result.executionTrace[0].decision).toBeDefined();
    });

    it("Trace records timing for each stage", async () => {
      const result = await executeAuthPipeline("SESSION_INVALID");

      for (const stage of result.executionTrace) {
        expect(stage.startedAt).toBeGreaterThan(0);
        expect(stage.completedAt).toBeGreaterThanOrEqual(stage.startedAt);
      }
    });

    it("Trace records final state and decision", async () => {
      const result = await executeAuthPipeline("SESSION_INVALID");

      expect(result.finalState).toBe("SESSION_INVALID");
      expect(result.finalDecision).toBeDefined();
      expect(result.finalDecision.httpStatus).toBe(401);
    });

    it("verifyExecutionTrace detects complete trace", async () => {
      const result = await executeAuthPipeline("SESSION_INVALID");
      const verification = verifyExecutionTrace(result.executionTrace);

      expect(verification.valid).toBe(true);
      expect(verification.errors).toHaveLength(0);
    });

    it("verifyExecutionTrace detects empty trace", () => {
      const verification = verifyExecutionTrace([]);

      expect(verification.valid).toBe(false);
      expect(verification.errors).toContain("Execution trace is empty");
    });

    it("Trace preserved even when handler throws", async () => {
      const result = await executeAuthWithHandler(
        "SESSION_VALID",
        async () => {
          throw new Error("Handler error");
        }
      );

      expect(result.executionTrace.length).toBeGreaterThan(0);
      expect(result.error?.message).toBe("Handler error");
    });
  });

  describe("Correlation ID Preservation", () => {
    it("Correlation ID passed through to result", async () => {
      const correlationId = "test-corr-123";
      const result = await executeAuthPipeline("SESSION_INVALID", { correlationId });

      expect(result.correlationId).toBe(correlationId);
    });

    it("Correlation ID passed to handler context", async () => {
      const correlationId = "test-corr-456";
      const result = await executeAuthWithHandler("SESSION_VALID", async () => "ok", {
        correlationId,
      });

      expect(result.correlationId).toBe(correlationId);
    });

    it("Correlation ID included in error", async () => {
      const correlationId = "test-corr-789";
      const result = await executeAuthPipeline("SESSION_INVALID", { correlationId });

      expect(result.error?.["correlationId"]).toBe(correlationId);
    });
  });

  describe("Error Generation: Correct Error Type per State", () => {
    it("401 errors on identity failures", async () => {
      const states: AuthState[] = [
        "NO_CREDENTIALS",
        "SESSION_INVALID",
        "SESSION_EXPIRED",
        "SESSION_REVOKED",
        "SESSION_TAMPERED",
      ];

      for (const state of states) {
        const result = await executeAuthPipeline(state);
        expect(result.finalDecision.httpStatus).toBe(401);
        expect(result.error).toBeInstanceOf(Error);
      }
    });

    it("403 errors on authorization failures", async () => {
      const states: AuthState[] = [
        "WORKSPACE_NOT_FOUND",
        "WORKSPACE_MEMBERSHIP_MISSING",
        "CAPABILITY_NOT_GRANTED",
      ];

      for (const state of states) {
        const result = await executeAuthPipeline(state);
        expect(result.finalDecision.httpStatus).toBe(403);
      }
    });

    it("429 error on rate limiting", async () => {
      const result = await executeAuthPipeline("RATE_LIMITED");
      expect(result.finalDecision.httpStatus).toBe(429);
    });

    it("503 errors on infrastructure failures", async () => {
      const states: AuthState[] = [
        "AUTH_BACKEND_UNAVAILABLE",
        "WORKSPACE_BACKEND_UNAVAILABLE",
        "CIRCUIT_OPEN",
        "REQUEST_SHED",
        "SYSTEM_DEGRADED",
      ];

      for (const state of states) {
        const result = await executeAuthPipeline(state);
        expect(result.finalDecision.httpStatus).toBe(503);
      }
    });
  });

  describe("Mutation Prevention: No Mutations Before Auth Completion", () => {
    it("Handler that would mutate is prevented on failed auth", async () => {
      const mutations: string[] = [];

      const recordMutation = () => mutations.push("mutated");

      const result = await executeAuthWithHandler("SESSION_INVALID", async () => {
        recordMutation();
        return "should not happen";
      });

      expect(mutations).toHaveLength(0);
      expect(result.allowed).toBe(false);
    });

    it("Handler mutations execute ONLY after auth passes", async () => {
      const mutations: string[] = [];

      const result = await executeAuthWithHandler("SESSION_VALID", async () => {
        mutations.push("mutated");
        return "success";
      });

      expect(mutations).toEqual(["mutated"]);
      expect(result.allowed).toBe(true);
    });

    it("Mutation spy never detects mutation on failed auth", async () => {
      let mutationAttempted = false;

      await executeAuthWithHandler("WORKSPACE_MEMBERSHIP_MISSING", async () => {
        mutationAttempted = true;
        // Simulated mutation
        return null;
      });

      expect(mutationAttempted).toBe(false);
    });
  });

  describe("Determinism: Same Input Always Produces Same Output", () => {
    it("Same auth state produces same decision", async () => {
      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = await executeAuthPipeline("WORKSPACE_NOT_FOUND");
        results.push({
          allowed: result.allowed,
          status: result.finalDecision.httpStatus,
          state: result.finalState,
        });
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(results[0]);
      }
    });

    it("Handler either always executes or never executes for same state", async () => {
      const executions: boolean[] = [];

      for (let i = 0; i < 5; i++) {
        let executed = false;
        await executeAuthWithHandler("SESSION_VALID", async () => {
          executed = true;
          return null;
        });
        executions.push(executed);
      }

      // All should be true
      expect(executions).toEqual([true, true, true, true, true]);
    });
  });

  describe("No Handler Bypass Verification", () => {
    it("verifyHandlerNeverExecutes confirms handler blocked on all failure states", async () => {
      const failureStates: AuthState[] = [
        "NO_CREDENTIALS",
        "SESSION_INVALID",
        "WORKSPACE_NOT_FOUND",
        "CAPABILITY_NOT_GRANTED",
        "AUTH_BACKEND_UNAVAILABLE",
      ];

      for (const state of failureStates) {
        const result = await verifyHandlerNeverExecutes(state);
        expect(result).toBe(true);
      }
    });
  });

  describe("Fail-Closed Guarantees", () => {
    it("All failure states return error object", async () => {
      const failureStates: AuthState[] = [
        "NO_CREDENTIALS",
        "SESSION_INVALID",
        "WORKSPACE_NOT_FOUND",
        "CAPABILITY_NOT_GRANTED",
      ];

      for (const state of failureStates) {
        const result = await executeAuthPipeline(state);
        expect(result.error).toBeDefined();
        expect(result.allowed).toBe(false);
      }
    });

    it("Handler return value undefined on failed auth", async () => {
      const result = await executeAuthWithHandler("SESSION_INVALID", async () => "should not return");

      expect(result.handlerResult).toBeUndefined();
    });

    it("Success states allow mutation flag", async () => {
      const result = await executeAuthPipeline("CAPABILITY_VERIFIED");

      expect(result.finalDecision.mutationAllowed).toBe(true);
    });

    it("Failure states prevent mutation flag", async () => {
      const failureStates: AuthState[] = [
        "SESSION_INVALID",
        "WORKSPACE_NOT_FOUND",
        "CAPABILITY_NOT_GRANTED",
      ];

      for (const state of failureStates) {
        const result = await executeAuthPipeline(state);
        expect(result.finalDecision.mutationAllowed).toBe(false);
      }
    });
  });

  describe("Handler Error Handling: Business Errors After Auth Passes", () => {
    it("Handler errors caught and returned separately from auth", async () => {
      const handlerError = new Error("Business logic error");

      const result = await executeAuthWithHandler("SESSION_VALID", async () => {
        throw handlerError;
      });

      expect(result.allowed).toBe(true); // Auth passed
      expect(result.error).toBeDefined(); // But handler threw
      expect(result.error?.message).toBe("Business logic error");
    });

    it("Non-Error exceptions converted to Error", async () => {
      const result = await executeAuthWithHandler("SESSION_VALID", async () => {
        throw "string error";
      });

      expect(result.allowed).toBe(true);
      expect(result.error).toBeInstanceOf(Error);
    });
  });
});
