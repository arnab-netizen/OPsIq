import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { InMemoryCache } from "../in-memory-cache";
import { getCache, resetCache } from "../cache-factory";
import { CACHE_TTLS } from "../cache-config";

describe("Cache Layer", () => {
  describe("InMemoryCache", () => {
    let cache: InMemoryCache;

    beforeEach(() => {
      cache = new InMemoryCache();
    });

    afterEach(() => {
      cache.destroy();
    });

    it("should store and retrieve values", async () => {
      const testValue = { data: "test" };

      await cache.set("key1", testValue, 300);
      const retrieved = await cache.get("key1");

      expect(retrieved).toEqual(testValue);
    });

    it("should return null for missing keys", async () => {
      const retrieved = await cache.get("nonexistent");
      expect(retrieved).toBeNull();
    });

    it("should respect TTL expiration", async () => {
      await cache.set("key1", "value", 1); // 1 second TTL

      // Should exist immediately
      const immediate = await cache.get("key1");
      expect(immediate).toBe("value");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const expired = await cache.get("key1");
      expect(expired).toBeNull();
    });

    it("should track hits and misses", async () => {
      await cache.set("key1", "value");

      // Hit
      await cache.get("key1");

      // Miss
      await cache.get("nonexistent");

      const stats = await cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it("should delete keys", async () => {
      await cache.set("key1", "value");
      await cache.delete("key1");

      const retrieved = await cache.get("key1");
      expect(retrieved).toBeNull();
    });

    it("should flush all entries", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      await cache.set("key3", "value3");

      await cache.flush();

      const stats = await cache.getStats();
      expect(stats.size).toBe(0);
    });

    it("should flush entries by pattern", async () => {
      await cache.set("risk:ws-123:metrics", "value1");
      await cache.set("risk:ws-456:metrics", "value2");
      await cache.set("thresholds:ws-123:config", "value3");

      await cache.flush("^risk:.*");

      const risk1 = await cache.get("risk:ws-123:metrics");
      const risk2 = await cache.get("risk:ws-456:metrics");
      const threshold = await cache.get("thresholds:ws-123:config");

      expect(risk1).toBeNull();
      expect(risk2).toBeNull();
      expect(threshold).toBe("value3");
    });

    it("should support workspace isolation in cache keys", async () => {
      await cache.set("risk-dashboard:ws-123:metrics", { data: "ws1" });
      await cache.set("risk-dashboard:ws-456:metrics", { data: "ws2" });

      const ws1 = await cache.get("risk-dashboard:ws-123:metrics");
      const ws2 = await cache.get("risk-dashboard:ws-456:metrics");

      expect(ws1).toEqual({ data: "ws1" });
      expect(ws2).toEqual({ data: "ws2" });
    });

    it("should cleanup expired entries periodically", async () => {
      // Create cache with faster cleanup
      const fastCache = new InMemoryCache(500); // 500ms cleanup interval

      await fastCache.set("expired1", "value", 1);
      await fastCache.set("expired2", "value", 1);
      await fastCache.set("retained", "value", 300);

      let stats = await fastCache.getStats();
      expect(stats.size).toBe(3);

      // Wait for expiration and cleanup
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await new Promise((resolve) => setTimeout(resolve, 600)); // Wait for cleanup cycle

      stats = await fastCache.getStats();
      expect(stats.size).toBeLessThanOrEqual(1); // Only retained should remain

      fastCache.destroy();
    });

    it("should support generic typing", async () => {
      interface TestData {
        id: string;
        value: number;
      }

      const testData: TestData = { id: "test-1", value: 42 };

      await cache.set<TestData>("key1", testData, 300);
      const retrieved = await cache.get<TestData>("key1");

      expect(retrieved?.id).toBe("test-1");
      expect(retrieved?.value).toBe(42);
    });

    it("should handle large values", async () => {
      const largeValue = {
        data: Array(10000).fill("test"),
        nested: {
          array: Array(100).fill({ a: 1, b: 2, c: 3 }),
        },
      };

      await cache.set("large", largeValue, 300);
      const retrieved = await cache.get("large");

      expect(retrieved).toEqual(largeValue);
    });
  });

  describe("Cache Factory", () => {
    afterEach(() => {
      resetCache();
    });

    it("should return singleton cache instance", () => {
      const cache1 = getCache();
      const cache2 = getCache();

      expect(cache1).toBe(cache2);
    });

    it("should create in-memory cache by default", async () => {
      const cache = getCache();
      const stats = await cache.getStats();

      expect(stats).toHaveProperty("backend", "memory");
    });

    it("should reset cache singleton", async () => {
      const cache1 = getCache();
      await cache1.set("key", "value");

      resetCache();

      const cache2 = getCache();
      const value = await cache2.get("key");

      expect(value).toBeNull();
      expect(cache1).not.toBe(cache2);
    });
  });

  describe("Cache TTL Configuration", () => {
    it("should have appropriate TTL values", () => {
      expect(CACHE_TTLS.RISK_DASHBOARD).toBe(300); // 5 minutes
      expect(CACHE_TTLS.TIMESERIES_SNAPSHOT).toBe(600); // 10 minutes
      expect(CACHE_TTLS.THRESHOLDS).toBe(1800); // 30 minutes
      expect(CACHE_TTLS.DECISION_COMPARISON).toBe(600); // 10 minutes
      expect(CACHE_TTLS.GUARDRAIL_METRICS).toBe(300); // 5 minutes
      expect(CACHE_TTLS.ALERT_STATUS).toBe(180); // 3 minutes
    });

    it("should be usable with cache set operations", async () => {
      const cache = new InMemoryCache();

      const data = { test: "data" };
      await cache.set("key", data, CACHE_TTLS.RISK_DASHBOARD);

      const retrieved = await cache.get("key");
      expect(retrieved).toEqual(data);

      cache.destroy();
    });
  });

  describe("Workspace-scoped cache keys", () => {
    let cache: InMemoryCache;

    beforeEach(() => {
      cache = new InMemoryCache();
    });

    afterEach(() => {
      cache.destroy();
    });

    it("should maintain isolation across workspaces", async () => {
      const ws1Data = { workspace: "ws-1" };
      const ws2Data = { workspace: "ws-2" };

      await cache.set("risk-dashboard:ws-1:metrics", ws1Data);
      await cache.set("risk-dashboard:ws-2:metrics", ws2Data);

      const ws1Retrieved = await cache.get("risk-dashboard:ws-1:metrics");
      const ws2Retrieved = await cache.get("risk-dashboard:ws-2:metrics");

      expect(ws1Retrieved).toEqual(ws1Data);
      expect(ws2Retrieved).toEqual(ws2Data);
    });

    it("should support bulk flush by workspace", async () => {
      await cache.set("risk-dashboard:ws-1:metrics", "data1");
      await cache.set("guardrail:ws-1:metrics", "data2");
      await cache.set("thresholds:ws-1:config", "data3");
      await cache.set("risk-dashboard:ws-2:metrics", "data4");

      // Flush all ws-1 caches
      await cache.flush(`.*:ws-1:.*`);

      const ws1Risk = await cache.get("risk-dashboard:ws-1:metrics");
      const ws1Guardrail = await cache.get("guardrail:ws-1:metrics");
      const ws1Threshold = await cache.get("thresholds:ws-1:config");
      const ws2Risk = await cache.get("risk-dashboard:ws-2:metrics");

      expect(ws1Risk).toBeNull();
      expect(ws1Guardrail).toBeNull();
      expect(ws1Threshold).toBeNull();
      expect(ws2Risk).toBe("data4");
    });
  });
});
