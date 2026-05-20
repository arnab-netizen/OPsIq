/**
 * D3: Webhook Infrastructure Service
 *
 * Handles webhook registration, delivery, retry logic, and signature verification.
 * In-memory mock store for now (ready for database persistence later).
 */

import { logger } from "@/infra/logger";
import { randomUUID } from "crypto";
import { createWebhookSignature } from "@/domain/webhooks/webhook-contracts";

// In-memory webhook store
const webhookStore = {
  webhooks: new Map(),
  getWebhook(id: string) {
    return this.webhooks.get(id);
  },
  addWebhook(webhook: any) {
    this.webhooks.set(webhook.id, webhook);
    return webhook;
  },
};

export interface Webhook {
  id: string;
  workspaceId: string;
  url: string;
  events: string[];
  createdBy: string;
  createdAt: Date;
  active: boolean;
}

export async function registerWebhook(
  workspaceId: string,
  url: string,
  events: string[],
  createdBy: string
): Promise<Webhook> {
  const webhook: Webhook = {
    id: randomUUID(),
    workspaceId,
    url,
    events,
    createdBy,
    createdAt: new Date(),
    active: true,
  };

  webhookStore.addWebhook(webhook);
  return webhook;
}

/**
 * Test webhook delivery
 * Sends a test payload to verify connectivity and signature verification
 */
export async function testWebhookDelivery(
  webhookId: string,
  workspaceId: string,
  testData?: Record<string, unknown>
): Promise<{ success: boolean; statusCode?: number; message: string }> {
  const webhook = webhookStore.getWebhook(webhookId);

  if (!webhook) {
    throw new Error(`Webhook ${webhookId} not found`);
  }

  if (webhook.workspaceId !== workspaceId) {
    throw new Error("Webhook does not belong to this workspace");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    id: randomUUID(),
    webhook_id: webhookId,
    event: "test",
    data: testData || { message: "Test webhook delivery" },
    timestamp,
    attempt: 1,
  });

  const signature = createWebhookSignature(payload, timestamp, webhook.secret);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": String(timestamp),
      },
      body: payload,
    });

    const success = response.ok;
    const responseBody = await response.text();

    // Record delivery attempt
    const delivery: WebhookDelivery = {
      id: randomUUID(),
      webhookId,
      workspaceId,
      event: "test",
      payload: JSON.parse(payload),
      statusCode: response.status,
      responseBody,
      attempt: 1,
      deliveredAt: success ? new Date() : undefined,
      createdAt: new Date(),
    };

    webhookStore.addDelivery(delivery);

    if (success) {
      webhook.lastDeliveryAt = new Date();
      webhook.failureCount = 0;
      webhookStore.updateWebhook(webhook);
    }

    return {
      success,
      statusCode: response.status,
      message: success ? "Test delivery successful" : `HTTP ${response.status}: ${responseBody}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Record failed delivery attempt
    const delivery: WebhookDelivery = {
      id: randomUUID(),
      webhookId,
      workspaceId,
      event: "test",
      payload: JSON.parse(payload),
      attempt: 1,
      nextRetryAt: new Date(Date.now() + 1000),
      createdAt: new Date(),
    };

    webhookStore.addDelivery(delivery);

    webhook.lastFailureAt = new Date();
    webhook.failureCount++;
    webhookStore.updateWebhook(webhook);

    return {
      success: false,
      message: `Delivery failed: ${message}`,
    };
  }
}

/**
 * Deliver event to subscribed webhooks
 * Handles retries with exponential backoff
 */
export async function deliverWebhookEvent(event: string, data: Record<string, unknown>): Promise<void> {
  const webhooks = webhookStore.getWebhooksByEvent(event);

  if (webhooks.length === 0) {
    return; // No subscribers
  }

  const timestamp = Math.floor(Date.now() / 1000);

  for (const webhook of webhooks) {
    const deliveryId = randomUUID();
    const payload = JSON.stringify({
      id: deliveryId,
      webhook_id: webhook.id,
      event,
      data,
      timestamp,
      attempt: 1,
    });

    const signature = createWebhookSignature(payload, timestamp, webhook.secret);

    // Background delivery (fire and forget with retries)
    deliverWithRetry(webhook, payload, signature, timestamp, 1)
      .catch((error) => {
        logger.error("Webhook delivery failed permanently", {
          webhookId: webhook.id,
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }
}

/**
 * Internal: Deliver with retry logic
 */
async function deliverWithRetry(
  webhook: Webhook,
  payload: string,
  signature: string,
  timestamp: number,
  attempt: number
): Promise<void> {
  const maxRetries = webhook.failureCount > 5 ? 0 : 5; // Stop retrying if too many failures

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": String(timestamp),
      },
      body: payload,
    });

    if (response.ok) {
      webhook.lastDeliveryAt = new Date();
      webhook.failureCount = 0;
      webhookStore.updateWebhook(webhook);
      return; // Success
    }

    // HTTP error, retry
    if (attempt < maxRetries) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 60000); // Exponential backoff, max 60s
      logger.warn("Webhook delivery failed, scheduling retry", {
        webhookId: webhook.id,
        statusCode: response.status,
        attempt,
        nextRetryMs: delayMs,
      });

      setTimeout(() => {
        deliverWithRetry(webhook, payload, signature, timestamp, attempt + 1).catch(() => {});
      }, delayMs);
    } else {
      webhook.lastFailureAt = new Date();
      webhook.failureCount++;
      webhookStore.updateWebhook(webhook);
      logger.error("Webhook delivery exhausted retries", {
        webhookId: webhook.id,
        statusCode: response.status,
      });
    }
  } catch (error) {
    if (attempt < maxRetries) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 60000);
      logger.warn("Webhook delivery network error, scheduling retry", {
        webhookId: webhook.id,
        attempt,
        error: error instanceof Error ? error.message : String(error),
        nextRetryMs: delayMs,
      });

      setTimeout(() => {
        deliverWithRetry(webhook, payload, signature, timestamp, attempt + 1).catch(() => {});
      }, delayMs);
    } else {
      webhook.lastFailureAt = new Date();
      webhook.failureCount++;
      webhookStore.updateWebhook(webhook);
      logger.error("Webhook delivery failed (network error)", {
        webhookId: webhook.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * List webhooks for workspace
 */
export async function listWebhooks(workspaceId: string): Promise<Webhook[]> {
  return webhookStore.getWebhooksByWorkspace(workspaceId);
}

/**
 * Delete webhook
 */
export async function deleteWebhook(webhookId: string, workspaceId: string): Promise<void> {
  const webhook = webhookStore.getWebhook(webhookId);

  if (!webhook || webhook.workspaceId !== workspaceId) {
    throw new Error("Webhook not found or does not belong to workspace");
  }

  webhookStore.deleteWebhook(webhookId);

  // Emit audit event
}
