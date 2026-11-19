// @vitest-environment node
/**
 * PHASE RP3: Operational Survivability Runtime Proofs
 *
 * Every test here drives the REAL production module and asserts an exact
 * observable outcome. The previous revision of this file was false green
 * (22 `expect(true).toBe(true)` placeholders, conditional early returns that
 * skipped every assertion when no HTTP server was listening, a probe of a
 * `/api/metrics` route that does not exist, and a STRIPE_WEBHOOK_SECRET read
 * whose value was ignored).
 *
 * Units under test (all current):
 *   - src/runtime/resilience/circuit-breaker.ts   (CircuitBreaker, RetryBudget, RequestShedding)
 *   - src/runtime/queue/queue-durability.ts       (retry / poison / dead-letter / replay / idempotency)
 *   - src/lib/enforced-queue-worker.ts            (context propagation, structured logs, governed errors)
 *   - src/runtime/runtime-logger.ts               (structured JSON entry shape, stdout emission)
 *   - src/app/api/health|readiness|liveness/route.ts, called in-process against the
 *     real PostgreSQL database, and against an unreachable database injected through
 *     the DB module's real configuration seam (DATABASE_URL + a fresh module graph).
 *
 * Requirements from the previous revision that were REMOVED or RESTATED because
 * the claimed contract does not exist in the codebase:
 *   - "/api/metrics exposes Prometheus metrics": REMOVED. There is no
 *     src/app/api/metrics/route.ts; only the domain metric routes
 *     /api/metrics/control-effectiveness and /api/metrics/decision-latency exist,
 *     and neither emits Prometheus exposition format.
 *   - "missing STRIPE_WEBHOOK_SECRET blocks startup": RESTATED to the current
 *     contract (RP3-5). configValidator classifies it as an optional-service
 *     WARNING (never a startup ERROR), and verifyWebhookSignature() fails closed
 *     per request when it is absent.
 *   - "missing DATABASE_URL blocks database operations": RESTATED (RP3-5) as
 *     the DB module refusing to build a client.
 *   - graceful shutdown / connection-pool drain / error-log rate limiting /
 *     request-duration + error-rate metrics endpoints: REMOVED. No SIGTERM/SIGINT
 *     handler, pool-drain hook, log rate limiter or metrics endpoint exists in
 *     src/ (rg 'SIGTERM|SIGINT|beforeExit' src/ has no non-test match).
 *   - "degrades gracefully under memory pressure": owned by
 *     src/__tests__/api/health-memory-contract.test.ts (CRITICAL -> 503,
 *     HIGH -> warning/200), which injects pressure through @/infra/memory-pressure.
 *
 * Non-DB unit coverage that already exists and is NOT duplicated here:
 *   - src/__tests__/phase-i/phase-i-runtime-discipline.test.ts (I5/I6 basics)
 *   - src/__tests__/phase-i/phase-i10-queue-enforcement.test.ts (worker wrapper unit)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  CircuitBreaker,
  RetryBudget,
  RequestShedding,
  type CircuitBreakerConfig,
} from "@/runtime/resilience/circuit-breaker";
import { queueDurabilityEngine, type QueueJob } from "@/runtime/queue/queue-durability";
import { withEnforcedQueueWorker } from "@/lib/enforced-queue-worker";
import { runtimeLogger, type StructuredLogEntry } from "@/runtime/runtime-logger";
import { requestContext } from "@/runtime/request-context";
import { RuntimeError } from "@/runtime/runtime-errors";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { db, getDbInstance } from "@/lib/db";

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function uniqueKey(label: string): string {
  return `rp3-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// 1. Circuit breaker state machine
// ---------------------------------------------------------------------------
describe("RP3-1 circuit breaker state machine (src/runtime/resilience/circuit-breaker.ts)", () => {
  const T0 = new Date("2026-01-01T00:00:00.000Z").getTime();
  const config: CircuitBreakerConfig = {
    failure_threshold: 50, // percent
    success_threshold: 2,
    timeout_ms: 1000,
    min_requests_before_eval: 4,
    max_concurrent_requests: 2,
  };

  const ok = () => Promise.resolve("ok");
  const boom = () => Promise.reject(new Error("downstream failure"));

  async function drive(breaker: CircuitBreaker, outcomes: Array<"S" | "F">): Promise<void> {
    for (const o of outcomes) {
      if (o === "S") {
        await expect(breaker.execute(ok)).resolves.toBe("ok");
      } else {
        await expect(breaker.execute(boom)).rejects.toThrow("downstream failure");
      }
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not evaluate the threshold before min_requests_before_eval (3 failures of 3 stay CLOSED)", async () => {
    const breaker = new CircuitBreaker(config);
    await drive(breaker, ["F", "F", "F"]);
    expect(breaker.getMetrics()).toMatchObject({ state: "CLOSED", failures: 3, total_requests: 3, failure_rate: 100 });
  });

  it("stays CLOSED when the failure rate (25%) is below the 50% threshold", async () => {
    const breaker = new CircuitBreaker(config);
    await drive(breaker, ["S", "S", "S", "F"]);
    expect(breaker.getMetrics()).toMatchObject({ state: "CLOSED", failures: 1, successes: 3, total_requests: 4, failure_rate: 25 });
  });

  it("stays CLOSED at exactly the threshold (50% is not > 50%)", async () => {
    const breaker = new CircuitBreaker(config);
    await drive(breaker, ["S", "S", "F", "F"]);
    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.getMetrics().failure_rate).toBe(50);
  });

  it("opens once the failure rate exceeds the threshold (3 of 4 = 75%)", async () => {
    const breaker = new CircuitBreaker(config);
    await drive(breaker, ["S", "F", "F", "F"]);
    const m = breaker.getMetrics();
    expect(m.state).toBe("OPEN");
    expect(m.failure_rate).toBe(75);
    expect(m.opened_at?.getTime()).toBe(T0);
  });

  it("fails fast while OPEN: the protected call is never invoked and the error names the wait", async () => {
    const breaker = new CircuitBreaker(config);
    await drive(breaker, ["S", "F", "F", "F"]);
    const protectedCall = vi.fn(ok);

    vi.setSystemTime(T0 + 400);
    await expect(breaker.execute(protectedCall)).rejects.toThrow("Circuit breaker OPEN. Retry after 600ms");
    // Boundary: elapsed === timeout_ms is still OPEN (strict `>`).
    vi.setSystemTime(T0 + 1000);
    await expect(breaker.execute(protectedCall)).rejects.toThrow("Circuit breaker OPEN. Retry after 0ms");

    expect(protectedCall).toHaveBeenCalledTimes(0);
    expect(breaker.getMetrics()).toMatchObject({ state: "OPEN", total_requests: 4 });
  });

  it("after the timeout admits a HALF_OPEN trial and needs success_threshold (2) half-open successes to CLOSE", async () => {
    const breaker = new CircuitBreaker(config);
    await drive(breaker, ["S", "F", "F", "F"]);

    vi.setSystemTime(T0 + 1001);
    const trial = vi.fn(ok);
    await expect(breaker.execute(trial)).resolves.toBe("ok");
    expect(trial).toHaveBeenCalledTimes(1);
    // One half-open success is not enough; the success recorded before opening must not count.
    expect(breaker.getState()).toBe("HALF_OPEN");

    await expect(breaker.execute(trial)).resolves.toBe("ok");
    expect(trial).toHaveBeenCalledTimes(2);
    expect(breaker.getMetrics()).toMatchObject({
      state: "CLOSED",
      failures: 0,
      successes: 0,
      total_requests: 0,
      failure_rate: 0,
    });
    expect(breaker.getMetrics().opened_at).toBeUndefined();
  });

  it("a failed HALF_OPEN trial re-opens the circuit with a fresh opened_at", async () => {
    const breaker = new CircuitBreaker(config);
    await drive(breaker, ["S", "F", "F", "F"]);

    vi.setSystemTime(T0 + 1500);
    await expect(breaker.execute(boom)).rejects.toThrow("downstream failure");
    const m = breaker.getMetrics();
    expect(m.state).toBe("OPEN");
    expect(m.opened_at?.getTime()).toBe(T0 + 1500);

    // The new OPEN window is measured from the re-open, not the original open.
    vi.setSystemTime(T0 + 2100);
    await expect(breaker.execute(ok)).rejects.toThrow("Circuit breaker OPEN. Retry after 400ms");
  });

  it("a failed HALF_OPEN trial re-opens even when the pre-open history would dilute the failure rate", async () => {
    const wide: CircuitBreakerConfig = { ...config, success_threshold: 5, min_requests_before_eval: 10 };
    const breaker = new CircuitBreaker(wide);
    // 4 successes then 6 failures: 60% of 10 opens the circuit.
    await drive(breaker, ["S", "S", "S", "S", "F", "F", "F", "F", "F", "F"]);
    expect(breaker.getState()).toBe("OPEN");

    vi.setSystemTime(T0 + 1001);
    await drive(breaker, ["S", "S", "S"]);
    expect(breaker.getState()).toBe("HALF_OPEN");
    // The lifetime rate here would be 7/14 = 50% (not above threshold); the trial failure must still re-open.
    await expect(breaker.execute(boom)).rejects.toThrow("downstream failure");
    expect(breaker.getState()).toBe("OPEN");
    // And it does not close after further successes without a new timeout.
    await expect(breaker.execute(ok)).rejects.toThrow("Circuit breaker OPEN");
  });

  it("sheds load above max_concurrent_requests without invoking the call, then recovers", async () => {
    const breaker = new CircuitBreaker(config);
    const releases: Array<() => void> = [];
    const slow = () => new Promise<string>((resolve) => releases.push(() => resolve("slow-ok")));

    const first = breaker.execute(slow);
    const second = breaker.execute(slow);
    const shedCall = vi.fn(ok);
    await expect(breaker.execute(shedCall)).rejects.toThrow(
      "Request shedding - max concurrent requests (2) exceeded",
    );
    expect(shedCall).toHaveBeenCalledTimes(0);
    // A shed request is not an outcome of the downstream and is not counted.
    expect(breaker.getMetrics().total_requests).toBe(0);

    releases.forEach((release) => release());
    await expect(first).resolves.toBe("slow-ok");
    await expect(second).resolves.toBe("slow-ok");
    await expect(breaker.execute(shedCall)).resolves.toBe("ok");
    expect(shedCall).toHaveBeenCalledTimes(1);
    expect(breaker.getMetrics()).toMatchObject({ state: "CLOSED", successes: 3, total_requests: 3 });
  });

  it("RetryBudget refuses retries once spent and refills after its reset interval", () => {
    const budget = new RetryBudget(2, 1000);
    expect(budget.canRetry()).toBe(true);
    budget.recordRetry();
    budget.recordRetry();
    expect(budget.canRetry()).toBe(false);
    expect(budget.getRemainingBudget()).toBe(0);

    vi.setSystemTime(T0 + 1000); // not yet (> interval required)
    expect(budget.canRetry()).toBe(false);
    vi.setSystemTime(T0 + 1001);
    expect(budget.getRemainingBudget()).toBe(2);
    expect(budget.canRetry()).toBe(true);
  });

  it("RequestShedding rejects enqueue at capacity and accepts again after dequeue", () => {
    const shedding = new RequestShedding(2);
    shedding.enqueue();
    shedding.enqueue();
    expect(shedding.getQueueUtilization()).toBe(100);
    expect(() => shedding.enqueue()).toThrow("Request queue full - request shedding active");
    expect(shedding.getQueueSize()).toBe(2);
    shedding.dequeue();
    expect(shedding.canAccept()).toBe(true);
    shedding.enqueue();
    expect(shedding.getQueueSize()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. Queue retry bounding, poison detection and dead-letter behaviour,
//    driven through the real enforced worker wrapper.
// ---------------------------------------------------------------------------
describe("RP3-2 queue retry / dead-letter through withEnforcedQueueWorker (queue-durability.ts + enforced-queue-worker.ts)", () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    runtimeLogger.clearLogs();
    stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    stdout.mockRestore();
  });

  function enqueue(label: string, maxRetries: number, payload: Record<string, unknown> = {}): QueueJob {
    return queueDurabilityEngine.enqueueJob(
      "rp3_queue",
      uniqueKey(label),
      payload,
      uniqueKey(`corr-${label}`),
      undefined,
      "ws-rp3",
      maxRetries,
    );
  }

  async function attempt(job: QueueJob, processor: (j: QueueJob) => Promise<Record<string, unknown>>) {
    return queueDurabilityEngine.processJob(job.job_id, (j) => withEnforcedQueueWorker(processor, j));
  }

  it("a permanently failing job is attempted exactly max_retries (3) times, then dead-lettered and never retried", async () => {
    const dlqBefore = queueDurabilityEngine.getDeadLetterQueue().length;
    const job = enqueue("perma-fail", 3);
    const processor = vi.fn(async () => {
      throw new Error("downstream rejected the payload");
    });

    // Attempts 1 and 2: transient failure, job goes back to ENQUEUED with the count advanced.
    for (const expectedRetryCount of [1, 2]) {
      await expect(attempt(job, processor)).rejects.toThrow("downstream rejected the payload");
      expect(queueDurabilityEngine.getJob(job.job_id)).toMatchObject({
        status: "ENQUEUED",
        retry_count: expectedRetryCount,
      });
    }

    // Attempt 3: the worker converts the final failure into a governed infrastructure error.
    const finalError = await attempt(job, processor).then(
      () => {
        throw new Error("expected the third attempt to fail");
      },
      (e: unknown) => e,
    );
    expect(finalError).toBeInstanceOf(RuntimeError);
    expect((finalError as RuntimeError).metadata).toMatchObject({
      classification: "INFRASTRUCTURE",
      error_code: "ERR_INFRASTRUCTURE_001",
      http_status: 500,
    });

    const dead = queueDurabilityEngine.getJob(job.job_id);
    expect(dead).toMatchObject({ status: "DEAD_LETTER", retry_count: 3 });
    expect(dead?.error_message).toBe(
      classifyOperatorError(finalError as Error, { context: "load" }).operatorMessage,
    );
    expect(queueDurabilityEngine.getDeadLetterQueue().length).toBe(dlqBefore + 1);

    // Attempt 4: refused by the engine before the processor runs.
    await expect(attempt(job, processor)).rejects.toThrow(`Job in dead-letter queue: ${job.job_id}`);
    expect(processor).toHaveBeenCalledTimes(3);
    expect(queueDurabilityEngine.getJob(job.job_id)?.retry_count).toBe(3);
  });

  it("the poison threshold (5) dead-letters a job even when max_retries is higher (10)", async () => {
    const job = enqueue("poison", 10, { malformed: true });
    const processor = vi.fn(async () => {
      throw new Error("cannot parse payload");
    });

    for (let i = 1; i <= 4; i++) {
      await expect(attempt(job, processor)).rejects.toThrow("cannot parse payload");
      expect(queueDurabilityEngine.getJob(job.job_id)?.status).toBe("ENQUEUED");
    }
    await expect(attempt(job, processor)).rejects.toThrow("cannot parse payload");
    expect(queueDurabilityEngine.getJob(job.job_id)).toMatchObject({ status: "DEAD_LETTER", retry_count: 5 });
    expect(queueDurabilityEngine.getDeadLetterQueue().some((j) => j.job_id === job.job_id)).toBe(true);

    await expect(attempt(job, processor)).rejects.toThrow(`Job in dead-letter queue: ${job.job_id}`);
    expect(processor).toHaveBeenCalledTimes(5);
  });

  it("a transient failure followed by success completes once; re-processing and re-enqueue are idempotent", async () => {
    const job = enqueue("transient", 3);
    let calls = 0;
    const processor = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("temporary outage");
      return { delivered: true };
    });

    await expect(attempt(job, processor)).rejects.toThrow("temporary outage");
    await expect(attempt(job, processor)).resolves.toBeUndefined();
    expect(queueDurabilityEngine.getJob(job.job_id)).toMatchObject({ status: "COMPLETED", retry_count: 1 });

    // Completed job: processing again is a no-op (processor not invoked).
    await expect(attempt(job, processor)).resolves.toBeUndefined();
    expect(processor).toHaveBeenCalledTimes(2);

    // Same idempotency key after completion returns the same job, not a new one.
    const again = queueDurabilityEngine.enqueueJob(
      "rp3_queue",
      job.idempotency_key,
      {},
      job.correlation_id,
      undefined,
      "ws-rp3",
      3,
    );
    expect(again.job_id).toBe(job.job_id);
    expect(again.status).toBe("COMPLETED");
    expect(queueDurabilityEngine.getDeadLetterQueue().some((j) => j.job_id === job.job_id)).toBe(false);
  });

  it("replayFromDeadLetter resets the job, removes it from the DLQ, and it can then complete", async () => {
    const job = enqueue("replay", 1);
    await expect(
      attempt(job, async () => {
        throw new Error("first run fails");
      }),
    ).rejects.toBeInstanceOf(RuntimeError);
    expect(queueDurabilityEngine.getJob(job.job_id)?.status).toBe("DEAD_LETTER");
    const dlqWithJob = queueDurabilityEngine.getDeadLetterQueue().length;

    queueDurabilityEngine.replayFromDeadLetter(job.job_id);
    expect(queueDurabilityEngine.getDeadLetterQueue().length).toBe(dlqWithJob - 1);
    expect(queueDurabilityEngine.getJob(job.job_id)).toMatchObject({
      status: "ENQUEUED",
      retry_count: 0,
      error_message: undefined,
    });
    expect(() => queueDurabilityEngine.replayFromDeadLetter(job.job_id)).toThrow(
      `Job not in dead-letter queue: ${job.job_id}`,
    );

    await expect(attempt(job, async () => ({ ok: true }))).resolves.toBeUndefined();
    expect(queueDurabilityEngine.getJob(job.job_id)?.status).toBe("COMPLETED");
  });

  it("emits the exact worker log sequence for a job that fails, retries and dead-letters", async () => {
    const job = enqueue("log-seq", 2);
    const processor = async () => {
      throw new Error("still failing");
    };
    await expect(attempt(job, processor)).rejects.toThrow("still failing");
    await expect(attempt(job, processor)).rejects.toBeInstanceOf(RuntimeError);

    const tags = runtimeLogger.getLogsByCorrelationId(job.correlation_id).map((l) => l.tags);
    expect(tags).toEqual([
      ["queue_job_start"],
      ["queue_job_failure", "queue_will_retry"],
      ["queue_job_error"],
      ["queue_job_start"],
      ["queue_poison_job", "queue_dead_letter"],
      ["queue_job_error"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. Structured logging and correlation-id preservation
// ---------------------------------------------------------------------------
describe("RP3-3 structured logging + correlation id (runtime-logger.ts + request-context.ts)", () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    runtimeLogger.clearLogs();
    stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    stdout.mockRestore();
  });

  it("every entry carries the required fields and is emitted to stdout as the identical JSON object", () => {
    runtimeLogger.logQueueJob("corr-struct-1", "job-1", "rp3_queue", "dead_letter", 12, "terminal");
    const [entry] = runtimeLogger.getLogs();

    expect(entry).toMatchObject({
      level: "ERROR",
      category: "QUEUE",
      message: "Queue job dead_letter",
      correlation_id: "corr-struct-1",
      duration_ms: 12,
      tags: ["queue_job", "queue_rp3_queue", "job_dead_letter"],
      context: { job_id: "job-1", queue_name: "rp3_queue", status: "dead_letter", duration_ms: 12, error: "terminal" },
    });
    expect(entry.timestamp).toMatch(ISO_8601);
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);

    expect(stdout).toHaveBeenCalledTimes(1);
    const emitted = JSON.parse(stdout.mock.calls[0][0] as string) as StructuredLogEntry;
    expect(emitted).toEqual(entry);
  });

  it("the job's correlation id is the ambient context across await boundaries and stamps every worker log", async () => {
    const job = queueDurabilityEngine.enqueueJob(
      "rp3_queue",
      uniqueKey("corr"),
      {},
      "corr-rp3-propagation",
      "exec-rp3-1",
      "ws-rp3",
      3,
    );
    const seen: Array<string | undefined> = [];
    await queueDurabilityEngine.processJob(job.job_id, (j) =>
      withEnforcedQueueWorker(async () => {
        seen.push(requestContext.getContext()?.correlation_id);
        await new Promise((resolve) => setTimeout(resolve, 5));
        seen.push(requestContext.getContext()?.correlation_id);
        await Promise.resolve();
        seen.push(requestContext.getContext()?.workspace_id);
        return { ok: true };
      }, j),
    );

    expect(seen).toEqual(["corr-rp3-propagation", "corr-rp3-propagation", "ws-rp3"]);
    // Outside the worker the job's context is gone (no leakage into the caller).
    expect(requestContext.getContext()).toBeUndefined();

    const entries = runtimeLogger.getLogsByCorrelationId("corr-rp3-propagation");
    expect(entries.map((e) => `${e.category}:${e.message}`)).toEqual([
      "QUEUE:Queue job started",
      "QUEUE:Queue job completed successfully",
      // The execution audit log is stamped with the job's correlation id too. Its
      // success/failure wording is decided by execution-enforcer (VERIFIED_SUCCESS
      // only); the worker reports outcome "COMPLETED" — see residual-risk note.
      expect.stringMatching(/^EXECUTION:Execution (completed|failed)$/),
    ]);
    expect(entries[2].context).toMatchObject({ outcome: "COMPLETED" });
    const requestIds = new Set(entries.filter((e) => e.category === "QUEUE").map((e) => e.request_id));
    expect(requestIds.size).toBe(1);
    for (const e of entries) {
      expect(e.correlation_id).toBe("corr-rp3-propagation");
      expect(e.workspace_id).toBe("ws-rp3");
      expect(e.execution_id).toBe("exec-rp3-1");
      expect(e.timestamp).toMatch(ISO_8601);
    }
  });

  it("raw processor error text (credentials) never reaches worker logs, stdout, or the stored job error", async () => {
    const secret = "S3cr3t-Pa55w0rd-rp3";
    const leakyMessage = `connect failed: postgresql://svc_user:${secret}@db.internal:5432/prod`;
    const job = queueDurabilityEngine.enqueueJob(
      "rp3_queue",
      uniqueKey("leak"),
      {},
      "corr-rp3-leak",
      "exec-rp3-leak",
      "ws-rp3",
      3,
    );
    const processor = async () => {
      throw new Error(leakyMessage);
    };
    // Attempts 1-2 take the retry path, attempt 3 the dead-letter path. The raw error is
    // only ever rethrown to the in-process caller, never logged.
    const run = () => queueDurabilityEngine.processJob(job.job_id, (j) => withEnforcedQueueWorker(processor, j));
    await expect(run()).rejects.toThrow(leakyMessage);
    await expect(run()).rejects.toThrow(leakyMessage);
    await expect(run()).rejects.toBeInstanceOf(RuntimeError);

    const entries = runtimeLogger.getLogsByCorrelationId("corr-rp3-leak");
    expect(entries.map((e) => e.tags[0])).toEqual([
      "queue_job_start", "queue_job_failure", "execution_blocked", "queue_job_error",
      "queue_job_start", "queue_job_failure", "execution_blocked", "queue_job_error",
      "queue_job_start", "queue_poison_job", "execution_blocked", "queue_job_error",
    ]);
    const governed = classifyOperatorError(new Error(leakyMessage), { context: "load" }).operatorMessage;
    expect(governed).not.toContain(secret);
    // Every queue log that reports an error reports the governed operator message.
    const queueErrorFields = entries
      .filter((e) => e.category === "QUEUE" && e.context.error !== undefined)
      .map((e) => e.context.error);
    expect(queueErrorFields).toHaveLength(6);
    expect(queueErrorFields.slice(0, 5)).toEqual(Array(5).fill(governed));
    expect(typeof queueErrorFields[5]).toBe("string");
    for (const e of entries) {
      expect(JSON.stringify(e)).not.toContain(secret);
    }
    for (const call of stdout.mock.calls) {
      expect(String(call[0])).not.toContain(secret);
    }
    expect(queueDurabilityEngine.getJob(job.job_id)?.status).toBe("DEAD_LETTER");
    expect(queueDurabilityEngine.getJob(job.job_id)?.error_message).not.toContain(secret);
  });
});

// ---------------------------------------------------------------------------
// 4. Health / readiness / liveness route handlers, in-process.
// ---------------------------------------------------------------------------

type RouteGet = () => Promise<Response>;

interface GlobalPrismaCache {
  prisma?: unknown;
  prismaPromise?: unknown;
  pgPool?: { end?: () => Promise<void> };
}

const UNREACHABLE_SECRET = "unreachable-probe-secret-rp3";
// Port 1 on loopback: nothing listens, so every connection is refused immediately.
const UNREACHABLE_DATABASE_URL = `postgresql://rp3_probe:${UNREACHABLE_SECRET}@127.0.0.1:1/rp3_unreachable`;

/**
 * Run `fn` against a FRESH module graph whose database configuration points at an
 * unreachable server. This injects the failure through the DB module's own seam
 * (src/lib/db.ts reads DATABASE_URL when it builds its pool and caches the client on
 * globalThis), so every route, service and probe executes its real code path and
 * meets a genuinely refused connection. Nothing in the routes is mocked.
 * Passing `databaseUrl: null` removes the configuration entirely instead.
 */
async function withUnreachableDatabase<T>(
  fn: (load: (p: string) => Promise<RouteGet>) => Promise<T>,
  databaseUrl: string | null = UNREACHABLE_DATABASE_URL,
): Promise<T> {
  const g = globalThis as unknown as GlobalPrismaCache;
  const saved = { prisma: g.prisma, prismaPromise: g.prismaPromise, pgPool: g.pgPool };
  const savedUrl = process.env.DATABASE_URL;
  const savedTestUrl = process.env.TEST_DATABASE_URL;

  g.prisma = undefined;
  g.prismaPromise = undefined;
  g.pgPool = undefined;
  if (databaseUrl === null) {
    delete process.env.DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
  } else {
    process.env.DATABASE_URL = databaseUrl;
    process.env.TEST_DATABASE_URL = databaseUrl;
  }
  vi.resetModules();

  try {
    return await fn(async (p) => {
      const mod = (await import(/* @vite-ignore */ p)) as { GET?: RouteGet };
      if (typeof mod.GET !== "function") throw new Error(`${p} does not export a GET handler`);
      return mod.GET;
    });
  } finally {
    const unreachablePool = g.pgPool;
    g.prisma = saved.prisma;
    g.prismaPromise = saved.prismaPromise;
    g.pgPool = saved.pgPool;
    process.env.DATABASE_URL = savedUrl;
    process.env.TEST_DATABASE_URL = savedTestUrl;
    vi.resetModules();
    if (unreachablePool && unreachablePool !== saved.pgPool && unreachablePool.end) {
      await unreachablePool.end();
    }
  }
}

describe("RP3-4 health, readiness and liveness route handlers (in-process, real DB)", () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await getDbInstance();
    stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    stdout.mockRestore();
  });

  describe("database reachable", () => {
    it("GET /api/readiness returns 200 with is_ready:true, startup READY and a healthy database", async () => {
      const { GET } = await import("@/app/api/readiness/route");
      const res = await GET();
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/json");
      expect(body).toMatchObject({
        is_ready: true,
        status: 200,
        startup_complete: true,
        startup_status: "READY",
        database_healthy: true,
        queue_healthy: true,
      });
      expect(typeof body.database_latency_ms).toBe("number");
    });

    it("GET /api/readiness stays serialisable and ready when the webhook queue has pending work", async () => {
      const eventId = uniqueKey("evt");
      await db.$executeRawUnsafe(
        `INSERT INTO webhook_events (stripe_event_id, type, status, attempts) VALUES ($1, 'rp3.probe', 'pending', 0)`,
        eventId,
      );
      try {
        const { GET } = await import("@/app/api/readiness/route");
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.is_ready).toBe(true);
        expect(body.queue_healthy).toBe(true);
        expect(Number(body.queue_depth)).toBeGreaterThanOrEqual(1);
      } finally {
        await db.$executeRawUnsafe(`DELETE FROM webhook_events WHERE stripe_event_id = $1`, eventId);
      }
    });

    it("GET /api/health returns 200 with a healthy database check", async () => {
      const { GET } = await import("@/app/api/health/route");
      const res = await GET();
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.checks.database.status).toBe("healthy");
      expect(typeof body.checks.database.latencyMs).toBe("number");
      expect(["healthy", "degraded"]).toContain(body.status);
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it("GET /api/liveness returns 200 with is_alive:true", async () => {
      const { GET } = await import("@/app/api/liveness/route");
      const res = await GET();
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toMatchObject({ is_alive: true, http_responding: true, memory_ok: true, cpu_ok: true });
    });
  });

  describe("database unreachable (injected through the DB module's configuration seam)", () => {
    it("GET /api/readiness returns 503 with is_ready:false and database_healthy:false", async () => {
      await withUnreachableDatabase(async (load) => {
        const GET = await load("@/app/api/readiness/route");
        const res = await GET();
        const text = await res.text();
        const body = JSON.parse(text);
        expect(res.status).toBe(503);
        expect(body).toMatchObject({
          is_ready: false,
          status: 503,
          startup_complete: false,
          database_healthy: false,
          queue_healthy: false,
        });
        expect(text).not.toContain(UNREACHABLE_SECRET);
      });
    });

    it("GET /api/health returns 503 with an unhealthy, governed database check (no connection string leak)", async () => {
      await withUnreachableDatabase(async (load) => {
        const GET = await load("@/app/api/health/route");
        const res = await GET();
        const text = await res.text();
        const body = JSON.parse(text);
        expect(res.status).toBe(503);
        expect(body.status).toBe("degraded");
        expect(body.checks.database.status).toBe("unhealthy");
        expect(typeof body.checks.database.error).toBe("string");
        expect(text).not.toContain(UNREACHABLE_SECRET);
        expect(text).not.toContain("127.0.0.1:1");
      });
    });

    it("GET /api/liveness stays 200: liveness does not depend on the database", async () => {
      await withUnreachableDatabase(async (load) => {
        const GET = await load("@/app/api/liveness/route");
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body).toMatchObject({ is_alive: true, http_responding: true });
      });
    });

    it("the real database is reachable again after the injected outage (seam restored)", async () => {
      const { GET } = await import("@/app/api/readiness/route");
      const res = await GET();
      expect(res.status).toBe(200);
      const rows = (await db.$queryRawUnsafe("SELECT 1 AS one")) as Array<{ one: number }>;
      expect(rows).toEqual([{ one: 1 }]);
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Startup configuration: the current fail-closed contract
// ---------------------------------------------------------------------------
describe("RP3-5 startup configuration contract (config-validator.ts, webhook.service.ts, lib/db.ts)", () => {
  it("missing STRIPE_WEBHOOK_SECRET is an optional-service WARNING, never a startup ERROR", async () => {
    const { configValidator } = await import("@/runtime/config/config-validator");
    const saved = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      // The secret inventory lives in validateEnvironment(); validateStartup() does not read it.
      const result = configValidator.validateEnvironment();
      expect(result.warnings).toContainEqual({
        field: "STRIPE_WEBHOOK_SECRET",
        message: "Optional service STRIPE_WEBHOOK_SECRET not configured",
        severity: "WARNING",
      });
      expect(result.errors.map((e) => e.field)).not.toContain("STRIPE_WEBHOOK_SECRET");
    } finally {
      if (saved === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = saved;
    }
  });

  it("webhook signature verification fails closed per request when STRIPE_WEBHOOK_SECRET is unset", async () => {
    const { verifyWebhookSignature } = await import("@/services/webhook.service");
    const saved = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      await expect(verifyWebhookSignature("{}", "t=1,v1=deadbeef")).rejects.toThrow(
        "STRIPE_WEBHOOK_SECRET environment variable is not set",
      );
    } finally {
      if (saved === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = saved;
    }
  });

  it("with no DATABASE_URL / TEST_DATABASE_URL the DB module refuses to build a client", async () => {
    await withUnreachableDatabase(async () => {
      const fresh = await import("@/lib/db");
      await expect(fresh.getDbInstance()).rejects.toThrow(
        "DATABASE_URL or TEST_DATABASE_URL environment variable is not set",
      );
    }, null);
  });
});
