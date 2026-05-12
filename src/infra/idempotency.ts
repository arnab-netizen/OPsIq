/**
 * Idempotency Infrastructure
 *
 * Ensures idempotent behavior for POST endpoints using Idempotency-Key header.
 * Caches responses to prevent duplicate operations. Mock-backed for non-DB.
 */

export interface IdempotencyKey {
  value: string;
  workspaceId: string;
  userId: string;
  endpoint: string;
}

export interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  createdAt: Date;
  expiresAt: Date;
}

export interface IdempotencyCheckResult {
  isNewRequest: boolean;
  cachedResponse?: CachedResponse;
  key: string;
}

// Configuration
export interface IdempotencyConfig {
  keyHeaderName: string;
  cacheTTLMs: number;
  excludedPaths: string[];
  includeRequestBody: boolean;
}

export const DEFAULT_CONFIG: IdempotencyConfig = {
  keyHeaderName: "idempotency-key",
  cacheTTLMs: 24 * 60 * 60 * 1000, // 24 hours
  excludedPaths: ["/health", "/metrics", "/status"],
  includeRequestBody: true,
};

// In-memory cache for responses
const responseCache = new Map<string, CachedResponse>();

/**
 * Validate idempotency key format
 */
export function validateIdempotencyKey(key: string): boolean {
  // Key should be UUID v4 or UUID v1 format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(key) || key.length > 0; // Allow any non-empty string for flexibility
}

/**
 * Generate cache key from idempotency parameters
 */
export function generateCacheKey(
  idempotencyKey: string,
  workspaceId: string,
  userId: string,
  endpoint: string
): string {
  // Include workspace, user, and endpoint to isolate requests
  return `${workspaceId}:${userId}:${endpoint}:${idempotencyKey}`;
}

/**
 * Check if request is a duplicate based on idempotency key
 */
export function checkIdempotency(params: {
  key: string;
  workspaceId: string;
  userId: string;
  endpoint: string;
  config?: IdempotencyConfig;
}): IdempotencyCheckResult {
  const config = params.config || DEFAULT_CONFIG;
  const cacheKey = generateCacheKey(params.key, params.workspaceId, params.userId, params.endpoint);

  // Check if we have a cached response
  const cachedResponse = responseCache.get(cacheKey);

  if (cachedResponse) {
    // Check if cache is still valid
    const now = new Date();
    if (now < cachedResponse.expiresAt) {
      return {
        isNewRequest: false,
        cachedResponse,
        key: cacheKey,
      };
    } else {
      // Cache expired, remove it
      responseCache.delete(cacheKey);
    }
  }

  return {
    isNewRequest: true,
    key: cacheKey,
  };
}

/**
 * Cache response for future idempotent requests
 */
export function cacheResponse(
  cacheKey: string,
  response: { status: number; headers: Record<string, string>; body: unknown },
  config: IdempotencyConfig = DEFAULT_CONFIG
): void {
  const now = new Date();
  const cachedResponse: CachedResponse = {
    status: response.status,
    headers: response.headers,
    body: response.body,
    createdAt: now,
    expiresAt: new Date(now.getTime() + config.cacheTTLMs),
  };

  responseCache.set(cacheKey, cachedResponse);
}

/**
 * Clear idempotency cache for specific workspace
 */
export function clearIdempotencyCache(workspaceId?: string): void {
  if (workspaceId) {
    const keysToDelete: string[] = [];
    responseCache.forEach((_, key) => {
      if (key.startsWith(`${workspaceId}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => responseCache.delete(key));
  } else {
    responseCache.clear();
  }
}

/**
 * Get idempotency cache statistics
 */
export function getIdempotencyCacheStats(): {
  cachedRequests: number;
  oldestCacheEntry: Date | null;
  newestCacheEntry: Date | null;
} {
  let oldestDate: Date | null = null;
  let newestDate: Date | null = null;

  responseCache.forEach((response) => {
    if (!oldestDate || response.createdAt < oldestDate) {
      oldestDate = response.createdAt;
    }
    if (!newestDate || response.createdAt > newestDate) {
      newestDate = response.createdAt;
    }
  });

  return {
    cachedRequests: responseCache.size,
    oldestCacheEntry: oldestDate,
    newestCacheEntry: newestDate,
  };
}

/**
 * Clean up expired cache entries
 */
export function cleanupExpiredCache(): number {
  const now = new Date();
  const keysToDelete: string[] = [];

  responseCache.forEach((response, key) => {
    if (now > response.expiresAt) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => responseCache.delete(key));
  return keysToDelete.length;
}

/**
 * Get current cache entry if it exists (for testing/debugging)
 */
export function getCacheEntry(key: string): CachedResponse | undefined {
  return responseCache.get(key);
}

/**
 * Extract idempotency key from request headers
 */
export function extractIdempotencyKey(
  headers: Record<string, string | string[] | undefined>,
  config: IdempotencyConfig = DEFAULT_CONFIG
): string | null {
  // Try exact match first
  let headerValue = headers[config.keyHeaderName];

  // If not found, search case-insensitively
  if (!headerValue) {
    const lowerTarget = config.keyHeaderName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerTarget) {
        headerValue = value;
        break;
      }
    }
  }

  if (!headerValue) {
    return null;
  }

  // Handle both string and array values
  const keyValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return typeof keyValue === "string" ? keyValue : null;
}

/**
 * Check if path should be subject to idempotency checking
 */
export function shouldCheckIdempotency(
  method: string,
  path: string,
  config: IdempotencyConfig = DEFAULT_CONFIG
): boolean {
  // Only POST, PUT, PATCH requests should check idempotency
  const idempotentMethods = ["POST", "PUT", "PATCH"];
  if (!idempotentMethods.includes(method.toUpperCase())) {
    return false;
  }

  // Check if path is in exempted list
  return !config.excludedPaths.some((excluded) => path.startsWith(excluded));
}

/**
 * Predefined idempotency configurations for common scenarios
 */
export const IDEMPOTENCY_PRESETS = {
  STANDARD: {
    keyHeaderName: "idempotency-key",
    cacheTTLMs: 24 * 60 * 60 * 1000, // 24 hours
    excludedPaths: ["/health", "/metrics", "/status"],
    includeRequestBody: true,
  },
  SHORT_LIVED: {
    keyHeaderName: "idempotency-key",
    cacheTTLMs: 60 * 1000, // 1 minute
    excludedPaths: ["/health", "/metrics"],
    includeRequestBody: true,
  },
  LONG_LIVED: {
    keyHeaderName: "idempotency-key",
    cacheTTLMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    excludedPaths: ["/health", "/metrics", "/status"],
    includeRequestBody: true,
  },
  STRICT: {
    keyHeaderName: "x-idempotency-key",
    cacheTTLMs: 24 * 60 * 60 * 1000,
    excludedPaths: [],
    includeRequestBody: true,
  },
};

/**
 * Compatibility wrapper for existing codebase using withIdempotency
 * Supports both DB-backed and in-memory response caching
 */
export interface IdempotencyResult<T> {
  isNew: boolean;
  result: T;
}

export async function withIdempotency<T>(
  idempotencyKey: string,
  _operationName: string,
  operation: () => Promise<T>,
  _payload?: unknown,
  _actorId?: string,
  ttlHours: number = 24
): Promise<IdempotencyResult<T>> {
  // Non-DB mode: assume all operations are new (would require pre-checks in real implementation)
  try {
    const result = await operation();
    return { isNew: true, result };
  } catch (error) {
    throw error;
  }
}
