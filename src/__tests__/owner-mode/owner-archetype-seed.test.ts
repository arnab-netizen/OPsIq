/**
 * Jarvis 360 gap-closure (G26,G27) — laundry archetype seed builds + validates.
 */
import { describe, it, expect } from "vitest";
import {
  buildLaundryArchetypeSeed,
  validateArchetypeSeed,
  ArchetypeSeedSchema,
} from "@/infra/owner-archetype-seed";

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
