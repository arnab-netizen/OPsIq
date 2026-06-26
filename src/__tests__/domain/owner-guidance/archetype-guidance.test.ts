import { describe, it, expect } from "vitest";
import { archetypeFromBusinessType, archetypeGuidance } from "@/domain/owner-guidance/archetype-guidance";

describe("[module41] archetype mapping", () => {
  it("maps businessType strings to the correct archetype", () => {
    expect(archetypeFromBusinessType("laundry_local_service")).toBe("laundry");
    expect(archetypeFromBusinessType("housekeeping_cleaning")).toBe("housekeeping");
    expect(archetypeFromBusinessType("home_services_maintenance")).toBe("home_services");
    expect(archetypeFromBusinessType("field_repair")).toBe("home_services");
    expect(archetypeFromBusinessType("generic_local_service")).toBe("generic");
    expect(archetypeFromBusinessType(null)).toBe("generic");
    expect(archetypeFromBusinessType(undefined)).toBe("generic");
  });

  it("provides distinct customer/worker nouns + pack per archetype", () => {
    expect(archetypeGuidance("laundry_local_service").customerNoun).toContain("linen");
    expect(archetypeGuidance("laundry_local_service").pack).toBe("laundry");
    expect(archetypeGuidance("housekeeping_cleaning").customerNoun).toContain("apartment");
    expect(archetypeGuidance("home_services_maintenance").customerNoun).toContain("service-call");
    expect(archetypeGuidance("home_services_maintenance").pack).toBe("home_services");
    expect(archetypeGuidance("anything_else").customerNoun).toBe("customers");
    expect(archetypeGuidance("anything_else").pack).toBeNull();
  });
});
