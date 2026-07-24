/**
 * Jarvis 360 gap-closure (G26,G27) — laundry archetype seed builds + validates.
 */
import { describe, it, expect } from "vitest";
import {
  buildLaundryArchetypeSeed,
  validateArchetypeSeed,
  ArchetypeSeedSchema,
} from "@/infra/owner-archetype-seed";

describe("laundry archetype seed — function contract assertions", () => {
  it("buildLaundryArchetypeSeed is a function", () => {
    expect(typeof buildLaundryArchetypeSeed).toBe("function");
  });
  it("validateArchetypeSeed is a function", () => {
    expect(typeof validateArchetypeSeed).toBe("function");
  });
  it("ArchetypeSeedSchema is defined", () => {
    expect(ArchetypeSeedSchema).toBeDefined();
  });
  it("buildLaundryArchetypeSeed() returns a non-null object", () => {
    const s = buildLaundryArchetypeSeed();
    expect(s).toBeTruthy();
    expect(typeof s).toBe("object");
  });
  it("buildLaundryArchetypeSeed().archetype is 'laundry'", () => {
    expect(buildLaundryArchetypeSeed().archetype).toBe("laundry");
  });
  it("buildLaundryArchetypeSeed().business is an object", () => {
    expect(typeof buildLaundryArchetypeSeed().business).toBe("object");
  });
  it("buildLaundryArchetypeSeed().staff is an array with >= 1 entry", () => {
    const s = buildLaundryArchetypeSeed();
    expect(Array.isArray(s.staff)).toBe(true);
    expect(s.staff.length).toBeGreaterThanOrEqual(1);
  });
  it("buildLaundryArchetypeSeed().equipment is an array with >= 1 entry", () => {
    const s = buildLaundryArchetypeSeed();
    expect(Array.isArray(s.equipment)).toBe(true);
    expect(s.equipment.length).toBeGreaterThanOrEqual(1);
  });
  it("buildLaundryArchetypeSeed().sops is an array", () => {
    const s = buildLaundryArchetypeSeed();
    expect(Array.isArray(s.sops)).toBe(true);
  });
  it("buildLaundryArchetypeSeed().opportunities is an array with >= 1 entry", () => {
    const s = buildLaundryArchetypeSeed();
    expect(Array.isArray(s.opportunities)).toBe(true);
    expect(s.opportunities.length).toBeGreaterThanOrEqual(1);
  });
  it("buildLaundryArchetypeSeed().complaints is an array with >= 1 entry", () => {
    const s = buildLaundryArchetypeSeed();
    expect(Array.isArray(s.complaints)).toBe(true);
    expect(s.complaints.length).toBeGreaterThanOrEqual(1);
  });
  it("buildLaundryArchetypeSeed().business.monthlyRevenue is > 0", () => {
    expect(buildLaundryArchetypeSeed().business.monthlyRevenue).toBeGreaterThan(0);
  });
  it("buildLaundryArchetypeSeed().business.currency has 3 chars", () => {
    expect(buildLaundryArchetypeSeed().business.currency).toHaveLength(3);
  });
  it("validateArchetypeSeed throws for an empty object", () => {
    expect(() => validateArchetypeSeed({})).toThrow();
  });
  it("validateArchetypeSeed throws for missing business field", () => {
    expect(() => validateArchetypeSeed({ archetype: "laundry" })).toThrow();
  });
  it("ArchetypeSeedSchema.parse(buildLaundryArchetypeSeed()) does not throw", () => {
    expect(() => ArchetypeSeedSchema.parse(buildLaundryArchetypeSeed())).not.toThrow();
  });
  it("ArchetypeSeedSchema.parse result matches seed structure", () => {
    const parsed = ArchetypeSeedSchema.parse(buildLaundryArchetypeSeed());
    expect(parsed.archetype).toBe("laundry");
  });
});

describe("laundry archetype seed", () => {
  it("builds a fully-validated realistic owner loop seed", () => {
    const seed = buildLaundryArchetypeSeed();
    expect(seed.archetype).toBe("laundry");
    expect(seed.business.monthlyRevenue).toBeGreaterThan(0);
    expect(seed.staff.length).toBeGreaterThanOrEqual(1);
    expect(seed.equipment.length).toBeGreaterThanOrEqual(1);
    expect(seed.sops.some((s) => s.status === "approved")).toBe(true);
    expect(seed.opportunities.length).toBeGreaterThanOrEqual(1);
    // contains an equipment item that is materially stressed (loop needs a capacity signal)
    expect(seed.equipment.some((e) => e.downtimeState !== "none" || e.maintenanceDueInDays < 0)).toBe(true);
    // contains a complaint (training/process derivation signal)
    expect(seed.complaints.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects a malformed seed (source validation)", () => {
    expect(() => validateArchetypeSeed({ archetype: "laundry" })).toThrow();
    expect(() => validateArchetypeSeed({ ...buildLaundryArchetypeSeed(), business: { name: "x" } })).toThrow();
  });

  it("accepts a valid externally-provided seed", () => {
    const ok = ArchetypeSeedSchema.parse(buildLaundryArchetypeSeed());
    expect(ok.business.currency).toHaveLength(3);
  });
});
