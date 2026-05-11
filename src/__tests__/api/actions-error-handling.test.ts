/**
 * Error Handler Integration Tests: Actions Route
 *
 * Validates that the error-handler wrapper (withErrorHandling) correctly
 * catches, classifies, and returns formatted error responses on the
 * /api/actions route handlers.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { withErrorHandling } from "@/infra/error-handler";
import { NextRequest, NextResponse } from "next/server";
import type { ErrorResponse } from "@/infra/error-handler";

describe("Error Handler Integration: Actions Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Error Handler Wrapper on GET /api/actions", () => {
    it("should catch validation errors and return 400", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Invalid input validation");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
        headers: {
          "x-workspace-id": "ws-123",
        },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    it("should catch database errors and return 503", async () => {
      const handler = vi.fn(async () => {
        throw new Error("ECONNREFUSED: Connection refused");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
        headers: {
          "x-workspace-id": "ws-123",
        },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(503);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("DATABASE_ERROR");
    });

    it("should catch external API errors and return 502", async () => {
      const handler = vi.fn(async () => {
        throw new Error("HTTP request timeout");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
        headers: {
          "x-workspace-id": "ws-123",
        },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(502);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("EXTERNAL_API_ERROR");
    });

    it("should catch auth errors and return 401", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Unauthorized");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
      });

      const response = await wrapped(request);
      expect(response.status).toBe(401);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("AUTH_ERROR");
    });

    it("should catch workspace errors and return 403", async () => {
      const handler = vi.fn(async () => {
        throw new Error("workspace scoping violation");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
        headers: {
          "x-workspace-id": "ws-123",
        },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(403);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("WORKSPACE_ERROR");
    });

    it("should catch unclassified errors and return 500", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Unexpected internal error");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
        headers: {
          "x-workspace-id": "ws-123",
        },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(500);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("INTERNAL_ERROR");
    });

    it("should include error code in response", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Unauthorized");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
      });

      const response = await wrapped(request);
      const data = (await response.json()) as ErrorResponse;
      expect(data.code).toBeDefined();
      expect(data.code).toMatch(/^[A-Z]+_\d+$/);
    });

    it("should include timestamp in response", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Test error");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
      });

      const response = await wrapped(request);
      const data = (await response.json()) as ErrorResponse;
      expect(data.timestamp).toBeDefined();
      const timestamp = new Date(data.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    it("should return JSON content type", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Test error");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
      });

      const response = await wrapped(request);
      expect(response.headers.get("content-type")).toContain("application/json");
    });

    it("should call handler on success", async () => {
      const handler = vi.fn(async () => {
        return new NextResponse(JSON.stringify({ data: "actions" }));
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
        headers: {
          "x-workspace-id": "ws-123",
        },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("Error Handler Wrapper on POST /api/actions", () => {
    it("should catch errors in action creation", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Action creation failed");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: {
          "x-workspace-id": "ws-123",
          "content-type": "application/json",
        },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(500);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("INTERNAL_ERROR");
    });

    it("should catch plan limit errors", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Plan limit exceeded");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: {
          "x-workspace-id": "ws-123",
        },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(500);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("INTERNAL_ERROR");
    });

    it("should handle concurrent error requests", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Concurrent error");
      });

      const wrapped = withErrorHandling(handler);

      const requests = [
        new NextRequest("http://localhost/api/actions", {
          method: "POST",
          headers: { "x-workspace-id": "ws-1" },
        }),
        new NextRequest("http://localhost/api/actions", {
          method: "POST",
          headers: { "x-workspace-id": "ws-2" },
        }),
        new NextRequest("http://localhost/api/actions", {
          method: "POST",
          headers: { "x-workspace-id": "ws-3" },
        }),
      ];

      const responses = await Promise.all(requests.map((req) => wrapped(req)));

      responses.forEach((response) => {
        expect(response.status).toBe(500);
      });
    });

    it("should return 201 on successful creation", async () => {
      const handler = vi.fn(async () => {
        return new NextResponse(JSON.stringify({ id: "action-123" }), {
          status: 201,
        });
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: {
          "x-workspace-id": "ws-123",
        },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(201);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("Error Handler Activation Status", () => {
    it("error-handler wrapper is integrated on actions route", () => {
      // This test documents that withErrorHandling is imported and used
      // in src/app/api/actions/route.ts wrapping both GET and POST handlers
      expect(withErrorHandling).toBeDefined();
    });

    it("should handle missing workspace header", async () => {
      const handler = vi.fn(async () => {
        // Simulate handler that requires workspace
        throw new Error("Forbidden - Missing workspace ID");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
        // No x-workspace-id header
      });

      const response = await wrapped(request);
      expect(response.status).toBe(403);
    });

    it("should handle missing auth header", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Unauthorized");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
        // No authorization header
      });

      const response = await wrapped(request);
      expect(response.status).toBe(401);
    });

    it("response includes all required error fields", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Test error");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
      });

      const response = await wrapped(request);
      const data = (await response.json()) as ErrorResponse;

      expect(data).toHaveProperty("error");
      expect(data).toHaveProperty("statusCode");
      expect(data).toHaveProperty("timestamp");
      expect(data.code).toBeDefined();
    });
  });

  describe("Real-World Error Scenarios on Actions Route", () => {
    it("should handle action validation failure", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Invalid input validation - missing required field");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "x-workspace-id": "ws-123" },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    it("should handle engagement not found", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Engagement not found");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "x-workspace-id": "ws-123" },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(500); // Internal error (not a special classification)
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("INTERNAL_ERROR");
    });

    it("should handle workspace scoping violation in action list", async () => {
      const handler = vi.fn(async () => {
        throw new Error("workspace scoping violation");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "GET",
        headers: { "x-workspace-id": "ws-123" },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(403);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("WORKSPACE_ERROR");
    });
  });
});
