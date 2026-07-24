import { describe, it, expect } from "vitest";
import { verifyOutcome } from "@/domain/founder-recovery/verification";

describe("founder-recovery verification — module contract assertions", () => {
  it("verifyOutcome is a function", () => { expect(typeof verifyOutcome).toBe("function"); });
  it("verifyOutcome({baselineValue:30,targetValue:40,afterValue:45,direction:'up'}) returns an object", () => { expect(typeof verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 45, direction: "up" })).toBe("object"); });
  it("verifyOutcome with up-improvement has status 'verified_improved'", () => { expect(verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 45, direction: "up" }).status).toBe("verified_improved"); });
  it("verifyOutcome with target reached has reachedTarget true", () => { expect(verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 45, direction: "up" }).reachedTarget).toBe(true); });
  it("verifyOutcome with missed target has status 'verified_not_improved'", () => { expect(verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 34, direction: "up" }).status).toBe("verified_not_improved"); });
  it("verifyOutcome with null afterValue has status 'inconclusive'", () => { expect(verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: null, direction: "up" }).status).toBe("inconclusive"); });
  it("verifyOutcome with null afterValue has null actualMovement", () => { expect(verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: null, direction: "up" }).actualMovement).toBeNull(); });
  it("verifyOutcome with disputed true has status 'disputed'", () => { expect(verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 45, direction: "up", disputed: true }).status).toBe("disputed"); });
  it("verifyOutcome returns object with status field", () => { expect(verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 45, direction: "up" })).toHaveProperty("status"); });
  it("verifyOutcome returns object with reachedTarget field", () => { expect(verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 45, direction: "up" })).toHaveProperty("reachedTarget"); });
  it("verifyOutcome returns object with actualMovement field", () => { expect(verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 45, direction: "up" })).toHaveProperty("actualMovement"); });
  it("verifyOutcome actualMovement equals 15 for up 30→45", () => { expect(verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 45, direction: "up" }).actualMovement).toBe(15); });
  it("verifyOutcome down direction: baseline 15 target 8 after 7 is verified_improved", () => { expect(verifyOutcome({ baselineValue: 15, targetValue: 8, afterValue: 7, direction: "down" }).status).toBe("verified_improved"); });
  it("verifyOutcome with null baseline has status 'inconclusive'", () => { expect(verifyOutcome({ baselineValue: null, targetValue: 40, afterValue: 45, direction: "up" }).status).toBe("inconclusive"); });
});

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
