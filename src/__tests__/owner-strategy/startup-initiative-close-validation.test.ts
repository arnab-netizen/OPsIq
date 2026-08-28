import { describe, it, expect } from "vitest";
import { startupInitiativeCloseSchema } from "@/domain/owner-strategy/startup-mode.validation";

describe("startupInitiativeCloseSchema", () => {
  it("accepts a minimal verified-success payload", () => {
    const parsed = startupInitiativeCloseSchema.safeParse({
      outcomeVerified: true,
      expectedImpact: 5000,
      actualImpact: 5200,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a cancellation payload with outcomeVerified: false", () => {
    const parsed = startupInitiativeCloseSchema.safeParse({
      outcomeVerified: false,
      cancelled: true,
      note: "Owner abandoned before launch",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a payload missing outcomeVerified (no arbitrary default success/failure)", () => {
    const parsed = startupInitiativeCloseSchema.safeParse({
      expectedImpact: 5000,
      actualImpact: 5200,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown fields (e.g. a client-supplied priorFailures override)", () => {
    const parsed = startupInitiativeCloseSchema.safeParse({
      outcomeVerified: true,
      priorFailures: 99,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-finite actualImpact", () => {
    const parsed = startupInitiativeCloseSchema.safeParse({
      outcomeVerified: true,
      actualImpact: Number.POSITIVE_INFINITY,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a negative actualSpend", () => {
    const parsed = startupInitiativeCloseSchema.safeParse({
      outcomeVerified: true,
      actualSpend: -100,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a note longer than 2000 characters", () => {
    const parsed = startupInitiativeCloseSchema.safeParse({
      outcomeVerified: true,
      note: "x".repeat(2001),
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts all optional classification flags together", () => {
    const parsed = startupInitiativeCloseSchema.safeParse({
      outcomeVerified: true,
      cancelled: false,
      overridden: false,
      externalFactor: true,
      expectedImpact: null,
      actualImpact: null,
      expectedSpend: 1000,
      actualSpend: 900,
      note: "External regulatory shock delayed launch",
    });
    expect(parsed.success).toBe(true);
  });
});
