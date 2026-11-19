import { describe, it, expect } from "vitest";
import {
  decideStripeSubscriptionEvent,
  type StoredSubscriptionOrdering,
  type StripeSubscriptionEventOrdering,
} from "@/domain/billing/stripe-subscription-ordering";

const at = (s: number) => new Date(s * 1000);
const OLD_CREATED = 1_000;
const NEW_CREATED = 5_000;

function stored(over: Partial<StoredSubscriptionOrdering> = {}): StoredSubscriptionOrdering {
  return { stripeSubscriptionId: "sub_OLD", stripeSubscriptionCreatedAt: at(OLD_CREATED), status: "active", lastEventTimestamp: at(4_000), lastEventId: "evt_m", ...over };
}
function event(over: Partial<StripeSubscriptionEventOrdering> = {}): StripeSubscriptionEventOrdering {
  return { eventId: "evt_x", eventCreatedAt: at(4_500), subscriptionId: "sub_OLD", subscriptionCreatedAt: at(OLD_CREATED), resultingStatus: "active", bindCapable: false, ...over };
}

describe("decideStripeSubscriptionEvent", () => {
  it("same subscription: newer applies, older is stale", () => {
    expect(decideStripeSubscriptionEvent(stored(), event())).toEqual({ kind: "apply", rebind: false });
    expect(decideStripeSubscriptionEvent(stored(), event({ eventCreatedAt: at(3_000) }))).toEqual({ kind: "ignore", reason: "stale" });
  });

  it("same subscription, same second: terminal beats non-terminal in both directions; same class by id", () => {
    const tie = { eventCreatedAt: at(4_000) };
    expect(decideStripeSubscriptionEvent(stored({ status: "canceled", lastEventId: "evt_a" }), event({ ...tie, eventId: "evt_z" }))).toEqual({ kind: "ignore", reason: "stale" });
    expect(decideStripeSubscriptionEvent(stored({ lastEventId: "evt_z" }), event({ ...tie, eventId: "evt_a", resultingStatus: "canceled" }))).toEqual({ kind: "apply", rebind: false });
    expect(decideStripeSubscriptionEvent(stored({ lastEventId: "evt_a" }), event({ ...tie, eventId: "evt_b" }))).toEqual({ kind: "apply", rebind: false });
    expect(decideStripeSubscriptionEvent(stored({ lastEventId: "evt_b" }), event({ ...tie, eventId: "evt_a" }))).toEqual({ kind: "ignore", reason: "stale" });
  });

  it("a newer subscription rebinds whatever the event type or the bound watermark; an older one never does", () => {
    const deadOld = stored({ status: "canceled", lastEventTimestamp: at(9_999) });
    const newer = { subscriptionId: "sub_NEW", subscriptionCreatedAt: at(NEW_CREATED), eventCreatedAt: at(5_000) };
    expect(decideStripeSubscriptionEvent(deadOld, event({ ...newer, bindCapable: true }))).toEqual({ kind: "apply", rebind: true, previousSubscriptionId: "sub_OLD" });
    expect(decideStripeSubscriptionEvent(stored(), event({ ...newer }))).toEqual({ kind: "apply", rebind: true, previousSubscriptionId: "sub_OLD" });
    const boundNew = stored({ stripeSubscriptionId: "sub_NEW", stripeSubscriptionCreatedAt: at(NEW_CREATED) });
    expect(decideStripeSubscriptionEvent(boundNew, event({ eventCreatedAt: at(99_999), bindCapable: true }))).toEqual({ kind: "ignore", reason: "subscription_mismatch" });
  });

  it("a pre-upgrade binding (no recorded key) is superseded only by a bind-capable event", () => {
    const legacy = stored({ stripeSubscriptionCreatedAt: null });
    const other = { subscriptionId: "sub_OTHER", subscriptionCreatedAt: at(NEW_CREATED) };
    expect(decideStripeSubscriptionEvent(legacy, event({ ...other, bindCapable: true }))).toMatchObject({ kind: "apply", rebind: true });
    expect(decideStripeSubscriptionEvent(legacy, event({ ...other, resultingStatus: "canceled" }))).toEqual({ kind: "ignore", reason: "subscription_mismatch" });
  });

  it("an unbound row binds the event's subscription when the event is newer than any watermark", () => {
    expect(decideStripeSubscriptionEvent(stored({ stripeSubscriptionId: null, stripeSubscriptionCreatedAt: null, lastEventId: null, lastEventTimestamp: null }), event())).toEqual({
      kind: "apply",
      rebind: true,
      previousSubscriptionId: null,
    });
  });
});
