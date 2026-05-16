/**
 * Tests: In-Memory Idempotency Store
 *
 * Validates non-DB idempotency tracking without DATABASE_URL.
 * Tests concurrent request handling, TTL expiration, and duplicate detection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  InMemoryIdempotencyStore,
  getIdempotencyStore,
  resetIdempotencyStore,
  type IdempotencyRecord,
} from "@/infra/idempotency-store-memory";

describe("In-Memory Idempotency Store", () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    resetIdempotencyStore();
    store = getIdempotencyStore();
  });

  afterEach(() => {
    store.destroy();
  });

  describe("Basic Operations", () => {
    it("should create a pending record", async () => {
      const record = await store.create("key-1", "operation.create", "payload-hash");

      expect(record.key).toBe("key-1");
      expect(record.status).toBe("pending");
      expect(record.operationName).toBe("operation.create");
      expect(record.payload).toBe("payload-hash");
    });

    it("should retrieve created record", async () => {
      await store.create("key-1", "operation.create");
      const retrieved = await store.get("key-1");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.key).toBe("key-1");
      expect(retrieved?.status).toBe("pending");
    });

    it("should return null for nonexistent key", async () => {
      const retrieved = await store.get("nonexistent");
      expect(retrieved).toBeNull();
    });

    it("should update record to completed", async () => {
      await store.create("key-1", "operation.create");
      const response = { id: "action-123", status: "created" };

      const updated = await store.update("key-1", response, "completed");

      expect(updated.status).toBe("completed");
      expect(updated.response).toEqual(response);
      expect(updated.completedAt).toBeDefined();
    });

    it("should update record to failed", async () => {
      await store.create("key-1", "operation.create");
      const error = { error: "Validation failed" };

      const updated = await store.update("key-1", error, "failed");

      expect(updated.status).toBe("failed");
      expect(updated.response).toEqual(error);
    });

    it("should delete record", async () => {
      await store.create("key-1", "operation.create");
      expect(await store.get("key-1")).not.toBeNull();

      await store.delete("key-1");
      expect(await store.get("key-1")).toBeNull();
    });

    it("should clear all records", async () => {
      await store.create("key-1", "operation.create");
      await store.create("key-2", "operation.create");

      expect(store.size()).toBe(2);

      await store.clear();

      expect(store.size()).toBe(0);
      expect(await store.get("key-1")).toBeNull();
      expect(await store.get("key-2")).toBeNull();
    });
  });

  describe("TTL and Expiration", () => {
    it("should respect custom TTL", async () => {
      const ttlMs = 100; // 100ms
      const record = await store.create("key-1", "operation", undefined, ttlMs);

      expect(record.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(record.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + ttlMs + 10);
    });

    it("should return null for expired record", async () => {
      const ttlMs = 50; // 50ms
      await store.create("key-1", "operation", undefined, ttlMs);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      const retrieved = await store.get("key-1");
      expect(retrieved).toBeNull();
    });

    it("should use default TTL if not specified", async () => {
      const record = await store.create("key-1", "operation");
      const expiresIn = record.expiresAt.getTime() - Date.now();

      // Default is 24 hours = 86,400,000 ms
      expect(expiresIn).toBeGreaterThan(24 * 60 * 60 * 1000 - 100);
      expect(expiresIn).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });
  });

  describe("Concurrent Request Handling", () => {
    it("should wait for pending request to complete", async () => {
      const key = "key-concurrent";
      await store.create(key, "operation");

      // Simulate concurrent request waiting
      const waitPromise = store.waitForCompletion(key, 1000);

      // Simulate main request completing
      setTimeout(() => {
        store.update(key, { id: "action-123" }, "completed");
      }, 50);

      const completed = await waitPromise;
      expect(completed.status).toBe("completed");
      expect(completed.response).toEqual({ id: "action-123" });
    });

    it("should handle multiple concurrent waiters", async () => {
      const key = "key-multi-waiter";
      await store.create(key, "operation");

      // Create multiple waiters
      const waiter1 = store.waitForCompletion(key);
      const waiter2 = store.waitForCompletion(key);
      const waiter3 = store.waitForCompletion(key);

      // Update after delay
      await new Promise((resolve) => setTimeout(resolve, 50));
      await store.update(key, { id: "result" }, "completed");

      const [r1, r2, r3] = await Promise.all([waiter1, waiter2, waiter3]);

      expect(r1.response).toEqual({ id: "result" });
      expect(r2.response).toEqual({ id: "result" });
      expect(r3.response).toEqual({ id: "result" });
    });

    it("should timeout waiting for slow request", async () => {
      const key = "key-slow";
      await store.create(key, "operation");

      const waitPromise = store.waitForCompletion(key, 50);

      // Never complete the request
      await expect(waitPromise).rejects.toThrow(/timeout/i);
    });

    it("should return immediately if already completed", async () => {
      const key = "key-completed";
      await store.create(key, "operation");
      await store.update(key, { id: "result" }, "completed");

      const start = Date.now();
      const result = await store.waitForCompletion(key);
      const elapsed = Date.now() - start;

      expect(result.status).toBe("completed");
      expect(elapsed).toBeLessThan(50); // Should be nearly instant
    });
  });

  describe("Payload Validation", () => {
    it("should track payload hash", async () => {
      const record = await store.create("key-1", "operation", "hash-abc123");

      expect(record.payload).toBe("hash-abc123");
    });

    it("should allow reuse with same payload", async () => {
      const key = "key-1";
      const payload = "hash-same";

      const record1 = await store.create(key, "operation", payload);
      expect(record1.payload).toBe(payload);

      // In real usage, validation happens at middleware level
      // Store just tracks the hash
      const retrieved = await store.get(key);
      expect(retrieved?.payload).toBe(payload);
    });

    it("should track optional payload", async () => {
      const record1 = await store.create("key-1", "operation");
      expect(record1.payload).toBeUndefined();

      const record2 = await store.create("key-2", "operation", "hash");
      expect(record2.payload).toBe("hash");
    });
  });

  describe("Record Timestamps", () => {
    it("should set creation timestamp", async () => {
      const before = new Date();
      const record = await store.create("key-1", "operation");
      const after = new Date();

      expect(record.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(record.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should set completion timestamp on update", async () => {
      const key = "key-1";
      await store.create(key, "operation");

      const before = new Date();
      await store.update(key, { id: "result" });
      const after = new Date();

      const updated = await store.get(key);
      expect(updated?.completedAt?.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(updated?.completedAt?.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should not have completion timestamp on pending", async () => {
      const record = await store.create("key-1", "operation");

      expect(record.completedAt).toBeUndefined();
    });
  });

  describe("Store Management", () => {
    it("should report store size", async () => {
      expect(store.size()).toBe(0);

      await store.create("key-1", "operation");
      expect(store.size()).toBe(1);

      await store.create("key-2", "operation");
      expect(store.size()).toBe(2);

      await store.delete("key-1");
      expect(store.size()).toBe(1);
    });

    it("should clean up expired records periodically", async () => {
      // Create expired record
      const ttlMs = 50;
      await store.create("key-1", "operation", undefined, ttlMs);
      expect(store.size()).toBe(1);

      // Wait for expiration and cleanup
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Create new record to trigger size check
      await store.create("key-2", "operation");

      // Old record should be cleaned up
      expect(await store.get("key-1")).toBeNull();
      expect(store.size()).toBeLessThanOrEqual(1);
    });

    it("should allow destroy and cleanup", () => {
      store.destroy();

      // Should not throw after destroy
      expect(() => {
        store.clear();
      }).not.toThrow();
    });
  });

  describe("Singleton Pattern", () => {
    it("should return same instance on multiple calls", () => {
      const store1 = getIdempotencyStore();
      const store2 = getIdempotencyStore();

      expect(store1).toBe(store2);
    });

    it("should reset singleton on resetIdempotencyStore()", async () => {
      const store1 = getIdempotencyStore();
      await store1.create("key-1", "operation");
      expect(store1.size()).toBe(1);

      resetIdempotencyStore();

      const store2 = getIdempotencyStore();
      expect(store2.size()).toBe(0);
      expect(store1).not.toBe(store2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty operation name", async () => {
      const record = await store.create("key-1", "");
      expect(record.operationName).toBe("");
    });

    it("should handle very long idempotency key", async () => {
      const longKey = "x".repeat(1000);
      const record = await store.create(longKey, "operation");

      expect(record.key).toBe(longKey);
      expect(await store.get(longKey)).not.toBeNull();
    });

    it("should handle complex response objects", async () => {
      const response = {
        id: "123",
        nested: {
          deep: {
            value: "test",
            array: [1, 2, 3],
          },
        },
        nullable: null,
      };

      await store.create("key-1", "operation");
      const updated = await store.update("key-1", response);

      expect(updated.response).toEqual(response);
    });

    it("should throw error when updating nonexistent record", async () => {
      await expect(store.update("nonexistent", { id: "1" })).rejects.toThrow(
        "Idempotency record not found"
      );
    });

    it("should throw error when waiting for nonexistent record", async () => {
      await expect(store.waitForCompletion("nonexistent")).rejects.toThrow(
        "Idempotency record not found"
      );
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle action creation workflow", async () => {
      const idempotencyKey = "action-create-123";
      const payload = "hash-abc123";

      // Create pending record
      await store.create(idempotencyKey, "action.create", payload);

      // Simulate processing delay
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Complete with response
      const response = { id: "action-123", status: "created", dueDate: "2026-05-15" };
      const updated = await store.update(idempotencyKey, response, "completed");

      expect(updated.status).toBe("completed");
      expect(updated.response).toEqual(response);

      // Retry with same key returns cached response
      const cached = await store.get(idempotencyKey);
      expect(cached?.response).toEqual(response);
    });

    it("should handle concurrent duplicate submission", async () => {
      const idempotencyKey = "concurrent-create";

      // First request creates record
      await store.create(idempotencyKey, "operation");

      // Second request (concurrent) waits
      const waitPromise = store.waitForCompletion(idempotencyKey);

      // First request completes
      setTimeout(() => {
        store.update(idempotencyKey, { id: "result-1" }, "completed");
      }, 20);

      // Both should get same result
      const result1 = await waitPromise;
      const result2 = await store.get(idempotencyKey);

      expect(result1.response).toEqual({ id: "result-1" });
      expect(result2?.response).toEqual({ id: "result-1" });
    });

    it("should expire old action creation records", async () => {
      const ttlMs = 50; // 50ms for testing

      // Create record
      const record = await store.create("old-action", "action.create", undefined, ttlMs);
      expect(record.status).toBe("pending");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should return null
      const expired = await store.get("old-action");
      expect(expired).toBeNull();
    });
  });
});
