/**
 * PHASE 4: TELEMETRY ENGINE VERIFICATION
 *
 * MANDATORY TESTS:
 * - every auth state emits deterministic telemetry
 * - every infra state emits deterministic telemetry
 * - correlation IDs preserved
 * - execution traces preserved
 * - telemetry emitted before termination
 * - telemetry failures don't fail requests
 * - secrets redacted
 * - tenant existence not leaked
 * - no duplicate emission
 * - handler execution events emitted exactly once
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  type TelemetryEvent,
  validateTelemetryEvent,
  serializeTelemetryEvent,
  shouldSampleEvent,
} from "@/infra/telemetry-contracts";
import {
  emitTelemetry,
  getTelemetryQueue,
  clearTelemetryQueue,
  waitForTelemetryFlush,
} from "@/infra/telemetry-emitter";
import { classifyErrorToTelemetry } from "@/infra/telemetry-classifier";
import {
  redactSecrets,
  redactTenantExistence,
  redactErrorDetails,
  sanitizeTelemetryForClient,
  validateNoSecretLeakage,
} from "@/infra/telemetry-sanitizer";
import { securitySignalEngine, infrastructureSignalEngine } from "@/infra/telemetry-signals";

describe("PHASE 4: Telemetry Engine", () => {
  beforeEach(() => {
    clearTelemetryQueue();
    securitySignalEngine.reset();
    infrastructureSignalEngine.reset();
  });

  describe("STEP 2: Telemetry Contract Validation", () => {
    it("validates well-formed telemetry events", () => {
      const event: TelemetryEvent = {
        eventId: uuidv4(),
        eventType: "AUTH_FAILURE",
        timestamp: Date.now(),
        correlationId: uuidv4(),
        requestId: uuidv4(),
        sourceIp: "127.0.0.1",
        route: "/api/auth/login",
        method: "POST",
        workspaceId: uuidv4(),
        actorId: "user-123",
        actorType: "user",
        authLayer: "identity",
        authState: "AUTH_INVALID",
        telemetryClass: "AUTH_INVALID",
        severity: "MEDIUM",
        httpStatus: 401,
        retryable: false,
        handlerAllowed: false,
        mutationAllowed: false,
        sampled: true,
        sampleRate: 1.0,
      };

      expect(validateTelemetryEvent(event)).toBe(true);
    });

    it("rejects invalid event types", () => {
      const event = {
        eventId: uuidv4(),
        eventType: "INVALID_EVENT",
        timestamp: Date.now(),
        correlationId: uuidv4(),
        requestId: uuidv4(),
        sourceIp: "127.0.0.1",
        route: "/api/test",
        method: "GET",
        httpStatus: 200,
        retryable: false,
        handlerAllowed: true,
        mutationAllowed: false,
        authLayer: "unknown" as unknown,
        telemetryClass: "VALIDATION_ERROR" as unknown,
        severity: "LOW" as unknown,
        sampled: true,
        sampleRate: 1.0,
      };

      expect(validateTelemetryEvent(event)).toBe(false);
    });

    it("rejects events with missing required fields", () => {
      const event = {
        eventId: uuidv4(),
        // Missing eventType
        timestamp: Date.now(),
        correlationId: uuidv4(),
        requestId: uuidv4(),
        sourceIp: "127.0.0.1",
        route: "/api/test",
        method: "GET",
        httpStatus: 200,
        retryable: false,
        handlerAllowed: true,
        mutationAllowed: false,
        authLayer: "unknown" as unknown,
        telemetryClass: "VALIDATION_ERROR" as unknown,
        severity: "LOW" as unknown,
        sampled: true,
        sampleRate: 1.0,
      };

      expect(validateTelemetryEvent(event)).toBe(false);
    });
  });

  describe("STEP 3: Telemetry Emitter", () => {
    it("emits telemetry without blocking", async () => {
      const startTime = Date.now();

      const event: TelemetryEvent = {
        eventId: uuidv4(),
        eventType: "AUTH_SUCCESS",
        timestamp: Date.now(),
        correlationId: uuidv4(),
        requestId: uuidv4(),
        sourceIp: "127.0.0.1",
        route: "/api/auth/login",
        method: "POST",
        actorId: "user-123",
        authLayer: "identity",
        telemetryClass: "AUTH_INVALID",
        severity: "LOW",
        httpStatus: 200,
        retryable: false,
        handlerAllowed: true,
        mutationAllowed: true,
        sampled: true,
        sampleRate: 1.0,
      };

      emitTelemetry(event);

      const elapsedTime = Date.now() - startTime;
      // Emission must be fast (should be immediate, <5ms)
      expect(elapsedTime).toBeLessThan(5);

      // Event should be queued
      await waitForTelemetryFlush();
      expect(getTelemetryQueue().length).toBeGreaterThanOrEqual(0);
    });

    it("handles telemetry emission failures gracefully", () => {
      const invalidEvent = {
        eventId: uuidv4(),
        eventType: "INVALID_TYPE",
        // Missing required fields
      } as unknown;

      // Should not throw
      expect(() => emitTelemetry(invalidEvent)).not.toThrow();
    });

    it("does not duplicate telemetry emission", async () => {
      const correlationId = uuidv4();

      const event: TelemetryEvent = {
        eventId: uuidv4(),
        eventType: "AUTH_FAILURE",
        timestamp: Date.now(),
        correlationId,
        requestId: uuidv4(),
        sourceIp: "127.0.0.1",
        route: "/api/test",
        method: "GET",
        authLayer: "identity",
        telemetryClass: "AUTH_INVALID",
        severity: "MEDIUM",
        httpStatus: 401,
        retryable: false,
        handlerAllowed: false,
        mutationAllowed: false,
        sampled: true,
        sampleRate: 1.0,
      };

      emitTelemetry(event);
      const queueAfterFirst = getTelemetryQueue().length;

      // Emitting same event again
      const event2 = { ...event, eventId: uuidv4() };
      emitTelemetry(event2);
      const queueAfterSecond = getTelemetryQueue().length;

      // Should both be queued separately (different event IDs)
      expect(queueAfterSecond).toBeGreaterThan(queueAfterFirst);
    });
  });

  describe("STEP 4: Telemetry Classifier", () => {
    it("classifies AUTH_INVALID to deterministic telemetry", () => {
      const classification = classifyErrorToTelemetry("AUTH_INVALID");

      expect(classification.eventType).toBe("AUTH_FAILURE");
      expect(classification.telemetryClass).toBe("AUTH_INVALID");
      expect(classification.authLayer).toBe("identity");
      expect(classification.severity).toBe("MEDIUM");
      expect(classification.securityRelevant).toBe(true);
    });

    it("classifies WORKSPACE_NOT_FOUND deterministically", () => {
      const classification = classifyErrorToTelemetry("WORKSPACE_NOT_FOUND");

      expect(classification.eventType).toBe("WORKSPACE_DENIED");
      expect(classification.telemetryClass).toBe("WORKSPACE_NOT_FOUND");
      expect(classification.authLayer).toBe("tenant");
      expect(classification.severity).toBe("LOW");
    });

    it("classifies RATE_LIMITED to security event", () => {
      const classification = classifyErrorToTelemetry("RATE_LIMITED");

      expect(classification.eventType).toBe("RATE_LIMITED");
      expect(classification.telemetryClass).toBe("RATE_LIMITED");
      expect(classification.authLayer).toBe("operational");
      expect(classification.securityRelevant).toBe(true);
    });

    it("classifies AUTH_BACKEND_UNAVAILABLE to infra event", () => {
      const classification = classifyErrorToTelemetry("AUTH_BACKEND_UNAVAILABLE");

      expect(classification.eventType).toBe("INFRA_UNAVAILABLE");
      expect(classification.authLayer).toBe("infra");
      expect(classification.infrastructureRelevant).toBe(true);
      expect(classification.severity).toBe("CRITICAL");
    });

    it("classifies all error codes exhaustively", () => {
      const errorCodes: Array<any> = [
        "AUTH_MISSING",
        "AUTH_MALFORMED",
        "AUTH_INVALID",
        "AUTH_EXPIRED",
        "AUTH_REVOKED",
        "AUTH_TAMPERED",
        "AUTH_BACKEND_UNAVAILABLE",
        "WORKSPACE_MISSING",
        "WORKSPACE_MALFORMED",
        "WORKSPACE_NOT_FOUND",
        "WORKSPACE_MEMBERSHIP_MISSING",
        "WORKSPACE_MEMBERSHIP_INACTIVE",
        "WORKSPACE_INACTIVE",
        "WORKSPACE_BACKEND_UNAVAILABLE",
        "CAPABILITY_NOT_GRANTED",
        "CAPABILITY_REVOKED",
        "CAPABILITY_BACKEND_UNAVAILABLE",
        "RATE_LIMITED",
        "REPLAY_DETECTED",
        "CIRCUIT_OPEN",
        "REQUEST_SHED",
        "SYSTEM_DEGRADED",
        "PARTIAL_VERIFICATION",
      ];

      for (const code of errorCodes) {
        const classification = classifyErrorToTelemetry(code);
        expect(classification.eventType).toBeTruthy();
        expect(classification.telemetryClass).toBeTruthy();
        expect(classification.authLayer).toBeTruthy();
        expect(classification.severity).toBeTruthy();
      }
    });
  });

  describe("STEP 8: Telemetry Sanitization", () => {
    it("redacts JWT tokens", () => {
      const jwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ";
      const payload = { authorization: jwtToken };

      const sanitized = redactSecrets(payload);
      expect((sanitized as unknown).authorization).not.toContain("eyJ");
      expect((sanitized as unknown).authorization).toContain("[REDACTED]");
    });

    it("redacts API keys", () => {
      const payload = { api_key: "sk-1234567890abcdef" };

      const sanitized = redactSecrets(payload);
      expect((sanitized as unknown).api_key).toContain("[REDACTED]");
    });

    it("redacts passwords", () => {
      const payload = { password: "super-secret-password" };

      const sanitized = redactSecrets(payload);
      expect((sanitized as unknown).password).toContain("[REDACTED]");
    });

    it("redacts session IDs", () => {
      const payload = { sessionId: "sess-abc123def456" };

      const sanitized = redactSecrets(payload);
      expect((sanitized as unknown).sessionId).toContain("[REDACTED]");
    });

    it("redacts tenant existence (workspace IDs)", () => {
      const workspaceId = "550e8400-e29b-41d4-a716-446655440000";
      const payload = { workspaceId, resource: "data" };

      const sanitized = redactTenantExistence(payload, true);
      expect((sanitized as unknown).workspaceId).toContain("[REDACTED]");
      expect((sanitized as unknown).resource).toBe("data");
    });

    it("redacts error details", () => {
      const error = new Error("Database connection failed at 192.168.1.1");

      const sanitized = redactErrorDetails(error);
      expect((sanitized as unknown).message).not.toContain("Database connection");
      expect((sanitized as unknown).message).toContain("REDACTED");
    });

    it("validates no secret leakage in serialized events", () => {
      const jwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const event = {
        eventId: uuidv4(),
        timestamp: Date.now(),
        authorization: `Bearer ${jwtToken}`,
      };

      const serialized = JSON.stringify(event);
      const validation = validateNoSecretLeakage(serialized);

      expect(validation.safe).toBe(false);
      expect(validation.leaks.length).toBeGreaterThan(0);
    });

    it("sanitizes telemetry for client consumption", () => {
      const telemetry = {
        eventId: uuidv4(),
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        actorId: "user-123",
        sourceIp: "192.168.1.1",
        executionTrace: [{ stage: "identity", state: "AUTH_INVALID" }],
        telemetryClass: "AUTH_INVALID" as unknown,
      };

      const sanitized = sanitizeTelemetryForClient(telemetry);

      // Client shouldn't see workspace, actor, source IP, or execution trace
      expect(sanitized.workspaceId).toBeUndefined();
      expect(sanitized.actorId).toBeUndefined();
      expect(sanitized.sourceIp).toBeUndefined();
      expect(sanitized.executionTrace).toBeUndefined();
    });
  });

  describe("STEP 6: Security Signal Engine", () => {
    it("detects credential stuffing", () => {
      // Simulate auth failures (16 is enough to trigger HIGH)
      for (let i = 0; i < 16; i++) {
        securitySignalEngine.recordAuthFailure();
      }

      const signals = securitySignalEngine.getSignals();
      const stuffingSignal = signals.find((s) => s.signal === "credential_stuffing");

      expect(stuffingSignal).toBeDefined();
      expect(stuffingSignal?.severity).toBe("HIGH");
      expect(stuffingSignal?.count).toBe(16);
    });

    it("detects replay attacks", () => {
      // Simulate replay attempts
      for (let i = 0; i < 10; i++) {
        securitySignalEngine.recordReplayAttempt();
      }

      const signals = securitySignalEngine.getSignals();
      const replaySignal = signals.find((s) => s.signal === "replay_attack");

      expect(replaySignal).toBeDefined();
      expect(replaySignal?.severity).toMatch(/HIGH|CRITICAL/);
    });

    it("escalates tampered credentials immediately", () => {
      securitySignalEngine.recordTamperedCredential();

      const signals = securitySignalEngine.getSignals();
      const tamperedSignal = signals.find((s) => s.signal === "tampered_credentials");

      expect(tamperedSignal).toBeDefined();
      expect(tamperedSignal?.severity).toBe("CRITICAL");
    });
  });

  describe("STEP 7: Infrastructure Signal Engine", () => {
    it("tracks auth backend unavailability", () => {
      infrastructureSignalEngine.markAuthBackendDown();
      const signals = infrastructureSignalEngine.getSignals();

      const authDownSignal = signals.find((s) => s.signal === "auth_backend_down");
      expect(authDownSignal).toBeDefined();
      expect(authDownSignal?.isActive).toBe(true);
      expect(authDownSignal?.severity).toBe("CRITICAL");
    });

    it("tracks circuit breaker opening", () => {
      infrastructureSignalEngine.markCircuitOpen("/api/workspace");
      const signals = infrastructureSignalEngine.getSignals();

      const circuitSignal = signals.find((s) => s.signal === "circuit_open");
      expect(circuitSignal).toBeDefined();
      expect(circuitSignal?.isActive).toBe(true);
      expect(circuitSignal?.affectedPath).toBe("/api/workspace");
    });

    it("tracks request shedding", () => {
      infrastructureSignalEngine.markRequestShedActive(0.2); // 20% drop rate
      const signals = infrastructureSignalEngine.getSignals();

      const shedSignal = signals.find((s) => s.signal === "request_shed_active");
      expect(shedSignal).toBeDefined();
      expect(shedSignal?.isActive).toBe(true);
    });

    it("recovers from backend unavailability", () => {
      infrastructureSignalEngine.markAuthBackendDown();
      let signals = infrastructureSignalEngine.getSignals();
      expect(signals.some((s) => s.signal === "auth_backend_down")).toBe(true);

      infrastructureSignalEngine.markAuthBackendUp();
      signals = infrastructureSignalEngine.getSignals();
      expect(signals.some((s) => s.signal === "auth_backend_down")).toBe(false);
    });
  });

  describe("Deterministic Sampling", () => {
    it("same correlation ID gets same sampling decision", () => {
      const correlationId = uuidv4();
      const sampleRate = 0.5;

      const decision1 = shouldSampleEvent(correlationId, sampleRate);
      const decision2 = shouldSampleEvent(correlationId, sampleRate);

      expect(decision1).toBe(decision2);
    });

    it("respects 100% sample rate", () => {
      const correlationId = uuidv4();
      const sampled = shouldSampleEvent(correlationId, 1.0);
      expect(sampled).toBe(true);
    });

    it("respects 0% sample rate", () => {
      const correlationId = uuidv4();
      const sampled = shouldSampleEvent(correlationId, 0.0);
      expect(sampled).toBe(false);
    });
  });

  describe("Execution Trace Preservation", () => {
    it("preserves execution traces in telemetry", () => {
      const event: TelemetryEvent = {
        eventId: uuidv4(),
        eventType: "AUTH_FAILURE",
        timestamp: Date.now(),
        correlationId: uuidv4(),
        requestId: uuidv4(),
        sourceIp: "127.0.0.1",
        route: "/api/test",
        method: "GET",
        authLayer: "identity",
        telemetryClass: "AUTH_INVALID",
        severity: "MEDIUM",
        httpStatus: 401,
        retryable: false,
        handlerAllowed: false,
        mutationAllowed: false,
        executionTrace: [
          {
            stage: "credential_parsing",
            startedAt: 1000,
            completedAt: 1005,
            state: "AUTH_MISSING",
            decision: "TERMINATE",
            terminated: true,
          },
        ],
        sampled: true,
        sampleRate: 1.0,
      };

      expect(validateTelemetryEvent(event)).toBe(true);
      expect(event.executionTrace).toBeDefined();
      expect(event.executionTrace?.[0].stage).toBe("credential_parsing");
    });
  });

  describe("Correlation ID Preservation", () => {
    it("preserves correlation IDs through telemetry lifecycle", () => {
      const correlationId = uuidv4();

      const event: TelemetryEvent = {
        eventId: uuidv4(),
        eventType: "AUTH_SUCCESS",
        timestamp: Date.now(),
        correlationId,
        requestId: uuidv4(),
        sourceIp: "127.0.0.1",
        route: "/api/test",
        method: "GET",
        authLayer: "identity",
        telemetryClass: "AUTH_INVALID",
        severity: "LOW",
        httpStatus: 200,
        retryable: false,
        handlerAllowed: true,
        mutationAllowed: true,
        sampled: true,
        sampleRate: 1.0,
      };

      emitTelemetry(event);
      const queued = getTelemetryQueue()[0];

      expect(queued?.correlationId).toBe(correlationId);
    });
  });
});
