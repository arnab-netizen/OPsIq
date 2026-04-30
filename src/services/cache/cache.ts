// Cache abstraction layer - supports in-memory and Redis backends

export interface CacheBackend {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  flush(pattern?: string): Promise<void>;
  getStats(): Promise<CacheStats>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  backend: string;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
