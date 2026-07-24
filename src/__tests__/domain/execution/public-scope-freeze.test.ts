import { describe, it, expect } from "vitest";
import {
  FROZEN_SCOPE_AREAS,
  FROZEN_SCOPE_REASONS,
  classifyScope,
  isOwnerModeAllowed,
  assertWithinOwnerScope,
  PublicScopeFrozenError,
  type FrozenScopeArea,
} from "@/domain/execution/public-scope-freeze";

describe("public-scope-freeze — module contract assertions", () => {
  it("FROZEN_SCOPE_AREAS is an array", () => { expect(Array.isArray(FROZEN_SCOPE_AREAS)).toBe(true); });
  it("FROZEN_SCOPE_REASONS is an object", () => { expect(typeof FROZEN_SCOPE_REASONS).toBe("object"); });
  it("classifyScope is a function", () => { expect(typeof classifyScope).toBe("function"); });
  it("isOwnerModeAllowed is a function", () => { expect(typeof isOwnerModeAllowed).toBe("function"); });
  it("assertWithinOwnerScope is a function", () => { expect(typeof assertWithinOwnerScope).toBe("function"); });
  it("PublicScopeFrozenError is a function", () => { expect(typeof PublicScopeFrozenError).toBe("function"); });
  it("FROZEN_SCOPE_AREAS contains 'BILLING'", () => { expect(FROZEN_SCOPE_AREAS).toContain("BILLING"); });
  it("FROZEN_SCOPE_AREAS.length equals 6", () => { expect(FROZEN_SCOPE_AREAS).toHaveLength(6); });
  it("FROZEN_SCOPE_AREAS contains 'PUBLIC_SAAS'", () => { expect(FROZEN_SCOPE_AREAS).toContain("PUBLIC_SAAS"); });
  it("classifyScope({area:'BILLING'}) returns an object", () => { expect(typeof classifyScope({ area: "BILLING" })).toBe("object"); });
  it("classifyScope({area:'BILLING'}).inScope is false", () => { expect(classifyScope({ area: "BILLING" }).inScope).toBe(false); });
  it("classifyScope({area:'BILLING'}).frozenArea equals 'BILLING'", () => { expect(classifyScope({ area: "BILLING" }).frozenArea).toBe("BILLING"); });
  it("classifyScope({tags:['dashboard']}).inScope is true", () => { expect(classifyScope({ tags: ["dashboard"] }).inScope).toBe(true); });
  it("isOwnerModeAllowed({}) is true", () => { expect(isOwnerModeAllowed({})).toBe(true); });
});

describe("[module40] Public Scope Freeze Guard", () => {
  it("[module40] exposes all six frozen areas with reasons", () => {
    expect(FROZEN_SCOPE_AREAS).toEqual([
      "PUBLIC_SAAS",
      "BILLING",
      "PRODUCT_HUNT_LAUNCH",
      "CROSS_USER_LEARNING",
      "EXTERNAL_INTEGRATIONS",
      "ADVANCED_FORECASTING",
    ]);
    for (const area of FROZEN_SCOPE_AREAS) {
      expect(typeof FROZEN_SCOPE_REASONS[area]).toBe("string");
      expect(FROZEN_SCOPE_REASONS[area].length).toBeGreaterThan(0);
    }
  });

  it("[module40] classifies each frozen area by explicit area field as out of scope", () => {
    for (const area of FROZEN_SCOPE_AREAS) {
      const c = classifyScope({ area });
      expect(c.inScope).toBe(false);
      expect(c.frozenArea).toBe(area);
      expect(c.reason).toBe(FROZEN_SCOPE_REASONS[area]);
    }
  });

  const tagCases: Array<[string, FrozenScopeArea]> = [
    ["billing", "BILLING"],
    ["stripe", "BILLING"],
    ["subscription", "BILLING"],
    ["integration", "EXTERNAL_INTEGRATIONS"],
    ["webhook", "EXTERNAL_INTEGRATIONS"],
    ["oauth", "EXTERNAL_INTEGRATIONS"],
    ["forecast", "ADVANCED_FORECASTING"],
    ["prediction", "ADVANCED_FORECASTING"],
    ["signup", "PUBLIC_SAAS"],
    ["public", "PUBLIC_SAAS"],
    ["marketing-site", "PUBLIC_SAAS"],
    ["cross-user", "CROSS_USER_LEARNING"],
    ["global-learning", "CROSS_USER_LEARNING"],
    ["launch", "PRODUCT_HUNT_LAUNCH"],
    ["producthunt", "PRODUCT_HUNT_LAUNCH"],
  ];

  for (const [tag, expected] of tagCases) {
    it(`[module40] detects tag "${tag}" => ${expected}`, () => {
      const c = classifyScope({ tags: [tag] });
      expect(c.inScope).toBe(false);
      expect(c.frozenArea).toBe(expected);
      expect(c.reason).toBe(FROZEN_SCOPE_REASONS[expected]);
    });
  }

  it("[module40] in-scope owner-mode feature passes", () => {
    const c = classifyScope({ tags: ["dashboard", "intervention-plan", "kpi"] });
    expect(c.inScope).toBe(true);
    expect(c.frozenArea).toBeNull();
    expect(c.reason).toBeNull();
    expect(isOwnerModeAllowed({ tags: ["owner-action"] })).toBe(true);
    expect(isOwnerModeAllowed({})).toBe(true);
  });

  it("[module40] matches tags case-insensitively and ignores surrounding whitespace", () => {
    expect(classifyScope({ tags: ["BILLING"] }).frozenArea).toBe("BILLING");
    expect(classifyScope({ tags: ["  Stripe  "] }).frozenArea).toBe("BILLING");
    expect(classifyScope({ tags: ["OAuth"] }).frozenArea).toBe("EXTERNAL_INTEGRATIONS");
    expect(classifyScope({ tags: ["ProductHunt"] }).frozenArea).toBe("PRODUCT_HUNT_LAUNCH");
  });

  it("[module40] explicit frozen area takes precedence and isOwnerModeAllowed is false", () => {
    expect(isOwnerModeAllowed({ area: "BILLING" })).toBe(false);
    const c = classifyScope({ area: "PUBLIC_SAAS", tags: ["dashboard"] });
    expect(c.frozenArea).toBe("PUBLIC_SAAS");
  });

  it("[module40] guard throws PublicScopeFrozenError on each frozen area", () => {
    for (const area of FROZEN_SCOPE_AREAS) {
      const ref = `feature:${area}`;
      try {
        assertWithinOwnerScope({ area }, ref);
        throw new Error("expected guard to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(PublicScopeFrozenError);
        const e = err as PublicScopeFrozenError;
        expect(e.code).toBe("PUBLIC_SCOPE_FROZEN");
        expect(e.frozenArea).toBe(area);
        expect(e.reason).toBe(FROZEN_SCOPE_REASONS[area]);
        expect(e.ref).toBe(ref);
        expect(e.name).toBe("PublicScopeFrozenError");
      }
    }
  });

  it("[module40] guard throws when out of scope via tag detection", () => {
    expect(() => assertWithinOwnerScope({ tags: ["webhook"] }, "feat:wh")).toThrow(
      PublicScopeFrozenError
    );
  });

  it("[module40] guard passes for in-scope owner-mode feature", () => {
    expect(() =>
      assertWithinOwnerScope({ tags: ["intervention-plan", "owner"] }, "feat:ok")
    ).not.toThrow();
    expect(() => assertWithinOwnerScope({}, "feat:empty")).not.toThrow();
  });
});
