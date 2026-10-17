/**
 * Paddle Billing (Merchant of Record) — pure domain contract.
 *
 * No I/O here. Defines the verified-webhook envelope we accept, the subscription lifecycle
 * mapping onto the local Subscription.status, and the single entitlement rule.
 *
 * Entitlement rule (fail closed): a workspace is entitled ONLY while the locally persisted
 * subscription status is "active". Every other state — trialing (no trials are sold), past_due,
 * paused, canceled, unknown — is NOT entitled. Provider-side cancel-at-period-end keeps the
 * status "active" until Paddle itself sends subscription.canceled at the period end, so access
 * is removed exactly at the end of the paid period and never earlier or later than Paddle says.
 */
import { z } from "zod";

export const PADDLE_PROVIDER = "paddle" as const;

/** Prefix that namespaces Paddle event ids inside the shared webhook_events idempotency table. */
export const PADDLE_EVENT_KEY_PREFIX = "paddle:";

export const PADDLE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "paused", "canceled"] as const;
export type PaddleSubscriptionStatus = (typeof PADDLE_SUBSCRIPTION_STATUSES)[number];

/** Subscription events whose payload is a full subscription snapshot (order-agnostic upsert). */
export const PADDLE_SUBSCRIPTION_EVENT_TYPES = [
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.canceled",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
] as const;

/** Transaction events are audited only; they never grant or remove entitlement. */
export const PADDLE_TRANSACTION_EVENT_TYPES = ["transaction.completed", "transaction.payment_failed"] as const;

const isoDate = z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), "invalid date");

export const paddleEnvelopeSchema = z.object({
  event_id: z.string().min(1).max(128),
  event_type: z.string().min(1).max(128),
  occurred_at: isoDate,
  notification_id: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});
export type PaddleEnvelope = z.infer<typeof paddleEnvelopeSchema>;

export const paddleSubscriptionDataSchema = z.object({
  id: z.string().min(1),
  status: z.enum(PADDLE_SUBSCRIPTION_STATUSES),
  customer_id: z.string().min(1),
  custom_data: z.record(z.string(), z.unknown()).nullable().optional(),
  items: z
    .array(z.object({ price: z.object({ id: z.string().min(1) }) }))
    .min(1),
  current_billing_period: z
    .object({ starts_at: isoDate, ends_at: isoDate })
    .nullable()
    .optional(),
  scheduled_change: z
    .object({ action: z.string(), effective_at: isoDate })
    .nullable()
    .optional(),
  canceled_at: isoDate.nullable().optional(),
});
export type PaddleSubscriptionData = z.infer<typeof paddleSubscriptionDataSchema>;

export const paddleTransactionDataSchema = z.object({
  id: z.string().min(1),
  subscription_id: z.string().nullable().optional(),
  customer_id: z.string().nullable().optional(),
  custom_data: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type PaddleTransactionData = z.infer<typeof paddleTransactionDataSchema>;

export function isPaddleSubscriptionEvent(type: string): boolean {
  return (PADDLE_SUBSCRIPTION_EVENT_TYPES as readonly string[]).includes(type);
}
export function isPaddleTransactionEvent(type: string): boolean {
  return (PADDLE_TRANSACTION_EVENT_TYPES as readonly string[]).includes(type);
}

/** Local Subscription.status value for a Paddle status (1:1; kept explicit for auditability). */
export function mapPaddleStatus(status: PaddleSubscriptionStatus): string {
  return status;
}

export type CommercialState = "none" | "active" | "past_due" | "paused" | "canceled" | "other";

export function commercialStateFromStatus(status: string | null | undefined): CommercialState {
  switch (status) {
    case undefined:
    case null:
      return "none";
    case "active":
    case "past_due":
    case "paused":
    case "canceled":
      return status;
    default:
      return "other";
  }
}

/** The single entitlement rule. Fail closed. */
export function isEntitledStatus(status: string | null | undefined): boolean {
  return status === "active";
}

/** True when the workspace id carried in provider custom_data is a well-formed UUID. */
export function readWorkspaceIdFromCustomData(customData: Record<string, unknown> | null | undefined): string | null {
  const raw = customData?.workspaceId;
  if (typeof raw !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw.toLowerCase() : null;
}
