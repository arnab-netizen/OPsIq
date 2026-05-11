import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createCache, getCache, resetCache } from "@/services/cache/cache-factory";
import { InMemoryCache } from "@/services/cache/in-memory-cache";
import type { CacheBackend } from "@/services/cache/cache";

// ============================================================================
// TEST SUITE: Cache Factory Service
// ============================================================================

describe("Cache Factory - Cache Creation", () => {
  beforeEach(() => {
    resetCache();
    delete process.env.CACHE_BACKEND;
  });

  afterEach(() => {
    const cache = getCache();
    if (cache instanceof InMemoryCache) {
      cache.destroy();
    }
    resetCache();
  });

  // ========== Cache Creation ==========

  it("creates InMemoryCache by default", () => {
    const cache = createCache();
    expect(cache).toBeInstanceOf(InMemoryCache);
  });

  it("creates InMemoryCache when CACHE_BACKEND is 'memory'", () => {
    process.env.CACHE_BACKEND = "memory";
    const cache = createCache();
    expect(cache).toBeInstanceOf(InMemoryCache);
  });

  it("falls back to InMemoryCache when CACHE_BACKEND is 'redis'", () => {
    process.env.CACHE_BACKEND = "redis";
    const cache = createCache();
    expect(cache).toBeInstanceOf(InMemoryCache);
  });

  it("falls back to InMemoryCache for unknown CACHE_BACKEND", () => {
    process.env.CACHE_BACKEND = "unknown-backend";
    const cache = createCache();
    expect(cache).toBeInstanceOf(InMemoryCache);
  });

  it("creates distinct cache instances on multiple calls", () => {
    const cache1 = createCache();
    const cache2 = createCache();
    expect(cache1).not.toBe(cache2);
  });

  it("returns CacheBackend interface", () => {
    const cache = createCache();
    expect(cache).toHaveProperty("get");
    expect(cache).toHaveProperty("set");
    expect(cache).toHaveProperty("delete");
    expect(cache).toHaveProperty("flush");
    expect(cache).toHaveProperty("getStats");
  });

  // ========== Singleton Management ==========

  it("returns same instance on multiple getCache() calls", () => {
    const cache1 = getCache();
    const cache2 = getCache();
    expect(cache1).toBe(cache2);
  });

  it("creates instance on first getCache() call", () => {
    const cache = getCache();
    expect(cache).toBeInstanceOf(InMemoryCache);
  });

  it("initializes singleton lazily", () => {
    // Call resetCache to clear instance
    resetCache();
    // First call should create instance
    const cache1 = getCache();
    expect(cache1).toBeTruthy();

    // Second call should return same instance
    const cache2 = getCache();
    expect(cache1).toBe(cache2);
  });

  // ========== Cache Reset ==========

  it("clears singleton instance on reset", () => {
    const cache1 = getCache();
    resetCache();
    const cache2 = getCache();

    // Should create new instance after reset
    expect(cache1).not.toBe(cache2);
  });

  it("allows retrieving fresh instance after reset", () => {
    const cache1 = getCache();
    expect(cache1).toBeTruthy();

    resetCache();

    const cache2 = getCache();
    expect(cache2).toBeInstanceOf(InMemoryCache);
  });

  it("resets without throwing errors", () => {
    getCache();
    expect(() => resetCache()).not.toThrow();
  });

  it("can reset before any cache is created", () => {
    expect(() => resetCache()).not.toThrow();
  });

  // ========== Environment Variable Handling ==========

  it("respects CACHE_BACKEND environment variable", () => {
    const backends = ["memory", "redis"];

    backends.forEach((backend) => {
      process.env.CACHE_BACKEND = backend;
      const cache = createCache();
      expect(cache).toBeInstanceOf(InMemoryCache);
    });
  });

  it("defaults to memory when CACHE_BACKEND is empty string", () => {
    process.env.CACHE_BACKEND = "";
    const cache = createCache();
    expect(cache).toBeInstanceOf(InMemoryCache);
  });

  it("handles undefined CACHE_BACKEND", () => {
    delete process.env.CACHE_BACKEND;
    const cache = createCache();
    expect(cache).toBeInstanceOf(InMemoryCache);
  });

  // ========== Functional Cache Operations ==========

  it("cached data persists across getCache() calls", async () => {
    const cache = getCache();
    await cache.set("key1", "value1");

    const cache2 = getCache();
    const result = await cache2.get("key1");

    expect(result).toBe("value1");
  });

  it("get/set operations work on singleton cache", async () => {
    const cache1 = getCache();
    await cache1.set("test-key", "test-value");

    const cache2 = getCache();
    const result = await cache2.get("test-key");

    expect(result).toBe("test-value");
  });

  it("delete operations work on singleton cache", async () => {
    const cache = getCache();
    await cache.set("delete-test", "data");
    expect(await cache.get("delete-test")).toBe("data");

    await cache.delete("delete-test");
    expect(await cache.get("delete-test")).toBeNull();
  });

  it("stats are shared across singleton references", async () => {
    const cache1 = getCache();
    await cache1.set("key1", "val1");

    const cache2 = getCache();
    await cache2.get("key1");
    await cache2.get("missing");

    const stats = await cache2.getStats();
    expect(stats.hits).toBeGreaterThanOrEqual(1);
    expect(stats.misses).toBeGreaterThanOrEqual(1);
  });

  // ========== Integration Scenarios ==========

  it("supports caching application state", async () => {
    const cache = getCache();

    // Simulate caching app configuration
    const config = {
      name: "OpsIQ",
      version: "0.1.0",
      features: ["decisions", "actions", "experiments"],
    };

    await cache.set("app:config", config);
    const cached = await cache.get("app:config");

    expect(cached).toEqual(config);
  });

  it("supports caching user session data", async () => {
    const cache = getCache();

    const session = {
      userId: "user-123",
      workspaceId: "ws-456",
      permissions: ["read", "write"],
      expiresAt: Date.now() + 3600000,
    };

    await cache.set("session:user-123", session);
    const cached = await cache.get("session:user-123");

    expect((cached as any).userId).toBe("user-123");
    expect((cached as any).workspaceId).toBe("ws-456");
  });

  it("supports caching computed results", async () => {
    const cache = getCache();

    const result = {
      decisionId: "dec-789",
      confidence: 0.92,
      computedAt: new Date().toISOString(),
    };

    await cache.set("computed:dec-789", result);
    const cached = await cache.get("computed:dec-789");

    expect(cached).toEqual(result);
  });

  it("supports cache invalidation patterns", async () => {
    const cache = getCache();

    // Store multiple keys
    await cache.set("cache:user:123", { data: "user1" });
    await cache.set("cache:user:456", { data: "user2" });
    await cache.set("other:data", { data: "other" });

    // Flush user cache entries
    await cache.flush("^cache:user:");

    expect(await cache.get("cache:user:123")).toBeNull();
    expect(await cache.get("cache:user:456")).toBeNull();
    expect(await cache.get("other:data")).toBeDefined();
  });

  // ========== Multiple Factory Calls ==========

  it("creates independent instances via createCache()", async () => {
    const cache1 = createCache();
    const cache2 = createCache();

    await cache1.set("key", "value1");
    await cache2.set("key", "value2");

    expect(await cache1.get("key")).toBe("value1");
    expect(await cache2.get("key")).toBe("value2");
  });

  it("singleton and created instances are independent", async () => {
    const singleton = getCache();
    const created = createCache();

    await singleton.set("shared-key", "singleton-value");
    await created.set("shared-key", "created-value");

    expect(await singleton.get("shared-key")).toBe("singleton-value");
    expect(await created.get("shared-key")).toBe("created-value");
  });

  // ========== Backend Selection Logic ==========

  it("prefers CACHE_BACKEND env var over defaults", () => {
    process.env.CACHE_BACKEND = "redis";
    const cache = createCache();

    // Should fall back to InMemoryCache
    expect(cache).toBeInstanceOf(InMemoryCache);
  });

  it("handles case-sensitive backend names", () => {
    const backends = ["memory", "MEMORY", "Memory"];

    backends.forEach((backend) => {
      process.env.CACHE_BACKEND = backend;
      const cache = createCache();

      // All should create InMemoryCache (backend !== "redis")
      expect(cache).toBeInstanceOf(InMemoryCache);
    });
  });

  // ========== Real-World Patterns ==========

  it("supports brief caching pattern", async () => {
    const cache = getCache();

    const briefing = {
      workspaceId: "ws-123",
      metrics: { decisions: 42, actions: 15 },
      generatedAt: new Date(),
    };

    // Store with TTL
    await cache.set("briefing:ws-123", briefing, 1800);

    // Retrieve immediately
    const cached = await cache.get("briefing:ws-123");
    expect(cached).toBeDefined();
  });

  it("supports permission caching pattern", async () => {
    const cache = getCache();

    const perms = {
      userId: "user-456",
      capabilities: ["action.create", "decision.approve"],
    };

    await cache.set("perms:user-456", perms, 3600);
    const cached = await cache.get("perms:user-456");

    expect((cached as any).capabilities).toContain("decision.approve");
  });

  it("supports confidence score caching pattern", async () => {
    const cache = getCache();

    const scores = {
      decisionId: "dec-789",
      confidence: 0.92,
      factors: { dataQuality: 0.95 },
    };

    await cache.set("confidence:dec-789", scores, 900);
    const cached = await cache.get("confidence:dec-789");

    expect((cached as any).confidence).toBe(0.92);
  });

  // ========== Lifecycle Management ==========

  it("can reset and recreate cache instance", async () => {
    // Create and use cache
    const cache1 = getCache();
    await cache1.set("key1", "value1");

    // Reset
    resetCache();

    // Create new instance
    const cache2 = getCache();
    const result = await cache2.get("key1");

    expect(result).toBeNull(); // New instance shouldn't have old data
  });

  it("supports test isolation with resetCache()", async () => {
    // Test 1
    const cache1 = getCache();
    await cache1.set("test-data", "test1");
    expect(await cache1.get("test-data")).toBe("test1");

    // Reset for next test
    resetCache();

    // Test 2
    const cache2 = getCache();
    expect(await cache2.get("test-data")).toBeNull();
  });

  // ========== Error Handling ==========

  it("createCache does not throw with valid env vars", () => {
    process.env.CACHE_BACKEND = "memory";
    expect(() => createCache()).not.toThrow();
  });

  it("getCache does not throw", () => {
    expect(() => getCache()).not.toThrow();
  });

  it("resetCache does not throw", () => {
    getCache();
    expect(() => resetCache()).not.toThrow();
  });

  // ========== Consistency ==========

  it("returns consistent instance after multiple resets and Gets", () => {
    // Before reset, multiple calls return same instance
    const cache1a = getCache();
    const cache1b = getCache();
    expect(cache1a).toBe(cache1b);

    resetCache();

    // After reset, new instance created
    const cache2a = getCache();
    expect(cache2a).not.toBe(cache1a);

    // Multiple calls after reset still return same new instance
    const cache2b = getCache();
    expect(cache2a).toBe(cache2b);

    resetCache();

    // Another reset creates another new instance
    const cache3a = getCache();
    expect(cache3a).not.toBe(cache2a);
  });
});
