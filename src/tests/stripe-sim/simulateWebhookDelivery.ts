/**
 * Webhook Delivery Simulator
 * Simulates realistic Stripe webhook delivery with retries, failures, duplicates, etc.
 */

import { classifyOperatorError } from "@/lib/operator-error-governance";
import { StripeEvent } from "./stripeSimulator";
import { handleWebhookEvent, getOrCreateWebhookEvent, markWebhookEventProcessed, markWebhookEventFailed, checkSignatureTimestamp } from "@/services/webhook.service";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";

export interface DeliveryOptions {
  delayMs?: number; // Delay before delivery
  duplicate?: boolean; // Deliver event twice
  outOfOrder?: boolean; // Deliver after a newer event
  retryCount?: number; // Number of retries before success
  simulateTimeout?: boolean; // Simulate 30s+ processing time
  oldTimestamp?: boolean; // Use timestamp > 5 minutes old
  failPermanently?: boolean; // Never succeed, go to dead-letter
}

export interface DeliveryResult {
  success: boolean;
  eventId: string;
  eventType: string;
  attempts: number;
  finalStatus: string;
  error?: string;
  webhookEventRecord?: unknown;
}

/**
 * Simulate webhook delivery with realistic options
 */
export async function simulateWebhookDelivery(
  event: StripeEvent,
  options: DeliveryOptions = {}
): Promise<DeliveryResult> {
  const {
    delayMs = 0,
    duplicate = false,
    outOfOrder = false,
    retryCount = 0,
    simulateTimeout = false,
    oldTimestamp = false,
    failPermanently = false,
  } = options;

  // Initial delay (simulating network latency)
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Adjust timestamp if simulating old webhook
  const eventToProcess = { ...event };
  if (oldTimestamp) {
    eventToProcess.created = Math.floor(Date.now() / 1000) - 360; // 6 minutes old
  }

  // Validate timestamp (replay protection - same as webhook route)
  try {
    checkSignatureTimestamp(eventToProcess.created);
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    return {
      eventId: eventToProcess.id,
      eventType: eventToProcess.type,
      success: false,
      attempts: 1,
      finalStatus: "failed",
      error: governed.operatorMessage,
    };
  }

  // Simulate timeout by wrapping handler
  const handlerPromise = (async () => {
    try {
      // Create/get webhook event
      const result = await getOrCreateWebhookEvent(
        eventToProcess.id,
        eventToProcess.type,
        eventToProcess.created
      );

      if (!result.shouldProcess) {
        return {
          success: true,
          duplicate: true,
          finalStatus: result.event.status,
        };
      }

      // Simulate processing attempts
      let attempts = 0;
      let lastError: Error | null = null;

      for (attempts = 0; attempts <= retryCount; attempts++) {
        try {
          if (simulateTimeout && attempts === 0) {
            // Simulate timeout on first attempt
            throw new Error("Webhook processing timeout after 30000ms");
          }

          if (failPermanently && attempts < retryCount + 1) {
            // Simulate permanent failures until max retries
            throw new Error(`Simulated failure (attempt ${attempts + 1}/${retryCount + 1})`);
          }

          // Process the event
          await handleWebhookEvent(eventToProcess);

          // Success: mark as processed
          await markWebhookEventProcessed(eventToProcess.id);

          return {
            success: true,
            attempts: attempts + 1,
            finalStatus: "processed",
          };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempts < retryCount) {
            // Will retry - update attempts count for this failure
            await markWebhookEventFailed(eventToProcess.id, lastError);
            logger.debug(`Webhook processing failed, retrying`, {
              eventId: eventToProcess.id,
              attempt: attempts + 1,
              error: lastError.message,
            });
          } else {
            // Final attempt failed
            await markWebhookEventFailed(eventToProcess.id, lastError);
          }
        }
      }

      // Get final status
      const webhookEvent = await db.webhookEvent.findUnique({
        where: { stripeEventId: eventToProcess.id },
      });

      return {
        success: false,
        attempts: attempts,
        finalStatus: webhookEvent?.status || "failed",
        error: lastError?.message,
        webhookEvent,
      };
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      const errorMsg = governed.operatorMessage;
      logger.error("Webhook delivery failed", { eventId: eventToProcess.id, error: errorMsg });

      // Get webhook event state
      const webhookEvent = await db.webhookEvent.findUnique({
        where: { stripeEventId: eventToProcess.id },
      });

      return {
        success: false,
        attempts: 1,
        finalStatus: webhookEvent?.status || "processing",
        error: errorMsg,
        webhookEvent,
      };
    }
  })();

  // Simulate timeout if requested (30s limit)
  const timeoutPromise = new Promise<unknown>((resolve) => {
    setTimeout(() => {
      resolve({
        success: false,
        finalStatus: "failed",
        error: "Webhook delivery timeout (processing took > 30s)",
      });
    }, 31000);
  });

  // If not simulating timeout, just use the handler promise
  // If simulating timeout, race them
  const deliveryResult = simulateTimeout
    ? await Promise.race([handlerPromise, timeoutPromise])
    : await handlerPromise;

  // Get final webhook event record
  const webhookEvent = await db.webhookEvent.findUnique({
    where: { stripeEventId: eventToProcess.id },
  });

  return {
    eventId: eventToProcess.id,
    eventType: eventToProcess.type,
    success: deliveryResult.success === true,
    attempts: deliveryResult.attempts || 1,
    finalStatus: deliveryResult.finalStatus || webhookEvent?.status || "unknown",
    error: deliveryResult.error,
    webhookEventRecord: webhookEvent,
  };
}

/**
 * Simulate batch delivery (e.g., checkout → subscription created)
 */
export async function simulateWebhookBatch(
  events: StripeEvent[],
  baseOptions: DeliveryOptions = {}
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  for (const event of events) {
    const result = await simulateWebhookDelivery(event, {
      ...baseOptions,
      delayMs: baseOptions.delayMs ? baseOptions.delayMs + Math.random() * 100 : 0,
    });
    results.push(result);
  }

  return results;
}
