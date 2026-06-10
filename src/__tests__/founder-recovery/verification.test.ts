import { describe, it, expect } from "vitest";
import { verifyOutcome } from "@/domain/founder-recovery/verification";

describe("founder-recovery outcome verification (before/after, not hardcoded)", () => {
  it("verifies improvement when an up-metric reaches target", () => {
    const r = verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 45, direction: "up" });
    expect(r.status).toBe("verified_improved");
    expect(r.reachedTarget).toBe(true);
    expect(r.actualMovement).toBe(15);
  });

  it("verifies improvement when a down-metric reaches target", () => {
    const r = verifyOutcome({ baselineValue: 15, targetValue: 8, afterValue: 7, direction: "down" });
    expect(r.status).toBe("verified_improved");
    expect(r.reachedTarget).toBe(true);
    expect(r.actualMovement).toBe(-8);
  });

  it("reports verified_not_improved when target is missed", () => {
    const r = verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 34, direction: "up" });
    expect(r.status).toBe("verified_not_improved");
    expect(r.reachedTarget).toBe(false);
  });

  it("reports verified_not_improved on wrong-direction movement", () => {
    const r = verifyOutcome({ baselineValue: 15, targetValue: 8, afterValue: 18, direction: "down" });
    expect(r.status).toBe("verified_not_improved");
  });

  it("is inconclusive when the after metric is missing", () => {
    const r = verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: null, direction: "up" });
    expect(r.status).toBe("inconclusive");
    expect(r.actualMovement).toBeNull();
  });

  it("is inconclusive when the baseline is missing", () => {
    const r = verifyOutcome({ baselineValue: null, targetValue: 40, afterValue: 45, direction: "up" });
    expect(r.status).toBe("inconclusive");
  });

  it("honours a disputed flag", () => {
    const r = verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 45, direction: "up", disputed: true });
    expect(r.status).toBe("disputed");
  });

  it("never hardcodes success: equal before/after with up-metric is not improved", () => {
    const r = verifyOutcome({ baselineValue: 30, targetValue: null, afterValue: 30, direction: "up" });
    expect(r.status).toBe("verified_not_improved");
  });
});
