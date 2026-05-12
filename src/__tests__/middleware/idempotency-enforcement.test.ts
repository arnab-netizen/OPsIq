/**
 * Tests: Generalized Idempotency Enforcement Middleware
 *
 * Validates idempotency enforcement on any route handler.
 * Tests request deduplication, payload validation, concurrent handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { withIdempotencyEnforcement, getIdempotencyKey } from "@/middleware/idempotency-enforcement";
import { resetIdempotencyStore } from "@/infra/idempotency-store-memory";

describe("Idempotency Enforcement Middleware", () => {
  beforeEach(() => {
    resetIdempotencyStore();
  });

  afterEach(() => {
    resetIdempotencyStore();
  });

  describe("Basic Request Deduplication", () => {
    it("should pass through request without Idempotency-Key", async () => {
      const handler = vi.fn(async (request: NextRequest) => {
        return NextResponse.json({ data: "success" });
      });

      const wrapped = withIdempotencyEnforcement(handler);
      const request = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        body: JSON.stringify({ title: "Test Action" }),
      });

      const response = await wrapped(request);

      expect(handler).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it("should cache response for duplicate request", async () => {
      const handler = vi.fn(async () => {
        return NextResponse.json({ id: "action-123", status: "created" });
      });

      const wrapped = withIdempotencyEnforcement(handler);

      // First request
      const request1 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "key-1" },
        body: JSON.stringify({ title: "Test Action" }),
      });

      const response1 = await wrapped(request1);
      const data1 = await response1.json();

      // Second request with same key
      const request2 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "key-1" },
        body: JSON.stringify({ title: "Test Action" }),
      });

      const response2 = await wrapped(request2);
      const data2 = await response2.json();

      // Handler called only once
      expect(handler).toHaveBeenCalledTimes(1);

      // Both return same response
      expect(data1).toEqual(data2);
      expect(response2.headers.get("x-idempotency-replayed")).toBe("true");
    });

    it("should reject different payload with same key", async () => {
      const handler = vi.fn(async () => {
        return NextResponse.json({ id: "action-123" });
      });

      const wrapped = withIdempotencyEnforcement(handler);

      // First request
      const request1 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "key-1" },
        body: JSON.stringify({ title: "Action 1" }),
      });

      await wrapped(request1);

      // Second request with same key but different body
      const request2 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "key-1" },
        body: JSON.stringify({ title: "Action 2" }),
      });

      const response2 = await wrapped(request2);

      expect(response2.status).toBe(400);
      const error = await response2.json();
      expect(error.error).toBe("IDEMPOTENCY_ERROR");
      expect(error.message).toContain("different request body");
    });
  });

  describe("Concurrent Request Handling", () => {
    it("should wait for pending request to complete", async () => {
      const handler = vi.fn(async () => {
        // Simulate processing delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        return NextResponse.json({ id: "action-123", status: "created" });
      });

      const wrapped = withIdempotencyEnforcement(handler);

      const request1 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "concurrent-1" },
        body: JSON.stringify({ title: "Test" }),
      });

      const request2 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "concurrent-1" },
        body: JSON.stringify({ title: "Test" }),
      });

      // Start both requests concurrently
      const promise1 = wrapped(request1);
      const promise2 = wrapped(request2);

      const [response1, response2] = await Promise.all([promise1, promise2]);
      const data1 = await response1.json();
      const data2 = await response2.json();

      // Handler called once, second request waits for first
      expect(handler).toHaveBeenCalledTimes(1);

      // Both get same response
      expect(data1).toEqual(data2);
    });

    it("should handle multiple concurrent requests", async () => {
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return NextResponse.json({ id: "action-123" });
      });

      const wrapped = withIdempotencyEnforcement(handler);

      // Create 5 concurrent requests with same key and same body
      const requests = Array.from({ length: 5 }, () =>
        new NextRequest("http://localhost/api/actions", {
          method: "POST",
          headers: { "Idempotency-Key": "multi-concurrent" },
          body: JSON.stringify({ title: "Same Body" }),
        })
      );

      const responses = await Promise.all(requests.map((req) => wrapped(req)));
      const results = await Promise.all(responses.map((r) => r.json()));

      // Handler called only once
      expect(handler).toHaveBeenCalledTimes(1);

      // All requests get same result
      results.forEach((result) => {
        expect(result.id).toBe("action-123");
      });
    });

    it("should timeout when waiting for pending request that never completes", { timeout: 5000 }, async () => {
      let handlerResolve: (() => void) | null = null;
      const handler = vi.fn(async () => {
        // Handler that can be resolved externally
        await new Promise<void>((resolve) => {
          handlerResolve = resolve;
        });
        return NextResponse.json({ id: "action" });
      });

      const wrapped = withIdempotencyEnforcement(handler, { timeoutMs: 100 });

      const request1 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "slow-key" },
        body: JSON.stringify({ title: "Test" }),
      });

      const request2 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "slow-key" },
        body: JSON.stringify({ title: "Test" }),
      });

      const promise1 = wrapped(request1);

      // Give first request time to start and create the record
      await new Promise((resolve) => setTimeout(resolve, 20));

      const promise2 = wrapped(request2);

      // Second request should timeout waiting for first after 100ms
      const response2 = await promise2;

      expect(response2.status).toBe(504); // Gateway Timeout
      const error = await response2.json();
      expect(error.error).toBe("IDEMPOTENCY_TIMEOUT");

      // Resolve first request to clean up
      if (handlerResolve) {
        (handlerResolve as () => void)();
      }
      await promise1.catch(() => {});
    });
  });

  describe("Workspace Scoping", () => {
    it("should scope key to workspace if provided", async () => {
      const handler = vi.fn(async () => {
        return NextResponse.json({ id: "action-1" });
      });

      const wrapped = withIdempotencyEnforcement(handler);

      // Request in workspace-1
      const request1 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: {
          "Idempotency-Key": "key-1",
          "x-workspace-id": "ws-1",
        },
        body: JSON.stringify({ title: "Test" }),
      });

      await wrapped(request1);

      // Request in workspace-2 with same key
      const request2 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: {
          "Idempotency-Key": "key-1",
          "x-workspace-id": "ws-2",
        },
        body: JSON.stringify({ title: "Test" }),
      });

      await wrapped(request2);

      // Handler called twice (different workspace scope)
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should require workspace ID if requireWorkspaceId option set", async () => {
      const handler = vi.fn(async () => {
        return NextResponse.json({ id: "action-1" });
      });

      const wrapped = withIdempotencyEnforcement(handler, { requireWorkspaceId: true });

      const request = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "key-1" },
        body: JSON.stringify({ title: "Test" }),
      });

      const response = await wrapped(request);

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain("x-workspace-id header required");
    });
  });

  describe("Response Caching", () => {
    it("should include idempotency headers in response", async () => {
      const handler = vi.fn(async () => {
        return NextResponse.json({ id: "action-1" });
      });

      const wrapped = withIdempotencyEnforcement(handler);

      const request = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "key-1" },
        body: JSON.stringify({ title: "Test" }),
      });

      const response = await wrapped(request);

      expect(response.headers.get("x-idempotency-key")).toBe("key-1");
      expect(response.headers.get("content-type")).toContain("application/json");
    });

    it("should mark replayed responses", async () => {
      const handler = vi.fn(async () => {
        return NextResponse.json({ id: "action-1" });
      });

      const wrapped = withIdempotencyEnforcement(handler);

      // First request
      const request1 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "replay-key" },
        body: JSON.stringify({ title: "Test" }),
      });

      const response1 = await wrapped(request1);
      expect(response1.headers.get("x-idempotency-replayed")).toBeNull();

      // Duplicate request
      const request2 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "replay-key" },
        body: JSON.stringify({ title: "Test" }),
      });

      const response2 = await wrapped(request2);
      expect(response2.headers.get("x-idempotency-replayed")).toBe("true");
    });

    it("should cache complex response objects", async () => {
      const complexResponse = {
        id: "action-123",
        status: "created",
        metadata: {
          createdAt: "2026-05-11T00:00:00Z",
          tags: ["urgent", "test"],
        },
      };

      const handler = vi.fn(async () => {
        return NextResponse.json(complexResponse);
      });

      const wrapped = withIdempotencyEnforcement(handler);

      // First request
      const request1 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "complex-key" },
        body: JSON.stringify({ title: "Test" }),
      });

      const response1 = await wrapped(request1);
      const data1 = await response1.json();

      // Duplicate request
      const request2 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "complex-key" },
        body: JSON.stringify({ title: "Test" }),
      });

      const response2 = await wrapped(request2);
      const data2 = await response2.json();

      expect(data1).toEqual(complexResponse);
      expect(data2).toEqual(complexResponse);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid JSON body gracefully", async () => {
      const handler = vi.fn(async () => {
        return NextResponse.json({ id: "action-1" });
      });

      const wrapped = withIdempotencyEnforcement(handler);

      const request = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "key-1" },
        body: "invalid json {[",
      });

      const response = await wrapped(request);

      // Should still process without error
      expect(response.status).toBe(200);
    });

    it("should catch handler errors", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Handler failed");
      });

      const wrapped = withIdempotencyEnforcement(handler);

      const request = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: { "Idempotency-Key": "error-key" },
        body: JSON.stringify({ title: "Test" }),
      });

      await expect(wrapped(request)).rejects.toThrow("Handler failed");
    });
  });

  describe("Helper Functions", () => {
    it("should extract idempotency key from request", () => {
      const request = new NextRequest("http://localhost/api/actions", {
        headers: { "Idempotency-Key": "test-key-123" },
      });

      const key = getIdempotencyKey(request);
      expect(key).toBe("test-key-123");
    });

    it("should return null if no idempotency key", () => {
      const request = new NextRequest("http://localhost/api/actions");

      const key = getIdempotencyKey(request);
      expect(key).toBeNull();
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle action creation with idempotency", async () => {
      let callCount = 0;
      const handler = vi.fn(async () => {
        callCount++;
        return NextResponse.json(
          {
            id: `action-${callCount}`,
            status: "created",
          },
          { status: 201 }
        );
      });

      const wrapped = withIdempotencyEnforcement(handler);

      // Create action
      const request = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: {
          "Idempotency-Key": "create-action-1",
          "x-workspace-id": "ws-123",
        },
        body: JSON.stringify({ title: "New Action" }),
      });

      const response = await wrapped(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.status).toBe("created");
      expect(data.id).toBe("action-1");

      // Duplicate submission returns same action
      const request2 = new NextRequest("http://localhost/api/actions", {
        method: "POST",
        headers: {
          "Idempotency-Key": "create-action-1",
          "x-workspace-id": "ws-123",
        },
        body: JSON.stringify({ title: "New Action" }),
      });

      const response2 = await wrapped(request2);
      const data2 = await response2.json();

      expect(data2.id).toBe("action-1");
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should prevent double charges in payment scenario", async () => {
      let chargeCount = 0;

      const handler = vi.fn(async () => {
        chargeCount++;
        return NextResponse.json({
          chargeId: `charge-${chargeCount}`,
          amount: 9999,
          status: "succeeded",
        });
      });

      const wrapped = withIdempotencyEnforcement(handler);

      // User submits payment twice (network glitch)
      const request1 = new NextRequest("http://localhost/api/charges", {
        method: "POST",
        headers: { "Idempotency-Key": "payment-1" },
        body: JSON.stringify({ amount: 9999 }),
      });

      const request2 = new NextRequest("http://localhost/api/charges", {
        method: "POST",
        headers: { "Idempotency-Key": "payment-1" },
        body: JSON.stringify({ amount: 9999 }),
      });

      const response1 = await wrapped(request1);
      const response2 = await wrapped(request2);

      const data1 = await response1.json();
      const data2 = await response2.json();

      // Only charged once
      expect(chargeCount).toBe(1);
      // Both responses have same charge ID
      expect(data1.chargeId).toBe(data2.chargeId);
    });
  });
});
