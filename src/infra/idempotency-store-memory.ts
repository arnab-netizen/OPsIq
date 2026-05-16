/**
 * In-Memory Idempotency Store
 *
 * Provides non-DB idempotency tracking for duplicate request detection.
 * Used when DATABASE_URL is unavailable or for testing.
 *
 * Stores mapping of idempotency key → cached response.
 * Supports TTL-based expiration and concurrent request handling.
 */

export interface IdempotencyRecord {
  key: string;
  operationName: string;
  payload?: string;
  response: unknown;
  status: "pending" | "completed" | "failed";
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

interface StoreEntry {
  record: IdempotencyRecord;
  watchers: (() => void)[];
}

export class InMemoryIdempotencyStore {
  private store: Map<string, StoreEntry> = new Map();
  private readonly defaultTtlMs = 24 * 60 * 60 * 1000; // 24 hours
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Get or create idempotency record
   */
  async get(key: string): Promise<IdempotencyRecord | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    const { record } = entry;

    // Check if expired
    if (new Date() > record.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return record;
  }

  /**
   * Create a pending idempotency record
   */
  async create(
    key: string,
    operationName: string,
    payload?: string,
    ttlMs?: number
  ): Promise<IdempotencyRecord> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (ttlMs ?? this.defaultTtlMs));

    const record: IdempotencyRecord = {
      key,
      operationName,
      payload,
      response: null,
      status: "pending",
      createdAt: now,
      expiresAt,
    };

    this.store.set(key, { record, watchers: [] });
    return record;
  }

  /**
   * Update record with completed response
   */
  async update(
    key: string,
    response: unknown,
    status: "completed" | "failed" = "completed"
  ): Promise<IdempotencyRecord> {
    const entry = this.store.get(key);
    if (!entry) {
      throw new Error(`Idempotency record not found: ${key}`);
    }

    const { record, watchers } = entry;
    record.response = response;
    record.status = status;
    record.completedAt = new Date();

    // Notify waiters
    watchers.forEach((notify) => notify());
    watchers.length = 0;

    return record;
  }

  /**
   * Wait for a pending record to complete (for concurrent requests)
   */
  async waitForCompletion(key: string, timeoutMs = 30000): Promise<IdempotencyRecord> {
    const entry = this.store.get(key);
    if (!entry) {
      throw new Error(`Idempotency record not found: ${key}`);
    }

    const { record, watchers } = entry;

    // Already completed
    if (record.status !== "pending") {
      return record;
    }

    // Wait for completion with timeout
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Idempotency timeout waiting for ${key}`));
      }, timeoutMs);

      watchers.push(() => {
        clearTimeout(timeoutHandle);
        resolve(record);
      });
    });
  }

  /**
   * Delete record (for testing)
   */
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * Clear all records (for testing)
   */
  async clear(): Promise<void> {
    this.store.clear();
  }

  /**
   * Get store size
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Periodic cleanup of expired records
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const toDelete: string[] = [];

      this.store.forEach((entry, key) => {
        if (now > entry.record.expiresAt) {
          toDelete.push(key);
        }
      });

      toDelete.forEach((key) => this.store.delete(key));
    }, 60 * 1000); // Run every minute

    // Allow process to exit even if interval is running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Cleanup and teardown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// Singleton instance
let storeInstance: InMemoryIdempotencyStore | null = null;

export function getIdempotencyStore(): InMemoryIdempotencyStore {
  if (!storeInstance) {
    storeInstance = new InMemoryIdempotencyStore();
  }
  return storeInstance;
}

export function resetIdempotencyStore(): void {
  if (storeInstance) {
    storeInstance.destroy();
    storeInstance = null;
  }
}
