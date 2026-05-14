/**
 * PHASE 5: BOUNDED CARDINALITY PROTECTION
 *
 * MOST CRITICAL STEP for preventing memory exhaustion.
 *
 * Prevents cardinality explosion on:
 * - Per-IP aggregation (1M IPs = 1M buckets = OOM)
 * - Per-token aggregation (1M tokens = 1M buckets = OOM)
 * - Per-workspace aggregation
 * - Per-route aggregation
 * - Correlation-map exhaustion
 *
 * Implementation: LRU (Least Recently Used) cache with TTL expiration
 *
 * Memory bounds:
 * - Max 10k active keys per aggregator
 * - Each key: ~200-400 bytes
 * - Max memory: 10k × 400B = 4MB per aggregator
 * - Total system: ~20MB for all aggregators
 *
 * Eviction policy:
 * - LRU: Remove least-recently-used key when capacity reached
 * - TTL: Expire keys older than 5 minutes
 * - Emit metrics on eviction (visibility into attacks)
 */

import { logger } from "@/infra/logger";

/**
 * Bounded counter entry
 */
interface CounterEntry<T> {
  key: string;
  value: T;
  lastAccessedAt: number;
  createdAt: number;
  hitCount: number;
}

/**
 * Bounded LRU cardinality aggregator
 *
 * Generic counter that maintains bounded memory usage
 */
export class BoundedCardinalityAggregator<T> {
  private entries: Map<string, CounterEntry<T>> = new Map();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly name: string;
  private evictionCount: number = 0;
  private expirationCount: number = 0;

  constructor(
    name: string,
    maxEntries: number = 10000,
    ttlMs: number = 300000 // 5 minutes
  ) {
    this.name = name;
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  /**
   * Get or create counter for key
   */
  public getOrCreate(key: string, initialValue: T): T {
    // Prune only every 100 operations (optimization)
    if (Math.random() < 0.01) {
      this.pruneExpiredEntries();
    }

    const now = Date.now();

    // Check existing entry
    let entry = this.entries.get(key);
    if (entry) {
      entry.lastAccessedAt = now;
      entry.hitCount++;
      return entry.value;
    }

    // Create new entry (evict if needed BEFORE adding)
    if (this.entries.size >= this.maxEntries) {
      // Evict LRU entry BEFORE adding new one
      this.evictLRUEntry();
    }

    entry = {
      key,
      value: initialValue,
      lastAccessedAt: now,
      createdAt: now,
      hitCount: 1,
    };

    this.entries.set(key, entry);
    return entry.value;
  }

  /**
   * Get existing counter (no creation)
   */
  public get(key: string): T | undefined {
    const now = Date.now();

    // Check if expired
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (now - entry.createdAt > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }

    // Update access time
    entry.lastAccessedAt = now;
    entry.hitCount++;

    return entry.value;
  }

  /**
   * Increment counter for key
   */
  public increment(key: string, initialValue: number = 0, delta: number = 1): number {
    const current = this.getOrCreate(key, initialValue);
    if (typeof current !== "number") {
      throw new Error(`Expected number, got ${typeof current}`);
    }
    const newValue = current + delta;
    const entry = this.entries.get(key);
    if (entry) {
      entry.value = newValue as unknown as T;
    }
    return newValue;
  }

  /**
   * Prune expired entries (older than TTL)
   */
  private pruneExpiredEntries(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.entries) {
      if (now - entry.createdAt > this.ttlMs) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.entries.delete(key);
      this.expirationCount++;
    }

    // Log expiration if significant
    if (toDelete.length > 100) {
      logger.info(`Cardinality aggregator expired ${toDelete.length} entries`, {
        aggregator: this.name,
        entryCount: this.entries.size,
        expirationCount: this.expirationCount,
      });
    }
  }

  /**
   * Evict least-recently-used entry
   */
  private evictLRUEntry(): void {
    // Find entry with earliest lastAccessedAt
    let lruKey: string | null = null;
    let lruTime: number = Date.now();

    for (const [key, entry] of this.entries) {
      if (entry.lastAccessedAt < lruTime) {
        lruTime = entry.lastAccessedAt;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.entries.delete(lruKey);
      this.evictionCount++;

      // Log evictions (indicates attack or high cardinality)
      if (this.evictionCount % 1000 === 0) {
        logger.warn(`Cardinality aggregator at max capacity`, {
          aggregator: this.name,
          maxEntries: this.maxEntries,
          evictionCount: this.evictionCount,
          currentSize: this.entries.size,
        });
      }
    }
  }

  /**
   * Get size (number of entries)
   */
  public size(): number {
    return this.entries.size;
  }

  /**
   * Get all entries (for testing/monitoring)
   */
  public getAllEntries(): CounterEntry<T>[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get stats
   */
  public getStats(): {
    name: string;
    entryCount: number;
    maxEntries: number;
    evictionCount: number;
    expirationCount: number;
    memoryEstimate: string;
  } {
    const estimatedMemoryBytes = this.entries.size * 400; // ~400 bytes per entry
    let memoryEstimate = `${estimatedMemoryBytes} bytes`;
    if (estimatedMemoryBytes > 1_000_000) {
      memoryEstimate = `${(estimatedMemoryBytes / 1_000_000).toFixed(2)} MB`;
    } else if (estimatedMemoryBytes > 1000) {
      memoryEstimate = `${(estimatedMemoryBytes / 1000).toFixed(2)} KB`;
    }

    return {
      name: this.name,
      entryCount: this.entries.size,
      maxEntries: this.maxEntries,
      evictionCount: this.evictionCount,
      expirationCount: this.expirationCount,
      memoryEstimate,
    };
  }

  /**
   * Clear all entries (testing only)
   */
  public clear(): void {
    this.entries.clear();
    this.evictionCount = 0;
    this.expirationCount = 0;
  }
}

/**
 * Pre-configured aggregators for security signals
 */
export class SecuritySignalAggregators {
  // Auth failures per IP
  private authFailuresByIp = new BoundedCardinalityAggregator<number>(
    "auth_failures_by_ip",
    10000, // Max 10k IPs
    300000 // 5-minute TTL
  );

  // Auth failures per actor (user ID)
  private authFailuresByActor = new BoundedCardinalityAggregator<number>(
    "auth_failures_by_actor",
    10000, // Max 10k actors
    300000
  );

  // Replay attempts per token
  private replayAttemptsByToken = new BoundedCardinalityAggregator<number>(
    "replay_attempts_by_token",
    50000, // More tokens expected
    300000
  );

  // Rate limit violations per route
  private rateLimitsByRoute = new BoundedCardinalityAggregator<number>(
    "rate_limits_by_route",
    1000, // Routes are limited in count
    300000
  );

  // Workspace denials
  private workspaceDenialsByWorkspace = new BoundedCardinalityAggregator<number>(
    "workspace_denials",
    10000,
    300000
  );

  /**
   * Record auth failure for IP
   */
  public recordAuthFailureByIp(ip: string): number {
    return this.authFailuresByIp.increment(ip, 0, 1);
  }

  /**
   * Get auth failures for IP
   */
  public getAuthFailuresByIp(ip: string): number {
    return this.authFailuresByIp.get(ip) ?? 0;
  }

  /**
   * Record auth failure for actor
   */
  public recordAuthFailureByActor(actorId: string): number {
    return this.authFailuresByActor.increment(actorId, 0, 1);
  }

  /**
   * Get auth failures for actor
   */
  public getAuthFailuresByActor(actorId: string): number {
    return this.authFailuresByActor.get(actorId) ?? 0;
  }

  /**
   * Record replay attempt
   */
  public recordReplayAttemptByToken(tokenHash: string): number {
    return this.replayAttemptsByToken.increment(tokenHash, 0, 1);
  }

  /**
   * Get replay attempts for token
   */
  public getReplayAttemptsByToken(tokenHash: string): number {
    return this.replayAttemptsByToken.get(tokenHash) ?? 0;
  }

  /**
   * Record rate limit violation
   */
  public recordRateLimitByRoute(route: string): number {
    return this.rateLimitsByRoute.increment(route, 0, 1);
  }

  /**
   * Record workspace denial
   */
  public recordWorkspaceDenial(workspaceId: string): number {
    return this.workspaceDenialsByWorkspace.increment(workspaceId, 0, 1);
  }

  /**
   * Get system-wide stats
   */
  public getStats() {
    return {
      authFailuresByIp: this.authFailuresByIp.getStats(),
      authFailuresByActor: this.authFailuresByActor.getStats(),
      replayAttemptsByToken: this.replayAttemptsByToken.getStats(),
      rateLimitsByRoute: this.rateLimitsByRoute.getStats(),
      workspaceDenialsByWorkspace: this.workspaceDenialsByWorkspace.getStats(),
    };
  }

  /**
   * Check if IP is under attack (heuristic)
   */
  public isIpUnderAttack(ip: string, threshold: number = 50): boolean {
    return this.getAuthFailuresByIp(ip) > threshold;
  }

  /**
   * Check if actor is compromised (heuristic)
   */
  public isActorCompromised(actorId: string, threshold: number = 20): boolean {
    return this.getAuthFailuresByActor(actorId) > threshold;
  }

  /**
   * Reset all aggregators (testing only)
   */
  public reset(): void {
    this.authFailuresByIp.clear();
    this.authFailuresByActor.clear();
    this.replayAttemptsByToken.clear();
    this.rateLimitsByRoute.clear();
    this.workspaceDenialsByWorkspace.clear();
  }
}

/**
 * Global security signal aggregators (singleton)
 */
let globalAggregators: SecuritySignalAggregators | null = null;

/**
 * Get or create global aggregators
 */
export function getSecuritySignalAggregators(): SecuritySignalAggregators {
  if (!globalAggregators) {
    globalAggregators = new SecuritySignalAggregators();
  }
  return globalAggregators;
}

/**
 * Reset global aggregators (testing only)
 */
export function resetSecuritySignalAggregators(): void {
  globalAggregators = null;
}
