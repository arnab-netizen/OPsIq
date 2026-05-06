export enum JobStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  RETRYING = "RETRYING",
  ABANDONED = "ABANDONED",
}

export interface RetryPolicy {
  max_attempts: number; // typically 3
  backoff_strategy: "exponential" | "linear"; // backoff multiplier
  initial_backoff_ms: number; // 2000ms for exponential
  max_backoff_ms: number; // 16000ms max
  retry_on: string[]; // error patterns to retry on
}

export interface ExecutionJob {
  job_id: string;
  action_id: string;
  idempotency_key: string;
  job_unique_key: string; // SHA256(action_id + sorted(job_inputs))
  job_inputs: Record<string, unknown>;
  status: JobStatus;
  attempt_count: number;
  max_attempts: number;
  created_at: string; // ISO
  started_at?: string; // ISO
  completed_at?: string; // ISO
  result?: Record<string, unknown>;
  error?: string;
  error_classification?: string;
  lock_acquired_at?: string;
  lock_ttl_ms?: number;
  dead_letter_reason?: string;
}

export interface JobExecutionResult {
  job_id: string;
  status: JobStatus;
  result?: Record<string, unknown>;
  error?: string;
  attempt_count: number;
  should_retry: boolean;
  execution_duration_ms: number;
}

export interface IdempotencyCheckResult {
  is_duplicate: boolean;
  existing_job_id?: string;
  cached_result?: Record<string, unknown>;
  cache_age_ms?: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  max_attempts: 3,
  backoff_strategy: "exponential",
  initial_backoff_ms: 2000,
  max_backoff_ms: 16000,
  retry_on: [
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "network",
    "timeout",
    "temporarily unavailable",
  ],
};
