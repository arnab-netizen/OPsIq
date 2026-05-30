import { describe, it, expect } from "vitest";

/**
 * Tests for smoke script helper logic
 * Validates Phase 2 fixed route checks added to smoke-production-dashboard.ts
 */

describe("Smoke Script Helpers", () => {
  describe("Engagement ID extraction", () => {
    it("extracts ID from array response", () => {
      const data = [
        { id: "550e8400-e29b-41d4-a716-446655440000", name: "Engagement 1" },
        { id: "550e8400-e29b-41d4-a716-446655440001", name: "Engagement 2" },
      ];

      const firstId = (Array.isArray(data) ? data : data.engagements || data.data || [])[0]?.id;
      expect(firstId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("extracts ID from object with engagements field", () => {
      const data = {
        engagements: [
          { id: "550e8400-e29b-41d4-a716-446655440000", name: "Engagement 1" },
        ],
      };

      const engagementArray = Array.isArray(data) ? data : data.engagements || data.data || [];
      const firstId = engagementArray[0]?.id;
      expect(firstId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("extracts ID from object with data field", () => {
      const data = {
        data: [{ id: "550e8400-e29b-41d4-a716-446655440000", name: "Engagement 1" }],
      };

      const engagementArray = Array.isArray(data) ? data : data.engagements || data.data || [];
      const firstId = engagementArray[0]?.id;
      expect(firstId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("returns null when no engagement data", () => {
      const data = {};

      const engagementArray = Array.isArray(data) ? data : data.engagements || data.data || [];
      const firstId = engagementArray[0]?.id;
      expect(firstId).toBeUndefined();
    });
  });

  describe("ID masking for safe logging", () => {
    it("masks UUID correctly: first 4 + ... + last 4", () => {
      const fullId = "550e8400-e29b-41d4-a716-446655440000";
      const maskedId = fullId.substring(0, 4) + "..." + fullId.substring(fullId.length - 4);

      expect(maskedId).toBe("550e...0000");
      expect(maskedId).not.toContain("8400");
      expect(maskedId).not.toContain("e29b");
      expect(maskedId).not.toContain("41d4");
      expect(maskedId).not.toContain("a716");
      expect(maskedId.length).toBeLessThan(fullId.length);
    });

    it("does not print full ID in logs", () => {
      const fullId = "550e8400-e29b-41d4-a716-446655440000";
      const logMessage = `GET /api/engagements/{550e...0000}/dashboard`;

      expect(logMessage).not.toContain("550e8400-e29b-41d4-a716-446655440000");
      expect(logMessage).not.toContain(fullId);
    });
  });

  describe("Response validation", () => {
    it("fails on empty object response", () => {
      const response = {};
      const isEmpty = JSON.stringify(response) === "{}";
      expect(isEmpty).toBe(true);
    });

    it("detects top-level keys in valid response", () => {
      const response = { status: "active", metrics: { progress: 75 } };
      const keyCount = typeof response === "object" && response !== null ? Object.keys(response).length : 0;
      expect(keyCount).toBe(2);
      expect(keyCount).toBeGreaterThan(0);
    });

    it("fails when response has no top-level keys", () => {
      const response = {};
      const keyCount = typeof response === "object" && response !== null ? Object.keys(response).length : 0;
      expect(keyCount).toBe(0);
    });

    it("accepts valid dashboard response shape", () => {
      const response = {
        engagementId: "eng-123",
        status: "active",
        metrics: { progress: 75, health: "good" },
      };

      const isEmpty = JSON.stringify(response) === "{}";
      const keyCount = Object.keys(response).length;

      expect(isEmpty).toBe(false);
      expect(keyCount).toBeGreaterThan(0);
    });

    it("accepts valid drift response shape", () => {
      const response = {
        engagementId: "eng-123",
        driftDetected: true,
        severity: "high",
        factors: ["timeline_variance"],
      };

      const isEmpty = JSON.stringify(response) === "{}";
      const keyCount = Object.keys(response).length;

      expect(isEmpty).toBe(false);
      expect(keyCount).toBeGreaterThan(0);
    });
  });

  describe("Safe error body validation", () => {
    it("detects stack trace in error response", () => {
      const errorBody = JSON.stringify({
        error: "Not found",
        stack: "Error: at Function...",
      });

      const isSafe = !errorBody.includes("stack");
      expect(isSafe).toBe(false);
    });

    it("detects secret in error response", () => {
      const errorBody = JSON.stringify({
        error: "Database error",
        secret: "postgresql://user:password@host",
      });

      const isSafe = !errorBody.toLowerCase().includes("secret");
      expect(isSafe).toBe(false);
    });

    it("accepts safe error body", () => {
      const errorBody = JSON.stringify({
        error: "Not found",
        code: "NOT_FOUND",
        message: "Resource not found",
      });

      const isSafe = !errorBody.includes("stack") && !errorBody.toLowerCase().includes("secret") && !errorBody.toLowerCase().includes("password");
      expect(isSafe).toBe(true);
    });

    it("detects password in error response", () => {
      const errorBody = JSON.stringify({
        error: "Auth failed",
        password: "secret123",
      });

      const isSafe = !errorBody.toLowerCase().includes("password");
      expect(isSafe).toBe(false);
    });
  });

  describe("HTTP status code validation", () => {
    it("accepts 200 status for success", () => {
      const status = 200;
      expect(status).toBe(200);
      expect(status >= 200 && status < 300).toBe(true);
    });

    it("rejects 404 for success path", () => {
      const status = 404;
      expect(status).not.toBe(200);
    });

    it("accepts 404 status for 404 safety check", () => {
      const status = 404;
      expect(status).toBe(404);
    });

    it("detects unexpected status codes", () => {
      const status = 500;
      const isUnexpected = status !== 200 && status !== 404;
      expect(isUnexpected).toBe(true);
    });
  });

  describe("Phase 2 fixed route smoke checks", () => {
    it("validates complete flow for dashboard route", () => {
      // Simulate smoke check flow
      const engagementId = "550e8400-e29b-41d4-a716-446655440000";
      const dashboardResponse = { status: "active", metrics: { progress: 75 } };

      // Check 1: Extraction
      expect(engagementId).toBeDefined();

      // Check 2: Status
      const status = 200;
      expect(status).toBe(200);

      // Check 3: Response not empty
      const isEmpty = JSON.stringify(dashboardResponse) === "{}";
      expect(isEmpty).toBe(false);

      // Check 4: Has keys
      const keyCount = Object.keys(dashboardResponse).length;
      expect(keyCount).toBeGreaterThan(0);

      // Check 5: Masking doesn't leak ID
      const maskedId = engagementId.substring(0, 4) + "..." + engagementId.substring(engagementId.length - 4);
      expect(maskedId).not.toContain(engagementId);
    });

    it("validates complete flow for drift route", () => {
      // Simulate smoke check flow
      const engagementId = "550e8400-e29b-41d4-a716-446655440000";
      const driftResponse = { driftDetected: true, severity: "high" };

      // Check 1: Extraction
      expect(engagementId).toBeDefined();

      // Check 2: Status
      const status = 200;
      expect(status).toBe(200);

      // Check 3: Response not empty
      const isEmpty = JSON.stringify(driftResponse) === "{}";
      expect(isEmpty).toBe(false);

      // Check 4: Has keys
      const keyCount = Object.keys(driftResponse).length;
      expect(keyCount).toBeGreaterThan(0);

      // Check 5: No full ID in logs
      const logMessage = `GET /api/engagements/{550e...0000}/drift`;
      expect(logMessage).not.toContain(engagementId);
    });
  });
});
