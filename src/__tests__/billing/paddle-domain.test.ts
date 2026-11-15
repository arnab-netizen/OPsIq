import { describe, it, expect } from "vitest";
import {
  commercialStateFromStatus,
  PAST_DUE_GRACE_DAYS,
  resolveAccess,
  paddleEnvelopeSchema,
  paddleSubscriptionDataSchema,
  readWorkspaceIdFromCustomData,
} from "@/domain/billing/paddle";

const END = new Date("2026-10-31T00:00:00Z");
const at = (days: number) => new Date(END.getTime() + days * 24 * 60 * 60 * 1000);

describe("access policy (resolveAccess) fails closed", () => {
  it("active is paid access", () => {
    expect(resolveAccess({ status: "active", currentPeriodEnd: END }, at(-3))).toEqual({
      access: "paid", entitled: true, paymentProblem: false, graceEndsAt: null,
    });
  });
  it("past_due is grace access with a payment problem until PAST_DUE_GRACE_DAYS after the missed renewal", () => {
    expect(PAST_DUE_GRACE_DAYS).toBe(7);
    const d = resolveAccess({ status: "past_due", currentPeriodEnd: END }, at(3));
    expect(d).toMatchObject({ access: "grace", entitled: true, paymentProblem: true });
    expect(d.graceEndsAt?.toISOString()).toBe(at(7).toISOString());
    // boundary: exactly at grace end is already denied
    expect(resolveAccess({ status: "past_due", currentPeriodEnd: END }, at(7))).toMatchObject({ access: "denied", entitled: false, paymentProblem: true });
    expect(resolveAccess({ status: "past_due", currentPeriodEnd: END }, at(30)).entitled).toBe(false);
  });
  it("past_due with unusable period data is denied (fail closed) but still flagged", () => {
    expect(resolveAccess({ status: "past_due", currentPeriodEnd: null })).toMatchObject({ entitled: false, paymentProblem: true });
    expect(resolveAccess({ status: "past_due", currentPeriodEnd: new Date("nope") })).toMatchObject({ entitled: false });
  });
  it("paused, canceled, trialing, unknown, missing are denied", () => {
    for (const s of ["paused", "canceled", "trialing", "", "ACTIVE", "unknown", null, undefined]) {
      expect(resolveAccess({ status: s as string | null | undefined, currentPeriodEnd: END }, at(-1)).entitled).toBe(false);
    }
    expect(resolveAccess(null).entitled).toBe(false);
    expect(resolveAccess(undefined).access).toBe("denied");
  });
  it("maps statuses to commercial states", () => {
    expect(commercialStateFromStatus(undefined)).toBe("none");
    expect(commercialStateFromStatus("past_due")).toBe("past_due");
    expect(commercialStateFromStatus("weird")).toBe("other");
  });
});

describe("payload validation", () => {
  it("rejects envelopes with missing ids or bad dates", () => {
    expect(paddleEnvelopeSchema.safeParse({ event_type: "x", occurred_at: "2026-01-01T00:00:00Z", data: {} }).success).toBe(false);
    expect(paddleEnvelopeSchema.safeParse({ event_id: "e", event_type: "x", occurred_at: "nope", data: {} }).success).toBe(false);
  });
  it("rejects subscriptions with unknown status or no items", () => {
    const base = { id: "sub_1", customer_id: "ctm_1", items: [{ price: { id: "pri_1" } }] };
    expect(paddleSubscriptionDataSchema.safeParse({ ...base, status: "active" }).success).toBe(true);
    expect(paddleSubscriptionDataSchema.safeParse({ ...base, status: "hacked" }).success).toBe(false);
    expect(paddleSubscriptionDataSchema.safeParse({ ...base, status: "active", items: [] }).success).toBe(false);
  });
  it("only accepts a UUID workspaceId from custom_data", () => {
    expect(readWorkspaceIdFromCustomData({ workspaceId: "550E8400-E29B-41D4-A716-446655440000" })).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(readWorkspaceIdFromCustomData({ workspaceId: "1; DROP" })).toBeNull();
    expect(readWorkspaceIdFromCustomData({ workspaceId: 5 })).toBeNull();
    expect(readWorkspaceIdFromCustomData(null)).toBeNull();
  });
});
