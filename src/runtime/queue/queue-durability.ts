/**
 * PHASE I-6: QUEUE DURABILITY + IDEMPOTENCY
 *
 * Idempotent job execution, deduplication, poison queue handling.
 * No duplicate execution side effects.
 */

export type JobStatus = "ENQUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD_LETTER";

export interface QueueJob {
  job_id: string;
  queue_name: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  created_at: Date;
  processing_started_at?: Date;
  completed_at?: Date;
  retry_count: number;
  max_retries: number;
  error_message?: string;
  correlation_id: string;
  execution_id?: string;
  workspace_id?: string;
}

export interface IdempotencyRecord {
  idempotency_key: string;
  job_id: string;
  result: Record<string, unknown>;
  created_at: Date;
  expires_at: Date;
}

class QueueDurabilityEngine {
  private jobs: Map<string, QueueJob> = new Map();
  private idempotency_cache: Map<string, IdempotencyRecord> = new Map();
  private dead_letter_queue: QueueJob[] = [];
  private poison_detection_threshold: number = 5; // Move to DLQ after 5 failures

  enqueueJob(
    queue_name: string,
    idempotency_key: string,
    payload: Record<string, unknown>,
    correlation_id: string,
    execution_id?: string,
    workspace_id?: string,
    max_retries: number = 3,
  ): QueueJob {
    // Check for deduplication
    const existing = this.checkIdempotency(idempotency_key);
    if (existing) {
      return this.jobs.get(existing.job_id)!;
    }

    const job: QueueJob = {
      job_id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      queue_name,
      idempotency_key,
      payload,
      status: "ENQUEUED",
      created_at: new Date(),
      retry_count: 0,
      max_retries,
      correlation_id,
      execution_id,
      workspace_id,
    };

    this.jobs.set(job.job_id, job);
    return job;
  }

  async processJob(job_id: string, processor: (job: QueueJob) => Promise<Record<string, unknown>>): Promise<void> {
    const job = this.jobs.get(job_id);
    if (!job) {
      throw new Error(`Job not found: ${job_id}`);
    }

    if (job.status === "COMPLETED") {
      // Already processed - idempotent
      return;
    }

    if (job.status === "DEAD_LETTER") {
      throw new Error(`Job in dead-letter queue: ${job_id}`);
    }

    job.status = "PROCESSING";
    job.processing_started_at = new Date();

    try {
      const result = await processor(job);

      // Record idempotency
      const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h TTL
      this.idempotency_cache.set(job.idempotency_key, {
        idempotency_key: job.idempotency_key,
        job_id: job.job_id,
        result,
        created_at: new Date(),
        expires_at,
      });

      job.status = "COMPLETED";
      job.completed_at = new Date();
    } catch (error) {
      job.retry_count++;
      job.error_message = error instanceof Error ? error.message : String(error);

      if (job.retry_count >= job.max_retries || this.isPoisonJob(job)) {
        job.status = "DEAD_LETTER";
        this.dead_letter_queue.push(job);
      } else {
        job.status = "ENQUEUED";
        job.processing_started_at = undefined;
      }

      throw error;
    }
  }

  private checkIdempotency(idempotency_key: string): IdempotencyRecord | undefined {
    const record = this.idempotency_cache.get(idempotency_key);
    if (!record) {
      return undefined;
    }

    // Check expiry
    if (new Date() > record.expires_at) {
      this.idempotency_cache.delete(idempotency_key);
      return undefined;
    }

    return record;
  }

  private isPoisonJob(job: QueueJob): boolean {
    // A job is poison if it has failed more than threshold times
    return job.retry_count >= this.poison_detection_threshold;
  }

  getJob(job_id: string): QueueJob | undefined {
    return this.jobs.get(job_id);
  }

  getDeadLetterQueue(): QueueJob[] {
    return [...this.dead_letter_queue];
  }

  replayFromDeadLetter(job_id: string): void {
    const job = this.dead_letter_queue.find((j) => j.job_id === job_id);
    if (!job) {
      throw new Error(`Job not in dead-letter queue: ${job_id}`);
    }

    // Reset for replay
    job.status = "ENQUEUED";
    job.retry_count = 0;
    job.error_message = undefined;
    job.processing_started_at = undefined;

    // Remove from DLQ
    this.dead_letter_queue = this.dead_letter_queue.filter((j) => j.job_id !== job_id);
  }

  getJobStats(): {
    total_jobs: number;
    enqueued: number;
    processing: number;
    completed: number;
    failed: number;
    dead_letter: number;
  } {
    let enqueued = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const job of this.jobs.values()) {
      if (job.status === "ENQUEUED") enqueued++;
      else if (job.status === "PROCESSING") processing++;
      else if (job.status === "COMPLETED") completed++;
      else if (job.status === "FAILED") failed++;
    }

    return {
      total_jobs: this.jobs.size,
      enqueued,
      processing,
      completed,
      failed,
      dead_letter: this.dead_letter_queue.length,
    };
  }

  cleanupExpiredIdempotencyRecords(): void {
    const now = new Date();
    for (const [key, record] of this.idempotency_cache.entries()) {
      if (now > record.expires_at) {
        this.idempotency_cache.delete(key);
      }
    }
  }
}

export const queueDurabilityEngine = new QueueDurabilityEngine();
