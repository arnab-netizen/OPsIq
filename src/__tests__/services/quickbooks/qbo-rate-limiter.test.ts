import { describe, it, expect } from "vitest";
import { QboRealmRateLimiter, QBO_LIMITER_SCOPE } from "@/services/quickbooks/qbo-rate-limiter";
import { QboProviderError } from "@/domain/quickbooks/qbo-errors";

/** Deterministic clock + timer queue: nothing here depends on real time. */
function manualClock() {
  let now = 1_000_000;
  const timers: Array<{ at: number; fn: () => void; id: number; cancelled: boolean }> = [];
  let nextId = 1;
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const t = { at: now + ms, fn, id: nextId++, cancelled: false };
      timers.push(t);
      return t;
    },
    clearTimer: (h: unknown) => {
      (h as { cancelled: boolean }).cancelled = true;
    },
    activeTimers: () => timers.filter((t) => !t.cancelled && t.at >= 0).length,
    /** Advance time, firing due timers in order and letting promise callbacks run between them. */
    async advance(ms: number) {
      await drain(); // let already-granted permits record their (still current) time before time moves
      const target = now + ms;
      for (;;) {
        const due = timers.filter((t) => !t.cancelled && t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = Math.max(now, due.at);
        due.cancelled = true;
        due.fn();
        await drain();
      }
      now = target;
      await drain();
    },
  };
}

/** Let every pending promise continuation run (real 0ms timer; the virtual clock is untouched). */
function drain(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
async function flush() {
  await drain();
}

function make(over: ConstructorParameters<typeof QboRealmRateLimiter>[0] = {}) {
  const clock = manualClock();
  const limiter = new QboRealmRateLimiter({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...over });
  return { clock, limiter };
}

/** Acquire and immediately release, recording the (virtual) start time. */
function startRecorder(limiter: QboRealmRateLimiter, clock: { now: () => number }, realm: string) {
  const starts: number[] = [];
  const run = async () => {
    const p = await limiter.acquire(realm);
    starts.push(clock.now());
    p.release();
  };
  return { starts, run };
}

describe("QboRealmRateLimiter", () => {
  it("is process-local (documented scope)", () => {
    expect(QBO_LIMITER_SCOPE).toBe("PROCESS_LOCAL");
  });

  it("per-second boundary: never more than perSecond starts in any rolling 1000ms", async () => {
    const { clock, limiter } = make({ perSecond: 10, perMinute: 500, maxConcurrent: 100 });
    const rec = startRecorder(limiter, clock, "111");
    const all = Array.from({ length: 35 }, () => rec.run());
    await clock.advance(5000);
    await Promise.all(all);
    expect(rec.starts).toHaveLength(35);
    for (let i = 0; i < rec.starts.length; i++) {
      const windowEnd = rec.starts[i];
      const inWindow = rec.starts.filter((t) => t > windowEnd - 1000 && t <= windowEnd).length;
      expect(inWindow).toBeLessThanOrEqual(10);
    }
    expect(rec.starts.slice(0, 10).every((t) => t === rec.starts[0])).toBe(true); // a full burst is allowed immediately
    expect(rec.starts[10] - rec.starts[0]).toBeGreaterThanOrEqual(1000);
  });

  it("per-minute window: perMinute starts, then the next waits until the oldest ages out", async () => {
    const { clock, limiter } = make({ perSecond: 1000, perMinute: 5, maxConcurrent: 100 });
    const rec = startRecorder(limiter, clock, "111");
    const t0 = clock.now();
    const batch = Array.from({ length: 7 }, () => rec.run());
    await flush();
    expect(rec.starts).toHaveLength(5);
    await clock.advance(59_000);
    expect(rec.starts).toHaveLength(5); // still inside the minute
    await clock.advance(1_001);
    await Promise.all(batch);
    expect(rec.starts).toHaveLength(7);
    expect(rec.starts[5] - t0).toBeGreaterThanOrEqual(60_000);
  });

  it("concurrency cap: a permit is required until release()", async () => {
    const { limiter } = make({ perSecond: 1000, perMinute: 100000, maxConcurrent: 2 });
    const a = await limiter.acquire("111");
    const b = await limiter.acquire("111");
    let thirdGranted = false;
    const third = limiter.acquire("111").then((p) => {
      thirdGranted = true;
      return p;
    });
    await flush();
    expect(thirdGranted).toBe(false);
    a.release();
    a.release(); // idempotent: must not free a second slot
    await flush();
    expect(thirdGranted).toBe(true);
    const fourthPending = limiter.acquire("111");
    let fourthGranted = false;
    void fourthPending.then(() => (fourthGranted = true));
    await flush();
    expect(fourthGranted).toBe(false); // b + third still hold both slots
    b.release();
    (await third).release();
    await flush();
    expect(fourthGranted).toBe(true);
  });

  it("realms are isolated: a saturated realm does not delay another", async () => {
    const { clock, limiter } = make({ perSecond: 2, perMinute: 500, maxConcurrent: 100 });
    const a = startRecorder(limiter, clock, "111");
    const b = startRecorder(limiter, clock, "222");
    const aAll = Array.from({ length: 6 }, () => a.run());
    const bAll = Array.from({ length: 2 }, () => b.run());
    await flush();
    expect(b.starts).toHaveLength(2); // realm 222 started immediately
    expect(a.starts).toHaveLength(2); // realm 111 is throttled after 2
    await clock.advance(3000);
    await Promise.all([...aAll, ...bAll]);
    expect(a.starts).toHaveLength(6);
  });

  it("queue is bounded per realm: overflow is refused immediately, not buffered", async () => {
    const { limiter } = make({ perSecond: 1, perMinute: 500, maxConcurrent: 1, maxQueuePerRealm: 3 });
    const held = await limiter.acquire("111");
    const queued = [limiter.acquire("111"), limiter.acquire("111"), limiter.acquire("111")];
    const overflow = await limiter.acquire("111").catch((e) => e);
    expect(overflow).toBeInstanceOf(QboProviderError);
    expect(overflow.kind).toBe("RATE_LIMITED");
    expect(overflow.localReason).toBe("LOCAL_QUEUE_FULL");
    expect(limiter.stats("111")!.queued).toBe(3);
    // another realm is unaffected
    const other = await limiter.acquire("222");
    other.release();
    held.release();
    for (const q of queued) q.catch(() => {});
  });

  it("tracked realms are bounded and idle realms are evicted", async () => {
    const { clock, limiter } = make({ maxRealms: 3 });
    for (const r of ["1", "2", "3"]) (await limiter.acquire(r)).release();
    expect(limiter.trackedRealms).toBe(3);
    const refused = await limiter.acquire("4").catch((e) => e);
    expect(refused.localReason).toBe("LOCAL_REALM_CAPACITY"); // all three still inside their 60s window
    await clock.advance(61_000);
    (await limiter.acquire("4")).release();
    expect(limiter.trackedRealms).toBeLessThanOrEqual(3);
  });

  it("memory returns to baseline when idle: no realm state and no timers left", async () => {
    const { clock, limiter } = make();
    for (let i = 0; i < 20; i++) (await limiter.acquire(`r${i}`)).release();
    await clock.advance(61_000);
    (await limiter.acquire("final")).release();
    await clock.advance(61_000);
    expect(limiter.trackedRealms).toBeLessThanOrEqual(1);
    expect(clock.activeTimers()).toBe(0);
  });

  describe("cancellation", () => {
    it("an already-aborted signal is rejected without queueing", async () => {
      const { limiter } = make();
      const ac = new AbortController();
      ac.abort();
      const e = await limiter.acquire("111", { signal: ac.signal }).catch((x) => x);
      expect(e.kind).toBe("CANCELLED");
      expect(limiter.stats("111")).toBeNull();
    });

    it("aborting a queued waiter removes it, frees its queue slot and leaves no timer", async () => {
      const { clock, limiter } = make({ perSecond: 1, maxConcurrent: 100 });
      (await limiter.acquire("111")).release(); // consumes the per-second budget
      const ac = new AbortController();
      const waiting = limiter.acquire("111", { signal: ac.signal }).catch((x) => x);
      await flush();
      expect(limiter.stats("111")!.queued).toBe(1);
      expect(clock.activeTimers()).toBe(1);
      ac.abort();
      const e = await waiting;
      expect(e.kind).toBe("CANCELLED");
      expect(limiter.stats("111")!.queued).toBe(0);
      expect(clock.activeTimers()).toBe(0);
      // the realm still works afterwards
      const next = limiter.acquire("111");
      await clock.advance(1100);
      (await next).release();
    });
  });

  describe("429 penalty", () => {
    it("holds the whole realm back for the penalty, bounded, and other realms are unaffected", async () => {
      const { clock, limiter } = make();
      (await limiter.acquire("111")).release();
      limiter.penalize("111", 30_000);
      const rec = startRecorder(limiter, clock, "111");
      const t0 = clock.now();
      const p = rec.run();
      const other = await limiter.acquire("222");
      other.release();
      await flush();
      expect(rec.starts).toHaveLength(0);
      await clock.advance(29_000);
      expect(rec.starts).toHaveLength(0);
      await clock.advance(1_100);
      await p;
      expect(rec.starts[0] - t0).toBeGreaterThanOrEqual(30_000);
    });

    it("a hostile Retry-After cannot park a realm beyond the bound", async () => {
      const { clock, limiter } = make();
      (await limiter.acquire("111")).release();
      limiter.penalize("111", 24 * 3600 * 1000);
      const rec = startRecorder(limiter, clock, "111");
      const p = rec.run();
      await clock.advance(120_001);
      await p;
      expect(rec.starts).toHaveLength(1);
    });
  });

  it("rejects non-positive limits at construction", () => {
    expect(() => new QboRealmRateLimiter({ perSecond: 0 })).toThrow();
    expect(() => new QboRealmRateLimiter({ maxQueuePerRealm: -1 })).toThrow();
  });
});
