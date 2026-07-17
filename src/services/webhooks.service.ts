/**
 * D3: Webhook Infrastructure Service
 *
 * Handles webhook registration, delivery, retry logic, and signature verification.
 * In-memory mock store for now (ready for database persistence later).
 */

import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import {
  Webhook,
  WebhookDelivery,
  createWebhookSignature,
  validateWebhook,
} from "@/domain/webhooks/webhook-contracts";
import { randomUUID } from "crypto";

/**
 * In-memory webhook store (mock-backed until database available)
 */
class MockWebhookStore {
  private webhooks: Map<string, Webhook> = new Map();
  private deliveries: Map<string, WebhookDelivery[]> = new Map();

  saveWebhook(webhook: Webhook): void {
    this.webhooks.set(webhook.id, webhook);
  }

  getWebhook(id: string): Webhook | undefined {
    return this.webhooks.get(id);
  }

  getWebhooksByWorkspace(workspaceId: string): Webhook[] {
    return Array.from(this.webhooks.values()).filter((w) => w.workspaceId === workspaceId);
  }

  getWebhooksByEvent(event: string): Webhook[] {
    return Array.from(this.webhooks.values()).filter((w) => w.active && w.events.includes(event));
  }

  updateWebhook(webhook: Webhook): void {
    this.webhooks.set(webhook.id, webhook);
  }

  deleteWebhook(id: string): void {
    this.webhooks.delete(id);
  }

  addDelivery(delivery: WebhookDelivery): void {
    if (!this.deliveries.has(delivery.webhookId)) {
      this.deliveries.set(delivery.webhookId, []);
    }
    this.deliveries.get(delivery.webhookId)!.push(delivery);
  }

  getDeliveries(webhookId: string): WebhookDelivery[] {
    return this.deliveries.get(webhookId) || [];
  }

  clear(): void {
    this.webhooks.clear();
    this.deliveries.clear();
  }
}

const webhookStore = new MockWebhookStore();

/**
 * Register a webhook for a workspace
 */
export async function registerWebhook(
  workspaceId: string,
  url: string,
  events: string[],
  createdBy: string,
  secret?: string
): Promise<Webhook> {
  const webhookId = randomUUID();
  const webhookSecret = secret || randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

  const webhook: Webhook = {
    id: webhookId,
    workspaceId,
    url,
    events,
    active: true,
    secret: webhookSecret,
    createdAt: new Date(),
    createdBy,
    failureCount: 0,
  };

  const validationErrors = validateWebhook(webhook);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid webhook configuration: ${validationErrors.join(", ")}`);
  }

  webhookStore.saveWebhook(webhook);

  // Emit audit event
  await emitAuditEvent({
    workspace_id: workspaceId,
    entity_type: "webhook",
    entity_id: webhookId,
    actor_id: createdBy,
    action: "create",
    status: "success",
    details: { url, events },
  } as any);

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
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    const message = governed.operatorMessage;

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
        const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
        logger.error("Webhook delivery failed permanently", {
          webhookId: webhook.id,
          event,
          error: governed.operatorMessage,
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
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    if (attempt < maxRetries) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 60000);
      logger.warn("Webhook delivery network error, scheduling retry", {
        webhookId: webhook.id,
        attempt,
        error: governed.operatorMessage,
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
        error: governed.operatorMessage,
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
  await emitAuditEvent({
    workspace_id: workspaceId,
    entity_type: "webhook",
    entity_id: webhookId,
    actor_id: "system",
    action: "delete",
    status: "success",
  } as any);
}

/**
 * Get webhook delivery history
 */
export async function getWebhookDeliveries(webhookId: string): Promise<WebhookDelivery[]> {
  return webhookStore.getDeliveries(webhookId);
}

/**
 * Test helper: clear all webhooks
 */
export function clearWebhooks(): void {
  webhookStore.clear();
}

/**
 * Test helper: get webhook by ID (internal)
 */
export function getWebhookById(id: string): Webhook | undefined {
  return webhookStore.getWebhook(id);
}
