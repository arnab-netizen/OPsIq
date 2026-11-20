/**
 * Stripe webhook ordering for one billing row (pure; applied by webhook.service under a row lock
 * inside the event's processing transaction).
 *
 * Stripe delivers events out of order, its `created` is whole seconds, and event ids are not
 * time-ordered. A billing row is BOUND to one Stripe subscription (stripeSubscriptionId) and
 * ordering is per Stripe subscription, not per row:
 *
 * 1. Same subscription as the binding (or an unbound row): the event applies only if its key
 *    (event.created, terminal, event.id) is greater than the stored watermark
 *    (lastEventTimestamp, terminal(row.status), lastEventId). A terminal result (canceled /
 *    incomplete_expired) wins a same-second tie against a non-terminal one; the id only breaks
 *    ties within the same class. A same-second tie against a watermark written by the other
 *    billing provider (lastEventId "paddle:…") goes to the stored provider; a strictly later
 *    event always wins. No watermark (never set, or a pre-upgrade receive-time value with no
 *    lastEventId) accepts the next event once.
 *
 * 2. A different subscription: decided by the BINDING KEY (Stripe's subscription created,
 *    subscription id), never by the bound subscription's watermark. The newest subscription is
 *    authoritative: an event of a newer subscription rebinds the row (any type, so a cancelled
 *    row bound to sub_OLD rebinds to sub_NEW whatever the delivery order, and sub_NEW's later
 *    events then apply); an event of an older subscription is ignored (audited) and can never
 *    hijack the binding. The key of a subscription never changes, so the binding converges on
 *    the same subscription in every delivery order.
 *    A rebind starts the new subscription's watermark: a full snapshot records its own position;
 *    a partial event (checkout) leaves none, so the subscription's first full snapshot applies.
 *    checkout.session.completed carries no subscription created; the session's created (always
 *    earlier than the subscription it creates) is used as a lower bound until the subscription's
 *    own events record the exact value.
 *    A pre-upgrade binding has no recorded key: only a bind-capable event (created / checkout) of
 *    another subscription supersedes it; other events for another id are ignored. One-time window
 *    until the bound subscription's next event records the key.
 */

/** Stripe subscription statuses after which the subscription grants nothing and cannot resume. */
export const TERMINAL_STRIPE_SUBSCRIPTION_STATUSES: readonly string[] = ["canceled", "incomplete_expired"];

export function isTerminalSubscriptionStatus(status: string): boolean {
  return TERMINAL_STRIPE_SUBSCRIPTION_STATUSES.includes(status);
}

/** Watermark ids written by the Paddle path carry this prefix (its webhook_events key). */
export const PADDLE_WATERMARK_PREFIX = "paddle:";

/** The row fields the decision reads. */
export interface StoredSubscriptionOrdering {
  stripeSubscriptionId: string | null;
  stripeSubscriptionCreatedAt: Date | null;
  status: string;
  lastEventTimestamp: Date | null;
  lastEventId: string | null;
}

/** One Stripe event's ordering facts. */
export interface StripeSubscriptionEventOrdering {
  eventId: string;
  eventCreatedAt: Date;
  subscriptionId: string;
  /** Stripe's created of the subscription (checkout: the session's created, a lower bound). */
  subscriptionCreatedAt: Date;
  /** The status the event writes. */
  resultingStatus: string;
  /** customer.subscription.created / checkout.session.completed establish a binding. */
  bindCapable: boolean;
}

export type StripeSubscriptionOrderingDecision =
  | { kind: "apply"; rebind: false }
  | { kind: "apply"; rebind: true; previousSubscriptionId: string | null }
  | { kind: "ignore"; reason: "stale" | "subscription_mismatch" };

function isNewerThanWatermark(stored: StoredSubscriptionOrdering, event: StripeSubscriptionEventOrdering): boolean {
  if (stored.lastEventId === null || stored.lastEventTimestamp === null) return true;
  const eventAt = event.eventCreatedAt.getTime();
  const storedAt = stored.lastEventTimestamp.getTime();
  if (eventAt !== storedAt) return eventAt > storedAt;
  if (stored.lastEventId.startsWith(PADDLE_WATERMARK_PREFIX)) return false;
  const eventTerminal = isTerminalSubscriptionStatus(event.resultingStatus);
  const rowTerminal = isTerminalSubscriptionStatus(stored.status);
  if (eventTerminal !== rowTerminal) return eventTerminal;
  return event.eventId > stored.lastEventId;
}

function bindingKeyIsGreater(event: StripeSubscriptionEventOrdering, boundId: string, boundCreatedAt: Date): boolean {
  const eventAt = event.subscriptionCreatedAt.getTime();
  const boundAt = boundCreatedAt.getTime();
  if (eventAt !== boundAt) return eventAt > boundAt;
  return event.subscriptionId > boundId;
}

export function decideStripeSubscriptionEvent(
  stored: StoredSubscriptionOrdering,
  event: StripeSubscriptionEventOrdering
): StripeSubscriptionOrderingDecision {
  if (stored.stripeSubscriptionId === null) {
    return isNewerThanWatermark(stored, event)
      ? { kind: "apply", rebind: true, previousSubscriptionId: null }
      : { kind: "ignore", reason: "stale" };
  }
  if (stored.stripeSubscriptionId === event.subscriptionId) {
    return isNewerThanWatermark(stored, event) ? { kind: "apply", rebind: false } : { kind: "ignore", reason: "stale" };
  }
  const supersedes =
    stored.stripeSubscriptionCreatedAt === null
      ? event.bindCapable
      : bindingKeyIsGreater(event, stored.stripeSubscriptionId, stored.stripeSubscriptionCreatedAt);
  return supersedes
    ? { kind: "apply", rebind: true, previousSubscriptionId: stored.stripeSubscriptionId }
    : { kind: "ignore", reason: "subscription_mismatch" };
}
