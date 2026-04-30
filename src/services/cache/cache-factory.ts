import { CacheBackend } from "./cache";
import { InMemoryCache } from "./in-memory-cache";

export function createCache(): CacheBackend {
  const backend = process.env.CACHE_BACKEND || "memory";

  if (backend === "redis") {
    // Redis backend not implemented in Phase 1
    console.warn("Redis cache backend requested but not available in Phase 1");
    return new InMemoryCache();
  }

  return new InMemoryCache();
}

let cacheInstance: CacheBackend | null = null;

export function getCache(): CacheBackend {
  if (!cacheInstance) {
    cacheInstance = createCache();
  }
  return cacheInstance;
}

export function resetCache(): void {
  cacheInstance = null;
}
