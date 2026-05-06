import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionJobSafety } from "../job-safety";
import { JobStatus, DEFAULT_RETRY_POLICY } from "@/domain/execution/job";
import { v4 as uuidv4 } from "uuid";

describe("ExecutionJobSafety", () => {
  let safety: ExecutionJobSafety;
  const action_id = uuidv4();
  const idempotency_key = uuidv4();

  beforeEach(() => {
    safety = new ExecutionJobSafety();
  });

  describe("checkIdempotency", () => {
    it("should return not duplicate for new job", () => {
      const result = safety.checkIdempotency("key1", idempotency_key);

      expect(result.is_duplicate).toBe(false);
      expect(result.existing_job_id).toBeUndefined();
    });

    it("should return duplicate for completed cached job", () => {
      const job_inputs = { test: true };
      const job = safety.createJob(action_id, job_inputs, idempotency_key);
      const started = safety.startJob(job);
      const completed = safety.completeJob(started, { success: true });

      const result = safety.checkIdempotency(completed.job_unique_key, idempotency_key);

      expect(result.is_duplicate).toBe(true);
      expect(result.existing_job_id).toBe(completed.job_id);
      expect(result.cached_result).toEqual({ success: true });
    });

    it("should return cache age for duplicate", () => {
      const job_inputs = { test: true };
      const job = safety.createJob(action_id, job_inputs, idempotency_key);
      const started = safety.startJob(job);
      safety.completeJob(started, { success: true });

      const result = safety.checkIdempotency(job.job_unique_key, idempotency_key);

      expect(result.cache_age_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe("acquireLock", () => {
    it("should acquire lock for new job", () => {
      const can_acquire = safety.acquireLock("job_key1");

      expect(can_acquire).toBe(true);
    });

    it("should prevent lock acquisition if already held", () => {
      safety.acquireLock("job_key1");
      const can_acquire = safety.acquireLock("job_key1");

      expect(can_acquire).toBe(false);
    });

    it("should allow reacquisition after lock expiry", () => {
      safety.acquireLock("job_key1", 10); // 10ms TTL

      // Wait for lock to expire
      const start = Date.now();
      while (Date.now() - start < 50) {
        // Spin
      }

      const can_acquire = safety.acquireLock("job_key1");
      expect(can_acquire).toBe(true);
    });

    it("should use default lock TTL", () => {
      const can_acquire = safety.acquireLock("job_key1");

      expect(can_acquire).toBe(true);
    });
  });

  describe("releaseLock", () => {
    it("should release acquired lock", () => {
      safety.acquireLock("job_key1");
      safety.releaseLock("job_key1");

      const can_acquire = safety.acquireLock("job_key1");
      expect(can_acquire).toBe(true);
    });

    it("should not fail on releasing non-existent lock", () => {
      expect(() => safety.releaseLock("nonexistent")).not.toThrow();
    });
  });

  describe("createJob", () => {
    it("should create job with correct fields", () => {
      const job_inputs = { test: true };
      const job = safety.createJob(action_id, job_inputs, idempotency_key);

      expect(job.job_id).toBeDefined();
      expect(job.action_id).toBe(action_id);
      expect(job.idempotency_key).toBe(idempotency_key);
      expect(job.status).toBe(JobStatus.PENDING);
      expect(job.attempt_count).toBe(0);
      expect(job.max_attempts).toBe(DEFAULT_RETRY_POLICY.max_attempts);
    });

    it("should generate deterministic job_unique_key", () => {
      const job_inputs = { a: 1, b: 2 };
      const job1 = safety.createJob(action_id, job_inputs, idempotency_key);

      safety = new ExecutionJobSafety();
      const job2 = safety.createJob(action_id, job_inputs, idempotency_key);

      expect(job1.job_unique_key).toBe(job2.job_unique_key);
    });

    it("should cache created job", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      const retrieved = safety.getJob(job.job_unique_key);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.job_id).toBe(job.job_id);
    });
  });

  describe("startJob", () => {
    it("should transition job to IN_PROGRESS", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      const started = safety.startJob(job);

      expect(started.status).toBe(JobStatus.IN_PROGRESS);
      expect(started.started_at).toBeDefined();
    });

    it("should increment attempt count", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      expect(job.attempt_count).toBe(0);

      const started = safety.startJob(job);
      expect(started.attempt_count).toBe(1);
    });
  });

  describe("completeJob", () => {
    it("should mark job as COMPLETED with result", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      const started = safety.startJob(job);
      const result = { data: "success" };

      const completed = safety.completeJob(started, result);

      expect(completed.status).toBe(JobStatus.COMPLETED);
      expect(completed.result).toEqual(result);
      expect(completed.completed_at).toBeDefined();
    });
  });

  describe("failJob", () => {
    it("should mark job as FAILED for fatal error", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      const started = safety.startJob(job);

      const { job: failed, should_retry } = safety.failJob(
        started,
        "Access denied",
        "FATAL"
      );

      expect(failed.status).toBe(JobStatus.FAILED);
      expect(failed.error).toBe("Access denied");
      expect(should_retry).toBe(false);
    });

    it("should mark job as RETRYING for retryable error", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      const started = safety.startJob(job);

      const { job: retrying, should_retry } = safety.failJob(
        started,
        "Connection timeout",
        "RETRYABLE"
      );

      expect(retrying.status).toBe(JobStatus.RETRYING);
      expect(should_retry).toBe(true);
    });

    it("should not retry if max attempts exceeded", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      job.attempt_count = 3; // Already at max

      const { should_retry } = safety.failJob(
        job,
        "Network error",
        "RETRYABLE"
      );

      expect(should_retry).toBe(false);
    });

    it("should respect error patterns in retry policy", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      const started = safety.startJob(job);

      const custom_policy = {
        ...DEFAULT_RETRY_POLICY,
        retry_on: ["ECONNREFUSED"],
      };

      const { should_retry: should_retry_connection } = safety.failJob(
        started,
        "ECONNREFUSED",
        "RECOVERABLE",
        custom_policy
      );

      expect(should_retry_connection).toBe(true);

      const job2 = safety.createJob(action_id, { test: true }, uuidv4());
      const started2 = safety.startJob(job2);

      const { should_retry: should_not_retry } = safety.failJob(
        started2,
        "Unknown error",
        "RECOVERABLE",
        custom_policy
      );

      expect(should_not_retry).toBe(false);
    });
  });

  describe("abandonJob", () => {
    it("should mark job as ABANDONED", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      const started = safety.startJob(job);

      const abandoned = safety.abandonJob(started, "Max retries exceeded");

      expect(abandoned.status).toBe(JobStatus.ABANDONED);
      expect(abandoned.dead_letter_reason).toBe("Max retries exceeded");
    });
  });

  describe("calculateBackoffMs", () => {
    it("should calculate exponential backoff", () => {
      const backoff1 = safety.calculateBackoffMs(1);
      const backoff2 = safety.calculateBackoffMs(2);
      const backoff3 = safety.calculateBackoffMs(3);

      expect(backoff2).toBeGreaterThan(backoff1);
      expect(backoff3).toBeGreaterThan(backoff2);
      expect(backoff2).toBe(backoff1 * 2);
    });

    it("should cap backoff at max", () => {
      const backoff10 = safety.calculateBackoffMs(10);

      expect(backoff10).toBeLessThanOrEqual(
        DEFAULT_RETRY_POLICY.max_backoff_ms
      );
    });

    it("should support linear backoff strategy", () => {
      const linear_policy = {
        ...DEFAULT_RETRY_POLICY,
        backoff_strategy: "linear" as const,
      };

      const backoff1 = safety.calculateBackoffMs(1, linear_policy);
      const backoff2 = safety.calculateBackoffMs(2, linear_policy);

      expect(backoff2).toBe(backoff1 * 2);
    });
  });

  describe("getJob", () => {
    it("should retrieve job by unique key", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      const retrieved = safety.getJob(job.job_unique_key);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.job_id).toBe(job.job_id);
    });

    it("should return null for non-existent job", () => {
      const retrieved = safety.getJob("nonexistent");

      expect(retrieved).toBeNull();
    });
  });

  describe("validateJob", () => {
    it("should validate correct job", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);

      expect(safety.validateJob(job)).toBe(true);
    });

    it("should reject job without job_id", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      job.job_id = "";

      expect(safety.validateJob(job)).toBe(false);
    });

    it("should reject job with invalid attempt count", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      job.attempt_count = job.max_attempts + 1;

      expect(safety.validateJob(job)).toBe(false);
    });

    it("should reject completed job without completed_at", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      job.status = JobStatus.COMPLETED;
      job.completed_at = undefined;

      expect(safety.validateJob(job)).toBe(false);
    });

    it("should reject failed job without error", () => {
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      job.status = JobStatus.FAILED;
      job.error = undefined;

      expect(safety.validateJob(job)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle jobs with complex inputs", () => {
      const complex_inputs = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        null_value: null,
      };

      const job = safety.createJob(action_id, complex_inputs, idempotency_key);

      expect(job.job_unique_key).toBeDefined();
      expect(job.job_inputs).toEqual(complex_inputs);
    });

    it("should handle multiple concurrent jobs", () => {
      const jobs = [];
      for (let i = 0; i < 10; i++) {
        const job = safety.createJob(action_id, { index: i }, uuidv4());
        jobs.push(job);
      }

      expect(jobs).toHaveLength(10);
      expect(new Set(jobs.map((j) => j.job_id)).size).toBe(10); // All unique
    });

    it("should maintain determinism across create and retrieve", () => {
      const job_inputs = { test: "data" };
      const job = safety.createJob(action_id, job_inputs, idempotency_key);

      const retrieved = safety.getJob(job.job_unique_key);

      expect(retrieved!.job_unique_key).toBe(job.job_unique_key);
      expect(retrieved!.job_inputs).toEqual(job.job_inputs);
    });

    it("should handle full job lifecycle", () => {
      // Create
      const job = safety.createJob(action_id, { test: true }, idempotency_key);
      expect(job.status).toBe(JobStatus.PENDING);

      // Acquire lock
      const lock = safety.acquireLock(job.job_unique_key);
      expect(lock).toBe(true);

      // Start
      const started = safety.startJob(job);
      expect(started.status).toBe(JobStatus.IN_PROGRESS);

      // Complete
      const completed = safety.completeJob(started, { success: true });
      expect(completed.status).toBe(JobStatus.COMPLETED);

      // Release lock
      safety.releaseLock(job.job_unique_key);

      // Check idempotency
      const idempotency = safety.checkIdempotency(
        job.job_unique_key,
        idempotency_key
      );
      expect(idempotency.is_duplicate).toBe(true);
    });
  });
});
