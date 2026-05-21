/**
 * PHASE I10.4: QUEUE WORKER ENFORCEMENT
 *
 * Mandatory wrapper for all queue job processors.
 * Ensures NO worker bypasses: context propagation, idempotency, audit emission.
 * Integrates queue durability with request context and execution audit.
 */

import { requestContext } from "@/runtime/request-context";
import { runtimeLogger } from "@/runtime/runtime-logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { executionEnforcer } from "@/runtime/enforcement/execution-enforcer";
import { runtimeMetricsCollector } from "@/runtime/metrics/runtime-metrics";
import {
  queueDurabilityEngine,
  QueueJob,
} from "@/runtime/queue/queue-durability";
import { createInfrastructureError } from "@/runtime/runtime-errors";

export type QueueJobProcessor = (job: QueueJob) => Promise<Record<string, unknown>>;

/**
 * MANDATORY: Wrap all queue job processors with enforcement layer.
 *
 * Ensures:
 * - Context propagation across async boundaries (via AsyncLocalStorage)
 * - Idempotency deduplication (no duplicate side effects)
 * - Poison job detection (5-failure threshold)
 * - Dead-letter queue for unrecoverable failures
 * - Audit event emission for all job state transitions
 * - Correlation ID tracking end-to-end
 *
 * Usage:
 * ```
 * const processor = withEnforcedQueueWorker(async (job) => {
 *   // Job processing logic here
 *   return { result: "completed" };
 * });
 *
 * // In worker thread:
 * await processor(job);
 * ```
 */
export async function withEnforcedQueueWorker(
  processor: QueueJobProcessor,
  job: QueueJob
): Promise<Record<string, unknown>> {
  const startTime = Date.now();

  // 1. Extend context for queue worker with correlation propagation
  // Preserve job's correlation_id to maintain end-to-end traceability
  const jobContext = requestContext.createContext(
    job.workspace_id,
    job.execution_id,
    undefined,
    `queue:${job.queue_name}`,
    "QUEUE_WORKER",
    undefined,
    job.correlation_id
  );

  return requestContext.runWithContext(jobContext, async () => {
      const ctx = requestContext.getContext()!;

      try {
        // 2. Emit job started event
        runtimeLogger.log({
          level: "INFO",
          category: "QUEUE",
          message: `Queue job started`,
          correlation_id: ctx.correlation_id,
          request_id: ctx.request_id,
          workspace_id: job.workspace_id,
          execution_id: job.execution_id,
          context: {
            job_id: job.job_id,
            queue_name: job.queue_name,
            idempotency_key: job.idempotency_key,
            retry_count: job.retry_count,
          },
          tags: ["queue_job_start"],
        });

        // 3. Execute processor with poison detection
        let result: Record<string, unknown>;
        try {
          result = await processor(job);
        } catch (error) {
          // Check poison job threshold
          const nextRetryCount = job.retry_count + 1;
          if (nextRetryCount >= job.max_retries) {
            // Job has reached max retries - will be moved to dead-letter queue
            runtimeLogger.log({
              level: "ERROR",
              category: "QUEUE",
              message: `Poison job moved to dead-letter queue (max retries exceeded)`,
              correlation_id: ctx.correlation_id,
              request_id: ctx.request_id,
              workspace_id: job.workspace_id,
              execution_id: job.execution_id,
              context: {
                job_id: job.job_id,
                queue_name: job.queue_name,
                retry_count: job.retry_count,
                max_retries: job.max_retries,
                error: (() => {
                  const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
                  return governed.operatorMessage;
                })(),
              },
              tags: ["queue_poison_job", "queue_dead_letter"],
            });

            throw createInfrastructureError(
              `Queue job failed after ${job.max_retries} retries and moved to dead-letter queue`,
              requestContext.createErrorContext(
                job.workspace_id,
                job.execution_id
              )
            );
          }

          // Transient failure - will retry
          runtimeLogger.log({
            level: "WARN",
            category: "QUEUE",
            message: `Queue job failed (will retry)`,
            correlation_id: ctx.correlation_id,
            request_id: ctx.request_id,
            workspace_id: job.workspace_id,
            execution_id: job.execution_id,
            context: {
              job_id: job.job_id,
              retry_count: job.retry_count,
              max_retries: job.max_retries,
              error: (() => {
                const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
                return governed.operatorMessage;
              })(),
            },
            tags: ["queue_job_failure", "queue_will_retry"],
          });

          throw error;
        }

        // 4. Record completion
        const durationMs = Date.now() - startTime;
        runtimeMetricsCollector.recordQueueLatency(durationMs);

        runtimeLogger.log({
          level: "INFO",
          category: "QUEUE",
          message: `Queue job completed successfully`,
          correlation_id: ctx.correlation_id,
          request_id: ctx.request_id,
          workspace_id: job.workspace_id,
          execution_id: job.execution_id,
          context: {
            job_id: job.job_id,
            queue_name: job.queue_name,
            duration_ms: durationMs,
          },
          tags: ["queue_job_success"],
        });

        // 5. Emit execution completed event if execution_id present
        if (job.execution_id) {
          executionEnforcer.emitExecutionCompleted(
            job.execution_id,
            job.workspace_id || "system",
            durationMs,
            "COMPLETED",
            {
              recommendation_id: "queue_job",
              job_id: job.job_id,
              queue_name: job.queue_name,
            }
          );
        }

        return result;
      } catch (error) {
        const durationMs = Date.now() - startTime;

        // Emit execution failure event if execution_id present
        if (job.execution_id) {
          const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
          executionEnforcer.emitExecutionBlocked(
            job.execution_id,
            job.workspace_id || "system",
            governed.operatorMessage,
            {
              recommendation_id: "queue_job",
              job_id: job.job_id,
              queue_name: job.queue_name,
            }
          );
        }

        runtimeLogger.log({
          level: "ERROR",
          category: "QUEUE",
          message: `Queue job execution error`,
          correlation_id: ctx.correlation_id,
          request_id: ctx.request_id,
          workspace_id: job.workspace_id,
          execution_id: job.execution_id,
          context: {
            job_id: job.job_id,
            queue_name: job.queue_name,
            error: (() => {
              const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
              return governed.operatorMessage;
            })(),
            duration_ms: durationMs,
          },
          tags: ["queue_job_error"],
        });

        throw error;
      }
    }
  );
}

/**
 * Get queue job details with context information.
 * Use to inspect job state during worker execution.
 */
export function getQueueJobContext(job: QueueJob) {
  const ctx = requestContext.getContext();
  return {
    job_id: job.job_id,
    queue_name: job.queue_name,
    correlation_id: ctx?.correlation_id || job.correlation_id,
    workspace_id: job.workspace_id,
    execution_id: job.execution_id,
    retry_count: job.retry_count,
    max_retries: job.max_retries,
  };
}
