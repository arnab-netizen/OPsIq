/**
 * Stripe Event Simulator
 * Generates realistic Stripe webhook event payloads for offline testing
 */

export interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: {
    object: Record<string, unknown>;
  };
}

export interface CheckoutSessionData {
  customer: string;
  subscription?: string;
}

export interface SubscriptionData {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  trial_end?: number;
  canceled_at?: number;
  cancel_reason?: string;
}

/**
 * Simulate checkout.session.completed event
 */
export function simulateCheckoutCompleted(
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  overrides?: Partial<StripeEvent>
): StripeEvent {
  const now = Math.floor(Date.now() / 1000);

  return {
    id: overrides?.id || `evt_checkout_${Date.now()}_${Math.random()}`,
    type: "checkout.session.completed",
    created: overrides?.created || now,
    data: {
      object: {
        id: `cs_test_${Math.random().toString(36).substring(7)}`,
        customer: stripeCustomerId,
        subscription: stripeSubscriptionId,
        status: "complete",
        mode: "subscription",
        ...overrides?.data?.object,
      },
    },
  };
}

/**
 * Simulate customer.subscription.created event
 */
export function simulateSubscriptionCreated(
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  startTimestamp?: number,
  overrides?: Partial<StripeEvent>
): StripeEvent {
  const now = Math.floor(Date.now() / 1000);
  const start = startTimestamp || now;
  const end = start + 30 * 24 * 60 * 60; // 30 days
  const trialEnd = start + 14 * 24 * 60 * 60; // 14 day trial

  return {
    id: overrides?.id || `evt_sub_created_${Date.now()}_${Math.random()}`,
    type: "customer.subscription.created",
    created: overrides?.created || now,
    data: {
      object: {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: "trialing",
        current_period_start: start,
        current_period_end: end,
        trial_end: trialEnd,
        ...overrides?.data?.object,
      },
    },
  };
}

/**
 * Simulate customer.subscription.updated event
 */
export function simulateSubscriptionUpdated(
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  status: string = "active",
  overrides?: Partial<StripeEvent>
): StripeEvent {
  const now = Math.floor(Date.now() / 1000);
  const start = now;
  const end = start + 30 * 24 * 60 * 60;

  return {
    id: overrides?.id || `evt_sub_updated_${Date.now()}_${Math.random()}`,
    type: "customer.subscription.updated",
    created: overrides?.created || now,
    data: {
      object: {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status,
        current_period_start: start,
        current_period_end: end,
        ...overrides?.data?.object,
      },
    },
  };
}

/**
 * Simulate customer.subscription.deleted event
 */
export function simulateSubscriptionDeleted(
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  overrides?: Partial<StripeEvent>
): StripeEvent {
  const now = Math.floor(Date.now() / 1000);

  return {
    id: overrides?.id || `evt_sub_deleted_${Date.now()}_${Math.random()}`,
    type: "customer.subscription.deleted",
    created: overrides?.created || now,
    data: {
      object: {
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        status: "canceled",
        canceled_at: now,
        ...overrides?.data?.object,
      },
    },
  };
}

/**
 * Create event payload that mimics Stripe webhook with signature
 */
export function createWebhookPayload(event: StripeEvent): {
  body: string;
  signature: string;
} {
  const body = JSON.stringify(event);

  // Simulate a valid signature (in real tests, would be HMAC-SHA256)
  // For offline simulation, just use a fake but consistent format
  const signature = `t=${event.created},v1=sim_sig_${event.id}`;

  return { body, signature };
}
