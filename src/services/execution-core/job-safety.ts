import { createHash } from "crypto";
import { logger } from "@/infra/logger";
import {
  ExecutionJob,
  JobStatus,
  RetryPolicy,
  IdempotencyCheckResult,
  DEFAULT_RETRY_POLICY,
} from "@/domain/execution/job";
import { v4 as uuidv4 } from "uuid";

export class ExecutionJobSafety {
  private job_cache: Map<string, ExecutionJob> = new Map();
  private active_locks: Map<string, { acquired_at: Date; ttl_ms: number }> =
    new Map();

  /**
   * Check if job already executed (idempotency check)
   */
  checkIdempotency(
    job_unique_key: string,
    idempotency_key: string
  ): IdempotencyCheckResult {
    const cached_job = this.job_cache.get(job_unique_key);

    if (cached_job && cached_job.status === JobStatus.COMPLETED) {
      const cache_age_ms =
        new Date().getTime() -
        new Date(cached_job.completed_at || "").getTime();

      logger.info("Idempotent job request (returning cached result)", {
        job_unique_key,
        idempotency_key,
        cache_age_ms,
      });

      return {
        is_duplicate: true,
        existing_job_id: cached_job.job_id,
        cached_result: cached_job.result,
        cache_age_ms,
      };
    }

    return {
      is_duplicate: false,
    };
  }

  /**
   * Acquire lock for job execution (prevent concurrent execution)
   */
  acquireLock(job_unique_key: string, lock_ttl_ms: number = 300000): boolean {
    // 5 minutes
    const existing_lock = this.active_locks.get(job_unique_key);

    if (existing_lock) {
      const elapsed =
        new Date().getTime() - existing_lock.acquired_at.getTime();
      if (elapsed < existing_lock.ttl_ms) {
        logger.warn("Lock already held for job", {
          job_unique_key,
          ttl_ms: existing_lock.ttl_ms,
          elapsed,
        });
        return false;
      }

      // Lock expired, remove it
      this.active_locks.delete(job_unique_key);
    }

    this.active_locks.set(job_unique_key, {
      acquired_at: new Date(),
      ttl_ms: lock_ttl_ms,
    });

    logger.debug("Lock acquired", {
      job_unique_key,
      lock_ttl_ms,
    });

    return true;
  }

  /**
   * Release lock after job execution
   */
  releaseLock(job_unique_key: string): void {
    this.active_locks.delete(job_unique_key);
    logger.debug("Lock released", { job_unique_key });
  }

  /**
   * Create execution job
   */
  createJob(
    action_id: string,
    job_inputs: Record<string, unknown>,
    idempotency_key: string
  ): ExecutionJob {
    const job_unique_key = this.generateJobUniqueKey(
      action_id,
      job_inputs
    );
    const job_id = uuidv4();

    const job: ExecutionJob = {
      job_id,
      action_id,
      idempotency_key,
      job_unique_key,
      job_inputs,
      status: JobStatus.PENDING,
      attempt_count: 0,
      max_attempts: DEFAULT_RETRY_POLICY.max_attempts,
      created_at: new Date().toISOString(),
    };

    this.job_cache.set(job_unique_key, job);

    logger.info("Execution job created", {
      job_id,
      action_id,
      job_unique_key,
    });

    return job;
  }

  /**
   * Start job execution
   */
  startJob(job: ExecutionJob): ExecutionJob {
    const updated_job: ExecutionJob = {
      ...job,
      status: JobStatus.IN_PROGRESS,
      attempt_count: job.attempt_count + 1,
      started_at: new Date().toISOString(),
    };

    this.job_cache.set(job.job_unique_key, updated_job);

    logger.info("Job execution started", {
      job_id: job.job_id,
      attempt: updated_job.attempt_count,
    });

    return updated_job;
  }

  /**
   * Mark job as completed
   */
  completeJob(
    job: ExecutionJob,
    result: Record<string, unknown>
  ): ExecutionJob {
    const completed_job: ExecutionJob = {
      ...job,
      status: JobStatus.COMPLETED,
      result,
      completed_at: new Date().toISOString(),
    };

    this.job_cache.set(job.job_unique_key, completed_job);

    logger.info("Job execution completed", {
      job_id: job.job_id,
      attempt: job.attempt_count,
    });

    return completed_job;
  }

  /**
   * Mark job as failed and determine if retry is needed
   */
  failJob(
    job: ExecutionJob,
    error: string,
    error_classification: string,
    retry_policy: RetryPolicy = DEFAULT_RETRY_POLICY
  ): { job: ExecutionJob; should_retry: boolean } {
    const should_retry =
      this.shouldRetry(error, error_classification, retry_policy) &&
      job.attempt_count < retry_policy.max_attempts;

    const new_status = should_retry ? JobStatus.RETRYING : JobStatus.FAILED;

    const failed_job: ExecutionJob = {
      ...job,
      status: new_status,
      error,
      error_classification,
    };

    if (!should_retry) {
      this.job_cache.set(job.job_unique_key, failed_job);
    }

    logger.warn("Job execution failed", {
      job_id: job.job_id,
      error_classification,
      attempt: job.attempt_count,
      should_retry,
    });

    return { job: failed_job, should_retry };
  }

  /**
   * Abandon job (max retries exceeded)
   */
  abandonJob(job: ExecutionJob, reason: string): ExecutionJob {
    const abandoned_job: ExecutionJob = {
      ...job,
      status: JobStatus.ABANDONED,
      dead_letter_reason: reason,
    };

    this.job_cache.set(job.job_unique_key, abandoned_job);

    logger.error("Job abandoned (max retries exceeded)", {
      job_id: job.job_id,
      dead_letter_reason: reason,
      attempts: job.attempt_count,
    });

    return abandoned_job;
  }

  /**
   * Calculate backoff time before next retry
   */
  calculateBackoffMs(
    attempt_count: number,
    retry_policy: RetryPolicy = DEFAULT_RETRY_POLICY
  ): number {
    if (retry_policy.backoff_strategy === "exponential") {
      const backoff = retry_policy.initial_backoff_ms * Math.pow(2, attempt_count - 1);
      return Math.min(backoff, retry_policy.max_backoff_ms);
    } else {
      // linear
      const backoff = retry_policy.initial_backoff_ms * attempt_count;
      return Math.min(backoff, retry_policy.max_backoff_ms);
    }
  }

  /**
   * Determine if error should trigger retry
   */
  private shouldRetry(
    error: string,
    error_classification: string,
    retry_policy: RetryPolicy
  ): boolean {
    if (error_classification === "FATAL") {
      return false;
    }

    if (error_classification !== "RETRYABLE" && error_classification !== "RECOVERABLE") {
      return false;
    }

    const error_lower = error.toLowerCase();
    for (const pattern of retry_policy.retry_on) {
      if (error_lower.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // RETRYABLE classification takes priority
    if (error_classification === "RETRYABLE") {
      return true;
    }

    return false;
  }

  /**
   * Generate deterministic job unique key
   */
  private generateJobUniqueKey(
    action_id: string,
    job_inputs: Record<string, unknown>
  ): string {
    const sorted_inputs = JSON.stringify(job_inputs, Object.keys(job_inputs).sort());
    const combined = `${action_id}:${sorted_inputs}`;
    return createHash("sha256").update(combined).digest("hex").substring(0, 16);
  }

  /**
   * Get job by ID
   */
  getJob(job_unique_key: string): ExecutionJob | null {
    return this.job_cache.get(job_unique_key) || null;
  }

  /**
   * Validate job state consistency
   */
  validateJob(job: ExecutionJob): boolean {
    if (!job.job_id) {
      logger.warn("Invalid job: missing job_id");
      return false;
    }

    if (job.attempt_count < 0 || job.attempt_count > job.max_attempts) {
      logger.warn("Invalid job: attempt count out of bounds", {
        attempt_count: job.attempt_count,
        max_attempts: job.max_attempts,
      });
      return false;
    }

    if (
      job.status === JobStatus.COMPLETED &&
      !job.completed_at
    ) {
      logger.warn("Invalid job: completed status without completed_at");
      return false;
    }

    if (
      job.status === JobStatus.FAILED &&
      !job.error
    ) {
      logger.warn("Invalid job: failed status without error");
      return false;
    }

    return true;
  }
}

export const executionJobSafety = new ExecutionJobSafety();
