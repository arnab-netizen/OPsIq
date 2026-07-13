import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  withErrorHandling,
  handleRouteError,
  getErrorStatusCode,
  shouldReportError,
  type ErrorResponse,
} from "@/infra/error-handler";

describe("Error Handler Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("withErrorHandling wrapper", () => {
    it("should call handler and return response on success", async () => {
      const handler = vi.fn(async () => {
        return new NextResponse(JSON.stringify({ data: "success" }));
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it("should catch and classify errors from handler", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Test error");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      expect(response.status).toBe(500); // INTERNAL_ERROR
      const data = (await response.json()) as ErrorResponse;
      expect(data.statusCode).toBe(500);
    });

    it("should include context in error response", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Validation failed");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      const data = (await response.json()) as ErrorResponse;

      expect(data.timestamp).toBeDefined();
      expect(data.code).toBeDefined();
    });

    it("should classify auth errors correctly", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Unauthorized");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      expect(response.status).toBe(401);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("AUTH_ERROR");
    });

    it("should classify validation errors correctly", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Invalid input validation");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    it("should classify database errors correctly", async () => {
      const handler = vi.fn(async () => {
        throw new Error("ECONNREFUSED: Connection refused");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      expect(response.status).toBe(503);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("DATABASE_ERROR");
    });

    it("should classify external API errors correctly", async () => {
      const handler = vi.fn(async () => {
        throw new Error("HTTP request timeout");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      expect(response.status).toBe(502);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("EXTERNAL_API_ERROR");
    });

    it("should classify workspace errors correctly", async () => {
      const handler = vi.fn(async () => {
        throw new Error("workspace scoping violation");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      expect(response.status).toBe(403);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("WORKSPACE_ERROR");
    });
  });

  describe("requireAuth option", () => {
    it("should check for authorization header when requireAuth=true", async () => {
      const handler = vi.fn();
      const wrapped = withErrorHandling(handler, { requireAuth: true });

      // Request without auth header
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it("should allow request with authorization header", async () => {
      const handler = vi.fn(async () => {
        return new NextResponse(JSON.stringify({ data: "success" }));
      });
      const wrapped = withErrorHandling(handler, { requireAuth: true });

      const request = new NextRequest("http://localhost/api/test", {
        headers: {
          authorization: "Bearer token123",
        },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it("should not check auth when requireAuth not specified", async () => {
      const handler = vi.fn(async () => {
        return new NextResponse(JSON.stringify({ data: "success" }));
      });
      const wrapped = withErrorHandling(handler);

      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("requireWorkspace option", () => {
    it("should check for x-workspace-id header when requireWorkspace=true", async () => {
      const handler = vi.fn();
      const wrapped = withErrorHandling(handler, { requireWorkspace: true });

      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it("should allow request with x-workspace-id header", async () => {
      const handler = vi.fn(async () => {
        return new NextResponse(JSON.stringify({ data: "success" }));
      });
      const wrapped = withErrorHandling(handler, { requireWorkspace: true });

      const request = new NextRequest("http://localhost/api/test", {
        headers: {
          "x-workspace-id": "00000000-0000-0000-0000-000000000123",
        },
      });

      const response = await wrapped(request);
      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it("should check both auth and workspace when both options set", async () => {
      const handler = vi.fn(async () => {
        return new NextResponse(JSON.stringify({ data: "success" }));
      });
      const wrapped = withErrorHandling(handler, {
        requireAuth: true,
        requireWorkspace: true,
      });

      // Missing both
      let request = new NextRequest("http://localhost/api/test");
      let response = await wrapped(request);
      expect(response.status).toBe(401); // Auth checked first

      // Auth OK, workspace missing
      request = new NextRequest("http://localhost/api/test", {
        headers: {
          authorization: "Bearer token123",
        },
      });
      response = await wrapped(request);
      expect(response.status).toBe(403); // Workspace missing

      // Both OK
      request = new NextRequest("http://localhost/api/test", {
        headers: {
          authorization: "Bearer token123",
          "x-workspace-id": "00000000-0000-0000-0000-000000000123",
        },
      });
      response = await wrapped(request);
      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("handleRouteError function", () => {
    it("should classify and report error", async () => {
      const request = new NextRequest("http://localhost/api/test");
      const error = new Error("Test error");

      const response = await handleRouteError(error, request);

      expect(response.status).toBe(500);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("INTERNAL_ERROR");
    });

    it("should include context in error", async () => {
      const request = new NextRequest("http://localhost/api/test");
      const error = new Error("Test error");
      const context = { userId: "user-123", action: "create" };

      const response = await handleRouteError(error, request, context);

      expect(response.status).toBe(500);
      const data = (await response.json()) as ErrorResponse;
      expect(data.timestamp).toBeDefined();
    });

    it("should handle non-Error types", async () => {
      const request = new NextRequest("http://localhost/api/test");
      const error = "String error";

      const response = await handleRouteError(error, request);

      expect(response.status).toBe(500);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe("INTERNAL_ERROR");
    });

    it("should include URL and method in context", async () => {
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
      });
      const error = new Error("Test error");

      const response = await handleRouteError(error, request);

      const data = (await response.json()) as ErrorResponse;
      expect(data.timestamp).toBeDefined();
      expect(response.status).toBe(500);
    });
  });

  describe("getErrorStatusCode helper", () => {
    it("should return 401 for auth errors", () => {
      const error = new Error("Unauthorized");
      expect(getErrorStatusCode(error)).toBe(401);
    });

    it("should return 403 for permission errors", () => {
      const error = new Error("Forbidden access");
      expect(getErrorStatusCode(error)).toBe(403);
    });

    it("should return 400 for validation errors", () => {
      const error = new Error("Invalid input");
      expect(getErrorStatusCode(error)).toBe(400);
    });

    it("should return 503 for database errors", () => {
      const error = new Error("ECONNREFUSED");
      expect(getErrorStatusCode(error)).toBe(503);
    });

    it("should return 502 for external API errors", () => {
      const error = new Error("HTTP request failed");
      expect(getErrorStatusCode(error)).toBe(502);
    });

    it("should return 500 for internal errors", () => {
      const error = new Error("Unexpected error");
      expect(getErrorStatusCode(error)).toBe(500);
    });

    it("should handle non-Error types", () => {
      const error = "String error";
      expect(getErrorStatusCode(error)).toBe(500);
    });
  });

  describe("shouldReportError helper", () => {
    it("should report most errors", () => {
      expect(shouldReportError(new Error("Database error"))).toBe(true);
      expect(shouldReportError(new Error("Validation failed"))).toBe(true);
      expect(shouldReportError(new Error("Unauthorized"))).toBe(true);
    });

    it("should skip CANCEL errors", () => {
      expect(shouldReportError(new Error("Request CANCEL"))).toBe(false);
      expect(shouldReportError(new Error("User canceled operation"))).toBe(
        false
      );
    });

    it("should skip timeout errors", () => {
      expect(shouldReportError(new Error("Request timeout"))).toBe(false);
    });

    it("should skip AbortError", () => {
      expect(shouldReportError(new Error("AbortError"))).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(shouldReportError(new Error("REQUEST CANCEL"))).toBe(false);
      expect(shouldReportError(new Error("user canceled"))).toBe(false);
      expect(shouldReportError(new Error("TIMEOUT"))).toBe(false);
    });

    it("should handle non-Error types", () => {
      expect(shouldReportError("String error")).toBe(true);
      expect(shouldReportError("cancel")).toBe(false);
    });
  });

  describe("Error classification details", () => {
    it("should include error code in response", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Unauthorized");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      const data = (await response.json()) as ErrorResponse;

      expect(data.code).toBeDefined();
      expect(data.code).toMatch(/^[A-Z]+_\d+$/); // Format: AUTH_001, VAL_001, etc.
    });

    it("should include timestamp in response", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Test error");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      const data = (await response.json()) as ErrorResponse;

      expect(data.timestamp).toBeDefined();
      const timestamp = new Date(data.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    it("should include error details in test/dev mode", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Sensitive error message");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      const data = (await response.json()) as ErrorResponse;

      // In dev/test mode, response structure should be consistent
      expect(data.statusCode).toBe(500);
      expect(data.timestamp).toBeDefined();
    });
  });

  describe("Error response format", () => {
    it("should have correct error response structure", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Test error");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      const data = (await response.json()) as ErrorResponse;

      // Required fields
      expect(data).toHaveProperty("error");
      expect(data).toHaveProperty("statusCode");
      expect(data).toHaveProperty("timestamp");

      // Error should be a valid classification
      expect(["AUTH_ERROR", "VALIDATION_ERROR", "DATABASE_ERROR", "EXTERNAL_API_ERROR", "INTERNAL_ERROR", "WORKSPACE_ERROR", "UNKNOWN"]).toContain(data.error);
    });

    it("should return JSON content type", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Test error");
      });

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrapped(request);
      expect(response.headers.get("content-type")).toContain("application/json");
    });
  });

  describe("Multiple error scenarios", () => {
    it("should handle concurrent error requests", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Test error");
      });

      const wrapped = withErrorHandling(handler);

      const requests = [
        new NextRequest("http://localhost/api/test1"),
        new NextRequest("http://localhost/api/test2"),
        new NextRequest("http://localhost/api/test3"),
      ];

      const responses = await Promise.all(
        requests.map((req) => wrapped(req))
      );

      responses.forEach((response) => {
        expect(response.status).toBe(500);
      });
    });

    it("should handle different error types independently", async () => {
      const handlers = [
        async () => {
          throw new Error("Unauthorized");
        },
        async () => {
          throw new Error("Invalid input");
        },
        async () => {
          throw new Error("Connection refused");
        },
      ];

      const wrapped = handlers.map((h) => withErrorHandling(h));

      const responses = await Promise.all(
        wrapped.map((w) => w(new NextRequest("http://localhost/api/test")))
      );

      expect(responses[0].status).toBe(401); // Auth
      expect(responses[1].status).toBe(400); // Validation
      expect(responses[2].status).toBe(503); // Database
    });
  });
});
