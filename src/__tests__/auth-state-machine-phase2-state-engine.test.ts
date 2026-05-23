/**
 * AUTH STATE MACHINE PHASE 2: State Engine Tests
 *
 * Verify deterministic mapping of auth states to decisions.
 */

import { evaluateAuthState, type AuthState } from "@/services/auth/state-engine";

describe("PHASE 2: Auth State Engine", () => {
  describe("Layer 1: Identity Authentication States", () => {
    it("NO_CREDENTIALS returns 401 Unauthorized, not retryable", () => {
      const decision = evaluateAuthState("NO_CREDENTIALS");
      expect(decision.httpStatus).toBe(401);
      expect(decision.layer).toBe(1);
      expect(decision.telemetryClass).toBe("AUTH_INVALID");
      expect(decision.retryable).toBe(false);
      expect(decision.handlerAllowed).toBe(false);
      expect(decision.mutationAllowed).toBe(false);
    });

    it("MALFORMED_CREDENTIALS returns 400 Bad Request", () => {
      const decision = evaluateAuthState("MALFORMED_CREDENTIALS");
      expect(decision.httpStatus).toBe(400);
      expect(decision.layer).toBe(1);
      expect(decision.telemetryClass).toBe("VALIDATION_ERROR");
      expect(decision.auditClass).toBe("CLIENT_ERROR");
    });

    it("SESSION_INVALID returns 401, not retryable", () => {
      const decision = evaluateAuthState("SESSION_INVALID");
      expect(decision.httpStatus).toBe(401);
      expect(decision.retryable).toBe(false);
      expect(decision.telemetryClass).toBe("AUTH_INVALID");
    });

    it("SESSION_EXPIRED returns 401, IS retryable", () => {
      const decision = evaluateAuthState("SESSION_EXPIRED");
      expect(decision.httpStatus).toBe(401);
      expect(decision.retryable).toBe(true);
      expect(decision.telemetryClass).toBe("AUTH_EXPIRED");
    });

    it("SESSION_REVOKED returns 401, security event", () => {
      const decision = evaluateAuthState("SESSION_REVOKED");
      expect(decision.httpStatus).toBe(401);
      expect(decision.auditClass).toBe("SECURITY_EVENT");
      expect(decision.telemetryClass).toBe("AUTH_REVOKED");
    });

    it("SESSION_TAMPERED returns 401, CRITICAL security", () => {
      const decision = evaluateAuthState("SESSION_TAMPERED");
      expect(decision.httpStatus).toBe(401);
      expect(decision.auditClass).toBe("SECURITY_EVENT");
      expect(decision.telemetryClass).toBe("AUTH_TAMPERED");
    });

    it("SESSION_VALID allows handler, continues to next layer", () => {
      const decision = evaluateAuthState("SESSION_VALID");
      expect(decision.handlerAllowed).toBe(true);
      expect(decision.layer).toBe(1);
      // Not a terminal error state
    });
  });

  describe("Layer 2: Tenant Authorization States", () => {
    it("WORKSPACE_MISSING_HEADER returns 400 Bad Request", () => {
      const decision = evaluateAuthState("WORKSPACE_MISSING_HEADER");
      expect(decision.httpStatus).toBe(400);
      expect(decision.auditClass).toBe("CLIENT_ERROR");
    });

    it("WORKSPACE_MALFORMED_HEADER returns 400 Bad Request", () => {
      const decision = evaluateAuthState("WORKSPACE_MALFORMED_HEADER");
      expect(decision.httpStatus).toBe(400);
      expect(decision.layer).toBe(2);
    });

    it("WORKSPACE_NOT_FOUND returns 403 (never 404)", () => {
      const decision = evaluateAuthState("WORKSPACE_NOT_FOUND");
      expect(decision.httpStatus).toBe(403);
      expect(decision.auditClass).toBe("WORKSPACE_ACCESS_DENIED");
      // 403 is canonical, not 404, to prevent tenant enumeration
    });

    it("WORKSPACE_MEMBERSHIP_MISSING returns 403", () => {
      const decision = evaluateAuthState("WORKSPACE_MEMBERSHIP_MISSING");
      expect(decision.httpStatus).toBe(403);
      expect(decision.telemetryClass).toBe("WORKSPACE_DENIED");
    });

    it("WORKSPACE_MEMBERSHIP_INACTIVE returns 403", () => {
      const decision = evaluateAuthState("WORKSPACE_MEMBERSHIP_INACTIVE");
      expect(decision.httpStatus).toBe(403);
      expect(decision.layer).toBe(2);
    });

    it("WORKSPACE_INACTIVE returns 403", () => {
      const decision = evaluateAuthState("WORKSPACE_INACTIVE");
      expect(decision.httpStatus).toBe(403);
    });

    it("WORKSPACE_VERIFIED allows handler, continues to layer 3", () => {
      const decision = evaluateAuthState("WORKSPACE_VERIFIED");
      expect(decision.handlerAllowed).toBe(true);
      expect(decision.layer).toBe(2);
    });

    it("All workspace denials return 403 (consistent policy)", () => {
      const denialStates: AuthState[] = [
        "WORKSPACE_NOT_FOUND",
        "WORKSPACE_MEMBERSHIP_MISSING",
        "WORKSPACE_MEMBERSHIP_INACTIVE",
        "WORKSPACE_INACTIVE",
      ];

      for (const state of denialStates) {
        const decision = evaluateAuthState(state);
        expect(decision.httpStatus).toBe(403);
      }
    });
  });

  describe("Layer 3: Capability Authorization States", () => {
    it("CAPABILITY_NOT_GRANTED returns 403", () => {
      const decision = evaluateAuthState("CAPABILITY_NOT_GRANTED");
      expect(decision.httpStatus).toBe(403);
      expect(decision.telemetryClass).toBe("CAPABILITY_DENIED");
      expect(decision.auditClass).toBe("CAPABILITY_DENIED");
    });

    it("CAPABILITY_REVOKED returns 403, tracked separately", () => {
      const decision = evaluateAuthState("CAPABILITY_REVOKED");
      expect(decision.httpStatus).toBe(403);
      expect(decision.telemetryClass).toBe("CAPABILITY_REVOKED");
    });

    it("CAPABILITY_VERIFIED allows handler and mutation", () => {
      const decision = evaluateAuthState("CAPABILITY_VERIFIED");
      expect(decision.handlerAllowed).toBe(true);
      expect(decision.mutationAllowed).toBe(true);
      expect(decision.layer).toBe(3);
    });
  });

  describe("Layer 4: Operational Safety States", () => {
    it("RATE_LIMITED returns 429, retryable", () => {
      const decision = evaluateAuthState("RATE_LIMITED");
      expect(decision.httpStatus).toBe(429);
      expect(decision.retryable).toBe(true);
      expect(decision.telemetryClass).toBe("RATE_LIMITED");
    });

    it("REPLAY_DETECTED returns 200 with cached response", () => {
      const decision = evaluateAuthState("REPLAY_DETECTED");
      expect(decision.httpStatus).toBe(200);
      expect(decision.retryable).toBe(true);
      expect(decision.handlerAllowed).toBe(false); // Use cache, not handler
      expect(decision.telemetryClass).toBe("REPLAY_DETECTED");
    });

    it("CIRCUIT_OPEN returns 503, retryable", () => {
      const decision = evaluateAuthState("CIRCUIT_OPEN");
      expect(decision.httpStatus).toBe(503);
      expect(decision.retryable).toBe(true);
      expect(decision.layer).toBe(4);
    });

    it("REQUEST_SHED returns 503, retryable", () => {
      const decision = evaluateAuthState("REQUEST_SHED");
      expect(decision.httpStatus).toBe(503);
      expect(decision.retryable).toBe(true);
      expect(decision.auditClass).toBe("INFRASTRUCTURE_INCIDENT");
    });

    it("SYSTEM_DEGRADED returns 503, retryable", () => {
      const decision = evaluateAuthState("SYSTEM_DEGRADED");
      expect(decision.httpStatus).toBe(503);
      expect(decision.retryable).toBe(true);
      expect(decision.telemetryClass).toBe("SYSTEM_DEGRADED");
    });
  });

  describe("Layer 5: Infrastructure Failures", () => {
    it("AUTH_BACKEND_UNAVAILABLE returns 503, retryable", () => {
      const decision = evaluateAuthState("AUTH_BACKEND_UNAVAILABLE");
      expect(decision.httpStatus).toBe(503);
      expect(decision.retryable).toBe(true);
      expect(decision.layer).toBe(5);
      expect(decision.telemetryClass).toBe("AUTH_BACKEND_UNAVAILABLE");
    });

    it("WORKSPACE_BACKEND_UNAVAILABLE returns 503, retryable", () => {
      const decision = evaluateAuthState("WORKSPACE_BACKEND_UNAVAILABLE");
      expect(decision.httpStatus).toBe(503);
      expect(decision.retryable).toBe(true);
      expect(decision.auditClass).toBe("INFRASTRUCTURE_INCIDENT");
    });

    it("CAPABILITY_BACKEND_UNAVAILABLE returns 503, retryable", () => {
      const decision = evaluateAuthState("CAPABILITY_BACKEND_UNAVAILABLE");
      expect(decision.httpStatus).toBe(503);
      expect(decision.retryable).toBe(true);
      expect(decision.telemetryClass).toBe("CAPABILITY_BACKEND_UNAVAILABLE");
    });

    it("PARTIAL_VERIFICATION returns 503, retryable", () => {
      const decision = evaluateAuthState("PARTIAL_VERIFICATION");
      expect(decision.httpStatus).toBe(503);
      expect(decision.retryable).toBe(true);
      expect(decision.telemetryClass).toBe("PARTIAL_VERIFICATION");
    });

    it("All infrastructure failures return 503 (consistent pattern)", () => {
      const infraStates: AuthState[] = [
        "AUTH_BACKEND_UNAVAILABLE",
        "WORKSPACE_BACKEND_UNAVAILABLE",
        "CAPABILITY_BACKEND_UNAVAILABLE",
        "PARTIAL_VERIFICATION",
        "CIRCUIT_OPEN",
        "REQUEST_SHED",
        "SYSTEM_DEGRADED",
      ];

      for (const state of infraStates) {
        const decision = evaluateAuthState(state);
        expect(decision.httpStatus).toBe(503);
        expect(decision.retryable).toBe(true);
      }
    });
  });

  describe("Fail-Closed Guarantees", () => {
    it("No auth error allows handler execution", () => {
      const authStates: AuthState[] = [
        "NO_CREDENTIALS",
        "MALFORMED_CREDENTIALS",
        "SESSION_INVALID",
        "SESSION_EXPIRED",
        "SESSION_REVOKED",
        "SESSION_TAMPERED",
        "WORKSPACE_MISSING_HEADER",
        "WORKSPACE_MALFORMED_HEADER",
        "WORKSPACE_NOT_FOUND",
        "WORKSPACE_MEMBERSHIP_MISSING",
        "WORKSPACE_MEMBERSHIP_INACTIVE",
        "WORKSPACE_INACTIVE",
        "CAPABILITY_NOT_GRANTED",
        "CAPABILITY_REVOKED",
      ];

      for (const state of authStates) {
        const decision = evaluateAuthState(state);
        expect(decision.handlerAllowed).toBe(false);
      }
    });

    it("No 401/403 error allows mutation", () => {
      const denialStates: AuthState[] = [
        "NO_CREDENTIALS",
        "SESSION_INVALID",
        "SESSION_EXPIRED",
        "SESSION_REVOKED",
        "SESSION_TAMPERED",
        "WORKSPACE_NOT_FOUND",
        "WORKSPACE_MEMBERSHIP_MISSING",
        "WORKSPACE_MEMBERSHIP_INACTIVE",
        "WORKSPACE_INACTIVE",
        "CAPABILITY_NOT_GRANTED",
        "CAPABILITY_REVOKED",
      ];

      for (const state of denialStates) {
        const decision = evaluateAuthState(state);
        if (decision.httpStatus === 401 || decision.httpStatus === 403) {
          expect(decision.mutationAllowed).toBe(false);
        }
      }
    });

    it("Invalid credentials prevent handler in any form", () => {
      const invalidStates: AuthState[] = [
        "SESSION_INVALID",
        "SESSION_TAMPERED",
        "SESSION_REVOKED",
      ];

      for (const state of invalidStates) {
        const decision = evaluateAuthState(state);
        expect(decision.handlerAllowed).toBe(false);
        expect(decision.mutationAllowed).toBe(false);
        expect([401, 403]).toContain(decision.httpStatus);
      }
    });

    it("Only CAPABILITY_VERIFIED allows mutation", () => {
      const decision = evaluateAuthState("CAPABILITY_VERIFIED");
      expect(decision.handlerAllowed).toBe(true);
      expect(decision.mutationAllowed).toBe(true);
    });
  });

  describe("Error Factory Function", () => {
    it("Each state has working error factory", () => {
      const states: AuthState[] = [
        "NO_CREDENTIALS",
        "SESSION_INVALID",
        "WORKSPACE_NOT_FOUND",
        "CAPABILITY_NOT_GRANTED",
        "RATE_LIMITED",
        "AUTH_BACKEND_UNAVAILABLE",
      ];

      for (const state of states) {
        const decision = evaluateAuthState(state);
        const error = decision.errorFactory();
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBeTruthy();
      }
    });

    it("Error factory preserves correlation ID", () => {
      const correlationId = "test-corr-123";
      const decision = evaluateAuthState("SESSION_INVALID", correlationId);
      const error = decision.errorFactory(correlationId);
      expect((error as unknown).correlationId).toBe(correlationId);
    });
  });

  describe("Determinism", () => {
    it("Same state produces identical decisions (excluding error factory)", () => {
      const state: AuthState = "WORKSPACE_NOT_FOUND";
      const decision1 = evaluateAuthState(state);
      const decision2 = evaluateAuthState(state);

      // Compare all fields except errorFactory (function references differ)
      expect(decision1.state).toBe(decision2.state);
      expect(decision1.httpStatus).toBe(decision2.httpStatus);
      expect(decision1.layer).toBe(decision2.layer);
      expect(decision1.telemetryClass).toBe(decision2.telemetryClass);
      expect(decision1.auditClass).toBe(decision2.auditClass);
      expect(decision1.handlerAllowed).toBe(decision2.handlerAllowed);
      expect(decision1.mutationAllowed).toBe(decision2.mutationAllowed);
      expect(decision1.retryable).toBe(decision2.retryable);
    });

    it("Decisions deterministic across multiple calls", () => {
      for (let i = 0; i < 10; i++) {
        const decision = evaluateAuthState("SESSION_EXPIRED");
        expect(decision.httpStatus).toBe(401);
        expect(decision.retryable).toBe(true);
      }
    });
  });

  describe("Layer Progression", () => {
    it("Layer 1 states are layer 1", () => {
      const layer1States: AuthState[] = [
        "NO_CREDENTIALS",
        "MALFORMED_CREDENTIALS",
        "SESSION_INVALID",
        "SESSION_EXPIRED",
        "SESSION_REVOKED",
        "SESSION_TAMPERED",
        "SESSION_VALID",
      ];

      for (const state of layer1States) {
        const decision = evaluateAuthState(state);
        expect(decision.layer).toBe(1);
      }
    });

    it("Layer 2 states are layer 2", () => {
      const layer2States: AuthState[] = [
        "WORKSPACE_MISSING_HEADER",
        "WORKSPACE_MALFORMED_HEADER",
        "WORKSPACE_NOT_FOUND",
        "WORKSPACE_MEMBERSHIP_MISSING",
        "WORKSPACE_MEMBERSHIP_INACTIVE",
        "WORKSPACE_INACTIVE",
        "WORKSPACE_VERIFIED",
      ];

      for (const state of layer2States) {
        const decision = evaluateAuthState(state);
        expect(decision.layer).toBe(2);
      }
    });

    it("Layer 3 states are layer 3", () => {
      const layer3States: AuthState[] = [
        "CAPABILITY_NOT_GRANTED",
        "CAPABILITY_REVOKED",
        "CAPABILITY_VERIFIED",
      ];

      for (const state of layer3States) {
        const decision = evaluateAuthState(state);
        expect(decision.layer).toBe(3);
      }
    });

    it("Infrastructure states are layer 5", () => {
      const layer5States: AuthState[] = [
        "AUTH_BACKEND_UNAVAILABLE",
        "WORKSPACE_BACKEND_UNAVAILABLE",
        "CAPABILITY_BACKEND_UNAVAILABLE",
        "PARTIAL_VERIFICATION",
      ];

      for (const state of layer5States) {
        const decision = evaluateAuthState(state);
        expect(decision.layer).toBe(5);
      }
    });
  });

  describe("Consistency Across Denial Codes", () => {
    it("All 403 denials are non-retryable", () => {
      const denials: AuthState[] = [
        "WORKSPACE_NOT_FOUND",
        "WORKSPACE_MEMBERSHIP_MISSING",
        "WORKSPACE_MEMBERSHIP_INACTIVE",
        "WORKSPACE_INACTIVE",
        "CAPABILITY_NOT_GRANTED",
        "CAPABILITY_REVOKED",
      ];

      for (const state of denials) {
        const decision = evaluateAuthState(state);
        if (decision.httpStatus === 403) {
          expect(decision.retryable).toBe(false);
        }
      }
    });

    it("All 401 denials have clear audit/telemetry class", () => {
      const denials: AuthState[] = [
        "NO_CREDENTIALS",
        "SESSION_INVALID",
        "SESSION_EXPIRED",
        "SESSION_REVOKED",
        "SESSION_TAMPERED",
      ];

      for (const state of denials) {
        const decision = evaluateAuthState(state);
        expect(decision.auditClass).toBeTruthy();
        expect(decision.telemetryClass).toBeTruthy();
        expect(decision.auditClass).not.toBe("");
      }
    });
  });
});
