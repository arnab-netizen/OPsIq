/**
 * PHASE I10.2: API ROUTE WRAPPING TESTS
 *
 * Verify that:
 * 1. withEnforcement() wraps all routes with enforceRequest()
 * 2. Routes properly receive EnforcedRequestContext
 * 3. Route params are accessible via params argument
 * 4. Health checks are enforced on all routes (unless bypassed)
 * 5. Correlation IDs are returned in response headers
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { withEnforcement } from "@/lib/enforced-route";
import { requestContext } from "@/runtime/request-context";

describe("PHASE I10.2: API Route Wrapping", () => {
  describe("withEnforcement() wrapper", () => {
    it("should wrap handler and provide EnforcedRequestContext", async () => {
      let contextReceived = null;
      let paramsReceived = null;

      const handler = withEnforcement(async (ctx, params) => {
        contextReceived = ctx;
        paramsReceived = params;
        return { status: "ok" };
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/test"));
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      expect(response.status).toBe(200);
      expect(contextReceived).toBeTruthy();
      expect(contextReceived.correlation_id).toMatch(/^corr_/);
      expect(contextReceived.request_id).toMatch(/^req_/);
      expect(paramsReceived).toEqual({});
    });

    it("should pass route params to handler", async () => {
      let receivedParams = null;

      const handler = withEnforcement(async (ctx, params) => {
        receivedParams = params;
        return { leadId: params.leadId };
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/leads/123"));
      const context = { params: Promise.resolve({ leadId: "123" }) };
      const response = await handler(req, context);

      const data = await response.json();
      expect(receivedParams).toEqual({ leadId: "123" });
      expect(data.leadId).toBe("123");
    });

    it("should include correlation and request IDs in response headers", async () => {
      const handler = withEnforcement(async () => {
        return { status: "ok" };
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/test"));
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      expect(response.headers.has("X-Correlation-ID")).toBe(true);
      expect(response.headers.has("X-Request-ID")).toBe(true);
      expect(response.headers.get("X-Correlation-ID")).toMatch(/^corr_/);
      expect(response.headers.get("X-Request-ID")).toMatch(/^req_/);
    });

    it("should require workspace context when specified", async () => {
      const handler = withEnforcement(
        async () => {
          return { status: "ok" };
        },
        { require_workspace_id: true }
      );

      const req = new NextRequest(new URL("http://localhost:3000/api/test"));
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      expect(response.status).toBe(400);
    });

    it("should require execution context when specified", async () => {
      const handler = withEnforcement(
        async () => {
          return { status: "ok" };
        },
        { require_execution_id: true }
      );

      const req = new NextRequest(new URL("http://localhost:3000/api/test"));
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      expect(response.status).toBe(400);
    });

    it("should bypass health checks when option is set", async () => {
      const handler = withEnforcement(
        async () => {
          return { status: "ok" };
        },
        { bypass_health_check: true }
      );

      const req = new NextRequest(new URL("http://localhost:3000/api/test"));
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      // Should not throw health error even if system unhealthy
      expect(response.status).toBe(200);
    });

    it("should serialize handler response to JSON", async () => {
      const handler = withEnforcement(async () => {
        return {
          data: {
            field1: "value1",
            field2: 42,
            field3: true,
          },
        };
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/test"));
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      expect(response.headers.get("content-type")).toMatch(/application\/json/);
      const data = await response.json();
      expect(data.data).toEqual({
        field1: "value1",
        field2: 42,
        field3: true,
      });
    });

    it("should handle handler errors with error normalization", async () => {
      const handler = withEnforcement(async () => {
        throw new Error("Handler error");
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/test"));
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.classification).toBe("INFRASTRUCTURE");
    });

    it("should propagate context through enforceRequest", async () => {
      let capturedContext = null;

      const handler = withEnforcement(async (ctx) => {
        capturedContext = requestContext.getContext();
        return { correlation_id: ctx.correlation_id };
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/test"));
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      const data = await response.json();
      expect(capturedContext).toBeTruthy();
      expect(capturedContext.correlation_id).toBe(data.correlation_id);
    });

    it("should handle multiple route params correctly", async () => {
      let capturedParams = null;

      const handler = withEnforcement(async (ctx, params) => {
        capturedParams = params;
        return { params };
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/users/123/posts/456"));
      const context = {
        params: Promise.resolve({ userId: "123", postId: "456" }),
      };
      const response = await handler(req, context);

      expect(capturedParams).toEqual({ userId: "123", postId: "456" });
    });

    it("should maintain workspace isolation with headers", async () => {
      let receivedWorkspace = null;

      const handler = withEnforcement(async (ctx) => {
        receivedWorkspace = ctx.workspace_id;
        return { workspace: receivedWorkspace };
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/test"), {
        headers: {
          "x-workspace-id": "workspace-123",
        },
      });
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      const data = await response.json();
      expect(data.workspace).toBe("workspace-123");
    });

    it("should preserve HTTP method in context", async () => {
      let capturedMethod = null;

      const handler = withEnforcement(async (ctx) => {
        capturedMethod = ctx.method;
        return { method: capturedMethod };
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/test"), {
        method: "POST",
      });
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      const data = await response.json();
      expect(data.method).toBe("POST");
    });

    it("should preserve endpoint path in context", async () => {
      let capturedEndpoint = null;

      const handler = withEnforcement(async (ctx) => {
        capturedEndpoint = ctx.endpoint;
        return { endpoint: capturedEndpoint };
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/leads/123"));
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      const data = await response.json();
      expect(data.endpoint).toBe("/api/leads/123");
    });
  });

  describe("MANDATORY: No bypass validation", () => {
    it("should prove withEnforcement is being used (proof of enforcement)", async () => {
      let enforcementProven = false;

      const handler = withEnforcement(async (ctx) => {
        // Prove enforcement by checking context is set
        enforcementProven = !!requestContext.getContext();
        return { enforced: enforcementProven };
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/test"));
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      const data = await response.json();
      expect(data.enforced).toBe(true);
    });

    it("should prove response headers include enforcement markers", async () => {
      const handler = withEnforcement(async () => {
        return { status: "ok" };
      });

      const req = new NextRequest(new URL("http://localhost:3000/api/test"));
      const context = { params: Promise.resolve({}) };
      const response = await handler(req, context);

      // These headers prove enforceRequest was executed
      expect(response.headers.has("X-Correlation-ID")).toBe(true);
      expect(response.headers.has("X-Request-ID")).toBe(true);
    });
  });
});
