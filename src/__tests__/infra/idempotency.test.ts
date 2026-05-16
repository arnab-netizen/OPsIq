/**
 * Tests: Idempotency Infrastructure
 *
 * Validates response caching, duplicate detection, cache expiration,
 * and header extraction.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  validateIdempotencyKey,
  generateCacheKey,
  checkIdempotency,
  cacheResponse,
  clearIdempotencyCache,
  getIdempotencyCacheStats,
  cleanupExpiredCache,
  getCacheEntry,
  extractIdempotencyKey,
  shouldCheckIdempotency,
  IDEMPOTENCY_PRESETS,
  IdempotencyConfig,
} from "@/infra/idempotency";

describe("Idempotency Infrastructure", () => {
  beforeEach(() => {
    clearIdempotencyCache();
  });

  describe("Key Validation", () => {
    it("should validate UUID format", () => {
      const validKey = "550e8400-e29b-41d4-a716-446655440000";
      expect(validateIdempotencyKey(validKey)).toBe(true);
    });

    it("should accept non-UUID keys", () => {
      expect(validateIdempotencyKey("my-custom-key")).toBe(true);
    });

    it("should reject empty keys", () => {
      expect(validateIdempotencyKey("")).toBe(false);
    });

    it("should validate UUID v1 format", () => {
      const uuid1 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
      expect(validateIdempotencyKey(uuid1)).toBe(true);
    });

    it("should be case-insensitive", () => {
      const upperKey = "550E8400-E29B-41D4-A716-446655440000";
      expect(validateIdempotencyKey(upperKey)).toBe(true);
    });
  });

  describe("Cache Key Generation", () => {
    it("should generate unique cache keys", () => {
      const key1 = generateCacheKey("idempotency-1", "ws-1", "user-1", "/api/actions");
      const key2 = generateCacheKey("idempotency-2", "ws-1", "user-1", "/api/actions");

      expect(key1).not.toBe(key2);
    });

    it("should isolate by workspace", () => {
      const key1 = generateCacheKey("idempotency-1", "ws-1", "user-1", "/api/actions");
      const key2 = generateCacheKey("idempotency-1", "ws-2", "user-1", "/api/actions");

      expect(key1).not.toBe(key2);
    });

    it("should isolate by user", () => {
      const key1 = generateCacheKey("idempotency-1", "ws-1", "user-1", "/api/actions");
      const key2 = generateCacheKey("idempotency-1", "ws-1", "user-2", "/api/actions");

      expect(key1).not.toBe(key2);
    });

    it("should isolate by endpoint", () => {
      const key1 = generateCacheKey("idempotency-1", "ws-1", "user-1", "/api/actions");
      const key2 = generateCacheKey("idempotency-1", "ws-1", "user-1", "/api/decisions");

      expect(key1).not.toBe(key2);
    });

    it("should include all parameters in key", () => {
      const key = generateCacheKey("test-key", "ws-1", "user-1", "/api/test");
      expect(key).toContain("ws-1");
      expect(key).toContain("user-1");
      expect(key).toContain("/api/test");
      expect(key).toContain("test-key");
    });
  });

  describe("Idempotency Check", () => {
    it("should identify new requests", () => {
      const result = checkIdempotency({
        key: "new-key",
        workspaceId: "ws-1",
        userId: "user-1",
        endpoint: "/api/actions",
      });

      expect(result.isNewRequest).toBe(true);
      expect(result.cachedResponse).toBeUndefined();
    });

    it("should identify duplicate requests with valid cache", () => {
      const cacheKey = generateCacheKey("idempotency-1", "ws-1", "user-1", "/api/actions");

      // Cache a response
      cacheResponse(cacheKey, {
        status: 201,
        headers: { "content-type": "application/json" },
        body: { id: "action-1" },
      });

      // Check again
      const result = checkIdempotency({
        key: "idempotency-1",
        workspaceId: "ws-1",
        userId: "user-1",
        endpoint: "/api/actions",
      });

      expect(result.isNewRequest).toBe(false);
      expect(result.cachedResponse).toBeDefined();
      expect(result.cachedResponse?.status).toBe(201);
    });

    it("should invalidate expired cache", async () => {
      const config: IdempotencyConfig = {
        keyHeaderName: "idempotency-key",
        cacheTTLMs: 100, // Very short TTL
        excludedPaths: [],
        includeRequestBody: true,
      };

      const cacheKey = generateCacheKey("idempotency-1", "ws-1", "user-1", "/api/actions");
      cacheResponse(
        cacheKey,
        {
          status: 201,
          headers: {},
          body: { id: "action-1" },
        },
        config
      );

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = checkIdempotency({
        key: "idempotency-1",
        workspaceId: "ws-1",
        userId: "user-1",
        endpoint: "/api/actions",
        config,
      });

      expect(result.isNewRequest).toBe(true);
      expect(result.cachedResponse).toBeUndefined();
    });

    it("should preserve cache key in result", () => {
      const result = checkIdempotency({
        key: "test-key",
        workspaceId: "ws-1",
        userId: "user-1",
        endpoint: "/api/test",
      });

      expect(result.key).toBeDefined();
      expect(result.key).toContain("test-key");
    });
  });

  describe("Response Caching", () => {
    it("should cache response with metadata", () => {
      const cacheKey = generateCacheKey("idempotency-1", "ws-1", "user-1", "/api/actions");

      cacheResponse(cacheKey, {
        status: 201,
        headers: { "x-custom": "value" },
        body: { id: "action-1", name: "Test Action" },
      });

      const cached = getCacheEntry(cacheKey);
      expect(cached).toBeDefined();
      expect(cached?.status).toBe(201);
      expect(cached?.body).toEqual({ id: "action-1", name: "Test Action" });
    });

    it("should set expiration time", () => {
      const config: IdempotencyConfig = {
        keyHeaderName: "idempotency-key",
        cacheTTLMs: 3600000, // 1 hour
        excludedPaths: [],
        includeRequestBody: true,
      };

      const cacheKey = generateCacheKey("key-1", "ws-1", "user-1", "/api/test");
      const now = Date.now();

      cacheResponse(
        cacheKey,
        {
          status: 200,
          headers: {},
          body: {},
        },
        config
      );

      const cached = getCacheEntry(cacheKey);
      const expiresInMs = cached!.expiresAt.getTime() - now;

      expect(expiresInMs).toBeGreaterThan(3500000); // Account for execution time
      expect(expiresInMs).toBeLessThanOrEqual(3600000);
    });

    it("should include creation timestamp", () => {
      const cacheKey = generateCacheKey("key-1", "ws-1", "user-1", "/api/test");
      const beforeCache = new Date();

      cacheResponse(cacheKey, {
        status: 200,
        headers: {},
        body: {},
      });

      const cached = getCacheEntry(cacheKey);
      const afterCache = new Date();

      expect(cached?.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCache.getTime());
      expect(cached?.createdAt.getTime()).toBeLessThanOrEqual(afterCache.getTime());
    });
  });

  describe("Cache Clearing", () => {
    it("should clear all cache", () => {
      const key1 = generateCacheKey("key-1", "ws-1", "user-1", "/api/test");
      const key2 = generateCacheKey("key-2", "ws-2", "user-2", "/api/test");

      cacheResponse(key1, { status: 200, headers: {}, body: {} });
      cacheResponse(key2, { status: 200, headers: {}, body: {} });

      clearIdempotencyCache();

      expect(getCacheEntry(key1)).toBeUndefined();
      expect(getCacheEntry(key2)).toBeUndefined();
    });

    it("should clear workspace-specific cache", () => {
      const key1 = generateCacheKey("key-1", "ws-1", "user-1", "/api/test");
      const key2 = generateCacheKey("key-2", "ws-2", "user-1", "/api/test");

      cacheResponse(key1, { status: 200, headers: {}, body: {} });
      cacheResponse(key2, { status: 200, headers: {}, body: {} });

      clearIdempotencyCache("ws-1");

      expect(getCacheEntry(key1)).toBeUndefined();
      expect(getCacheEntry(key2)).toBeDefined();
    });

    it("should not affect other workspaces when clearing one", () => {
      const key1 = generateCacheKey("key-1", "ws-1", "user-1", "/api/test");
      const key2 = generateCacheKey("key-1", "ws-2", "user-1", "/api/test");
      const key3 = generateCacheKey("key-1", "ws-3", "user-1", "/api/test");

      cacheResponse(key1, { status: 200, headers: {}, body: {} });
      cacheResponse(key2, { status: 200, headers: {}, body: {} });
      cacheResponse(key3, { status: 200, headers: {}, body: {} });

      clearIdempotencyCache("ws-2");

      expect(getCacheEntry(key1)).toBeDefined();
      expect(getCacheEntry(key2)).toBeUndefined();
      expect(getCacheEntry(key3)).toBeDefined();
    });
  });

  describe("Cache Statistics", () => {
    it("should count cached requests", () => {
      const key1 = generateCacheKey("key-1", "ws-1", "user-1", "/api/test");
      const key2 = generateCacheKey("key-2", "ws-1", "user-1", "/api/test");

      cacheResponse(key1, { status: 200, headers: {}, body: {} });
      cacheResponse(key2, { status: 200, headers: {}, body: {} });

      const stats = getIdempotencyCacheStats();
      expect(stats.cachedRequests).toBe(2);
    });

    it("should track oldest cache entry", () => {
      const key1 = generateCacheKey("key-1", "ws-1", "user-1", "/api/test");
      const before1 = new Date();

      cacheResponse(key1, { status: 200, headers: {}, body: {} });
      const oldest1 = getIdempotencyCacheStats().oldestCacheEntry;

      expect(oldest1).toBeDefined();
      expect(oldest1!.getTime()).toBeGreaterThanOrEqual(before1.getTime());
    });

    it("should track newest cache entry", () => {
      const key1 = generateCacheKey("key-1", "ws-1", "user-1", "/api/test");
      const key2 = generateCacheKey("key-2", "ws-1", "user-1", "/api/test");

      cacheResponse(key1, { status: 200, headers: {}, body: {} });
      const firstNewest = getIdempotencyCacheStats().newestCacheEntry;

      cacheResponse(key2, { status: 200, headers: {}, body: {} });
      const secondNewest = getIdempotencyCacheStats().newestCacheEntry;

      expect(secondNewest!.getTime()).toBeGreaterThanOrEqual(firstNewest!.getTime());
    });

    it("should return zero stats when empty", () => {
      const stats = getIdempotencyCacheStats();
      expect(stats.cachedRequests).toBe(0);
      expect(stats.oldestCacheEntry).toBeNull();
      expect(stats.newestCacheEntry).toBeNull();
    });
  });

  describe("Cache Cleanup", () => {
    it("should remove expired entries", async () => {
      const config: IdempotencyConfig = {
        keyHeaderName: "idempotency-key",
        cacheTTLMs: 50, // Very short
        excludedPaths: [],
        includeRequestBody: true,
      };

      const key1 = generateCacheKey("key-1", "ws-1", "user-1", "/api/test");
      const key2 = generateCacheKey("key-2", "ws-1", "user-1", "/api/test");

      cacheResponse(key1, { status: 200, headers: {}, body: {} }, config);

      await new Promise((resolve) => setTimeout(resolve, 100));

      cacheResponse(key2, { status: 200, headers: {}, body: {} }, config);

      const cleaned = cleanupExpiredCache();
      expect(cleaned).toBe(1); // Only first entry should be expired

      expect(getCacheEntry(key1)).toBeUndefined();
      expect(getCacheEntry(key2)).toBeDefined();
    });

    it("should return count of cleaned entries", async () => {
      const config: IdempotencyConfig = {
        keyHeaderName: "idempotency-key",
        cacheTTLMs: 50,
        excludedPaths: [],
        includeRequestBody: true,
      };

      const keys = [];
      for (let i = 0; i < 5; i++) {
        const key = generateCacheKey(`key-${i}`, "ws-1", "user-1", "/api/test");
        cacheResponse(key, { status: 200, headers: {}, body: {} }, config);
        keys.push(key);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      const cleaned = cleanupExpiredCache();
      expect(cleaned).toBe(5);
    });
  });

  describe("Header Extraction", () => {
    it("should extract idempotency key from headers", () => {
      const headers = { "idempotency-key": "test-key-123" };
      const key = extractIdempotencyKey(headers);
      expect(key).toBe("test-key-123");
    });

    it("should handle case-insensitive header names", () => {
      const headers = { "Idempotency-Key": "test-key-123" };
      const key = extractIdempotencyKey(headers);
      expect(key).toBe("test-key-123");
    });

    it("should return null if header missing", () => {
      const headers = {};
      const key = extractIdempotencyKey(headers);
      expect(key).toBeNull();
    });

    it("should handle array header values", () => {
      const headers = { "idempotency-key": ["test-key-123", "ignored"] };
      const key = extractIdempotencyKey(headers);
      expect(key).toBe("test-key-123");
    });

    it("should support custom header names", () => {
      const config: IdempotencyConfig = {
        keyHeaderName: "x-idempotency-key",
        cacheTTLMs: 3600000,
        excludedPaths: [],
        includeRequestBody: true,
      };

      const headers = { "x-idempotency-key": "custom-key" };
      const key = extractIdempotencyKey(headers, config);
      expect(key).toBe("custom-key");
    });
  });

  describe("Path-Based Checking", () => {
    it("should require Idempotency-Key for POST", () => {
      const result = shouldCheckIdempotency("POST", "/api/actions");
      expect(result).toBe(true);
    });

    it("should require Idempotency-Key for PUT", () => {
      const result = shouldCheckIdempotency("PUT", "/api/actions/1");
      expect(result).toBe(true);
    });

    it("should require Idempotency-Key for PATCH", () => {
      const result = shouldCheckIdempotency("PATCH", "/api/actions/1");
      expect(result).toBe(true);
    });

    it("should not require for GET", () => {
      const result = shouldCheckIdempotency("GET", "/api/actions");
      expect(result).toBe(false);
    });

    it("should not require for DELETE", () => {
      const result = shouldCheckIdempotency("DELETE", "/api/actions/1");
      expect(result).toBe(false);
    });

    it("should exclude paths from checking", () => {
      const config: IdempotencyConfig = {
        keyHeaderName: "idempotency-key",
        cacheTTLMs: 3600000,
        excludedPaths: ["/health", "/metrics"],
        includeRequestBody: true,
      };

      expect(shouldCheckIdempotency("POST", "/health", config)).toBe(false);
      expect(shouldCheckIdempotency("POST", "/metrics", config)).toBe(false);
      expect(shouldCheckIdempotency("POST", "/api/actions", config)).toBe(true);
    });

    it("should be case-insensitive for method", () => {
      expect(shouldCheckIdempotency("post", "/api/actions")).toBe(true);
      expect(shouldCheckIdempotency("Post", "/api/actions")).toBe(true);
      expect(shouldCheckIdempotency("POST", "/api/actions")).toBe(true);
    });
  });

  describe("Configuration Presets", () => {
    it("should provide STANDARD preset", () => {
      const config = IDEMPOTENCY_PRESETS.STANDARD;
      expect(config.cacheTTLMs).toBe(24 * 60 * 60 * 1000);
      expect(config.keyHeaderName).toBe("idempotency-key");
    });

    it("should provide SHORT_LIVED preset", () => {
      const config = IDEMPOTENCY_PRESETS.SHORT_LIVED;
      expect(config.cacheTTLMs).toBe(60 * 1000);
    });

    it("should provide LONG_LIVED preset", () => {
      const config = IDEMPOTENCY_PRESETS.LONG_LIVED;
      expect(config.cacheTTLMs).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("should provide STRICT preset", () => {
      const config = IDEMPOTENCY_PRESETS.STRICT;
      expect(config.keyHeaderName).toBe("x-idempotency-key");
      expect(config.excludedPaths.length).toBe(0);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should prevent duplicate action creation", () => {
      const idempotencyKey = "action-creation-123";
      const workspaceId = "ws-1";
      const userId = "user-1";

      // First request
      let result = checkIdempotency({
        key: idempotencyKey,
        workspaceId,
        userId,
        endpoint: "/api/actions",
      });

      expect(result.isNewRequest).toBe(true);

      // Simulate operation completion
      const cacheKey = result.key;
      cacheResponse(cacheKey, {
        status: 201,
        headers: { location: "/api/actions/1" },
        body: { id: "action-1" },
      });

      // Retry with same key
      result = checkIdempotency({
        key: idempotencyKey,
        workspaceId,
        userId,
        endpoint: "/api/actions",
      });

      expect(result.isNewRequest).toBe(false);
      expect(result.cachedResponse?.body).toEqual({ id: "action-1" });
    });

    it("should isolate users within workspace", () => {
      const idempotencyKey = "shared-key";
      const workspaceId = "ws-1";

      // User A creates action
      let result = checkIdempotency({
        key: idempotencyKey,
        workspaceId,
        userId: "user-a",
        endpoint: "/api/actions",
      });

      expect(result.isNewRequest).toBe(true);
      cacheResponse(result.key, {
        status: 201,
        headers: {},
        body: { id: "action-a" },
      });

      // User B with same key should be new request (different cache key)
      result = checkIdempotency({
        key: idempotencyKey,
        workspaceId,
        userId: "user-b",
        endpoint: "/api/actions",
      });

      expect(result.isNewRequest).toBe(true);
    });

    it("should handle cache expiration with cleanup", async () => {
      const config: IdempotencyConfig = {
        keyHeaderName: "idempotency-key",
        cacheTTLMs: 50,
        excludedPaths: [],
        includeRequestBody: true,
      };

      const key1 = generateCacheKey("key-1", "ws-1", "user-1", "/api/actions");
      cacheResponse(key1, { status: 201, headers: {}, body: { id: "1" } }, config);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const cleanedCount = cleanupExpiredCache();
      expect(cleanedCount).toBe(1);

      const stats = getIdempotencyCacheStats();
      expect(stats.cachedRequests).toBe(0);
    });
  });
});
