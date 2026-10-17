import { describe, it, expect } from "vitest";
import {
  commercialStateFromStatus,
  isEntitledStatus,
  paddleEnvelopeSchema,
  paddleSubscriptionDataSchema,
  readWorkspaceIdFromCustomData,
} from "@/domain/billing/paddle";

describe("entitlement rule fails closed", () => {
  it("only 'active' is entitled", () => {
    expect(isEntitledStatus("active")).toBe(true);
    for (const s of ["trialing", "past_due", "paused", "canceled", "", "ACTIVE", "unknown", null, undefined]) {
      expect(isEntitledStatus(s as string | null | undefined)).toBe(false);
    }
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
