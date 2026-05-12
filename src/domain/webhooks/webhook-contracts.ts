/**
 * D3: Webhook Infrastructure
 *
 * Domain contracts for webhook management, delivery, and verification.
 * Supports registration, testing, retry logic, and HMAC-SHA256 signature verification.
 */

import { z } from "zod";

/**
 * Webhook registration schema
 */
export const WebhookRegistrationSchema = z.object({
  url: z.string().url().describe("Endpoint URL for webhook delivery"),
  events: z.array(z.string()).min(1).describe("Event types to subscribe to (e.g., 'action:created', 'recommendation:completed')"),
  active: z.boolean().default(true).describe("Whether webhook is active"),
  secret: z.string().optional().describe("Optional secret for HMAC signature verification"),
  maxRetries: z.number().int().min(0).max(10).default(5).describe("Max retry attempts"),
  retryDelayMs: z.number().int().min(100).max(300000).default(1000).describe("Initial retry delay in milliseconds"),
});

export type WebhookRegistration = z.infer<typeof WebhookRegistrationSchema>;

/**
 * Webhook record in database
 */
export const WebhookSchema = z.object({
  id: z.string().uuid().describe("Unique webhook ID"),
  workspaceId: z.string().uuid().describe("Tenant scope"),
  url: z.string().url().describe("Endpoint URL"),
  events: z.array(z.string()).describe("Subscribed event types"),
  active: z.boolean().describe("Is webhook active"),
  secret: z.string().describe("Secret for HMAC signature"),
  createdAt: z.date().describe("When webhook was registered"),
  createdBy: z.string().uuid().describe("User who registered webhook"),
  lastDeliveryAt: z.date().optional().describe("Last successful delivery"),
  lastFailureAt: z.date().optional().describe("Last failed delivery attempt"),
  failureCount: z.number().int().default(0).describe("Consecutive failures"),
});

export type Webhook = z.infer<typeof WebhookSchema>;

/**
 * Webhook delivery payload
 */
export const WebhookPayloadSchema = z.object({
  id: z.string().uuid().describe("Delivery ID"),
  webhook_id: z.string().uuid().describe("Which webhook this is for"),
  event: z.string().describe("Event type"),
  data: z.record(z.string(), z.unknown()).describe("Event data"),
  timestamp: z.number().int().describe("UNIX timestamp"),
  attempt: z.number().int().min(1).describe("Attempt number"),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

/**
 * Webhook delivery record
 */
export const WebhookDeliverySchema = z.object({
  id: z.string().uuid().describe("Unique delivery ID"),
  webhookId: z.string().uuid().describe("Which webhook"),
  workspaceId: z.string().uuid().describe("Tenant scope"),
  event: z.string().describe("Event type"),
  payload: z.record(z.string(), z.unknown()).describe("Event data"),
  statusCode: z.number().int().optional().describe("HTTP response code"),
  responseBody: z.string().optional().describe("HTTP response body"),
  attempt: z.number().int().describe("Attempt number (1-based)"),
  nextRetryAt: z.date().optional().describe("When to retry if failed"),
  deliveredAt: z.date().optional().describe("When delivery succeeded"),
  createdAt: z.date().describe("When delivery was attempted"),
});

export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;

/**
 * Webhook test request
 */
export const WebhookTestRequestSchema = z.object({
  event: z.string().optional().default("test").describe("Event type for test"),
  data: z.record(z.string(), z.unknown()).optional().describe("Custom test data"),
});

export type WebhookTestRequest = z.infer<typeof WebhookTestRequestSchema>;

/**
 * Validate webhook configuration
 */
export function validateWebhook(webhook: Webhook): string[] {
  const errors: string[] = [];

  if (!webhook.id) errors.push("Webhook ID is required");
  if (!webhook.workspaceId) errors.push("Workspace ID is required");
  if (!webhook.url) errors.push("Webhook URL is required");
  if (!webhook.events || webhook.events.length === 0) {
    errors.push("At least one event type is required");
  }
  if (!webhook.secret) errors.push("Webhook secret is required for signature verification");
  if (webhook.secret.length < 32) {
    errors.push("Webhook secret must be at least 32 characters");
  }

  return errors;
}

/**
 * HMAC-SHA256 signature verification
 * Creates signature from payload + timestamp + secret
 */
export function createWebhookSignature(payload: string, timestamp: number, secret: string): string {
  const crypto = require("crypto");
  const message = `${timestamp}.${payload}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * Verify webhook signature from request header
 * Compares signature with computed value
 */
export function verifyWebhookSignature(
  payload: string,
  timestamp: number,
  signature: string,
  secret: string,
  toleranceSeconds: number = 300
): { valid: boolean; reason?: string } {
  // Check timestamp tolerance (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;

  if (age > toleranceSeconds) {
    return { valid: false, reason: `Timestamp too old (${age}s > ${toleranceSeconds}s)` };
  }

  if (age < -toleranceSeconds) {
    return { valid: false, reason: "Timestamp in future (clock skew)" };
  }

  // Verify signature
  const computedSignature = createWebhookSignature(payload, timestamp, secret);
  const isValid = computedSignature === signature;

  if (!isValid) {
    return { valid: false, reason: "Signature mismatch" };
  }

  return { valid: true };
}

/**
 * Error response for webhook operations
 */
export const WebhookErrorSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

export type WebhookError = z.infer<typeof WebhookErrorSchema>;

/**
 * Success response for webhook registration
 */
export const WebhookCreatedSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  events: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.date(),
  secret: z.string().describe("Shared once at creation - save for signature verification"),
});

export type WebhookCreated = z.infer<typeof WebhookCreatedSchema>;
