/**
 * QuickBooks Online — per-realm request limiter.
 *
 * Intuit's documented limits are per realm: 500 requests/minute, 10 requests/second (per realm and
 * app), 10 concurrent requests; throttled calls get HTTP 429. This limiter makes OpsIQ stay under
 * them during normal operation: every API call acquires a permit for its realm first.
 *
 * SCOPE: PROCESS_LOCAL. State lives in this process's memory. On serverless / multi-instance hosting
 * (Vercel) each instance has its own limiter, so the limits are enforced per instance, NOT globally
 * across instances. The defaults deliberately sit below the provider limits to leave headroom, and a
 * 429 still triggers a bounded, realm-wide backoff (penalize) — but N concurrent instances working on
 * the same realm can together exceed the limit. A correct distributed limiter needs shared state and
 * belongs with the sync/scheduling PR (one sync lease per connector already serialises most work).
 *
 * Properties: per-realm isolation; sliding windows (not fixed buckets); a bounded FIFO queue per realm;
 * a bounded number of tracked realms (idle ones are evicted); AbortSignal cancellation; no timers left
 * running when idle; injectable clock/timers for deterministic tests.
 */

import { QboProviderError } from "@/domain/quickbooks/qbo-errors";

export const QBO_LIMITER_SCOPE = "PROCESS_LOCAL" as const;

export interface QboRateLimiterOptions {
  /** Requests started per rolling second, per realm. Provider limit 10; default 9. */
  perSecond?: number;
  /** Requests started per rolling minute, per realm. Provider limit 500; default 450. */
  perMinute?: number;
  /** Concurrent in-flight requests per realm. Provider limit 10; default 8. */
  maxConcurrent?: number;
  /** Waiters allowed to queue per realm before new callers are refused. Default 200. */
  maxQueuePerRealm?: number;
  /** Distinct realms tracked at once. Default 1000. */
  maxRealms?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface QboRatePermit {
  /** Release the concurrency slot. Idempotent. */
  release(): void;
}

interface Waiter {
  resolve: (permit: QboRatePermit) => void;
  reject: (err: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface RealmState {
  starts: number[]; // grant timestamps, ascending, trimmed to the last minute
  inFlight: number;
  queue: Waiter[];
  blockedUntil: number;
  timer: unknown;
}

const SECOND = 1000;
const MINUTE = 60_000;

export class QboRealmRateLimiter {
  private readonly perSecond: number;
  private readonly perMinute: number;
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private readonly maxRealms: number;
  private readonly clock: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly realms = new Map<string, RealmState>();

  constructor(options: QboRateLimiterOptions = {}) {
    this.perSecond = options.perSecond ?? 9;
    this.perMinute = options.perMinute ?? 450;
    this.maxConcurrent = options.maxConcurrent ?? 8;
    this.maxQueue = options.maxQueuePerRealm ?? 200;
    this.maxRealms = options.maxRealms ?? 1000;
    for (const n of [this.perSecond, this.perMinute, this.maxConcurrent, this.maxQueue, this.maxRealms]) {
      if (!Number.isInteger(n) || n < 1) throw new Error("QboRealmRateLimiter limits must be positive integers.");
    }
    this.clock = options.now ?? (() => Date.now());
    this.setTimer =
      options.setTimer ??
      ((fn, ms) => {
        const handle = setTimeout(fn, ms);
        (handle as { unref?: () => void }).unref?.();
        return handle;
      });
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Wait for permission to start one request against `realmId`. */
  acquire(realmId: string, options: { signal?: AbortSignal } = {}): Promise<QboRatePermit> {
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(new QboProviderError({ kind: "CANCELLED" }));

    let state = this.realms.get(realmId);
    if (!state) {
      // New realm: drop idle realms first (cheap, and only when a realm is first seen), so memory
      // tracks activity from the last minute rather than every realm ever seen.
      this.evictIdle();
      if (this.realms.size >= this.maxRealms) {
        return Promise.reject(new QboProviderError({ kind: "RATE_LIMITED", localReason: "LOCAL_REALM_CAPACITY" }));
      }
      state = { starts: [], inFlight: 0, queue: [], blockedUntil: 0, timer: null };
      this.realms.set(realmId, state);
    }
    if (state.queue.length >= this.maxQueue) {
      return Promise.reject(new QboProviderError({ kind: "RATE_LIMITED", localReason: "LOCAL_QUEUE_FULL" }));
    }

    return new Promise<QboRatePermit>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      if (signal) {
        waiter.onAbort = () => {
          const s = this.realms.get(realmId);
          if (s) {
            const i = s.queue.indexOf(waiter);
            if (i >= 0) s.queue.splice(i, 1);
          }
          reject(new QboProviderError({ kind: "CANCELLED" }));
          if (s) {
            // Nobody left waiting: do not leave a wake-up timer running for an empty queue.
            if (s.queue.length === 0 && s.timer !== null) {
              this.clearTimer(s.timer);
              s.timer = null;
            }
            this.settle(realmId, s);
          }
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      state!.queue.push(waiter);
      this.pump(realmId, state!);
    });
  }

  /**
   * Hold the whole realm back after a 429: nothing new starts for `delayMs`. Bounded so one bad
   * header cannot park a realm indefinitely.
   */
  penalize(realmId: string, delayMs: number, maxMs: number = 120_000): void {
    const state = this.realms.get(realmId);
    if (!state) return;
    const bounded = Math.min(Math.max(0, delayMs), maxMs);
    state.blockedUntil = Math.max(state.blockedUntil, this.clock() + bounded);
  }

  /** Test/diagnostic view. */
  stats(realmId: string): { queued: number; inFlight: number; startsLastMinute: number } | null {
    const s = this.realms.get(realmId);
    if (!s) return null;
    this.trim(s, this.clock());
    return { queued: s.queue.length, inFlight: s.inFlight, startsLastMinute: s.starts.length };
  }

  get trackedRealms(): number {
    return this.realms.size;
  }

  // ── internals ──────────────────────────────────────────────────────────

  private trim(state: RealmState, now: number): void {
    let i = 0;
    while (i < state.starts.length && state.starts[i] <= now - MINUTE) i++;
    if (i > 0) state.starts.splice(0, i);
  }

  /** Milliseconds until a new request could start under the rate windows and any penalty (0 = now). */
  private rateDelay(state: RealmState, now: number): number {
    let delay = Math.max(0, state.blockedUntil - now);
    const s = state.starts;
    if (s.length >= this.perSecond) {
      delay = Math.max(delay, s[s.length - this.perSecond] + SECOND - now);
    }
    if (s.length >= this.perMinute) {
      delay = Math.max(delay, s[s.length - this.perMinute] + MINUTE - now);
    }
    return Math.max(0, delay);
  }

  private pump(realmId: string, state: RealmState): void {
    if (state.timer !== null) return; // a wake-up is already scheduled
    for (;;) {
      if (state.queue.length === 0) break;
      const now = this.clock();
      this.trim(state, now);
      if (state.inFlight >= this.maxConcurrent) return; // a release() will pump again
      const delay = this.rateDelay(state, now);
      if (delay > 0) {
        state.timer = this.setTimer(() => {
          state.timer = null;
          this.pump(realmId, state);
        }, Math.ceil(delay));
        return;
      }
      const waiter = state.queue.shift()!;
      if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener("abort", waiter.onAbort);
      state.starts.push(now);
      state.inFlight++;
      let released = false;
      waiter.resolve({
        release: () => {
          if (released) return;
          released = true;
          state.inFlight--;
          this.pump(realmId, state);
          this.settle(realmId, state);
        },
      });
    }
    this.settle(realmId, state);
  }

  /** Drop a realm's state once nothing is queued, running, or still inside a rate window. */
  private settle(realmId: string, state: RealmState): void {
    if (state.queue.length > 0 || state.inFlight > 0 || state.timer !== null) return;
    const now = this.clock();
    this.trim(state, now);
    if (state.starts.length === 0 && state.blockedUntil <= now && this.realms.get(realmId) === state) {
      this.realms.delete(realmId);
    }
  }

  private evictIdle(): void {
    const now = this.clock();
    for (const [id, s] of this.realms) {
      if (s.queue.length === 0 && s.inFlight === 0 && s.timer === null) {
        this.trim(s, now);
        if (s.starts.length === 0 && s.blockedUntil <= now) this.realms.delete(id);
      }
    }
  }
}

/** Shared limiter for production use within one process. */
let sharedLimiter: QboRealmRateLimiter | null = null;
export function getSharedQboRateLimiter(): QboRealmRateLimiter {
  if (!sharedLimiter) sharedLimiter = new QboRealmRateLimiter();
  return sharedLimiter;
}
/** Tests only. */
export function _resetSharedQboRateLimiterForTest(): void {
  sharedLimiter = null;
}
