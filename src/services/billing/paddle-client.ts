/**
 * Minimal Paddle Billing API client (server-side only). Uses fetch; no SDK dependency.
 *
 * Environment (all lazy — nothing is read at import/boot time, so Paddle is OPTIONAL for boot):
 *   PADDLE_ENV              "sandbox" | "production"  (default "sandbox"; fail-safe)
 *   PADDLE_API_KEY          server API key for the selected environment
 *   PADDLE_WEBHOOK_SECRET   notification destination secret key
 *   PADDLE_PRICE_ID         the single sellable plan's Paddle price id (pri_...)
 */
import { AppError } from "@/infra/errors";

export type PaddleEnvironment = "sandbox" | "production";

export function resolvePaddleEnvironment(): PaddleEnvironment {
  return process.env.PADDLE_ENV === "production" ? "production" : "sandbox";
}

export function paddleApiBase(): string {
  return resolvePaddleEnvironment() === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

export function resolvePaddlePriceId(): string | null {
  const v = process.env.PADDLE_PRICE_ID?.trim();
  return v ? v : null;
}

export function isPaddleConfigured(): boolean {
  return Boolean(process.env.PADDLE_API_KEY?.trim() && resolvePaddlePriceId());
}

export class PaddleNotConfiguredError extends AppError {
  constructor() {
    super("INTERNAL_ERROR", "Payments are not configured", 503, {
      telemetryClass: "INTERNAL_ERROR",
      auditClass: "INTERNAL_ERROR",
      severity: "HIGH",
      retryable: false,
      securityRelevant: false,
      infrastructureRelevant: true,
      abuseRelevant: false,
      handlerAllowed: true,
      mutationAllowed: false,
    });
    this.name = "PaddleNotConfiguredError";
  }
}

export class PaddleApiError extends AppError {
  constructor(public readonly upstreamStatus: number) {
    super("EXTERNAL_SERVICE_ERROR", "Payment provider request failed", 502, {
      telemetryClass: "INTERNAL_ERROR",
      auditClass: "INTERNAL_ERROR",
      severity: "HIGH",
      retryable: true,
      securityRelevant: false,
      infrastructureRelevant: true,
      abuseRelevant: false,
      handlerAllowed: true,
      mutationAllowed: false,
    });
    this.name = "PaddleApiError";
  }
}

type FetchLike = typeof fetch;

async function paddleRequest<T>(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  fetchImpl: FetchLike = fetch,
): Promise<T> {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!apiKey) throw new PaddleNotConfiguredError();
  const res = await fetchImpl(`${paddleApiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new PaddleApiError(res.status);
  const json = (await res.json()) as { data: T };
  return json.data;
}

export interface PaddleCheckoutTransaction {
  id: string;
  checkout?: { url?: string | null } | null;
}

/** Creates a draft transaction whose hosted checkout URL the buyer is redirected to. */
export async function createCheckoutTransaction(
  input: { priceId: string; workspaceId: string; billingAccountId: string; customerId?: string | null },
  fetchImpl?: FetchLike,
): Promise<PaddleCheckoutTransaction> {
  return paddleRequest<PaddleCheckoutTransaction>(
    "POST",
    "/transactions",
    {
      items: [{ price_id: input.priceId, quantity: 1 }],
      ...(input.customerId ? { customer_id: input.customerId } : {}),
      // Tenant binding is established SERVER-SIDE here, never from the browser.
      custom_data: { workspaceId: input.workspaceId, billingAccountId: input.billingAccountId },
    },
    fetchImpl,
  );
}

/** Schedules cancellation at the end of the paid period (access continues until then). */
export async function cancelSubscriptionAtPeriodEnd(subscriptionId: string, fetchImpl?: FetchLike): Promise<void> {
  await paddleRequest<unknown>(
    "POST",
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    { effective_from: "next_billing_period" },
    fetchImpl,
  );
}

/**
 * Provider-controlled payment-method update: Paddle returns a transaction whose hosted checkout
 * (default payment link → /pay) lets the customer replace the card. Only the verified webhook
 * restores entitlement afterwards.
 */
export async function getPaymentMethodUpdateTransaction(
  subscriptionId: string,
  fetchImpl?: FetchLike,
): Promise<PaddleCheckoutTransaction> {
  return paddleRequest<PaddleCheckoutTransaction>(
    "GET",
    `/subscriptions/${encodeURIComponent(subscriptionId)}/update-payment-method-transaction`,
    undefined,
    fetchImpl,
  );
}

/** Cancels an unwanted duplicate subscription immediately (customer paid twice). Refund stays manual in Paddle. */
export async function cancelSubscriptionImmediately(subscriptionId: string, fetchImpl?: FetchLike): Promise<void> {
  await paddleRequest<unknown>(
    "POST",
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    { effective_from: "immediately" },
    fetchImpl,
  );
}
