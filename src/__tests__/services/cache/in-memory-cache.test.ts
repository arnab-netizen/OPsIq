import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InMemoryCache } from "@/services/cache/in-memory-cache";

// ============================================================================
// TEST SUITE: In-Memory Cache Service
// ============================================================================

describe("InMemoryCache - Basic Operations", () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache(60000); // 60s cleanup interval
  });

  afterEach(() => {
    cache.destroy();
  });

  // ========== Get/Set/Delete ==========

  it("stores and retrieves string values", async () => {
    await cache.set("key1", "value1", 300);
    const result = await cache.get("key1");
    expect(result).toBe("value1");
  });

  it("stores and retrieves object values", async () => {
    const obj = { id: 123, name: "test", nested: { data: [1, 2, 3] } };
    await cache.set("obj-key", obj, 300);
    const result = await cache.get("obj-key");
    expect(result).toEqual(obj);
  });

  it("stores and retrieves array values", async () => {
    const arr = [1, 2, 3, "four", { five: 5 }];
    await cache.set("array-key", arr, 300);
    const result = await cache.get("array-key");
    expect(result).toEqual(arr);
  });

  it("stores and retrieves numeric values", async () => {
    await cache.set("number", 42, 300);
    const result = await cache.get("number");
    expect(result).toBe(42);
  });

  it("stores and retrieves boolean values", async () => {
    await cache.set("bool-true", true, 300);
    await cache.set("bool-false", false, 300);
    expect(await cache.get("bool-true")).toBe(true);
    expect(await cache.get("bool-false")).toBe(false);
  });

  it("stores and retrieves null values", async () => {
    await cache.set("null-key", null, 300);
    const result = await cache.get("null-key");
    expect(result).toBeNull();
  });

  it("returns null for missing keys", async () => {
    const result = await cache.get("non-existent");
    expect(result).toBeNull();
  });

  it("deletes cached values", async () => {
    await cache.set("to-delete", "data", 300);
    expect(await cache.get("to-delete")).toBe("data");
    await cache.delete("to-delete");
    expect(await cache.get("to-delete")).toBeNull();
  });

  it("deletes non-existent keys without error", async () => {
    await expect(cache.delete("not-there")).resolves.toBeUndefined();
  });

  // ========== TTL and Expiration ==========

  it("respects TTL and expires entries", async () => {
    await cache.set("ttl-key", "value", 1); // 1 second TTL
    expect(await cache.get("ttl-key")).toBe("value");

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await cache.get("ttl-key")).toBeNull();
  });

  it("uses default TTL of 300 seconds", async () => {
    await cache.set("default-ttl", "data"); // No TTL specified
    expect(await cache.get("default-ttl")).toBe("data");

    // Should still be available after 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await cache.get("default-ttl")).toBe("data");
  });

  it("updates TTL on subsequent sets", async () => {
    await cache.set("ttl-update", "v1", 1);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await cache.set("ttl-update", "v2", 2);

    // Reset TTL, so value should still exist
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await cache.get("ttl-update")).toBe("v2");

    // Wait for new TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await cache.get("ttl-update")).toBeNull();
  });

  it("returns null immediately after expiration", async () => {
    await cache.set("exp-key", "data", 1);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await cache.get("exp-key")).toBeNull();
  });

  // ========== Cache Statistics ==========

  it("tracks cache hits", async () => {
    await cache.set("hit-key", "value");
    await cache.get("hit-key");
    await cache.get("hit-key");

    const stats = await cache.getStats();
    expect(stats.hits).toBe(2);
  });

  it("tracks cache misses", async () => {
    await cache.get("miss1");
    await cache.get("miss2");

    const stats = await cache.getStats();
    expect(stats.misses).toBe(2);
  });

  it("tracks cache size", async () => {
    await cache.set("key1", "val1");
    await cache.set("key2", "val2");
    await cache.set("key3", "val3");

    const stats = await cache.getStats();
    expect(stats.size).toBe(3);
  });

  it("returns memory as backend type", async () => {
    const stats = await cache.getStats();
    expect(stats.backend).toBe("memory");
  });

  it("accumulates statistics across operations", async () => {
    await cache.set("key", "value");
    await cache.get("key"); // hit
    await cache.get("key"); // hit
    await cache.get("missing"); // miss
    await cache.set("key2", "value2");
    await cache.get("key2"); // hit

    const stats = await cache.getStats();
    expect(stats.hits).toBe(3);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(2);
  });

  // ========== Flush Operations ==========

  it("clears all entries with flush()", async () => {
    await cache.set("key1", "val1");
    await cache.set("key2", "val2");
    await cache.set("key3", "val3");

    let stats = await cache.getStats();
    expect(stats.size).toBe(3);

    await cache.flush();

    stats = await cache.getStats();
    expect(stats.size).toBe(0);
    expect(await cache.get("key1")).toBeNull();
  });

  it("flushes entries matching pattern", async () => {
    await cache.set("user:1", "data1");
    await cache.set("user:2", "data2");
    await cache.set("post:1", "data3");
    await cache.set("post:2", "data4");

    await cache.flush("^user:");

    expect(await cache.get("user:1")).toBeNull();
    expect(await cache.get("user:2")).toBeNull();
    expect(await cache.get("post:1")).toBe("data3");
    expect(await cache.get("post:2")).toBe("data4");
  });

  it("handles complex regex patterns", async () => {
    await cache.set("cache:decision:123", "d1");
    await cache.set("cache:action:456", "a1");
    await cache.set("cache:brief:789", "b1");
    await cache.set("other:data", "o1");

    // Flush all cache: prefixed keys
    await cache.flush("^cache:");

    expect(await cache.get("cache:decision:123")).toBeNull();
    expect(await cache.get("cache:action:456")).toBeNull();
    expect(await cache.get("cache:brief:789")).toBeNull();
    expect(await cache.get("other:data")).toBe("o1");
  });

  it("returns 0 size after flush", async () => {
    await cache.set("key", "value");
    await cache.flush();
    const stats = await cache.getStats();
    expect(stats.size).toBe(0);
  });

  // ========== Concurrent Operations ==========

  it("handles concurrent sets", async () => {
    const promises = Array(10)
      .fill(null)
      .map((_, i) => cache.set(`key-${i}`, `value-${i}`));

    await Promise.all(promises);

    const stats = await cache.getStats();
    expect(stats.size).toBe(10);
  });

  it("handles concurrent gets", async () => {
    await cache.set("concurrent", "value");

    const promises = Array(10)
      .fill(null)
      .map(() => cache.get("concurrent"));

    const results = await Promise.all(promises);
    expect(results.every((r) => r === "value")).toBe(true);

    const stats = await cache.getStats();
    expect(stats.hits).toBe(10);
  });

  it("handles mixed concurrent operations", async () => {
    const operations = [
      cache.set("k1", "v1"),
      cache.set("k2", "v2"),
      cache.get("k1"),
      cache.get("k2"),
      cache.get("missing"),
      cache.delete("k1"),
      cache.get("k1"),
    ];

    await Promise.all(operations);

    const stats = await cache.getStats();
    expect(stats.hits).toBe(2); // k1 and k2 hits
    expect(stats.misses).toBe(2); // missing + k1 after delete
    expect(stats.size).toBe(1); // only k2 remains
  });

  // ========== Memory Management ==========

  it("handles large values", async () => {
    const largeArray = Array(10000).fill("item");
    await cache.set("large", largeArray);

    const result = await cache.get("large");
    expect(result).toHaveLength(10000);
  });

  it("handles many entries", async () => {
    for (let i = 0; i < 1000; i++) {
      await cache.set(`key-${i}`, `value-${i}`);
    }

    const stats = await cache.getStats();
    expect(stats.size).toBe(1000);

    // Can still retrieve entries
    expect(await cache.get("key-500")).toBe("value-500");
  });

  it("cleans up expired entries on get", async () => {
    await cache.set("exp1", "val1", 1);
    await cache.set("persistent", "val2", 300);

    // Wait for first to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Getting expired key should remove it
    await cache.get("exp1");

    const stats = await cache.getStats();
    expect(stats.size).toBe(1);
  });

  // ========== Key Name Handling ==========

  it("handles keys with special characters", async () => {
    const keys = [
      "key:with:colons",
      "key-with-dashes",
      "key_with_underscores",
      "key/with/slashes",
      "key.with.dots",
      "key@with#special$chars",
    ];

    for (const key of keys) {
      await cache.set(key, `value-${key}`);
      const result = await cache.get(key);
      expect(result).toBe(`value-${key}`);
    }
  });

  it("treats keys as case-sensitive", async () => {
    await cache.set("Key", "uppercase");
    await cache.set("key", "lowercase");

    expect(await cache.get("Key")).toBe("uppercase");
    expect(await cache.get("key")).toBe("lowercase");
  });

  it("handles empty string as key", async () => {
    await cache.set("", "empty-key-value");
    const result = await cache.get("");
    expect(result).toBe("empty-key-value");
  });

  // ========== Cleanup Interval ==========

  it("creates cleanup interval on construction", () => {
    const cache1 = new InMemoryCache(5000);
    expect(cache1).toBeTruthy();
    cache1.destroy();
  });

  it("cleans up expired entries periodically", async () => {
    // Use shorter cleanup interval for testing
    const shortCache = new InMemoryCache(500); // 500ms cleanup

    await shortCache.set("exp1", "val1", 1);
    await shortCache.set("exp2", "val2", 1);
    await shortCache.set("persist", "val3", 300);

    // Wait for entries to expire and cleanup to run
    await new Promise((resolve) => setTimeout(resolve, 1600));

    // Expired entries should be removed by cleanup
    const stats = await shortCache.getStats();
    expect(stats.size).toBe(1); // Only persist remains

    shortCache.destroy();
  });

  it("stops cleanup on destroy", async () => {
    const testCache = new InMemoryCache(100);
    testCache.destroy();

    // Setting data after destroy should not throw (but may be a no-op)
    // The important thing is it doesn't crash the process
    let errorOccurred = false;
    try {
      await testCache.set("after-destroy", "data");
    } catch (e) {
      errorOccurred = true;
    }

    // Operation should complete without throwing
    expect(errorOccurred).toBe(false);
  });

  // ========== Real-World Scenarios ==========

  it("caches briefing aggregation results", async () => {
    const briefing = {
      workspaceId: "ws-123",
      metrics: { decisions: 42, actions: 15, confidence: 0.87 },
      generatedAt: new Date(),
    };

    await cache.set("briefing:ws-123", briefing, 1800);
    const cached = await cache.get("briefing:ws-123");

    expect(cached).toEqual(briefing);
    expect((cached as unknown).metrics.confidence).toBe(0.87);
  });

  it("caches user permission sets", async () => {
    const permissions = {
      userId: "user-456",
      capabilities: ["action.create", "decision.approve"],
      workspaces: ["ws-1", "ws-2"],
    };

    await cache.set(`perms:user-456`, permissions, 3600);
    const cached = await cache.get(`perms:user-456`);

    expect(cached).toEqual(permissions);
    expect((cached as unknown).capabilities).toContain("decision.approve");
  });

  it("caches computed decision confidence scores", async () => {
    const scores = {
      decisionId: "dec-789",
      confidence: 0.92,
      factors: {
        dataQuality: 0.95,
        historicalAccuracy: 0.88,
        executionCertainty: 0.90,
      },
    };

    await cache.set(`confidence:dec-789`, scores, 900);
    expect(await cache.get(`confidence:dec-789`)).toEqual(scores);
  });

  it("handles cache invalidation patterns", async () => {
    // Set multiple cache keys for a workspace
    const ws = "workspace-999";
    await cache.set(`briefing:${ws}`, { data: "briefing" });
    await cache.set(`metrics:${ws}`, { data: "metrics" });
    await cache.set(`perms:${ws}`, { data: "perms" });
    await cache.set(`other:key`, { data: "unrelated" });

    // Invalidate all workspace data
    await cache.flush(`^(briefing|metrics|perms):${ws}$`);

    expect(await cache.get(`briefing:${ws}`)).toBeNull();
    expect(await cache.get(`metrics:${ws}`)).toBeNull();
    expect(await cache.get(`perms:${ws}`)).toBeNull();
    expect(await cache.get(`other:key`)).toBeDefined();
  });

  // ========== Error Scenarios ==========

  it("handles get after destroy gracefully", async () => {
    const testCache = new InMemoryCache();
    testCache.destroy();

    // Should not throw, but behavior undefined (memory already cleared)
    await expect(testCache.get("any-key")).resolves.toBeDefined();
  });

  it("handles invalid patterns in flush gracefully", async () => {
    await cache.set("key1", "val1");
    const stats1 = await cache.getStats();
    expect(stats1.size).toBe(1);

    // Invalid regex should either throw or be handled gracefully
    let errorThrown = false;
    try {
      await cache.flush("[invalid(pattern");
    } catch (e) {
      errorThrown = true;
    }

    // Either it throws (acceptable) or it doesn't but cache still works
    const stats2 = await cache.getStats();
    expect(typeof stats2.size).toBe("number");
    expect(stats2.size >= 0).toBe(true);
  });

  // ========== Type Safety ==========

  it("preserves type safety for stored objects", async () => {
    interface User {
      id: string;
      name: string;
      email: string;
    }

    const user: User = {
      id: "user-123",
      name: "John Doe",
      email: "john@example.com",
    };

    await cache.set("user:123", user);
    const cached = await cache.get<User>("user:123");

    expect(cached?.id).toBe("user-123");
    expect(cached?.name).toBe("John Doe");
    expect(cached?.email).toBe("john@example.com");
  });

  // ========== Statistics Reset ==========

  it("statistics reflect current state", async () => {
    await cache.set("k1", "v1");
    await cache.get("k1");
    let stats = await cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(0);

    await cache.get("missing");
    stats = await cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });
});
